// @vitest-environment jsdom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IonRadioGroup, modalController } from "@ionic/vue";
import DocumentRevisionModal from "@/components/document-templates/DocumentRevisionModal.vue";
vi.mock("@common", () => ({ commonUtil: { getDateAndTime: () => "27 Oct 2026", parseDateTimeValue: () => ({ toMillis: () => 1 }) }, translate: (text: string, values: any = {}) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), text) }));
vi.mock("@ionic/vue", async (original) => ({ ...await original<any>(), modalController: { dismiss: vi.fn() } }));
enableAutoUnmount(afterEach);

describe("revision review picker", () => {
  it("provides business context and returns selection only after review confirmation", async () => {
    const wrapper = mount(DocumentRevisionModal, { props: { selectedVersion: "22", publishedVersionName: "22", revisions: [{ manifestVersionName: "22", summary: "Complete 4 by 6 design", createdAt: "2026-10-27" }, { manifestVersionName: "19", summary: "Earlier layout", createdAt: "2026-10-26" }] } });
    expect(wrapper.get('[data-testid="document-revision-22-radio"]').text()).toContain("Complete 4 by 6 design");
    expect(wrapper.text()).toContain("27 Oct 2026");
    expect(wrapper.text()).toContain("In use");
    wrapper.findComponent(IonRadioGroup).vm.$emit("update:modelValue", "19");
    expect(modalController.dismiss).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="document-revisions-review-btn"]').trigger("click");
    expect(modalController.dismiss).toHaveBeenCalledWith({ manifestVersionName: "19" });
  });
});
