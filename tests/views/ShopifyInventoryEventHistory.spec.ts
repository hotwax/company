// @vitest-environment jsdom
import { type VueWrapper, flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

/**
 * The one history page both inventory ledgers render through. These run the REAL `useInventoryEvents`
 * over cache-shaped rows, so the mapping from either ledger to the shared row is what is under test —
 * not a stub of it.
 */

const channelDetails = ref<any[]>([]);
const locationDetails = ref<any[]>([]);
const messages = ref<any[]>([]);
const shopLocations = ref<any[]>([]);
const facilities = ref<any[]>([]);
const channels = ref<any[]>([]);
const inventoryItems = ref<any[]>([]);
const ledgerHydrated = ref(true);
const areaReady = ref(true);
const areaError = ref("");
const areaFailures = ref<Record<string, string>>({});
const routeQuery = ref<Record<string, string>>({});

const harness = vi.hoisted(() => ({ replace: vi.fn(), resolveSources: vi.fn(), syncNow: vi.fn() }));

vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: harness.replace, push: vi.fn() }),
  useRoute: () => ({ params: { id: "100002" }, get query() { return routeQuery.value; } }),
}));

vi.mock("@common", () => ({
  DxpShopifyImg: { props: ["src", "size"], template: "<img :src=\"src\" />" },
  commonUtil: { showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

vi.mock("@/services/inventorySyncArea", () => ({
  useInventorySyncArea: () => ({
    ready: areaReady, error: areaError, failingDomains: areaFailures, busy: ref(false), manualRefreshing: ref(false),
    syncNow: harness.syncNow, afterMutation: vi.fn(),
  }),
}));

function asCachedRows(records: { value: any[] }, keyField?: string, keyOf?: (raw: any) => string) {
  return computed(() => records.value.map((raw: any) => ({
    ...raw,
    ...(keyField && keyOf ? { [keyField]: keyOf(raw) } : {}),
    raw,
    cachedAt: raw.cachedAt ?? 0,
  })));
}

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (cache: any) => {
    const table = String(cache?.table ?? "");
    const list = (records: { value: any[] }, hydrated = ref(true), keyField?: string, keyOf?: (raw: any) => string) =>
      ({ records, rows: asCachedRows(records, keyField, keyOf), hydrated });
    if(table === "shopifyInventoryAdjustmentDetails") {
      return list(
        channelDetails, ledgerHydrated, "adjustmentKey",
        (raw) => [raw.eventTypeId, raw.eventReferenceId, raw.inventoryChannelId, raw.shopifyInventoryItemId].join("|")
      );
    }
    if(table === "shopifyLocationInventoryAdjustmentDetails") {
      return list(
        locationDetails, ledgerHydrated, "locationAdjustmentKey",
        (raw) => [raw.eventTypeId, raw.eventReferenceId, raw.shopId, raw.shopifyLocationId, raw.shopifyInventoryItemId].join("|")
      );
    }
    if(table === "systemMessages") {return list(messages);}
    if(table === "shopifyLocations") {return list(shopLocations);}
    if(table === "facilities") {return list(facilities);}
    if(table === "inventoryChannels") {return list(channels);}
    if(table === "shopifyInventoryItems") {
      return list(inventoryItems, ref(true), "itemKey", (raw) => `${raw.shopId}|${raw.shopifyInventoryItemId}`);
    }

    return list(ref([]));
  },
}));

vi.mock("@/composables/useSeed", () => ({
  useStatuses: () => ({ labelFor: (statusId: string) => (statusId ? `Status ${statusId}` : "") }),
}));

vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    ensureSystemMessageById: vi.fn().mockResolvedValue(null),
    ensureSystemMessageErrors: vi.fn().mockResolvedValue([]),
    resendSystemMessage: vi.fn(),
  }),
}));

vi.mock("@/composables/useShopify", () => ({
  useInventoryEventSources: () => ({
    sources: ref(new Map()),
    resolve: harness.resolveSources,
    sourceKeyOf: (eventTypeId: string, eventReferenceId: string) => `${eventTypeId}|${eventReferenceId}`,
  }),
  useShopifySyncContext: () => ({ remoteId: ref("REMOTE_100002"), shopId: ref("100002") }),
}));

vi.mock("@/composables/useVirtualRows", () => ({
  useVirtualRows: (items: any) => ({
    containerRef: ref(null), visibleItems: items, topSpacer: ref(0), bottomSpacer: ref(0),
    onScroll: vi.fn(), scrollToTop: vi.fn(),
  }),
}));

const MINUTE = 60_000;

const channelRow = (over: Record<string, any> = {}) => ({
  eventTypeId: "SIE_RECEIPT", eventReferenceId: "R1", eventTypeDescription: "Inbound shipment receipt",
  inventoryChannelId: "IC_1001", shopId: "100002", shopifyLocationId: "LOC_AGG", shopifyInventoryItemId: "ITEM_1",
  computedInventoryChange: 1, createdDate: 1_000_000, ...over,
});

const locationRow = (over: Record<string, any> = {}) => ({
  eventTypeId: "POS_ISSUANCE", eventReferenceId: "201843", eventTypeDescription: "POS sale issuance",
  shopId: "100002", shopifyLocationId: "LOC_STORE", shopifyInventoryItemId: "ITEM_2",
  computedInventoryChange: -1, createdDate: 1_000_000, ...over,
});

async function mountHistory(kind: "channel" | "location") {
  const { default: View } = await import("@/views/ShopifyInventoryEventHistory.vue");
  const wrapper = mount(View, {
    props: { id: "100002", kind },
    global: {
      stubs: {
        IonBackButton: true,
        IonModal: { template: "<div><slot /></div>" },
        IonPopover: { template: "<div><slot /></div>" },
        IonDatetime: true,
        ShopifyInventorySnapshot: true,
      },
    },
  });
  await flushPromises();

  return wrapper;
}

const rows = (wrapper: VueWrapper) => wrapper.findAll("[data-virtual-row]");
const kpi = (wrapper: VueWrapper, subtitle: string) => wrapper.findAll(".kpi-card")
  .find((card) => card.find("ion-card-subtitle").text() === subtitle)
  ?.find("ion-card-title").text();

beforeEach(() => {
  channelDetails.value = [];
  locationDetails.value = [];
  messages.value = [];
  shopLocations.value = [];
  facilities.value = [];
  channels.value = [];
  inventoryItems.value = [];
  ledgerHydrated.value = true;
  areaReady.value = true;
  areaError.value = "";
  areaFailures.value = {};
  routeQuery.value = {};
  harness.replace.mockReset();
});

describe("ShopifyInventoryEventHistory - never claims empty over unreadable data", () => {
  it("says the history is empty when the ledger is readable and empty", async () => {
    const wrapper = await mountHistory("channel");

    expect(wrapper.text()).toContain("No inventory events match this view");
  });

  it("makes no empty claim before the ledger cache has hydrated", async () => {
    ledgerHydrated.value = false;
    const wrapper = await mountHistory("location");

    expect(wrapper.text()).not.toContain("No inventory events match this view");
    expect(wrapper.text()).toContain("This is not a confirmed empty history.");
  });

  it("reports sync failures in the toolbar, this ledger first, without moving the content", async () => {
    locationDetails.value = [locationRow()];
    areaFailures.value = {
      inventoryEventProduct: JSON.stringify({ errorCode: 502, errors: "Shopify request timed out" }),
      shopifyLocationInventoryAdjustmentDetail: "500 Internal Server Error",
    };
    const wrapper = await mountHistory("location");

    // Nothing is inserted above the list: the content starts with the figures either way.
    expect(wrapper.find("main.history-page").element.firstElementChild?.classList.contains("kpi-grid")).toBe(true);
    const text = wrapper.text();
    expect(text).toContain("500 Internal Server Error");
    // The readable part of a JSON error body, not the body itself.
    expect(text).toContain("Shopify request timed out");
    expect(text).not.toContain("errorCode");
    expect(text.indexOf("Shopify location inventory events")).toBeLessThan(text.indexOf("Shopify products for inventory events"));
  });

  it("says live updates are off, and still shows the rows, when the OMS sends no update cursor", async () => {
    locationDetails.value = [locationRow({ cachedAt: Date.parse("2026-09-26T07:00:00Z") })];
    const wrapper = await mountHistory("location");

    expect(rows(wrapper)).toHaveLength(1);
    expect(wrapper.text()).toContain("Live updates are off");
  });

  it("does not claim live updates are off when the rows carry the cursor", async () => {
    locationDetails.value = [locationRow({ detailLastUpdatedStamp: 1_000 })];
    const wrapper = await mountHistory("location");

    expect(wrapper.text()).not.toContain("Live updates are off");
    expect(wrapper.text()).toContain("kept current with every event and batch");
  });
});

describe("ShopifyInventoryEventHistory - one page, either ledger", () => {
  it.each([
    { kind: "channel" as const, fill: () => { channelDetails.value = [channelRow()]; }, title: "Channel inventory history" },
    { kind: "location" as const, fill: () => { locationDetails.value = [locationRow()]; }, title: "Location inventory history" },
  ])("renders the $kind ledger through the same row", async ({ kind, fill, title }) => {
    fill();
    const wrapper = await mountHistory(kind);

    expect(wrapper.find("ion-title").text()).toBe(title);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain("Waiting");
    expect(rows(wrapper)[0].text()).toContain("Not batched");
  });

  it("labels a physical location by the facilities mapped to it, from the cache", async () => {
    locationDetails.value = [locationRow()];
    shopLocations.value = [{ shopId: "100002", facilityId: "STORE_7", shopifyLocationId: "LOC_STORE" }];
    facilities.value = [{ facilityId: "STORE_7", facilityName: "Brooklyn Store" }];
    const wrapper = await mountHistory("location");

    expect(rows(wrapper)[0].text()).toContain("Brooklyn Store");
  });

  it("labels an aggregate location by its channel, never by the _NA_ facility", async () => {
    channelDetails.value = [channelRow()];
    shopLocations.value = [{ shopId: "100002", facilityId: "_NA_", shopifyLocationId: "LOC_AGG" }];
    facilities.value = [{ facilityId: "_NA_", facilityName: "Brokering Queue" }];
    channels.value = [{ inventoryChannelId: "IC_1001", shopId: "100002", shopifyLocationId: "LOC_AGG", description: "Retail Aggregate aggregate inventory" }];
    const wrapper = await mountHistory("channel");

    expect(rows(wrapper)[0].text()).toContain("Retail Aggregate aggregate inventory");
    expect(wrapper.text()).not.toContain("Brokering Queue");
  });

  /** The shop's inventory item as the worker caches it from Shopify. */
  const shopifyItem = (over: Record<string, any> = {}) => ({
    shopId: "100002", shopifyInventoryItemId: "ITEM_2", sku: "727A-218A", shopifyVariantId: "4401", variantTitle: "After Hours",
    variantDisplayName: "Getty Wide Leg - After Hours", shopifyProductId: "9901", productTitle: "Getty Wide Leg",
    imageUrl: "https://cdn.test/variant.jpg", ...over,
  });

  it("names the product from Shopify's inventory item, not the decision comment", async () => {
    locationDetails.value = [locationRow({ decisionComment: "Event POS_ISSUANCE:201843: product WRONG at facility 1: -1.0; sum -1.0 to shop 100002 location LOC_STORE inventory item ITEM_2." })];
    inventoryItems.value = [shopifyItem(), shopifyItem({ shopId: "OTHER_SHOP", productTitle: "Other shop's product" })];
    const wrapper = await mountHistory("location");

    expect(rows(wrapper)[0].text()).toContain("Getty Wide Leg");
    expect(rows(wrapper)[0].text()).toContain("727A-218A, After Hours");
    expect(rows(wrapper)[0].find("img").attributes("src")).toBe("https://cdn.test/variant.jpg");
    expect(wrapper.text()).not.toContain("WRONG");
    expect(wrapper.text()).not.toContain("Other shop's product");
  });

  it.each(["Default Title", "Getty Wide Leg"])("drops a variant title that says nothing (%s)", async (variantTitle) => {
    locationDetails.value = [locationRow()];
    inventoryItems.value = [shopifyItem({ variantTitle })];
    const wrapper = await mountHistory("location");

    // The line under the product title: the SKU alone, with no variant after it.
    expect(rows(wrapper)[0].find("ion-label > p").text()).toBe("727A-218A");
  });

  it("names the source record for an event type written without the SIE_ prefix", async () => {
    locationDetails.value = [locationRow()];
    const wrapper = await mountHistory("location");

    expect(rows(wrapper)[0].text()).toContain("Item issuance 201843");
  });
});

describe("ShopifyInventoryEventHistory - delivery, read from the freshest cached message", () => {
  const sent = (over: Record<string, any> = {}) => channelRow({ systemMessageId: "BATCH_OK", systemMessageStatusId: "SmsgSent", ...over });

  it("says how long a delivered event took, and nothing for one still owed", async () => {
    messages.value = [{ systemMessageId: "BATCH_OK", statusId: "SmsgSent", processedDate: 1_000_000 + 5 * MINUTE, cachedAt: 10 }];
    channelDetails.value = [sent({ eventReferenceId: "R_SENT" }), channelRow({ eventReferenceId: "R_WAITING" })];
    const wrapper = await mountHistory("channel");

    expect(wrapper.text()).toContain("sent 5.0 min later");
    expect(wrapper.text()).toContain("not sent yet");
  });

  it("does not read a failed send's attempt date as a delivery", async () => {
    channelDetails.value = [sent({ systemMessageStatusId: "SmsgError", systemMessageProcessedDate: 1_000_000 + 5 * MINUTE })];
    const wrapper = await mountHistory("channel");

    expect(wrapper.text()).not.toContain("later");
    expect(kpi(wrapper, "Delivery errors")).toBe("1");
  });

  it("reads the delivery time off the ledger row with no message cached", async () => {
    channelDetails.value = [sent({ systemMessageProcessedDate: 1_000_000 + 4 * MINUTE })];
    const wrapper = await mountHistory("channel");

    expect(wrapper.text()).toContain("sent 4.0 min later");
    expect(kpi(wrapper, "Typically reaches Shopify in")).toBe("4.0 min");
  });

  it("lets the message poller's later read override the row's joined status", async () => {
    channelDetails.value = [channelRow({ systemMessageId: "M1", systemMessageStatusId: "SmsgProduced", cachedAt: 5 })];
    messages.value = [{ systemMessageId: "M1", statusId: "SmsgSent", processedDate: 1_000_000 + 2 * MINUTE, cachedAt: 50 }];
    const wrapper = await mountHistory("channel");

    expect(rows(wrapper)[0].text()).toContain("Status SmsgSent");
    expect(wrapper.text()).toContain("sent 2.0 min later");
  });

  it.each(["SmsgSent", "SmsgConsumed", "SmsgConfirmed"])("treats %s as delivered", async (statusId) => {
    channelDetails.value = [sent({ systemMessageStatusId: statusId, systemMessageProcessedDate: 1_000_000 + 3 * MINUTE })];
    const wrapper = await mountHistory("channel");

    expect(wrapper.text()).toContain("sent 3.0 min later");
    expect(kpi(wrapper, "Oldest still owed to Shopify")).toBe("Nothing waiting");
  });

  it("owes nothing for a zero delta or a cancelled batch", async () => {
    locationDetails.value = [
      locationRow({ eventReferenceId: "R_NOOP", computedInventoryChange: 0 }),
      locationRow({ eventReferenceId: "R_CANCELLED", systemMessageId: "M_X", systemMessageStatusId: "SmsgCancelled" }),
    ];
    const wrapper = await mountHistory("location");

    expect(rows(wrapper)).toHaveLength(2);
    expect(wrapper.text()).not.toContain("not sent yet");
    expect(kpi(wrapper, "Oldest still owed to Shopify")).toBe("Nothing waiting");
    expect(kpi(wrapper, "Waiting to batch")).toBe("0");
  });

  it("takes the typical lag over delivered rows only", async () => {
    channelDetails.value = [
      sent({ eventReferenceId: "A", systemMessageProcessedDate: 1_000_000 + 2 * MINUTE }),
      sent({ eventReferenceId: "B", systemMessageProcessedDate: 1_000_000 + 4 * MINUTE }),
      sent({ eventReferenceId: "C", systemMessageProcessedDate: 1_000_000 + 9 * MINUTE }),
      channelRow({ eventReferenceId: "D" }),
    ];
    const wrapper = await mountHistory("channel");

    expect(kpi(wrapper, "Typically reaches Shopify in")).toBe("4.0 min");
    expect(wrapper.text()).toContain("Median of 3 delivered, slowest 9.0 min");
    expect(kpi(wrapper, "Events")).toBe("4");
  });
});

describe("ShopifyInventoryEventHistory - filters", () => {
  it("narrows to the rows the search matches, by anything printed on them", async () => {
    channelDetails.value = [channelRow({ eventReferenceId: "R_KEEP" }), channelRow({ eventReferenceId: "R_HIDE", computedInventoryChange: -2 })];
    const wrapper = await mountHistory("channel");

    wrapper.findComponent({ name: "IonSearchbar" }).vm.$emit("update:modelValue", "R_KEEP");
    await flushPromises();

    expect(rows(wrapper)).toHaveLength(1);
    expect(wrapper.text()).toContain("1 shown");
    expect(wrapper.text()).not.toContain("-2");
  });

  it("opens filtered from the URL, and a KPI card toggles its filter back into the URL", async () => {
    routeQuery.value = { state: "error" };
    locationDetails.value = [
      locationRow({ eventReferenceId: "OK", systemMessageId: "M1", systemMessageStatusId: "SmsgSent" }),
      locationRow({ eventReferenceId: "BAD", systemMessageId: "M2", systemMessageStatusId: "SmsgError" }),
    ];
    const wrapper = await mountHistory("location");

    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain("M2");

    await wrapper.findAll(".kpi-card").find((card) => card.text().includes("Delivery errors"))!.trigger("click");
    await flushPromises();

    expect(rows(wrapper)).toHaveLength(2);
    expect(harness.replace).toHaveBeenLastCalledWith({ query: {} });
  });

  it("filters by Shopify location, labelled the way the rows are", async () => {
    locationDetails.value = [locationRow({ eventReferenceId: "A" }), locationRow({ eventReferenceId: "B", shopifyLocationId: "LOC_OTHER" })];
    shopLocations.value = [{ shopId: "100002", facilityId: "STORE_7", shopifyLocationId: "LOC_STORE" }];
    facilities.value = [{ facilityId: "STORE_7", facilityName: "Brooklyn Store" }];
    const wrapper = await mountHistory("location");

    const option = wrapper.findAllComponents({ name: "IonSelectOption" }).find((entry) => entry.props("value") === "LOC_STORE");
    expect(option?.text()).toBe("Brooklyn Store");
  });
});

describe("ShopifyInventoryEventHistory - rows open their detail and their batch", () => {
  it("opens the event detail from the row itself, by click and by keyboard", async () => {
    channelDetails.value = [channelRow({ eventReferenceId: "R_OPEN" })];
    const wrapper = await mountHistory("channel");
    const row = rows(wrapper)[0];

    expect(row.attributes("role")).toBe("button");
    await row.trigger("click");
    expect((wrapper.vm as any).selectedEvent?.eventReferenceId).toBe("R_OPEN");

    (wrapper.vm as any).selectedEvent = null;
    await row.trigger("keydown", { key: "Enter" });
    expect((wrapper.vm as any).selectedEvent?.eventReferenceId).toBe("R_OPEN");
  });

  it("builds the open batch from the live rows so it follows delivery", async () => {
    channelDetails.value = [channelRow({ systemMessageId: "M1", systemMessageStatusId: "SmsgProduced" })];
    const wrapper = await mountHistory("channel");
    (wrapper.vm as any).openBatch("M1");
    await flushPromises();

    expect((wrapper.vm as any).selectedBatch?.delivery.id).toBe("inFlight");

    channelDetails.value = [channelRow({ systemMessageId: "M1", systemMessageStatusId: "SmsgSent" })];
    await flushPromises();

    expect((wrapper.vm as any).selectedBatch?.delivery.id).toBe("sent");
  });
});
