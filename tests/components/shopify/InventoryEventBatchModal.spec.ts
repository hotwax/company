// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  ensureErrors: vi.fn(), fetchErrors: vi.fn(), resend: vi.fn(), afterMutation: vi.fn(), showToast: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: (...args: any[]) => harness.showToast(...args) },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string) => key,
}));
vi.mock("@/composables/useSeed", () => ({ useStatuses: () => ({ labelFor: (id: string) => id }) }));
vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    ensureSystemMessageById: vi.fn().mockResolvedValue({ messageText: "{}" }),
    ensureSystemMessageErrors: harness.ensureErrors,
    fetchSystemMessageErrors: harness.fetchErrors,
    resendSystemMessage: harness.resend,
  }),
}));
vi.mock("@/services/inventorySyncArea", () => ({ useInventorySyncArea: () => ({ afterMutation: harness.afterMutation }) }));

const batch = (deliveryId: string) => ({
  id: "M1", delivery: { id: deliveryId }, createdAt: 0, reason: "correction", reasonMapped: true, mixedEventTypes: false,
  entries: [], events: [{ rowKey: "r", locationId: "L", locationLabel: "Store", deliveryColor: "danger", deliveryLabel: "Error" }],
});

async function mountModal(deliveryId: string) {
  const { default: Modal } = await import("@/components/shopify/InventoryEventBatchModal.vue");
  const wrapper = mount(Modal, {
    props: { batch: batch(deliveryId) as any },
    global: { stubs: { IonModal: { template: "<div><slot /></div>" }, IonAccordionGroup: true } },
  });
  await flushPromises();

  return wrapper;
}

const resendButton = (wrapper: any) => wrapper.findAll("ion-button").find((button: any) => button.text().includes("Resend"));

beforeEach(() => {
  for(const mock of Object.values(harness)) {mock.mockReset();}
  harness.ensureErrors.mockResolvedValue([]);
  harness.fetchErrors.mockResolvedValue([]);
});

describe("InventoryEventBatchModal", () => {
  it.each([
    { deliveryId: "error", fresh: true },
    { deliveryId: "sent", fresh: false },
  ])("reads a $deliveryId batch's errors fresh: $fresh", async ({ deliveryId, fresh }) => {
    await mountModal(deliveryId);

    expect(harness.fetchErrors).toHaveBeenCalledTimes(fresh ? 1 : 0);
    expect(harness.ensureErrors).toHaveBeenCalledTimes(fresh ? 0 : 1);
  });

  it("keeps a committed resend committed when the refresh after it fails", async () => {
    harness.resend.mockResolvedValue({});
    harness.afterMutation.mockRejectedValue(new Error("worker offline"));
    const wrapper = await mountModal("error");

    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(harness.showToast).toHaveBeenLastCalledWith("The server change was saved, but this view could not be refreshed. Refresh before retrying.");
    expect(resendButton(wrapper).element.disabled).toBe(true);
    expect(harness.resend).toHaveBeenCalledTimes(1);
  });

  it("re-reads the errors fresh after a resend", async () => {
    harness.resend.mockResolvedValue({});
    harness.fetchErrors.mockResolvedValueOnce([]).mockResolvedValueOnce([{ errorText: "Shopify timed out" }]);
    const wrapper = await mountModal("error");

    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Shopify timed out");
  });
});
