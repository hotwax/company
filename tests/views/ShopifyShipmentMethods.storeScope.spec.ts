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
  addShipmentMethod: vi.fn(),
  createShipmentMethodType: vi.fn(),
  saveCarrierShipment: vi.fn(),
  refreshCarrierShipments: vi.fn(),
  resyncDomain: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: harness.showToast },
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
  useProductStoreMutations: () => ({ addShipmentMethod: harness.addShipmentMethod }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShop: () => ({ record: harness.shop, hydrated: ref(true) }),
  useShopifyCarrierShipments: () => ({ byCarrierAndMethod: ref({}), hydrated: ref(true) }),
  useShopifyShopMutations: () => ({
    saveCarrierShipment: harness.saveCarrierShipment,
    refreshCarrierShipments: harness.refreshCarrierShipments,
  }),
}));

vi.mock("@/composables/useSeed", () => ({
  useShipmentMethodTypes: () => ({ shipmentMethodTypes: ref([]), hydrated: ref(true) }),
  useShipmentMethodTypeMutations: () => ({
    createShipmentMethodType: harness.createShipmentMethodType,
  }),
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  resyncDomain: harness.resyncDomain,
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
  const wrapper = mount(ShopifyShipmentMethods, {
    props: { id: "SHOP_A" },
    global: {
      stubs: {
        IonModal: { template: "<div><slot /></div>" },
      },
    },
  });
  await flushPromises();

  return wrapper;
}

describe("Shopify shipment-method product-store scope", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
    harness.addShipmentMethod.mockResolvedValue({ data: {} });
    harness.createShipmentMethodType.mockResolvedValue({ data: {} });
    harness.saveCarrierShipment.mockResolvedValue({ data: {} });
    harness.refreshCarrierShipments.mockResolvedValue(undefined);
    harness.resyncDomain.mockResolvedValue(undefined);
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

  it("does not replay committed create stages when a later stage is retried", async () => {
    harness.shop.value = { shopId: "SHOP_A", productStoreId: "STORE_A" };
    const committedRefreshError = () => Object.assign(new Error("cache unavailable"), {
      name: "CacheReconciliationError",
      mutationCommitted: true,
    });
    harness.createShipmentMethodType.mockRejectedValueOnce(committedRefreshError());
    harness.addShipmentMethod.mockRejectedValueOnce(committedRefreshError());
    harness.saveCarrierShipment
      .mockRejectedValueOnce(new Error("mapping rejected"))
      .mockResolvedValueOnce({ data: {} });
    const wrapper = await mountView();

    await wrapper.find("ion-button[aria-label=\"Create shipment method\"]").trigger("click");
    const inputs = wrapper.findAllComponents({ name: "IonInput" });
    expect(inputs).toHaveLength(2);
    await inputs[0].setValue("Next day");
    await inputs[1].setValue("Next-day delivery");
    await flushPromises();

    const save = wrapper.find("ion-fab-button");
    await save.trigger("click");
    await flushPromises();
    expect(harness.saveCarrierShipment).toHaveBeenCalledTimes(1);

    await save.trigger("click");
    await flushPromises();

    expect(harness.createShipmentMethodType).toHaveBeenCalledTimes(1);
    expect(harness.addShipmentMethod).toHaveBeenCalledTimes(1);
    expect(harness.saveCarrierShipment).toHaveBeenCalledTimes(2);
    expect(harness.showToast).toHaveBeenLastCalledWith("Shipment method created successfully");
  });
});
