import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  hasError: vi.fn((_response: any) => false),
  remotes: [] as any[],
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: (response: any) => harness.hasError(response), showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({
    rows: { value: [] },
    records: { value: [] },
    hydrated: { value: true },
  }),
  useCachedRecord: () => ({ record: { value: undefined }, hydrated: { value: true } }),
  byDescription: () => 0,
}));

vi.mock("@/utils/cacheEntities", () => ({
  dataManagerLogCache: { __kind: "logs" },
  productStoreCache: { __kind: "stores" },
  serviceJobCache: { __kind: "jobs" },
  shopifyBulkOperationCache: { __kind: "bulkOps" },
  shopifyCarrierShipmentCache: { __kind: "carrierShipments" },
  shopifyLocationCache: { __kind: "locations" },
  shopifyShopCache: { __kind: "shops" },
  shopifyTypeMappingCache: { __kind: "typeMappings" },
  syncRunCache: { __kind: "syncRuns" },
  systemMessageCache: { __kind: "messages" },
  systemMessageErrorCache: { __kind: "errors" },
  systemMessageRemoteCache: {
    __kind: "remotes",
    all: vi.fn(() => harness.remotes.map((raw) => ({ raw }))),
  },
}));

vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    ensureSystemMessageById: vi.fn(),
    ensureSystemMessageErrors: vi.fn(),
    fetchShopifyBulkOperation: vi.fn(),
  }),
}));

vi.mock("@/composables/useDataManager", () => ({
  useDataManager: () => ({ ensureDataManagerLog: vi.fn() }),
  useRecentDataManagerLogs: () => ({
    logs: { value: [] },
    totalFailedRecords: { value: 0 },
    hydrated: { value: true },
  }),
}));

vi.mock("@/composables/useSeed", () => ({
  useStatuses: () => ({ labelFor: (statusId: string) => statusId }),
}));

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJob: () => ({ updateJob: vi.fn(), runNow: vi.fn() }),
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  bootstrapState: { running: false },
}));

import {
  fetchProductMappings,
  refreshMappedProductSearchIndex,
  fetchShopSystemMessageRemoteId,
  fetchUpdateFilesToProcessCount,
} from "@/composables/useShopify";

const SHOP_ID = "10000";
const SHOPIFY_SHOP_ID = "6973849727";

function remote(systemMessageRemoteId: string) {
  return {
    systemMessageRemoteId,
    internalId: SHOP_ID,
    internalIdType: "HOTWAX_SHOP_ID",
    remoteId: SHOPIFY_SHOP_ID,
    accessScopeEnumId: "SHOP_RW_ACCESS",
  };
}

beforeEach(() => {
  harness.api.mockReset();
  harness.hasError.mockReset().mockReturnValue(false);
  harness.remotes = [remote("RemoteA"), remote("RemoteB")];
});

describe("refreshMappedProductSearchIndex", () => {
  it("indexes only the selected OMS product without an import or Shopify call", async () => {
    harness.api.mockResolvedValue({ data: {} });
    await refreshMappedProductSearchIndex("M223281");
    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(harness.api).toHaveBeenCalledWith({
      url: "oms/search/index/product", method: "post", data: { productId: "M223281", indexVariants: false },
    });
  });
  it("rejects a missing product without a write", async () => {
    await expect(refreshMappedProductSearchIndex(" ")).rejects.toThrow("OMS product ID is required");
    expect(harness.api).not.toHaveBeenCalled();
  });
  it("does not report a payload error or missing response as completed", async () => {
    harness.api.mockResolvedValue({ data: {} });
    harness.hasError.mockReturnValue(true);
    await expect(refreshMappedProductSearchIndex("M223281")).rejects.toThrow("not confirmed");
    harness.api.mockResolvedValue({ data: null });
    harness.hasError.mockReturnValue(false);
    await expect(refreshMappedProductSearchIndex("M223281")).rejects.toThrow("not confirmed");
  });
});

describe("fetchShopSystemMessageRemoteId", () => {
  it("checks multiple candidates by equality and selects the first one with product-sync history", async () => {
    harness.api.mockImplementation((config: any) => ({
      data: {
        systemMessages: config.params.systemMessageRemoteId === "RemoteB"
          ? [{ systemMessageRemoteId: "RemoteB" }]
          : [],
      },
    }));

    const selected = await fetchShopSystemMessageRemoteId({
      shopId: SHOP_ID,
      shopifyShopId: SHOPIFY_SHOP_ID,
    });

    expect(selected).toBe("RemoteB");

    const calls = harness.api.mock.calls.map(([config]) => config);
    expect(calls).toHaveLength(2);
    expect(calls.map((config) => config.params.systemMessageRemoteId))
      .toEqual(["RemoteA", "RemoteB"]);
    for(const call of calls) {
      expect(typeof call.params.systemMessageRemoteId).toBe("string");
      expect(call.params).not.toHaveProperty("systemMessageRemoteId_op");
      expect(call.params.pageSize).toBe(1);
    }
  });

  it("continues checking candidates when one remote request fails", async () => {
    harness.api.mockImplementation((config: any) => {
      if(config.params.systemMessageRemoteId === "RemoteA") {
        throw new Error("remote A unavailable");
      }

      return { data: { systemMessages: [{ systemMessageRemoteId: "RemoteB" }] } };
    });

    await expect(fetchShopSystemMessageRemoteId({
      shopId: SHOP_ID,
      shopifyShopId: SHOPIFY_SHOP_ID,
    })).resolves.toBe("RemoteB");
  });
});

describe("fetchUpdateFilesToProcessCount", () => {
  it("excludes exactly the canonical terminal DataManager statuses", async () => {
    harness.api.mockResolvedValue({ data: { entityValueListCount: 3 } });

    await expect(fetchUpdateFilesToProcessCount({ shopId: SHOP_ID })).resolves.toBe(3);

    const request = harness.api.mock.calls[0][0];
    expect(request.data.customParametersMap.statusId).toEqual([
      "DmlsFinished",
      "DmlsFailed",
      "DmlsCrashed",
      "DmlsCancelled",
    ]);
    expect(request.data.customParametersMap.statusId).not.toContain("DmlSuccess");
    expect(request.data.customParametersMap.statusId).not.toContain("DmlError");
  });
});

describe('product mapping inspection', () => {
  const input = {productId: '8176602415268', systemMessageRemoteId: 'remote-a', productStoreId: 'store-a'};
  const variant = (id: string) => ({legacyResourceId: id, title: id, inventoryItem: {id: `gid://shopify/InventoryItem/${id}`, tracked: true}});
  const page = (id: string, hasNextPage = false, endCursor = '') => ({data: {response: {product: {variants: {nodes: [variant(id)], pageInfo: {hasNextPage, endCursor}}}}}});
  it('loads all variant pages and preserves missing and ambiguous mappings', async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValueOnce(page('1', true, 'next'))
      .mockResolvedValueOnce({data: {entityValueList: [{shopifyProductId: '1', productId: 'A'}, {shopifyProductId: '1', productId: 'B'}]}})
      .mockResolvedValueOnce(page('2'))
      .mockResolvedValueOnce({data: {entityValueList: []}});
    const result = await fetchProductMappings(input);
    expect(result.map(row => row.mappings.length)).toEqual([2, 0]);
    expect(harness.api.mock.calls[2][0].data.variables.after).toBe('next');
    expect(harness.api.mock.calls[1][0].data.customParametersMap).toEqual({productStoreId: 'store-a', shopifyProductId: ['1']});
  });
  it('does not present an invalid OMS response as zero mappings', async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValueOnce(page('1')).mockResolvedValueOnce({data: {}});
    await expect(fetchProductMappings(input)).rejects.toThrow('HotWax product mappings were not returned');
  });
  it('stops on a repeated Shopify cursor instead of showing partial results', async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValueOnce(page('1', true, 'same')).mockResolvedValueOnce({data: {entityValueList: []}})
      .mockResolvedValueOnce(page('2', true, 'same')).mockResolvedValueOnce({data: {entityValueList: []}});
    await expect(fetchProductMappings(input)).rejects.toThrow('pagination did not advance');
  });
});
