// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();

vi.mock("@common", () => ({
  api: (args: any) => apiMock(args),
  commonUtil: {
    hasError: (res: any) => Boolean(res?.data?.error),
  },
  showToast: vi.fn(),
  translate: (k: string) => k,
}));

vi.mock("@ionic/vue", async () => {
  const actual = await vi.importActual<any>("@ionic/vue");
  return {
    ...actual,
    modalController: {
      dismiss: vi.fn(),
    },
  };
});

describe("Unigate Modals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.mockResolvedValue({ data: [] });
  });

  it("renders UnigateConnectionModal with initial values and inputs", async () => {
    const UnigateConnectionModal = (await import("@/components/unigate/UnigateConnectionModal.vue")).default;
    const wrapper = mount(UnigateConnectionModal, {
      props: {
        initialSendUrl: "https://unigate.test",
        initialTenantId: "STORE_1",
      },
    });

    expect(wrapper.find("[data-testid='unigate-send-url-input']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='unigate-tenant-id-input']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='save-unigate-connection-btn']").exists()).toBe(true);
  });

  it("renders CreateShippingGatewayAuthModal with gateway select and credential fields", async () => {
    const CreateShippingGatewayAuthModal = (await import("@/components/unigate/CreateShippingGatewayAuthModal.vue")).default;
    const wrapper = mount(CreateShippingGatewayAuthModal, {
      props: {
        defaultConfigId: "FEDEX",
      },
    });

    expect(wrapper.find("[data-testid='gateway-provider-select']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='gateway-auth-id-input']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='gateway-auth-desc-input']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='save-gateway-auth-btn']").exists()).toBe(true);
  });

  it("renders ShippingCarrierConfigModal with carrier, store, and auth selects", async () => {
    const ShippingCarrierConfigModal = (await import("@/components/unigate/ShippingCarrierConfigModal.vue")).default;
    const wrapper = mount(ShippingCarrierConfigModal, {
      props: {
        defaultCarrierPartyId: "FEDEX",
      },
    });

    expect(wrapper.find("[data-testid='carrier-party-select']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='carrier-product-store-select']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='carrier-gateway-auth-select']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='save-carrier-config-btn']").exists()).toBe(true);
  });

  it("renders ShippingCarrierBillingConfigModal with billing account fields", async () => {
    const ShippingCarrierBillingConfigModal = (await import("@/components/unigate/ShippingCarrierBillingConfigModal.vue")).default;
    const wrapper = mount(ShippingCarrierBillingConfigModal);

    expect(wrapper.find("[data-testid='billing-carrier-party-select']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='billing-product-store-select']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='billing-account-number-input']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='save-billing-config-btn']").exists()).toBe(true);
  });
});
