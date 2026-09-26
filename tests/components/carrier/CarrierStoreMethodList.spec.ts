// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  commonUtil: {
    hasError: () => false,
  },
  api: vi.fn(async () => ({ data: [] })),
}));

const IonToggleStub = defineComponent({
  name: "IonToggle",
  inheritAttrs: false,
  props: {
    checked: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ["ionChange"],
  template: `
    <button
      v-bind="$attrs"
      role="switch"
      :disabled="disabled"
      @click="!disabled && $emit('ionChange', { detail: { checked: !checked } })"
    >
      <slot />
    </button>
  `,
});

const store = {
  productStoreId: "STORE_A",
  storeName: "Alpha Store",
};
const ground = {
  shipmentMethodTypeId: "GROUND",
  description: "Ground",
  isConfigured: true,
};
const association = {
  productStoreShipMethId: "PSM_1",
  productStoreId: "STORE_A",
  partyId: "UPS",
  roleTypeId: "CARRIER",
  shipmentMethodTypeId: "GROUND",
  shipmentGatewayConfigId: "UNIGATE_CONFIG",
  isTrackingRequired: "Y",
};

async function mountList(
  associations: any[] = [association],
  overrides: Record<string, unknown> = {},
) {
  const CarrierStoreMethodList = (await import("@/components/carrier/CarrierStoreMethodList.vue")).default;

  return mount(CarrierStoreMethodList, {
    props: {
      store,
      methods: [ground],
      associations,
      disabled: false,
      pendingKeys: [],
      ...overrides,
    },
    global: {
      stubs: {
        IonToggle: IonToggleStub,
      },
    },
  });
}

describe("CarrierStoreMethodList", () => {
  it("displays the gateway ID as read-only and emits association/tracking intents", async () => {
    const wrapper = await mountList();

    expect(wrapper.text()).toContain("Ground");
    expect(wrapper.text()).toContain("UNIGATE_CONFIG");
    expect(wrapper.find("ion-input").exists()).toBe(false);

    await wrapper.get("[aria-label=\"Associate Ground with Alpha Store\"]",).trigger("click");
    await wrapper.get("[aria-label=\"Require tracking for Ground\"]",).trigger("click");

    expect(wrapper.emitted("toggle-association")?.[0]?.[0]).toEqual({
      method: ground,
      association,
      enabled: false,
    });
    expect(wrapper.emitted("toggle-tracking")?.[0]?.[0]).toEqual({
      method: ground,
      association,
      required: false,
    });
  });

  it("can request a new association without inventing gateway configuration", async () => {
    const wrapper = await mountList([]);

    expect(wrapper.text()).not.toContain("Shipment gateway ID");
    expect(wrapper.text()).not.toContain("Tracking required");

    await wrapper.get("[aria-label=\"Associate Ground with Alpha Store\"]",).trigger("click");

    expect(wrapper.emitted("toggle-association")?.[0]?.[0]).toEqual({
      method: ground,
      association: undefined,
      enabled: true,
    });
  });

  it("locks tracking while that method's association is being changed", async () => {
    const wrapper = await mountList([association], {
      pendingKeys: ["store:STORE_A:GROUND:association"],
    });
    const associationToggle = wrapper.get("[aria-label=\"Associate Ground with Alpha Store\"]",);
    const trackingToggle = wrapper.get("[aria-label=\"Require tracking for Ground\"]",);

    expect(associationToggle.element.disabled).toBe(true);
    expect(trackingToggle.element.disabled).toBe(true);
  });
});
