// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
// After "vue": the mocked module below builds its state with `reactive` when this import loads it.
import { serviceState } from "@common/db";

const apiMock = vi.fn();
const maargUrl = "https://oms.example.com/rest/s1/";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Entering the view is what activates its domains; mounting stands in for Ionic's view lifecycle.
vi.mock("@ionic/vue", async (importOriginal) => {
  const { onMounted } = await import("vue");

  return { ...(await importOriginal<Record<string, unknown>>()), onIonViewWillEnter: onMounted, onIonViewDidLeave: () => undefined };
});

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

const activateSyncDomains = vi.hoisted(() => vi.fn());
vi.mock("@/services/appDbSync", () => ({
  activateSyncDomains,
  deactivateSyncDomains: vi.fn().mockResolvedValue(undefined),
  createSyncDomainOwner: (label: string) => label,
  syncNow: vi.fn().mockResolvedValue(undefined),
  syncDomainsError: ref(""),
  refreshAfterMutation: vi.fn(),
}));

// The page reads completed passes and failures from the shared `serviceState`.
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

/** What the cache holds per list: rows, and the distinct transfer orders behind them. */
let cached: { counts: any; orderCounts: any };
let nativeSync: any;

vi.mock("@/composables/useShopifyTransferSync", () => ({
  useShopifyPendingCounts: () => {
    cached = { counts: ref({ create: 120, shipment: 4 }), orderCounts: ref({ create: 10, shipment: 2 }) };

    return {
      counts: cached.counts,
      orderCounts: cached.orderCounts,
      creationOrderCount: ref(10),
      total: ref(124),
      hydrated: ref(true),
    };
  },
  useShopifyPendingSegment: () => ({
    rows: ref([]),
    hydrated: ref(true),
    count: ref(0),
  }),
  useShopifyNativeTransferSync: () => {
    nativeSync = { enabled: ref<boolean | undefined>(false), loading: ref(false), saving: ref(false), loadFailed: ref(false), load: vi.fn(), save: vi.fn() };

    return nativeSync;
  },
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

async function mountPage() {
  const ShopifyTransferSync = (await import("@/views/ShopifyTransferSync.vue")).default;

  return mount(ShopifyTransferSync, { props: { id: "1000" }, global: { stubs: STUBS } });
}

const loadMoreButton = (wrapper: any) => wrapper.findAll("button").find((button: any) => button.text().includes("more transfers"));
const lastTransferSyncArgs = () => activateSyncDomains.mock.calls.at(-1)![0].find((domain: any) => domain.name === "shopifyTransferSync").args;

describe("ShopifyTransferSync - outstanding lists, ten transfers at a time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFailure({}, {});
    serviceState.syncedAt.shopifyTransferSync = 100;
  });

  it("activates the cheap delivery read before the transfer lists, so the detail page never waits behind them", async () => {
    await mountPage();

    expect(activateSyncDomains.mock.calls.at(-1)![0].map((domain: any) => domain.name).slice(0, 2))
      .toEqual(["shopifyTransferDelivery", "shopifyTransferSync"]);
  });

  it("asks the worker for the first ten transfer orders of every list", async () => {
    await mountPage();

    expect(lastTransferSyncArgs()).toEqual({
      shopId: "1000", orderLimits: { create: 10, shipment: 10, receipt: 10, cancellation: 10, itemChange: 10 },
    });
  });

  it("marks a list that filled its page as having more, and one that fell short as complete", async () => {
    const wrapper = await mountPage();
    const summary = (label: string) => wrapper.findAll(".ion-item").find((item) => item.text().startsWith(label))!.text();

    expect(summary("Transfers to create")).toContain("10+");
    expect(summary("Shipments")).toContain("4");
    expect(summary("Shipments")).not.toContain("+");
  });

  it("loads ten more transfers of the open list only when asked, and waits for that pass", async () => {
    const wrapper = await mountPage();
    expect(loadMoreButton(wrapper)).toBeDefined();
    activateSyncDomains.mockClear();

    await loadMoreButton(wrapper).trigger("click");

    expect(lastTransferSyncArgs().orderLimits).toEqual({ create: 20, shipment: 10, receipt: 10, cancellation: 10, itemChange: 10 });
    // While the larger read runs the button stays, as a spinner, and the list still reads as having more.
    const pending = wrapper.findAll("button").filter((button: any) => button.attributes("disabled") !== undefined && !button.text().trim());
    expect(pending).toHaveLength(1);
    expect(wrapper.findAll(".ion-item").find((item) => item.text().startsWith("Transfers to create"))!.text()).toContain("10+");

    // The larger pass lands; the list grew, and the button comes back for the next page.
    cached.orderCounts.value = { create: 20, shipment: 2 };
    serviceState.syncedAt.shopifyTransferSync = 200;
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(loadMoreButton(wrapper)).toBeDefined();
  });

  it("offers nothing more once a list holds every outstanding order", async () => {
    const wrapper = await mountPage();
    cached.orderCounts.value = { create: 7, shipment: 2 };
    await wrapper.vm.$nextTick();

    expect(loadMoreButton(wrapper)).toBeUndefined();
  });

  it("never draws the native sync switch from a value the server did not confirm", async () => {
    const wrapper = await mountPage();
    expect(wrapper.find("ion-toggle").exists()).toBe(true);

    // A failed read: no switch, which would show the default, but a retry.
    nativeSync.enabled.value = undefined;
    nativeSync.loadFailed.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find("ion-toggle").exists()).toBe(false);
    const retry = wrapper.findAll("button").find((button: any) => button.text() === "Retry")!;
    await retry.trigger("click");
    expect(nativeSync.load).toHaveBeenCalledWith("1000");

    // Still unknown while it reloads.
    nativeSync.loadFailed.value = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find("ion-toggle").exists()).toBe(false);
  });

  it("warns over the outstanding lists that nothing in them will be sent while native sync is off", async () => {
    const wrapper = await mountPage();
    const banner = "Native Inventory Transfer Sync is off, so nothing below will be sent to Shopify";
    expect(wrapper.text()).toContain(banner);

    nativeSync.enabled.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain(banner);
  });
});
