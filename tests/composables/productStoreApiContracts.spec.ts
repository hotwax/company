import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  loggerWarn: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));

vi.mock("@common", () => ({
  api: mocks.api,
  commonUtil: {
    hasError: (response: any) =>
      Boolean(response?.data?._ERROR_MESSAGE_ || response?.data?._ERROR_MESSAGE_LIST_),
  },
  logger: { error: vi.fn(), warn: mocks.loggerWarn, info: vi.fn() },
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: mocks.refreshAfterMutation,
  resyncDomain: mocks.resyncDomain,
}));

vi.mock("@/utils/cacheEntities", () => ({
  productStoreCache: {},
  productStoreFacilityCache: {},
  productStoreShipmentCountCache: {},
  productStoreShippingMethodCache: {},
  serviceJobCache: {},
  serviceJobRunCache: {},
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ records: ref([]), hydrated: ref(true) }),
  useCachedRecord: () => ({ record: ref(undefined), hydrated: ref(true) }),
}));

vi.mock("@/composables/useSeed", () => ({
  useOrganization: () => ({ loadOrganizationPartyId: vi.fn() }),
}));

vi.mock("@/composables/sessionScope", () => ({
  onSessionCleared: vi.fn(),
}));

import { useProductStoreData } from "@/composables/useProductStoreData";
import { useProductStoreMutations } from "@/composables/useProductStores";

describe("Product Store API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.mockResolvedValue({ data: {} });
  });

  it("tracks product-store detail and setting fetches independently", async () => {
    mocks.api
      .mockResolvedValueOnce({ data: { productStoreId: "STORE_1" } })
      .mockRejectedValueOnce(new Error("settings unavailable"));

    const productStoreData = useProductStoreData();
    await productStoreData.fetchProductStoreDetails("STORE_1");
    await productStoreData.fetchCurrentStoreSettings("STORE_1");

    expect(productStoreData.fetchStatus.productStoreDetails).toBe("success");
    expect(productStoreData.fetchStatus.currentStoreSettings).toBe("error");
    expect(productStoreData.current).toEqual({ productStoreId: "STORE_1" });
    expect(productStoreData.currentStoreSettings).toEqual({});
  });

  it("posts only the three ProductStoreSetting fields even when a legacy caller supplies extras", async () => {
    await useProductStoreMutations("STORE/1").saveSettings({
      productStoreId: "WRONG_STORE",
      settingTypeEnumId: "SAVE_BILL_TO_INF",
      settingValue: "Y",
      fromDate: 1_786_464_000_000,
      thruDate: 1_789_056_000_000,
      unrelatedField: "must not leak",
    });

    expect(mocks.api).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith({
      url: "admin/productStores/STORE%2F1/settings",
      method: "post",
      data: {
        productStoreId: "STORE/1",
        settingTypeEnumId: "SAVE_BILL_TO_INF",
        settingValue: "Y",
      },
    });
  });

  it("writes the history cursor before the launch date with their exact shop-scoped keys", async () => {
    let resolveHistoryWrite!: (response: { data: Record<string, never> }) => void;
    mocks.api
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveHistoryWrite = resolve;
      }))
      .mockResolvedValueOnce({ data: {} });

    const saving = useProductStoreData().saveProductStoreShopifyOrderDates({
      shopId: "SHOP_100",
      historyStartDate: "2026-01-01 00:00:00",
      launchDate: "2026-08-12 00:00:00",
    });

    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenNthCalledWith(1, {
      url: "admin/systemProperties",
      method: "put",
      data: {
        systemResourceId: "SHOP_100",
        systemPropertyId: "orderSyncHistory.lastSyncDate",
        systemPropertyValue: "2026-01-01 00:00:00",
      },
    });

    resolveHistoryWrite({ data: {} });

    await expect(saving).resolves.toEqual({
      status: 200,
      data: {
        savedSystemPropertyIds: [
          "orderSyncHistory.lastSyncDate",
          "newOrderSync.launchDate",
        ],
      },
    });
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.api).toHaveBeenNthCalledWith(2, {
      url: "admin/systemProperties",
      method: "put",
      data: {
        systemResourceId: "SHOP_100",
        systemPropertyId: "newOrderSync.launchDate",
        systemPropertyValue: "2026-08-12 00:00:00",
      },
    });
  });

  it("exposes the first saved property id when the second Moqui write fails", async () => {
    const secondWriteFailure: Record<string, any> = {
      _ERROR_MESSAGE_: "Unable to store launch date",
    };
    mocks.api
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: secondWriteFailure });

    const saving = useProductStoreData().saveProductStoreShopifyOrderDates({
      shopId: "SHOP_100",
      historyStartDate: "2026-01-01 00:00:00",
      launchDate: "2026-08-12 00:00:00",
    });

    await expect(saving).rejects.toBe(secondWriteFailure);
    expect(secondWriteFailure.savedSystemPropertyIds).toEqual([
      "orderSyncHistory.lastSyncDate",
    ]);
    expect(mocks.api.mock.calls.map(([request]) => request.data.systemPropertyId)).toEqual([
      "orderSyncHistory.lastSyncDate",
      "newOrderSync.launchDate",
    ]);
  });

  function mockShopifySetupApis(options: {
    includeInventoryTemplate?: boolean;
    materializeInventoryClone?: boolean;
  } = {}) {
    const jobs = new Map<string, any>([
      ["sync_ShopifyInventoryReset", {
        jobName: "sync_ShopifyInventoryReset",
        paused: "Y",
        serviceJobParameters: [
          { jobName: "sync_ShopifyInventoryReset", parameterName: "shopId", parameterValue: "" },
        ],
      }],
      ["queue_ShopifyOrderSync", {
        jobName: "queue_ShopifyOrderSync",
        paused: "Y",
        serviceJobParameters: [],
      }],
      ["sync_ShopifyOrderHistory", {
        jobName: "sync_ShopifyOrderHistory",
        paused: "Y",
        serviceJobParameters: [
          { jobName: "sync_ShopifyOrderHistory", parameterName: "systemMessageTypeId", parameterValue: "BulkOrderHistoryQuery" },
          { jobName: "sync_ShopifyOrderHistory", parameterName: "systemMessageRemoteId", parameterValue: "" },
          { jobName: "sync_ShopifyOrderHistory", parameterName: "windowDays", parameterValue: "7" },
        ],
      }],
    ]);
    if(options.includeInventoryTemplate === false) {
      jobs.delete("sync_ShopifyInventoryReset");
    }

    mocks.api.mockImplementation((request: any) => {
      const method = String(request.method || "get").toLowerCase();
      const url = request.url;

      if(url === "admin/productStores/STORE_1") {
        return Promise.resolve({ data: { productStoreId: "STORE_1", storeName: "Test Store" } });
      }
      if(url === "oms/shopifyShops/shops") {
        return Promise.resolve({ data: [{ productStoreId: "STORE_1", shopId: "SHOP_100", isEnabled: "Y" }] });
      }
      if(url === "oms/systemMessageRemotes") {
        return Promise.resolve({ data: [{ systemMessageRemoteId: "REMOTE_100", internalId: "SHOP_100", accessScopeEnumId: "SHOP_RW_ACCESS" }] });
      }
      if(url === "admin/serviceJobs") {
        return Promise.resolve({ data: [...jobs.values()] });
      }
      if(url.startsWith("admin/dataManager/")) {
        return Promise.resolve({ data: { configId: url.slice("admin/dataManager/".length) } });
      }
      if(url.endsWith("/clone") && method === "post") {
        const templateJobName = url.slice("admin/serviceJobs/".length, -"/clone".length);
        const template = jobs.get(templateJobName);
        const newJobName = request.data.newJobName;
        if(templateJobName !== "sync_ShopifyInventoryReset" || options.materializeInventoryClone !== false) {
          jobs.set(newJobName, {
            ...template,
            jobName: newJobName,
            parentJobName: templateJobName,
            serviceJobParameters: (template?.serviceJobParameters || []).map((parameter: any) => ({
              ...parameter,
              jobName: newJobName,
            })),
          });
        }

        return Promise.resolve({ data: {} });
      }
      if(url.startsWith("admin/serviceJobs/") && !url.slice("admin/serviceJobs/".length).includes("/")) {
        const jobName = url.slice("admin/serviceJobs/".length);
        if(method === "get") {return Promise.resolve({ data: jobs.get(jobName) || {} });}
        if(method === "put") {
          jobs.set(jobName, { ...jobs.get(jobName), ...request.data });

          return Promise.resolve({ data: jobs.get(jobName) });
        }
      }

      throw new Error(`Unexpected API request: ${method.toUpperCase()} ${url}`);
    });

    return jobs;
  }

  it("clones the inbound Shopify inventory-reset template and sets only its source-backed shopId parameter", async () => {
    const jobs = mockShopifySetupApis();

    const response = await useProductStoreData().setupProductStoreShopifyInventoryReset({
      productStoreId: "STORE_1",
      shopId: "SHOP_100",
      activateJobs: false,
      // Legacy callers may still supply these values; the inbound seed does not accept them.
      systemMessageRemoteId: "REMOTE_100",
      inventoryResetAdditionalParameters: { facilityId: "FACILITY_1" },
    });

    expect(mocks.api).toHaveBeenCalledWith({
      url: "admin/serviceJobs/sync_ShopifyInventoryReset/clone",
      method: "post",
      data: {
        newJobName: "sync_ShopifyInventoryReset_SHOP_100",
        copyParameters: true,
      },
    });
    const configuredJob = jobs.get("sync_ShopifyInventoryReset_SHOP_100");
    expect(Object.fromEntries(configuredJob.serviceJobParameters.map((parameter: any) => [
      parameter.parameterName,
      parameter.parameterValue,
    ]))).toEqual({ shopId: "SHOP_100" });
    expect(mocks.refreshAfterMutation).toHaveBeenCalledWith("serviceJob", {
      jobName: "sync_ShopifyInventoryReset_SHOP_100",
    });
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(response.data.shopifyJobsStatus.jobs.find((job: any) => job.key === "inventoryReset")).toMatchObject({
      configured: true,
      selectedJobName: "sync_ShopifyInventoryReset_SHOP_100",
    });
  });

  it("rejects inventory setup before cloning when its backend template is missing", async () => {
    mockShopifySetupApis({ includeInventoryTemplate: false });

    await expect(useProductStoreData().setupProductStoreShopifyInventoryReset({
      productStoreId: "STORE_1",
      shopId: "SHOP_100",
      activateJobs: false,
    })).rejects.toThrow("Initial inventory import cannot be configured because the backend service-job template sync_ShopifyInventoryReset is missing.");

    expect(mocks.api).not.toHaveBeenCalledWith(expect.objectContaining({
      url: "admin/serviceJobs/sync_ShopifyInventoryReset/clone",
    }));
  });

  it("exposes inventory template and target availability in the live setup status", async () => {
    const jobs = mockShopifySetupApis();
    const productStoreData = useProductStoreData();

    await expect(productStoreData.fetchProductStoreShopifyJobStatus("STORE_1")).resolves.toEqual(expect.objectContaining({
      jobs: expect.arrayContaining([
        expect.objectContaining({
          key: "inventoryReset",
          status: "template-ready",
          templateExists: true,
          expectedJobExists: false,
        }),
      ]),
    }));

    jobs.delete("sync_ShopifyInventoryReset");
    await expect(productStoreData.fetchProductStoreShopifyJobStatus("STORE_1")).resolves.toEqual(expect.objectContaining({
      jobs: expect.arrayContaining([
        expect.objectContaining({
          key: "inventoryReset",
          status: "missing-template",
          templateExists: false,
          expectedJobExists: false,
        }),
      ]),
    }));
  });

  it("rejects inventory setup when the backend clone response does not create its target job", async () => {
    mockShopifySetupApis({ materializeInventoryClone: false });

    await expect(useProductStoreData().setupProductStoreShopifyInventoryReset({
      productStoreId: "STORE_1",
      shopId: "SHOP_100",
      activateJobs: false,
    })).rejects.toThrow("Initial inventory import cannot be configured because clone target sync_ShopifyInventoryReset_SHOP_100 was not created.");

    expect(mocks.api).toHaveBeenCalledWith({
      url: "admin/serviceJobs/sync_ShopifyInventoryReset/clone",
      method: "post",
      data: {
        newJobName: "sync_ShopifyInventoryReset_SHOP_100",
        copyParameters: true,
      },
    });
  });

  it("keeps the historic-order clone on sync_ShopifyOrderHistory with its remote and window parameters", async () => {
    const jobs = mockShopifySetupApis();

    await useProductStoreData().setupProductStoreShopifyOrderImport({
      productStoreId: "STORE_1",
      shopId: "SHOP_100",
      systemMessageRemoteId: "REMOTE_100",
      activateJobs: false,
      windowDays: 14,
    });

    expect(mocks.api).toHaveBeenCalledWith({
      url: "admin/serviceJobs/sync_ShopifyOrderHistory/clone",
      method: "post",
      data: {
        newJobName: "sync_ShopifyOrderHistory_SHOP_100",
        copyParameters: true,
      },
    });
    const configuredJob = jobs.get("sync_ShopifyOrderHistory_SHOP_100");
    expect(Object.fromEntries(configuredJob.serviceJobParameters.map((parameter: any) => [
      parameter.parameterName,
      parameter.parameterValue,
    ]))).toEqual({
      systemMessageTypeId: "BulkOrderHistoryQuery",
      systemMessageRemoteId: "REMOTE_100",
      windowDays: "14",
    });
  });

  it.each([
    ["inventory", "sync_ShopifyInventoryReset_SHOP_100", () => useProductStoreData().runProductStoreShopifyInventoryReset({ shopId: "SHOP_100" })],
    ["order history", "sync_ShopifyOrderHistory_SHOP_100", () => useProductStoreData().runProductStoreShopifyOrderHistoryImport({
      shopId: "SHOP_100",
      fromDate: "2026-01-01 00:00:00",
      launchDate: "2026-08-12 00:00:00",
      windowDays: 7,
    })],
  ])("runs the configured %s job through the generic runNow endpoint", async (_label, jobName, run) => {
    mocks.api.mockResolvedValueOnce({ data: { jobRunId: "JOB_RUN_1" } });

    await expect(run()).resolves.toEqual({ data: { jobRunId: "JOB_RUN_1" } });
    expect(mocks.api).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith({
      url: `admin/serviceJobs/${jobName}/runNow`,
      method: "POST",
    });
  });
});
