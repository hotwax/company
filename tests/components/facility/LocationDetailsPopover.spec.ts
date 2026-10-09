// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Facility Details reloads its live locations when this popover dismisses. Editing a location used
 * to dismiss the popover before presenting the edit modal, so that reload ran before the save and
 * the card kept the old values until a page reload.
 */

const harness = vi.hoisted(() => {
  let resolveModalDismiss: () => void = () => undefined;

  return {
    modal: {
      present: vi.fn(),
      onDidDismiss: vi.fn(() => new Promise<void>((resolve) => { resolveModalDismiss = resolve; })),
    },
    closeModal: () => resolveModalDismiss(),
    createModal: vi.fn(),
    dismissPopover: vi.fn(),
  };
});

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  modalController: { create: harness.createModal },
  popoverController: { dismiss: harness.dismissPopover },
}));

vi.mock("@common", () => ({
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  emitter: { emit: vi.fn() },
  logger: { error: vi.fn() },
  translate: (key: string) => key,
}));

vi.mock("@/composables/useFacilities", () => ({
  useFacilityMutations: () => ({ deleteLocation: vi.fn() }),
}));

vi.mock("@/components/facility/AddLocationModal.vue", () => ({ default: { name: "AddLocationModal" } }));

import LocationDetailsPopover from "@/components/facility/LocationDetailsPopover.vue";

beforeEach(() => {
  harness.createModal.mockReset();
  harness.createModal.mockResolvedValue(harness.modal);
  harness.modal.present.mockClear();
  harness.dismissPopover.mockClear();
});

describe("LocationDetailsPopover edit", () => {
  it("keeps the popover open until the edit modal is dismissed, so the opener reloads after the save", async () => {
    const location = { facilityId: "BROADWAY", locationSeqId: "LOC_1", areaId: "A" };
    const wrapper = mount(LocationDetailsPopover, { props: { location } });

    await wrapper.findAll("ion-item")[0].trigger("click");
    await flushPromises();

    expect(harness.createModal).toHaveBeenCalledWith(expect.objectContaining({
      componentProps: { location, facilityId: "BROADWAY" },
    }));
    expect(harness.modal.present).toHaveBeenCalled();
    expect(harness.dismissPopover).not.toHaveBeenCalled();

    harness.closeModal();
    await flushPromises();

    expect(harness.dismissPopover).toHaveBeenCalledTimes(1);
  });
});
