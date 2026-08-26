import { shopifyTransferSyncCache, shopifyTransferWebhookHealthCache } from "@/utils/cacheEntities";
import { type SyncContext, registerSyncDomain } from "../syncRegistry";
import { pageAll, pageNewestFirst, workerGet } from "./workerFetch";

/**
 * Shopify transfer sync — order-scoped inventory transfer monitoring.
 *
 * One domain, not several, following `netSuiteOrderPushDomain.ts`'s reasoning: the reads here are
 * coupled by shop scope (the list and the webhook health both need `shopId`, and both feed the
 * same monitor screen), so splitting them into separate domains would mean either duplicating the
 * shop guard or racing two domains that write caches the monitor joins together.
 *
 * Per tick:
 *   1. the transfer list (`sob/shopify/transferSync`), scoped by shopId — server-computed
 *      `syncStage` is stored and rendered exactly as returned, never re-derived here;
 *   2. the webhook subscription health check (`sob/shopify/transferWebhookSubscriptionHealth`).
 */
const LIST_ENDPOINT = "sob/shopify/transferSync";
const WEBHOOK_HEALTH_ENDPOINT = "sob/shopify/transferWebhookSubscriptionHealth";
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

async function syncWebhookHealth(ctx: SyncContext, shopId: string): Promise<number> {
  try {
    const response = await workerGet(ctx, WEBHOOK_HEALTH_ENDPOINT, { shopId });
    // `available: false` (verifier not present on this branch, or the check itself errored) must
    // not be cached as a fabricated "0 missing / 0 duplicate" result. Remove any older answer so
    // the KPI cannot keep rendering stale healthy counts as current.
    if(!response || !response.available) {
      await shopifyTransferWebhookHealthCache.remove(shopId);

      return 0;
    }

    return shopifyTransferWebhookHealthCache.upsertMany([{
      shopId,
      missingTopics: response.missingTopics ?? [],
      duplicateTopics: response.duplicateTopics ?? [],
      checkedAt: response.checkedDate ?? Date.now(),
    }]);
  } catch {
    // A failed health check must not sink the list sync for this tick; the next tick retries it,
    // and the KPI card renders its own "unavailable" state from an absent cached row.
    await shopifyTransferWebhookHealthCache.remove(shopId);

    return 0;
  }
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
    let written = merged.size ? await shopifyTransferSyncCache.upsertMany([...merged.values()]) : 0;
    written += await syncWebhookHealth(ctx, shopId);

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
