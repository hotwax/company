import { api, commonUtil } from "@common";
import { computed, ref } from "vue";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";
import { shopifyTransferPendingCache } from "@/utils/cacheEntities";
import { PENDING_SEGMENT_ENDPOINTS, type PendingSegment, SYNCED_SEGMENT_ENDPOINTS } from "@/workers/domains/shopifyTransferSyncDomain";
import {
  type ReconciliationSummary,
  type WebhookReconciliationRow,
  reconcileWebhookTopics,
} from "@/utils/shopifyWebhookReconciliation";
import { useCachedList } from "./useCachedList";

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
 * The per-shop transfer sync start date — the one-time setting every sweep gates on.
 *
 * Nothing stages for a shop that has not set one: the first run on a live shop would otherwise push
 * its entire transfer history at once. So this is setup, not a preference, and the preview exists to
 * make the consequence visible before it is committed.
 *
 * No backing service. The setting is a row (`ShopifyShopSetting`, `SHPFY_TO_SYNC_FROM`), the presets
 * are either the browser's own clock or one ordered row, and each count is the `X-Total-Count`
 * header of the segment resource the page already reads. Every piece was already reachable.
 */
const SHOP_SETTING_ENDPOINT = "sob/shopify/shopSetting";
const OWNERS_ENDPOINT = "sob/shopify/transferSync/owners";
const SYNC_FROM_SETTING = "SHPFY_TO_SYNC_FROM";

export interface TransferSyncLaunchCounts { [segment: string]: number }

export function useShopifyTransferSyncLaunch() {
  const currentDate = ref<string | null>(null);
  const oldestOwnedDate = ref<string | null>(null);
  const counts = ref<TransferSyncLaunchCounts>({});
  const loading = ref(false);
  const saving = ref(false);
  const error = ref("");

  /** X-Total-Count is the whole answer, so ask for a single row and read the header. */
  async function countAt(shopId: string, segment: PendingSegment, from: string): Promise<number> {
    const resp: any = await api({
      url: PENDING_SEGMENT_ENDPOINTS[segment],
      method: "GET",
      params: { shopId, orderEntryDate: from, orderEntryDate_op: "greater-equals", pageSize: 1 },
    });
    const total = Number(resp?.headers?.["x-total-count"] ?? NaN);
    if(Number.isFinite(total)) { return total; }
    // No header (some clients drop it): fall back to what came back, which is at most one row.
    const rows = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);

    return rows.length;
  }

  /** The saved setting and the "everything" preset. Both are single rows. */
  async function loadContext(shopId: string) {
    const settingResp: any = await api({
      url: SHOP_SETTING_ENDPOINT,
      method: "GET",
      params: { shopId, settingTypeEnumId: SYNC_FROM_SETTING, pageSize: 1 },
    });
    const settingRows = Array.isArray(settingResp?.data) ? settingResp.data : (Array.isArray(settingResp) ? settingResp : []);
    currentDate.value = settingRows[0]?.settingValue ?? null;

    const ownerResp: any = await api({
      url: OWNERS_ENDPOINT,
      method: "GET",
      params: { shopId, orderByField: "orderEntryDate", pageSize: 1 },
    });
    const ownerRows = Array.isArray(ownerResp?.data) ? ownerResp.data : (Array.isArray(ownerResp) ? ownerResp : []);
    oldestOwnedDate.value = ownerRows[0]?.orderEntryDate ?? null;
  }

  async function load(shopId: string, candidateDate?: string, withContext = false) {
    if(!shopId) { return; }
    loading.value = true;
    error.value = "";
    try {
      if(withContext) { await loadContext(shopId); }
      if(candidateDate) {
        const segments = Object.keys(PENDING_SEGMENT_ENDPOINTS) as PendingSegment[];
        const totals = await Promise.all(segments.map((segment) => countAt(shopId, segment, candidateDate)));
        counts.value = Object.fromEntries(segments.map((segment, index) => [segment, totals[index]]));
      }
    } catch (err: any) {
      error.value = err?.message || "The sync start date could not be read.";
    } finally {
      loading.value = false;
    }
  }

  /** The setting is a row; storing it needs no service. */
  async function save(shopId: string, syncFromDate: string): Promise<boolean> {
    if(!shopId || !syncFromDate) { return false; }
    saving.value = true;
    error.value = "";
    try {
      const resp: any = await api({
        url: SHOP_SETTING_ENDPOINT,
        method: "POST",
        data: {
          shopId,
          settingTypeEnumId: SYNC_FROM_SETTING,
          // ISO-8601 instant: what the connector parses back out of settingValue.
          settingValue: new Date(syncFromDate).toISOString(),
        },
      });
      if(commonUtil.hasError(resp)) { throw new Error("The sync start date could not be saved."); }
      currentDate.value = new Date(syncFromDate).toISOString();

      return true;
    } catch (err: any) {
      error.value = err?.message || "The sync start date could not be saved.";

      return false;
    } finally {
      saving.value = false;
    }
  }

  return { currentDate, oldestOwnedDate, counts, loading, saving, error, load, save };
}

/** Newest-synced-first ordering per segment. `syncedDate` is aliased on every synced view. */
const SYNCED_ORDER_BY = "-syncedDate";
const SYNCED_PAGE_SIZE = 50;

/**
 * Synced history for one segment — read on demand, never cached.
 *
 * Outstanding work is a backlog the worker polls; synced rows are history an operator opens
 * occasionally and pages through. Caching them would grow without bound for data nobody is
 * waiting on, so this goes straight to the resource and keeps only what is on screen.
 */
export function useShopifySyncedSegment() {
  const rows = ref<any[]>([]);
  const total = ref(0);
  const pageIndex = ref(0);
  const loading = ref(false);
  const error = ref("");

  async function load(shopId: string, segment: PendingSegment, append = false) {
    if(!shopId || !segment) {rows.value = []; total.value = 0; return;}
    loading.value = true;
    error.value = "";
    try {
      const nextIndex = append ? pageIndex.value + 1 : 0;
      const resp: any = await api({
        url: SYNCED_SEGMENT_ENDPOINTS[segment],
        method: "GET",
        params: {
          shopId,
          orderByField: SYNCED_ORDER_BY,
          pageIndex: nextIndex,
          pageSize: SYNCED_PAGE_SIZE,
        },
      });
      if(commonUtil.hasError(resp)) {throw new Error("Shopify sync history could not be read.");}
      // Entity resources return a bare array and put the count in a header, so a short page is the
      // only reliable end-of-list signal when the header is not surfaced.
      const page: any[] = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
      const headerTotal = Number(resp?.headers?.["x-total-count"] ?? NaN);
      pageIndex.value = nextIndex;
      rows.value = append ? [...rows.value, ...page] : page;
      total.value = Number.isFinite(headerTotal) ? headerTotal : rows.value.length;
    } catch (err: any) {
      error.value = err?.message || "Shopify sync history could not be read.";
      if(!append) {rows.value = []; total.value = 0;}
    } finally {
      loading.value = false;
    }
  }

  return {
    rows,
    total,
    loading,
    error,
    hasMore: computed(() => rows.value.length < total.value),
    load,
    loadMore: (shopId: string, segment: PendingSegment) => load(shopId, segment, true),
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
