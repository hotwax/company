import { shopifyOrderSyncHistoryCache } from "@/utils/cacheEntities";
import { registerSyncDomain } from "../syncRegistry";
import { workerGet } from "./workerFetch";

registerSyncDomain({
  name: "shopifyOrderSyncHistory",
  intervalMs: 10_000,
  async sync(ctx, args: { shopId?: string; orderIds?: string[] } = {}) {
    const shopId = String(args.shopId || "");
    if (!shopId) return 0;
    let written = 0;
    for (const orderId of [...new Set(args.orderIds || [])]) {
      const historyKey = `${shopId}:${orderId}`;
      try {
        const history = { historyKey, shopId, orderId, pending: [] as any[], messages: [] as any[], synced: [] as any[], errors: [] as any[] };
        let pageIndex = 0;
        let hasMore = true;
        while (hasMore) {
          const response = await workerGet(ctx, "sob/shopify/orderFulfillmentHistory", { shopId, orderId, pageIndex });
          const page = (response?.data ?? response)?.history;
          if (!page || page.shopId !== shopId || page.orderId !== orderId || typeof page.hasMore !== "boolean" || !["pending", "messages", "synced", "errors"].every(key => Array.isArray(page[key]))) throw new Error("Invalid order history response");
          for (const key of ["pending", "messages", "synced", "errors"] as const) history[key].push(...page[key]);
          hasMore = page.hasMore;
          pageIndex++;
        }
        written += await shopifyOrderSyncHistoryCache.upsertMany([{ ...history, state: "ready", checkedAt: Date.now() }]);
      } catch (error) {
        await shopifyOrderSyncHistoryCache.upsertMany([{ historyKey, shopId, orderId, state: "error", checkedAt: Date.now() }]);
        throw error;
      }
    }
    return written;
  },
});
