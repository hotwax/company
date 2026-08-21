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

import { createInventoryChannel } from "@/composables/useShopify";

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
