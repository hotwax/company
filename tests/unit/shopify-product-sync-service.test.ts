import assert from "assert";
import { beforeEach, vi } from "vitest";

import { api } from "@common";
import { ShopifyProductSyncService } from "../../src/services/ShopifyProductSyncService";

type ApiCall = {
  url?: string;
  method?: string;
  data?: any;
  params?: any;
};

vi.mock("@common", () => ({
  api: vi.fn()
}));

vi.mock("@/logger", () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  }
}));

const mockedApi = api as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedApi.mockReset();
});

function createRejectingApi() {
  const calls: ApiCall[] = [];
  mockedApi.mockImplementation(async (request: ApiCall) => {
    calls.push(request);
    throw new Error("backend failed");
  });

  return { calls };
}

describe("shopify product sync service", () => {
  test("fetchSetupState derives returning user state from product sync system messages", async () => {
    const calls: ApiCall[] = [];
    mockedApi.mockImplementation(async (request: ApiCall) => {
      calls.push(request);
      if (request.url === "oms/systemMessageRemotes") {
        return { data: { systemMessageRemoteList: [] } };
      }
      return {
        data: {
          entityValueList: [
            {
              systemMessageId: "SMSG_100",
              statusId: "SmsgConfirmed",
              initDate: "2026-05-02T10:00:00Z",
              lastUpdatedStamp: "2026-05-02T10:05:00Z"
            }
          ]
        }
      };
    });

    const result = await ShopifyProductSyncService.fetchSetupState({
      shopId: "SHOP_10000",
      shop: {
        productStoreId: "STORE_A"
      },
      productStore: {
        productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU"
      }
    });

    const setupRequest = calls.find((call) => call.url === "oms/dataDocumentView");
    assert.equal(setupRequest?.data.dataDocumentId, "SYSTEM_MESSAGE_DATA_MANAGER_LOG");
    assert.equal(setupRequest?.data.customParametersMap.remoteInternalId, "SHOP_10000");
    assert.equal(calls.some((call) => call.url === "oms/products/productUpdateHistories"), false);
    assert.equal(result.hasLinkedOmsProducts, true);
    assert.equal(result.productStoreLocked, true);
    assert.equal(result.identifierLocked, true);
    assert.equal(result.selectedProductStoreId, "STORE_A");
    assert.equal(result.selectedIdentifierEnumId, "SHOPIFY_PRODUCT_SKU");
  });

  test("fetchSetupState returns first-time state only when product sync system messages are empty", async () => {
    mockedApi.mockImplementation(async (request: ApiCall) => {
      if (request.url === "oms/systemMessageRemotes") {
        return { data: { systemMessageRemoteList: [] } };
      }
      return {
        data: {
          entityValueListCount: 0
        }
      };
    });

    const result = await ShopifyProductSyncService.fetchSetupState({
      shopId: "SHOP_10000",
      shop: {
        productStoreId: "STORE_A"
      },
      productStore: {
        productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU"
      }
    });

    assert.equal(result.hasLinkedOmsProducts, false);
    assert.equal(result.productStoreLocked, false);
    assert.equal(result.identifierLocked, false);
    assert.equal(result.selectedProductStoreId, "STORE_A");
    assert.equal(result.selectedIdentifierEnumId, "SHOPIFY_PRODUCT_SKU");
  });

  test("fetchSetupState rejects invalid system message response shapes", async () => {
    mockedApi.mockImplementation(async (request: ApiCall) => {
      if (request.url === "oms/systemMessageRemotes") {
        return { data: { systemMessageRemoteList: [] } };
      }
      return {
        data: {
          entityValueListCount: 1
        }
      };
    });

    await assert.rejects(() => ShopifyProductSyncService.fetchSetupState({
      shopId: "SHOP_10000"
    }));
  });

  test("fetchProductStoreContext derives related shops from loaded Shopify shops", async () => {
    const { calls } = createRejectingApi();

    const result = await ShopifyProductSyncService.fetchProductStoreContext({
      productStoreId: "STORE_A",
      shops: [
        { shopId: "SHOP_10000", productStoreId: "STORE_A" },
        { shopId: "SHOP_10001", productStoreId: "STORE_A" },
        { shopId: "SHOP_10002", productStoreId: "STORE_B" }
      ]
    });

    assert.equal(calls.length, 0);
    assert.deepEqual(result.relatedShops.map((shop: any) => shop.shopId), ["SHOP_10000", "SHOP_10001"]);
  });

  test("fetchProductStoreContext rejects missing Shopify shop data instead of calling a fallback endpoint", async () => {
    const { calls } = createRejectingApi();

    await assert.rejects(() => ShopifyProductSyncService.fetchProductStoreContext({
      productStoreId: "STORE_A"
    }));
    assert.equal(calls.length, 0);
  });

  test("fetchShopifyShopProductCount reuses provided sync run state", async () => {
    const calls: ApiCall[] = [];
    mockedApi.mockImplementation(async (request: ApiCall) => {
      calls.push(request);
      return {
        data: {
          response: {
            productsCount: {
              count: 12
            }
          }
        }
      };
    });

    const result = await ShopifyProductSyncService.fetchShopifyShopProductCount({
      systemMessageRemoteId: "SMR_10000",
      syncRunState: {
        lastSyncedAt: "2026-05-02T00:00:00Z"
      }
    });

    assert.equal(result.count, 12);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "shopify/graphql");
    assert.equal(calls.some((call) => call.url === "admin/systemMessages"), false);
    assert.equal(String(calls[0].data.queryText).includes("updated_at:>'2026-05-02T00:00:00Z'"), true);
  });

  test("fetchDashboardSummary returns shared sync state and unsynced count without reloading system messages", async () => {
    const calls: ApiCall[] = [];
    mockedApi.mockImplementation(async (request: ApiCall) => {
      calls.push(request);

      if (request.url === "oms/dataDocumentView" && request.data?.customParametersMap?.statusId === "SmsgProduced") {
        return {
          data: {
            entityValueList: [
              {
                systemMessageId: "SMSG_PENDING",
                statusId: "SmsgProduced",
                initDate: "2026-05-02T12:00:00Z"
              }
            ],
            entityValueListCount: 1
          }
        };
      }

      if (request.url === "oms/dataDocumentView" && request.data?.dataDocumentId === "SYSTEM_MESSAGE_DATA_MANAGER_LOG") {
        return {
          data: {
            entityValueList: [
              {
                systemMessageId: "SMSG_CONFIRMED",
                statusId: "SmsgConfirmed",
                initDate: "2026-05-02T10:00:00Z",
                processedDate: "2026-05-02T10:05:00Z",
                logId: "LOG_1"
              },
              {
                systemMessageId: "SMSG_PRODUCED",
                statusId: "SmsgProduced",
                initDate: "2026-05-02T11:00:00Z"
              }
            ],
            entityValueListCount: 2
          }
        };
      }

      if (request.url === "oms/dataDocumentView" && request.data?.dataDocumentId === "DATA_MANAGER_LOG_AND_PARAMETER") {
        return {
          data: {
            entityValueListCount: 3
          }
        };
      }

      if (request.url === "shopify/graphql" && String(request.data?.queryText).includes("bulkOperations(first: 1")) {
        return {
          data: {
            response: {
              bulkOperations: {
                nodes: [
                  {
                    id: "gid://shopify/BulkOperation/1",
                    status: "RUNNING",
                    type: "QUERY",
                    createdAt: "2026-05-02T12:05:00Z",
                    objectCount: "42"
                  }
                ]
              }
            }
          }
        };
      }

      if (request.url === "shopify/graphql" && String(request.data?.queryText).includes("productsCount")) {
        return {
          data: {
            response: {
              productsCount: {
                count: 7
              }
            }
          }
        };
      }

      throw new Error(`Unexpected request: ${JSON.stringify(request)}`);
    });

    const summary = await ShopifyProductSyncService.fetchDashboardSummary({
      shopId: "SHOP_10000",
      systemMessageRemoteId: "SMR_10000",
      shop: {
        shopId: "SHOP_10000"
      }
    });

    assert.equal(Date.parse(summary.syncRunState.lastSyncedAt || ""), Date.parse("2026-05-02T10:00:00.000Z"));
    assert.equal(summary.pendingRequests.count, 1);
    assert.equal(summary.runningOperation?.id, "gid://shopify/BulkOperation/1");
    assert.equal(summary.unsyncedUpdates.count, 7);
    assert.equal(summary.updateFilesToProcess, 3);
    assert.equal(calls.filter((call) => call.url === "oms/dataDocumentView").length, 3);
    assert.equal(calls.filter((call) => call.url === "shopify/graphql").length, 2);
  });
});
