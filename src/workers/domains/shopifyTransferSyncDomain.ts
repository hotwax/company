import { shopifyTransferSyncCache } from "@/utils/cacheEntities";
import { registerSyncDomain } from "../syncRegistry";
import { pageAll, pageNewestFirst } from "./workerFetch";

/**
 * Shopify transfer sync — order-scoped inventory transfer monitoring.
 *
 * Per tick: the transfer list (`sob/shopify/transferSync`), scoped by shopId — server-computed
 * `syncStage` is stored and rendered exactly as returned, never re-derived here.
 *
 * Webhook subscription health is deliberately NOT synced here. It used to call
 * `sob/shopify/transferWebhookSubscriptionHealth` every tick, and that endpoint runs the live
 * verifier — one Shopify GraphQL call per topic, so fourteen per shop, every 15 seconds while the
 * page was open. The page now derives the same answer from the subscription list it already reads
 * on demand, so nothing polls Shopify in the background.
 */
const LIST_ENDPOINT = "sob/shopify/transferSync";
/** get#ShopifyTransferSyncList wraps its rows in a `transfers` list, not a bare array. */
const LIST_COLLECTION = "transfers";

export interface ShopifyTransferSyncArgs {
  shopId?: string;
  /** Recent-window depth. Needs-attention rows are always included regardless of recency. */
  total?: number;
  batchSize?: number;
}

function transferKey(raw: Record<string, unknown>): string | undefined {
  if(!raw?.shopId || !raw?.orderId) {return undefined;}

  return `${raw.shopId}|${raw.orderId}`;
}

registerSyncDomain({
  name: "shopifyTransferSync",
  intervalMs: 15_000,
  async sync(ctx, args: ShopifyTransferSyncArgs = {}) {
    const shopId = String(args.shopId ?? "").trim();
    // No shop, no scope — an unscoped list read would cache another shop's transfers as this
    // shop's, the same class of bug the inventory ledgers guard against.
    if(!shopId) {return 0;}

    const batchSize = args.batchSize ?? 50;
    const target = args.total ?? 300;

    const [recent, needsAttention] = await Promise.all([
      // get#ShopifyTransferSyncList has no orderByField param — it already sorts needs-attention
      // first, then newest lastActivityDate, server-side; no client-side ordering param exists to
      // pass through.
      pageNewestFirst({
        ctx,
        url: LIST_ENDPOINT,
        collectionKey: LIST_COLLECTION,
        params: { shopId },
        total: target,
        batchSize,
      }),
      // Kept as its own fetch so an older row still needing attention is not evicted from the
      // cache just because it fell outside the recent window above. needsAttention is a Boolean
      // out-parameter, not a "Y"/"N" indicator.
      pageAll({
        ctx,
        url: LIST_ENDPOINT,
        collectionKey: LIST_COLLECTION,
        params: { shopId, needsAttention: true },
        keyOf: transferKey,
        label: "transferSync:needsAttention",
      }),
    ]);

    const merged = new Map<string, any>();
    for(const row of [...recent, ...needsAttention]) {
      const key = transferKey(row);
      if(key) {merged.set(key, row);}
    }
    const written = merged.size ? await shopifyTransferSyncCache.upsertMany([...merged.values()]) : 0;

    return written;
  },
  async refetchOne(ctx, pk) {
    const shopId = String(pk?.shopId ?? "");
    const orderId = String(pk?.orderId ?? "");
    if(!shopId || !orderId) {return 0;}
    const rows = await pageAll({
      ctx,
      url: LIST_ENDPOINT,
      collectionKey: LIST_COLLECTION,
      params: { shopId, orderId },
      keyOf: transferKey,
      batchSize: 10,
      label: "transferSync:refetchOne",
    });

    return rows.length ? shopifyTransferSyncCache.upsertMany(rows) : 0;
  },
});
