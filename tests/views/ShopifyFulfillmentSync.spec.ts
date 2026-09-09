// @vitest-environment jsdom
import { IonAccordion, IonAccordionGroup, IonIcon, IonSegment, IonCheckbox } from "@ionic/vue";
import { flushPromises, mount, enableAutoUnmount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, computed } from "vue";
import { api } from "@common";
import { sendPendingFulfillment } from "@/composables/useFulfillmentSend";
import { cartOutline, sendOutline } from "ionicons/icons";
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue";
import FulfillmentDiagnosis from "@/components/shopify-fulfillment/FulfillmentDiagnosis.vue";
import FulfillmentShipmentCard from "@/components/shopify-fulfillment/FulfillmentShipmentCard.vue";
import ShopifyFulfillmentSync from "@/views/ShopifyFulfillmentSync.vue";

enableAutoUnmount(afterEach);

vi.mock("@/composables/useOrderSyncHistory", () => ({ useOrderSyncHistory: () => ({ ready: ref(false), error: ref(false), histories: ref([]), pending: ref([]), queued: ref([]), synced: ref([]) }) }));
const jobRows = ref<any[]>([]);
const healthRow = ref<any>({});
const pendingRows = ref<any[]>([]);
const pendingStatus = ref<any>({ state: "ready" });
const visibleCards: Array<{ element?: Element; show: () => void }> = [];
const queuedRows = ref<any[]>([]);
const queuedHydrated = ref(true);
const syncedRows = ref<any[]>([]);
const syncedHydrated = ref(true);
const endpointMissing = ref(false);
const cachedErrors = ref<any[]>([]);
const resolvedProducts = ref(new Map<string, any>());
const cachedFacilities = ref<any[]>([]);

const harness = vi.hoisted(() => ({
  downloadTextFile: vi.fn(),
  showToast: vi.fn(),
  ensureSystemMessageErrors: vi.fn(),
  resendSystemMessage: vi.fn(),
  resetSystemMessageError: vi.fn(),
  forceSystemMessageStatus: vi.fn(),
  getFulfillmentDetails: vi.fn(),
  afterMutation: vi.fn(),
  resolveProductNames: vi.fn(),
  /** What the mocked ion-alert dismisses with — the spec's stand-in for the operator's choice. */
  alertRole: "confirm",
}));

vi.mock("@/utils", async (importOriginal) => ({ ...await importOriginal<any>(), downloadTextFile: (...args: any[]) => harness.downloadTextFile(...args) }));

vi.mock("@common", () => ({
  api: vi.fn(async ({ params }: any) => ({ data: { checkedAt: "2026-09-08T02:00:00Z", retry: { explanation: "Automatic retry jobs are paused." }, canRetry: params?.systemMessageId !== "held", lines: params?.systemMessageId === "held" ? [{ lineItemId: "line", name: "Hoodie", title: "A Shopify hold blocks this shipment", action: "Resolve the inventory issue and release only the intended hold in Shopify, then check again.", code: "HOLD", allocations: [], workAllocations: [] }] : [] } })),
  commonUtil: {
    hasError: (response: any) => !!response.data?.errors,
    showToast: (...args: any[]) => harness.showToast(...args),
  },
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    ),
}));

// Only the alert overlay is replaced: ion-alert cannot be presented in jsdom, so the controller
// resolves straight to whichever role the harness holds. Every component stays real.
vi.mock("@ionic/vue", async (importOriginal) => {
  const actual: any = await importOriginal();

  return {
    ...actual,
    alertController: {
      create: () => Promise.resolve({
        present: () => Promise.resolve(),
        onDidDismiss: () => Promise.resolve({ role: harness.alertRole }),
      }),
    },
  };
});

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    syncNow: vi.fn().mockResolvedValue(undefined),
    ready: ref(true),
    error: ref(""),
    afterMutation: (...args: any[]) => {
      harness.afterMutation(...args);

      return Promise.resolve();
    },
  }),
}));

const shipmentContexts = new Map<string, any>();

vi.mock("@/composables/useShopifyFulfillment", () => ({
  useFulfillmentSyncHealth: () => ({ health: healthRow, hydrated: ref(true) }),
  useOmsShipmentContext: () => ({
    getShipmentContext: (query: { shipmentId?: string; orderId?: string }) =>
      Promise.resolve(shipmentContexts.get(query?.shipmentId ?? "")),
  }),
  usePendingFulfillments: () => ({ rows: pendingRows, status: pendingStatus }),
  useQueuedFulfillments: () => ({ rows: queuedRows, hydrated: queuedHydrated }),
  useSyncedFulfillments: () => ({ rows: syncedRows, hydrated: syncedHydrated, endpointMissing }),
  useShopifyFulfillmentDetails: () => ({
    getFulfillmentDetails: (...args: any[]) => harness.getFulfillmentDetails(...args),
  }),
}));

vi.mock("@/composables/useServiceJobs", () => ({ useServiceJobs: () => ({ jobs: jobRows, hydrated: ref(false) }),
  useServiceJob: () => ({ fetchJobDetail: vi.fn(async (jobName: string) => ({ jobName, paused: 'Y', cronExpression: '0 0/15 * * * ?', serviceJobParameters: [] })), fetchJobRuns: vi.fn(async () => []), fetchJobAuditHistory: vi.fn(async () => []), updateJob: vi.fn(), runNow: vi.fn() })
}));
vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    fetchSystemMessageErrors: (...args: any[]) => harness.ensureSystemMessageErrors(...args),
    ensureSystemMessageErrors: (...args: any[]) => harness.ensureSystemMessageErrors(...args),
    resendSystemMessage: (...args: any[]) => harness.resendSystemMessage(...args),
    resetSystemMessageError: (...args: any[]) => harness.resetSystemMessageError(...args),
    forceSystemMessageStatus: (...args: any[]) => harness.forceSystemMessageStatus(...args),
  }),
  useSystemMessageErrors: () => ({
    errors: cachedErrors,
    errorText: ref(""),
    hydrated: ref(true),
  }),
}));

vi.mock("@/composables/useProductNames", () => ({
  useProductNames: () => ({
    products: resolvedProducts,
    resolve: (...args: any[]) => harness.resolveProductNames(...args),
  }),
}));

vi.mock("@/composables/useFacilities", () => ({
  useFacilities: () => ({
    facilities: cachedFacilities,
    records: cachedFacilities,
    hydrated: ref(true),
  }),
}));

vi.mock("@/composables/useShopify", () => ({
  useShopifySyncContext: () => ({
    shopId: ref("100002"),
    remoteId: ref("REMOTE_100002"),
    remoteIds: ref(["REMOTE_100002"]),
    hydrated: ref(true),
  }),
}));

function queuedMessage(overrides: Record<string, any> = {}) {
  return {
    systemMessageId: "10001",
    statusId: "SmsgError",
    failCount: 24,
    initDate: Date.now() - 3 * 60 * 60 * 1000,
    lastAttemptDate: Date.now() - 60 * 60 * 1000,
    systemMessageTypeId: "CreateShopifyFulfillment",
    messageText: JSON.stringify({ shipmentId: "SHP-88214", orderId: "RAI-100461" }),
    orderId: "RAI-100461",
    parsed: {
      shipmentId: "SHP-88214",
      orderId: "RAI-100461",
      shopifyOrderId: "5100",
      trackingNumber: "1Z999AA10123456784",
      items: [{ orderItemSeqId: "00001", productId: "P1", quantity: 1, shopifyLineItemId: "L1" }],
    },
    ...overrides,
  };
}

function syncedRow(overrides: Record<string, any> = {}) {
  return {
    fulfillmentKey: "100002:4471301884",
    shopId: "100002",
    fulfillmentId: "4471301884",
    shopifyOrderId: "5100200300",
    omsOrderId: "RAI-100488",
    shipmentId: "SHP-88801",
    originFacilityId: "STORE_118",
    orderDate: 1755600000000,
    shippedDate: 1755660000000,
    lastUpdatedStamp: 1755670000000,
    ...overrides,
  };
}

function mountView() {
  return mount(ShopifyFulfillmentSync, {
    props: { id: "100002" },
    global: {
      stubs: {
        // The real component animates its value over 500ms of requestAnimationFrame, which a
        // synchronous assertion would catch mid-flight at 0.
        AnimatedNumber: {
          props: ["value"],
          template: "<span>{{ value }}</span>",
        },
      },
    },
  });
}

async function openSegment(wrapper: any, value: string) {
  wrapper.findComponent(IonSegment).vm.$emit("update:modelValue", value);
  await flushPromises();
}

describe("ShopifyFulfillmentSync - live cached data", () => {
  beforeEach(() => {
  healthRow.value = { state: "ready", shippedCount: 12, syncedCount: 4, unsyncedErrorCount: 4, pendingCount: 4, syncedLastHourCount: 1 };
  jobRows.value = [];
    visibleCards.length = 0;
    vi.stubGlobal("IntersectionObserver", class {
      entry: { element?: Element; show: () => void };
      constructor(callback: any) {
        this.entry = { show: () => callback([{ isIntersecting: true }]) };
        visibleCards.push(this.entry);
      }
      observe(element: Element) { this.entry.element = element; }
      disconnect() {}
    });
    shipmentContexts.clear();
    pendingRows.value = [];
    pendingStatus.value = { state: "ready" };
    queuedRows.value = [];
    queuedHydrated.value = true;
    syncedRows.value = [];
    syncedHydrated.value = true;
    endpointMissing.value = false;
    cachedErrors.value = [];
    resolvedProducts.value = new Map();
    cachedFacilities.value = [];
    harness.alertRole = "confirm";
    harness.showToast.mockReset();
    harness.ensureSystemMessageErrors.mockReset().mockResolvedValue([]);
    harness.resendSystemMessage.mockReset().mockResolvedValue({});
    harness.resetSystemMessageError.mockReset().mockResolvedValue({});
    harness.forceSystemMessageStatus.mockReset().mockResolvedValue({});
    harness.getFulfillmentDetails.mockReset().mockResolvedValue({ unavailable: true });
    harness.downloadTextFile.mockReset();
    harness.afterMutation.mockReset();
    harness.resolveProductNames.mockReset();
  });

  it.each(["pending", "queued", "synced"])("shows order names, both dates and rich items in %s", async (segment) => {
    shipmentContexts.set("SHIP-RICH", {
      orderId: "INTERNAL-ORDER", orderName: "#SHOP-123", orderDate: 1755600000000,
      shippedDate: 1755660000000, facilityName: "Brooklyn",
      items: [{ orderItemSeqId: "01", productId: "RICH-PRODUCT", quantity: 1, orderedQuantity: 2 }],
    });
    resolvedProducts.value.set("RICH-PRODUCT", {
      parentProductName: "Chaz Hoodie", productName: "XS / Gray", sku: "MH01-XS-Gray",
      mainImageUrl: "https://example.com/product.jpg", productFeatures: ["SIZE/XS", "COLOR/Gray"],
    });
    if(segment === "pending") pendingRows.value = [{ pendingKey: "shop:SHIP-RICH", shipmentId: "SHIP-RICH", orderId: "INTERNAL-ORDER" }];
    if(segment === "queued") queuedRows.value = [queuedMessage({ parsed: { ...queuedMessage().parsed, shipmentId: "SHIP-RICH" } })];
    if(segment === "synced") syncedRows.value = [syncedRow({ shipmentId: "SHIP-RICH" })];
    const wrapper = mountView();
    await openSegment(wrapper, segment);
    const card = wrapper.findComponent(FulfillmentShipmentCard);
    expect(card.find("h2").text()).toBe("#SHOP-123");
    expect(card.text()).toContain("Order placed");
    expect(card.text()).toContain("Shipment shipped");
    const dateIcons = card.find(".shipment-facts").findAllComponents(IonIcon).slice(0, 2).map((icon) => icon.props("icon"));
    expect(dateIcons).toEqual([cartOutline, sendOutline]);
    expect(card.text()).toContain("Chaz Hoodie");
    expect(card.text()).toContain("MH01-XS-Gray");
    expect(card.text()).toContain("XS / Gray");
    expect(card.text()).toContain("Ordered quantity: 2");
    expect(card.text()).toContain("Shipped quantity: 1");
    expect(card.props("row").items?.[0].imageUrl).toBe("https://example.com/product.jpg");
  });

  it("renders every item without a display cap", async () => {
    const items = Array.from({ length: 75 }, (_, index) => ({
      orderItemSeqId: String(index), primary: `Product ${index}`, secondary: `SKU-${index}`, imageUrl: "",
    }));
    const wrapper = mount(FulfillmentShipmentCard, { props: { row: { shipmentId: "SHIP", orderName: "#ORDER", facts: [], items } } });
    expect(wrapper.findAll(".item-strip ion-item")).toHaveLength(75);
    expect(wrapper.text()).toContain("Product 74");
  });

  it("separates Shopify details even before the lazy request finishes", async () => {
    syncedRows.value = [syncedRow()];
    const wrapper = mountView();
    await openSegment(wrapper, "synced");
    const card = wrapper.findComponent(FulfillmentShipmentCard);
    expect(card.find("ion-item-divider").text()).toContain("Shopify");
    expect(harness.getFulfillmentDetails).not.toHaveBeenCalled();
  });

  it("downloads a freshly fetched Shopify snapshot and displays its timeline", async () => {
    syncedRows.value = [syncedRow()];
    const snapshot = { id: "gid://shopify/Fulfillment/123", status: "SUCCESS" };
    harness.getFulfillmentDetails.mockResolvedValue({
      rawFulfillment: snapshot, fetchedAt: "2026-09-07T12:00:00Z", createdAt: "2026-09-07T09:00:00Z",
      events: [{ happenedAt: "2026-09-07T11:00:00Z", status: "DELIVERED", message: "Delivered event" },
        { happenedAt: "2026-09-07T10:00:00Z", status: "IN_TRANSIT", message: "Transit event" }],
      trackingInfo: [], lineItems: [], fulfillmentOrders: [],
    });
    const wrapper = mountView();
    await openSegment(wrapper, "synced");
    await wrapper.findAll("ion-button").find(button => button.text() === "Download current JSON")!.trigger("click");
    await flushPromises();
    expect(harness.getFulfillmentDetails).toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true }));
    expect(JSON.parse(harness.downloadTextFile.mock.calls[0][0])).toEqual(expect.objectContaining({ fulfillment: snapshot }));
    const text = wrapper.text();
    expect(text).toContain("Delivery events");
    expect(wrapper.findAllComponents(IonAccordion).some(accordion => accordion.props("value") === "deliveryEvents")).toBe(true);
    expect(text.indexOf("Transit event")).toBeLessThan(text.indexOf("Delivered event"));
  });

  it("shows a real pending shipment and excludes an active queued shipment", async () => {
    pendingRows.value = [
      { shipmentId: "PENDING1", orderName: "Sandbox Pending", facilityName: "Brooklyn", statusDate: Date.now() },
      { shipmentId: "QUEUED1", orderName: "Sandbox Queued", statusDate: Date.now() },
    ];
    queuedRows.value = [{ ...queuedMessage(), parsed: { ...queuedMessage().parsed, shipmentId: "QUEUED1" } }];
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("Sandbox Pending");
    expect(wrapper.text()).toContain("Awaiting sync");
    expect(wrapper.text()).not.toContain("Sandbox Queued");
    expect(wrapper.findAllComponents(FulfillmentShipmentCard)).toHaveLength(1);
  });

  it("distinguishes pending load failure from an empty result", async () => {
    pendingStatus.value = { state: "error" };
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("Pending shipments could not be loaded.");
    expect(wrapper.text()).not.toContain("No pending shipments in this window.");
  });

  it("distinguishes a missing history endpoint from an empty history", async () => {
    endpointMissing.value = true;
    const missingWrapper = mountView();
    await openSegment(missingWrapper, "synced");

    expect(missingWrapper.text()).toContain("sob/shopify/fulfillmentHistories");
    expect(missingWrapper.text()).not.toContain("Nothing has synced yet.");
    expect(missingWrapper.findAllComponents(FulfillmentShipmentCard).length).toBe(0);

    endpointMissing.value = false;
    syncedRows.value = [
      syncedRow(),
      syncedRow({ fulfillmentKey: "100002:4471302915", fulfillmentId: "4471302915", omsOrderId: "RAI-100491", shipmentId: "SHP-88815" }),
    ];
    cachedFacilities.value = [{ facilityId: "STORE_118", facilityName: "Store 118 Newbury St" }];
    const wrapper = mountView();
    await openSegment(wrapper, "synced");

    const cards = wrapper.findAllComponents(FulfillmentShipmentCard);
    expect(cards.length).toBe(2);
    expect(cards[0].text()).toContain("SHP-88801");
    expect(cards[0].text()).toContain("RAI-100488");
    // The cached facility register supplies the name; the raw id would only appear on a miss.
    expect(cards[0].text()).toContain("Store 118 Newbury St");
    expect(cards[1].text()).toContain("SHP-88815");
    // Enrichment is expand-time only: nothing was opened, so Shopify was never asked.
    expect(harness.getFulfillmentDetails).not.toHaveBeenCalled();
  });

  it("fetches visible Shopify cards without an accordion click and deduplicates expansion", async () => {
    syncedRows.value = [syncedRow()];
    harness.getFulfillmentDetails.mockResolvedValue({
      name: "#100488.1",
      status: "SUCCESS",
      displayStatus: "DELIVERED",
      totalQuantity: 1,
      locationName: "HotWax Routing Retail",
      inTransitAt: "",
      estimatedDeliveryAt: "",
      deliveredAt: "",
      trackingInfo: [{ company: "UPS", number: "1Z999AA10123456784" }],
      lineItems: [{ quantity: 1, name: "Harbor Jacket", sku: "HBR-JK-NVY-L" }],
      events: [],
      fulfillmentOrders: [],
    });
    const wrapper = mountView();
    await openSegment(wrapper, "synced");

    const card = wrapper.findComponent(FulfillmentShipmentCard);
    expect(card.find("ion-badge").exists()).toBe(false);

    expect(harness.getFulfillmentDetails).not.toHaveBeenCalled();
    visibleCards.find((entry) => entry.element === card.element)!.show();
    await flushPromises();
    expect(card.find("ion-badge").text()).toBe("DELIVERED");
    card.findComponent(IonAccordionGroup).vm.$emit("ionChange", { detail: { value: "events" } });
    await flushPromises();
    expect(harness.getFulfillmentDetails).toHaveBeenCalledTimes(1);
    expect(harness.getFulfillmentDetails).toHaveBeenCalledWith({
      shopId: "100002",
      fulfillmentId: "4471301884",
    });
    expect(card.find("ion-badge").text()).toBe("DELIVERED");
    expect(card.text()).toContain("HotWax Routing Retail");
  });

  it("renders a card per queued message with its literal statusId and counts SmsgError", async () => {
    queuedRows.value = [
      queuedMessage(),
      queuedMessage({
        systemMessageId: "10002",
        statusId: "SmsgProduced",
        failCount: 3,
        orderId: "RAI-100480",
        // The live connector names its item list `lineItems`; the layer's parser accepts the
        // alias (tests/utils/shopifyFulfillment.spec.ts), so the row arrives with items parsed.
        messageText: JSON.stringify({
          shipmentId: "SHP-88604",
          orderId: "RAI-100480",
          lineItems: [{ orderItemSeqId: "01", productId: "P2", quantity: 2, shopifyLineItemId: "L2" }],
        }),
        parsed: {
          shipmentId: "SHP-88604",
          orderId: "RAI-100480",
          shopifyOrderId: "5100200400",
          trackingNumber: "",
          items: [{ orderItemSeqId: "01", productId: "P2", quantity: 2, shopifyLineItemId: "L2" }],
        },
      }),
    ];
    resolvedProducts.value = new Map([[
      "P1",
      {
        productId: "P1",
        productName: "M",
        parentProductName: "Matador Hoodie",
        sku: "MTD-HD-BLK-M",
        internalName: "",
        mainImageUrl: "",
      },
    ]]);
    const wrapper = mountView();
    await openSegment(wrapper, "queued");

    const cards = wrapper.findAllComponents(FulfillmentShipmentCard);
    expect(cards.length).toBe(2);
    expect(cards[0].find("ion-badge").text()).toBe("Retries stopped");
    expect(cards[1].find("ion-badge").text()).toBe("Failed • awaiting retry");
    // The item strip resolves through Solr: parent name and SKU for P1, the bare id for
    // unresolved P2.
    expect(cards[0].text()).toContain("Matador Hoodie");
    expect(cards[0].text()).toContain("MTD-HD-BLK-M");
    expect(cards[1].text()).toContain("P2");

    const stats = wrapper.find('[aria-label="Fulfillment sync health"]');
    expect(stats.text()).toContain('Unsynced with errors4');
    expect(wrapper.findAll('[aria-label="Fulfillment sync jobs"]')).toHaveLength(1);
  });

  it('shows general sender and sweep jobs, excluding the product-specific sender', async () => {
    jobRows.value = [
      { jobName: 'general_sender', serviceName: 'org.moqui.impl.SystemMessageServices.send#AllProducedSystemMessages' },
      { jobName: 'product_sender', serviceName: 'org.moqui.impl.SystemMessageServices.send#AllProducedSystemMessages', serviceJobParameters: [{ parameterName: 'systemMessageTypeIds', parameterValue: 'BulkProductAndVariantsByIdQuery' }] },
      { jobName: 'missed_sweep', serviceName: 'co.hotwax.sob.fulfillment.FulfillmentSweepServices.sweep#MissedShopifyFulfillments' }
    ];
    const wrapper = mountView(); await flushPromises();
    const jobs = wrapper.find('[aria-label="Fulfillment sync jobs"]').text();
    expect(jobs).toContain('general_sender');
    expect(jobs).toContain('missed_sweep');
    expect(jobs).not.toContain('product_sender');
  });

  it('opens the shared configuration modal for the selected job', async () => {
    jobRows.value = [{ jobName: 'retry_job', serviceName: 'org.moqui.impl.SystemMessageServices.send#AllProducedSystemMessages', paused: 'Y' }];
    const wrapper = mountView(); await flushPromises();
    const row = wrapper.find('[aria-label="Fulfillment sync jobs"]').findAll('ion-item').find(row => row.text().includes('retry_job'))!;
    await row.trigger('click'); await flushPromises();
    const modal = wrapper.findComponent(ServiceJobDetailsModal);
    expect(modal.props('isOpen')).toBe(true);
    expect(modal.props('jobName')).toBe('retry_job');
    expect(modal.props('protectedParameterNames')).toContain('shopId');
    modal.vm.$emit('close'); await flushPromises();
    expect(modal.props('isOpen')).toBe(false);
    const values = wrapper.find('[aria-label="Fulfillment sync health"]').findAll('ion-label[slot="end"]');
    expect(values).toHaveLength(5);
  });

  it('shows complete backend shipment counts on every tab regardless of the message sample', async () => {
    healthRow.value = { state: 'ready', shippedCount: 1200, syncedCount: 1000, unsyncedErrorCount: 150, pendingCount: 50, syncedLastHourCount: 85 };
    const wrapper = mountView(); await flushPromises();
    for (const segment of ['pending', 'queued', 'synced']) {
      await openSegment(wrapper, segment);
      expect(wrapper.findAll('[aria-label="Fulfillment sync jobs"]')).toHaveLength(1);
      const text = wrapper.find('[aria-label="Fulfillment sync health"]').text();
      expect(text).toContain('Shipments shipped1200');
      expect(text).toContain('Synced to Shopify1000');
      expect(text).toContain('Unsynced with errors150');
      expect(text).toContain('85');
      expect(text).not.toContain('latest 50');
    }
  });
  it('does not show zero health counts when the backend health read fails', async () => {
    healthRow.value = { state: 'error', shippedCount: 0 };
    const wrapper = mountView(); await flushPromises();
    const card = wrapper.find('[aria-label="Fulfillment sync health"]');
    expect(card.text()).toContain('Sync health could not be loaded');
    expect(card.findAll('ion-label[slot="end"]')).toHaveLength(0);
  });

  it("shows guidance without opening an accordion and filters by retry state", async () => {
    queuedRows.value = [queuedMessage({ systemMessageId: "held", statusId: "SmsgProduced", failCount: 1 }), queuedMessage({ systemMessageId: "stopped" })];
    cachedErrors.value = [{ systemMessageId: "held", errorDate: 100, errorText: "No fulfillable quantity left: ON_HOLD" }];
    const wrapper = mountView();
    await openSegment(wrapper, "queued");
    expect(wrapper.text()).toContain("On hold");
    expect(wrapper.findAll('[aria-label="Fulfillment sync jobs"]')).toHaveLength(1);
    for (const diagnosis of wrapper.findAllComponents(FulfillmentDiagnosis)) {
      expect(diagnosis.text()).not.toContain('Automatic retries are paused');
    }
    expect(wrapper.findAll('[aria-label="Next step"]')).toHaveLength(0);
    expect(harness.ensureSystemMessageErrors).toHaveBeenCalledWith("held");
    wrapper.findAllComponents(IonSegment)[1].vm.$emit("update:modelValue", "stopped");
    await flushPromises();
    expect(wrapper.findAllComponents(FulfillmentShipmentCard)).toHaveLength(1);
    expect(wrapper.findComponent(FulfillmentShipmentCard).text()).toContain("Retries stopped");
  });

  it.each(['pending', 'queued', 'synced'] as const)('uses shipment-scoped quantities in %s rows', async (mode) => {
    vi.mocked(api).mockResolvedValueOnce({ data: { checkedAt: '2026-09-08T02:00:00Z', lines: [
      { lineItemId: 'one', name: 'Hoodie', code: mode === 'synced' ? 'MATCHED' : 'LOCATION_REVIEW', shippedQty: 3, requestedQty: 3, linkedQty: mode === 'synced' ? 3 : 0, availableAtShipmentLocationQty: 1, quantities: { fulfilledQty: 9 }, allocations: [], workAllocations: [], action: 'Review location.' },
      { lineItemId: 'two', name: 'Cap', code: mode === 'synced' ? 'MATCHED' : 'READY', shippedQty: 1, requestedQty: 1, linkedQty: mode === 'synced' ? 1 : 0, availableAtShipmentLocationQty: 1, quantities: {}, allocations: [], workAllocations: [], action: '' }
    ] } } as any);
    const wrapper = mount(FulfillmentDiagnosis, { props: { shopId: '10000', shipmentId: 'sample', mode } });
    await flushPromises(); await flushPromises();
    const cells = wrapper.findAll('[aria-label="Shopify comparison"]');
    expect(cells[0].text()).toContain('Shopify fulfillable1');
    expect(cells[0].text()).toContain(mode === 'synced' ? 'Shopify linked: 3' : 'Short by 2');
    expect(cells[0].text()).not.toContain('9');
    expect(wrapper.findAll('[aria-label="Next step"]')).toHaveLength(0);
  });

  it('shows fulfillment time and app attribution without calling partial fulfillment complete', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { lines: [{ lineItemId: 'one', name: 'Hoodie', code: 'EXISTING', availableAtShipmentLocationQty: 3, quantities: { unfulfilledQty: 3 }, allocations: [{ fulfillmentId: 'f', status: 'SUCCESS', quantity: 2, createdAt: new Date(Date.now() - 7200000).toISOString(), actor: { name: 'Warehouse app', type: 'app' } }], workAllocations: [], action: '' }] } } as any);
    const wrapper = mount(FulfillmentDiagnosis, { props: { shopId: '10000', shipmentId: 'sample', mode: 'pending' } });
    await flushPromises(); await flushPromises();
    const cell = wrapper.find('[aria-label="Shopify comparison"]').text();
    expect(cell).toContain('Partially fulfilled in Shopify');
    expect(cell).toContain('Shopify fulfillable3');
    expect(cell).toContain('2 fulfilled: 2 hours ago');
    expect(cell).toContain('By Warehouse app (app)');
  });

  it.each([true, false])('distinguishes verified order cancellation from non-fulfillable quantity (%s)', async (canceled) => {
    vi.mocked(api).mockResolvedValueOnce({ data: { lines: [{ lineItemId: 'one', name: 'Hoodie', code: 'RECONCILE', cancelledAt: canceled ? new Date(Date.now() - 3600000).toISOString() : null, quantities: {}, allocations: [], workAllocations: [], action: '' }] } } as any);
    const wrapper = mount(FulfillmentDiagnosis, { props: { shopId: '10000', shipmentId: 'sample', mode: 'queued' } });
    await flushPromises(); await flushPromises();
    const cell = wrapper.find('[aria-label="Shopify comparison"]').text();
    expect(cell).toContain(canceled ? 'Order canceled in Shopify' : 'Quantity no longer fulfillable');
    expect(cell).toContain(canceled ? '1 hour ago' : 'Time unavailable');
    expect(cell).toContain('Who: unavailable');
  });


  it.each([false, true])('dismisses only selected holds and preserves Shopify errors (%s)', async (failed) => {
    const holds = [{ id: 'gid://shopify/FulfillmentHold/1', reason: 'INVENTORY_OUT_OF_STOCK', reasonNotes: 'Verify stock' }, { id: 'gid://shopify/FulfillmentHold/2', reason: 'INCORRECT_ADDRESS' }];
    const data = (remaining: any[]) => ({ lines: [{ lineItemId: 'held-line', name: 'Hoodie', code: 'HOLD', availableAtShipmentLocationQty: 0, workAllocations: [{ fulfillmentOrderId: '123', status: 'ON_HOLD', locationName: 'Brooklyn', holds: remaining }] }] });
    vi.mocked(api).mockClear().mockResolvedValueOnce({ data: data(holds) } as any)
      .mockResolvedValueOnce({ data: failed ? { errors: 'Shopify permission denied' } : { released: true } } as any)
      .mockResolvedValueOnce({ data: data(failed ? holds : [holds[1]]) } as any);
    const wrapper = mount(FulfillmentDiagnosis, { props: { shopId: '10000', shipmentId: 'sample' }, global: { stubs: { IonModal: { template: '<div><slot /></div>' } } } });
    await flushPromises(); await flushPromises();
    await wrapper.findAll('ion-button').find(button => button.text().startsWith('On hold'))!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Inventory out of stock');
    expect(wrapper.text()).toContain('Verify stock');
    wrapper.findAllComponents(IonCheckbox)[0].vm.$emit('ionChange', { detail: { checked: true } });
    await flushPromises();
    await wrapper.findAll('ion-button').find(button => button.text().startsWith('Dismiss selected holds'))!.trigger('click');
    await flushPromises(); await flushPromises();
    const writes = vi.mocked(api).mock.calls.map(call => call[0]).filter((request: any) => request.method === 'post');
    expect(writes).toEqual([{ url: 'sob/shopify/fulfillmentHold', method: 'post', data: { shopId: '10000', shipmentId: 'sample', fulfillmentOrderId: '123', holdId: holds[0].id } }]);
    expect(wrapper.findAllComponents(IonCheckbox)).toHaveLength(2);
    if (!failed) {
      expect(wrapper.text()).toContain('Dismissed');
      expect(wrapper.findAllComponents(IonCheckbox)[1].props('disabled')).toBe(true);
    }
    expect(wrapper.text()).toContain(failed ? 'Shopify permission denied' : '1 hold dismissed');
    expect(wrapper.text()).toContain('Incorrect address');
  });
  it('allows a manually confirmed pending send without a diagnosis gate', async () => {
    vi.mocked(api).mockClear().mockResolvedValueOnce({ data: { remoteMessageId: 'fulfillment' } } as any);
    await expect(sendPendingFulfillment('10000', 'shipment')).resolves.toMatchObject({ remoteMessageId: 'fulfillment' });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith({ url: 'sob/shopifyFulfillment', method: 'post', data: { shipmentId: 'shipment' } });
  });
  it('offers Send now for an unattempted queued message', async () => {
    queuedRows.value = [queuedMessage({ statusId: 'SmsgProduced', failCount: 0 })];
    const wrapper = mountView(); await openSegment(wrapper, 'queued');
    expect(wrapper.findAll('ion-button').filter(button => button.text() === 'Send now')).toHaveLength(1);
  });

  it("aligns a problematic line with both systems and its next step", async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { shopDomain: 'hc-sandbox.myshopify.com', shopifyOrderId: '7654361366692', checkedAt: "2026-09-08T02:00:00Z", retry: { explanation: "Retries paused", jobs: [{ enabled: false }] }, canRetry: false, lines: [{ lineItemId: "line", name: "Hoodie", sku: "SKU", code: "EXISTING", shippedQty: 1, requestedQty: 1, omsCancelledQty: 0, title: "Shopify already records these units as fulfilled", action: "Confirm whether this is the same dispatch.", quantities: { originalQty: 2, currentQty: 2, fulfilledQty: 2, unfulfilledQty: 0, nonFulfillableQty: 0 }, allocations: [{ fulfillmentId: "a", quantity: 1, locationName: "Brooklyn", linkage: "Not linked to this OMS shipment" }, { fulfillmentId: "b", quantity: 1, locationName: "Times Square", linkage: "Not linked to this OMS shipment" }], workAllocations: [] }] } } as any);
    queuedRows.value = [queuedMessage()];
    const wrapper = mountView();
    await openSegment(wrapper, "queued");
    const card = wrapper.findComponent(FulfillmentShipmentCard);
    expect(card.find('[aria-label="OMS shipped"]').text()).toContain("1");
    expect(card.find('[aria-label="Shopify comparison"]').text()).toContain("Already fulfilled in Shopify");
    expect(card.find('[aria-label="Next step"]').exists()).toBe(false);
    expect(card.text()).toContain("1 item needs review");
    expect(card.findComponent(FulfillmentDiagnosis).findAll("ion-accordion")).toHaveLength(0);
    expect(card.findAll('[aria-label="Shopify order action"]')).toHaveLength(1);
    expect(card.find("ion-item-divider").text()).toContain("Shopify reconciled at");
  });

  it("offers manual send even when reconciliation cannot be fetched", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("Unavailable"));
    queuedRows.value = [queuedMessage()];
    const wrapper = mountView();
    await openSegment(wrapper, "queued");
    expect(wrapper.text()).toContain("Current state could not be verified");
    expect(wrapper.findAll("ion-button").some(button => /Send now/.test(button.text()))).toBe(true);
  });

  it("shows paused retries from the real diagnosis contract", async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { checkedAt: "2026-09-08T02:00:00Z", retry: { explanation: "Retry jobs are paused", jobs: [{ enabled: false }] }, canRetry: false, lines: [] } } as any);
    queuedRows.value = [queuedMessage({ statusId: "SmsgProduced", failCount: 1 })];
    const wrapper = mountView();
    await openSegment(wrapper, "queued");
    expect(wrapper.findComponent(FulfillmentShipmentCard).text()).toContain("Retries paused");
    expect(wrapper.findAll("ion-button").some(button => /Send now/.test(button.text()))).toBe(true);
  });

  it("does not offer a reset or retry while sending", async () => {
    queuedRows.value = [queuedMessage({ statusId: "SmsgSending" })];
    const wrapper = mountView();
    await openSegment(wrapper, "queued");
    expect(wrapper.text()).toContain("A send may still be running");
    expect(wrapper.findAll("ion-button").some(button => /Send now/.test(button.text()))).toBe(false);
  });

  it("resets then resends an SmsgError message once the alert is confirmed", async () => {
    queuedRows.value = [queuedMessage()];
    const wrapper = mountView();
    await openSegment(wrapper, "queued");

    const retryButton = wrapper.findAll("ion-button").find((button) => /Send now/.test(button.text()));
    expect(retryButton).toBeDefined();

    await retryButton!.trigger("click");
    await flushPromises();

    expect(harness.resetSystemMessageError).toHaveBeenCalledWith("10001");
    expect(harness.resendSystemMessage).toHaveBeenCalledWith("10001");
    // Reset must land before the resend: the sweep refuses to send a message still in SmsgError.
    expect(harness.resetSystemMessageError.mock.invocationCallOrder[0])
      .toBeLessThan(harness.resendSystemMessage.mock.invocationCallOrder[0]);
    expect(wrapper.find('[aria-label="Send result"]').exists()).toBe(true);
  });

  it.each([true, false])('retains the actual send outcome until navigation (success=%s)', async (success) => {
    queuedRows.value = [queuedMessage()];
    const wrapper = mountView(); await openSegment(wrapper, 'queued');
    vi.mocked(api).mockResolvedValueOnce({ data: { outcome: { systemMessageId: '10001', statusId: success ? 'SmsgSent' : 'SmsgProduced', fulfillmentId: success ? 'f1' : null, errorText: success ? null : 'Shopify refused: fulfillment order is CLOSED.' } } } as any);
    await wrapper.findAll('ion-button').find(b => b.text() === 'Send now')!.trigger('click');
    await flushPromises(); await flushPromises();
    queuedRows.value = []; await flushPromises();
    expect(wrapper.find('[aria-label="Send result"]').text()).toContain(success ? 'Synced to Shopify' : 'Shopify refused: fulfillment order is CLOSED.');
    expect(wrapper.findAllComponents(FulfillmentShipmentCard)).toHaveLength(1);
    await openSegment(wrapper, 'pending'); await openSegment(wrapper, 'queued');
    expect(wrapper.find('[aria-label="Send result"]').exists()).toBe(false);
  });

  it("does nothing when the confirm alert is cancelled", async () => {
    queuedRows.value = [queuedMessage()];
    harness.alertRole = "cancel";
    const wrapper = mountView();
    await openSegment(wrapper, "queued");

    const retryButton = wrapper.findAll("ion-button").find((button) => /Send now/.test(button.text()));
    await retryButton!.trigger("click");
    await flushPromises();

    expect(harness.resetSystemMessageError).not.toHaveBeenCalled();
    expect(harness.resendSystemMessage).not.toHaveBeenCalled();
    expect(harness.showToast).not.toHaveBeenCalled();
  });
}, 20000);
