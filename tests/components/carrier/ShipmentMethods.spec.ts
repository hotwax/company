// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  alertOptions: [] as any[],
  updateCarrierShipmentMethod: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: vi.fn() },
  logger: { error: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  alertController: {
    create: (options: any) => {
      harness.alertOptions.push(options);
      return Promise.resolve({ present: () => Promise.resolve() });
    },
  },
}));

vi.mock("@/composables/useCarriers", () => ({
  deleteCarrierShipmentMethod: vi.fn(),
  enableCarrierShipmentMethod: vi.fn(),
  updateCarrierShipmentMethod: (...args: any[]) => harness.updateCarrierShipmentMethod(...args),
}));

const GROUND = {
  shipmentMethodTypeId: "GROUND",
  description: "Ground",
  carrierServiceCode: "03",
  deliveryDays: 5,
  isConfigured: true,
};

async function mountMethods() {
  const ShipmentMethods = (await import("@/components/carrier/ShipmentMethods.vue")).default;
  return mount(ShipmentMethods, {
    props: { methods: [GROUND], carrierPartyId: "UPS" },
  });
}

describe("ShipmentMethods", () => {
  beforeEach(() => {
    harness.alertOptions = [];
    harness.updateCarrierShipmentMethod.mockReset().mockResolvedValue(undefined);
  });

  it("opens the carrier service code editor from the service code chip", async () => {
    const wrapper = await mountMethods();
    const chip = wrapper.findAll("ion-chip").find((candidate) => candidate.text() === "03");

    await chip!.trigger("click");
    await flushPromises();

    const options = harness.alertOptions.at(-1);
    expect(options.header).toBe("Edit carrier service code");
    expect(options.inputs[0].value).toBe("03");

    await options.buttons[1].handler({ carrierServiceCode: " 07 " });
    expect(harness.updateCarrierShipmentMethod)
      .toHaveBeenCalledWith("UPS", "GROUND", { carrierServiceCode: "07" });
  });
});
