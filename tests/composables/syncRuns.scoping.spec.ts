import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

/**
 * The spine as the cache holds it: two shops' runs in ONE table, projected (so `shopId` is present —
 * it is renamed from the document's `remoteInternalId` and exists only after projection).
 */
const SPINE_ROWS = [
  // shop 10010, newest, imported nothing.
  { systemMessageId: "M228405", shopId: "10010", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1784713582739, raw: {} },
  { systemMessageId: "M228397", shopId: "10010", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1784712742271, raw: {} },
  // shop 10010, older, and this one DID import.
  { systemMessageId: "M227136", shopId: "10010", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1784618182975, logId: "M101074", totalRecordCount: 1, raw: {} },
  // shop 10000: older still, never imported.
  { systemMessageId: "M173624", shopId: "10000", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1780294963354, raw: {} },
  // a different feature's run for shop 10010 — must not bleed into a product-sync read.
  { systemMessageId: "M228520", shopId: "10010", systemMessageTypeId: "ShopifyOrderSync", statusId: "SmsgConsumed", initDate: 1784713999999, raw: {} },
];

const MESSAGES = [{ systemMessageId: "M227136", statusId: "SmsgConsumed", messageText: "mutation { … }" }];
const LOGS = [{ logId: "M101074", configId: "SYNC_SHOPIFY_PRODUCT", systemMessageId: "M227136", statusId: "DmlsFinished", totalRecordCount: 1 }];

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: vi.fn((entity: any) => ({
    rows: { value: entity.__kind === "syncRuns" ? SPINE_ROWS : [] },
    records: { value: entity.__kind === "messages" ? MESSAGES : entity.__kind === "logs" ? LOGS : [] },
    hydrated: { value: true },
  })),
  useCachedRecord: vi.fn(() => ({ record: { value: undefined }, hydrated: { value: true } })),
  byDescription: () => 0,
}));

vi.mock("@/utils/cacheEntities", () => ({
  syncRunCache: { __kind: "syncRuns" },
  systemMessageCache: { __kind: "messages" },
  dataManagerLogCache: { __kind: "logs" },
  shopifyBulkOperationCache: { __kind: "bulkOps" },
  systemMessageErrorCache: { __kind: "errors" },
  systemMessageRemoteCache: { __kind: "remotes" },
  shopifyShopCache: { __kind: "shops" },
  productStoreCache: { __kind: "stores" },
  serviceJobCache: { __kind: "jobs" },
  shopifyLocationCache: { __kind: "locations" },
  shopifyTypeMappingCache: { __kind: "typeMappings" },
  shopifyCarrierShipmentCache: { __kind: "carrierShipments" },
}));

const hydrate = vi.hoisted(() => ({ messages: [] as string[], logs: [] as string[] }));
vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    ensureSystemMessageById: vi.fn(async (id: string) => { hydrate.messages.push(id); return null; }),
    ensureSystemMessageErrors: vi.fn(),
    fetchShopifyBulkOperation: vi.fn(),
  }),
}));
vi.mock("@/composables/useDataManager", () => ({
  useDataManager: () => ({
    ensureDataManagerLog: vi.fn(async (id: string) => { hydrate.logs.push(id); return null; }),
  }),
  useRecentDataManagerLogs: () => ({ logs: { value: [] }, totalFailedRecords: { value: 0 }, hydrated: { value: true } }),
}));
vi.mock("@/composables/useSeed", () => ({ useStatuses: () => ({ labelFor: (s: string) => s }) }));
vi.mock("@/composables/useCacheSync", () => ({ useCacheSync: () => ({ start: vi.fn(), stop: vi.fn() }) }));
vi.mock("@/composables/useServiceJobs", () => ({ useServiceJob: () => ({ updateJob: vi.fn(), runNow: vi.fn() }) }));
vi.mock("@/services/appCacheBootstrap", () => ({ refreshAfterMutation: vi.fn(), bootstrapState: { running: false } }));

import { useShopifySyncRuns } from "@/composables/useShopify";

const ctxFor = (shopId: () => string) => ({ shopId: computed(shopId) }) as any;
const PRODUCT = ["BulkQueryShopifyProductUpdates"];

/**
 * L1 unit — one shop must never read another shop's runs.
 *
 * The bug this guards: the remote/shop was passed as an unwrapped `.value` at setup. Because it is
 * itself resolved from a cached join, that value is `""` on a cold cache — the scope was omitted and
 * the query read EVERY shop's rows. Shop 10000 then displayed shop 10010's "Last synced on Jul 21"
 * with 1 record processed, when 10000's own newest run was six weeks earlier and had imported nothing.
 *
 * Two properties follow, and both are asserted here: the shop must be reactive, and an UNRESOLVED shop
 * must yield NOTHING rather than everything — an empty scope is the dangerous default, not a safe one.
 */
describe("useShopifySyncRuns — shop scoping", () => {
  it("returns only the requested shop's runs", () => {
    const { records } = useShopifySyncRuns(ctxFor(() => "10000"), PRODUCT);

    expect(records.value.map((r: any) => r.systemMessageId)).toEqual(["M173624"]);
  });

  it("does not leak the other shop's completed run", () => {
    const { records } = useShopifySyncRuns(ctxFor(() => "10000"), PRODUCT);

    // M227136 is the only run with an import, and it belongs to shop 10010.
    expect(records.value.some((r: any) => r.logId)).toBe(false);
  });

  it("finds that completed run when asked for its own shop", () => {
    const { records } = useShopifySyncRuns(ctxFor(() => "10010"), PRODUCT);

    const withImport = records.value.filter((r: any) => r.logId);
    expect(withImport).toHaveLength(1);
    expect(withImport[0].systemMessageId).toBe("M227136");
    expect(withImport[0].totalRecordCount).toBe(1);
  });

  it("yields NOTHING while the shop is unresolved, rather than every shop", () => {
    // The cold-cache case that caused the leak.
    const { records } = useShopifySyncRuns(ctxFor(() => ""), PRODUCT);

    expect(records.value).toEqual([]);
  });

  it("tracks a change of shop", () => {
    const shopId = ref("10000");
    const { records } = useShopifySyncRuns(ctxFor(() => shopId.value), PRODUCT);

    expect(records.value.map((r: any) => r.systemMessageId)).toEqual(["M173624"]);

    shopId.value = "10010";
    expect(records.value.map((r: any) => r.systemMessageId))
      .toEqual(["M228405", "M228397", "M227136"]);
  });

  it("excludes another FEATURE's runs for the same shop", () => {
    // One table holds every feature's runs; a product-sync read must not see an order-sync run.
    const { records } = useShopifySyncRuns(ctxFor(() => "10010"), PRODUCT);

    expect(records.value.map((r: any) => r.systemMessageId)).not.toContain("M228520");
  });

  it("applies the limit AFTER scoping, so N means N for this shop", () => {
    // Limiting first would spend the budget on shop 10010's newer rows and return none for 10000.
    const { records } = useShopifySyncRuns(ctxFor(() => "10000"), PRODUCT, { limit: 1 });

    expect(records.value).toHaveLength(1);
    expect(records.value[0].systemMessageId).toBe("M173624");
  });
});

describe("useShopifySyncRuns — detail join", () => {
  it("attaches the cached message and import to the run", () => {
    const { records } = useShopifySyncRuns(ctxFor(() => "10010"), PRODUCT);
    const run = records.value.find((r: any) => r.systemMessageId === "M227136");

    expect(run.systemMessage?.messageText).toBe("mutation { … }");
    expect(run.mdmLog?.logId).toBe("M101074");
  });

  it("leaves detail null for a run whose records are not cached, rather than dropping the run", () => {
    // A run must still appear in the list while its enrichment is pending — dropping it would read as
    // "this shop has fewer runs than it does".
    const { records } = useShopifySyncRuns(ctxFor(() => "10010"), PRODUCT);
    const run = records.value.find((r: any) => r.systemMessageId === "M228405");

    expect(run).toBeTruthy();
    expect(run.systemMessage).toBeNull();
    expect(run.mdmLog).toBeNull();
  });
});
