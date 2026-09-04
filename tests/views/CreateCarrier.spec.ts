// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  createCarrier: vi.fn(),
  replace: vi.fn(),
  showToast: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: {
    showToast: (...args: any[]) => harness.showToast(...args),
    generateInternalId: (name: string) => name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase(),
  },
  logger: {
    error: (...args: any[]) => harness.error(...args),
    info: vi.fn(),
    warn: vi.fn(),
  },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
}));

vi.mock("@/composables/useCarriers", () => ({
  createCarrier: (...args: any[]) => harness.createCarrier(...args),
}));

vi.mock("@/router", () => ({
  default: {
    replace: (...args: any[]) => harness.replace(...args),
  },
}));

async function mountView() {
  const CreateCarrier = (await import("@/views/CreateCarrier.vue")).default;
  const wrapper = mount(CreateCarrier);
  await flushPromises();

  return wrapper;
}

describe("CreateCarrier", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.createCarrier.mockReset();
    harness.replace.mockReset().mockResolvedValue(undefined);
    harness.showToast.mockReset();
    harness.error.mockReset();
  });

  it("requires carrier name before creation", async () => {
    const wrapper = await mountView();

    const submitButton = wrapper.find("ion-button");
    await submitButton.trigger("click");

    expect(harness.showToast).toHaveBeenCalledWith("Carrier name can not be empty.");
    expect(harness.createCarrier).not.toHaveBeenCalled();
  });

  it("derives partyId from groupName and navigates to setup methods on success", async () => {
    harness.createCarrier.mockResolvedValue("DHL_EXPRESS");
    const wrapper = await mountView();

    (wrapper.vm as any).carrier.groupName = "DHL Express";

    const submitButton = wrapper.find("ion-button");
    await submitButton.trigger("click");
    await flushPromises();

    expect(harness.createCarrier).toHaveBeenCalledWith({
      partyId: "DHL_EXPRESS",
      groupName: "DHL Express",
    });
    expect(harness.replace).toHaveBeenCalledWith({
      path: "/shipment-methods-setup/DHL_EXPRESS",
    });
  });

  it("handles creation failures gracefully with a toast", async () => {
    harness.createCarrier.mockRejectedValue(new Error("Network failure"));
    const wrapper = await mountView();

    (wrapper.vm as any).carrier.groupName = "DHL Express";
    (wrapper.vm as any).carrier.partyId = "DHL";

    const submitButton = wrapper.find("ion-button");
    await submitButton.trigger("click");
    await flushPromises();

    expect(harness.createCarrier).toHaveBeenCalledWith({
      partyId: "DHL",
      groupName: "DHL Express",
    });
    expect(harness.showToast).toHaveBeenCalledWith("Failed to create carrier.");
    expect(harness.replace).not.toHaveBeenCalled();
  });
});
