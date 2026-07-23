import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  translate: vi.fn((key: string) => key),
  permissions: [] as string[]
}));

vi.mock("@common", () => ({
  api: mocks.api,
  translate: mocks.translate,
  commonUtil: {
    hasError: (response: any) => Boolean(
      response?.data?._ERROR_MESSAGE_
      || (Array.isArray(response?.data?._ERROR_MESSAGE_LIST_) && response.data._ERROR_MESSAGE_LIST_.length)
      || (Array.isArray(response?.data?.errors) && response.data.errors.length)
    )
  }
}));

vi.mock("@/store/user", () => ({
  useUserStore: () => ({
    hasPermission: (permissionId: string) => mocks.permissions.includes(permissionId),
    permissions: mocks.permissions
  })
}));

import {
  type SafeShopifyOrderSyncRemote,
  useShopifyOrderSyncStore
} from "./shopifyOrderSync";
import { buildShopifyOrderSyncErrorCsv } from "@/utils/shopifyOrderSyncErrorCsv";

type ApiOptions = {
  url: string;
  method: string;
  params?: Record<string, any>;
  data?: Record<string, any>;
};

const ok = (data: unknown = {}) => Promise.resolve({ data });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function remoteFor(shopId: string, systemMessageRemoteId = `REMOTE_${shopId}`): SafeShopifyOrderSyncRemote {
  return {
    systemMessageRemoteId,
    ownerShopId: shopId,
    description: `Shopify ${shopId}`,
    remoteId: `gid://shopify/Shop/${shopId}`,
    remoteIdType: "SHOPIFY_SHOP_ID",
    internalId: shopId,
    internalIdType: "HOTWAX_SHOP_ID",
    accessScopeEnumId: "SHOPIFY_ACCESS"
  };
}

function rawOrderSyncJob(shopId: string, overrides: Record<string, unknown> = {}) {
  const systemMessageRemoteId = String(overrides.systemMessageRemoteId || `REMOTE_${shopId}`);
  return {
    jobName: `queue_ShopifyOrderSync_${shopId}`,
    parentJobName: "queue_ShopifyOrderSync",
    description: `Order Sync ${shopId}`,
    serviceName: "co.hotwax.shopify.system.ShopifySystemMessageServices.queue#FeedSystemMessage",
    cronExpression: "0 0/15 * * * ?",
    paused: "Y",
    lastRunStatusId: "",
    latestJobRun: null,
    shopId,
    systemMessageRemoteId,
    systemMessageTypeId: "ShopifyOrderSync",
    runAsBatch: true,
    serviceJobParameters: [
      { parameterName: "shopId", parameterValue: shopId },
      { parameterName: "systemMessageRemoteId", parameterValue: systemMessageRemoteId },
      { parameterName: "systemMessageTypeId", parameterValue: "ShopifyOrderSync" },
      { parameterName: "runAsBatch", parameterValue: "true" }
    ],
    ...overrides
  };
}

function orderSyncEnvelope(shopId: string, extras: {
  shop?: Record<string, unknown>;
  productStore?: Record<string, unknown>;
  remote?: Record<string, unknown>;
  template?: Record<string, unknown>;
  job?: Record<string, unknown> | null;
  jobState?: "configured-paused" | "configured-active" | "missing" | "conflict" | "error";
  jobErrorMessage?: string;
} = {}) {
  const job = extras.job ?? null;
  const paused = job ? [true, "Y", "true"].includes(job.paused as any) : false;
  const state = extras.jobState || (job ? (paused ? "configured-paused" : "configured-active") : "missing");
  const productStoreId = String(extras.shop?.productStoreId || extras.productStore?.productStoreId || "STORE_1");
  return {
    orderSyncJob: {
      shopId,
      state,
      runtimeTimeZone: "Asia/Kolkata",
      shop: {
        shopId,
        name: `Shop ${shopId}`,
        shopifyShopId: `gid://shopify/Shop/${shopId}`,
        myshopifyDomain: `shop-${shopId}.myshopify.com`,
        productStoreId,
        isEnabled: "Y",
        ...extras.shop
      },
      productStore: {
        productStoreId,
        name: `Store ${shopId}`,
        ...extras.productStore
      },
      remote: {
        ...remoteFor(shopId),
        ...extras.remote
      },
      template: {
        jobName: "queue_ShopifyOrderSync",
        cronExpression: "0 0/15 * * * ?",
        paused: false,
        ...extras.template
      },
      job,
      ...(extras.jobErrorMessage ? { errorMessage: extras.jobErrorMessage } : {})
    }
  };
}

function configurationApi(options: ApiOptions, shopId: string, extras: {
  shop?: Record<string, unknown>;
  productStore?: Record<string, unknown>;
  remote?: Record<string, unknown>;
  template?: Record<string, unknown>;
  job?: Record<string, unknown> | null;
  jobState?: "configured-paused" | "configured-active" | "missing" | "conflict" | "error";
  jobErrorMessage?: string;
} = {}) {
  if (options.url === `shopify/order-sync/${encodeURIComponent(shopId)}/job`) {
    return ok(orderSyncEnvelope(shopId, extras));
  }
  if (options.url === "oms/shopifyShops/typeMappings") return ok({ typeMappings: [] });
  if (options.url === "oms/shopifyShops/carrierShipments") return ok({ carrierShipments: [] });
  throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
}

function recentError(id: string, shopifyOrderId: string) {
  return {
    id,
    shopId: "10010",
    shopifyOrderId,
    orderName: "#1001",
    errorText: "Original immutable import error",
    occurredAt: "2026-07-22T12:00:00Z",
    occurredAtMillis: Date.parse("2026-07-22T12:00:00Z"),
    configId: "SYNC_SHOPIFY_ORDER",
    logId: "log-1",
    systemMessageId: "message-1",
    batchId: "run-1",
    retryable: true
  };
}

function safeErrorProjection(overrides: Record<string, unknown> = {}) {
  return {
    errorId: "failed-log:0",
    shopId: "10010",
    shopifyOrderId: "123456",
    orderName: "#1001",
    errorText: "Shopify order import failed.",
    occurredAt: "2026-07-22T12:00:00Z",
    configId: "SYNC_SHOPIFY_ORDER",
    logId: "failed-log",
    systemMessageId: "failed-batch",
    batchId: "failed-run",
    retryable: true,
    ...overrides
  };
}

function safePreImportErrorProjection(overrides: Record<string, unknown> = {}) {
  return {
    errorId: "M221664:system-message",
    shopId: "10010",
    shopifyOrderId: "",
    orderName: "",
    errorText: "Shopify order request failed before import.",
    occurredAt: "2026-07-16T19:26:18.679Z",
    configId: "",
    logId: "",
    systemMessageId: "M221664",
    batchId: "",
    retryable: false,
    ...overrides
  };
}

function safeAuditProjection(overrides: Record<string, unknown> = {}) {
  return {
    auditId: "audit-1",
    shopId: "10010",
    systemMessageId: "batch-1",
    dataManagerLogId: "create-log",
    shopifyOrderId: "123456",
    shopifyOrderName: "HC#2690",
    orderId: "HOTWAX-1001",
    outcome: "Created",
    configId: "SYNC_SHOPIFY_ORDER",
    processedDate: "2026-07-22T12:03:00Z",
    shopifyFetchVerified: true,
    ...overrides
  };
}

function standardBatch(
  systemMessageId: string,
  statusId: string,
  initDate: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    systemMessageId,
    messageId: "",
    messageDate: "2026-07-22T11:45:00Z",
    systemMessageTypeId: "ShopifyOrderSync",
    systemMessageRemoteId: "REMOTE_10010",
    statusId,
    initDate,
    ...overrides
  };
}

function summaryImport(
  systemMessageId: string,
  configId: "SYNC_SHOPIFY_ORDER" | "UPDATE_SHOPIFY_ORDER",
  logStatusId: string,
  totalRecordCount: number,
  failedRecordCount: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    systemMessageId,
    systemMessageTypeId: "ShopifyOrderSync",
    systemMessageRemoteId: "REMOTE_10010",
    configId,
    logId: `${systemMessageId}-${configId}`,
    logStatusId,
    totalRecordCount,
    failedRecordCount,
    ...overrides
  };
}

function monitoringApi(options: ApiOptions, fixture: {
  batches: Record<string, unknown>[];
  imports: Record<string, unknown>[];
  audits?: Record<string, unknown>[];
  errors?: Record<string, unknown>[];
  requestErrors?: Record<string, unknown>[];
  auditImports?: Record<string, unknown>[];
  job?: Record<string, unknown> | null;
  remote?: Record<string, unknown>;
}) {
  if (options.url === "shopify/order-sync/10010/job") {
    return ok(orderSyncEnvelope("10010", { job: fixture.job || null, remote: fixture.remote }));
  }
  if (options.url === "admin/systemMessages") return ok({ systemMessages: fixture.batches });
  if (options.url === "shopify/order-sync/10010/audits") return ok({ orderSyncAudits: fixture.audits || [] });
  if (options.url === "shopify/order-sync/10010/errors") return ok({
    orderSyncErrors: fixture.errors || [],
    orderSyncRequestErrors: fixture.requestErrors || [],
  });
  if (options.url === "oms/dataDocumentView") {
    if (options.data?.customParametersMap?.logId) {
      const requestedLogIds = new Set(options.data.customParametersMap.logId as string[]);
      return ok({
        entityValueList: (fixture.auditImports || fixture.imports)
          .filter((row) => requestedLogIds.has(String(row.logId || "")))
      });
    }
    return ok({
      entityValueList: options.data?.customParametersMap?.systemMessageId ? fixture.imports : []
    });
  }
  throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
}

describe("Shopify Order Sync store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.api.mockReset();
    mocks.translate.mockClear();
    mocks.permissions.splice(0);
  });

  describe("selected-shop configuration context", () => {
    it("keeps a backend error distinct from an explicit missing configuration", async () => {
      mocks.api.mockRejectedValue(new Error("private transport detail"));
      const failedStore = useShopifyOrderSyncStore();

      await expect(failedStore.loadConfiguration("10010")).rejects.toThrow("Something went wrong.");
      expect(failedStore.configurationState.kind).toBe("error");
      expect(failedStore.configurationState.kind).not.toBe("missing");
      expect(failedStore.configurationError).toBe("Something went wrong.");
      expect(mocks.translate).toHaveBeenCalledWith("Something went wrong.");

      setActivePinia(createPinia());
      mocks.api.mockReset();
      mocks.api.mockImplementation((options: ApiOptions) => configurationApi(options, "10010"));
      const missingStore = useShopifyOrderSyncStore();

      await missingStore.loadConfiguration("10010");
      expect(missingStore.configurationState.kind).toBe("missing");
      expect(missingStore.configurationError).toBeNull();
      expect(missingStore.job).toBeNull();
    });

    it.each([
      '{"accessToken":"shop-secret-token"}',
      '{"password":"remote-password"}',
      '{"Authorization":"Bearer private-token"}',
    ])("never exposes a quoted transport secret from %s", async (transportDetail) => {
      mocks.api.mockRejectedValue(new Error(transportDetail));
      const store = useShopifyOrderSyncStore();

      await expect(store.loadConfiguration("10010")).rejects.toThrow("Something went wrong.");
      expect(store.configurationError).toBe("Something went wrong.");
      expect(JSON.stringify(store.$state)).not.toContain(transportDetail);
    });

    it.each(["conflict", "error"] as const)("surfaces a canonical %s job envelope as an error", async (state) => {
      mocks.api.mockImplementation((options: ApiOptions) => configurationApi(options, "10010", {
        jobState: state,
        jobErrorMessage: `${state} from authoritative Order Sync lookup`
      }));
      const store = useShopifyOrderSyncStore();

      await expect(store.loadConfiguration("10010")).rejects.toThrow(
        `${state} from authoritative Order Sync lookup`
      );
      expect(store.job).toBeNull();
      expect(store.configurationState.kind).toBe("error");
      expect(store.configurationError).toBe(`${state} from authoritative Order Sync lookup`);
    });

    it("rejects a safe envelope for any shop other than the exact selected shop", async () => {
      mocks.api.mockResolvedValue({ data: orderSyncEnvelope("20020") });
      const store = useShopifyOrderSyncStore();

      await expect(store.loadConfiguration("10010")).rejects.toThrow("crossed the selected Shopify shop scope");
      expect(store.shop).toBeNull();
      expect(store.productStore).toBeNull();
      expect(store.remote).toBeNull();
      expect(store.templateJob).toBeNull();
      expect(store.job).toBeNull();
    });

    it.each([
      ["missing derived owner", { ownerShopId: undefined }],
      ["mismatched derived owner", { ownerShopId: "20020" }]
    ])("requires exact safe remote ownership for %s", async (_caseName, remoteOverrides) => {
      mocks.api.mockImplementation((options: ApiOptions) => configurationApi(options, "10010", {
        remote: remoteOverrides
      }));
      const store = useShopifyOrderSyncStore();

      await expect(store.loadConfiguration("10010")).rejects.toThrow("remote outside the selected Shopify shop scope");
      expect(store.remote).toBeNull();
    });

    it("accepts a canonical-link-owned remote without legacy internal ownership fields", async () => {
      mocks.api.mockImplementation((options: ApiOptions) => configurationApi(options, "10010", {
        remote: { ownerShopId: "10010", internalId: undefined, internalIdType: undefined }
      }));
      const store = useShopifyOrderSyncStore();

      await expect(store.loadConfiguration("10010")).resolves.toEqual(expect.objectContaining({
        remote: expect.objectContaining({ ownerShopId: "10010", internalId: "", internalIdType: "" })
      }));
      expect(store.remote?.ownerShopId).toBe("10010");
    });

    it.each([
      ["type mapping", "", "type"],
      ["type mapping", "20020", "type"],
      ["shipment mapping", "", "shipment"],
      ["shipment mapping", "20020", "shipment"]
    ])("rejects a %s row with returned shopId %s", async (_label, returnedShopId, family) => {
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/job") return ok(orderSyncEnvelope("10010"));
        if (options.url === "oms/shopifyShops/typeMappings") {
          return ok({
            typeMappings: family === "type" && options.params?.mappedTypeId === "SHOPIFY_ORDER_SOURCE"
              ? [{ shopId: returnedShopId, mappedTypeId: "SHOPIFY_ORDER_SOURCE", shopifyValue: "web", mappedValue: "WEB_SALES_CHANNEL" }]
              : []
          });
        }
        if (options.url === "oms/shopifyShops/carrierShipments") {
          return ok({
            carrierShipments: family === "shipment"
              ? [{ shopId: returnedShopId, shopifyShippingMethod: "Standard", carrierPartyId: "UPS", shipmentMethodTypeId: "GROUND" }]
              : []
          });
        }
        throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
      });
      const store = useShopifyOrderSyncStore();

      await expect(store.loadConfiguration("10010")).rejects.toThrow(/selected Shopify shop scope/);
      expect(store.salesChannelMappings).toEqual([]);
      expect(store.shippingMethodMappings).toEqual([]);
    });

    it("projects allowlisted shop and remote fields without retaining connector secrets", async () => {
      mocks.api.mockImplementation((options: ApiOptions) => configurationApi(options, "10010", {
        shop: {
          shopifyShopId: "gid://shopify/Shop/10010",
          myshopifyDomain: "https://demo.myshopify.com/path",
          productStoreId: "STORE_1",
          isEnabled: "Y",
          accessToken: "shop-secret-token",
          sharedSecret: "shop-shared-secret"
        },
        productStore: {
          name: "Demo Store",
          secretNote: "store-secret-note"
        },
        remote: {
          password: "remote-password",
          privateKey: "remote-private-key",
          accessToken: "remote-access-token",
          receivePassword: "remote-receive-password",
          sendUrl: "https://secret-bearing.example"
        }
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadConfiguration("10010");

      expect(Object.keys(store.shop || {}).sort()).toEqual([
        "isEnabled",
        "myshopifyDomain",
        "name",
        "productStoreId",
        "productStoreName",
        "shopId",
        "shopifyShopId"
      ]);
      expect(store.shop?.myshopifyDomain).toBe("demo.myshopify.com");
      expect(store.runtimeTimeZone).toBe("Asia/Kolkata");
      expect(store.shop?.productStoreName).toBe("Demo Store");
      expect(store.productStore).toEqual({ productStoreId: "STORE_1", name: "Demo Store" });
      expect(Object.keys(store.remote || {}).sort()).toEqual([
        "accessScopeEnumId",
        "description",
        "internalId",
        "internalIdType",
        "ownerShopId",
        "remoteId",
        "remoteIdType",
        "systemMessageRemoteId"
      ]);

      const retainedState = JSON.stringify(store.$state);
      for (const secret of [
        "shop-secret-token",
        "shop-shared-secret",
        "remote-password",
        "remote-private-key",
        "remote-access-token",
        "remote-receive-password",
        "secret-bearing.example",
        "store-secret-note"
      ]) {
        expect(retainedState).not.toContain(secret);
      }

      const urls = mocks.api.mock.calls.map(([options]) => (options as ApiOptions).url);
      expect(urls).toContain("shopify/order-sync/10010/job");
      for (const forbiddenUrl of [
        "oms/shopifyShops/shops",
        "oms/systemMessageRemotes",
        "admin/productStores",
        "admin/serviceJobs"
      ]) expect(urls).not.toContain(forbiddenUrl);
    });

    it("ignores a late response from a previously selected shop", async () => {
      const oldShopResponse = deferred<any>();
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/old-shop/job") {
          return oldShopResponse.promise;
        }
        return configurationApi(options, "new-shop", {
          shop: { name: "New shop" },
          job: rawOrderSyncJob("new-shop")
        });
      });

      const store = useShopifyOrderSyncStore();
      const staleLoad = store.loadConfiguration("old-shop");
      await store.loadConfiguration("new-shop");

      oldShopResponse.resolve({ data: orderSyncEnvelope("old-shop", {
        shop: { name: "Old shop" },
        job: rawOrderSyncJob("old-shop")
      }) });
      await expect(staleLoad).resolves.toBeNull();

      expect(store.selectedShopId).toBe("new-shop");
      expect(store.shop?.name).toBe("New shop");
      expect(store.remote?.systemMessageRemoteId).toBe("REMOTE_new-shop");
      expect(store.job?.jobName).toBe("queue_ShopifyOrderSync_new-shop");
      expect(store.configurationState.kind).toBe("configured-paused");
    });

    it("does not let a stale card failure overwrite the newly selected shop", async () => {
      const oldContext = deferred<any>();
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/old-shop/job") return oldContext.promise;
        if (options.url === "shopify/order-sync/new-shop/job") return ok(orderSyncEnvelope("new-shop"));
        if (options.url === "admin/systemMessages") return ok({ systemMessages: [] });
        if (options.url === "shopify/order-sync/new-shop/audits") return ok({ orderSyncAudits: [] });
        throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
      });

      const store = useShopifyOrderSyncStore();
      const staleLoad = store.loadCardSnapshot("old-shop");
      await store.loadCardSnapshot("new-shop");
      oldContext.reject(new Error("old shop transport failure"));

      await expect(staleLoad).resolves.toEqual(expect.objectContaining({ shopId: "new-shop", error: null, actionable: true }));
      expect(store.selectedShopId).toBe("new-shop");
      expect(store.cardSnapshot).toEqual(expect.objectContaining({ shopId: "new-shop", error: null }));
      expect(store.cardError).toBeNull();
    });
  });

  describe("selected-shop monitoring correlation", () => {
    it.each([
      ["missing message type", { systemMessageTypeId: undefined }, "unexpected message type"],
      ["wrong message type", { systemMessageTypeId: "OtherMessage" }, "unexpected message type"],
      ["missing remote", { systemMessageRemoteId: undefined }, "selected Shopify remote scope"],
      ["wrong remote", { systemMessageRemoteId: "REMOTE_20020" }, "selected Shopify remote scope"]
    ])("rejects a SystemMessage with %s", async (_label, overrides, expectedMessage) => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [standardBatch("batch-1", "SmsgSent", "2026-07-22T12:00:00Z", overrides)],
        imports: []
      }));
      const store = useShopifyOrderSyncStore();

      await expect(store.loadMonitoring("10010")).rejects.toThrow(expectedMessage);
      expect(store.batches).toEqual([]);
    });

    it.each([0, 1, 2])(
      "correlates %i MDM import(s) into exactly two progress rows",
      async (expectedLogCount) => {
        const createLog = {
          logId: "create-log",
          configId: "SYNC_SHOPIFY_ORDER",
          systemMessageId: "batch-1",
          systemMessageTypeId: "ShopifyOrderSync",
          systemMessageRemoteId: "REMOTE_10010",
          logStatusId: "DmlsFinished",
          totalRecordCount: 3,
          failedRecordCount: 0
        };
        const updateLog = {
          logId: "update-log",
          configId: "UPDATE_SHOPIFY_ORDER",
          systemMessageId: "batch-1",
          systemMessageTypeId: "ShopifyOrderSync",
          systemMessageRemoteId: "REMOTE_10010",
          logStatusId: "DmlsFinished",
          totalRecordCount: 2,
          failedRecordCount: 0
        };

        mocks.api.mockImplementation((options: ApiOptions) => {
          if (options.url === "shopify/order-sync/10010/job") {
            return ok(orderSyncEnvelope("10010", { shop: { name: "Selected shop" } }));
          }
          if (options.url === "oms/dataDocumentView") {
            if (options.data?.customParametersMap?.logId) {
              return ok({ entityValueList: [createLog] });
            }
            if (options.data?.customParametersMap?.systemMessageId) {
              return ok({
                entityValueList: expectedLogCount
                  ? [createLog, updateLog].slice(0, expectedLogCount)
                  : [{
                    systemMessageId: "batch-1",
                    systemMessageTypeId: "ShopifyOrderSync",
                    systemMessageRemoteId: "REMOTE_10010",
                    configId: "",
                    logId: ""
                  }]
              });
            }
            return ok({ entityValueList: [], entityValueListCount: 0 });
          }
          if (options.url === "admin/systemMessages") {
            return ok({
              systemMessages: [{
                systemMessageId: "batch-1",
                systemMessageTypeId: "ShopifyOrderSync",
                systemMessageRemoteId: "REMOTE_10010",
                statusId: "SmsgSent",
                messageDate: "2026-07-22T11:45:00Z",
                initDate: "2026-07-22T12:00:00Z"
              }]
            });
          }
          if (options.url === "shopify/order-sync/10010/audits") {
            return ok({
              orderSyncAudits: [safeAuditProjection()]
            });
          }
          if (options.url === "shopify/order-sync/10010/errors") return ok({ orderSyncErrors: [], orderSyncRequestErrors: [] });
          throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
        });

        const store = useShopifyOrderSyncStore();
        await store.loadMonitoring("10010");

        expect(store.batches.map(({ systemMessageId }) => systemMessageId)).toEqual(["batch-1"]);
        const durableLogCount = Math.max(1, expectedLogCount);
        expect(store.importsBySystemMessageId["batch-1"]).toHaveLength(durableLogCount);
        expect(store.recentOrders).toEqual([
          expect.objectContaining({
            id: "audit-1",
            shopId: "10010",
            shopifyOrderId: "123456",
            orderName: "HC#2690",
            outcome: "Created",
            shopifyFetchVerified: true
          })
        ]);
        expect(store.summary.progressRows).toHaveLength(2);
        expect(store.summary.progressRows[1].logCount).toBe(durableLogCount);
        expect(store.summary.overallStatus).toBe("completed");
        expect(store.summary.processedOrderCount).toBe(expectedLogCount === 2 ? 5 : 3);
        expect(store.cardSnapshot).toEqual(expect.objectContaining({
          actionable: true,
          lastCompletedLabel: "2026-07-22T12:00:00Z"
        }));

        const batchRequest = mocks.api.mock.calls
          .map(([options]) => options as ApiOptions)
          .find(({ url }) => url === "admin/systemMessages");
        expect(batchRequest).toEqual(expect.objectContaining({
          method: "get",
          params: expect.objectContaining({
            systemMessageTypeId: "ShopifyOrderSync",
            systemMessageRemoteId: "REMOTE_10010",
            pageSize: 100
          })
        }));
        const dataDocumentRequests = mocks.api.mock.calls
          .map(([options]) => options as ApiOptions)
          .filter(({ url }) => url === "oms/dataDocumentView");
        const summaryImportRequest = dataDocumentRequests.find(({ data }) => Boolean(data?.customParametersMap?.systemMessageId));
        expect(summaryImportRequest).toEqual(expect.objectContaining({
          method: "post",
          data: expect.objectContaining({
            dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
            customParametersMap: expect.objectContaining({
              systemMessageId: ["batch-1"],
              systemMessageTypeId: "ShopifyOrderSync",
              systemMessageRemoteId: "REMOTE_10010",
              configId: ["SYNC_SHOPIFY_ORDER", "UPDATE_SHOPIFY_ORDER"]
            }),
            pageSize: 3,
            pageIndex: 0
          })
        }));
        expect(summaryImportRequest?.data?.fieldsToSelect).toBe(
          "systemMessageId,systemMessageTypeId,systemMessageRemoteId,logId,logStatusId,totalRecordCount,failedRecordCount,configId"
        );
        const auditImportRequest = dataDocumentRequests.find(({ data }) => Boolean(data?.customParametersMap?.logId));
        expect(auditImportRequest?.data).toEqual(expect.objectContaining({
          customParametersMap: expect.objectContaining({ logId: ["create-log"] }),
          pageSize: 2,
          pageIndex: 0,
        }));
        expect(dataDocumentRequests).toHaveLength(2);
        expect(mocks.api.mock.calls
          .map(([options]) => options as ApiOptions)
          .find(({ url }) => url === "shopify/order-sync/10010/errors"))
          .toEqual({
            url: "shopify/order-sync/10010/errors",
            method: "get",
            params: { pageSize: 100 }
          });
        const correlatedImportRequests = mocks.api.mock.calls
          .map(([options]) => options as ApiOptions)
          .filter(({ url, params }) => url === "admin/dataManager/details" && params?.systemMessageId);
        expect(correlatedImportRequests).toHaveLength(0);
      }
    );

    it("preserves explicit synthetic provenance from the exact bounded audit projection", async () => {
      const audits = [safeAuditProjection({
        auditId: "audit-synthetic",
        shopifyOrderId: "999000111",
        shopifyOrderName: "#SYNTHETIC",
        outcome: "Updated",
        shopifyFetchVerified: false
      })];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [standardBatch("batch-1", "SmsgSent", "2026-07-22T12:00:00Z", { messageDate: undefined })],
        imports: [],
        auditImports: [summaryImport("batch-1", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 1, 0, { logId: "create-log" })],
        audits
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.recentOrders).toEqual([
        expect.objectContaining({
          id: "audit-synthetic",
          shopifyOrderId: "999000111",
          orderName: "#SYNTHETIC",
          logId: "create-log",
          configId: "SYNC_SHOPIFY_ORDER",
          outcome: "Updated",
          shopifyFetchVerified: false
        })
      ]);
      const request = mocks.api.mock.calls
        .map(([options]) => options as ApiOptions)
        .find(({ url }) => url === "shopify/order-sync/10010/audits");
      expect(request).toEqual({
        url: "shopify/order-sync/10010/audits",
        method: "get",
        params: { pageSize: 100 }
      });
    });

    it.each([
      ["an extra row field", [safeAuditProjection({ rawPayload: "unsafe" })], "fields outside the safe contract"],
      ["a missing provenance flag", [(() => {
        const row: Record<string, unknown> = safeAuditProjection();
        delete row.shopifyFetchVerified;
        return row;
      })()], "fields outside the safe contract"],
      ["a non-boolean provenance flag", [safeAuditProjection({ shopifyFetchVerified: "Y" })], "fetch provenance flag"],
      ["an unsafe Shopify order ID", [safeAuditProjection({ shopifyOrderId: "gid://shopify/Order/123" })], "invalid Shopify order ID"]
    ])("rejects an audit projection containing %s", async (_label, audits, expectedMessage) => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        audits
      }));

      const store = useShopifyOrderSyncStore();
      await expect(store.loadMonitoring("10010")).rejects.toThrow(expectedMessage);
      expect(store.recentOrders).toEqual([]);
    });

    it("rejects audit envelopes with extra top-level fields and responses over 100 rows", async () => {
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/audits") {
          return ok({ orderSyncAudits: [], rawAuditRows: [] });
        }
        return monitoringApi(options, { batches: [], imports: [] });
      });
      const extraEnvelopeStore = useShopifyOrderSyncStore();
      await expect(extraEnvelopeStore.loadMonitoring("10010")).rejects.toThrow("invalid response shape");

      setActivePinia(createPinia());
      const oversized = Array.from({ length: 101 }, (_, index) => safeAuditProjection({
        auditId: `audit-${index}`,
        shopifyOrderId: String(100000 + index)
      }));
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        audits: oversized
      }));
      const oversizedStore = useShopifyOrderSyncStore();
      await expect(oversizedStore.loadMonitoring("10010")).rejects.toThrow("exceeded the 100-row contract");
    });

    it.each([
      ["Pending", null, null, "N", true],
      ["Running", "2026-07-22T13:00:00Z", null, "N", true],
      ["Completed", "2026-07-22T12:00:00Z", "2026-07-22T12:01:00Z", "N", false],
      ["Failed", "2026-07-22T12:00:00Z", "2026-07-22T12:01:00Z", "Y", false]
    ])("treats exact %s ServiceJobRun state correctly before a SystemMessage exists", async (
      lastRunStatusId,
      startTime,
      endTime,
      hasError,
      expectedActive
    ) => {
      mocks.permissions.push("COMMON_ADMIN");
      const job = rawOrderSyncJob("10010", {
        paused: false,
        lastRunStatusId,
        latestJobRun: {
          jobRunId: `run-${String(lastRunStatusId).toLocaleLowerCase()}`,
          startTime,
          endTime,
          hasError
        }
      });
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        job
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.summary.hasActiveWork).toBe(expectedActive);
      expect(store.summary.pendingBatchRequests).toBe(expectedActive ? 1 : 0);
      expect(store.summary.activeWorkJobRunId).toBe(expectedActive
        ? `run-${String(lastRunStatusId).toLocaleLowerCase()}`
        : "");
      expect(store.summary.activeWorkSystemMessageId).toBe("");
      expect(store.canRunNow).toBe(!expectedActive);
      expect(store.job).not.toHaveProperty("latestJobRun");
      expect(store.job?.latestJobRunId).toBe(`run-${String(lastRunStatusId).toLocaleLowerCase()}`);
      if (expectedActive) {
        expect(store.runNowDisabledReason).toBe(
          `ServiceJobRun run-${String(lastRunStatusId).toLocaleLowerCase()} is still active.`
        );
        mocks.api.mockClear();
        await expect(store.runNow()).rejects.toThrow("ServiceJobRun");
        expect(mocks.api).not.toHaveBeenCalled();
      }
    });

    it("accepts a newly queued ServiceJobRun when nullable timestamps are omitted by REST serialization", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        job: rawOrderSyncJob("10010", {
          paused: false,
          lastRunStatusId: "Running",
          latestJobRun: { jobRunId: "M2399182", startTime: "2026-07-22T15:41:15.499Z" }
        })
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.summary.activeWorkJobRunId).toBe("M2399182");
      expect(store.canRunNow).toBe(false);
    });

    it("keeps an active import as the overall batch state and uses the older terminal batch for last-completed metrics", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const batches = [
        standardBatch("batch-active", "SmsgSent", "2026-07-22T13:00:00Z"),
        standardBatch("batch-completed", "SmsgSent", "2026-07-22T12:00:00Z")
      ];
      const imports = [
        summaryImport("batch-active", "SYNC_SHOPIFY_ORDER", "DmlsRunning", 4, 0),
        summaryImport("batch-completed", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 3, 0)
      ];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches,
        imports,
        job: rawOrderSyncJob("10010", {
          paused: false,
          lastRunStatusId: "Running",
          latestJobRun: {
            jobRunId: "run-with-system-message",
            startTime: "2026-07-22T12:59:00Z",
            endTime: null,
            hasError: "N"
          }
        })
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.summary).toEqual(expect.objectContaining({
        overallStatus: "active",
        latestBatch: expect.objectContaining({ systemMessageId: "batch-active" }),
        latestCompletedBatch: expect.objectContaining({ systemMessageId: "batch-completed" }),
        lastCompletedAt: "2026-07-22T12:00:00Z",
        processedOrderCount: 3,
        pendingBatchRequests: 1,
        hasActiveWork: true,
        activeWorkSystemMessageId: "batch-active",
        activeWorkJobRunId: "",
        importStatus: "active"
      }));
      expect(store.summary.progressRows).toHaveLength(2);
      expect(store.runNowDisabledReason).toBe("SystemMessage batch-active is still active.");
      expect(store.summary.progressRows[1]).toEqual(expect.objectContaining({
        state: "active",
        stateLabel: "In progress",
        logCount: 1
      }));
      expect(store.cardSnapshot).toEqual(expect.objectContaining({
        processedCount: 3,
        pendingCount: 1,
        lastCompletedLabel: "2026-07-22T12:00:00Z",
        batchDetail: "batch-active",
        importStatus: "In progress"
      }));

      const summaryRequests = mocks.api.mock.calls
        .map(([options]) => options as ApiOptions)
        .filter(({ url, data }) => url === "oms/dataDocumentView" && Boolean(data?.customParametersMap?.systemMessageId));
      expect(summaryRequests).toHaveLength(1);
      expect(summaryRequests[0].data).toEqual(expect.objectContaining({
        pageSize: 5,
        customParametersMap: expect.objectContaining({
          systemMessageId: ["batch-active", "batch-completed"]
        })
      }));
      expect(mocks.api.mock.calls
        .map(([options]) => options as ApiOptions)
        .filter(({ url, params }) => url === "admin/dataManager/details" && params?.systemMessageId)).toHaveLength(0);
    });

    it.each([
      ["SYNC_SHOPIFY_ORDER", "UPDATE_SHOPIFY_ORDER"],
      ["UPDATE_SHOPIFY_ORDER", "SYNC_SHOPIFY_ORDER"]
    ] as const)(
      "derives Partially completed when %s succeeds and %s fails",
      async (successfulConfigId, failedConfigId) => {
        const batches = [standardBatch("batch-mixed", "SmsgSent", "2026-07-22T13:00:00Z")];
        const imports = [
          summaryImport("batch-mixed", successfulConfigId, "DmlsFinished", 2, 0),
          summaryImport("batch-mixed", failedConfigId, "DmlsFailed", 1, 1)
        ];
        mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, { batches, imports }));

        const store = useShopifyOrderSyncStore();
        await store.loadMonitoring("10010");

        expect(store.summary).toEqual(expect.objectContaining({
          overallStatus: "partial",
          latestCompletedBatch: expect.objectContaining({ systemMessageId: "batch-mixed" }),
          processedOrderCount: 2,
          pendingBatchRequests: 0,
          hasActiveWork: false,
          importStatus: "partial"
        }));
        expect(store.summary.progressRows).toHaveLength(2);
        expect(store.summary.progressRows[1]).toEqual(expect.objectContaining({
          state: "partial",
          stateLabel: "Partially completed · 2 processed · 1 failed",
          successfulRecords: 2,
          failedRecords: 1,
          logCount: 2
        }));
      }
    );

    it("does not mark failed-plus-queued imports complete until the queued import reaches a terminal state", async () => {
      const batches = [
        standardBatch("batch-still-active", "SmsgSent", "2026-07-22T13:00:00Z"),
        standardBatch("batch-previous", "SmsgSent", "2026-07-22T12:00:00Z")
      ];
      const imports = [
        summaryImport("batch-still-active", "SYNC_SHOPIFY_ORDER", "DmlsFailed", 1, 1),
        summaryImport("batch-still-active", "UPDATE_SHOPIFY_ORDER", "DmlsQueued", 0, 0),
        summaryImport("batch-previous", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 5, 0)
      ];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, { batches, imports }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.summary).toEqual(expect.objectContaining({
        overallStatus: "active",
        latestCompletedBatch: expect.objectContaining({ systemMessageId: "batch-previous" }),
        processedOrderCount: 5,
        pendingBatchRequests: 1,
        hasActiveWork: true
      }));
      expect(store.summary.progressRows[1]).toEqual(expect.objectContaining({
        state: "active",
        stateLabel: "In progress",
        logCount: 2
      }));
    });

    it("keeps a terminal failed batch out of last-completed metrics", async () => {
      const batches = [
        standardBatch("batch-crashed", "SmsgSent", "2026-07-22T13:00:00Z"),
        standardBatch("batch-previous", "SmsgSent", "2026-07-22T12:00:00Z")
      ];
      const imports = [
        summaryImport("batch-crashed", "SYNC_SHOPIFY_ORDER", "DmlsCrashed", 0, 0),
        summaryImport("batch-previous", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 6, 0)
      ];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, { batches, imports }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.summary).toEqual(expect.objectContaining({
        overallStatus: "failed",
        latestBatch: expect.objectContaining({ systemMessageId: "batch-crashed" }),
        latestCompletedBatch: expect.objectContaining({ systemMessageId: "batch-previous" }),
        processedOrderCount: 6,
        pendingBatchRequests: 0,
        hasActiveWork: false,
        importStatus: "failed"
      }));
    });

    it.each([
      ["missing", undefined],
      ["mismatched", "REMOTE_20020"]
    ])("rejects a grouped import row with a %s canonical remote correlation", async (_label, systemMessageRemoteId) => {
      const batches = [standardBatch("batch-1", "SmsgSent", "2026-07-22T13:00:00Z")];
      const imports = [summaryImport("batch-1", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 1, 0, {
        systemMessageRemoteId
      })];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, { batches, imports }));

      const store = useShopifyOrderSyncStore();
      await expect(store.loadMonitoring("10010")).rejects.toThrow(
        "DataManager response crossed the selected Shopify remote scope."
      );
      expect(store.summary.latestBatch).toBeNull();
    });

    it("loads canonical-link-only batch imports without legacy remote fields", async () => {
      const batches = [standardBatch("batch-link-only", "SmsgSent", "2026-07-22T13:00:00Z")];
      const imports = [summaryImport("batch-link-only", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 2, 0)];
      expect(imports[0]).not.toHaveProperty("remoteInternalId");
      expect(imports[0]).not.toHaveProperty("remoteInternalIdType");
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches,
        imports,
        remote: {
          ownerShopId: "10010",
          internalId: undefined,
          internalIdType: undefined
        }
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.remote).toEqual(expect.objectContaining({
        systemMessageRemoteId: "REMOTE_10010",
        ownerShopId: "10010",
        internalId: "",
        internalIdType: ""
      }));
      expect(store.importsBySystemMessageId["batch-link-only"]).toEqual([
        expect.objectContaining({
          systemMessageId: "batch-link-only",
          configId: "SYNC_SHOPIFY_ORDER",
          totalRecordCount: 2
        })
      ]);

      const request = mocks.api.mock.calls
        .map(([options]) => options as ApiOptions)
        .find(({ url, data }) => url === "oms/dataDocumentView" && Boolean(data?.customParametersMap?.systemMessageId));
      expect(request?.data?.customParametersMap).toEqual(expect.objectContaining({
        systemMessageRemoteId: "REMOTE_10010"
      }));
      expect(request?.data?.customParametersMap).not.toHaveProperty("remoteInternalId");
      expect(request?.data?.customParametersMap).not.toHaveProperty("remoteInternalIdType");
    });

    it("derives card and monitoring metrics from the same grouped batch snapshot", async () => {
      const batches = [standardBatch("batch-parity", "SmsgSent", "2026-07-22T13:00:00Z")];
      const imports = [
        summaryImport("batch-parity", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 2, 0),
        summaryImport("batch-parity", "UPDATE_SHOPIFY_ORDER", "DmlsFinished", 2, 0)
      ];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, { batches, imports }));

      const store = useShopifyOrderSyncStore();
      const card = await store.loadCardSnapshot("10010");
      const monitoring = await store.loadMonitoring("10010");

      expect(card).toEqual(expect.objectContaining({
        processedCount: 4,
        pendingCount: 0,
        lastCompletedLabel: "2026-07-22T13:00:00Z"
      }));
      expect(monitoring?.summary).toEqual(expect.objectContaining({
        processedOrderCount: card.processedCount,
        pendingBatchRequests: card.pendingCount,
        lastCompletedAt: card.lastCompletedLabel,
        overallStatus: "completed"
      }));
      expect(store.cardSnapshot).toEqual(expect.objectContaining({
        processedCount: monitoring?.summary.processedOrderCount,
        pendingCount: monitoring?.summary.pendingBatchRequests,
        lastCompletedLabel: monitoring?.summary.lastCompletedAt
      }));
    });

    it("excludes standalone retry SystemMessages from batch history and overlap state", async () => {
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/job") {
          return ok(orderSyncEnvelope("10010", {
            job: rawOrderSyncJob("10010", { paused: false })
          }));
        }
        if (options.url === "oms/dataDocumentView") return ok({ entityValueList: [], entityValueListCount: 0 });
        if (options.url === "shopify/order-sync/10010/audits") return ok({ orderSyncAudits: [] });
        if (options.url === "shopify/order-sync/10010/errors") return ok({ orderSyncErrors: [], orderSyncRequestErrors: [] });
        if (options.url === "admin/systemMessages") {
          return ok({
            systemMessages: [
              {
                systemMessageId: "standalone-retry",
                messageId: "11111111-1111-4111-8111-111111111111",
                systemMessageTypeId: "ShopifyOrderSync",
                systemMessageRemoteId: "REMOTE_10010",
                statusId: "SmsgReceived",
                initDate: "2026-07-22T12:05:00Z"
              },
              {
                systemMessageId: "standard-batch",
                messageId: "",
                messageDate: "2026-07-22T11:45:00Z",
                systemMessageTypeId: "ShopifyOrderSync",
                systemMessageRemoteId: "REMOTE_10010",
                statusId: "SmsgSent",
                initDate: "2026-07-22T12:00:00Z"
              }
            ]
          });
        }
        if (options.url === "admin/dataManager/details") return ok({ dataManagerLogs: [] });
        throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
      });

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.batches.map(({ systemMessageId, messageId, messageDate }) => ({ systemMessageId, messageId, messageDate }))).toEqual([{
        systemMessageId: "standard-batch",
        messageId: "",
        messageDate: "2026-07-22T11:45:00Z"
      }]);
      expect(store.summary.hasActiveWork).toBe(false);
      expect(store.summary.pendingBatchRequests).toBe(0);
      expect(store.summary.activeWorkSystemMessageId).toBe("");
      expect(mocks.api.mock.calls
        .map(([options]) => options as ApiOptions)
        .filter(({ url }) => url === "admin/dataManager/details")
        .every(({ params }) => params?.systemMessageId === "standard-batch")).toBe(true);
    });

    it("loads only the exact bounded safe-error envelope and never calls a raw content API", async () => {
      const errors = [
        safeErrorProjection(),
        safeErrorProjection({
          errorId: "update-log:0",
          shopifyOrderId: "654321",
          orderName: "#1000",
          errorText: "Error details could not be safely read.",
          occurredAt: "2026-07-22T11:00:00Z",
          configId: "UPDATE_SHOPIFY_ORDER",
          logId: "update-log",
          systemMessageId: "older-batch",
          batchId: "older-run",
          retryable: false
        })
      ];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        errors
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.recentErrors).toEqual([
        expect.objectContaining({
          shopId: "10010",
          shopifyOrderId: "123456",
          orderName: "#1001",
          errorText: "Shopify order import failed.",
          occurredAt: "2026-07-22T12:00:00Z",
          occurredAtMillis: Date.parse("2026-07-22T12:00:00Z"),
          configId: "SYNC_SHOPIFY_ORDER",
          logId: "failed-log",
          systemMessageId: "failed-batch",
          batchId: "failed-run",
          retryable: true
        }),
        expect.objectContaining({
          shopifyOrderId: "654321",
          configId: "UPDATE_SHOPIFY_ORDER",
          occurredAt: "2026-07-22T11:00:00Z",
          occurredAtMillis: Date.parse("2026-07-22T11:00:00Z"),
          retryable: false
        })
      ]);
      const requests = mocks.api.mock.calls.map(([options]) => options as ApiOptions);
      expect(requests.filter(({ url }) => url === "shopify/order-sync/10010/errors")).toEqual([{
        url: "shopify/order-sync/10010/errors",
        method: "get",
        params: { pageSize: 100 }
      }]);
      expect(requests.some(({ url }) => [
        "admin/dataManager/details",
        "admin/dataManager/downloadDataManagerFile"
      ].includes(url))).toBe(false);
      expect(JSON.stringify(store.$state)).not.toContain("contentLocation");
      expect(JSON.stringify(store.$state)).not.toContain("errorLogContentId");
    });

    it("accepts a fixed pre-import failure without inventing a DataManager log", async () => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        requestErrors: [safePreImportErrorProjection()]
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.recentRequestErrors).toEqual([
        expect.objectContaining({
          errorText: "Shopify order request failed before import.",
          logId: "",
          configId: "",
          systemMessageId: "M221664",
          retryable: false
        })
      ]);
    });

    it("keeps independently capped import and pre-import request failures in separate state", async () => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        errors: [safeErrorProjection()],
        requestErrors: [safePreImportErrorProjection()],
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.recentErrors).toHaveLength(1);
      expect(store.recentErrors[0]).toEqual(expect.objectContaining({ logId: "failed-log", configId: "SYNC_SHOPIFY_ORDER" }));
      expect(store.recentRequestErrors).toHaveLength(1);
      expect(store.recentRequestErrors[0]).toEqual(expect.objectContaining({ logId: "", configId: "", retryable: false }));
    });

    it("retains a safe standalone SystemMessage summary without treating it as a scheduled batch", async () => {
      const standaloneMessage = standardBatch("M228520", "SmsgSent", "2026-07-22T12:00:00Z", {
        messageDate: undefined,
        processedDate: "2026-07-22T12:01:00Z",
        jobRunId: "",
      });
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [standaloneMessage],
        imports: [],
        auditImports: [summaryImport("M228520", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 1, 0, { logId: "M101225" })],
        audits: [safeAuditProjection({
          systemMessageId: "M228520",
          dataManagerLogId: "M101225",
          processedDate: "2026-07-22T12:01:00Z",
        })],
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.systemMessages).toEqual([
        expect.objectContaining({
          systemMessageId: "M228520",
          statusId: "SmsgSent",
          systemMessageTypeId: "ShopifyOrderSync",
          initDate: "2026-07-22T12:00:00Z",
          processedDate: "2026-07-22T12:01:00Z",
        }),
      ]);
      expect(store.batches).toEqual([]);
      expect(store.recentOrders[0]).toEqual(expect.objectContaining({ systemMessageId: "M228520" }));
    });

    it("keeps older shop-scoped audit evidence when its SystemMessage is outside the loaded message window", async () => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        auditImports: [summaryImport("M220000", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 1, 0, { logId: "M100900" })],
        audits: [safeAuditProjection({
          systemMessageId: "M220000",
          dataManagerLogId: "M100900",
          processedDate: "2026-06-01T12:01:00Z",
        })],
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.systemMessages).toEqual([]);
      expect(store.recentOrders).toEqual([
        expect.objectContaining({ systemMessageId: "M220000", logId: "M100900" }),
      ]);
      expect(store.importsBySystemMessageId.M220000).toEqual([
        expect.objectContaining({ logId: "M100900", totalRecordCount: 1, failedRecordCount: 0 }),
      ]);
    });

    it("selects an audit-correlated successful rerun for one config while preserving the other config and immutable error", async () => {
      const batch = standardBatch("M228571", "SmsgSent", "2026-07-22T12:00:00Z");
      const imports = [
        summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsCrashed", 1, 1, { logId: "M101276" }),
        summaryImport("M228571", "UPDATE_SHOPIFY_ORDER", "DmlsFinished", 1, 0, { logId: "M101300" }),
      ];
      const audits = [
        safeAuditProjection({
          auditId: "audit-rerun-2",
          systemMessageId: "M228571",
          dataManagerLogId: "M101327",
          shopifyOrderId: "223456",
          orderId: "HOTWAX-2002",
          processedDate: "2026-07-22T12:05:00Z",
        }),
        safeAuditProjection({
          auditId: "audit-rerun-1",
          systemMessageId: "M228571",
          dataManagerLogId: "M101327",
          shopifyOrderId: "123456",
          orderId: "HOTWAX-2001",
          processedDate: "2026-07-22T12:04:00Z",
        }),
      ];
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [batch],
        imports,
        auditImports: [
          summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 2, 0, { logId: "M101327" }),
        ],
        audits,
        errors: [safeErrorProjection({
          errorId: "M101276:0",
          logId: "M101276",
          systemMessageId: "M228571",
          batchId: "M228571-run",
          occurredAt: "2026-07-22T12:01:00Z",
        })],
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.importsBySystemMessageId.M228571).toEqual([
        expect.objectContaining({
          configId: "SYNC_SHOPIFY_ORDER",
          logId: "M101327",
          statusId: "DmlsFinished",
          totalRecordCount: 2,
          failedRecordCount: 0,
          successRecordCount: 2,
        }),
        expect.objectContaining({
          configId: "UPDATE_SHOPIFY_ORDER",
          logId: "M101300",
        }),
      ]);
      expect(store.summary.overallStatus).toBe("completed");
      expect(store.recentErrors).toEqual([
        expect.objectContaining({ logId: "M101276", systemMessageId: "M228571" }),
      ]);
    });

    it.each([
      ["card", (store: ReturnType<typeof useShopifyOrderSyncStore>) => store.loadCardSnapshot("10010")],
      ["history", (store: ReturnType<typeof useShopifyOrderSyncStore>) => store.loadHistory("10010")],
    ])("uses the same authoritative M228571 rerun evidence in the %s loader", async (_loader, load) => {
      const batch = standardBatch("M228571", "SmsgSent", "2026-07-22T12:00:00Z");
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [batch],
        imports: [
          summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsCrashed", 1, 1, { logId: "M101276" }),
          summaryImport("M228571", "UPDATE_SHOPIFY_ORDER", "DmlsFinished", 1, 0, { logId: "M101300" }),
        ],
        auditImports: [
          summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 2, 0, { logId: "M101327" }),
        ],
        audits: [
          safeAuditProjection({
            auditId: "audit-rerun-2",
            systemMessageId: "M228571",
            dataManagerLogId: "M101327",
            shopifyOrderId: "223456",
            orderId: "HOTWAX-2002",
            processedDate: "2026-07-22T12:05:00Z",
          }),
          safeAuditProjection({
            auditId: "audit-rerun-1",
            systemMessageId: "M228571",
            dataManagerLogId: "M101327",
            processedDate: "2026-07-22T12:04:00Z",
          }),
        ],
      }));

      const store = useShopifyOrderSyncStore();
      await load(store);

      expect(store.importsBySystemMessageId.M228571).toEqual([
        expect.objectContaining({
          logId: "M101327",
          configId: "SYNC_SHOPIFY_ORDER",
          totalRecordCount: 2,
          failedRecordCount: 0,
          successRecordCount: 2,
        }),
        expect.objectContaining({ logId: "M101300", configId: "UPDATE_SHOPIFY_ORDER" }),
      ]);
      expect(store.summary.processedOrderCount).toBe(3);
      expect(store.summary.overallStatus).toBe("completed");
    });

    it("uses authoritative log counts instead of treating a capped audit page as an exact total", async () => {
      const audits = Array.from({ length: 100 }, (_, index) => safeAuditProjection({
        auditId: `audit-capped-${index}`,
        systemMessageId: "M228571",
        dataManagerLogId: "M101327",
        shopifyOrderId: String(900000 - index),
        orderId: `HOTWAX-${index}`,
        processedDate: new Date(Date.parse("2026-07-22T12:05:00Z") - index * 1000).toISOString(),
      }));
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [standardBatch("M228571", "SmsgSent", "2026-07-22T12:00:00Z")],
        imports: [summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsCrashed", 1, 1, { logId: "M101276" })],
        auditImports: [summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 150, 0, { logId: "M101327" })],
        audits,
      }));

      const store = useShopifyOrderSyncStore();
      await store.loadMonitoring("10010");

      expect(store.recentOrders).toHaveLength(100);
      expect(store.importsBySystemMessageId.M228571).toEqual([
        expect.objectContaining({
          logId: "M101327",
          totalRecordCount: 150,
          failedRecordCount: 0,
          successRecordCount: 150,
        }),
      ]);
      expect(store.summary.processedOrderCount).toBe(150);
    });

    it.each([
      ["SystemMessage", { systemMessageId: "M228999" }, "audit SystemMessage correlation"],
      ["remote", { systemMessageRemoteId: "REMOTE_OTHER" }, "selected Shopify remote scope"],
    ])("fails closed when an audit-correlated log crosses the %s scope", async (_scope, importOverrides, expected) => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [standardBatch("M228571", "SmsgSent", "2026-07-22T12:00:00Z")],
        imports: [summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsCrashed", 1, 1, { logId: "M101276" })],
        auditImports: [summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 2, 0, {
          logId: "M101327",
          ...importOverrides,
        })],
        audits: [safeAuditProjection({ systemMessageId: "M228571", dataManagerLogId: "M101327" })],
      }));

      const store = useShopifyOrderSyncStore();
      await expect(store.loadMonitoring("10010")).rejects.toThrow(expected);
      expect(store.importsBySystemMessageId).toEqual({});
    });

    it("fails closed when an exact audit-log lookup returns duplicate rows", async () => {
      const authoritative = summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsFinished", 2, 0, { logId: "M101327" });
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [standardBatch("M228571", "SmsgSent", "2026-07-22T12:00:00Z")],
        imports: [summaryImport("M228571", "SYNC_SHOPIFY_ORDER", "DmlsCrashed", 1, 1, { logId: "M101276" })],
        auditImports: [authoritative, { ...authoritative }],
        audits: [safeAuditProjection({ systemMessageId: "M228571", dataManagerLogId: "M101327" })],
      }));

      const store = useShopifyOrderSyncStore();
      await expect(store.loadMonitoring("10010")).rejects.toThrow("duplicate rows");
      expect(store.importsBySystemMessageId).toEqual({});
    });

    it.each([
      ["extra request-error field", safePreImportErrorProjection({ rawMessage: "private" })],
      ["import-shaped row in the request list", safeErrorProjection()],
    ])("rejects a request-error row with %s", async (_caseName, requestError) => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        requestErrors: [requestError],
      }));
      const store = useShopifyOrderSyncStore();

      await expect(store.loadMonitoring("10010")).rejects.toThrow(/Order Sync error projection/);
      expect(store.recentRequestErrors).toEqual([]);
      expect(store.recentErrors).toEqual([]);
    });

    it.each([
      ["extra errorCode", [safeErrorProjection({ errorCode: "IMPORT_RECORD_REJECTED" })]],
      ["raw payload", [safeErrorProjection({ payload: { email: "customer@example.com" } })]],
      ["content identifier", [safeErrorProjection({ errorLogContentId: "raw-content" })]],
      ["storage path", [safeErrorProjection({ contentLocation: "runtime://private/order.json" })]],
      ["cross-shop row", [safeErrorProjection({ shopId: "another-shop" })]],
      ["unknown config", [safeErrorProjection({ configId: "UNSAFE_CONFIG" })]],
      ["broken log correlation", [safeErrorProjection({ errorId: "another-log:0" })]],
      ["missing DataManager correlation", [safeErrorProjection({ logId: "", configId: "" })]],
      ["spoofed pre-import correlation", [safePreImportErrorProjection({ errorId: "another-message:system-message" })]],
      ["retryable pre-import failure", [safePreImportErrorProjection({ retryable: true })]],
      ["invalid SystemMessage correlation", [safeErrorProjection({ systemMessageId: "../../private" })]],
      ["inconsistent retry flag", [safeErrorProjection({ shopifyOrderId: "", retryable: true })]],
      ["secret-shaped error text", [safeErrorProjection({ errorText: "Authorization: Bearer private-token" })]],
      ["oversized error text", [safeErrorProjection({ errorText: "x".repeat(501) })]],
      ["invalid occurredAt", [safeErrorProjection({ occurredAt: "not-a-date" })]],
      ["non-positive occurredAt", [safeErrorProjection({ occurredAt: -1 })]],
      ["unsorted rows", [
        safeErrorProjection({ occurredAt: "2026-07-22T11:00:00Z" }),
        safeErrorProjection({ errorId: "next-log:0", logId: "next-log", occurredAt: "2026-07-22T12:00:00Z" })
      ]],
      ["duplicate error ID", [
        safeErrorProjection(),
        safeErrorProjection({ occurredAt: "2026-07-22T11:00:00Z" })
      ]]
    ])("rejects an adversarial %s projection without retaining rows", async (_caseName, errors) => {
      mocks.api.mockImplementation((options: ApiOptions) => monitoringApi(options, {
        batches: [],
        imports: [],
        errors: errors as Record<string, unknown>[]
      }));
      const store = useShopifyOrderSyncStore();

      await expect(store.loadMonitoring("10010")).rejects.toThrow(/Order Sync error projection/);
      expect(store.recentErrors).toEqual([]);
    });

    it.each([
      ["wrong envelope", { errors: [] }],
      ["missing request-error list", { orderSyncErrors: [] }],
      ["extra envelope field", { orderSyncErrors: [], orderSyncRequestErrors: [], rawRecords: [] }],
      ["over 100 import rows", { orderSyncErrors: Array.from({ length: 101 }, (_, index) => safeErrorProjection({ errorId: `log-${index}:0`, logId: `log-${index}` })), orderSyncRequestErrors: [] }],
      ["over 100 request rows", { orderSyncErrors: [], orderSyncRequestErrors: Array.from({ length: 101 }, (_, index) => safePreImportErrorProjection({ errorId: `M${index}:system-message`, systemMessageId: `M${index}` })) }]
    ])("rejects %s", async (_caseName, errorEnvelope) => {
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/errors") return ok(errorEnvelope);
        return monitoringApi(options, { batches: [], imports: [] });
      });
      const store = useShopifyOrderSyncStore();

      await expect(store.loadMonitoring("10010")).rejects.toThrow(/Order Sync error projection/);
      expect(store.recentErrors).toEqual([]);
    });

    it("keeps the last successful monitoring rows visible when refresh fails", async () => {
      mocks.api.mockRejectedValue(new Error("private network trace"));
      const store = useShopifyOrderSyncStore();
      const staleBatch = {
        systemMessageId: "stale-batch",
        systemMessageTypeId: "ShopifyOrderSync",
        systemMessageRemoteId: "REMOTE_10010",
        statusId: "SmsgSent",
        messageId: "",
        messageDate: "2026-07-22T10:45:00Z",
        createdByJobRunId: "run-1",
        initDate: "2026-07-22T11:00:00Z"
      };
      const staleError = recentError("error-1", "123456");
      store.$patch({
        selectedShopId: "10010",
        monitoringLoadedAt: 1234,
        batches: [staleBatch],
        importsBySystemMessageId: { "stale-batch": [] },
        recentErrors: [staleError],
        summary: {
          ...store.summary,
          latestBatch: staleBatch,
          latestCompletedBatch: staleBatch,
          lastCompletedAt: staleBatch.initDate
        }
      });

      await expect(store.refresh()).rejects.toThrow("Something went wrong.");

      expect(store.batches).toEqual([staleBatch]);
      expect(store.importsBySystemMessageId).toEqual({ "stale-batch": [] });
      expect(store.recentErrors).toEqual([staleError]);
      expect(store.summary.latestBatch).toEqual(staleBatch);
      expect(store.monitoringLoadedAt).toBe(1234);
      expect(store.monitoringError).toBe("Something went wrong.");
      expect(store.monitoringRefreshing).toBe(false);
      expect(store.monitoringLoading).toBe(false);
    });
  });

  describe("guarded mutation contracts", () => {
    it("configures through the exact top-level REST path with only the allowlisted fields", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      const shopId = "shop/100";
      const remote = remoteFor(shopId, "REMOTE_ENCODED");
      store.selectedShopId = shopId;
      store.configurationLoadedAt = 1;
      store.remote = remote;
      store.templateJob = rawOrderSyncJob(shopId, { jobName: "queue_ShopifyOrderSync", systemMessageRemoteId: "REMOTE_ENCODED" }) as any;
      store.job = null;
      mocks.api.mockResolvedValue({
        data: orderSyncEnvelope(shopId, {
          remote: { systemMessageRemoteId: "REMOTE_ENCODED" },
          job: rawOrderSyncJob(shopId, { systemMessageRemoteId: "REMOTE_ENCODED" })
        })
      });

      await store.configure();

      expect(mocks.api).toHaveBeenCalledTimes(1);
      const request = mocks.api.mock.calls[0][0] as ApiOptions;
      expect(request).toEqual({
        url: "shopify/order-sync/shop%2F100/job",
        method: "post",
        data: {}
      });
      expect(Object.keys(request.data || {})).toEqual([]);
    });

    it("rejects a configured clone whose schedule differs from the safe template", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      store.selectedShopId = "10010";
      store.configurationLoadedAt = 1;
      store.remote = remoteFor("10010");
      store.templateJob = rawOrderSyncJob("10010", {
        jobName: "queue_ShopifyOrderSync",
        cronExpression: "0 0/15 * * * ?"
      }) as any;
      store.job = null;
      mocks.api.mockResolvedValue({
        data: orderSyncEnvelope("10010", {
          template: { cronExpression: "0 0/15 * * * ?" },
          job: rawOrderSyncJob("10010", { cronExpression: "0 0/30 * * * ?" })
        })
      });

      await expect(store.configure()).rejects.toThrow("did not inherit the standard schedule");
      expect(store.job).toBeNull();
    });

    it("updates schedule and activation through canonical envelopes with exact allowlisted payloads", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010") as any });
      mocks.api
        .mockResolvedValueOnce({
          data: orderSyncEnvelope("10010", {
            job: rawOrderSyncJob("10010", { cronExpression: "0 0/30 * * * ?" })
          })
        })
        .mockResolvedValueOnce({
          data: orderSyncEnvelope("10010", {
            job: rawOrderSyncJob("10010", { cronExpression: "0 0/30 * * * ?", paused: false })
          })
        });

      await store.updateSchedule(" 0 0/30 * * * ? ");
      await store.updateJobStatus(false);

      expect(mocks.api.mock.calls.map(([options]) => options)).toEqual([
        {
          url: "shopify/order-sync/10010/job",
          method: "put",
          data: {
            jobName: "queue_ShopifyOrderSync_10010",
            cronExpression: "0 0/30 * * * ?"
          }
        },
        {
          url: "shopify/order-sync/10010/job",
          method: "put",
          data: {
            jobName: "queue_ShopifyOrderSync_10010",
            paused: false
          }
        }
      ]);
      const pausedRequest = (mocks.api.mock.calls[1][0] as ApiOptions).data?.paused;
      expect(pausedRequest).toBe(false);
      expect(typeof pausedRequest).toBe("boolean");
      expect(store.configurationState.kind).toBe("configured-active");
    });

    it("prevents an older same-shop monitoring read from overwriting a successful schedule mutation", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const staleContext = deferred<any>();
      const oldJob = rawOrderSyncJob("10010", { cronExpression: "0 0/15 * * * ?" });
      const savedJob = rawOrderSyncJob("10010", { cronExpression: "0 0/30 * * * ?" });
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/job" && options.method === "get") return staleContext.promise;
        if (options.url === "shopify/order-sync/10010/job" && options.method === "put") {
          return ok(orderSyncEnvelope("10010", { job: savedJob }));
        }
        if (options.url === "admin/systemMessages") return ok({ systemMessages: [] });
        if (options.url === "shopify/order-sync/10010/audits") return ok({ orderSyncAudits: [] });
        if (options.url === "shopify/order-sync/10010/errors") return ok({ orderSyncErrors: [], orderSyncRequestErrors: [] });
        throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
      });
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: oldJob as any });

      const staleRead = store.loadMonitoring("10010");
      await store.updateSchedule("0 0/30 * * * ?");
      staleContext.resolve({ data: orderSyncEnvelope("10010", { job: oldJob }) });

      await expect(staleRead).resolves.toBeNull();
      expect(store.job?.cronExpression).toBe("0 0/30 * * * ?");
      expect(store.monitoringLoading).toBe(false);
      expect(store.monitoringRefreshing).toBe(false);
    });

    it("prevents an older same-shop outstanding-count response from overwriting the latest request", async () => {
      const firstBaseline = deferred<any>();
      let baselineRequestCount = 0;
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url !== "shopify/graphql") throw new Error(`Unexpected API call: ${options.method} ${options.url}`);
        const queryText = String(options.data?.queryText || "");
        if (queryText.includes("order(id:")) {
          baselineRequestCount += 1;
          return baselineRequestCount === 1
            ? firstBaseline.promise
            : ok({ response: { order: { createdAt: "2026-07-22T13:00:00Z" } } });
        }
        if (queryText.includes("2026-07-22T13:00:00Z")) {
          return ok({ response: { ordersCount: { count: 2 } } });
        }
        if (queryText.includes("2026-07-22T12:00:00Z")) {
          return ok({ response: { ordersCount: { count: 9 } } });
        }
        throw new Error(`Unexpected Shopify query: ${queryText}`);
      });
      const store = useShopifyOrderSyncStore();
      store.$patch({
        selectedShopId: "10010",
        remote: { systemMessageRemoteId: "REMOTE_10010" } as any,
      });
      const recentOrders = [{
        shopId: "10010",
        shopifyFetchVerified: true,
        shopifyOrderId: "6475855265946",
        processedAtMillis: Date.parse("2026-07-22T13:05:00Z"),
      }] as any;

      const staleRequest = store.loadOutstandingOrderCount(recentOrders, "10010");
      const latestRequest = store.loadOutstandingOrderCount(recentOrders, "10010");
      await latestRequest;
      expect(store.shopifyOutstandingOrderCount.count).toBe(2);

      firstBaseline.resolve(ok({ response: { order: { createdAt: "2026-07-22T12:00:00Z" } } }));
      await staleRequest;
      expect(store.shopifyOutstandingOrderCount.count).toBe(2);
      expect(store.shopifyOutstandingOrderCount.baselineCreatedAt).toBe("2026-07-22T13:00:00Z");
    });

    it("runs through the exact top-level REST path with only the selected job name", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010", { paused: false }) as any });
      mocks.api.mockResolvedValue({ data: { jobRunId: "run-1", systemMessageId: "message-1" } });

      await expect(store.runNow()).resolves.toEqual({
        jobRunId: "run-1",
        systemMessageId: "message-1"
      });

      expect(mocks.api).toHaveBeenCalledTimes(1);
      const request = mocks.api.mock.calls[0][0] as ApiOptions;
      expect(request).toEqual({
        url: "shopify/order-sync/10010/run",
        method: "post",
        data: { jobName: "queue_ShopifyOrderSync_10010" }
      });
      expect(Object.keys(request.data || {})).toEqual(["jobName"]);
      expect(store.job).toEqual(expect.objectContaining({
        lastRunStatusId: "Pending",
        latestJobRunId: "run-1"
      }));
      expect(store.summary).toEqual(expect.objectContaining({
        hasActiveWork: true,
        pendingBatchRequests: 1,
        activeWorkJobRunId: "run-1",
        activeWorkSystemMessageId: ""
      }));
      expect(store.canRunNow).toBe(false);
      expect(store.runNowDisabledReason).toBe("ServiceJobRun run-1 is still active.");

      await expect(store.runNow()).rejects.toThrow("ServiceJobRun run-1 is still active.");
      expect(mocks.api).toHaveBeenCalledTimes(1);
    });

    it("surfaces only the allowlisted active-request conflict from Run now", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010", { paused: false }) as any });
      mocks.api.mockRejectedValue({
        response: {
          status: 400,
          data: { errors: ["Shop 10010 already has active Shopify order sync request M221664."] }
        }
      });

      await expect(store.runNow()).rejects.toThrow(
        "Shop 10010 already has active Shopify order sync request M221664."
      );
      expect(store.mutationError).toBe(
        "Shop 10010 already has active Shopify order sync request M221664."
      );
    });

    it("surfaces the allowlisted active-request conflict from Moqui's error list", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010", { paused: false }) as any });
      mocks.api.mockRejectedValue({
        response: {
          status: 400,
          data: { _ERROR_MESSAGE_LIST_: ["Shop 10010 already has active Shopify order sync request M221664."] }
        }
      });

      await expect(store.runNow()).rejects.toThrow(
        "Shop 10010 already has active Shopify order sync request M221664."
      );
      expect(store.mutationError).toBe(
        "Shop 10010 already has active Shopify order sync request M221664."
      );
    });

    it("does not invalidate an in-flight Run now when same-shop monitoring refreshes", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const runResponse = deferred<any>();
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/run") return runResponse.promise;
        return monitoringApi(options, {
          batches: [],
          imports: [],
          job: rawOrderSyncJob("10010", { paused: false })
        });
      });
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010", { paused: false }) as any });

      const run = store.runNow();
      await store.loadMonitoring("10010");
      runResponse.resolve({ data: { jobRunId: "run-1", systemMessageId: "message-1" } });

      await expect(run).resolves.toEqual({ jobRunId: "run-1", systemMessageId: "message-1" });
      expect(store.lastRunResult).toEqual({ jobRunId: "run-1", systemMessageId: "message-1" });
      expect(store.activeMutation).toBeNull();
    });

    it("prevents an older same-shop monitoring read from clearing the queued ServiceJobRun marker", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const staleContext = deferred<any>();
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/job" && options.method === "get") return staleContext.promise;
        if (options.url === "shopify/order-sync/10010/run") {
          return ok({ jobRunId: "run-pending", systemMessageId: "" });
        }
        return monitoringApi(options, { batches: [], imports: [] });
      });
      const idleJob = rawOrderSyncJob("10010", { paused: false });
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: idleJob as any });

      const staleRead = store.loadMonitoring("10010");
      await expect(store.runNow()).resolves.toEqual({ jobRunId: "run-pending", systemMessageId: "" });
      staleContext.resolve({ data: orderSyncEnvelope("10010", { job: idleJob }) });

      await expect(staleRead).resolves.toBeNull();
      expect(store.job).toEqual(expect.objectContaining({
        lastRunStatusId: "Pending",
        latestJobRunId: "run-pending"
      }));
      expect(store.summary).toEqual(expect.objectContaining({
        hasActiveWork: true,
        activeWorkJobRunId: "run-pending"
      }));
      expect(store.canRunNow).toBe(false);
    });

    it("does not run a paused Order Sync job until it is resumed", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010", { paused: true }) as any });

      expect(store.canRunNow).toBe(false);
      expect(store.runNowDisabledReason).toBe("Resume Order Sync before running it now.");
      await expect(store.runNow()).rejects.toThrow("Resume Order Sync before running it now.");
      expect(mocks.api).not.toHaveBeenCalled();
    });

    it("does not commit a mutation response after the selected shop changes", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const response = deferred<any>();
      mocks.api.mockReturnValue(response.promise);
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010") as any });

      const update = store.updateSchedule("0 0/30 * * * ?");
      store.resetForShop("20020");
      response.resolve({
        data: orderSyncEnvelope("10010", {
          job: rawOrderSyncJob("10010", { cronExpression: "0 0/30 * * * ?" })
        })
      });

      await expect(update).rejects.toThrow("selected Shopify shop changed");
      expect(store.selectedShopId).toBe("20020");
      expect(store.job).toBeNull();
      expect(store.configurationState.kind).toBe("missing");
    });

    it("accepts only canonical positive 1-30 digit retry targets and preserves every source error", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      const numericError = recentError("numeric-error", "123456");
      store.$patch({ selectedShopId: "10010", recentErrors: [numericError] });
      mocks.api.mockResolvedValueOnce({ data: { systemMessageId: "retry-message-1" } });

      await store.retryIndividualOrder({
        errorId: "numeric-error",
        shopifyOrderId: "123456"
      });

      const requests = mocks.api.mock.calls.map(([options]) => options as ApiOptions);
      expect(requests.map(({ url, method, data }) => ({ url, method, shopifyOrderId: data?.shopifyOrderId }))).toEqual([
        { url: "shopify/order-sync/10010/retry", method: "post", shopifyOrderId: "123456" }
      ]);
      const requestIds = requests.map(({ data }) => data?.requestId);
      expect(requestIds).toEqual([
        expect.stringMatching(/^[0-9a-f-]{36}$/i)
      ]);
      expect(mocks.api.mock.calls.every(([options]) => (
        Object.keys((options as ApiOptions).data || {}).sort().join(",") === "requestId,shopifyOrderId"
      ))).toBe(true);
      expect(store.recentErrors).toEqual([numericError]);

      for (const shopifyOrderId of [
        "0",
        "000000",
        "1234567890123456789012345678901",
        "HOTWAX_ORDER_123456",
        "gid://shopify/Product/123456",
        "gid://shopify/Order/789012",
        "gid://shopify/Order/not-numeric",
        ""
      ]) {
        await expect(store.retryIndividualOrder({
          errorId: "numeric-error",
          shopifyOrderId
        })).rejects.toThrow("resolvable Shopify order ID");
      }
      expect(mocks.api).toHaveBeenCalledTimes(1);
    });

    it("queues selected Shopify orders through the existing standalone fresh-fetch contract", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      mocks.api
        .mockResolvedValueOnce({ data: { systemMessageId: "selected-message-1" } })
        .mockRejectedValueOnce(new Error("private backend detail"));
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010" });

      await expect(store.requestSelectedOrders({
        shopifyOrderIds: ["6475855265946", "6475855265946", "123456"],
        shopId: "10010"
      })).resolves.toEqual({
        queued: [{
          shopifyOrderId: "6475855265946",
          requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          systemMessageId: "selected-message-1"
        }],
        failedOrderIds: ["123456"]
      });

      expect(mocks.api.mock.calls.map(([options]) => ({
        url: (options as ApiOptions).url,
        method: (options as ApiOptions).method,
        shopifyOrderId: (options as ApiOptions).data?.shopifyOrderId,
        keys: Object.keys((options as ApiOptions).data || {}).sort()
      }))).toEqual([
        { url: "shopify/order-sync/10010/retry", method: "post", shopifyOrderId: "6475855265946", keys: ["requestId", "shopifyOrderId"] },
        { url: "shopify/order-sync/10010/retry", method: "post", shopifyOrderId: "123456", keys: ["requestId", "shopifyOrderId"] }
      ]);
    });

    it("records retry request failure separately without mutating the original error row", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      mocks.api.mockRejectedValue(new Error("private Shopify failure detail"));
      const store = useShopifyOrderSyncStore();
      const originalError = recentError("error-1", "123456");
      store.$patch({ selectedShopId: "10010", recentErrors: [originalError] });

      await expect(store.retryIndividualOrder({
        errorId: "error-1",
        shopifyOrderId: "123456"
      })).rejects.toThrow("Something went wrong.");

      expect(store.recentErrors).toEqual([originalError]);
      expect(store.retryByErrorId["error-1"]).toEqual({
        pending: false,
        error: "Something went wrong.",
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i)
      });
    });

    it("does not invalidate an in-flight retry when same-shop monitoring refreshes", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const retryResponse = deferred<any>();
      mocks.api.mockImplementation((options: ApiOptions) => {
        if (options.url === "shopify/order-sync/10010/retry") return retryResponse.promise;
        return monitoringApi(options, { batches: [], imports: [] });
      });
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", recentErrors: [recentError("error-1", "123456")] });

      const retry = store.retryIndividualOrder({ errorId: "error-1", shopifyOrderId: "123456" });
      await store.loadMonitoring("10010");
      retryResponse.resolve({ data: { systemMessageId: "retry-message-1" } });

      await expect(retry).resolves.toEqual(expect.objectContaining({ systemMessageId: "retry-message-1" }));
      expect(store.retryByErrorId["error-1"]).toEqual(expect.objectContaining({
        pending: false,
        error: null,
        systemMessageId: "retry-message-1"
      }));
    });

    it("reuses one store-owned retry UUID after an ambiguous failure, then rotates it after a conclusive response", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      mocks.api
        .mockRejectedValueOnce(new Error("socket closed after request write"))
        .mockResolvedValueOnce({ data: { systemMessageId: "retry-message-1" } })
        .mockResolvedValueOnce({ data: { systemMessageId: "retry-message-2" } });
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", recentErrors: [recentError("error-1", "123456")] });

      await expect(store.retryIndividualOrder({
        errorId: "error-1",
        shopifyOrderId: "123456"
      })).rejects.toThrow("Something went wrong.");
      const firstRequestId = (mocks.api.mock.calls[0][0] as ApiOptions).data?.requestId;
      expect(store.retryByErrorId["error-1"]).toEqual({
        pending: false,
        error: "Something went wrong.",
        requestId: firstRequestId
      });

      await expect(store.retryIndividualOrder({
        errorId: "error-1",
        shopifyOrderId: "123456"
      })).resolves.toEqual({ requestId: firstRequestId, systemMessageId: "retry-message-1" });
      expect((mocks.api.mock.calls[1][0] as ApiOptions).data?.requestId).toBe(firstRequestId);
      expect(store.retryByErrorId["error-1"]).toEqual({
        pending: false,
        error: null,
        requestId: firstRequestId,
        systemMessageId: "retry-message-1"
      });

      await store.retryIndividualOrder({ errorId: "error-1", shopifyOrderId: "123456" });
      const nextRequestId = (mocks.api.mock.calls[2][0] as ApiOptions).data?.requestId;
      expect(nextRequestId).not.toBe(firstRequestId);
    });

    it("rejects a caller-supplied cross-shop retry override", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      store.$patch({ selectedShopId: "10010", recentErrors: [recentError("error-1", "123456")] });

      await expect(store.retryIndividualOrder({
        errorId: "error-1",
        shopifyOrderId: "123456",
        shopId: "20020"
      })).rejects.toThrow("cannot override the selected Shopify shop");
      expect(mocks.api).not.toHaveBeenCalled();
    });

    it("invalidates in-flight Run now and retry responses on a real shop route change", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const store = useShopifyOrderSyncStore();
      const runResponse = deferred<any>();
      mocks.api.mockReturnValueOnce(runResponse.promise);
      store.$patch({ selectedShopId: "10010", job: rawOrderSyncJob("10010", { paused: false }) as any });

      const run = store.runNow();
      store.resetForShop("20020");
      runResponse.resolve({ data: { jobRunId: "stale-run", systemMessageId: "stale-message" } });
      await expect(run).rejects.toThrow("selected Shopify shop changed");
      expect(store.selectedShopId).toBe("20020");
      expect(store.lastRunResult).toBeNull();

      const retryResponse = deferred<any>();
      mocks.api.mockReturnValueOnce(retryResponse.promise);
      store.resetForShop("10010");
      store.recentErrors = [recentError("error-1", "123456")];
      const retry = store.retryIndividualOrder({ errorId: "error-1", shopifyOrderId: "123456" });
      store.resetForShop("20020");
      retryResponse.resolve({ data: { systemMessageId: "stale-retry-message" } });
      await expect(retry).rejects.toThrow("selected Shopify shop changed");
      expect(store.selectedShopId).toBe("20020");
      expect(store.retryByErrorId).toEqual({});
    });

    it("does not commit Run now or retry responses after request invalidation", async () => {
      mocks.permissions.push("COMMON_ADMIN");
      const runResponse = deferred<any>();
      mocks.api.mockReturnValueOnce(runResponse.promise);
      const store = useShopifyOrderSyncStore();
      store.$patch({
        selectedShopId: "10010",
        job: rawOrderSyncJob("10010", { paused: false }) as any,
        recentErrors: [recentError("error-1", "123456")]
      });

      const run = store.runNow();
      store.invalidateRequests();
      runResponse.resolve({ data: { jobRunId: "stale-run", systemMessageId: "stale-message" } });
      await expect(run).rejects.toThrow("selected Shopify shop changed");
      expect(store.lastRunResult).toBeNull();
      expect(store.mutationError).toBeNull();

      const retryResponse = deferred<any>();
      mocks.api.mockReturnValueOnce(retryResponse.promise);
      const retry = store.retryIndividualOrder({ errorId: "error-1", shopifyOrderId: "123456" });
      store.clearShopifyOrderSyncState();
      retryResponse.resolve({ data: { systemMessageId: "stale-retry-message" } });
      await expect(retry).rejects.toThrow("selected Shopify shop changed");
      expect(store.selectedShopId).toBe("");
      expect(store.retryByErrorId).toEqual({});
      expect(store.lastRunResult).toBeNull();
      expect(store.activeMutation).toBeNull();
      expect(store.requestToken).toBeGreaterThan(0);
    });

    it("requires COMMON_ADMIN for configure, schedule, activation, run, and retry", async () => {
      const store = useShopifyOrderSyncStore();
      store.$patch({
        selectedShopId: "10010",
        job: rawOrderSyncJob("10010") as any,
        recentErrors: [recentError("error-1", "123456")]
      });

      expect(store.capabilities).toEqual({
        canMonitor: true,
        canConfigure: false,
        canActivate: false,
        canEditSchedule: false,
        canRunNow: false,
        canRetryIndividualOrder: false
      });
      await expect(store.configure()).rejects.toThrow("COMMON_ADMIN permission");
      await expect(store.updateSchedule("0 0/30 * * * ?")).rejects.toThrow("COMMON_ADMIN permission");
      await expect(store.updateJobStatus(false)).rejects.toThrow("COMMON_ADMIN permission");
      await expect(store.runNow()).rejects.toThrow("COMMON_ADMIN permission");
      await expect(store.retryIndividualOrder({
        errorId: "error-1",
        shopifyOrderId: "123456"
      })).rejects.toThrow("COMMON_ADMIN permission");
      expect(mocks.api).not.toHaveBeenCalled();
    });
  });

  it("searches only loaded rows without making an API call", () => {
    const store = useShopifyOrderSyncStore();
    store.$patch({
      recentOrders: [
        {
          id: "success-2",
          shopId: "10010",
          shopifyOrderId: "222",
          orderName: "#222",
          orderId: "HOTWAX-222",
          outcome: "Updated",
          processedAt: "2026-07-22T12:00:00Z",
          processedAtMillis: Date.parse("2026-07-22T12:00:00Z"),
          systemMessageId: "message-2",
          batchId: "run-2",
          configId: "UPDATE_SHOPIFY_ORDER",
          logId: "log-2",
          shopifyFetchVerified: true
        },
        {
          id: "success-1",
          shopId: "10010",
          shopifyOrderId: "111",
          orderName: "#111",
          orderId: "HOTWAX-111",
          outcome: "Created",
          processedAt: "2026-07-22T11:00:00Z",
          processedAtMillis: Date.parse("2026-07-22T11:00:00Z"),
          systemMessageId: "message-1",
          batchId: "run-1",
          configId: "SYNC_SHOPIFY_ORDER",
          logId: "log-1",
          shopifyFetchVerified: false
        }
      ] as any,
      recentErrors: [recentError("error-1", "333")]
    });

    expect(store.filteredRecentOrders("111").map(({ id }) => id)).toEqual(["success-1"]);
    expect(store.filteredRecentOrders("#222").map(({ id }) => id)).toEqual(["success-2"]);
    expect(store.filteredRecentOrders("created")).toEqual([]);
    expect(store.filteredRecentOrders("HOTWAX-222")).toEqual([]);
    expect(store.filteredRecentErrors("immutable").map(({ id }) => id)).toEqual(["error-1"]);
    expect(store.filteredRecentErrors("log-1").map(({ id }) => id)).toEqual(["error-1"]);
    expect(store.filteredRecentErrors("run-1").map(({ id }) => id)).toEqual(["error-1"]);
    const downloadedCsv = buildShopifyOrderSyncErrorCsv(store.filteredRecentErrors("immutable"));
    expect(downloadedCsv).toContain("errorId,shopId,shopifyOrderId,orderName,errorText,occurredAt,configId,logId,systemMessageId,batchId,retryable");
    expect(downloadedCsv).toContain('"Original immutable import error"');
    expect(store.filteredRecentOrders("").map(({ id }) => id)).toEqual(["success-2", "success-1"]);
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
