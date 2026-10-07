import { beforeEach, describe, expect, it, vi } from "vitest";

const { api, hasError } = vi.hoisted(() => ({ api: vi.fn(), hasError: vi.fn(() => false) }));

vi.mock("@common", () => ({ api, commonUtil: { hasError }, useDb: vi.fn() }));
vi.mock("@/services/appDbSync", () => ({ refreshAfterMutation: vi.fn() }));
vi.mock("@/utils/shopifyWebhookReconciliation", () => ({ reconcileWebhookTopics: vi.fn() }));
vi.mock("@/workers/domains/shopifyTransferSyncDomain", () => ({
  PENDING_SEGMENT_ENDPOINTS: {},
  SYNCED_SEGMENT_ENDPOINTS: {},
}));

import { useShopifyNativeTransferSync } from "@/composables/useShopifyTransferSync";

const settingRows = (settingValue?: string) => ({ data: settingValue === undefined ? [] : [{ settingValue }] });

describe("useShopifyNativeTransferSync", () => {
  beforeEach(() => {
    api.mockReset();
    hasError.mockReset().mockReturnValue(false);
  });

  it.each([
    [undefined, true],
    ["", true],
    ["true", true],
    ["Y", true],
    ["false", false],
    ["N", false],
  ])("reads setting %j as enabled=%s", async (value, expected) => {
    api.mockResolvedValueOnce(settingRows(value));
    const sync = useShopifyNativeTransferSync();
    await sync.load("SHOP_1");

    expect(sync.enabled.value).toBe(expected);
    expect(api.mock.calls[0][0].params).toEqual({ shopId: "SHOP_1", settingTypeEnumId: "SHPFY_NATIVE_TO_SYNC", pageSize: 1 });
  });

  it("flags a failed read instead of reporting the default", async () => {
    api.mockRejectedValueOnce(new Error("timeout"));
    const sync = useShopifyNativeTransferSync();
    await sync.load("SHOP_1");

    expect(sync.loadFailed.value).toBe(true);
  });

  it("stores the boolean as a string and updates state only on success", async () => {
    api.mockResolvedValueOnce({ data: {} });
    const sync = useShopifyNativeTransferSync();

    expect(await sync.save("SHOP_1", false)).toBe(true);
    expect(api.mock.calls[0][0]).toMatchObject({
      method: "POST",
      data: { shopId: "SHOP_1", settingTypeEnumId: "SHPFY_NATIVE_TO_SYNC", settingValue: "false" },
    });
    expect(sync.enabled.value).toBe(false);

    hasError.mockReturnValueOnce(true);
    api.mockResolvedValueOnce({ data: {} });
    expect(await sync.save("SHOP_1", true)).toBe(false);
    expect(sync.enabled.value).toBe(false);
  });
});
