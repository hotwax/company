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
const nativeSyncEnabled = ref<boolean | undefined>(true);
const runsByJob: Record<string, any[]> = {};
const summaryResult: { value: Record<string, unknown> } = { value: {} };

// Entering the view loads the summary and settings; mounting stands in for Ionic's view lifecycle.
vi.mock("@ionic/vue", async (importOriginal) => {
  const { onMounted } = await import("vue");

  return { ...(await importOriginal<Record<string, unknown>>()), onIonViewWillEnter: onMounted, onIonViewDidLeave: () => undefined };
});

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
  useServiceJobRunsByJob: () => ({ runsFor: (jobName: string) => runsByJob[jobName] ?? [], hydrated: ref(true) }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShop: () => ({ record: ref({ shopId: "SHOP", name: "Shop" }) }),
}));

vi.mock("@/composables/useShopifyTransferSync", () => ({
  useShopifyTransferSyncJobs: () => ({ cards }),
  useShopifyNativeTransferSync: () => ({ enabled: nativeSyncEnabled, load: vi.fn() }),
}));

vi.mock("@/composables/useShopifyTransferSyncEnrichment", () => ({
  fetchTransferSyncSummary: vi.fn(async () => summaryResult.value),
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
    nativeSyncEnabled.value = true;
    summaryResult.value = {};
    for(const key of Object.keys(runsByJob)) {delete runsByJob[key];}
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

describe("ShopifyTransferSyncDetail - what a stager's result says about this transfer", () => {
  /** Both stagers configured, each with one completed run whose result is `results`. */
  function stagersWithResult(results: unknown) {
    cards.value = [
      { definition: { key: "create" }, jobName: "create_job", job: { jobName: "create_job" } },
      { definition: { key: "update" }, jobName: "update_job", job: { jobName: "update_job" } },
    ];
    for(const jobName of ["create_job", "update_job"]) {
      runsByJob[jobName] = [{ jobRunId: `${jobName}_run`, startTime: 1, endTime: 2, hasError: "N", results }];
    }
  }

  beforeEach(() => {
    vi.resetModules();
    jobsHydrated.value = true;
    nativeSyncEnabled.value = true;
    summaryResult.value = {};
    for(const key of Object.keys(runsByJob)) {delete runsByJob[key];}
  });

  it("explains that native sync is off, with next steps, instead of calling the stagers' empty results unreadable", async () => {
    stagersWithResult({});
    nativeSyncEnabled.value = false;
    const wrapper = await mountDetail();
    const text = wrapper.text();

    expect(text).toContain("Native Inventory Transfer Sync is off");
    expect(text).toContain("Next steps");
    expect(text).not.toContain("Staging results could not be read");
    expect(text).not.toContain("Resolve issue");
    wrapper.unmount();
  });

  it("does not list a run-wide creation result for a transfer Shopify already has", async () => {
    stagersWithResult({});
    summaryResult.value = { transferId: "gid://shopify/InventoryTransfer/1" };
    const wrapper = await mountDetail();
    const issues = wrapper.findAll("ion-radio").map((radio) => radio.text());

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Updates");
    wrapper.unmount();
  });

  it("still lists both when the transfer has not reached Shopify", async () => {
    stagersWithResult({});
    const wrapper = await mountDetail();

    expect(wrapper.findAll("ion-radio")).toHaveLength(2);
    wrapper.unmount();
  });
});
