import assert from "assert";
import path from "path";

type ApiCall = {
  url?: string;
  method?: string;
  data?: any;
  params?: any;
};

declare const global: any;

const servicePath = path.resolve(__dirname, "../../src/services/ShopifyProductSyncService.ts");

async function loadService(api: (request: ApiCall) => Promise<any>) {
  global.__clearUnitMocks();
  global.__setUnitMock("@/api", api);
  global.__setUnitMock("@/logger", {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  });

  delete require.cache[require.resolve(servicePath)];
  const loadedService = await import(servicePath);
  global.__clearUnitMocks();
  return loadedService.ShopifyProductSyncService;
}

function createRejectingApi() {
  const calls: ApiCall[] = [];
  const api = async (request: ApiCall) => {
    calls.push(request);
    throw new Error("backend failed");
  };

  return { api, calls };
}

describe("shopify product sync service", () => {
  test("fetchSetupState derives returning user state from real product update history", async () => {
    const calls: ApiCall[] = [];
    const service = await loadService(async (request: ApiCall) => {
      calls.push(request);
      return {
        data: {
          productUpdateHistory: [
            {
              shopId: "SHOP_10000",
              productId: "gid://shopify/Product/100"
            }
          ]
        }
      };
    });

    const result = await service.fetchSetupState({
      shopId: "SHOP_10000",
      shop: {
        productStoreId: "STORE_A"
      },
      productStore: {
        productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU"
      }
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "oms/productUpdateHistory");
    assert.equal(calls[0].params.shopId, "SHOP_10000");
    assert.equal(calls[0].params.pageSize, 1);
    assert.equal(result.hasLinkedOmsProducts, true);
    assert.equal(result.productStoreLocked, true);
    assert.equal(result.identifierLocked, true);
    assert.equal(result.selectedProductStoreId, "STORE_A");
    assert.equal(result.selectedIdentifierEnumId, "SHOPIFY_PRODUCT_SKU");
  });

  test("fetchSetupState returns first-time state only when product update history is really empty", async () => {
    const service = await loadService(async () => ({
      data: {
        productUpdateHistory: []
      }
    }));

    const result = await service.fetchSetupState({
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

  test("fetchSetupState rejects invalid product update history shapes", async () => {
    const service = await loadService(async () => ({
      data: {
        productUpdateHistoryCount: 1
      }
    }));

    await assert.rejects(() => service.fetchSetupState({
      shopId: "SHOP_10000"
    }));
  });

  test("fetchProductStoreContext derives related shops from loaded Shopify shops", async () => {
    const { api, calls } = createRejectingApi();
    const service = await loadService(api);

    const result = await service.fetchProductStoreContext({
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
    const { api, calls } = createRejectingApi();
    const service = await loadService(api);

    await assert.rejects(() => service.fetchProductStoreContext({
      productStoreId: "STORE_A"
    }));
    assert.equal(calls.length, 0);
  });

  test("fetchShopifyShopProductCount reuses provided sync run state", async () => {
    const calls: ApiCall[] = [];
    const service = await loadService(async (request: ApiCall) => {
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

    const result = await service.fetchShopifyShopProductCount({
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
    const service = await loadService(async (request: ApiCall) => {
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

    const summary = await service.fetchDashboardSummary({
      shopId: "SHOP_10000",
      systemMessageRemoteId: "SMR_10000",
      shop: {
        shopId: "SHOP_10000"
      }
    });

    assert.equal(summary.syncRunState.lastSyncedAt, "2026-05-02T10:00:00.000Z");
    assert.equal(summary.pendingRequests.count, 1);
    assert.equal(summary.runningOperation?.id, "gid://shopify/BulkOperation/1");
    assert.equal(summary.unsyncedUpdates.count, 7);
    assert.equal(calls.filter((call) => call.url === "oms/dataDocumentView").length, 2);
    assert.equal(calls.filter((call) => call.url === "shopify/graphql").length, 2);
  });
});
