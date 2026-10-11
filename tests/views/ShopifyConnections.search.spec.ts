// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  translate: (key: string) => key,
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShops: () => ({
    records: ref([
      { shopId: "SHOP_A", name: "Krewe Main" },
      { shopId: "SHOP_B", name: "Krewe Outlet" },
      { shopId: "QA_SHOP", name: "Sandbox" },
    ]),
    hydrated: ref(true),
  }),
}));

vi.mock("@/services/appDbSync", () => ({ refreshAfterMutation: vi.fn() }));
vi.mock("@/router", () => ({ default: { push: vi.fn() } }));

const IonSearchbarStub = defineComponent({
  name: "IonSearchbar",
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  template: `<input data-testid="search" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
});

async function mountView() {
  const ShopifyConnections = (await import("@/views/ShopifyConnections.vue")).default;
  const wrapper = mount(ShopifyConnections, {
    global: {
      stubs: {
        IonSearchbar: IonSearchbarStub,
        ShopifyConnectionFilters: true,
        IonMenuButton: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

const shopIds = (wrapper: any) =>
  wrapper.findAll(".list-item .overline").map((node: any) => node.text());

describe("ShopifyConnections search", () => {
  it("filters the shop list by name or id, case-insensitively", async () => {
    const wrapper = await mountView();
    expect(shopIds(wrapper)).toEqual(["SHOP_A", "SHOP_B", "QA_SHOP"]);

    await wrapper.get("[data-testid=\"search\"]").setValue("krewe outlet");
    expect(shopIds(wrapper)).toEqual(["SHOP_B"]);

    await wrapper.get("[data-testid=\"search\"]").setValue("qa_shop");
    expect(shopIds(wrapper)).toEqual(["QA_SHOP"]);

    await wrapper.get("[data-testid=\"search\"]").setValue("  ");
    expect(shopIds(wrapper)).toHaveLength(3);
  });
});
