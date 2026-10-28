// @vitest-environment jsdom
import { enableAutoUnmount, type VueWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, toValue } from "vue";

// Runs the REAL `useInventoryEvents` over cache-shaped rows: the ledger-to-row mapping is under test.

const channelDetails = ref<any[]>([]);
const locationDetails = ref<any[]>([]);
const messages = ref<any[]>([]);
const shopLocations = ref<any[]>([]);
const facilities = ref<any[]>([]);
const channels = ref<any[]>([]);
const inventoryItems = ref<any[]>([]);
const serviceJobs = ref<any[]>([]);
const bounds = ref<any[]>([]);
const ledgerHydrated = ref(true);
const areaFailures = ref<Record<string, string>>({});
const ledgerReading = ref(false);
const manualRefreshing = ref(false);
const routeQuery = ref<Record<string, string>>({});

const harness = vi.hoisted(() => ({ replace: vi.fn(), resolveSources: vi.fn(), syncNow: vi.fn(), loadEventsFrom: vi.fn(), loadLedgerBounds: vi.fn(), ledgerOptions: undefined as any }));

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
  // Stored rows are the projected server rows themselves, with no synthetic key beside them.
  useLiveEntity: (table: string, options?: any) => {
    if(table.endsWith("AdjustmentDetails")) {harness.ledgerOptions = options;}
    const list = (source: { value: any[] }, hydrated = ref(true)) => {
      const records = computed(() => {
        const filter = toValue(options)?.filter;

        return filter ? source.value.filter(filter) : source.value;
      });

      return { records, first: computed(() => records.value[0]), count: computed(() => records.value.length), hydrated };
    };
    if(table === "shopifyInventoryAdjustmentDetails") {return list(channelDetails, ledgerHydrated);}
    if(table === "shopifyLocationInventoryAdjustmentDetails") {return list(locationDetails, ledgerHydrated);}
    if(table === "systemMessages") {return list(messages);}
    if(table === "shopifyLocations") {return list(shopLocations);}
    if(table === "facilities") {return list(facilities);}
    if(table === "inventoryChannels") {return list(channels);}
    if(table === "serviceJobs") {return list(serviceJobs);}
    if(table === "inventoryLedgerBounds") {return list(bounds);}
    if(table === "shopifyInventoryItems") {return list(inventoryItems);}

    return list(ref([]));
  },
}));

vi.mock("@/composables/useInventorySyncArea", () => ({
  useInventorySyncArea: () => ({
    ready: ref(true), error: ref(""), failingDomains: areaFailures, busy: ref(false), manualRefreshing,
    syncNow: harness.syncNow, afterMutation: vi.fn(), loadEventsFrom: harness.loadEventsFrom, loadLedgerBounds: harness.loadLedgerBounds,
    ledgerReading: () => ledgerReading,
  }),
}));

vi.mock("@/composables/useSeed", () => ({
  useStatuses: () => ({ labelFor: (statusId: string) => (statusId ? `Status ${statusId}` : "") }),
}));

vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    requestSystemMessage: vi.fn().mockResolvedValue(undefined),
    requestSystemMessageErrors: vi.fn().mockResolvedValue(undefined),
    refreshSystemMessageErrors: vi.fn().mockResolvedValue(undefined),
    resendSystemMessage: vi.fn(),
  }),
  useSystemMessageRecord: () => ({ record: ref(undefined), hydrated: ref(true) }),
  useSystemMessageErrors: () => ({ errors: ref([]), errorText: ref(""), hydrated: ref(true) }),
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
  serviceJobs.value = [];
  bounds.value = [];
  harness.loadEventsFrom.mockReset();
  harness.loadLedgerBounds.mockReset().mockResolvedValue(1);
  ledgerHydrated.value = true;
  ledgerReading.value = false;
  manualRefreshing.value = false;
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

  it.each([
    { stamp: undefined, says: "Shopify connector is older than v4.4.0" },
    { stamp: 1_000, says: "kept current with every event and batch" },
  ])("shows the rows either way, and says whether they are live (stamp $stamp)", async ({ stamp, says }) => {
    locationDetails.value = [locationRow({ detailLastUpdatedStamp: stamp })];
    const wrapper = await mountHistory("location");

    expect(rows(wrapper)).toHaveLength(1);
    expect(wrapper.text()).toContain(says);
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

  it("scopes the ledger to the shop in the route, following it when a reused view changes shop", async () => {
    const wrapper = await mountHistory("location");
    expect(toValue(harness.ledgerOptions).scope).toEqual({ field: "shopId", value: "100002" });

    await wrapper.setProps({ id: "100051" });

    expect(toValue(harness.ledgerOptions).scope).toEqual({ field: "shopId", value: "100051" });
    // The server bound is asked once per load, and again only for the new shop.
    expect(harness.loadLedgerBounds.mock.calls).toEqual([["location", "100002"], ["location", "100051"]]);
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

  const shopifyItem = (over: Record<string, any> = {}) => ({
    shopId: "100002", shopifyInventoryItemId: "ITEM_2", sku: "727A-218A", shopifyVariantId: "4401", variantTitle: "After Hours",
    shopifyProductId: "9901", productTitle: "Getty Wide Leg", imageUrl: "https://cdn.test/variant.jpg", ...over,
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

  it("reads the delivery time off the ledger row with no message cached, and nothing for one still owed", async () => {
    channelDetails.value = [sent({ systemMessageProcessedDate: 1_000_000 + 4 * MINUTE }), channelRow({ eventReferenceId: "R_WAITING" })];
    const wrapper = await mountHistory("channel");

    expect(wrapper.text()).toContain("sent 4.0 min later");
    expect(wrapper.text()).toContain("not sent yet");
    expect(kpi(wrapper, "Typically reaches Shopify in")).toBe("4.0 min");
  });

  it("lets the message poller's later read override the row's joined status", async () => {
    channelDetails.value = [channelRow({ systemMessageId: "M1", systemMessageStatusId: "SmsgProduced", syncedAt: 5 })];
    messages.value = [{ systemMessageId: "M1", statusId: "SmsgSent", processedDate: 1_000_000 + 2 * MINUTE, syncedAt: 50 }];
    const wrapper = await mountHistory("channel");

    expect(rows(wrapper)[0].text()).toContain("Status SmsgSent");
    expect(wrapper.text()).toContain("sent 2.0 min later");
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

describe("ShopifyInventoryEventHistory - date pickers", () => {
  const datetimes = (wrapper: VueWrapper) => wrapper.findAllComponents({ name: "IonDatetime" });

  it("starts both calendars at the oldest loaded event, and says what the purge job keeps", async () => {
    const oldest = Date.parse("2026-09-21T15:00:00");
    // Newest first, as the index-ordered cache read delivers them.
    locationDetails.value = [locationRow({ eventReferenceId: "NEW", createdDate: Date.parse("2026-09-25T09:00:00") }), locationRow({ eventReferenceId: "OLD", createdDate: oldest })];
    serviceJobs.value = [{
      jobName: "purge_OldShopifyLocationInventoryAdjustmentDetails_hourly", paused: "N",
      serviceName: "co.hotwax.sob.product.InventoryServices.purge#OldShopifyLocationInventoryAdjustmentDetails",
      serviceJobParameters: [{ parameterName: "daysToKeep", parameterValue: "7" }],
    }];
    const wrapper = await mountHistory("location");

    expect(datetimes(wrapper).map((picker) => picker.attributes("min"))).toEqual(["2026-09-21", "2026-09-21"]);
    expect(wrapper.text()).toContain("The purge job keeps settled events for 7 days.");
  });

  it("starts the calendars where the server's copy starts, not where the cache does", async () => {
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    const wrapper = await mountHistory("location");

    expect(datetimes(wrapper).map((picker) => picker.attributes("min"))).toEqual(["2026-09-22", "2026-09-22"]);
  });

  it("loads a From date older than the cache from the server, showing the loading card until it lands", async () => {
    let finish!: () => void;
    harness.loadEventsFrom.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    routeQuery.value = { from: "2026-09-23", to: "2026-09-23" };
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    const wrapper = await mountHistory("location");

    expect(harness.loadEventsFrom).toHaveBeenCalledWith("location", Date.parse("2026-09-23T00:00:00"));
    expect(wrapper.text()).toContain("This is not a confirmed empty history.");

    finish();
    await flushPromises();

    expect(wrapper.text()).toContain("No inventory events match this view");
  });

  it("asks for nothing older once the cache already reaches the server's oldest row", async () => {
    routeQuery.value = { from: "2026-09-20" };
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-22T13:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    await mountHistory("location");

    expect(harness.loadEventsFrom).not.toHaveBeenCalled();
  });

  it("loads a To date older than the cache from the server's oldest row, with no From date", async () => {
    routeQuery.value = { to: "2026-09-23" };
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    await mountHistory("location");

    expect(harness.loadEventsFrom).toHaveBeenCalledWith("location", Date.parse("2026-09-22T13:00:00"));
  });

  it("loads from the To date's own day while the server's oldest row is still unknown", async () => {
    routeQuery.value = { to: "2026-09-23" };
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    await mountHistory("location");

    expect(harness.loadEventsFrom).toHaveBeenCalledWith("location", Date.parse("2026-09-23T00:00:00"));
  });

  it("loads everything up to a To date the cache already reaches, back to the server's oldest row", async () => {
    routeQuery.value = { to: "2026-09-26" };
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    await mountHistory("location");

    // Not only when To is older than the cache: the first batch pulls the cache past To mid-load.
    expect(harness.loadEventsFrom).toHaveBeenCalledWith("location", Date.parse("2026-09-22T13:00:00"));
  });

  it("says the list starts at the cache when no date asks for older events", async () => {
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    const wrapper = await mountHistory("location");

    expect(harness.loadEventsFrom).not.toHaveBeenCalled();
    expect(wrapper.text()).toMatch(/Showing events since .*\. The OMS has events back to .*; choose an earlier From or To date to load them\./);
  });

  it("runs a progress bar while older events load, then drops it and the coverage note once the range is reached", async () => {
    let finish!: (written: number) => void;
    harness.loadEventsFrom.mockReturnValue(new Promise<number>((resolve) => { finish = resolve; }));
    routeQuery.value = { from: "2026-09-23" };
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    const wrapper = await mountHistory("location");

    expect(wrapper.findComponent({ name: "IonProgressBar" }).exists()).toBe(true);
    expect(wrapper.text()).toContain("Loading events back to");
    // Rows already on screen stay; the bar is what says more are coming.
    expect(rows(wrapper)).toHaveLength(1);

    // A page lands mid-load: the list and the progress line move with it.
    locationDetails.value = [...locationDetails.value, locationRow({ eventReferenceId: "OLDER", createdDate: Date.parse("2026-09-24T09:00:00") })];
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(2);
    expect(wrapper.text()).toMatch(/2 shown so far, back to .*Sep 24/);

    finish(0);
    await flushPromises();

    expect(wrapper.findComponent({ name: "IonProgressBar" }).exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Only events since");
    expect(wrapper.text()).not.toContain("Showing events since");
  });

  it("says a From range is only partly loaded when the load could not reach it", async () => {
    harness.loadEventsFrom.mockRejectedValue(new Error("boom"));
    routeQuery.value = { from: "2026-09-23" };
    locationDetails.value = [locationRow({ createdDate: Date.parse("2026-09-25T09:00:00") })];
    bounds.value = [{ kind: "location", shopId: "100002", oldestCreatedDate: Date.parse("2026-09-22T13:00:00") }];
    const wrapper = await mountHistory("location");
    await flushPromises();

    expect(wrapper.text()).toContain("the rest of this range has not been read from the OMS.");
  });

  it("says nothing about purging when the OMS has no purge job for this ledger", async () => {
    locationDetails.value = [locationRow()];
    const wrapper = await mountHistory("location");

    expect(wrapper.text()).not.toContain("The purge job");
  });
});

describe("ShopifyInventoryEventHistory - how current the list is", () => {
  it("shows the cache as loading, not as an OMS without live updates, until this visit's first read lands", async () => {
    ledgerReading.value = true;
    // Rows an earlier visit cached from an older connector: no update stamps.
    locationDetails.value = [locationRow()];
    const wrapper = await mountHistory("location");

    expect(wrapper.text()).toContain("Reading the newest events from the OMS.");
    expect(wrapper.findComponent({ name: "IonProgressBar" }).exists()).toBe(true);
    expect(wrapper.text()).not.toContain("older than v4.4.0");

    ledgerReading.value = false;
    await flushPromises();

    expect(wrapper.findComponent({ name: "IonProgressBar" }).exists()).toBe(false);
    expect(wrapper.text()).toContain("This OMS's Shopify connector is older than v4.4.0");
  });

  it("says nothing about the connector when the rows carry update stamps", async () => {
    locationDetails.value = [locationRow({ detailLastUpdatedStamp: 1_000_000 })];
    const wrapper = await mountHistory("location");

    expect(wrapper.text()).not.toContain("older than v4.4.0");
    expect(wrapper.findComponent({ name: "IonProgressBar" }).exists()).toBe(false);
  });

  it("runs the progress bar during a manual refresh", async () => {
    manualRefreshing.value = true;
    locationDetails.value = [locationRow({ detailLastUpdatedStamp: 1_000_000 })];
    const wrapper = await mountHistory("location");

    expect(wrapper.text()).toContain("Refreshing events from the OMS.");
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

enableAutoUnmount(afterEach);

// Load the lazy view during setup, before the first test's assertion timeout.
beforeAll(async () => {
  await import("@/views/ShopifyInventoryEventHistory.vue");
});
