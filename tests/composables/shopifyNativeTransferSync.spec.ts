import { beforeEach, describe, expect, it, vi } from "vitest";

const { api, hasError } = vi.hoisted(() => ({ api: vi.fn(), hasError: vi.fn(() => false) }));

vi.mock("@common", () => ({ api, commonUtil: { hasError }, useDb: vi.fn() }));
vi.mock("@/services/appCacheBootstrap", () => ({ refreshAfterMutation: vi.fn() }));
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

  it.each([null, {}, { data: null }, { data: { error: "Denied" } }])("rejects an invalid read envelope %j", async (response) => {
    api.mockResolvedValueOnce(response);
    const sync = useShopifyNativeTransferSync();
    await sync.load("SHOP_1");

    expect(sync.loadFailed.value).toBe(true);
    expect(sync.loading.value).toBe(false);
  });

  it("ignores a previous shop's response after switching shops", async () => {
    let finishFirst!: (response: unknown) => void;
    api.mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }))
      .mockResolvedValueOnce(settingRows("false"));
    const sync = useShopifyNativeTransferSync();
    const first = sync.load("SHOP_1");
    await sync.load("SHOP_2");
    finishFirst(settingRows("true"));
    await first;

    expect(sync.enabled.value).toBe(false);
    expect(sync.loadFailed.value).toBe(false);
  });

  it.each([null, {}, { data: null }])("does not confirm an empty write response %j", async (response) => {
    api.mockResolvedValueOnce(response);
    const sync = useShopifyNativeTransferSync();

    expect(await sync.save("SHOP_1", false)).toBe(false);
    expect(sync.enabled.value).toBe(true);
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
