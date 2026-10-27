// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IonButton, IonSelect, IonTextarea } from "@ionic/vue";
import { computed } from "vue";

const state = vi.hoisted(() => ({ readRevision: vi.fn(), examples: vi.fn(), createPreview: vi.fn(), readPreview: vi.fn(), artifactBlob: vi.fn(), publish: vi.fn(), refresh: vi.fn(), confirm: undefined as any, permitted: true, currentVersion: "1", publications: [] as any[], modalConfig: undefined as any, modalResult: undefined as any }));
vi.mock("@common", () => ({
  commonUtil: { getDateAndTime: () => "27 Oct 2026", parseDateTimeValue: () => ({ toMillis: () => 1 }) },
  logger: { error: vi.fn() },
  translate: (text: string, values: any = {}) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), text),
}));
vi.mock("@ionic/vue", async (original) => {
  const actual: any = await original();
  const { onMounted } = await import("vue");
  return { ...actual, onIonViewWillEnter: onMounted, onIonViewDidLeave: vi.fn(), alertController: { create: vi.fn(async (config) => {
    state.confirm = config.buttons[1].handler;
    return { present: vi.fn() };
  }) }, modalController: { create: vi.fn(async (config) => { state.modalConfig = config; return { present: vi.fn(), onDidDismiss: async () => ({ data: state.modalResult }) }; }) } };
});
vi.mock("@/composables/useSecurity", () => ({ useAuth: () => ({ hasPermission: () => state.permitted }) }));
vi.mock("@/composables/useDocumentTemplates", () => ({
  useDocumentTemplates: () => ({
    template: computed(() => ({ displayName: "Packing slip", publishedVersionName: state.currentVersion, latestManifestVersionName: "2", canPublish: true })),
    history: computed(() => ({ publishedVersionName: state.currentVersion, latestManifestVersionName: "2", canPublish: true, publicationSequence: 3, revisions: [{ manifestVersionName: "2", summary: "Larger address", createdAt: "2026-10-27" }, { manifestVersionName: "1", summary: "Original address" }], publications: state.publications })),
    refresh: state.refresh, refreshHistory: state.refresh,
  }),
  useDocumentTemplateActions: () => state,
}));

enableAutoUnmount(afterEach);
const readyPreview = () => ({ previewId: "private", documentTemplateId: "packing", manifestVersionName: "2", manifestHash: "hash-2", status: "ready", expiresAt: Date.now() + 60_000,
  artifacts: [{ uri: "hotwax-document://pdf", mimeType: "application/pdf" }, { uri: "hotwax-document://png", mimeType: "image/png", pageNumber: 1 }] });

async function mountView() {
  const Component = (await import("@/views/DocumentTemplateDetails.vue")).default;
  const wrapper = mount(Component, { props: { documentTemplateId: "packing" } });
  await flushPromises(); await flushPromises();
  return wrapper;
}
async function review(wrapper: any) {
  wrapper.findComponent(IonSelect).vm.$emit("update:modelValue", ["source-a"]);
  wrapper.findComponent(IonTextarea).vm.$emit("update:modelValue", "Reviewed address");
  await flushPromises();
  await wrapper.get('[data-testid="document-template-preview-btn"]').trigger("click");
  await flushPromises(); await flushPromises();
}
const useRevisionButton = (wrapper: any) => wrapper.findAllComponents(IonButton).find((button: any) => button.attributes("data-testid") === "document-template-use-revision-btn");
beforeEach(() => {
  vi.clearAllMocks(); state.permitted = true; state.currentVersion = "1"; state.publications = []; state.modalResult = undefined;
  state.readRevision.mockResolvedValue({ documentTemplateId: "packing", manifestVersionName: "2", manifestHash: "hash-2", publicationSequence: 3 });
  state.examples.mockResolvedValue({ examples: [{ sourceId: "source-a", label: "Order 1001" }] });
  state.createPreview.mockImplementation(async () => readyPreview());
  state.readPreview.mockImplementation(async () => readyPreview());
  state.artifactBlob.mockResolvedValue(new Blob(["file"]));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
});
describe("document template review", () => {
  it("hides the change form when the selected revision is already in use", async () => {
    state.currentVersion = "2";
    const wrapper = await mountView();
    expect(wrapper.get('[data-testid="document-template-already-current"]').text()).toContain("Revision 2 is already used");
    expect(wrapper.findComponent(IonTextarea).exists()).toBe(false);
    expect(useRevisionButton(wrapper)).toBeUndefined();
    expect(wrapper.find('[data-testid="document-template-preview-btn"]').exists()).toBe(true);
  });
  it("passes revision context to the native picker and invalidates the previous preview after selection", async () => {
    const wrapper = await mountView();
    await review(wrapper);
    state.modalResult = { manifestVersionName: "1" };
    state.readRevision.mockResolvedValue({ documentTemplateId: "packing", manifestVersionName: "1", manifestHash: "hash-1", publicationSequence: 3 });
    await wrapper.get('[data-testid="document-template-revision-select"]').trigger("click");
    await flushPromises();
    expect(state.modalConfig.componentProps).toMatchObject({ selectedVersion: "2", publishedVersionName: "1", revisions: [expect.objectContaining({ summary: "Larger address" }), expect.objectContaining({ summary: "Original address" })] });
    expect(state.readRevision).toHaveBeenLastCalledWith("packing", "1");
    expect(wrapper.find('[data-testid="document-template-preview-image"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="document-template-already-current"]').exists()).toBe(true);
    expect(state.publish).not.toHaveBeenCalled();
  });
  it("keeps history compact and identifies only the current publication event", async () => {
    state.publications = [
      { publicationEventId: "new", manifestVersionName: "1", publicationSequence: 3 },
      { publicationEventId: "middle", manifestVersionName: "2", publicationSequence: 2 },
      { publicationEventId: "old", manifestVersionName: "1", publicationSequence: 1 },
      { publicationEventId: "first", manifestVersionName: "0", publicationSequence: 0 },
    ];
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="document-template-publication-first-row"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="document-template-publication-new-row"]').text()).toContain("Returned to this revision");
    expect(wrapper.get('[data-testid="document-template-publication-new-row"]').text()).toContain("Now in use");
    expect(wrapper.get('[data-testid="document-template-publication-old-row"]').text()).not.toContain("Now in use");
    await wrapper.get('[data-testid="document-template-history-expand-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="document-template-publication-first-row"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="document-template-history-expand-btn"]').text()).toBe("Show recent changes");
  });
  it("shows readable traits for the backend's structured example scenario", async () => {
    state.examples.mockResolvedValue({ examples: [{ sourceId: "source-a", label: "Order 1001", scenario: { wrappedLineCount: 1, componentLineCount: 2, hasShipment: false } }] });
    const wrapper = await mountView();
    const choices = wrapper.get('[data-testid="document-template-examples-select"]').text();
    expect(choices).toContain("Order 1001 · Gift wrapped · Contains kit components · Before shipment");
    expect(choices).not.toContain("[object Object]");
  });
  it("keeps review available without showing publication controls to a viewer", async () => {
    state.permitted = false;
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="document-template-use-revision-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="document-template-preview-btn"]').exists()).toBe(true);
    expect(state.publish).not.toHaveBeenCalled();
  });
  it("requires another preview after the server reports expiration", async () => {
    state.createPreview.mockImplementation(async () => ({ ...readyPreview(), status: "expired", expiresAt: Date.now() - 1 }));
    const wrapper = await mountView();
    await review(wrapper);
    expect(wrapper.get('[data-testid="document-template-preview-error"]').text()).toContain("preview expired");
    expect(useRevisionButton(wrapper).props("disabled")).toBe(true);
    expect(state.artifactBlob).not.toHaveBeenCalled();
  });
  it("enables publication only after the selected real-source preview loads, and clears it when examples change", async () => {
    const wrapper = await mountView();
    expect(useRevisionButton(wrapper).props("disabled")).toBe(true);
    await review(wrapper);
    expect(state.createPreview).toHaveBeenCalledWith(expect.objectContaining({ manifestVersionName: "2", manifestHash: "hash-2", sourceIds: ["source-a"] }));
    expect(wrapper.find('[data-testid="document-template-preview-image"]').exists()).toBe(true);
    expect(useRevisionButton(wrapper).props("disabled")).toBe(false);
    wrapper.findComponent(IonSelect).vm.$emit("update:modelValue", []);
    await flushPromises();
    expect(wrapper.find('[data-testid="document-template-preview-image"]').exists()).toBe(false);
    expect(useRevisionButton(wrapper).props("disabled")).toBe(true);
  });
  it("shows a refresh conflict after a competing publication and never reports success", async () => {
    state.publish.mockRejectedValue({ code: "PUBLICATION_CONFLICT" });
    const wrapper = await mountView();
    await review(wrapper);
    await wrapper.get('[data-testid="document-template-use-revision-btn"]').trigger("click");
    state.confirm(); await flushPromises(); await flushPromises();
    expect(wrapper.get('[data-testid="document-template-conflict-error"]').text()).toContain("current template changed");
    expect(wrapper.text()).not.toContain("The revision is now used for printing.");
    expect(state.publish.mock.calls[0][1]).toMatchObject({ expectedPublicationSequence: 3, previewId: "private", manifestVersionName: "2", manifestHash: "hash-2" });
  });
});
