import { shopifyPendingFulfillmentCache, shopifyPendingFulfillmentStatusCache } from "@/utils/cacheEntities";
import { registerSyncDomain } from "../syncRegistry";
import { workerGet } from "./workerFetch";

// A bounded oldest-first snapshot: shipped rows leave this set when Shopify confirms them.
registerSyncDomain({
  name: "shopifyPendingFulfillment",
  intervalMs: 10_000,
  async sync(ctx, args: { shopId?: string } = {}) {
    const shopId = String(args.shopId ?? "").trim();
    if(!shopId) {return 0;}
    try {
      const response = await workerGet(ctx, "sob/shopify/pendingFulfillments", { shopId, pageIndex: 0, pageSize: 200 });
      const body = response?.data ?? response;
      if(!Array.isArray(body?.shipments)) {throw new Error("Invalid pending fulfillment response");}
      const rows = body.shipments.map((row: any) => ({ ...row, shopId }));
      const result = await shopifyPendingFulfillmentCache.snapshotReplace(rows, { field: "shopId", value: shopId });
      await shopifyPendingFulfillmentStatusCache.upsertMany([{ shopId, state: "ready", error: "", hasMore: Number(body.shipmentCount) > 200 ? "Y" : "N", checkedAt: Date.now() }]);
      return result.written + result.pruned;
    } catch(error: any) {
      await shopifyPendingFulfillmentStatusCache.upsertMany([{ shopId, state: "error", error: "Pending shipments could not be loaded.", checkedAt: Date.now() }]);
      throw error;
    }
  },
});
