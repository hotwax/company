import { describe, expect, it, vi } from "vitest";

/**
 * Retiring a Shopify type mapping — the write that replaced a delete route that does not exist.
 *
 * `oms/shopifyShops/typeMappings` is defined with `get` and `post` only. `DELETE` answers 405, and
 * path-scoped / `admin/`-prefixed variants 404 (all probed live 2026-07-27). The editors used to
 * issue that DELETE before re-posting under the new key, so every RENAME of an existing mapping
 * died on the 405 *before* its replacement write ran — nothing was saved, and the sales-channel
 * screen surfaced no error while doing it (found by QA driving the page live).
 *
 * The replacement uses the one write verb that exists: the endpoint is `store` with PK
 * (shopId, mappedKey), so re-posting the old key with an empty `mappedValue` unmaps it in place.
 * These tests pin both halves of that contract — the write itself, and the readers agreeing that a
 * value-less row is NOT a mapping.
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

describe("retireTypeMapping", () => {
  it("clears the value under the SAME key with a POST — never a DELETE", async () => {
    harness.api.mockResolvedValue({ data: {}, status: 200 });

    await useShopifyShopMutations("10010").retireTypeMapping(
      { mappedTypeId: "SHOPIFY_ORDER_SOURCE", mappedKey: "qa-test-channel-7391" },
      { refresh: false },
    );

    const [config] = harness.api.mock.calls[0];
    expect(config.method).toBe("post");
    expect(config.url).toBe("oms/shopifyShops/typeMappings");
    // The key is preserved — clearing the value is what unmaps it; the row itself cannot be removed.
    expect(config.data).toEqual({
      shopId: "10010",
      mappedTypeId: "SHOPIFY_ORDER_SOURCE",
      mappedKey: "qa-test-channel-7391",
      mappedValue: "",
    });
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
