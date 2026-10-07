// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";

/**
 * TRANSFER-06: a transfer detail with no configured stager stayed on "Loading staging results" for
 * minutes. `checked` only advances when a `serviceJobRun` pass completes, and `startRuns` does not
 * activate `serviceJobRun` at all when there are no job names, so nothing ever advanced it. With the
 * job cache loaded and no stager jobs, there is nothing to wait for: the result is settled and empty.
 */

const cards = ref<any[]>([]);
const jobsHydrated = ref(true);

vi.mock("@common", () => ({
  commonUtil: { hasError: () => false, showToast: vi.fn(), getFeatures: () => "" },
  translate: (k: string, v: Record<string, any> = {}) =>
    Object.entries(v).reduce((m, [key, val]) => m.replace(`{${key}}`, String(val)), k),
  useDb: () => ({ records: ref([]), hydrated: ref(true) }),
  useProducts: () => ({ products: ref(new Map()), resolve: vi.fn() }),
  buildAppUrl: () => null,
}));

vi.mock("@common/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  serviceState: reactive({ syncedAt: {} as Record<string, number>, errors: {} as Record<string, string> }),
}));

vi.mock("@/services/appDbSync", () => ({
  activateSyncDomains: vi.fn().mockResolvedValue(undefined),
  deactivateSyncDomains: vi.fn().mockResolvedValue(undefined),
  createSyncDomainOwner: (label: string) => label,
  syncNow: vi.fn().mockResolvedValue(undefined),
  syncDomainsError: ref(""),
}));

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobs: () => ({ jobs: ref([]), hydrated: jobsHydrated }),
  useServiceJobRunsByJob: () => ({ runsFor: () => [], hydrated: ref(true) }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShop: () => ({ record: ref({ shopId: "SHOP", name: "Shop" }) }),
}));

vi.mock("@/composables/useShopifyTransferSync", () => ({
  useShopifyTransferSyncJobs: () => ({ cards }),
}));

vi.mock("@/composables/useShopifyTransferSyncEnrichment", () => ({
  fetchTransferSyncSummary: vi.fn().mockResolvedValue({}),
  useShopifyTransferSyncEnrichment: () => ({
    enrichment: ref({ ordersById: {} }), load: vi.fn().mockResolvedValue(undefined), loading: ref(false), error: ref(""),
  }),
}));

vi.mock("@/composables/useShopifyTransferUpdateCheck", () => ({
  useShopifyTransferUpdateCheck: () => ({ check: vi.fn() }),
}));

vi.mock("@/composables/useShopifyTransferDelivery", () => ({
  useShopifyTransferDelivery: () => ({ logsFor: () => [] }),
}));

const stubs = {
  ServiceJobDetailsModal: true,
  ShopifyTransferDeliveryStatus: true,
  ShopifyTransferMappingConflict: true,
  ShopifyTransferUpdateBlocker: true,
};

async function mountDetail() {
  const { default: View } = await import("@/views/ShopifyTransferSyncDetail.vue");
  const wrapper = mount(View, { props: { id: "SHOP", orderId: "ORDER_1" }, global: { stubs } });
  await flushPromises();
  return wrapper;
}

describe("ShopifyTransferSyncDetail - no configured stagers", () => {
  beforeEach(() => {
    vi.resetModules();
    jobsHydrated.value = true;
    // Stager cards exist but none has a job behind it: `jobNames` is empty.
    cards.value = [
      { definition: { key: "create" }, jobName: "create_job", job: undefined },
      { definition: { key: "update" }, jobName: "update_job", job: undefined },
    ];
  });

  it("settles as empty instead of waiting on a serviceJobRun sync that is never activated", async () => {
    const wrapper = await mountDetail();
    expect(wrapper.text()).not.toContain("Loading staging results");
    expect(wrapper.text()).toContain("No completed staging run is available yet.");
    wrapper.unmount();
  });

  it("still waits while the job cache has not loaded, since an empty list then means nothing yet", async () => {
    jobsHydrated.value = false;
    const wrapper = await mountDetail();
    expect(wrapper.text()).toContain("Loading staging results");
    wrapper.unmount();
  });

  it("still waits for a serviceJobRun pass when a stager job is configured", async () => {
    cards.value = [{ definition: { key: "create" }, jobName: "create_job", job: { jobName: "create_job" } }];
    const wrapper = await mountDetail();
    expect(wrapper.text()).toContain("Loading staging results");
    wrapper.unmount();
  });
});
