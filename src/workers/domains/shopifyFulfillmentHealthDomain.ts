import { shopifyFulfillmentHealthCache } from "@/utils/cacheEntities";
import { registerSyncDomain } from "../syncRegistry";
import { workerGet } from "./workerFetch";

registerSyncDomain({
  name: "shopifyFulfillmentHealth",
  intervalMs: 30_000,
  async sync(ctx, args: { shopId?: string } = {}) {
    const shopId = String(args.shopId ?? "").trim();
    if (!shopId) { return 0; }
    try {
      const response = await workerGet(ctx, "sob/shopify/fulfillmentSyncHealth", { shopId });
      const body = response?.data ?? response;
      const health = body?.health;
      if (!health || String(health.shopId) !== shopId || !Number.isFinite(health.shippedCount) || health.shippedCount !== health.syncedCount + health.unsyncedErrorCount + health.pendingCount) { throw new Error("Invalid fulfillment health response"); }
      await shopifyFulfillmentHealthCache.upsertMany([{ ...health, state: "ready" }]);
      return 1;
    } catch (error) {
      await shopifyFulfillmentHealthCache.upsertMany([{ shopId, state: "error" }]);
      throw error;
    }
  },
});
