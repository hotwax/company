import { api, commonUtil } from "@common";
import { computed, ref } from "vue";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";
import { shopifyTransferPendingCache } from "@/utils/cacheEntities";
import type { PendingSegment } from "@/workers/domains/shopifyTransferSyncDomain";
import {
  type ReconciliationSummary,
  type WebhookReconciliationRow,
  reconcileWebhookTopics,
} from "@/utils/shopifyWebhookReconciliation";
import { useCachedList } from "./useCachedList";

/**
 * The order-scoped resources under this prefix: the detail bundle (`/{orderId}`) and the four
 * operator actions below.
 *
 * ⚠️ The four action paths — updateLogRetry, updateLogResolve, activityCandidateSuppress,
 * suppressionCancel — no longer exist on the connector. Their services and REST resources were
 * removed when the staging gate was dropped: an unsent transfer is simply restaged on the next
 * sweep, so there was nothing left to retry or unstick, and suppression became a generic
 * create#OrderTask. These calls are left in place, and failing, rather than silently removed with
 * the detail-page UI that drives them; that removal is its own change.
 */
const TRANSFER_SYNC_ENDPOINT = "sob/shopify/transferSync";

/**
 * Shopify transfer sync — order-scoped inventory transfer monitoring.
 *
 * Modeled on `useNetSuiteSync.ts`: reads are cache-backed and reactive (the `shopifyTransferSync`
 * worker domain fills the cache; nothing here issues a request on render), writes go straight to
 * the API and then ask the worker to refetch the affected row, because these endpoints return only
 * a status/PK rather than the updated record.
 *
 * Stage presentation (`stageColor`/`stageLabel`) remains a pure concern in
 * `@/utils/shopifyTransferSync`; the un-cached detail-bundle read lives here with the rest of the
 * feature's application logic.
 */

// =============================================================================================
// Reads — cache-backed, reactive
// =============================================================================================

/**
 * Outstanding work for a shop, one segment at a time — the list page's primary read.
 *
 * There is no filtering, ranking or status derivation here, and deliberately so. A row exists
 * because the server view found no provenance for that artifact; that IS the outstanding state.
 * The previous version of this composable filtered and sorted a whole shop's transfers in the
 * browser by a server-derived stage badge, which is what forced the server to compute that badge
 * for every transfer on every page view.
 *
 * Oldest first: the longest-outstanding work is what an operator needs to see. Rows with no
 * artifact timestamp (the create segment) fall back to order id, which is stable and monotonic.
 */
export function useShopifyPendingSegment(shopId: () => string | undefined, segment: () => PendingSegment) {
  const { records, hydrated } = useCachedList<any>(shopifyTransferPendingCache, { dateField: "occurredAt" });

  const rows = computed<any[]>(() => {
    const wantedShop = String(shopId() ?? "");
    const wantedSegment = String(segment() ?? "");
    if(!wantedShop || !wantedSegment) {return [];}

    return records.value
      .filter((row: any) => String(row?.shopId ?? "") === wantedShop
        && String(row?.segment ?? "") === wantedSegment)
      .sort((a: any, b: any) => {
        const delta = Number(a?.occurredAt ?? 0) - Number(b?.occurredAt ?? 0);
        if(delta !== 0) {return delta;}

        return String(a?.orderId ?? "").localeCompare(String(b?.orderId ?? ""));
      });
  });

  return { rows, hydrated, count: computed(() => rows.value.length) };
}

/**
 * Outstanding count per segment, for the tab badges. One pass over the shop's cached rows rather
 * than one query per tab, because they all live in the same table.
 */
export function useShopifyPendingCounts(shopId: () => string | undefined) {
  const { records, hydrated } = useCachedList<any>(shopifyTransferPendingCache, { dateField: "occurredAt" });

  const counts = computed<Record<string, number>>(() => {
    const wanted = String(shopId() ?? "");
    const totals: Record<string, number> = {};
    if(!wanted) {return totals;}
    for(const row of records.value as any[]) {
      if(String(row?.shopId ?? "") !== wanted) {continue;}
      const segment = String(row?.segment ?? "");
      if(segment) {totals[segment] = (totals[segment] ?? 0) + 1;}
    }

    return totals;
  });

  return {
    counts,
    hydrated,
    total: computed(() => Object.values(counts.value).reduce((sum, n) => sum + n, 0)),
  };
}



/**
 * Webhook reconciliation for one shop: what Shopify has subscribed, which OMS SystemMessageType
 * consumes each topic, and how many messages of that type are still in received status.
 *
 * Built entirely from services that already exist — nothing here needed a connector change:
 *   - `sob/shopify/shops/{shopId}`        the shop, whose `default` master carries `shopRemotes`
 *   - `shopify/webhook-subscription`      live subscriptions for that remote
 *   - `sob/shopify/mappingTypes`          ShopifyMessageTypeEnum, the topic -> message type map
 *   - `admin/systemMessages`              received-status backlog, one paged call with a real count
 *
 * Subscription health is derived here rather than read from a dedicated endpoint: the OMS's own
 * consumable vocabulary IS the required set, so "how many should there be" and "how many are there"
 * are both already in hand.
 *
 * The shop read comes first because everything else is scoped by the remote it yields; the other
 * three are independent and run together. The join itself is pure and lives in
 * `@/utils/shopifyWebhookReconciliation`.
 */
const RECEIVED_STATUS_ID = "SmsgReceived";
const SHOPIFY_WEBHOOK_PARENT_TYPE = "ShopifyWebhook";
const RECEIVED_PAGE_SIZE = 200;
const DEFAULT_SHOP_REMOTE_PURPOSE = "SsctShopifyDefaultApp";

/**
 * The shop's Shopify remote, off the entity master rather than the shop cache — the cache
 * projection is flat scalars, so `shopRemotes` only exists on a direct read.
 */
async function fetchShopRemoteId(shopId: string): Promise<string> {
  const resp: any = await api({
    url: `sob/shopify/shops/${encodeURIComponent(shopId)}`,
    method: "get",
  });
  if(commonUtil.hasError(resp)) {
    throw new Error(`Could not read shop ${shopId} to resolve its Shopify remote.`);
  }

  const shop = resp?.data ?? resp;
  const remotes: any[] = shop?.shopRemotes ?? [];
  const preferred = remotes.find((remote: any) => remote?.purposeTypeId === DEFAULT_SHOP_REMOTE_PURPOSE);
  const remoteId = String((preferred ?? remotes[0])?.systemMessageRemoteId ?? "");
  if(!remoteId) {
    throw new Error(`Shop ${shopId} has no Shopify remote configured, so its webhooks cannot be read.`);
  }

  return remoteId;
}

async function loadReconciliation(options: {
  shopId: string;
  topicPrefixes?: string[];
}) {
  const { shopId, topicPrefixes = [] } = options;
  const systemMessageRemoteId = await fetchShopRemoteId(shopId);

  const [subscriptionResp, enumResp, receivedResp] = await Promise.all([
    api({
      url: "shopify/webhook-subscription",
      method: "get",
      // 250 is Shopify's page maximum, so one call covers every subscription on the shop.
      params: { systemMessageRemoteId, queryParams: { first: 250 } },
    }) as Promise<any>,
    api({
      url: "sob/shopify/mappingTypes",
      method: "get",
      params: { enumTypeId: "ShopifyMessageTypeEnum", pageSize: 200 },
    }) as Promise<any>,
    api({
      url: "admin/systemMessages",
      method: "get",
      params: {
        parentTypeId: SHOPIFY_WEBHOOK_PARENT_TYPE,
        statusId: RECEIVED_STATUS_ID,
        systemMessageRemoteId,
        pageSize: RECEIVED_PAGE_SIZE,
      },
    }) as Promise<any>,
  ]);

  if(commonUtil.hasError(subscriptionResp)) {
    throw new Error("Shopify did not return the webhook subscriptions.");
  }

  const enumData = enumResp?.data;

  return reconcileWebhookTopics({
    subscriptions: subscriptionResp?.data?.webhookList ?? subscriptionResp?.webhookList ?? [],
    enumRows: Array.isArray(enumData) ? enumData : (enumData?.enumerations ?? []),
    receivedRows: receivedResp?.data?.systemMessages ?? [],
    receivedTotal: receivedResp?.data?.systemMessagesCount,
    topicPrefixes,
    // The OMS this page is talking to; callback URLs are checked against it.
    omsBaseUrl: commonUtil.getMaargURL(),
  });
}

/**
 * Every job the transfer sync operation depends on, in pipeline order.
 *
 * Two kinds, and the difference matters:
 *   - `shop` scope   a per-shop clone of a seeded template, named `{template}_{shopId}` and carrying
 *                    the shopId parameter, exactly as `clonesOf` and every other Shopify sync job
 *                    do it. Creatable from this page.
 *   - `global` scope one instance for the whole OMS. Shown so a paused one is visible here rather
 *                    than silently stalling the flow, but not creatable per shop — it either
 *                    exists from the data load or it does not.
 *
 * Neither stager calls Shopify. They write MDM files; the framework's ScheduledDataManagerRunner
 * picks up the pending log and runs the config's import service. That is why "job active" and
 * "reaching Shopify" are different questions.
 */
export interface TransferSyncJobDefinition {
  key: string;
  template: string;
  label: string;
  purpose: string;
  scope: "shop" | "global";
  serviceName?: string;
  cronExpression?: string;
  parameters?: Array<{ parameterName: string; parameterValue: string }>;
}

export const TRANSFER_SYNC_JOBS: TransferSyncJobDefinition[] = [
  {
    key: "create",
    template: "stage_PendingShopifyTransferOrders",
    label: "Create stager",
    purpose: "Stages one Shopify transfer-create file per approved, unsent transfer order.",
    scope: "shop",
    serviceName: "co.hotwax.shopify.transfer.ShopifyInventoryTransferServices.stage#PendingShopifyTransferOrders",
    cronExpression: "0 */15 * * * ?",
    parameters: [{ parameterName: "configId", parameterValue: "POST_SHOPIFY_TRANSFER_ORDER" }],
  },
  {
    key: "update",
    template: "update_ShopifyInventoryTransfer",
    label: "Update stager",
    purpose: "Stages shipped, receipt and cancelled-quantity activity for transfers already in Shopify.",
    scope: "shop",
    serviceName: "co.hotwax.shopify.transfer.ShopifyInventoryTransferUpdateServices.stage#ShopifyInventoryTransferUpdates",
    cronExpression: "0 */15 * * * ?",
    parameters: [
      { parameterName: "configId", parameterValue: "UPDATE_SHOPIFY_INVENTORY_TRANSFER" },
      { parameterName: "overlapMinutes", parameterValue: "60" },
    ],
  },
  {
    key: "consume",
    template: "consume_AllReceivedSystemMessages_frequent",
    label: "Webhook consumer",
    purpose: "Consumes received webhook messages. Paused here is what leaves topics with a Received backlog.",
    scope: "global",
  },
];

function shopJobName(template: string, shopId: string) {
  return `${template}_${shopId}`;
}

async function serviceJobExists(jobName: string): Promise<boolean> {
  try {
    const resp: any = await api({ url: `admin/serviceJobs/${encodeURIComponent(jobName)}`, method: "get" });
    if(commonUtil.hasError(resp)) { return false; }

    return !!(resp?.data?.jobDetail?.jobName ?? resp?.data?.jobName);
  } catch {
    return false;
  }
}

/**
 * Create the shop's clone of a seeded template.
 *
 * Created PAUSED on purpose, matching `ensureInventoryAdjustmentSenderJob` and the release runbook:
 * creating the schedule and starting to push to Shopify are two decisions, not one.
 */
async function ensureShopJob(definition: TransferSyncJobDefinition, shopId: string): Promise<string> {
  const jobName = shopJobName(definition.template, shopId);
  if(await serviceJobExists(jobName)) { return jobName; }

  await api({
    url: "admin/serviceJobs",
    method: "POST",
    data: {
      jobName,
      serviceName: definition.serviceName,
      description: `${definition.label} for shop ${shopId}`,
      cronExpression: definition.cronExpression,
      paused: "Y",
    },
  });
  await api({
    url: `admin/serviceJobs/${jobName}`,
    method: "PUT",
    data: {
      jobName,
      paused: "Y",
      serviceJobParameters: [
        { parameterName: "shopId", parameterValue: shopId },
        ...(definition.parameters ?? []),
      ],
    },
  });
  await refreshAfterMutation("serviceJob", { jobName });

  return jobName;
}

export interface TransferSyncJobCard {
  definition: TransferSyncJobDefinition;
  job: any;
  jobName: string;
  status: "active" | "paused" | "missing";
  nextRun?: any;
}

/**
 * One card's worth of state per job, resolved against the cached job definitions.
 *
 * A shop-scoped job is matched on its shopId PARAMETER rather than its name, the way the rest of
 * the app matches Shopify sync jobs — a name-based guess picks the wrong clone silently.
 */
export function useShopifyTransferSyncJobs(shopId: () => string | undefined, cachedJobs: () => any[]) {
  const cards = computed<TransferSyncJobCard[]>(() => {
    const currentShopId = String(shopId() ?? "");
    const jobs = cachedJobs() ?? [];

    return TRANSFER_SYNC_JOBS.map((definition) => {
      const job = definition.scope === "shop"
        ? jobs.find((candidate: any) =>
          String(candidate?.jobName ?? "").startsWith(definition.template) &&
          (candidate?.serviceJobParameters ?? []).some((parameter: any) =>
            parameter.parameterName === "shopId" && String(parameter.parameterValue) === currentShopId))
        : jobs.find((candidate: any) => String(candidate?.jobName ?? "") === definition.template);

      let status: TransferSyncJobCard["status"] = "missing";
      if(job) { status = job.paused === "Y" ? "paused" : "active"; }

      return {
        definition,
        job,
        jobName: job?.jobName ??
          (definition.scope === "shop" && currentShopId ? shopJobName(definition.template, currentShopId) : definition.template),
        status,
        nextRun: job?.nextExecutionDateTime,
      };
    });
  });

  async function ensure(key: string) {
    const definition = TRANSFER_SYNC_JOBS.find((entry) => entry.key === key);
    const currentShopId = shopId();
    if(!definition || definition.scope !== "shop" || !currentShopId) {
      throw new Error("This job is not created per shop.");
    }

    return await ensureShopJob(definition, currentShopId);
  }

  return { cards, ensure };
}


/** Reconciliation state for one shop, refreshed on demand by the view. */
export function useShopifyWebhookReconciliation(
  shopId: () => string | undefined,
  topicPrefixes: string[] = [],
) {
  const rows = ref<WebhookReconciliationRow[]>([]);
  const summary = ref<ReconciliationSummary | null>(null);
  const otherSubscriptionCount = ref(0);
  const receivedTruncated = ref(false);
  const loading = ref(false);
  const error = ref("");

  async function refresh() {
    const currentShopId = shopId();
    if(!currentShopId) { return; }

    loading.value = true;
    error.value = "";
    try {
      const result = await loadReconciliation({
        shopId: currentShopId,
        topicPrefixes,
      });
      rows.value = result.rows;
      summary.value = result.summary;
      otherSubscriptionCount.value = result.otherSubscriptionCount;
      receivedTruncated.value = result.receivedTruncated;
    } catch (err: any) {
      error.value = err?.message || "Shopify did not return the webhook subscriptions.";
    } finally {
      loading.value = false;
    }
  }

  return { rows, summary, otherSubscriptionCount, receivedTruncated, loading, error, refresh };
}

/**
 * `GET sob/shopify/transferSync/{orderId}` (shopId as a query param) — the owner header, lines,
 * activities+details, DataManagerLog rows, webhook SystemMessage rows, and suppression WorkEffort
 * tasks for one order.
 */
export function useShopifyTransferSyncDetail() {
  async function fetchTransferSyncDetail(shopId: string, orderId: string): Promise<any> {
    const resp = await api({
      url: `${TRANSFER_SYNC_ENDPOINT}/${encodeURIComponent(orderId)}`,
      method: "GET",
      params: { shopId },
    }) as any;
    if(commonUtil.hasError(resp)) {
      throw new Error("The OMS could not load this transfer's detail.");
    }

    return resp?.data ?? {};
  }

  return { fetchTransferSyncDetail };
}

// =============================================================================================
// Writes — the four §5.5.1 resolution actions, each 1:1 to a backend service
// =============================================================================================

function unwrap<T = any>(resp: any): T {
  if(commonUtil.hasError(resp)) {throw resp?.data ?? resp;}
  if(resp?.data?.available === false) {
    throw new Error(resp.data.message || "This action is not available.");
  }

  return resp?.data as T;
}

/** `workEffortPurposeTypeId` accepted by `suppress#ShopifyInventoryTransferActivityCandidate`. */
export const SUPPRESSION_PURPOSES = [
  "SUPRS_TO_SHIPPED",
  "SUPRS_TO_RECEIPT",
  "SUPRS_TO_CANCEL",
  "SUPRS_TO_ITEM_CHG",
] as const;
export type SuppressionPurpose = typeof SUPPRESSION_PURPOSES[number];

export function useShopifyTransferSyncMutations() {
  /** POST `sob/shopify/transferSync/updateLogRetry` — retry a blocked update log. */
  async function retryUpdateLog(_orderId: string, logId: string) {
    const resp = await api({
      url: `${TRANSFER_SYNC_ENDPOINT}/updateLogRetry`,
      method: "POST",
      data: { logId },
    });

    return unwrap(resp);
  }

  /**
   * POST `sob/shopify/transferSync/updateLogResolve` — supersede a blocked log; a reason
   * is required.
   */
  async function resolveUpdateLog(_orderId: string, logId: string, reason: string) {
    const resp = await api({
      url: `${TRANSFER_SYNC_ENDPOINT}/updateLogResolve`,
      method: "POST",
      data: { logId, reason },
    });

    return unwrap(resp);
  }

  /**
   * POST `sob/shopify/transferSync/activityCandidateSuppress` — suppress an eligible
   * candidate.
   */
  async function suppressActivityCandidate(params: {
    shopId: string;
    orderId: string;
    sourceReferenceId: string;
    workEffortPurposeTypeId: SuppressionPurpose;
    reason: string;
  }) {
    const { shopId, orderId, workEffortPurposeTypeId, sourceReferenceId, reason } = params;
    const resp = await api({
      url: `${TRANSFER_SYNC_ENDPOINT}/activityCandidateSuppress`,
      method: "POST",
      data: { shopId, orderId, workEffortPurposeTypeId, sourceReferenceId, reason },
    });

    return unwrap(resp);
  }

  /**
   * POST `sob/shopify/transferSync/suppressionCancel` — a normal WorkEffort status
   * update to `TASK_CANCELLED`, applied server-side.
   */
  async function cancelSuppressionTask(shopId: string, orderId: string, workEffortId: string) {
    const resp = await api({
      url: `${TRANSFER_SYNC_ENDPOINT}/suppressionCancel`,
      method: "POST",
      data: { shopId, orderId, workEffortId },
    });

    return unwrap(resp);
  }

  return { retryUpdateLog, resolveUpdateLog, suppressActivityCandidate, cancelSuppressionTask };
}
