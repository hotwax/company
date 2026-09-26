import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const sync = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock("@/services/cacheSync", () => ({
  createCacheSync: () => ({
    ...sync, ready: ref(false), busy: ref(false), manualRefreshing: ref(false), error: ref(""),
    syncNow: vi.fn(), afterMutation: vi.fn(),
  }),
}));

function load() {
  vi.resetModules();

  return import("@/services/inventorySyncArea");
}

describe("inventory sync area", () => {
  beforeEach(() => {
    sync.start.mockReset();
    sync.stop.mockReset();
  });

  it("recognises every page of a shop's inventory sync area, and nothing else", async () => {
    const { inventorySyncAreaShopId } = await load();

    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-sync")).toBe("100002");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-sync/location-history")).toBe("100002");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-sync/job-runs/abc")).toBe("100002");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-syncs")).toBe("");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/product-sync")).toBe("");
  });

  it("starts once on entry, keeps polling across the area's pages, and stops on leaving", async () => {
    const { followInventorySyncArea } = await load();

    await followInventorySyncArea({ path: "/shopify-connection-details/100002/inventory-sync" });
    await followInventorySyncArea({ path: "/shopify-connection-details/100002/inventory-sync/history" });
    await followInventorySyncArea({ path: "/shopify-connection-details/100002/inventory-sync/location-history" });

    expect(sync.start).toHaveBeenCalledTimes(1);
    expect(sync.start.mock.calls[0][0].map((domain: any) => domain.name)).toEqual([
      "shopifyInventoryAdjustmentDetail",
      "shopifyInventoryAdjustmentDetailMessage",
      "shopifyLocationInventoryAdjustmentDetail",
      "shopifyLocationInventoryAdjustmentDetailMessage",
      "inventoryEventSystemMessage",
      "inventoryEventProduct",
    ]);
    expect(sync.start.mock.calls[0][0].every((domain: any) => domain.args.shopId === "100002")).toBe(true);
    expect(sync.stop).not.toHaveBeenCalled();

    await followInventorySyncArea({ path: "/shopify" });

    expect(sync.stop).toHaveBeenCalledTimes(1);
  });

  it("re-scopes to another shop without stopping in between", async () => {
    const { followInventorySyncArea } = await load();

    await followInventorySyncArea({ path: "/shopify-connection-details/100002/inventory-sync" });
    await followInventorySyncArea({ path: "/shopify-connection-details/100051/inventory-sync" });

    expect(sync.start).toHaveBeenCalledTimes(2);
    expect(sync.start.mock.calls[1][0][0].args.shopId).toBe("100051");
    expect(sync.stop).not.toHaveBeenCalled();
  });
});
