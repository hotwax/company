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
  useTransferMappingResolution,
  refreshMappedProductSearchIndex,
  fetchShopSystemMessageRemoteId,
  fetchUpdateFilesToProcessCount,
} from "@/composables/useShopify";

const { fetchChoices: fetchTransferMappingChoices, keepMapping: keepTransferProductMapping, fetchRecentOrders } = useTransferMappingResolution();

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


describe("transfer product mapping resolution", () => {
  const row = (variantId: string) => ({ shopId: "100051", productId: "100198", shopifyProductId: variantId, shopifyInventoryItemId: "9" + variantId });
  const mapped = (variantId: string) => ({ productId: "100198", variantId, inventoryItemId: "9" + variantId, available: true });
  const variants = (ids = ["1", "2"]) => ({ data: { statusCode: 200, response: { nodes: ids.map(id => ({
    id: `gid://shopify/ProductVariant/${id}`, title: "L", sku: "same-sku", inventoryItem: { id: `gid://shopify/InventoryItem/9${id}` },
    product: { id: `gid://shopify/Product/8${id}`, title: id === "1" ? "Carbon" : "Bundle(Test)", status: id === "1" ? "ACTIVE" : "DRAFT" },
  })) } } });

  it("shows both live variants without assuming Draft means an incorrect mapping", async () => {
    harness.api.mockResolvedValueOnce({ data: [row("1"), row("2")] }).mockResolvedValueOnce(variants());
    const choices = await fetchTransferMappingChoices("100051", "100198");
    expect(choices.map(choice => [choice.title, choice.status, choice.available])).toEqual([["Carbon", "ACTIVE", true], ["Bundle(Test)", "DRAFT", true]]);
    expect(harness.api.mock.calls.every(([request]) => request.method !== "DELETE")).toBe(true);
  });

  it("reports whether each listing is published on the Online Store", async () => {
    const published = variants();
    published.data.response.nodes[0].product.onlineStoreUrl = "https://example.test/products/carbon";
    harness.api.mockResolvedValueOnce({ data: [row("1"), row("2")] }).mockResolvedValueOnce(published);
    const choices = await fetchTransferMappingChoices("100051", "100198");
    expect(choices.map(choice => choice.onlineStorePublished)).toEqual([true, false]);
  });

  it("rejects a mapping read that includes another shop or product", async () => {
    harness.api.mockResolvedValueOnce({ data: [{ ...row("1"), shopId: "other-shop" }] });
    await expect(fetchTransferMappingChoices("100051", "100198")).rejects.toThrow("could not be verified");
  });

  it("prevents a stale selection from deleting a newly changed mapping", async () => {
    harness.api.mockResolvedValueOnce({ data: [row("1"), row("3")] }).mockResolvedValueOnce(variants(["1", "3"]));
    await expect(keepTransferProductMapping("100051", "100198", "1", [mapped("1"), mapped("2")])).rejects.toThrow("Mappings changed");
    expect(harness.api.mock.calls.every(([request]) => request.method !== "DELETE")).toBe(true);
  });

  it("removes only the unselected mapping in the selected shop and verifies what remains", async () => {
    harness.api.mockResolvedValueOnce({ data: [row("1"), row("2")] }).mockResolvedValueOnce(variants())
      .mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: [row("1")] });
    await keepTransferProductMapping("100051", "100198", "1", [mapped("1"), mapped("2")]);
    expect(harness.api.mock.calls.filter(([request]) => request.method === "DELETE").map(([request]) => request)).toEqual([
      { url: "sob/products/100198/shopifyShopProducts", method: "DELETE", params: { shopId: "100051", shopifyProductId: "2" } },
    ]);
  });

  it("reports an uncertain write without replaying a delete", async () => {
    harness.api.mockResolvedValueOnce({ data: [row("1"), row("2")] }).mockResolvedValueOnce(variants()).mockRejectedValueOnce(new Error("Lost response"));
    await expect(keepTransferProductMapping("100051", "100198", "1", [mapped("1"), mapped("2")])).rejects.toThrow("Some mappings may have changed");
    expect(harness.api.mock.calls.filter(([request]) => request.method === "DELETE")).toHaveLength(1);
  });

  it("does not treat a rejected mapping removal as success", async () => {
    harness.api.mockResolvedValueOnce({ data: [row("1"), row("2")] }).mockResolvedValueOnce(variants()).mockResolvedValueOnce({ data: { errors: ["Denied"] } });
    harness.hasError.mockReturnValue(true);
    await expect(keepTransferProductMapping("100051", "100198", "1", [mapped("1"), mapped("2")])).rejects.toThrow("could not be fully verified");
  });
});

describe("recent orders for duplicate transfer mappings", () => {
  const choice = (variantId: string, sku = "same-sku") => ({ productId: "100198", variantId, inventoryItemId: `9${variantId}`, sku, available: true });
  const line = (variantId: string, quantity = 1, sku = "same-sku") => ({ sku, quantity, variant: { id: `gid://shopify/ProductVariant/${variantId}` } });
  const page = (orders: any[], hasNextPage = false) => ({ data: { statusCode: 200, response: { orders: {
    pageInfo: { hasNextPage, endCursor: hasNextPage ? "next" : null }, nodes: orders,
  } } } });

  it("credits each order to the variant on its line item, since both listings share the SKU", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValueOnce(page([
      { id: "o1", createdAt: "2026-10-01T10:00:00Z", sourceName: "pos", lineItems: { nodes: [line("1", 2)] } },
      { id: "o2", createdAt: "2026-10-03T10:00:00Z", sourceName: "web", lineItems: { nodes: [line("1"), line("1")] } },
      { id: "o3", createdAt: "2026-10-02T10:00:00Z", sourceName: "1528379", lineItems: { nodes: [line("2"), line("9", 1, "other-sku")] } },
    ]));
    const activity = await fetchRecentOrders("100051", [choice("1"), choice("2")], 30);

    // o2 has the variant on two lines: one order, two units.
    expect(activity["1"]).toEqual({ orders: 2, units: 4, lastOrderAt: "2026-10-03T10:00:00Z", channels: { pos: 1, web: 1 }, capped: false });
    expect(activity["2"]).toEqual({ orders: 1, units: 1, lastOrderAt: "2026-10-02T10:00:00Z", channels: { "1528379": 1 }, capped: false });
    // One search per shared SKU, scoped to the window.
    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(harness.api.mock.calls[0][0].data.variables.query).toMatch(/^sku:"same-sku" created_at:>=\d{4}-\d{2}-\d{2}$/);
  });

  it("marks the counts as a lower bound when more pages remain than it reads", async () => {
    harness.api.mockReset();
    for(let i = 0; i < 5; i++) {
      harness.api.mockResolvedValueOnce(page([{ id: `o${i}`, createdAt: "2026-10-01T10:00:00Z", sourceName: "pos", lineItems: { nodes: [line("1")] } }], true));
    }
    const activity = await fetchRecentOrders("100051", [choice("1"), choice("2")], 30);

    expect(harness.api).toHaveBeenCalledTimes(5);
    expect(activity["1"].orders).toBe(5);
    expect(activity["1"].capped).toBe(true);
    expect(activity["2"].capped).toBe(true);
  });

  it("fails loudly instead of reporting no orders when Shopify refuses the read", async () => {
    harness.api.mockReset();
    harness.api.mockResolvedValueOnce({ data: { statusCode: 200, graphqlErrors: [{ message: "Access denied" }], response: {} } });
    await expect(fetchRecentOrders("100051", [choice("1"), choice("2")], 30)).rejects.toThrow("could not be loaded");
  });
});
