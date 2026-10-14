// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ detach: vi.fn(), translate: vi.fn() }));
vi.mock("@common", () => ({ translate: state.translate }));
vi.mock("@/composables/useShopifyTransferDetach", () => ({
  DETACH_FAILED: "The transfer could not be detached.",
  useShopifyTransferDetach: () => ({ detach: state.detach }),
}));
import ShopifyTransferDetachModal from "@/components/shopify/ShopifyTransferDetachModal.vue";

enableAutoUnmount(afterEach);

const refusal = "Transfer order [TO1] cannot be detached from shop [UK]: it has Shopify transfer [73]. Cancel it in Shopify instead.";

async function detachWith(failure: Error) {
  state.detach.mockRejectedValue(failure);
  const wrapper = mount(ShopifyTransferDetachModal, {
    props: { isOpen: true, shopId: "UK", orderId: "TO1" },
    global: { stubs: { IonModal: { props: ["isOpen"], template: "<div v-if=\"isOpen\"><slot /></div>" } } },
  });
  (wrapper.vm as any).removeOwnership = true;
  await (wrapper.vm as any).detach();
  await flushPromises();

  return wrapper;
}

describe("ShopifyTransferDetachModal errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.translate.mockImplementation((key: string, values: Record<string, unknown> = {}) =>
      Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), key));
  });

  it("shows the connector's refusal as an interpolation value, never as a translation key", async () => {
    const wrapper = await detachWith(new Error(refusal));

    expect(state.translate).toHaveBeenCalledWith("The transfer could not be detached: {reason}", { reason: refusal });
    expect(state.translate).not.toHaveBeenCalledWith(refusal);
    expect(wrapper.text()).toContain(`The transfer could not be detached: ${refusal}`);
  });

  it("shows the fixed message when the failure carries no reason", async () => {
    const wrapper = await detachWith(new Error("The transfer could not be detached."));

    expect(state.translate).toHaveBeenCalledWith("The transfer could not be detached.");
    expect(wrapper.text()).toContain("The transfer could not be detached.");
    expect(wrapper.text()).not.toContain("detached: ");
  });
});
