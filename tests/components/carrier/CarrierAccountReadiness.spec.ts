// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
}));

const readiness = {
  carrierPartyId: "FEDEX",
  automaticAddressValidationCapable: true,
  remote: {
    hydrated: true,
    error: "The credential status endpoint is unavailable.",
  },
  tenant: "ready",
  credential: "verification-unavailable",
  storeLink: "action-required",
  automaticAddressValidation: "verification-unavailable",
} as const;

describe("CarrierAccountReadiness", () => {
  it("renders each readiness dimension and preserves verification uncertainty", async () => {
    const CarrierAccountReadiness = (await import("@/components/carrier/CarrierAccountReadiness.vue")).default;
    const wrapper = mount(CarrierAccountReadiness, {
      props: {
        readiness,
        remote: {
          systemMessageRemoteId: "UNIGATE_CONFIG",
          internalId: "tenant-1",
        },
      },
    });

    expect(wrapper.text()).toContain("Unigate tenant");
    expect(wrapper.text()).toContain("Ready");
    expect(wrapper.text()).toContain("Carrier credentials");
    expect(wrapper.text()).toContain("Verification unavailable");
    expect(wrapper.text()).toContain("Product store link");
    expect(wrapper.text()).toContain("Action required");
    expect(wrapper.text()).toContain("Automatic address validation");
    const expected = "Carrier account verification is unavailable. " +
      "Details: The credential status endpoint is unavailable.";
    expect(wrapper.text()).toContain(expected);
  });

  it("emits a navigation intent instead of editing gateway credentials", async () => {
    const CarrierAccountReadiness = (await import("@/components/carrier/CarrierAccountReadiness.vue")).default;
    const wrapper = mount(CarrierAccountReadiness, {
      props: { readiness, remote: null },
    });
    const button = wrapper.findAll("ion-button").find((candidate) =>
      candidate.text().includes("Manage Unigate in Klaviyo"));

    if(!button) {
      throw new Error("Klaviyo navigation button not found");
    }

    await button.trigger("click");

    expect(wrapper.emitted("open-klaviyo")).toEqual([[]]);
    expect(wrapper.find("ion-input").exists()).toBe(false);
  });
});
