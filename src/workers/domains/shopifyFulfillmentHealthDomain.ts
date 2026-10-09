import { companyDb } from "@/db/companyDb";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const fulfillmentHealthEntity = companyDb.entity("shopifyFulfillmentHealth");

export const shopifyFulfillmentHealthDomain = defineSyncDomain({
  name: "shopifyFulfillmentHealth",
  table: "shopifyFulfillmentHealth",
  label: "Shopify fulfillment sync health",
  syncClass: "A",
  intervalMs: 30_000,
  async sync(ctx, args: { shopId?: string } = {}) {
    const shopId = String(args.shopId ?? "").trim();
    if (!shopId) { return 0; }
    try {
      const response = await workerGet(ctx, "sob/shopify/fulfillmentSyncHealth", { shopId });
      const body = response?.data ?? response;
      const health = body?.health;
      if (!health || String(health.shopId) !== shopId || !Number.isFinite(health.shippedCount) || health.shippedCount !== health.syncedCount + health.unsyncedErrorCount + health.pendingCount) { throw new Error("Invalid fulfillment health response"); }
      await fulfillmentHealthEntity.upsertMany([{ ...health, state: "ready" }]);
      return 1;
    } catch (error) {
      await fulfillmentHealthEntity.upsertMany([{ shopId, state: "error" }]);
      throw error;
    }
  },
});
