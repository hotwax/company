import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (resp: any) => Boolean(resp?.data?.errors), showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
  bootstrapState: { running: false },
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ rows: { value: [] }, records: { value: [] }, hydrated: { value: true } }),
  useCachedRecord: () => ({ record: { value: undefined }, hydrated: { value: true } }),
  byDescription: () => 0,
}));

import { createShopifyConnection, updateShopifyRemote } from "@/composables/useShopify";

describe("updateShopifyRemote", () => {
  it("repairs a partially-created shop through the service that creates the remote link", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValue({
      data: { systemMessageRemoteId: "M100001", shopId: "M100001" },
      status: 200,
    });

    const result = await updateShopifyRemote({
      myshopifyDomain: "dev-hotwax.myshopify.com",
      shopifyShopId: "72176566383",
      shopAccessToken: "test-token",
      clientId: "test-client",
      clientSecret: "test-secret",
      name: "dev-hotwax",
    });

    expect(result).toEqual({ systemMessageRemoteId: "M100001", shopId: "M100001" });
    expect(harness.api).toHaveBeenCalledWith({
      url: "sob/shop",
      method: "post",
      data: {
        myshopifyDomain: "dev-hotwax.myshopify.com",
        shopifyShopId: "72176566383",
        shopAccessToken: "test-token",
        clientId: "test-client",
        clientSecret: "test-secret",
        name: "dev-hotwax",
        accessScope: "SHOP_READ_WRITE",
      },
    });
  });

  it("marks a newly-created connection as read-write for inventory publishing", async () => {
    harness.api.mockReset();
    harness.api
      .mockResolvedValueOnce({ data: {}, status: 200 })
      .mockResolvedValueOnce({
        data: { systemMessageRemoteId: "M100001", shopId: "M100001" },
        status: 200,
      });

    await createShopifyConnection({
      shopId: "M100001",
      myshopifyDomain: "dev-hotwax.myshopify.com",
      shopifyShopId: "72176566383",
      shopAccessToken: "test-token",
      clientId: "test-client",
      clientSecret: "test-secret",
      name: "dev-hotwax",
    });

    expect(harness.api).toHaveBeenNthCalledWith(2, {
      url: "sob/shop",
      method: "post",
      data: {
        myshopifyDomain: "dev-hotwax.myshopify.com",
        shopifyShopId: "72176566383",
        shopAccessToken: "test-token",
        clientId: "test-client",
        clientSecret: "test-secret",
        name: "dev-hotwax",
        accessScope: "SHOP_READ_WRITE",
      },
    });
  });
});
