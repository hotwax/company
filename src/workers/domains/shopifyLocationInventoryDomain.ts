import { companyDb } from "@/db/companyDb";
import { locationInventoryAdjustmentKey, normalizeLocationInventorySummary } from "@/utils/shopifyLocationInventory";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { pageAll, workerGet } from "@common/core/workerRemoteApi";

const shopifyLocationInventoryAdjustmentDetailEntity = companyDb.entity("shopifyLocationInventoryAdjustmentDetails" as any);
const shopifyLocationInventorySummaryEntity = companyDb.entity("shopifyLocationInventorySummaries" as any);

/** A complete shop-scoped snapshot: statuses and totals must not depend on payload enrichment.
 * Prune only after every page and the summary succeed. Page guards fail closed.
 */
const DETAIL_ENDPOINT = "sob/shopify/locationInventoryAdjustmentDetails";
/** get#ShopifyLocationInventoryAdjustmentDetails wraps its rows in a `details` list, not a bare array. */
const DETAIL_COLLECTION = "details";

interface LocationDetailSyncArgs {
  shopId?: string;
  batchSize?: number;
}

export const shopifyLocationInventoryAdjustmentDetailDomain = defineSyncDomain({
  name: "shopifyLocationInventoryAdjustmentDetail",
  table: "shopifyLocationInventoryAdjustmentDetails",
  label: "Shopify location inventory adjustment details",
  syncClass: "A",
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
      keyOf: locationInventoryAdjustmentKey,
    });
    // Read the summary before committing: a failed pass must retain the prior snapshot.
    const response = await workerGet(ctx, DETAIL_ENDPOINT, { shopId, pageSize: 1 });
    const summary = normalizeLocationInventorySummary(shopId, response?.summary);
    if(!summary) {throw new Error("Location inventory summary unavailable");}
    const result = await shopifyLocationInventoryAdjustmentDetailEntity.snapshotReplace(rows, { field: "shopId", value: shopId },);
    let written = result.written;
    written += await shopifyLocationInventorySummaryEntity.upsertMany([summary]);

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
      keyOf: locationInventoryAdjustmentKey,
      batchSize: 50,
      label: "locationInventoryAdjustmentDetails:refetchOne",
    });

    return rows.length ? shopifyLocationInventoryAdjustmentDetailEntity.upsertMany(rows) : 0;
  },
});
