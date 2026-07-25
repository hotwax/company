// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ServiceJobDetailsModal from "@/components/ServiceJobDetailsModal.vue";

const mocks = vi.hoisted(() => ({
  runNow: vi.fn(),
  updateJob: vi.fn(),
  fetchJobDetail: vi.fn().mockResolvedValue({
    jobName: "queue_ShopifyOrderSync_10010",
    serviceName: "queue#ShopifyOrderSync",
    cronExpression: "0 0/15 * * * ?",
    paused: "N",
    serviceJobParameters: [
      { parameterName: "shopId", parameterValue: "10010" },
      { parameterName: "privateCredential", parameterValue: "must-not-render" },
    ],
  }),
  fetchJobRuns: vi.fn().mockResolvedValue([{ jobRunId: "run-1", statusId: "Completed", message: "unsafe output" }]),
  fetchJobAuditHistory: vi.fn().mockResolvedValue([{ changedFieldName: "cronExpression", oldValue: "unsafe old", newValue: "unsafe new" }]),
}));

vi.mock("@common", () => ({
  translate: (key: string) => key,
  commonUtil: { showToast: vi.fn() },
}));
vi.mock("@/utils", () => ({ formatDateTime: (value: unknown) => String(value || "") }));
vi.mock("@/composables/useServiceJob", () => ({ default: () => mocks }));

const container = (tag = "div") => ({ template: `<${tag} v-bind="$attrs"><slot /><slot name="header" /><slot name="content" /></${tag}>` });
const ionicStubs = {
  IonAccordion: container(), IonAccordionGroup: container(), IonBadge: container("span"), IonButton: container("button"),
  IonButtons: container(), IonContent: container(), IonFab: container(), IonFabButton: container("button"), IonHeader: container(),
  IonIcon: container("i"), IonInput: container("input"), IonItem: container(), IonLabel: container("span"), IonList: container(),
  IonListHeader: container(), IonModal: container("section"), IonNote: container("small"), IonRadio: container("input"),
  IonRadioGroup: container(), IonSpinner: container("i"), IonTitle: container("h1"), IonToggle: container("input"), IonToolbar: container(),
};

describe("ServiceJobDetailsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the same editable Product Sync job viewer for Order Sync while keeping displayed facts safe", async () => {
    const wrapper = mount(ServiceJobDetailsModal, {
      props: {
        isOpen: false,
        jobName: "queue_ShopifyOrderSync_10010",
        title: "Queue order requests",
        allowedParameterNames: ["shopId", "systemMessageRemoteId", "systemMessageTypeId", "runAsBatch"],
        parameterDescription: "Job and service parameters used by this Order Sync job.",
      },
      global: { stubs: ionicStubs },
    });
    await wrapper.setProps({ isOpen: true });
    await flushPromises();

    expect(wrapper.text()).toContain("Queue order requests");
    expect(wrapper.text()).toContain("queue_ShopifyOrderSync_10010");
    expect(wrapper.find('input[label="Quartz cron expression"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Recent runs");
    expect(wrapper.text()).toContain("Edit history");
    expect(wrapper.text()).toContain("shopId");
    expect(wrapper.text()).not.toContain("privateCredential");
    expect(wrapper.text()).not.toContain("must-not-render");
    expect(wrapper.text()).not.toContain("unsafe output");
    expect(wrapper.text()).not.toContain("unsafe old");
    expect(wrapper.text()).not.toContain("unsafe new");
    expect(wrapper.find("input").exists()).toBe(true);
    expect(wrapper.findAll("button").some((button) => button.text().includes("Run now"))).toBe(true);
    expect(mocks.runNow).not.toHaveBeenCalled();
    expect(mocks.updateJob).not.toHaveBeenCalled();
    expect(mocks.fetchJobAuditHistory).toHaveBeenCalled();
  });

  it("exposes Product Sync job controls in editable mode", async () => {
    const wrapper = mount(ServiceJobDetailsModal, {
      props: { isOpen: false, jobName: "queue_ProductSync", title: "Queue update requests" },
      global: { stubs: ionicStubs },
    });
    await wrapper.setProps({ isOpen: true });
    await flushPromises();

    expect(wrapper.text()).toContain("Run now");
    expect(wrapper.find("input").exists()).toBe(true);
    expect(wrapper.findAll("button").some((button) => button.attributes("aria-label") === "Save")).toBe(true);
  });

  it("uses caller-owned mutation handlers when the owning workflow supplies them", async () => {
    const runHandler = vi.fn().mockResolvedValue(true);
    const saveHandler = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(ServiceJobDetailsModal, {
      props: {
        isOpen: false,
        jobName: "queue_ShopifyOrderSync_10010",
        runHandler,
        saveHandler,
      },
      global: { stubs: ionicStubs },
    });
    await wrapper.setProps({ isOpen: true });
    await flushPromises();

    const runButton = wrapper.findAll("button").find((button) => button.text().includes("Run now"));
    await runButton!.trigger("click");
    await flushPromises();
    expect(runHandler).toHaveBeenCalledTimes(1);
    expect(mocks.runNow).not.toHaveBeenCalled();

    const cronInput = wrapper.findComponent(ionicStubs.IonInput);
    cronInput.vm.$emit("update:modelValue", "0 0/30 * * * ?");
    await wrapper.vm.$nextTick();
    const saveButton = wrapper.findAll("button").find((button) => button.attributes("aria-label") === "Save");
    await saveButton!.trigger("click");
    await flushPromises();
    expect(saveHandler).toHaveBeenCalledWith({ cronExpression: "0 0/30 * * * ?", paused: false });
    expect(mocks.updateJob).not.toHaveBeenCalled();
  });
});
