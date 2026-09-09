import {
  shopifyLocationInventoryAdjustmentDetailCache,
  shopifyLocationInventorySummaryCache,
} from "@/utils/cacheEntities";
import { normalizeLocationInventorySummary } from "@/utils/shopifyLocationInventory";
import { registerSyncDomain } from "../syncRegistry";
import { pageAll, workerGet } from "./workerFetch";

/** A complete shop-scoped snapshot: statuses and totals must not depend on payload enrichment.
 * Prune only after every page and the summary succeed. Page guards fail closed.
 */
const DETAIL_ENDPOINT = "sob/shopify/locationInventoryAdjustmentDetails";
/** get#ShopifyLocationInventoryAdjustmentDetails wraps its rows in a `details` list, not a bare array. */
const DETAIL_COLLECTION = "details";

/** Mirrors `shopifyLocationInventoryAdjustmentDetailProjection.buildKey` in cacheEntities.ts. */
function detailKey(raw: Record<string, unknown>): string | undefined {
  const identity = [raw?.eventTypeId, raw?.eventReferenceId, raw?.shopId, raw?.shopifyLocationId];
  if(identity.some((value) => value === undefined || value === null || value === "")) {return undefined;}

  return JSON.stringify(identity.map(String));
}

interface LocationDetailSyncArgs {
  shopId?: string;
  batchSize?: number;
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

    const rows = await pageAll({
      ctx, url: DETAIL_ENDPOINT, collectionKey: DETAIL_COLLECTION,
      strictCollection: true, requireComplete: true,
      params: { shopId, mode: "RECENT" }, batchSize: args.batchSize ?? 250,
      keyOf: detailKey,
    });
    // Read the summary before committing: a failed pass must retain the prior snapshot.
    const response = await workerGet(ctx, DETAIL_ENDPOINT, { shopId, pageSize: 1 });
    const summary = normalizeLocationInventorySummary(shopId, response?.summary);
    if(!summary) {throw new Error("Location inventory summary unavailable");}
    const result = await shopifyLocationInventoryAdjustmentDetailCache.snapshotReplace(rows, { field: "shopId", value: shopId },);
    let written = result.written;
    written += await shopifyLocationInventorySummaryCache.upsertMany([summary]);

    return written;
  },
  async refetchOne(ctx, pk) {
    const eventTypeId = String(pk?.eventTypeId ?? "");
    const eventReferenceId = String(pk?.eventReferenceId ?? "");
    const shopId = String(pk?.shopId ?? "");
    const shopifyLocationId = String(pk?.shopifyLocationId ?? "");
    if(!eventTypeId || !eventReferenceId || !shopId || !shopifyLocationId) {return 0;}
    // get#ShopifyLocationInventoryAdjustmentDetails has no eventReferenceId filter, so this pulls
    // the RECENT-mode page for (shopId, shopifyLocationId, eventTypeId) rather than the exact row;
    // the merge below still refreshes the target row along with its siblings.
    const rows = await pageAll({
      ctx,
      url: DETAIL_ENDPOINT,
      collectionKey: DETAIL_COLLECTION,
      params: { shopId, shopifyLocationId, eventTypeId, mode: "RECENT" },
      keyOf: detailKey,
      batchSize: 50,
      label: "locationInventoryAdjustmentDetails:refetchOne",
    });

    return rows.length ? shopifyLocationInventoryAdjustmentDetailCache.upsertMany(rows) : 0;
  },
});
