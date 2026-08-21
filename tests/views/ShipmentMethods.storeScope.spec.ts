// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref, toValue } from "vue";

/**
 * The NetSuite product store is discovered from the cached store list after setup. Shipment
 * methods must react to that late ID and exclude every other store in the all-store cache.
 */

const harness = vi.hoisted(() => ({
  netSuiteProductStore: undefined as any,
  allMethods: undefined as any,
}));

vi.mock("@common", () => ({
  translate: (key: string) => key,
}));

vi.mock("@/composables/useProductStores", () => ({
  useNetSuiteProductStore: () => ({
    netSuiteProductStore: harness.netSuiteProductStore,
    hydrated: ref(true),
  }),
  useProductStoreShippingMethods: (productStoreId?: any) => ({
    shippingMethods: computed(() => {
      const selectedId = toValue(productStoreId);
      return selectedId
        ? harness.allMethods.value.filter((row: any) => row.productStoreId === selectedId)
        : [];
    }),
    hydrated: ref(true),
  }),
}));

vi.mock("@/composables/useNetSuite", () => ({
  useNetSuite: () => ({
    mappings: ref([]),
    editNetSuiteId: vi.fn(),
    removeNetSuiteId: vi.fn(),
  }),
}));

vi.mock("@/composables/useSeed", () => ({
  useShipmentMethodTypes: () => ({ shipmentMethodTypes: ref([]), hydrated: ref(true) }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyCarrierShipments: () => ({ byCarrierAndMethod: ref({}), hydrated: ref(true) }),
}));

async function mountView() {
  vi.stubEnv(
    "VITE_NETSUITE_INTEGRATION_TYPE_MAPPING",
    JSON.stringify({ SHIPPING_METHOD_TYPE_ID: "NETSUITE_SHP_MTHD" }),
  );
  const ShipmentMethods = (await import("@/views/ShipmentMethods.vue")).default;
  const wrapper = mount(ShipmentMethods, { global: { stubs: { IonBackButton: true } } });
  await flushPromises();
  return wrapper;
}

describe("NetSuite shipment-method product-store scope", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.netSuiteProductStore = ref(null);
    harness.allMethods = ref([
      {
        productStoreShipMethId: "PSM_A",
        productStoreId: "STORE_A",
        partyId: "FEDEX",
        shipmentMethodTypeId: "METHOD_FROM_STORE_A",
      },
      {
        productStoreShipMethId: "PSM_B",
        productStoreId: "STORE_B",
        partyId: "FEDEX",
        shipmentMethodTypeId: "METHOD_FROM_STORE_B",
      },
    ]);
  });

  it("renders nothing before store discovery, then only the configured NetSuite store", async () => {
    const wrapper = await mountView();

    expect(wrapper.text()).not.toContain("METHOD_FROM_STORE_A");
    expect(wrapper.text()).not.toContain("METHOD_FROM_STORE_B");

    harness.netSuiteProductStore.value = {
      productStoreId: "STORE_B",
      subsidiaryId: "SUBSIDIARY_1",
    };
    await flushPromises();

    expect(wrapper.text()).not.toContain("METHOD_FROM_STORE_A");
    expect(wrapper.text()).toContain("METHOD_FROM_STORE_B");
  });
});
