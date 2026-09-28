// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { TransferSyncJobCard } from "@/composables/useShopifyTransferSync";

const state = vi.hoisted(() => ({ runs: {} as Record<string, any[]> }));
vi.mock("@common", () => ({
  translate: (key: string, values: Record<string, any> = {}) => Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), key),
}));
vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobRunsByJob: () => ({ runsFor: (name: string) => state.runs[name] ?? [], hydrated: ref(true) }),
}));
vi.mock("@/composables/useShopifyTransferSyncEnrichment", () => ({
  useShopifyTransferSyncEnrichment: () => ({
    enrichment: ref({ ordersById: { "128255": { orderName: "TO10261" } } }),
    load: vi.fn(),
  }),
}));
vi.mock("@/utils", () => ({ formatDateTime: (value: any) => String(value) }));

const card = {
  definition: { key: "create", label: "Create stager" },
  jobName: "stage_PendingShopifyTransferOrders_100051", job: { jobName: "stage_PendingShopifyTransferOrders_100051" },
} as TransferSyncJobCard;

async function render(props = {}) {
  const component = (await import("@/components/shopify/ShopifyTransferStagingErrors.vue")).default;

  return mount(component, {
    props: { shopId: "100051", cards: [card], checked: true, ...props },
    global: { stubs: { ShopifyTransferDeliveryStatus: true, ...Object.fromEntries([
      "IonBadge", "IonButton", "IonCard", "IonIcon", "IonItem", "IonLabel", "IonList", "IonListHeader", "IonSpinner",
    ].map((name) => [name, { template: "<div><slot name=\"header\"/><slot name=\"start\"/><slot/><slot name=\"content\"/><slot name=\"end\"/></div>" }])) } },
  });
}

describe("transfer staging errors list", () => {
  beforeEach(() => { state.runs = {}; });

  it("shows one destination per transfer with a summary of its blockers", async () => {
    state.runs[card.jobName] = [{ jobRunId: "637464", startTime: 100, endTime: 200, hasError: "N", results: {
      blockedOrderCount: 1,
      blockedOrderList: [{ shopId: "100051", orderId: "128255", errors: ["Order item [128255:04] product [100198] has 2 distinct ShopifyShopProduct mappings for shop [100051].", "Another blocker for this transfer"] }],
    } }];
    const wrapper = await render();
    expect(wrapper.findAll("[button=\"true\"]")).toHaveLength(1);
    expect(wrapper.text()).toContain("TO10261");
    expect(wrapper.text()).toContain("Multiple Shopify variants mapped to one product");
    await wrapper.find("[button=\"true\"]").trigger("click");
    expect(wrapper.emitted("openTransfer")?.[0]).toEqual(["128255"]);
    expect(wrapper.text()).toContain("View sync issues and next steps");
    // Native Ionic's click is forwarded by its wrapper; opening a job never executes it.
    await wrapper.find("[fill=\"clear\"]").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("openJob")?.[0]).toEqual([card]);
  });

  it("does not claim a cold cache has no errors before the live read finishes", async () => {
    const wrapper = await render({ checked: false });
    expect(wrapper.text()).toContain("Loading staging results");
    expect(wrapper.text()).not.toContain("No staging blockers");
  });

});
