// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- test-only Ionic component stubs */
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
}));

const IonSearchbarStub = defineComponent({
  name: "IonSearchbar",
  props: {
    modelValue: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  template: `
    <input
      data-testid="facility-search"
      :value="modelValue"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
});

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
    />
  `,
});

const facilities = [
  {
    facilityId: "WAREHOUSE_1",
    facilityName: "Main warehouse",
    facilityTypeId: "WAREHOUSE",
    isConfigured: true,
    fromDate: 123,
  },
  {
    facilityId: "STORE_1",
    facilityName: "Retail store",
    facilityTypeId: "RETAIL_STORE",
    isConfigured: false,
  },
  {
    facilityId: "PARKING_1",
    facilityName: "Backorder parking",
    facilityTypeId: "BACKORDER",
    parentTypeId: "VIRTUAL_FACILITY",
    isConfigured: false,
  },
];

async function mountList(overrides: Record<string, unknown> = {}) {
  const CarrierFacilityList = (await import("@/components/carrier/CarrierFacilityList.vue")).default;

  return mount(CarrierFacilityList, {
    props: {
      facilities,
      disabled: false,
      pendingKeys: [],
      ...overrides,
    },
    global: {
      stubs: {
        IonSearchbar: IonSearchbarStub,
        IonToggle: IonToggleStub,
      },
    },
  });
}

describe("CarrierFacilityList", () => {
  it("shows searchable physical facilities and never renders virtual parkings", async () => {
    const wrapper = await mountList();

    expect(wrapper.text()).toContain("Main warehouse");
    expect(wrapper.text()).toContain("Retail store");
    expect(wrapper.text()).not.toContain("Backorder parking");

    await wrapper.get("[data-testid=\"facility-search\"]").setValue("retail");

    expect(wrapper.text()).not.toContain("Main warehouse");
    expect(wrapper.text()).toContain("Retail store");
  });

  it("emits the full date-effective row and requested association state", async () => {
    const wrapper = await mountList();

    await wrapper.get("[aria-label=\"Associate Main warehouse with carrier\"]",).trigger("click");

    expect(wrapper.emitted("toggle")?.[0]?.[0]).toEqual({
      facility: facilities[0],
      enabled: false,
    });
  });
});
