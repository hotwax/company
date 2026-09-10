import { describe, expect, it, vi } from "vitest";

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

import { createInventoryChannel, ensureChannelResetJob, repairInventoryResetImportConfig, ensureShopPhysicalAtpResetJob } from "@/composables/useShopify";

describe("createInventoryChannel", () => {
  it("sends fromDate in the payload when creating an inventory channel", async () => {
    const fixedNow = 1755405600000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    harness.api.mockResolvedValue({
      data: { inventoryChannelId: "IC_1001" },
      status: 200,
    });

    const channelId = await createInventoryChannel({
      shopId: "100002",
      facilityGroupId: "CHANNEL_FG_1",
      shopifyLocationId: "LOC_998877",
      description: "Channel FG 1 aggregate inventory",
    });

    expect(channelId).toBe("IC_1001");
    expect(harness.api).toHaveBeenCalledWith({
      url: "sob/shopify/inventoryChannels",
      method: "post",
      data: {
        shopId: "100002",
        facilityGroupId: "CHANNEL_FG_1",
        shopifyLocationId: "LOC_998877",
        fromDate: fixedNow,
        description: "Channel FG 1 aggregate inventory",
      },
    });
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("inventoryChannel", {
      inventoryChannelId: "IC_1001",
    });

    vi.restoreAllMocks();
  });

  it("sends explicit fromDate if supplied", async () => {
    const customFromDate = 1755000000000;
    harness.api.mockResolvedValue({
      data: { inventoryChannelId: "IC_1002" },
      status: 200,
    });

    const channelId = await createInventoryChannel({
      shopId: "100002",
      facilityGroupId: "CHANNEL_FG_2",
      shopifyLocationId: "LOC_112233",
      fromDate: customFromDate,
    });

    expect(channelId).toBe("IC_1002");
    expect(harness.api).toHaveBeenCalledWith({
      url: "sob/shopify/inventoryChannels",
      method: "post",
      data: {
        shopId: "100002",
        facilityGroupId: "CHANNEL_FG_2",
        shopifyLocationId: "LOC_112233",
        fromDate: customFromDate,
      },
    });
  });
});


describe("ensureChannelResetJob", () => {
  it("creates the main feed-generation service rather than the removed direct sender", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValue({ data: {} });
    await ensureChannelResetJob({ inventoryChannelId: "IC_NEW" });
    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", url: "admin/serviceJobs",
      data: expect.objectContaining({ serviceName: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed", paused: "Y" }),
    }));
  });
  it("repairs a legacy job without replacing its schedule or parameters", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValue({ data: { jobDetail: {
      jobName: "reset_InventoryChannelInventory_IC_OLD",
      serviceName: "co.hotwax.sob.product.InventoryServices.post#InventoryChannelInventory",
      cronExpression: "0 5 * * * ?", paused: "Y",
    } } });
    await ensureChannelResetJob({ inventoryChannelId: "IC_OLD" });
    expect(harness.api).toHaveBeenCalledWith({
      url: "admin/serviceJobs/reset_InventoryChannelInventory_IC_OLD", method: "PUT",
      data: { jobName: "reset_InventoryChannelInventory_IC_OLD", serviceName: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed", paused: "Y" },
    });
    expect(harness.api.mock.calls.filter(([arg]) => arg.method === "POST")).toHaveLength(0);
  });
  it("does not overwrite an unrelated service at the expected job name", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValue({ data: { jobDetail: { jobName: "reset_InventoryChannelInventory_IC_OTHER", serviceName: "other.Service#run" } } });
    await expect(ensureChannelResetJob({ inventoryChannelId: "IC_OTHER" })).rejects.toThrow("unexpected service");
    expect(harness.api.mock.calls.every(([arg]) => arg.method === "get")).toBe(true);
  });
});


describe("repairInventoryResetImportConfig", () => {
  it("changes only the legacy importer and verifies the saved value", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValueOnce({ data: { configId: "RESET_INV_CHANNEL", importServiceName: "co.hotwax.sob.product.InventoryServices.import#InventoryChannelInventory" } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { configId: "RESET_INV_CHANNEL", importServiceName: "co.hotwax.sob.product.InventoryServices.push#InventoryChannelInventory" } });
    await repairInventoryResetImportConfig();
    expect(harness.api.mock.calls[1][0]).toEqual({ url: "admin/dataManager/RESET_INV_CHANNEL", method: "PUT", data: { configId: "RESET_INV_CHANNEL", importServiceName: "co.hotwax.sob.product.InventoryServices.push#InventoryChannelInventory" } });
    expect(harness.api).toHaveBeenCalledTimes(3);
  });
  it("does not overwrite an unknown importer", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValue({ data: { configId: "RESET_INV_CHANNEL", importServiceName: "custom.Service#run" } });
    await expect(repairInventoryResetImportConfig()).rejects.toThrow("unexpected configuration");
    expect(harness.api).toHaveBeenCalledTimes(1);
  });
});


describe("physical ATP reset setup", () => {
  it("never creates a job after a failed lookup", async () => {
    harness.api.mockReset().mockRejectedValue(new Error("offline"));
    await expect(ensureShopPhysicalAtpResetJob("10000")).rejects.toThrow("offline");
    expect(harness.api).toHaveBeenCalledTimes(1);
  });
  it("reports missing upgrade configuration before any write", async () => {
    harness.api.mockReset().mockResolvedValueOnce({ data: { serviceJobCount: 0 } }).mockResolvedValueOnce({ data: {} });
    await expect(ensureShopPhysicalAtpResetJob("10000")).rejects.toThrow("setup is missing");
    expect(harness.api.mock.calls.every(([arg]) => arg.method === "get")).toBe(true);
  });
  it("creates a paused shop-scoped job after verifying the importer", async () => {
    harness.api.mockReset().mockResolvedValueOnce({ data: { serviceJobCount: 0 } })
      .mockResolvedValueOnce({ data: { configId: "RESET_PHYSICAL_LOC_INV", importServiceName: "co.hotwax.sob.product.InventoryServices.import#PhysicalLocationInventory" } })
      .mockResolvedValue({ data: {} });
    await ensureShopPhysicalAtpResetJob("10000");
    expect(harness.api.mock.calls[2][0].data).toMatchObject({ paused: "Y", serviceName: "co.hotwax.sob.product.InventoryServices.generate#PhysicalLocationInventoryFeed" });
    expect(harness.api.mock.calls[3][0].data.serviceJobParameters).toEqual([{ parameterName: "shopId", parameterValue: "10000" }]);
  });
  it("does not overwrite a same-named job belonging to another shop", async () => {
    harness.api.mockReset().mockResolvedValue({ data: { serviceJobList: [{ jobName: "generate_PhysicalLocationInventoryFeed_10000", serviceName: "co.hotwax.sob.product.InventoryServices.generate#PhysicalLocationInventoryFeed", serviceJobParameters: [{ parameterName: "shopId", parameterValue: "OTHER" }] }] } });
    await expect(ensureShopPhysicalAtpResetJob("10000")).rejects.toThrow("different scope");
    expect(harness.api).toHaveBeenCalledTimes(1);
  });
});
