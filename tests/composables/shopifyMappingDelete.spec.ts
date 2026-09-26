import { describe, expect, it, vi } from "vitest";

/**
 * Deleting Shopify mappings — type mappings, carrier shipments and locations.
 *
 * `oms/shopifyShops/{typeMappings,carrierShipments,locations}` gained `DELETE` in oms v3.1.0. Before
 * that the route answered 405 (probed live 2026-07-27), so clearing a type mapping re-posted its key
 * with an empty `mappedValue`. Carrier shipments had no such fallback: their POST is `create` with PK
 * (shopId, shopifyShippingMethod), so posting an empty name made Moqui generate a sequenced key and
 * insert a junk row, and a rename left the old name mapped.
 *
 * These tests pin the delete contract — the exact PK goes out, and a wildcard never does — and the
 * readers still treating a value-less row, left by the old workaround, as NOT a mapping.
 */

const harness = vi.hoisted(() => ({ api: vi.fn(), refreshAfterMutation: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (resp: any) => Boolean(resp?.data?.errors), showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: vi.fn(),
  bootstrapState: { running: false },
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ rows: { value: [] }, records: { value: [] }, hydrated: { value: true } }),
  useCachedRecord: () => ({ record: { value: undefined }, hydrated: { value: true } }),
  byDescription: () => 0,
}));

import { deriveOrderSyncMappingReadiness, useShopifyShopMutations } from "@/composables/useShopify";

describe("mapping deletes", () => {
  it.each([
    ["deleteTypeMapping", { mappedKey: "qa-test-channel-7391" }, "oms/shopifyShops/typeMappings"],
    ["deleteCarrierShipment", { shopifyShippingMethod: "Standard Rate" }, "oms/shopifyShops/carrierShipments"],
    ["deleteLocation", { facilityId: "BROADWAY" }, "oms/shopifyShops/locations"],
  ] as const)("%s sends a DELETE with the row's full PK", async (method, payload, url) => {
    harness.api.mockReset().mockResolvedValue({ data: {}, status: 200 });

    await (useShopifyShopMutations("10010")[method] as any)(payload, { refresh: false });

    expect(harness.api).toHaveBeenCalledTimes(1);
    const [config] = harness.api.mock.calls[0];
    expect(config.method).toBe("delete");
    expect(config.url).toBe(url);
    expect(config.data).toEqual({ ...payload, shopId: "10010" });
  });

  // Moqui's entity-auto delete reads `*` as a wildcard, so this key would delete every row for the shop.
  it.each(["*", ""])("refuses to send a key of %j", async (key) => {
    harness.api.mockReset();

    await expect(useShopifyShopMutations("10010").deleteCarrierShipment({ shopifyShippingMethod: key }))
      .rejects.toThrow("without an exact key");
    expect(harness.api).not.toHaveBeenCalled();
  });
});

describe("mapping readiness treats a retired row as unmapped", () => {
  const retired = { shopId: "10010", mappedTypeId: "SHOPIFY_ORDER_SOURCE", mappedKey: "old-key" };
  const mapped = { ...retired, mappedKey: "web", mappedValue: "WEB_SALES_CHANNEL" };

  it("does not count a value-less row as a sales channel mapping", () => {
    const readiness = deriveOrderSyncMappingReadiness({ selectedShopId: "10010", typeMappings: [retired] });
    const salesChannel = readiness.families.find((family) => family.id === "sales-channel");

    // Counting the retired row here would report the family ready after its only mapping was cleared.
    expect(salesChannel?.ready).toBe(false);
  });

  it("still counts a row that maps something", () => {
    const readiness = deriveOrderSyncMappingReadiness({ selectedShopId: "10010", typeMappings: [retired, mapped] });
    const salesChannel = readiness.families.find((family) => family.id === "sales-channel");

    expect(salesChannel?.ready).toBe(true);
    expect(salesChannel?.count).toBe(1);
  });
});
