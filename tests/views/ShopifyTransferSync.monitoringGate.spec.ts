// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import { serviceState } from "@common/db";

/**
 * `monitoringLoaded` decides whether the "no transfers" cold empty state is trustworthy. It reads
 * `serviceState.syncedAt.shopifyTransferSync` against a baseline captured on view entry
 * (`startTransferSyncDomains`, wired to `onIonViewWillEnter`). Neither of the sibling specs in this
 * directory exercises that: both stub `isTransferSyncMonitoringLoaded` to always return `true`, so
 * no assertion there depends on the gate's inputs.
 *
 * This file lets the real `isTransferSyncMonitoringLoaded` run and forces the assertion through its
 * `liveSyncCompleted` branch (by keeping the cached row count at 0), so a regression in the
 * baseline-capture line is actually caught.
 *
 * `onIonViewWillEnter` never fires here: Ionic's `injectHook` only runs when a real
 * `IonRouterOutlet` dispatches the lifecycle event, and a bare `@vue/test-utils` `mount()` with
 * `IonPage` stubbed never does. `watch(shopId, startTransferSyncDomains)` has no `{ immediate: true
 * }` either, so nothing compensates. `startTransferSyncDomains` is called directly instead, the
 * same way the sibling specs already reach into other script-setup bindings (e.g.
 * `wrapper.vm.showWebhooksModal`).
 *
 * A separate file rather than a new `describe` in `ShopifyTransferSync.summaryCards.spec.ts`:
 * that file's module-level `useShopifyPendingCounts` mock fixes `total` (i.e. `cachedRowCount`) at
 * 5, which would satisfy `monitoringLoaded` through the row-count branch regardless of the
 * sync-timestamp gate and defeat the point of this test. A dedicated file keeps `cachedRowCount`
 * at 0 for every test here without disturbing that file's existing cases.
 */

const apiMock = vi.fn();

vi.mock("@common", () => ({
  api: (args: any) => apiMock(args),
  commonUtil: { hasError: (res: any) => Boolean(res?.data?.error), showToast: vi.fn(), getMaargURL: () => "" },
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

// Backing store for the mocked `serviceState.syncedAt`, declared with `vi.hoisted` so the
// `vi.mock` factory below (itself hoisted above this file's other top-level code) can reference
// it. The test mutates the exported `serviceState.syncedAt` directly -- not this raw object --
// since `reactive()` only notifies dependents on writes that go through its Proxy.
const syncedAtState = vi.hoisted(() => ({ shopifyTransferSync: 100 } as Record<string, number>));

vi.mock("@common/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  serviceState: reactive({
    running: false,
    lastSyncAt: 0,
    syncedAt: syncedAtState,
    written: {},
    errors: {},
    details: {},
  }),
}));

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobs: () => ({ jobs: ref([]), hydrated: ref(true) }),
}));

vi.mock("@/composables/useShopifyTransferSync", () => ({
  useShopifyPendingCounts: () => ({
    counts: ref({}),
    creationOrderCount: ref(0),
    // Fixed at 0 so `monitoringLoaded` can only go true through `liveSyncCompleted`, not the
    // row-count branch -- that is the branch this file exists to cover.
    total: ref(0),
    hydrated: ref(true),
  }),
  useShopifyPendingSegment: () => ({ rows: ref([]), hydrated: ref(true), count: ref(0) }),
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
    rows: ref([]), total: ref(0), loading: ref(false), error: ref(""),
    hasMore: ref(false), load: vi.fn(), loadMore: vi.fn(),
  }),
  useShopifyTransferSyncJobs: () => ({ cards: ref([]), ensure: vi.fn() }),
  useShopifyWebhookReconciliation: () => ({
    rows: ref([]),
    summary: ref({
      subscribedCount: 0, requiredCount: 0, missingCount: 0, noConsumerCount: 0,
      duplicateCount: 0, elsewhereCount: 0, endpointAsserted: true,
    }),
    otherSubscriptionCount: ref(0),
    receivedTruncated: ref(false),
    loading: ref(false),
    error: ref(""),
    refresh: vi.fn(),
  }),
  registerMissingTransferWebhook: vi.fn(),
  useShopifyNativeTransferSync: () => ({
    enabled: ref(true), loading: ref(false), saving: ref(false), loadFailed: ref(false), load: vi.fn(), save: vi.fn(),
  }),
}));

vi.mock("@/composables/useShopifyTransferSyncEnrichment", () => ({
  useShopifyTransferSyncEnrichment: () => ({ enrichment: ref({}), load: vi.fn() }),
}));

// Unlike the sibling specs, the readiness gate itself is NOT stubbed: it is the thing under test.
vi.mock("@/utils/shopifyTransferSync", async () => ({
  ...(await vi.importActual<typeof import("@/utils/shopifyTransferSync")>("@/utils/shopifyTransferSync")),
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

describe("ShopifyTransferSync - monitoring gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncedAtState.shopifyTransferSync = 100;
    serviceState.syncedAt.shopifyTransferSync = 100;
  });

  it("keeps the cold empty state shut when the only completed sync predates this visit, and opens it once a newer one lands", async () => {
    const ShopifyTransferSync = (await import("@/views/ShopifyTransferSync.vue")).default;
    const wrapper = mount(ShopifyTransferSync, { props: { id: "1000" }, global: { stubs: STUBS } });

    // Simulates `onIonViewWillEnter`, which never fires under a bare mount. Captures
    // `viewSyncBaselineAt` from the current `serviceState.syncedAt.shopifyTransferSync` (100).
    (wrapper.vm as any).startTransferSyncDomains();
    await nextTick();

    // The live value (100) equals the just-captured baseline (100): a pass that finished before
    // this visit started cannot authorize the cold empty state on its own.
    expect(wrapper.vm.monitoringLoaded).toBe(false);

    // A pass that completes AFTER entry -- a newer value than the baseline -- opens the gate.
    serviceState.syncedAt.shopifyTransferSync = 200;
    await nextTick();

    expect(wrapper.vm.monitoringLoaded).toBe(true);
  });
});
