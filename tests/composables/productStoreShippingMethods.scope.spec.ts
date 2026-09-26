import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";

/**
 * Product-store shipment methods share one all-store cache. Scoping must therefore follow a
 * reactive productStoreId rather than freezing a Dexie scope while that ID is still undefined.
 */

const harness = vi.hoisted(() => ({
  records: undefined as any,
  hydrated: undefined as any,
}));

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: vi.fn(() => false) },
  logger: { error: vi.fn() },
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (_error: any, fallback: string) => fallback,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));

vi.mock("@/utils/cacheEntities", () => ({
  productStoreCache: { __kind: "stores" },
  productStoreFacilityCache: { __kind: "facilities" },
  productStoreShipmentCountCache: { __kind: "counts" },
  productStoreShippingMethodCache: { __kind: "shippingMethods" },
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (_entity: any, options: any = {}) => {
    const records = options.scope
      ? computed(() => harness.records.value.filter((row: any) => row[options.scope.field] === options.scope.value,))
      : harness.records;

    return { records, rows: records, hydrated: harness.hydrated };
  },
  useCachedRecord: vi.fn(),
}));

import { useProductStoreShippingMethods } from "@/composables/useProductStores";

const STORE_A_METHOD = {
  productStoreShipMethId: "PSM_A",
  productStoreId: "STORE_A",
  partyId: "FEDEX",
  shipmentMethodTypeId: "GROUND_A",
};
const STORE_B_METHOD = {
  productStoreShipMethId: "PSM_B",
  productStoreId: "STORE_B",
  partyId: "FEDEX",
  shipmentMethodTypeId: "GROUND_B",
};
const EXPIRED_STORE_A_METHOD = {
  productStoreShipMethId: "PSM_A_EXPIRED",
  productStoreId: "STORE_A",
  partyId: "FEDEX",
  shipmentMethodTypeId: "EXPRESS_A",
  fromDate: 1,
  thruDate: 2,
};

describe("useProductStoreShippingMethods scope", () => {
  beforeEach(() => {
    harness.records = ref([STORE_A_METHOD, STORE_B_METHOD, EXPIRED_STORE_A_METHOD]);
    harness.hydrated = ref(true);
  });

  it("preserves static string scoping", () => {
    const { shippingMethods } = useProductStoreShippingMethods("STORE_A");

    expect(shippingMethods.value).toEqual([STORE_A_METHOD]);
  });

  it("excludes date-expired shipment-method history from existing store screens", () => {
    const { shippingMethods } = useProductStoreShippingMethods("STORE_A");

    expect(shippingMethods.value.map((row: any) => row.productStoreShipMethId))
      .toEqual(["PSM_A"]);
  });

  it("fails closed when a caller omits the store scope", () => {
    const { shippingMethods } = useProductStoreShippingMethods();

    expect(shippingMethods.value).toEqual([]);
  });

  it("stays empty until a reactive store ID arrives, then follows later ID changes", () => {
    const productStoreId = ref<string>();
    const { shippingMethods } = useProductStoreShippingMethods(productStoreId);

    expect(shippingMethods.value).toEqual([]);

    productStoreId.value = "STORE_A";
    expect(shippingMethods.value).toEqual([STORE_A_METHOD]);

    productStoreId.value = "STORE_B";
    expect(shippingMethods.value).toEqual([STORE_B_METHOD]);
  });

  it("re-evaluates automatically when a date-effective boundary passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    harness.records.value = [
      {
        ...STORE_A_METHOD,
        fromDate: 1_001,
      },
      {
        ...EXPIRED_STORE_A_METHOD,
        productStoreShipMethId: "PSM_ACTIVE_UNTIL_BOUNDARY",
        thruDate: 1_002,
      },
    ];
    const scope = effectScope();
    const result = scope.run(() => useProductStoreShippingMethods("STORE_A"))!;

    expect(result.shippingMethods.value.map((row: any) => row.productStoreShipMethId))
      .toEqual(["PSM_ACTIVE_UNTIL_BOUNDARY"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(result.shippingMethods.value.map((row: any) => row.productStoreShipMethId))
      .toEqual(["PSM_A", "PSM_ACTIVE_UNTIL_BOUNDARY"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(result.shippingMethods.value.map((row: any) => row.productStoreShipMethId))
      .toEqual(["PSM_A"]);

    scope.stop();
    vi.useRealTimers();
  });
});
