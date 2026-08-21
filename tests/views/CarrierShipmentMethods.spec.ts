// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  carrier: undefined as any,
  shipmentMethods: undefined as any,
  replace: vi.fn(),
  showToast: vi.fn(),
  createModal: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: {
    showToast: (...args: any[]) => harness.showToast(...args),
  },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  modalController: {
    create: (...args: any[]) => harness.createModal(...args),
  },
}));

vi.mock("@/composables/useCarriers", () => ({
  useCarrier: () => ({
    carrier: harness.carrier,
    shipmentMethods: harness.shipmentMethods,
  }),
}));

vi.mock("@/router", () => ({
  default: {
    replace: (...args: any[]) => harness.replace(...args),
  },
}));

async function mountView() {
  const CarrierShipmentMethods = (await import("@/views/CarrierShipmentMethods.vue")).default;
  const wrapper = mount(CarrierShipmentMethods, {
    props: { partyId: "DHL" },
    global: {
      stubs: {
        IonBackButton: true,
        ShipmentMethods: true,
      },
    },
  });
  await flushPromises();

  return wrapper;
}

function buttonWithText(wrapper: any, text: string) {
  const button = wrapper.findAll("ion-button").find((candidate: any) =>
    candidate.text().includes(text));

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

describe("CarrierShipmentMethods", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.carrier = ref({ partyId: "DHL", groupName: "DHL Express" });
    harness.shipmentMethods = ref([]);
    harness.replace.mockReset().mockResolvedValue(undefined);
    harness.showToast.mockReset();
    harness.createModal.mockReset().mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("renders carrier identity header banner", async () => {
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("DHL");
    expect(wrapper.text()).toContain("DHL Express");
    expect(wrapper.text()).toContain("Only methods for this carrier");
  });

  it("opens create shipment method modal on button click", async () => {
    const wrapper = await mountView();

    const createButton = buttonWithText(wrapper, "Create shipment method");
    await createButton.trigger("click");

    expect(harness.createModal).toHaveBeenCalledWith(
      expect.objectContaining({
        componentProps: {
          carrierPartyId: "DHL",
        },
      }),
    );
  });

  it("finishes setup and navigates to carrier details", async () => {
    const wrapper = await mountView();

    const finishButton = buttonWithText(wrapper, "Finish setup");
    await finishButton.trigger("click");

    expect(harness.showToast).toHaveBeenCalledWith("Carrier and shipment methods have been set up successfully.");
    expect(harness.replace).toHaveBeenCalledWith({
      path: "/carrier-details/DHL",
    });
  });
});
