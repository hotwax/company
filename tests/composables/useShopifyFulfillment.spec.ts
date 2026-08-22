import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L1 unit — the fulfillment sync list composables.
 *
 * Locked on their SCOPING: the message queue is per shop-remote-set (a shop can own several
 * remotes) and the synced feed is per shop — because "right field, wrong id" renders as a clean
 * empty page and has bitten this app repeatedly. The pure payload parsing is covered in
 * `tests/utils/shopifyFulfillment.spec.ts`; here it only proves it is APPLIED per row.
 *
 * The api client is stubbed at `@common` (importing the composable otherwise pulls `useAuth` →
 * `cookieHelper`, which has no browser context here) and the Dexie layer at `useCachedList`, the
 * read seam every cached entity goes through — the mock applies scope/equals/filter/sort the way
 * the real seam's options contract promises, so the composables' declared queries are exercised
 * rather than bypassed.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  bootstrapState: { running: false },
}));

const SHOP_ID = "10000";
const OTHER_SHOP_REMOTE = "OtherShopConfig";

const CACHE: Record<string, any[]> = {
  shops: [],
  stores: [],
  remotes: [],
  messages: [],
  fulfillmentHistories: [],
  fulfillmentHistorySupport: [],
};

function seedShopContext() {
  CACHE.shops = [{ shopId: SHOP_ID, shopifyShopId: "6973849727", productStoreId: "STORE" }];
  CACHE.stores = [{ productStoreId: "STORE", storeName: "HC Demo" }];
  CACHE.remotes = [
    {
      systemMessageRemoteId: "HCDemoShopifyConfig",
      internalId: SHOP_ID,
      internalIdType: "HOTWAX_SHOP_ID",
      remoteId: "6973849727",
      remoteIdType: "SHOPIFY_SHOP_ID",
      accessScopeEnumId: "SHOP_RW_ACCESS",
    },
    {
      systemMessageRemoteId: OTHER_SHOP_REMOTE,
      internalId: "10010",
      internalIdType: "HOTWAX_SHOP_ID",
      remoteId: "555000111",
      remoteIdType: "SHOPIFY_SHOP_ID",
      accessScopeEnumId: "SHOP_RW_ACCESS",
    },
  ];
}

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (entity: any, options: any = {}) => {
    let rows = [...(CACHE[entity?.__kind] ?? [])];
    if(options.scope) {
      rows = rows.filter((row) => String(row?.[options.scope.field]) === String(options.scope.value));
    }
    if(options.equals) {
      rows = rows.filter((row) =>
        Object.entries(options.equals).every(([field, value]) => row?.[field] === value));
    }
    if(options.filter) {rows = rows.filter(options.filter);}
    if(options.dateField) {
      rows = [...rows].sort((a, b) => ((b?.[options.dateField] as number) ?? 0) - ((a?.[options.dateField] as number) ?? 0));
    }
    if(options.limit) {rows = rows.slice(0, options.limit);}

    return { rows: { value: rows }, records: { value: rows }, hydrated: { value: true } };
  },
  useCachedRecord: () => ({ record: { value: undefined }, hydrated: { value: true } }),
  byDescription: () => 0,
}));

vi.mock("@/utils/cacheEntities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/cacheEntities")>()),
  dataManagerLogCache: { __kind: "logs" },
  productStoreCache: { __kind: "stores" },
  serviceJobCache: { __kind: "jobs" },
  serviceJobRunCache: { __kind: "jobRuns" },
  shopifyBulkOperationCache: { __kind: "bulkOps" },
  shopifyCarrierShipmentCache: { __kind: "carrierShipments" },
  shopifyFulfillmentHistoryCache: { __kind: "fulfillmentHistories" },
  shopifyFulfillmentHistorySupportCache: { __kind: "fulfillmentHistorySupport" },
  shopifyLocationCache: { __kind: "locations" },
  shopifyShopCache: { __kind: "shops" },
  shopifyTypeMappingCache: { __kind: "typeMappings" },
  inventoryEventDocumentCache: { __kind: "inventoryEventDocuments" },
  syncRunCache: { __kind: "syncRuns" },
  systemMessageCache: { __kind: "messages" },
  systemMessageErrorCache: { __kind: "errors" },
  systemMessageRemoteCache: { __kind: "remotes" },
}));

import {
  QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
  useQueuedFulfillments,
  useSyncedFulfillments,
} from "@/composables/useShopifyFulfillment";

describe("useQueuedFulfillments", () => {
  beforeEach(() => {
    seedShopContext();
    CACHE.messages = [
      {
        systemMessageId: "M1",
        systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
        systemMessageRemoteId: "HCDemoShopifyConfig",
        statusId: "SmsgError",
        failCount: "24",
        initDate: 300,
        lastAttemptDate: 350,
        orderId: "RAI-100461",
        messageText: JSON.stringify({
          shipmentId: "SHP-88214",
          orderId: "RAI-100461",
          shipmentItems: [{ orderItemSeqId: "00001", productId: "P100", quantity: 1, shopifyLineItemId: "L1" }],
        }),
      },
      {
        systemMessageId: "M2",
        systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
        systemMessageRemoteId: "HCDemoShopifyConfig",
        statusId: "SmsgProduced",
        initDate: 500,
        messageText: "{ not json",
      },
      // Delivered — off the queue by status.
      {
        systemMessageId: "M3",
        systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
        systemMessageRemoteId: "HCDemoShopifyConfig",
        statusId: "SmsgSent",
        initDate: 600,
      },
      // Another shop's remote — scoping must exclude it even though type and status match.
      {
        systemMessageId: "M4",
        systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
        systemMessageRemoteId: OTHER_SHOP_REMOTE,
        statusId: "SmsgProduced",
        initDate: 700,
      },
      // Different type on the right remote — the order-sync noise this screen must not render.
      {
        systemMessageId: "M5",
        systemMessageTypeId: "ShopifyOrderSync",
        systemMessageRemoteId: "HCDemoShopifyConfig",
        statusId: "SmsgProduced",
        initDate: 800,
      },
    ];
  });

  it("returns only this shop's queued messages, newest first, with the payload parsed", () => {
    const { rows, hydrated } = useQueuedFulfillments(() => SHOP_ID);

    expect(hydrated.value).toBe(true);
    expect(rows.value.map((row) => row.systemMessageId)).toEqual(["M2", "M1"]);

    const failed = rows.value[1];
    expect(failed).toMatchObject({
      statusId: "SmsgError",
      failCount: 24,
      initDate: 300,
      lastAttemptDate: 350,
      orderId: "RAI-100461",
      systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
    });
    expect(failed.parsed.items).toEqual([
      { orderItemSeqId: "00001", productId: "P100", quantity: 1, shopifyLineItemId: "L1" },
    ]);

    // The malformed payload still yields its row — with empty parsed fields, not a throw.
    expect(rows.value[0].parsed).toEqual({
      shipmentId: "", orderId: "", shopifyOrderId: "", trackingNumber: "", items: [],
    });
    expect(rows.value[0].failCount).toBe(0);
  });

  it("resolves to no rows while the shop is unknown", () => {
    const { rows } = useQueuedFulfillments(() => "");

    expect(rows.value).toEqual([]);
  });
});

describe("useSyncedFulfillments", () => {
  beforeEach(() => {
    seedShopContext();
    CACHE.fulfillmentHistories = [
      {
        fulfillmentKey: "10000:4471301884",
        shopId: SHOP_ID,
        fulfillmentId: "4471301884",
        shopifyOrderId: "5734893781",
        omsOrderId: "RAI-100488",
        shipmentId: "SHP-88801",
        originFacilityId: "STORE_118",
        orderDate: 100,
        shippedDate: 150,
        lastUpdatedStamp: 200,
      },
      {
        fulfillmentKey: "10000:4471302915",
        shopId: SHOP_ID,
        fulfillmentId: "4471302915",
        omsOrderId: "RAI-100491",
        shipmentId: "SHP-88815",
        processedDate: 380,
        lastUpdatedStamp: 400,
      },
      // Same numeric fulfillment id on ANOTHER shop — must not leak into this shop's feed.
      {
        fulfillmentKey: "10010:4471301884",
        shopId: "10010",
        fulfillmentId: "4471301884",
        lastUpdatedStamp: 999,
      },
    ];
    CACHE.fulfillmentHistorySupport = [];
  });

  it("scopes to the shop, newest lastUpdatedStamp first", () => {
    const { rows, hydrated, endpointMissing } = useSyncedFulfillments(() => SHOP_ID);

    expect(hydrated.value).toBe(true);
    expect(endpointMissing.value).toBe(false);
    expect(rows.value.map((row) => row.fulfillmentKey)).toEqual([
      "10000:4471302915",
      "10000:4471301884",
    ]);
    expect(rows.value[1]).toMatchObject({
      shopId: SHOP_ID,
      fulfillmentId: "4471301884",
      shopifyOrderId: "5734893781",
      omsOrderId: "RAI-100488",
      shipmentId: "SHP-88801",
      originFacilityId: "STORE_118",
      orderDate: 100,
      shippedDate: 150,
      lastUpdatedStamp: 200,
    });
    // Absent on an OMS-pushed row — a meaning the screen renders, never coerced to a value.
    expect(rows.value[1].processedDate).toBeUndefined();
    expect(rows.value[0].processedDate).toBe(380);
  });

  it("raises endpointMissing from the shop's recorded 404 verdict", () => {
    CACHE.fulfillmentHistorySupport = [{ shopId: SHOP_ID, isSupported: "N", checkedAt: 1 }];
    CACHE.fulfillmentHistories = [];

    const { rows, endpointMissing } = useSyncedFulfillments(() => SHOP_ID);

    expect(endpointMissing.value).toBe(true);
    expect(rows.value).toEqual([]);
  });

  it("keeps endpointMissing per shop", () => {
    CACHE.fulfillmentHistorySupport = [{ shopId: "10010", isSupported: "N", checkedAt: 1 }];

    const { endpointMissing } = useSyncedFulfillments(() => SHOP_ID);

    expect(endpointMissing.value).toBe(false);
  });
});
