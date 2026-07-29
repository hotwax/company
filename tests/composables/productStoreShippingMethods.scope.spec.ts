import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

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
      ? computed(() => harness.records.value.filter(
        (row: any) => row[options.scope.field] === options.scope.value,
      ))
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

describe("useProductStoreShippingMethods scope", () => {
  beforeEach(() => {
    harness.records = ref([STORE_A_METHOD, STORE_B_METHOD]);
    harness.hydrated = ref(true);
  });

  it("preserves static string scoping", () => {
    const { shippingMethods } = useProductStoreShippingMethods("STORE_A");

    expect(shippingMethods.value).toEqual([STORE_A_METHOD]);
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
});
