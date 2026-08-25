// @vitest-environment jsdom
import { IonAccordionGroup, IonSegment } from "@ionic/vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import FulfillmentShipmentCard from "@/components/shopify-fulfillment/FulfillmentShipmentCard.vue";
import ShopifyFulfillmentSync from "@/views/ShopifyFulfillmentSync.vue";

const queuedRows = ref<any[]>([]);
const queuedHydrated = ref(true);
const syncedRows = ref<any[]>([]);
const syncedHydrated = ref(true);
const endpointMissing = ref(false);
const cachedErrors = ref<any[]>([]);
const resolvedProducts = ref(new Map<string, any>());
const cachedFacilities = ref<any[]>([]);

const harness = vi.hoisted(() => ({
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

vi.mock("@common", () => ({
  commonUtil: {
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
  useOmsShipmentContext: () => ({
    getShipmentContext: (query: { shipmentId?: string; orderId?: string }) =>
      Promise.resolve(shipmentContexts.get(query?.shipmentId ?? "")),
  }),
  useQueuedFulfillments: () => ({ rows: queuedRows, hydrated: queuedHydrated }),
  useSyncedFulfillments: () => ({ rows: syncedRows, hydrated: syncedHydrated, endpointMissing }),
  useShopifyFulfillmentDetails: () => ({
    getFulfillmentDetails: (...args: any[]) => harness.getFulfillmentDetails(...args),
  }),
}));

vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
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
    harness.afterMutation.mockReset();
    harness.resolveProductNames.mockReset();
  });

  it("tells the operator that no pending API exists rather than faking rows", async () => {
    const wrapper = mountView();
    await flushPromises();

    // The default segment is pending, and its whole content is the one explanatory card.
    expect(wrapper.text()).toContain("Pending is not readable yet");
    expect(wrapper.text()).toContain("shipped shipments that never reached Shopify");
    expect(wrapper.text()).toContain("Shipment.externalId");
    expect(wrapper.findAllComponents(FulfillmentShipmentCard).length).toBe(0);
    expect(wrapper.find("ion-spinner").exists()).toBe(false);
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

  it("fetches Shopify's record on first expand and badges the card from it", async () => {
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

    card.findComponent(IonAccordionGroup).vm.$emit("ionChange", { detail: { value: "events" } });
    await flushPromises();

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
    expect(cards[0].find("ion-badge").text()).toBe("SmsgError");
    expect(cards[1].find("ion-badge").text()).toBe("SmsgProduced");
    // The item strip resolves through Solr: parent name and SKU for P1, the bare id for
    // unresolved P2.
    expect(cards[0].text()).toContain("Matador Hoodie");
    expect(cards[0].text()).toContain("MTD-HD-BLK-M");
    expect(cards[1].text()).toContain("P2");

    const kpiTiles = wrapper.find(".kpi-grid").findAll("ion-card");
    expect(kpiTiles.length).toBe(4);
    const errorTile = kpiTiles.find((tile) => tile.text().includes("SmsgError"));
    expect(errorTile?.text()).toContain("1");
    // No invented pending numbers: both no-backend tiles carry the em dash.
    expect(kpiTiles[0].text()).toContain("—");
    expect(kpiTiles[1].text()).toContain("—");
  });

  it("resets then resends an SmsgError message once the alert is confirmed", async () => {
    queuedRows.value = [queuedMessage()];
    const wrapper = mountView();
    await openSegment(wrapper, "queued");

    const retryButton = wrapper.findAll("ion-button").find((button) => button.text().includes("Retry"));
    expect(retryButton).toBeDefined();

    await retryButton!.trigger("click");
    await flushPromises();

    expect(harness.resetSystemMessageError).toHaveBeenCalledWith("10001");
    expect(harness.resendSystemMessage).toHaveBeenCalledWith("10001");
    // Reset must land before the resend: the sweep refuses to send a message still in SmsgError.
    expect(harness.resetSystemMessageError.mock.invocationCallOrder[0])
      .toBeLessThan(harness.resendSystemMessage.mock.invocationCallOrder[0]);
    expect(harness.showToast).toHaveBeenCalledWith("Fulfillment queued for another delivery attempt.");
    expect(harness.afterMutation).toHaveBeenCalledWith("systemMessage", { systemMessageId: "10001" });
  });

  it("does nothing when the confirm alert is cancelled", async () => {
    queuedRows.value = [queuedMessage()];
    harness.alertRole = "cancel";
    const wrapper = mountView();
    await openSegment(wrapper, "queued");

    const retryButton = wrapper.findAll("ion-button").find((button) => button.text().includes("Retry"));
    await retryButton!.trigger("click");
    await flushPromises();

    expect(harness.resetSystemMessageError).not.toHaveBeenCalled();
    expect(harness.resendSystemMessage).not.toHaveBeenCalled();
    expect(harness.showToast).not.toHaveBeenCalled();
  });
}, 20000);
