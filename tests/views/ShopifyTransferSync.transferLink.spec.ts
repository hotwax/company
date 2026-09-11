// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

/**
 * The row header's Shopify link. Guards the two halves that make it open in a NEW tab rather than
 * navigating this one: `target="_blank"` reaching the anchor, and `@click.stop` keeping the click
 * away from the accordion's bubble-phase toggle.
 */

const shopState = vi.hoisted(() => ({ domain: "test-shop.myshopify.com" as string | undefined }));

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  translate: (k: string) => k,
  buildAppUrl: (appId: string, path = "") =>
    (appId === "transfers" ? `https://transfers.example.test${path}` : null),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifyShop: () => ({ record: ref({ shopId: "1000", myshopifyDomain: shopState.domain }) }),
}));

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    error: ref(""),
    domainStatus: ref({ shopifyTransferSync: { at: 100 } }),
    syncNow: vi.fn(),
  }),
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: () => ({ records: ref([]), rows: ref([]), hydrated: ref(true) }),
}));

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobs: () => ({ jobs: ref([]), paused: ref([]), active: ref([]), records: ref([]), hydrated: ref(true) }),
}));

vi.mock("@/composables/useShopifyTransferSyncEnrichment", () => ({
  useShopifyTransferSyncEnrichment: () => ({
    enrichment: ref({
      ordersById: { "128253": { orderName: "TO128253" } },
      creationOccurredAtByOrderId: {},
      facilityNamesById: {},
      receiptsByOrderId: {},
      receiverNamesById: {},
      shopifyShipmentIdsByOmsShipmentId: {},
    }),
    load: vi.fn(),
  }),
}));

vi.mock("@/utils/shopifyTransferSync", async () => ({
  ...(await vi.importActual<typeof import("@/utils/shopifyTransferSync")>("@/utils/shopifyTransferSync")),
  isTransferSyncMonitoringLoaded: () => true,
}));

vi.mock("@/composables/useShopifyTransferSync", () => ({
  useShopifyPendingCounts: () => ({
    counts: ref({ create: 1 }), creationOrderCount: ref(1), total: ref(1), hydrated: ref(true),
  }),
  useShopifyPendingSegment: (_shop: any, segment: any) => ({
    rows: ref(typeof segment === "function" && segment() === "create"
      ? [{ segment: "create", orderId: "128253", shopifyInventoryTransferId: "4604788917", orderItemSeqId: "01", quantity: 1 }]
      : []),
    hydrated: ref(true),
    count: ref(1),
  }),
  useShopifyTransferSyncLaunch: () => ({
    currentDate: ref("2026-09-01T00:00:00.000Z"), counts: ref({}), loading: ref(false),
    saving: ref(false), error: ref(""), load: vi.fn(), save: vi.fn(),
  }),
  useShopifySyncedSegment: () => ({
    rows: ref([]), total: ref(0), loading: ref(false), error: ref(""),
    hasMore: ref(false), load: vi.fn(), loadMore: vi.fn(),
  }),
  useShopifyTransferSyncJobs: () => ({ cards: ref([]), ensure: vi.fn() }),
  useShopifyWebhookReconciliation: () => ({
    rows: ref([]),
    summary: ref({ subscribedCount: 0, requiredCount: 0, missingCount: 0, noConsumerCount: 0,
      duplicateCount: 0, elsewhereCount: 0, endpointAsserted: true }),
    otherSubscriptionCount: ref(0), receivedTruncated: ref(false),
    loading: ref(false), error: ref(""), refresh: vi.fn(),
  }),
  registerMissingTransferWebhook: vi.fn(),
}));

async function mountView() {
  const ShopifyTransferSync = (await import("@/views/ShopifyTransferSync.vue")).default;

  return mount(ShopifyTransferSync, {
    props: { id: "1000" },
    global: {
        stubs: {
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
          // Ionic distributes `slot="header"` natively; to Vue that is a plain attribute, so every
          // child lands in the DEFAULT slot. A named-slot stub would render nothing.
          IonAccordion: { template: "<div><slot /></div>" },
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
        },
    },
  });
}

describe("ShopifyTransferSync - Shopify transfer link", () => {
  beforeEach(() => {
    shopState.domain = "test-shop.myshopify.com";
    vi.clearAllMocks();
  });

  /** Both row links, keyed by aria-label so the two are never confused for each other. */
  async function links() {
    const wrapper = await mountView();

    return Object.fromEntries(wrapper.findAll("button")
      .filter((b) => b.attributes("href"))
      .map((b) => [b.attributes("aria-label"), b]));
  }

  it("opens the transfer in a new tab, not the current one", async () => {
    const byLabel = await links();

    for(const label of ["Open transfer in Shopify Admin", "Open in Transfers"]) {
      const link = byLabel[label];
      expect(link, `missing link: ${label}`).toBeTruthy();
      // Without target="_blank" the anchor would replace the app in this tab.
      expect(link.attributes("target")).toBe("_blank");
      expect(link.attributes("rel")).toBe("noopener noreferrer");
    }
  });

  it("points each link at its own system", async () => {
    const byLabel = await links();

    expect(byLabel["Open transfer in Shopify Admin"].attributes("href"))
      .toBe("https://test-shop.myshopify.com/admin/transfers/4604788917");
    // The Transfers app is keyed by the OMS order id, not the Shopify transfer id.
    expect(byLabel["Open in Transfers"].attributes("href"))
      .toBe("https://transfers.example.test/order-detail/128253");
  });

  it("drops only the Shopify link when the shop has no cached domain", async () => {
    shopState.domain = undefined;
    const byLabel = await links();

    expect(byLabel["Open transfer in Shopify Admin"]).toBeUndefined();
    // The Transfers link does not depend on the shop domain, so it must survive.
    expect(byLabel["Open in Transfers"]).toBeTruthy();
  });
});
