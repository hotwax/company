// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { serviceState } from "@common/db";

const apiMock = vi.fn();
const maargUrl = "https://oms.example.com/rest/s1/";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@common", () => ({
  api: (args: any) => apiMock(args),
  commonUtil: {
    hasError: (res: any) => Boolean(res?.data?.error),
    showToast: vi.fn(),
    // The webhook modal derives its default callback URL from the connected OMS. A reserved
    // example.com host, not a real instance: a fixture naming a live tenant invites someone to
    // point a test at it. Mutable, so a test can stand in for switching OMS.
    getMaargURL: () => maargUrl,
  },
  translate: (k: string, v: Record<string, any> = {}) =>
    Object.entries(v).reduce((m, [key, val]) => m.replace(`{${key}}`, String(val)), k),
  buildAppUrl: () => null,
  useDb: () => ({ records: ref([]), rows: ref([]), hydrated: ref(true) }),
}));

vi.mock("@/services/appDbSync", () => ({
  activateSyncDomains: vi.fn().mockResolvedValue(undefined),
  deactivateSyncDomains: vi.fn().mockResolvedValue(undefined),
  createSyncDomainOwner: (label: string) => label,
  syncNow: vi.fn().mockResolvedValue(undefined),
  syncDomainsError: ref(""),
  refreshAfterMutation: vi.fn(),
}));

// The page reads sync failures and their details from the shared `serviceState`. No completed
// pass this visit (empty `syncedAt`): only the partial result can make the page usable.
vi.mock("@common/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  serviceState: reactive({
    running: false,
    lastSyncAt: 0,
    syncedAt: {},
    written: {},
    errors: {} as Record<string, string>,
    details: {} as Record<string, unknown>,
  }),
}));

/** Replace the mocked service state's failures for one test. */
function setFailure(errors: Record<string, string>, details: Record<string, unknown>) {
  for(const key of Object.keys(serviceState.errors)) {delete serviceState.errors[key];}
  for(const key of Object.keys(serviceState.details)) {delete serviceState.details[key];}
  Object.assign(serviceState.errors, errors);
  Object.assign(serviceState.details, details);
}

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobs: () => ({
    jobs: ref([
      { jobName: "stage_ShopifyTransfers_1000", paused: "N", nextExecutionDateTime: "2026-09-02T20:00:00.000Z" },
    ]),
    hydrated: ref(true),
  }),
}));

vi.mock("@/composables/useShopifyTransferSync", () => ({
  useShopifyPendingCounts: () => ({
    counts: ref({}),
    creationOrderCount: ref(0),
    total: ref(0),
    hydrated: ref(true),
  }),
  useShopifyPendingSegment: () => ({
    rows: ref([]),
    hydrated: ref(true),
    count: ref(0),
  }),
  useShopifyNativeTransferSync: () => ({
    enabled: ref(true), loading: ref(false), saving: ref(false), loadFailed: ref(false), load: vi.fn(), save: vi.fn(),
  }),
  useShopifyTransferSyncLaunch: () => ({
    currentDate: ref("2026-09-01T00:00:00.000Z"),
    counts: ref({}),
    loading: ref(false),
    saving: ref(false),
    error: ref(""),
    load: vi.fn(),
    save: vi.fn(),
  }),
  useShopifySyncedSegment: () => ({
    rows: ref([]),
    total: ref(0),
    loading: ref(false),
    error: ref(""),
    hasMore: ref(false),
    load: vi.fn(),
    loadMore: vi.fn(),
  }),
  useShopifyTransferSyncJobs: () => ({
    cards: ref([
      {
        definition: { key: "stage", label: "Stage transfers", purpose: "Stages orders", scope: "shop", template: "stage_ShopifyTransfers" },
        job: { jobName: "stage_ShopifyTransfers_1000", paused: "N" },
        jobName: "stage_ShopifyTransfers_1000",
        status: "active",
        nextRun: "2026-09-02T20:00:00.000Z",
      },
    ]),
    ensure: vi.fn(),
  }),
  useShopifyWebhookReconciliation: () => ({
    rows: ref([]),
    summary: ref({
      subscribedCount: 4,
      requiredCount: 4,
      missingCount: 0,
      noConsumerCount: 0,
      duplicateCount: 0,
      elsewhereCount: 0,
      endpointAsserted: true,
    }),
    otherSubscriptionCount: ref(0),
    receivedTruncated: ref(false),
    loading: ref(false),
    error: ref(""),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/composables/useShopifyTransferSyncEnrichment", () => ({
  useShopifyTransferSyncEnrichment: () => ({
    enrichment: ref({}),
    load: vi.fn(),
  }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShop: () => ({ record: ref({ shopId: "1000", myshopifyDomain: "test-shop.myshopify.com" }) }),
}));

const STUBS = {
  IonPage: { template: "<div><slot /></div>" },
  IonHeader: { template: "<div><slot /></div>" },
  IonToolbar: { template: "<div><slot /></div>" },
  IonButtons: { template: "<div><slot /></div>" },
  IonBackButton: { template: "<button />" },
  IonTitle: { template: "<h1><slot /></h1>" },
  IonContent: { template: "<div><slot /></div>" },
  IonCard: { template: "<div class='ion-card'><slot /></div>" },
  IonCardHeader: { template: "<div class='ion-card-header'><slot /></div>" },
  IonCardTitle: { template: "<h2 class='ion-card-title'><slot /></h2>" },
  IonCardSubtitle: { template: "<h3 class='ion-card-subtitle'><slot /></h3>" },
  IonCardContent: { template: "<div class='ion-card-content'><slot /></div>" },
  IonList: { template: "<div class='ion-list'><slot /></div>" },
  IonItem: { template: "<div class='ion-item'><slot /></div>" },
  IonItemDivider: { template: "<div class='ion-item-divider'><slot /></div>" },
  IonLabel: { template: "<div class='ion-label'><slot /></div>" },
  IonBadge: { template: "<span class='ion-badge'><slot /></span>" },
  IonButton: { template: "<button><slot /></button>" },
  IonIcon: { template: "<span />" },
  IonSkeletonText: { template: "<span />" },
  IonSpinner: { template: "<span />" },
  IonNote: { template: "<span />" },
  IonAccordionGroup: { template: "<div><slot /></div>" },
  IonAccordion: { template: "<div><slot name='header' /><slot name='content' /></div>" },
  IonSegment: { template: "<div><slot /></div>" },
  IonSegmentButton: { template: "<button><slot /></button>" },
  IonModal: { template: "<div><slot /></div>" },
  IonRadioGroup: { template: "<div><slot /></div>" },
  IonRadio: { template: "<div><slot /></div>" },
  IonDatetime: { template: "<div />" },
  IonDatetimeButton: { template: "<button />" },
  IonPopover: { template: "<div><slot /></div>" },
  IonFab: { template: "<div class='ion-fab'><slot /></div>" },
  IonFabButton: { template: "<button class='ion-fab-button'><slot /></button>" },
  ServiceJobDetailsModal: { template: "<div />" },
};

const FAILURE = {
  failedSegments: {
    shipment: { message: "The OMS did not answer within 45 seconds.", retryAt: Date.parse("2026-10-06T19:30:00Z") },
    receipt: { message: "Error finding list of ShopifyPendingTransferReceipt", retryAt: Date.parse("2026-10-06T19:30:00Z") },
  },
  loadedSegments: ["create", "cancellation", "itemChange"],
};

async function mountPage() {
  const ShopifyTransferSync = (await import("@/views/ShopifyTransferSync.vue")).default;

  return mount(ShopifyTransferSync, { props: { id: "1000" }, global: { stubs: STUBS } });
}

describe("ShopifyTransferSync - partially loaded pass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFailure(
      { shopifyTransferSync: "2 of 5 transfer sync lists could not be loaded (shipment, receipt): slow" },
      { shopifyTransferSync: FAILURE },
    );
  });

  it("renders the segments that loaded instead of skeletons, and marks the ones that did not", async () => {
    const wrapper = await mountPage();
    const text = wrapper.text();

    expect(text).not.toContain("Transfer sync data could not be loaded");
    expect(text).toContain("The list below may be out of date");
    // Shipments and Receipts are unknown, so they say so instead of counting zero.
    expect(wrapper.findAll(".ion-item").filter((item) => item.text().includes("Not loaded"))
      .map((item) => item.text().replace("Not loaded", "").trim())).toEqual(["Shipments", "Receipts"]);
  });

  it("never reports everything in sync while a segment is unknown", async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).not.toContain("Everything is in sync");
    expect(wrapper.text()).toContain("Nothing outstanding in this tab.");
  });

  it("explains a failed tab with its reason and next retry, instead of calling it empty", async () => {
    const wrapper = await mountPage();
    (wrapper.vm as any).activeTab = "receipt";
    await wrapper.vm.$nextTick();
    const text = wrapper.text();

    expect(text).toContain("This list could not be loaded");
    expect(text).toContain("Error finding list of ShopifyPendingTransferReceipt");
    expect(text).toContain("Next automatic retry:");
    expect(text).not.toContain("Nothing outstanding in this tab.");
  });

  it("falls back to the blocking error when no segment loaded", async () => {
    setFailure(
      { shopifyTransferSync: "5 of 5 transfer sync lists could not be loaded" },
      { shopifyTransferSync: { ...FAILURE, loadedSegments: [] } },
    );
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain("Transfer sync data could not be loaded");
  });
});
