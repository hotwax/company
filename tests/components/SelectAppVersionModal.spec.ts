// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { IonAccordionGroup, IonRadioGroup, modalController } from "@ionic/vue";
import SelectAppVersionModal from "@/components/app-version/SelectAppVersionModal.vue";

vi.mock("@common", () => ({ translate: (s: string, params?: any) => s.replace(/\{(\w+)\}/g, (_, key) => params?.[key] || ""), commonUtil: { formatDateTimeValue: () => "Oct 24, 2026, 8:00 AM", getDateAndTime: () => "Oct 24, 2026, 8:00 AM" } }));
vi.mock("@ionic/vue", async importOriginal => ({ ...await importOriginal<any>(), modalController: { dismiss: vi.fn() } }));
vi.mock("@/composables/useAppReleaseDetails", () => ({ useAppReleaseDetails: () => ({
  releaseVersions: ref(["v3.4.2", "v3.5.0"]), catalogLoading: ref(false), catalogError: ref(false), hasMore: ref(false), loadMore: vi.fn(),
  releases: ref({ "v3.4.2": { status: "ready", publishedAt: 1792843250000, brief: ["Restored the release build"], url: "https://github.com/hotwax/job-manager/releases/tag/v3.4.2" } }), loadRelease: vi.fn(), loadReleases: vi.fn()
}) }));
enableAutoUnmount(afterEach);
beforeEach(() => vi.clearAllMocks());
const props = { appId: "JOB_MANAGER", appName: "Job Manager", environmentLabel: "UAT", environmentTypeId: "AppEnvUAT", versions: ["v3.4.2"], currentVersion: "" };

describe("version selection modal", () => {
  it("shows release details, keeps choosing separate from saving, and closes only after success", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const wrapper = mount(SelectAppVersionModal, { props: { ...props, onSave } });
    expect(wrapper.text()).toContain("Released Oct 24, 2026, 8:00 AM");
    expect(wrapper.text()).toContain("Restored the release build");
    expect(wrapper.getComponent('[data-testid="release-v3.4.2-github-link"]').props("href")).toBe("https://github.com/hotwax/job-manager/releases/tag/v3.4.2");
    wrapper.findComponent(IonRadioGroup).vm.$emit("update:modelValue", "v3.4.2"); await flushPromises();
    expect(onSave).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="version-picker-save-btn"]').trigger("click"); await flushPromises();
    expect(onSave).toHaveBeenCalledWith("v3.4.2");
    expect(modalController.dismiss).toHaveBeenCalledWith({ saved: true });
  });
  it("opening release notes does not change the selected version", async () => {
    const onSave = vi.fn(); const wrapper = mount(SelectAppVersionModal, { props: { ...props, onSave } });
    wrapper.findComponent(IonAccordionGroup).element.dispatchEvent(new CustomEvent("ionChange", { bubbles: true, detail: { value: "v3.4.2" } }));
    await flushPromises();
    expect(wrapper.findComponent(IonRadioGroup).props("modelValue")).toBe("");
    await wrapper.get('[data-testid="version-picker-save-btn"]').trigger("click");
    expect(onSave).not.toHaveBeenCalled();
  });
  it("does not allow selecting a published release that is not confirmed as hosted", async () => {
    const onSave = vi.fn(); const wrapper = mount(SelectAppVersionModal, { props: { ...props, onSave } });
    await wrapper.get('[data-testid="version-picker-v3.5.0"]').trigger("click");
    await wrapper.get('[data-testid="version-picker-save-btn"]').trigger("click");
    expect(onSave).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Not deployed as a selectable version on UAT");
  });
  it("selecting a version and expanding its notes are independent", async () => {
    const onSave = vi.fn(); const wrapper = mount(SelectAppVersionModal, { props: { ...props, onSave } });
    await wrapper.get('[data-testid="version-notes-v3.4.2-toggle"]').trigger("click");
    expect(wrapper.findComponent(IonRadioGroup).props("modelValue")).toBe("");
    await wrapper.get('[data-testid="version-picker-v3.4.2"]').trigger("click");
    expect(wrapper.findComponent(IonRadioGroup).props("modelValue")).toBe("v3.4.2");
    expect(wrapper.get('[data-testid="version-notes-v3.4.2-toggle"]').attributes("aria-expanded")).toBe("true");
    expect(onSave).not.toHaveBeenCalled();
  });
  it("keeps an unconfirmed save open and prevents repeated writes", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const wrapper = mount(SelectAppVersionModal, { props: { ...props, currentVersion: "v3.4.2", onSave } });
    wrapper.findComponent(IonRadioGroup).vm.$emit("update:modelValue", ""); await flushPromises();
    await wrapper.get('[data-testid="version-picker-save-btn"]').trigger("click"); await flushPromises();
    expect(wrapper.find('[data-testid="version-picker-save-error"]').exists()).toBe(true);
    expect(modalController.dismiss).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="version-picker-save-btn"]').trigger("click");
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it("explains Default using the deployed build, not the newest published release", () => {
    const wrapper = mount(SelectAppVersionModal, { props: { ...props, onSave: vi.fn(), deployment: { origin: "https://job-manager-uat.hotwax.io", site: "job-manager-uat", available: true, versions: ["v3.4.2"], defaultBuild: "v3.4.2", verifiedAt: "2026-10-24T12:00:00Z" } } });
    expect(wrapper.text()).toContain("Verified default: v3.4.2");
    expect(wrapper.text()).toContain("may differ from the latest GitHub release");
  });
  it("keeps an unavailable current pin visible without allowing it to be saved again", async () => {
    const onSave = vi.fn();
    const wrapper = mount(SelectAppVersionModal, { props: { ...props, currentVersion: "v2.2.2", onSave } });
    expect(wrapper.find('[data-testid="version-picker-v2.2.2"]').exists()).toBe(true);
    wrapper.findComponent(IonRadioGroup).vm.$emit("update:modelValue", "v3.5.0");
    await flushPromises();
    await wrapper.get('[data-testid="version-picker-save-btn"]').trigger("click");
    expect(onSave).not.toHaveBeenCalled();
  });
  it("refreshes selectable versions and displays discovery failures without an empty-list claim", async () => {
    const onRefresh = vi.fn().mockResolvedValue({ available: true, versions: ["v3.5.0"], defaultBuild: "v3.5.0", verifiedAt: "2026-10-24T12:00:00Z" });
    const wrapper = mount(SelectAppVersionModal, { props: { ...props, onSave: vi.fn(), onRefresh } });
    await wrapper.get('[data-testid="version-picker-refresh-btn"]').trigger("click"); await flushPromises();
    expect(wrapper.getComponent('[data-testid="version-picker-v3.4.2"]').props("disabled")).toBe(true);
    expect(wrapper.getComponent('[data-testid="version-picker-v3.5.0"]').props("disabled")).toBe(false);
    onRefresh.mockRejectedValue(new Error("Unavailable"));
    await wrapper.get('[data-testid="version-picker-refresh-btn"]').trigger("click"); await flushPromises();
    expect(wrapper.find('[data-testid="version-picker-discovery-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="version-picker-empty"]').exists()).toBe(false);
  });
  it("closing does not write a selection", async () => {
    const onSave = vi.fn(); const wrapper = mount(SelectAppVersionModal, { props: { ...props, onSave } });
    wrapper.findComponent(IonRadioGroup).vm.$emit("update:modelValue", "v3.4.2"); await flushPromises();
    await wrapper.get('[data-testid="version-picker-close-btn"]').trigger("click");
    expect(onSave).not.toHaveBeenCalled();
    expect(modalController.dismiss).toHaveBeenCalledWith();
  });
});
