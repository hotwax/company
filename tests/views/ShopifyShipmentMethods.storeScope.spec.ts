// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref, toValue } from "vue";

/**
 * A Shopify connection can hydrate after this route mounts. The rendered shipment methods must
 * follow that shop's eventual productStoreId and must never leak rows from another store.
 */

const harness = vi.hoisted(() => ({
  shop: undefined as any,
  allMethods: undefined as any,
}));

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  emitter: { emit: vi.fn() },
  logger: { error: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@/composables/useProductStores", () => ({
  useProductStoreShippingMethods: (productStoreId?: any) => ({
    shippingMethods: computed(() => {
      const selectedId = toValue(productStoreId);
      return selectedId
        ? harness.allMethods.value.filter((row: any) => row.productStoreId === selectedId)
        : [];
    }),
    hydrated: ref(true),
  }),
  useProductStoreMutations: () => ({ addShipmentMethod: vi.fn() }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShop: () => ({ record: harness.shop, hydrated: ref(true) }),
  useShopifyCarrierShipments: () => ({ byCarrierAndMethod: ref({}), hydrated: ref(true) }),
  useShopifyShopMutations: () => ({
    saveCarrierShipment: vi.fn(),
    refreshCarrierShipments: vi.fn(),
  }),
}));

vi.mock("@/composables/useSeed", () => ({
  useShipmentMethodTypes: () => ({ shipmentMethodTypes: ref([]), hydrated: ref(true) }),
  useShipmentMethodTypeMutations: () => ({ createShipmentMethodType: vi.fn() }),
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));

vi.mock("@/utils/navigation", () => ({
  shouldPopHistoryOnBack: () => false,
}));

vi.mock("vue-router", () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({
    back: vi.fn(),
    replace: vi.fn(),
    options: { history: { state: {} } },
  }),
}));

async function mountView() {
  const ShopifyShipmentMethods = (await import("@/views/ShopifyShipmentMethods.vue")).default;
  const wrapper = mount(ShopifyShipmentMethods, { props: { id: "SHOP_A" } });
  await flushPromises();
  return wrapper;
}

describe("Shopify shipment-method product-store scope", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.shop = ref();
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

  it("renders nothing while the shop is cold, then only rows from its resolved product store", async () => {
    const wrapper = await mountView();

    expect(wrapper.text()).not.toContain("METHOD_FROM_STORE_A");
    expect(wrapper.text()).not.toContain("METHOD_FROM_STORE_B");

    harness.shop.value = { shopId: "SHOP_A", productStoreId: "STORE_A" };
    await flushPromises();

    expect(wrapper.text()).toContain("METHOD_FROM_STORE_A");
    expect(wrapper.text()).not.toContain("METHOD_FROM_STORE_B");
  });
});
