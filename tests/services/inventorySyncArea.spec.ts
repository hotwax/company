import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({
  activate: vi.fn(),
  deactivate: vi.fn(),
  refresh: vi.fn(),
  syncNow: vi.fn(),
  errors: {} as Record<string, string>,
}));

vi.mock("@common/db", () => ({ serviceState: { errors: sync.errors } }));

vi.mock("@/services/appDbSync", () => ({
  activateSyncDomains: sync.activate,
  deactivateSyncDomains: sync.deactivate,
  createSyncDomainOwner: (label: string) => `${label}:1`,
  refreshAfterMutation: sync.refresh,
  syncNow: sync.syncNow,
}));

function load() {
  vi.resetModules();

  return import("@/services/inventorySyncArea");
}

describe("inventory sync area", () => {
  beforeEach(() => {
    sync.activate.mockReset();
    sync.deactivate.mockReset();
    sync.refresh.mockReset();
    for(const key of Object.keys(sync.errors)) {delete sync.errors[key];}
  });

  it("recognises every page of a shop's inventory sync area, and nothing else", async () => {
    const { inventorySyncAreaShopId } = await load();

    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-sync")).toBe("100002");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-sync/location-history")).toBe("100002");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-sync/job-runs/abc")).toBe("100002");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/inventory-syncs")).toBe("");
    expect(inventorySyncAreaShopId("/shopify-connection-details/100002/product-sync")).toBe("");
  });

  it("holds the area's domains under its own owner across the area's pages, and retires them on leaving", async () => {
    const { followInventorySyncArea } = await load();

    await followInventorySyncArea({ path: "/shopify-connection-details/100002/inventory-sync" });
    await followInventorySyncArea({ path: "/shopify-connection-details/100002/inventory-sync/history" });

    // Re-taken on every move: the worker holds one active set, and a page leaving must not wipe it.
    expect(sync.activate).toHaveBeenCalledTimes(2);
    expect(sync.activate.mock.calls[0][0].map((domain: any) => domain.name)).toEqual([
      "shopifyInventoryAdjustmentDetail",
      "shopifyInventoryAdjustmentDetailMessage",
      "shopifyLocationInventoryAdjustmentDetail",
      "shopifyLocationInventoryAdjustmentDetailMessage",
      "inventoryEventSystemMessage",
      "inventoryEventProduct",
    ]);
    expect(sync.activate.mock.calls[0][0].every((domain: any) => domain.args.shopId === "100002")).toBe(true);
    expect(sync.activate.mock.calls.every(([, owner]) => owner === "inventorySyncArea:1")).toBe(true);
    expect(sync.deactivate).not.toHaveBeenCalled();

    await followInventorySyncArea({ path: "/shopify" });
    await followInventorySyncArea({ path: "/settings" });

    expect(sync.deactivate.mock.calls).toEqual([["inventorySyncArea:1"]]);
  });

  it("re-scopes to another shop without retiring in between", async () => {
    const { followInventorySyncArea } = await load();

    await followInventorySyncArea({ path: "/shopify-connection-details/100002/inventory-sync" });
    await followInventorySyncArea({ path: "/shopify-connection-details/100051/inventory-sync" });

    expect(sync.activate.mock.calls[1][0][0].args.shopId).toBe("100051");
    expect(sync.deactivate).not.toHaveBeenCalled();
  });

  it("reports only the area's own failures", async () => {
    const { useInventorySyncArea } = await load();
    sync.errors.shopifyLocationInventoryAdjustmentDetail = "boom";
    sync.errors.facility = "unrelated";

    expect(useInventorySyncArea().failingDomains.value).toEqual({ shopifyLocationInventoryAdjustmentDetail: "boom" });
  });

  it("loads older events through the ledger's rows domain, and its bounds on request only", async () => {
    const { useInventorySyncArea } = await load();
    const { loadEventsFrom, loadLedgerBounds } = useInventorySyncArea();

    await loadEventsFrom("channel", 1_000);
    await loadEventsFrom("location", 2_000);
    await loadLedgerBounds("location", "100002");

    expect(sync.refresh.mock.calls).toEqual([
      ["shopifyInventoryAdjustmentDetail", { fromMs: 1_000 }],
      ["shopifyLocationInventoryAdjustmentDetail", { fromMs: 2_000 }],
      ["inventoryEventBounds", { kind: "location", shopId: "100002" }],
    ]);
  });
});
