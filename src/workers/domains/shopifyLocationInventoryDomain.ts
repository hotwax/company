import {
  shopifyLocationInventoryAdjustmentDetailCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import { type SyncContext, registerSyncDomain } from "../syncRegistry";
import { pageAll, pageNewestFirst, workerGet } from "./workerFetch";

/**
 * ShopifyLocationInventoryAdjustmentDetail — the per-Shopify-location real-time inventory push
 * ledger. Distinct from `shopifyInventoryAdjustmentDetail` (the AGGREGATE channel ledger): this one
 * carries `shopId` + `shopifyLocationId` directly on the row (no channel indirection), because
 * real-time location push targets one Shopify location per mapped facility rather than a
 * facility-group aggregate.
 *
 * Modeled directly on `shopifyInventoryMonitoringDomain.ts`'s `shopifyInventoryAdjustmentDetail`
 * domain: three-way paging merged by dedup key, then one `upsertMany`.
 */
const DETAIL_ENDPOINT = "sob/shopify/locationInventoryAdjustmentDetails";
/** Moqui entity-list responses are a bare array; unwrapCollection handles both shapes. */
const DETAIL_COLLECTION = null;

/** Mirrors `shopifyLocationInventoryAdjustmentDetailProjection.buildKey` in cacheEntities.ts. */
function detailKey(raw: Record<string, unknown>): string | undefined {
  const identity = [raw?.eventTypeId, raw?.eventReferenceId, raw?.shopId, raw?.shopifyLocationId];
  if(identity.some((value) => value === undefined || value === null || value === "")) {return undefined;}

  return JSON.stringify(identity.map(String));
}

interface LocationDetailSyncArgs {
  shopId?: string;
  /** Recent event rows retained for history. Unassigned and unresolved rows are always included. */
  total?: number;
  batchSize?: number;
  /** Exact System Messages enriched per tick for payload/status visibility. */
  enrichMax?: number;
}

function fetchRecentDetails(
  ctx: SyncContext,
  shopId: string,
  wanted: number,
  batchSize: number,
): Promise<any[]> {
  return pageNewestFirst({
    ctx,
    url: DETAIL_ENDPOINT,
    collectionKey: DETAIL_COLLECTION,
    params: { shopId, orderByField: "-createdDate" },
    total: wanted,
    batchSize,
  });
}

async function enrichBatchMessages(ctx: SyncContext, shopId: string, max: number): Promise<number> {
  const [details, messages] = await Promise.all([
    shopifyLocationInventoryAdjustmentDetailCache.all(),
    systemMessageCache.all(),
  ]);
  const messageById = new Map(messages.map((message: any) => [String(message.systemMessageId), message]));
  const candidates = [...new Set(details
    .filter((detail: any) => String(detail.shopId) === shopId)
    .map((detail: any) => String(detail.systemMessageId ?? ""))
    .filter(Boolean))]
    .filter((id) => messageById.get(id)?.statusId !== "SmsgSent")
    .slice(0, max);

  let written = 0;
  for(const systemMessageId of candidates) {
    try {
      const response = await workerGet(ctx, "admin/systemMessages", {
        systemMessageId,
        systemMessageId_op: "equals",
        pageSize: 1,
      });
      const message = response?.systemMessages?.[0];
      if(message) {written += await systemMessageCache.upsertMany([message]);}
    } catch {
      // One message must not sink the ledger pass; a later tick retries it.
    }
  }

  return written;
}

registerSyncDomain({
  name: "shopifyLocationInventoryAdjustmentDetail",
  intervalMs: 60_000,
  async sync(ctx, args: LocationDetailSyncArgs = {}) {
    const shopId = String(args.shopId ?? "").trim();
    // No shop means nothing to read, NOT "read everything" — an unscoped query would pull every
    // shop's ledger into this shop's cache, the same class of bug the aggregate ledger guards
    // against with its channel check.
    if(!shopId) {return 0;}

    const batchSize = args.batchSize ?? 50;
    const target = args.total ?? 300;
    const cached = await shopifyLocationInventoryAdjustmentDetailCache.count({ field: "shopId", value: shopId });
    const wanted = cached < target ? target : batchSize;

    const [recent, unassigned, unresolved] = await Promise.all([
      fetchRecentDetails(ctx, shopId, wanted, batchSize),
      // Unassigned = no linked SystemMessage yet. Includes zero-change (no-op) rows too — the UI
      // tells those apart from "unassigned publishable" by `computedInventoryChange`, not by a
      // separate fetch, so the cache holds the whole unassigned set either way.
      pageAll({
        ctx,
        url: DETAIL_ENDPOINT,
        collectionKey: DETAIL_COLLECTION,
        params: { shopId, systemMessageId_op: "empty", orderByField: "createdDate" },
        keyOf: detailKey,
        label: "locationInventoryAdjustmentDetails:unassigned",
      }),
      pageAll({
        ctx,
        url: DETAIL_ENDPOINT,
        collectionKey: DETAIL_COLLECTION,
        params: {
          shopId,
          systemMessageStatusId: "SmsgProduced,SmsgSending,SmsgError",
          systemMessageStatusId_op: "in",
          orderByField: "-systemMessageInitDate",
        },
        keyOf: detailKey,
        label: "locationInventoryAdjustmentDetails:unresolved",
      }),
    ]);

    const merged = new Map<string, any>();
    for(const row of [...recent, ...unassigned, ...unresolved]) {
      const key = detailKey(row);
      if(key) {merged.set(key, row);}
    }
    let written = merged.size
      ? await shopifyLocationInventoryAdjustmentDetailCache.upsertMany([...merged.values()])
      : 0;
    written += await enrichBatchMessages(ctx, shopId, args.enrichMax ?? 40);

    return written;
  },
  async refetchOne(ctx, pk) {
    const eventTypeId = String(pk?.eventTypeId ?? "");
    const eventReferenceId = String(pk?.eventReferenceId ?? "");
    const shopId = String(pk?.shopId ?? "");
    const shopifyLocationId = String(pk?.shopifyLocationId ?? "");
    if(!eventTypeId || !eventReferenceId || !shopId || !shopifyLocationId) {return 0;}
    const rows = await pageAll({
      ctx,
      url: DETAIL_ENDPOINT,
      collectionKey: DETAIL_COLLECTION,
      params: { eventTypeId, eventReferenceId, shopId, shopifyLocationId },
      keyOf: detailKey,
      batchSize: 50,
      label: "locationInventoryAdjustmentDetails:refetchOne",
    });

    return rows.length ? shopifyLocationInventoryAdjustmentDetailCache.upsertMany(rows) : 0;
  },
});
