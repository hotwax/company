// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
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
      type="button"
      role="switch"
      :aria-checked="String(checked)"
      :disabled="disabled"
      @click="!disabled && $emit('ionChange', { detail: { checked: !checked } })"
    >
      <slot />
    </button>
  `,
});

const methods = [
  {
    shipmentMethodTypeId: "GROUND",
    description: "Ground",
    carrierServiceCode: "03",
    deliveryDays: 5,
    sequenceNumber: 1,
    isConfigured: true,
  },
  {
    shipmentMethodTypeId: "NEXT_DAY",
    description: "Next day",
    carrierServiceCode: "01",
    deliveryDays: 1,
    sequenceNumber: 2,
    isConfigured: true,
  },
  {
    shipmentMethodTypeId: "TWO_DAY",
    description: "Two day",
    isConfigured: false,
  },
];

async function mountList(overrides: Record<string, unknown> = {}) {
  const CarrierMethodList = (await import("@/components/carrier/CarrierMethodList.vue")).default;
  const wrapper = mount(CarrierMethodList, {
    props: {
      methods,
      configuredOnly: false,
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
  await flushPromises();

  return wrapper;
}

function buttonWithText(wrapper: any, text: string) {
  const button = wrapper.findAll("ion-button").find((candidate: any) =>
    candidate.text().includes(text));

  if(!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function isDisabled(button: any) {
  return Object.prototype.hasOwnProperty.call(button.attributes(), "disabled") ||
    button.element.disabled === true;
}

describe("CarrierMethodList", () => {
  it("renders all global types or configured methods without mutating either input", async () => {
    const original = structuredClone(methods);
    const wrapper = await mountList();

    expect(wrapper.text()).toContain("Ground");
    expect(wrapper.text()).toContain("Next day");
    expect(wrapper.text()).toContain("Two day");

    await wrapper.setProps({ configuredOnly: true });

    expect(wrapper.text()).toContain("Ground");
    expect(wrapper.text()).toContain("Next day");
    expect(wrapper.text()).not.toContain("Two day");
    expect(methods).toEqual(original);
  });

  it("emits configured-only preference and enable intent without owning mutations", async () => {
    const wrapper = await mountList();

    await wrapper.get("[aria-label=\"Show configured methods only\"]").trigger("click");
    await buttonWithText(wrapper, "Enable").trigger("click");

    expect(wrapper.emitted("update:configuredOnly")).toEqual([[true]]);
    expect(wrapper.emitted("enable")?.[0]?.[0]).toMatchObject({
      shipmentMethodTypeId: "TWO_DAY",
    });
  });

  it("keeps reorder local until the user explicitly saves it", async () => {
    const wrapper = await mountList({ configuredOnly: true });

    await wrapper.get("[aria-label=\"Move Ground down\"]").trigger("click");

    expect(wrapper.emitted("save-order")).toBeUndefined();
    expect(wrapper.text().indexOf("Next day")).toBeLessThan(wrapper.text().indexOf("Ground"),);

    await buttonWithText(wrapper, "Save order").trigger("click");

    expect(wrapper.emitted("save-order")).toEqual([[
      [
        expect.objectContaining({ shipmentMethodTypeId: "NEXT_DAY" }),
        expect.objectContaining({ shipmentMethodTypeId: "GROUND" }),
      ],
    ]]);
  });

  it("overlays scalar refreshes onto the unsaved draft order", async () => {
    const wrapper = await mountList({ configuredOnly: true });

    await wrapper.get("[aria-label=\"Move Ground down\"]").trigger("click");
    await wrapper.setProps({
      methods: methods.map((method) =>
        method.shipmentMethodTypeId === "GROUND"
          ? { ...method, carrierServiceCode: "99" }
          : method),
    });

    expect(wrapper.text().indexOf("Next day")).toBeLessThan(wrapper.text().indexOf("Ground"),);
    expect(wrapper.text()).toContain("99");

    await buttonWithText(wrapper, "Save order").trigger("click");

    expect(wrapper.emitted("save-order")?.[0]?.[0]).toEqual([
      expect.objectContaining({ shipmentMethodTypeId: "NEXT_DAY" }),
      expect.objectContaining({
        shipmentMethodTypeId: "GROUND",
        carrierServiceCode: "99",
      }),
    ]);
  });

  it("locks every mutation control until the parent detail is ready", async () => {
    const wrapper = await mountList({ disabled: true });
    const mutationButtons = wrapper.findAll("ion-button").filter((button: any) =>
      ["Enable", "Edit", "Disable", "Rename type", "Create shipment method type", "Save order"]
        .some((label) => button.text().includes(label)));

    expect(mutationButtons.length).toBeGreaterThan(0);
    expect(mutationButtons.every(isDisabled)).toBe(true);
  });
});
