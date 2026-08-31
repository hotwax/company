import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: {
    hasError: (response: any) => Boolean(response?.data?._ERROR_MESSAGE_ || response?.data?.error),
  },
  translate: (value: string) => value,
}));

import { useShopifyTransferSyncDetail } from "@/composables/useShopifyTransferSync";

beforeEach(() => {
  harness.api.mockReset();
  harness.api.mockResolvedValue({ data: { available: true } });
});

describe("Shopify transfer sync detail contract", () => {
  it("loads the order-scoped detail bundle through the feature composable", async () => {
    harness.api.mockResolvedValueOnce({ data: { header: { orderId: "ORDER/1" } } });
    const { fetchTransferSyncDetail } = useShopifyTransferSyncDetail();

    await expect(fetchTransferSyncDetail("10000", "ORDER/1")).resolves.toEqual({
      header: { orderId: "ORDER/1" },
    });
    expect(harness.api).toHaveBeenLastCalledWith({
      url: "sob/shopify/transferSync/ORDER%2F1",
      method: "GET",
      params: { shopId: "10000" },
    });
  });
});
