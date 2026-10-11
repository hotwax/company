import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: () => false },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  bootstrapState: { running: false, written: {}, errors: {} },
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (error: any, fallback: string) => error?.message || fallback,
}));

import { useFacilityMutations } from "@/composables/useFacilities";

beforeEach(() => {
  vi.clearAllMocks();
  harness.api.mockResolvedValue({ data: {} });
  harness.refreshAfterMutation.mockResolvedValue(1);
});

describe("Shopify facility-location mutations", () => {
  it("deletes a mapping through the collection endpoint using both primary-key fields", async () => {
    const { deleteShopifyLocation } = useFacilityMutations("BROOKLYN");

    await deleteShopifyLocation({
      shopId: "10000",
      shopifyLocationId: "67890479268",
    });

    expect(harness.api).toHaveBeenCalledWith({
      url: "oms/shopifyShops/locations",
      method: "delete",
      data: {
        facilityId: "BROOKLYN",
        shopId: "10000",
        shopifyLocationId: "67890479268",
      },
    });
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith(
      "shopifyLocation",
      { shopId: "10000" },
    );
  });
});
