// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const apiMock = vi.fn();

vi.mock("@common", () => ({
  api: (args: any) => apiMock(args),
  commonUtil: {
    hasError: (res: any) => Boolean(res?.data?.error),
    showToast: vi.fn(),
    // The webhook modal derives its default callback URL from the connected OMS. A reserved
    // example.com host, not a real instance: a fixture naming a live tenant invites someone to
    // point a test at it.
    getMaargURL: () => "https://oms.example.com/rest/s1/",
  },
  translate: (k: string, v: Record<string, any> = {}) =>
    Object.entries(v).reduce((m, [key, val]) => m.replace(`{${key}}`, String(val)), k),
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
  useCachedList: () => ({
    records: ref([]),
    rows: ref([]),
    hydrated: ref(true),
  }),
}));

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
    counts: ref({ create: 3, shipment: 2 }),
    creationOrderCount: ref(3),
    total: ref(5),
    hydrated: ref(true),
  }),
  useShopifyPendingSegment: () => ({
    rows: ref([]),
    hydrated: ref(true),
    count: ref(0),
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

vi.mock("@/utils/shopifyTransferSync", () => ({
  isTransferSyncMonitoringLoaded: () => true,
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

describe("ShopifyTransferSync - Summary Cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults the webhook callback to the connected OMS's own receiver", async () => {
    const ShopifyTransferSync = (await import("@/views/ShopifyTransferSync.vue")).default;
    const wrapper = mount(ShopifyTransferSync, { props: { id: "1000" }, global: { stubs: STUBS } });

    // The field is seeded when the modal opens, not at setup: getMaargURL reads a cookie, so a
    // value captured at setup would be the pre-login empty string for the session.
    (wrapper.vm as any).showWebhooksModal = true;
    await wrapper.vm.$nextTick();

    // One slash, not two: getMaargURL returns a trailing slash for an alias but not for a base that
    // already carries /rest/s1.
    expect((wrapper.vm as any).webhookCallbackUrl)
      .toBe("https://oms.example.com/rest/s1/shopify/webhook/payload");
  });

  it("keeps a callback the operator already typed", async () => {
    const ShopifyTransferSync = (await import("@/views/ShopifyTransferSync.vue")).default;
    const wrapper = mount(ShopifyTransferSync, { props: { id: "1000" }, global: { stubs: STUBS } });

    (wrapper.vm as any).webhookCallbackUrl = "arn:aws:events:us-east-2::event-source/aws.partner/shopify.com/1/Commerce";
    (wrapper.vm as any).showWebhooksModal = true;
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).webhookCallbackUrl).toContain("arn:aws:events:");
  });

  it("renders two summary cards: left with pending count and syncing from, right with webhooks and jobs", async () => {
    const ShopifyTransferSync = (await import("@/views/ShopifyTransferSync.vue")).default;
    const wrapper = mount(ShopifyTransferSync, {
      props: { id: "1000" },
      global: { stubs: STUBS },
    });

    const summaryGrid = wrapper.find(".sync-summary");
    expect(summaryGrid.exists()).toBe(true);

    const cards = summaryGrid.findAll(".ion-card");
    expect(cards.length).toBe(2);

    // Left card: Summary (Pending count & Syncing from)
    const leftCard = cards[0];
    expect(leftCard.text()).toContain("Summary");
    expect(leftCard.text()).toContain("Outstanding");
    // Scoped to the row, not the whole card: the card also renders a "Syncing from" date, and a
    // bare toContain("3") would pass on any date that happened to contain the digit. That is exactly
    // how the old toContain("5") survived here after the total badge it was written for was replaced
    // by this per-segment list -- it was matching 5:00 PM at UTC-7, and failed in CI, which runs UTC.
    const outstandingRow = (label: string) => leftCard.findAll(".ion-item")
      .find((row) => row.text().includes(label));
    expect(outstandingRow("Transfers to create")?.text()).toContain("3");
    expect(outstandingRow("Shipments")?.text()).toContain("2");
    expect(leftCard.text()).toContain("Syncing from");
    expect(leftCard.text()).toContain("Change start date");

    // Right card: Webhooks and jobs
    const rightCard = cards[1];
    expect(rightCard.text()).toContain("Webhooks and jobs");
    expect(rightCard.text()).toContain("Webhook subscriptions");
    expect(rightCard.text()).toContain("4 / 4");
    expect(rightCard.text()).toContain("Stage transfers");
    expect(rightCard.text()).toContain("Active");

    // Launch modal contains ion-fab save button
    const fabButton = wrapper.find(".ion-fab-button");
    expect(fabButton.exists()).toBe(true);

    // Clicking Webhook subscriptions item opens the Webhook subscriptions modal
    expect(wrapper.vm.showWebhooksModal).toBe(false);
    const webhookItem = rightCard.findAll(".ion-item").find((item) => item.text().includes("Webhook subscriptions"));
    expect(webhookItem?.exists()).toBe(true);
    await webhookItem?.trigger("click");
    expect(wrapper.vm.showWebhooksModal).toBe(true);
  });
});
