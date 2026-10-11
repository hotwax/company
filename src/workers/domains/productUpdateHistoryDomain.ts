import { productUpdateHistoryCache } from "@/utils/cacheEntities";
import { registerSyncDomain, type SyncContext } from "../syncRegistry";
import { pageNewestFirst } from "./workerFetch";

/**
 * ProductUpdateHistory — class A (live), PER SHOP, bounded window.
 *
 * ⚠️ NOT a snapshot. One shop returned `x-total-count: 1882` and every row carries multi-KB JSON
 * (`differenceMap`, `features`, `tags`, `identifications`, `assocs`), so caching the full set would
 * cost megabytes to serve a screen that shows ten rows. Only the newest `total` per shop is kept —
 * `snapshotReplace` is deliberately NOT used, because pruning to the window would fight the cursor.
 *
 * Replaces a main-thread composable that re-fetched this list on every dashboard tick. The worker
 * owns the cadence now and the view reads the cache reactively, so a new product change appears
 * without the page asking for it.
 */
const ENDPOINT = "oms/products/productUpdateHistories";

export interface ProductUpdateHistoryArgs {
  /** Shops to poll. Nothing is fetched when empty — same "no scope, no poll" rule as messages. */
  shopIds?: string[];
  /** Rows to keep per shop. The screen shows ten; a little headroom covers rapid changes. */
  total?: number;
  batchSize?: number;
}

async function syncShop(ctx: SyncContext, shopId: string, args: ProductUpdateHistoryArgs): Promise<number> {
  const cursor = await productUpdateHistoryCache.newestCursor("lastUpdatedStamp", {
    field: "shopId",
    value: shopId,
  });

  const rows = await pageNewestFirst({
    ctx,
    url: ENDPOINT,
    collectionKey: null, // bare array (verified live 2026-07-27)
    total: args.total ?? 25,
    batchSize: args.batchSize ?? 25,
    params: { shopId, orderByField: "-lastUpdatedStamp" },
    // A product's row is REPLACED in place on each change (PK is productId+shopId), so a row whose
    // stamp equals the cursor is the same row, not a new one — strictly-greater is correct.
    keep: cursor === undefined
      ? undefined
      : (page) => page.filter((row: any) => Number(row?.lastUpdatedStamp ?? 0) > cursor),
  });

  return productUpdateHistoryCache.upsertMany(rows);
}

registerSyncDomain({
  name: "productUpdateHistory",
  intervalMs: 15_000,
  async sync(ctx, args: ProductUpdateHistoryArgs = {}) {
    const shopIds = [...new Set((args.shopIds ?? []).filter(Boolean))];
    if (!shopIds.length) return 0;

    let written = 0;
    for (const shopId of shopIds) {
      written += await syncShop(ctx, shopId, args);
    }
    return written;
  },
});
