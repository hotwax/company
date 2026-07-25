// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import ShopifyOrderSyncCard from "@/components/ShopifyOrderSyncCard.vue";

vi.mock("@common", () => ({
  translate: (key: string, values?: Record<string, unknown>) => Object.entries(values || {})
    .reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

vi.mock("@/utils", () => ({
  formatDateTime: (value: string) => value,
}));

const ionicStubs = {
  IonBadge: { template: "<span><slot /></span>" },
  IonCard: { template: "<article v-bind=\"$attrs\"><slot /></article>" },
  IonCardHeader: { template: "<header><slot /></header>" },
  IonCardSubtitle: { template: "<p><slot /></p>" },
  IonCardTitle: { template: "<h2><slot /></h2>" },
  IonItem: { template: "<div v-bind=\"$attrs\"><slot /></div>" },
  IonLabel: { template: "<span><slot /></span>" },
  IonList: { template: "<div><slot /></div>" },
  IonSkeletonText: { template: "<i />" },
};

function mountCard(snapshot: Record<string, unknown>) {
  return mount(ShopifyOrderSyncCard, {
    props: { snapshot: snapshot as never },
    global: { stubs: ionicStubs },
  });
}

describe("ShopifyOrderSyncCard", () => {
  it("renders exactly the accepted two progress rows and never a bulk-operation row", () => {
    const wrapper = mountCard({
      configurationState: "configured-active",
      processedCount: 12,
      pendingCount: 1,
      lastCompletedLabel: "2026-07-22T12:00:00Z",
      batchStatus: "Completed",
      batchDetail: "Request completed",
      importStatus: "Partially completed",
      importDetail: "2 imports",
      actionable: true,
    });

    expect(wrapper.findAll("[data-progress-row]")).toHaveLength(2);
    expect(wrapper.find("[data-progress-row='shopify-order-batch-request']").exists()).toBe(true);
    expect(wrapper.find("[data-progress-row='hotwax-order-import']").exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/bulk operation/i);
    expect(wrapper.text()).toContain("Partially completed");
    expect(wrapper.text()).toContain("2 imports");
  });

  it("emits one open action only when the snapshot is actionable", async () => {
    const actionable = mountCard({ configurationState: "missing", actionable: true });
    await actionable.get("article").trigger("click");
    expect(actionable.emitted("open")).toHaveLength(1);

    const blocked = mountCard({
      configurationState: "missing",
      loading: true,
      actionable: false,
    });
    await blocked.get("article").trigger("click");
    expect(blocked.emitted("open")).toBeUndefined();
    expect(blocked.get("article").attributes("aria-disabled")).toBe("true");
    expect(blocked.get("article").attributes("aria-busy")).toBe("true");
  });

  it("localizes canonical snapshot details at the render boundary", () => {
    const wrapper = mountCard({
      configurationState: "configured-paused",
      batchStatus: "Not started",
      batchDetail: "No batch request yet",
      importStatus: "Completed",
      importDetail: "1 import",
      actionable: true,
    });

    expect(wrapper.text()).toContain("No batch request has been produced yet");
    expect(wrapper.text()).toContain("1 import");
    expect(wrapper.text()).toContain("Paused");
  });

  it("keeps an actionable error card navigable to monitoring recovery", async () => {
    const wrapper = mountCard({
      configurationState: "configured-active",
      error: "Order Sync status could not be loaded.",
      actionable: true,
    });

    expect(wrapper.text()).toContain("Open order sync to inspect the latest status");
    expect(wrapper.get("article").attributes("aria-disabled")).toBeUndefined();
    await wrapper.get("article").trigger("click");
    expect(wrapper.emitted("open")).toHaveLength(1);
  });
});
