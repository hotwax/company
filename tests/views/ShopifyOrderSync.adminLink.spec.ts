// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  shop: null as any,
  recentOrders: [] as any[],
}));

vi.mock("@common", () => ({
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string, parameters: Record<string, unknown> = {}) => Object.entries(parameters)
    .reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), key),
}));

vi.mock("@/utils", () => ({
  formatDateTime: (value: unknown) => String(value ?? ""),
}));

vi.mock("@/store/user", () => ({
  useUserStore: () => ({ hasPermission: () => true }),
}));

vi.mock("@/composables/useShopify", () => ({
  ORDER_SYNC_FEATURE: { id: "order" },
  canRunOrderSyncNow: () => true,
  filterRecentOrders: (orders: any[]) => orders,
  getSyncCapabilities: () => ({ canRun: true, canConfigure: true }),
  isOrderSyncBatchActive: () => false,
  orderSyncRunNowDisabledReason: () => "",
  orderSyncSummary: () => ({ pendingBatchRequests: 0, batchStatus: "completed" }),
  useShopifyOrderSyncPolling: () => ({
    isPageActive: { value: false },
    isRefreshing: { value: false },
    manualRefresh: vi.fn().mockResolvedValue(undefined),
  }),
  useShopifyOrderSync: () => ({
    activeMutation: "",
    batches: [],
    failedDataManagerLogs: [],
    importsBySystemMessageId: {},
    isPaused: false,
    job: null,
    landmarkDates: { status: "ready", launchDate: "", historyLastSyncDate: "" },
    lastRunResult: null,
    loadMonitoring: vi.fn().mockResolvedValue(undefined),
    monitoringError: "",
    monitoringLoadedAt: 1,
    monitoringRefreshing: false,
    productStore: null,
    recentAudits: [],
    recentErrors: [],
    recentOrders: harness.recentOrders,
    recentRequestErrors: [],
    remote: {},
    replayOrdersFromDate: vi.fn(),
    requestSelectedOrders: vi.fn(),
    resetForShop: vi.fn(),
    runNow: vi.fn(),
    runtimeTimeZone: "UTC",
    searchShopifyOrders: vi.fn(),
    selectedShopId: "1000",
    setLandmarkDate: vi.fn(),
    shop: harness.shop,
    suggestOldestOrderDate: vi.fn(),
    systemMessages: [],
    updateJobStatus: vi.fn(),
    updateSchedule: vi.fn(),
  }),
}));

vi.mock("@/components/common/ServiceJobDetailsModal.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/common/SystemMessageDetailsModal.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/shopify-order-sync/ShopifyOrderSyncCustomRequestCard.vue", () => ({ default: { template: "<div />" } }));

const VERIFIED_ORDER = {
  id: "row-1",
  shopId: "1000",
  shopifyOrderId: "4604788917",
  orderName: "#1001",
  outcome: "Created",
  processedAt: "1787700000000",
  shopifyFetchVerified: true,
  updatedObjects: [],
};

function stubs() {
  const passthrough = { template: "<div><slot /></div>" };
  return {
    IonPage: passthrough,
    IonHeader: passthrough,
    IonToolbar: passthrough,
    IonButtons: passthrough,
    IonBackButton: { template: "<button />" },
    IonTitle: { template: "<h1><slot /></h1>" },
    IonContent: passthrough,
    IonCard: { template: "<div class='ion-card'><slot /></div>" },
    IonCardHeader: passthrough,
    IonCardTitle: { template: "<h2><slot /></h2>" },
    IonCardSubtitle: { template: "<h3><slot /></h3>" },
    IonCardContent: passthrough,
    IonList: passthrough,
    IonItem: { template: "<div class='ion-item'><slot /></div>" },
    IonItemDivider: passthrough,
    IonLabel: { template: "<div class='ion-label'><slot /></div>" },
    IonBadge: { template: "<span><slot /></span>" },
    IonButton: { template: "<button class='ion-button'><slot /></button>" },
    IonChip: { template: "<div><slot /></div>" },
    IonIcon: { template: "<span />" },
    IonInput: { template: "<input />" },
    IonSearchbar: { template: "<input />" },
    IonSkeletonText: { template: "<span />" },
    IonSpinner: { template: "<span />" },
    IonNote: { template: "<span><slot /></span>" },
    IonProgressBar: { template: "<div />" },
    IonAccordionGroup: passthrough,
    IonAccordion: { template: "<div><slot name='header' /><slot name='content' /></div>" },
    IonSegment: passthrough,
    IonSegmentButton: { template: "<button><slot /></button>" },
    IonModal: passthrough,
    IonToggle: passthrough,
    IonSelect: passthrough,
    IonSelectOption: passthrough,
    IonDatetime: { template: "<div />" },
    IonDatetimeButton: { template: "<button />" },
    IonPopover: passthrough,
    IonFab: passthrough,
    IonFabButton: { template: "<button><slot /></button>" },
    IonReorder: passthrough,
    IonReorderGroup: passthrough,
    IonCheckbox: passthrough,
    IonRadio: passthrough,
    IonRadioGroup: passthrough,
    IonTextarea: { template: "<textarea />" },
  };
}

async function mountOrderSync(shop: any, recentOrders: any[]) {
  harness.shop = shop;
  harness.recentOrders = recentOrders;
  const ShopifyOrderSync = (await import("@/views/ShopifyOrderSync.vue")).default;
  return mount(ShopifyOrderSync, { props: { id: "1000" }, global: { stubs: stubs() } });
}

function adminLinkHrefs(wrapper: any) {
  return wrapper.findAll("[href]")
    .map((node: any) => node.attributes("href"))
    .filter((href: string) => href.includes("/admin/orders/"));
}

describe("ShopifyOrderSync - Shopify admin order link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links a verified order into the admin of a real shop host", async () => {
    const wrapper = await mountOrderSync(
      { shopId: "1000", name: "Rails Paris", myshopifyDomain: "rails-paris.myshopify.com" },
      [VERIFIED_ORDER],
    );

    expect(adminLinkHrefs(wrapper)).toEqual(["https://rails-paris.myshopify.com/admin/orders/4604788917"]);
  });

  // myshopifyDomain is operator input the connection form only checks for non-emptiness, so a
  // stored host that is not a shop renders no "Open order in Shopify Admin" control at all.
  it("renders no link when the stored shop domain is not a shop host", async () => {
    const wrapper = await mountOrderSync(
      { shopId: "1000", name: "Not a shop", myshopifyDomain: "evil.com" },
      [VERIFIED_ORDER],
    );

    expect(adminLinkHrefs(wrapper)).toEqual([]);
    expect(wrapper.html()).not.toContain("evil.com/admin");
  });

  it("renders no link for an order id that names no record", async () => {
    const wrapper = await mountOrderSync(
      { shopId: "1000", name: "Rails Paris", myshopifyDomain: "rails-paris.myshopify.com" },
      [{ ...VERIFIED_ORDER, shopifyOrderId: "../../settings" }],
    );

    expect(adminLinkHrefs(wrapper)).toEqual([]);
  });
});
