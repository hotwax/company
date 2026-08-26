import { api, commonUtil } from "@common";
import { computed } from "vue";
import { shopifyTransferSyncCache, shopifyTransferWebhookHealthCache } from "@/utils/cacheEntities";
import { useCachedList, useCachedRecord } from "./useCachedList";

/**
 * Shopify transfer sync — order-scoped inventory transfer monitoring.
 *
 * Modeled on `useNetSuiteSync.ts`: reads are cache-backed and reactive (the `shopifyTransferSync`
 * worker domain fills the cache; nothing here issues a request on render), writes go straight to
 * the API and then ask the worker to refetch the affected row, because these endpoints return only
 * a status/PK rather than the updated record.
 *
 * Stage presentation (`stageColor`/`stageLabel`) and the un-cached detail-bundle read
 * (`fetchTransferSyncDetail`) live in `@/utils/shopifyTransferSync` — this file's exports must all
 * be composables.
 */

const LIST_ENDPOINT = "sob/shopify/transferSync";

// =============================================================================================
// Reads — cache-backed, reactive
// =============================================================================================

export interface TransferSyncFilters {
  stage?: string;
  needsAttentionOnly?: boolean;
  /** Millis; inclusive lower bound on `lastActivityDate`. */
  fromMs?: number;
  /** Millis; inclusive upper bound on `lastActivityDate`. */
  toMs?: number;
}

/**
 * Transfer rows for a shop, needs-attention first, then newest activity first — the list page's
 * primary read.
 */
export function useShopifyTransferSyncList(shopId: () => string | undefined, filters: () => TransferSyncFilters = () => ({})) {
  const { records, hydrated } = useCachedList<any>(shopifyTransferSyncCache, { dateField: "lastActivityDate" });

  const rows = computed<any[]>(() => {
    const wanted = String(shopId() ?? "");
    if(!wanted) {return [];}
    const { stage, needsAttentionOnly, fromMs, toMs } = filters();

    return records.value
      .filter((row: any) => String(row?.shopId ?? "") === wanted)
      .filter((row: any) => !stage || row?.syncStage === stage)
      .filter((row: any) => !needsAttentionOnly || row?.needsAttention === true)
      .filter((row: any) => fromMs === undefined || Number(row?.lastActivityDate ?? 0) >= fromMs)
      .filter((row: any) => toMs === undefined || Number(row?.lastActivityDate ?? 0) <= toMs)
      .sort((a: any, b: any) => {
        const attentionDelta = (b?.needsAttention === true ? 1 : 0) - (a?.needsAttention === true ? 1 : 0);
        if(attentionDelta !== 0) {return attentionDelta;}

        return Number(b?.lastActivityDate ?? 0) - Number(a?.lastActivityDate ?? 0);
      });
  });

  return {
    rows,
    hydrated,
    needsAttentionCount: computed(() => rows.value.filter((row: any) => row?.needsAttention === true).length),
  };
}

/** One transfer row by (shopId, orderId) — used by the detail page's header while the deep bundle loads. */
export function useShopifyTransferSyncRow(shopId: () => string | undefined, orderId: () => string | undefined) {
  const { records, hydrated } = useCachedList<any>(shopifyTransferSyncCache);
  const row = computed<any>(() => {
    const wantedShop = String(shopId() ?? "");
    const wantedOrder = String(orderId() ?? "");
    if(!wantedShop || !wantedOrder) {return undefined;}

    return records.value.find((entry: any) =>
      String(entry?.shopId ?? "") === wantedShop && String(entry?.orderId ?? "") === wantedOrder);
  });

  return { row, hydrated };
}

/**
 * Webhook subscription health for a shop.
 *
 * Three states, never collapsed to two: `hydrated === false` is "not checked yet", a present row
 * is a real answer, and an ABSENT row after hydration means the health check itself failed (the
 * domain swallows that failure rather than caching a stale/fabricated result) — the KPI card must
 * render "Not available" for that case, not a false "0 missing / 0 duplicate".
 */
export function useShopifyTransferWebhookHealth(shopId: () => string | undefined) {
  const { records, hydrated } = useCachedList<any>(shopifyTransferWebhookHealthCache);
  const row = computed<any>(() => {
    const wanted = String(shopId() ?? "");

    return wanted ? records.value.find((entry: any) => String(entry?.shopId ?? "") === wanted) : undefined;
  });

  return {
    row,
    hydrated,
    missingCount: computed<number | undefined>(() =>
      row.value ? (row.value.missingTopics?.length ?? 0) : undefined),
    duplicateCount: computed<number | undefined>(() =>
      row.value ? (row.value.duplicateTopics?.length ?? 0) : undefined),
    checkedAt: computed<number | undefined>(() => row.value?.checkedAt),
  };
}

export const useShopifyTransferSyncRecord = (orderId: string | undefined) =>
  useCachedRecord(shopifyTransferSyncCache, "orderId", orderId);

// =============================================================================================
// Writes — the four §5.5.1 resolution actions, each 1:1 to a backend service
// =============================================================================================

function unwrap<T = any>(resp: any): T {
  if(commonUtil.hasError(resp)) {throw resp?.data ?? resp;}

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
  /** POST `sob/shopify/transferSync/{orderId}/updateLogRetry` — retry a blocked update log. */
  async function retryUpdateLog(orderId: string, logId: string) {
    const resp = await api({
      url: `${LIST_ENDPOINT}/${encodeURIComponent(orderId)}/updateLogRetry`,
      method: "POST",
      data: { logId },
    });

    return unwrap(resp);
  }

  /**
   * POST `sob/shopify/transferSync/{orderId}/updateLogResolve` — supersede a blocked log; a reason
   * is required.
   */
  async function resolveUpdateLog(orderId: string, logId: string, reason: string) {
    const resp = await api({
      url: `${LIST_ENDPOINT}/${encodeURIComponent(orderId)}/updateLogResolve`,
      method: "POST",
      data: { logId, reason },
    });

    return unwrap(resp);
  }

  /**
   * POST `sob/shopify/transferSync/{orderId}/activityCandidateSuppress` — suppress an eligible
   * candidate.
   */
  async function suppressActivityCandidate(params: {
    shopId: string;
    orderId: string;
    eventReferenceId: string;
    workEffortPurposeTypeId: SuppressionPurpose;
    reason: string;
  }) {
    const { shopId, orderId, workEffortPurposeTypeId, eventReferenceId, reason } = params;
    const resp = await api({
      url: `${LIST_ENDPOINT}/${encodeURIComponent(orderId)}/activityCandidateSuppress`,
      method: "POST",
      data: { shopId, orderId, workEffortPurposeTypeId, eventReferenceId, reason },
    });

    return unwrap(resp);
  }

  /**
   * POST `sob/shopify/transferSync/{orderId}/suppressionCancel` — a normal WorkEffort status
   * update to `TASK_CANCELLED`, applied server-side.
   */
  async function cancelSuppressionTask(shopId: string, orderId: string, workEffortId: string) {
    const resp = await api({
      url: `${LIST_ENDPOINT}/${encodeURIComponent(orderId)}/suppressionCancel`,
      method: "POST",
      data: { shopId, orderId, workEffortId },
    });

    return unwrap(resp);
  }

  return { retryUpdateLog, resolveUpdateLog, suppressActivityCandidate, cancelSuppressionTask };
}
