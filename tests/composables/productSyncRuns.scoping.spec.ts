import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

/** Two remotes' product messages in one table — the shape the cache actually holds. */
const CACHED_MESSAGES = [
  // 10010's remote: newest, but none of the newest imported anything.
  { systemMessageId: "M228405", systemMessageRemoteId: "RemoteB", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1784713582739 },
  { systemMessageId: "M228397", systemMessageRemoteId: "RemoteB", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1784712742271 },
  // 10010's remote, older, and this one DID import.
  { systemMessageId: "M227136", systemMessageRemoteId: "RemoteB", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1784618182975 },
  // 10000's remote: much older, never imported.
  { systemMessageId: "M173624", systemMessageRemoteId: "RemoteA", systemMessageTypeId: "BulkQueryShopifyProductUpdates", statusId: "SmsgConsumed", initDate: 1780294963354 },
];

const CACHED_LOGS = [
  { logId: "M101074", configId: "SYNC_SHOPIFY_PRODUCT", systemMessageId: "M227136", statusId: "DmlsFinished", totalRecordCount: 1, failedRecordCount: 0 },
];

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: vi.fn((entity: any) => ({
    rows: { value: [] },
    records: { value: entity.__kind === "logs" ? CACHED_LOGS : CACHED_MESSAGES },
    hydrated: { value: true },
  })),
  useCachedRecord: vi.fn(() => ({ record: { value: undefined }, hydrated: { value: true } })),
  byDescription: () => 0,
}));

vi.mock("@/utils/cacheEntities", () => ({
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

vi.mock("@/composables/useSeed", () => ({ useStatuses: () => ({ labelFor: (s: string) => s }) }));
vi.mock("@/composables/useCacheSync", () => ({ useCacheSync: () => ({ start: vi.fn(), stop: vi.fn() }) }));
vi.mock("@/composables/useServiceJobs", () => ({ useServiceJob: () => ({ updateJob: vi.fn(), runNow: vi.fn() }) }));
vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({ ensureSystemMessageErrors: vi.fn(), fetchShopifyBulkOperation: vi.fn() }),
}));
vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(), bootstrapState: { running: false },
}));

import { useShopifyProductSyncRuns } from "@/composables/useShopify";

/**
 * L1 unit — one shop must never read another shop's runs.
 *
 * The live bug: the remote was passed as `ctx.remoteId.value`, unwrapped at setup. The remote is
 * itself a cached join, so on a cold cache that value is `""`, the scope was omitted, and the query
 * read EVERY remote's messages. Shop 10000 then displayed shop 10010's "Last synced on Jul 21" with
 * 1 record processed — 10000's own newest run was six weeks earlier and had imported nothing. The
 * same staleness reappeared when navigating between shops, because the query kept whichever remote it
 * was constructed with.
 *
 * So the remote has to be reactive, and an unresolved remote must yield NOTHING rather than
 * everything — an empty scope is the dangerous default here.
 */
describe("useShopifyProductSyncRuns — remote scoping", () => {
  it("returns only the requested remote's runs", () => {
    const { runs } = useShopifyProductSyncRuns(() => "RemoteA", "BulkQueryShopifyProductUpdates", 200);

    expect(runs.value.map((r: any) => r.systemMessageId)).toEqual(["M173624"]);
  });

  it("does not leak the other remote's completed run", () => {
    const { runs } = useShopifyProductSyncRuns(() => "RemoteA", "BulkQueryShopifyProductUpdates", 200);

    // M227136 is the only run with an import, and it belongs to RemoteB.
    expect(runs.value.some((r: any) => r.mdmLog)).toBe(false);
  });

  it("finds the other remote's completed run when asked for that remote", () => {
    const { runs } = useShopifyProductSyncRuns(() => "RemoteB", "BulkQueryShopifyProductUpdates", 200);

    const withImport = runs.value.filter((r: any) => r.mdmLog);
    expect(withImport).toHaveLength(1);
    expect(withImport[0].systemMessageId).toBe("M227136");
    expect(withImport[0].totalRecordCount).toBe(1);
  });

  it("yields NOTHING while the remote is unresolved, rather than every remote", () => {
    // The cold-cache case that caused the leak.
    const { runs } = useShopifyProductSyncRuns(() => "", "BulkQueryShopifyProductUpdates", 200);

    expect(runs.value).toEqual([]);
  });

  it("tracks a change of remote", () => {
    const remoteId = ref("RemoteA");
    const { runs } = useShopifyProductSyncRuns(() => remoteId.value, "BulkQueryShopifyProductUpdates", 200);

    expect(runs.value.map((r: any) => r.systemMessageId)).toEqual(["M173624"]);

    remoteId.value = "RemoteB";
    expect(runs.value.map((r: any) => r.systemMessageId))
      .toEqual(["M228405", "M228397", "M227136"]);
  });

  it("applies the limit AFTER scoping, so N means N for this remote", () => {
    // Limiting first would spend the budget on RemoteB's newer rows and return fewer for RemoteA.
    const { runs } = useShopifyProductSyncRuns(() => "RemoteA", "BulkQueryShopifyProductUpdates", 1);

    expect(runs.value).toHaveLength(1);
    expect(runs.value[0].systemMessageId).toBe("M173624");
  });
});
