// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import ShopifyOrderSyncJobDetailsModal from "./ShopifyOrderSyncJobDetailsModal.vue";

const mocks = vi.hoisted(() => ({
  runNow: vi.fn(),
  updateJob: vi.fn(),
  fetchJobDetail: vi.fn().mockResolvedValue({
    jobName: "queue_ShopifyOrderSync_10010",
    serviceName: "queue#ShopifyOrderSync",
    cronExpression: "0 0/15 * * * ?",
    paused: "N",
  }),
  fetchJobRuns: vi.fn().mockResolvedValue([]),
  fetchJobAuditHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@common", () => ({ translate: (key: string) => key }));
vi.mock("@/utils", () => ({ formatDateTime: (value: unknown) => String(value || "") }));
vi.mock("@/composables/useServiceJob", () => ({
  default: () => mocks,
}));

const container = (tag = "div") => ({ template: `<${tag} v-bind="$attrs"><slot /><slot name="header" /><slot name="content" /></${tag}>` });
const ionicStubs = {
  IonAccordion: container(),
  IonAccordionGroup: container(),
  IonBadge: container("span"),
  IonButton: container("button"),
  IonButtons: container(),
  IonCard: container(),
  IonCardContent: container(),
  IonCardHeader: container(),
  IonCardTitle: container(),
  IonContent: container(),
  IonHeader: container(),
  IonIcon: container("i"),
  IonItem: container(),
  IonLabel: container("span"),
  IonList: container(),
  IonModal: container("section"),
  IonNote: container("small"),
  IonSpinner: container("i"),
  IonTitle: container("h1"),
  IonToolbar: container(),
};

describe("ShopifyOrderSyncJobDetailsModal", () => {
  it("keeps generic job details read-only", async () => {
    const wrapper = mount(ShopifyOrderSyncJobDetailsModal, {
      props: { isOpen: false, jobName: "queue_ShopifyOrderSync_10010" },
      global: { stubs: ionicStubs },
    });
    await wrapper.setProps({ isOpen: true });
    await flushPromises();

    expect(wrapper.text()).toContain("queue_ShopifyOrderSync_10010");
    expect(wrapper.text()).toContain("Quartz cron expression");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.findAll("button").some((button) => button.text().includes("Run now"))).toBe(false);
    expect(mocks.runNow).not.toHaveBeenCalled();
    expect(mocks.updateJob).not.toHaveBeenCalled();

    const source = readFileSync(`${process.cwd()}/src/components/ShopifyOrderSyncJobDetailsModal.vue`, "utf8");
    const locale = JSON.parse(readFileSync(`${process.cwd()}/src/locales/en.json`, "utf8"));
    const literalKeys = [...source.matchAll(/translate\(["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
    expect([...new Set(literalKeys)].filter((key) => !(key in locale))).toEqual([]);
  });
});
