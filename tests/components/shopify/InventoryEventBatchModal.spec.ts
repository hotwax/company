// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const harness = vi.hoisted(() => ({
  requestMessage: vi.fn(), requestErrors: vi.fn(), refreshErrors: vi.fn(), resend: vi.fn(), afterMutation: vi.fn(), showToast: vi.fn(),
}));
/** What the live reads hold: the rows the sync worker has stored for the open batch. */
const live = vi.hoisted(() => ({ message: undefined as any, errors: undefined as any }));

vi.mock("@common", () => ({
  commonUtil: { showToast: (...args: any[]) => harness.showToast(...args) },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string) => key,
}));
vi.mock("@/composables/useSeed", () => ({ useStatuses: () => ({ labelFor: (id: string) => id }) }));
vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    requestSystemMessage: harness.requestMessage,
    requestSystemMessageErrors: harness.requestErrors,
    refreshSystemMessageErrors: harness.refreshErrors,
    resendSystemMessage: harness.resend,
  }),
  useSystemMessageRecord: () => ({ record: live.message, hydrated: ref(true) }),
  useSystemMessageErrors: () => ({ errors: live.errors, errorText: ref(""), hydrated: ref(true) }),
}));
vi.mock("@/composables/useInventorySyncArea", () => ({ useInventorySyncArea: () => ({ afterMutation: harness.afterMutation }) }));

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
  live.message = ref({ systemMessageId: "M1", messageText: "{}" });
  live.errors = ref([]);
  harness.requestMessage.mockResolvedValue(undefined);
  harness.requestErrors.mockResolvedValue(undefined);
  harness.refreshErrors.mockResolvedValue(undefined);
});

describe("InventoryEventBatchModal", () => {
  it.each([
    { deliveryId: "error", fresh: true },
    { deliveryId: "sent", fresh: false },
  ])("reads a $deliveryId batch's errors fresh: $fresh", async ({ deliveryId, fresh }) => {
    await mountModal(deliveryId);

    expect(harness.refreshErrors).toHaveBeenCalledTimes(fresh ? 1 : 0);
    expect(harness.requestErrors).toHaveBeenCalledTimes(fresh ? 0 : 1);
  });

  it("asks nothing for a settled batch whose message and errors are already stored", async () => {
    live.errors = ref([{ systemMessageId: "M1", errorDate: 1, errorText: "Stored error" }]);
    const wrapper = await mountModal("sent");

    expect(harness.requestErrors).not.toHaveBeenCalled();
    expect(harness.refreshErrors).not.toHaveBeenCalled();
    expect(harness.requestMessage).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Stored error");
  });

  it("requests the message only when it is not stored", async () => {
    live.message = ref(undefined);
    await mountModal("sent");

    expect(harness.requestMessage).toHaveBeenCalledTimes(1);
    expect(harness.requestMessage).toHaveBeenCalledWith("M1");
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

  it("re-reads the errors fresh after a resend, and shows them once stored", async () => {
    harness.resend.mockResolvedValue({});
    // The second refresh is the one after the resend; the domain stores the retry's error.
    harness.refreshErrors
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => { live.errors.value = [{ systemMessageId: "M1", errorDate: 2, errorText: "Shopify timed out" }]; });
    const wrapper = await mountModal("error");

    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(harness.refreshErrors).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Shopify timed out");
  });
});
