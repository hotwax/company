// @vitest-environment jsdom
import { type VueWrapper, flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const cachedJobs = ref<any[]>([]);
const cachedChannels = ref<any[]>([]);
const cachedShops = ref<any[]>([]);
const cachedDataFeeds = ref<any[]>([]);
const cachedAdjustmentDetails = ref<any[]>([]);
const cachedLocationSummaries = ref<any[]>([]);
const cachedMessages = ref<any[]>([]);
// The read layer's health, controllable: an empty section means "nothing there" only when these say so.
const detailsHydrated = ref(true);
const syncReady = ref(true);
const syncError = ref<string | null>(null);

const harness = vi.hoisted(() => ({
  ensureChannelResetJob: vi.fn(),
  ensureChannelEventPublisherJob: vi.fn(),
  ensureChannelEventDiscardJob: vi.fn(),
  ensureInventoryAdjustmentSenderJob: vi.fn(),
  ensureShopPhysicalInventoryResetJob: vi.fn(),
  ensureShopPhysicalAtpResetJob: vi.fn(),
  showToast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: harness.push,
    // The location history view mirrors its filters into the query string, so it both reads
    // `currentRoute` and calls `replace`. Without these the immediate watcher throws on mount.
    replace: harness.replace,
    currentRoute: { value: { query: {} } },
  }),
  useRoute: () => ({
    params: { id: "100002" },
    query: {},
  }),
}));

/** Solr-resolved products, so a test can give a row a real name, SKU and variant to render. */
const resolvedProducts = ref(new Map<string, any>());

vi.mock("@common", () => ({
  useProducts: () => ({ products: resolvedProducts, resolve: vi.fn(), reset: vi.fn() }),
  // Renders a real <img> rather than a stub: the event table puts one in every row, and a stub that
  // renders nothing would let a broken image cell pass.
  DxpShopifyImg: { props: ["src", "size"], template: "<img :src=\"src\" />" },
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

vi.mock("@/services/appCacheBootstrap", () => ({
  resyncDomain: vi.fn(),
}));

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    ready: syncReady,
    error: syncError,
    afterMutation: vi.fn(),
  }),
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (cache: any) => {
    const table = String(cache?.table || cache?.name || "");
    if(table.includes("shopifyShop") || table.includes("ShopifyShop")) {
      return { records: cachedShops, rows: cachedShops, hydrated: ref(true) };
    }
    if(table.includes("inventoryChannel") || table.includes("InventoryChannel")) {
      return { records: cachedChannels, rows: cachedChannels, hydrated: ref(true) };
    }
    if(table.includes("dataFeed") || table.includes("DataFeed")) {
      return { records: cachedDataFeeds, rows: cachedDataFeeds, hydrated: ref(true) };
    }
    if(table.includes("shopifyInventoryAdjustmentDetail") || table.includes("ShopifyInventoryAdjustmentDetail")) {
      return { records: cachedAdjustmentDetails, rows: cachedAdjustmentDetails, hydrated: detailsHydrated };
    }
    if(table.includes("shopifyLocationInventorySummar") || table.includes("ShopifyLocationInventorySummar")) {
      return { records: cachedLocationSummaries, rows: cachedLocationSummaries, hydrated: ref(true) };
    }
    if(table.includes("systemMessage") || table.includes("SystemMessage")) {
      return { records: cachedMessages, rows: cachedMessages, hydrated: ref(true) };
    }

    return { records: ref([]), rows: ref([]), hydrated: ref(true) };
  },
}));

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobs: () => ({
    jobs: cachedJobs,
    hydrated: ref(true),
  }),
  useServiceJobRunsByJob: () => ({
    runsFor: () => [],
    hydrated: ref(true),
  }),
}));

vi.mock("@/composables/useSeed", () => ({
  useStatuses: () => ({
    statuses: ref([]),
    // The real composable returns the StatusItem description; the view falls back to the raw id.
    labelFor: (statusId: string) => statusId,
  }),
}));

vi.mock("@/composables/useSystemMessage", () => ({
  useSystemMessage: () => ({
    findMessageErrors: vi.fn().mockResolvedValue([]),
    useRecentSystemMessages: () => ({ messages: ref([]), hydrated: ref(true) }),
  }),
}));

// Mirrors the real composable's return shape. The stub used to expose an older one
// (virtualRows/totalHeight/handleScroll), which left `visibleItems` undefined and silently handed the
// view nothing to render — so the view carried a guard for a shape only this stub produced.
// `visibleItems` passes the items straight through: this spec asserts on job scheduling, not on
// windowing, so the stub's job is to be honest about the contract rather than to window anything.
vi.mock("@/composables/useVirtualRows", () => ({
  useVirtualRows: (items: any) => ({
    containerRef: ref(null),
    visibleItems: items,
    topSpacer: ref(0),
    bottomSpacer: ref(0),
    startIndex: ref(0),
    endIndex: computed(() => items.value?.length ?? 0),
    onScroll: vi.fn(),
    scrollToTop: vi.fn(),
  }),
}));

vi.mock("@/composables/useShopify", () => ({
  fetchLocationsFromShopify: vi.fn().mockResolvedValue([]),
  useInventoryEventSources: () => ({
    sources: ref(new Map()),
    resolve: vi.fn(),
    sourceKeyOf: (eventTypeId: string, eventReferenceId: string) => `${eventTypeId}|${eventReferenceId}`,
  }),
  SHOPIFY_INVENTORY_EVENT_FEED_ID: "ShopifyInventoryEventFeed",
  SHOPIFY_LOCATION_INVENTORY_EVENT_FEED_ID: "ShopifyLocationInventoryEventFeed",
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL: "manual",
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH: "push",
  ABSOLUTE_CHANNEL_RESET_SERVICE: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed",
  DISCARD_PENDING_EVENTS_SERVICE: "co.hotwax.sob.product.InventoryServices.cancel#PendingShopifyInventoryAdjustmentEvents",
  PRODUCED_SENDER_SERVICE: "org.moqui.impl.SystemMessageServices.send#AllProducedSystemMessages",
  INVENTORY_ADJUSTMENT_MESSAGE_TYPE: "ShopifyInventoryAdjustment",
  ensureChannelEventDiscardJob: (...args: any[]) => harness.ensureChannelEventDiscardJob(...args),
  ensureChannelEventPublisherJob: (...args: any[]) => harness.ensureChannelEventPublisherJob(...args),
  ensureChannelResetJob: (...args: any[]) => harness.ensureChannelResetJob(...args),
  ensureInventoryAdjustmentSenderJob: (...args: any[]) => harness.ensureInventoryAdjustmentSenderJob(...args),
  ensureShopPhysicalInventoryResetJob: (...args: any[]) => harness.ensureShopPhysicalInventoryResetJob(...args),
  ensureShopPhysicalAtpResetJob: (...args: any[]) => harness.ensureShopPhysicalAtpResetJob(...args),
  PHYSICAL_ATP_RESET_SERVICE: "co.hotwax.sob.product.InventoryServices.generate#PhysicalLocationInventoryFeed",
  setInventoryEventDocumentAttached: vi.fn(),
  setInventoryEventDocumentAttachedForFeed: vi.fn(),
  useInventoryEventDocuments: () => ({
    documents: ref([]),
    hydrated: ref(true),
    refresh: vi.fn(),
    saving: ref(false),
  }),
  updateShopifyInventoryEventFeedType: vi.fn(),
  useShopifyShopMutations: () => ({
    saveShop: vi.fn(),
    saving: ref(false),
  }),
  useShopifySyncContext: () => ({
    remoteId: ref("REMOTE_100002"),
  }),
}));

describe("ShopifyInventorySync - Per-channel reset job scheduling", () => {
  beforeEach(() => {
    vi.resetModules();
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedJobs.value = [];
    cachedChannels.value = [
      {
        inventoryChannelId: "IC_1001",
        shopId: "100002",
        facilityGroupId: "FG_1",
        facilityGroupName: "Retail Channel",
        shopifyLocationId: "LOC_1",
        fromDate: 1000,
      },
      {
        inventoryChannelId: "IC_1002",
        shopId: "100002",
        facilityGroupId: "FG_2",
        facilityGroupName: "Wholesale Channel",
        shopifyLocationId: "LOC_2",
        fromDate: 1000,
      },
    ];
    cachedShops.value = [
      {
        shopId: "100002",
        name: "Shopify Store",
        inventoryFeedType: "manual",
      },
    ];
    cachedLocationSummaries.value = [];
    harness.ensureChannelResetJob.mockReset();
    harness.showToast.mockReset();
    harness.push.mockReset();
  });

  it.each([
    { summary: undefined, label: "Not available", danger: false },
    { summary: { shopId: "100002", errorLinkedCount: 0 }, label: "0", danger: false },
    { summary: { shopId: "100002", errorLinkedCount: 47 }, label: "47", danger: true },
  ])("renders authoritative delivery-error count $label with danger=$danger", async ({ summary, label, danger }) => {
    cachedLocationSummaries.value = summary ? [summary] : [];
    const ShopifyInventorySync = (await import("@/views/ShopifyInventorySync.vue")).default;
    // The delivery-error card is a filter control on the location history view, not a monitor KPI.
    // The monitor view surfaces the same count as a badge on the location queue card instead.
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002", initialView: "location-history" },
      global: {
        stubs: {
          IonBackButton: true,
          IonModal: { template: "<div><slot /></div>" },
          IonSkeletonText: true,
          ServiceJobDetailsModal: true,
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    const deliveryErrorsTitle = () => wrapper.findAll("ion-card")
      .find((card) => card.text().includes("Delivery errors"))!
      .findComponent({ name: "IonCardTitle" });
    expect(deliveryErrorsTitle().text()).toBe(label);
    expect(deliveryErrorsTitle().props("color") === "danger").toBe(danger);
  });

  it.each([undefined, 1000])("retains an active job's cadence when its cached next run is %s", async (nextExecutionDateTime) => {
    cachedJobs.value = [{
      jobName: 'purge_OldShopifyInventoryAdjustmentDetails_hourly',
      serviceName: 'co.hotwax.sob.product.InventoryServices.purge#OldShopifyInventoryAdjustmentDetails',
      paused: 'N', cronExpression: '0 0 * * * ?', cronString: 'Every hour', nextExecutionDateTime,
    }];
    const View = (await import('@/views/ShopifyInventorySync.vue')).default;
    const wrapper = mount(View, { props: { id: '100002' }, global: { stubs: { IonModal: true, ServiceJobDetailsModal: true } } });
    await flushPromises();
    const row = wrapper.findAll('ion-item').find(item => item.text().includes('Purge old aggregate inventory events (all Shopify connections)'))!;
    expect(row.text()).toContain('Runs every hour');
    expect(row.text()).not.toContain('No active schedule');
    wrapper.unmount();
  });

  it('opens each retention row with its own backend job', async () => {
    cachedJobs.value = [
      { jobName: 'AGGREGATE_RETENTION', serviceName: 'co.hotwax.sob.product.InventoryServices.purge#OldShopifyInventoryAdjustmentDetails', paused: 'N' },
      { jobName: 'PHYSICAL_RETENTION', serviceName: 'co.hotwax.sob.product.InventoryServices.purge#OldShopifyLocationInventoryAdjustmentDetails', paused: 'Y' },
    ];
    const View = (await import('@/views/ShopifyInventorySync.vue')).default;
    const wrapper = mount(View, { props: { id: '100002' }, global: { stubs: { IonModal: true, ServiceJobDetailsModal: true } } });
    await flushPromises();
    for (const [label, jobName] of [['Purge old aggregate inventory events', 'AGGREGATE_RETENTION'], ['Purge old physical location events', 'PHYSICAL_RETENTION']]) {
      const row = wrapper.findAll('ion-item').find(item => item.text().includes(label))!;
      await row.trigger('click');
      expect(wrapper.findComponent({ name: 'ServiceJobDetailsModal' }).props('jobName')).toBe(jobName);
    }
    wrapper.unmount();
  });

  it("surfaces each channel's own jobs on that channel's card", async () => {
    cachedJobs.value = [
      {
        jobName: "reset_InventoryChannelInventory_IC_1001",
        serviceName: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed",
        paused: "N",
        cronExpression: "0 0 2 * * ?",
        serviceJobParameters: [
          { parameterName: "inventoryChannelId", parameterValue: "IC_1001" },
        ],
      },
      {
        jobName: "reset_InventoryChannelInventory_IC_1002",
        serviceName: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed",
        paused: "Y",
        cronExpression: "0 0 4 * * ?",
        serviceJobParameters: [
          { parameterName: "inventoryChannelId", parameterValue: "IC_1002" },
        ],
      },
    ];

    const ShopifyInventorySync = (await import("@/views/ShopifyInventorySync.vue")).default;
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002" },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
          ServiceJobDetailsModal: {
            props: ["isOpen", "jobName", "title"],
            template: "<div data-testid=\"service-job-modal\" v-if=\"isOpen\">{{ title }}: {{ jobName }}</div>",
          },
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    // Each channel owns a card carrying its own two schedules, so a row no longer needs the channel
    // name in brackets to be distinguishable -- the card it sits on supplies that.
    const channelCards = wrapper.findAll("ion-card")
      .filter((card) => card.text().includes("Reset aggregate ATP"));
    expect(channelCards.length).toBe(2);

    expect(channelCards[0].text()).toContain("Retail Channel");
    expect(channelCards[1].text()).toContain("Wholesale Channel");

    // Resolved independently rather than collapsed onto the first job: IC_1001 is active and
    // IC_1002 is paused in the fixture above.
    expect(channelCards[0].text()).toContain("Active");
    expect(channelCards[1].text()).toContain("Paused");

    // The publisher is grouped with it, on the same card.
    channelCards.forEach((card) => {
      expect(card.text()).toContain("Publish and send event batches");
    });
  });

  it("opens the reset job from its row on the channel card", async () => {
    cachedJobs.value = [
      {
        jobName: "reset_InventoryChannelInventory_IC_1001",
        serviceName: "co.hotwax.sob.product.InventoryServices.generate#InventoryChannelInventoryFeed",
        paused: "N",
        cronExpression: "0 0 2 * * ?",
        serviceJobParameters: [
          { parameterName: "inventoryChannelId", parameterValue: "IC_1001" },
        ],
      },
    ];

    const ShopifyInventorySync = (await import("@/views/ShopifyInventorySync.vue")).default;
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002" },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
          ServiceJobDetailsModal: {
            props: ["isOpen", "jobName", "title"],
            template: "<div data-testid=\"service-job-modal\" v-if=\"isOpen\">{{ title }}: {{ jobName }}</div>",
          },
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    // The dedicated "Schedule reset" button is gone: it opened the same modal as the row it sat under,
    // and provisioned through the same ensureChannelResetJob when the job was missing.
    const scheduleButtons = wrapper.findAll("ion-button").filter((b) => b.text().includes("Schedule reset"));
    expect(scheduleButtons.length).toBe(0);

    // IC_1001 has a job, so its row is the way in.
    const resetRow = wrapper.findAll("ion-item")
      .find((item) => item.text().includes("Reset aggregate ATP") && item.text().includes("Active"));
    expect(resetRow).toBeDefined();

    await resetRow!.trigger("click");
    await flushPromises();

    const modal = wrapper.find("[data-testid='service-job-modal']");
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("Reset aggregate ATP");
    expect(modal.text()).toContain("Retail Channel");
    expect(modal.text()).toContain("reset_InventoryChannelInventory_IC_1001");
  });

  it("keeps a physical ATP setup failure visible and scopes setup to the current shop", async () => {
    harness.ensureShopPhysicalAtpResetJob.mockRejectedValue(new Error("Physical ATP reset setup is missing."));
    const View = (await import("@/views/ShopifyInventorySync.vue")).default;
    const wrapper = mount(View, { props: { id: "100002" }, global: { stubs: { IonModal: true, ServiceJobDetailsModal: true, EditInventoryChannelModal: true, SetupInventoryChannelModal: true } } });
    await flushPromises();
    const row = wrapper.findAll("ion-item").find(item => item.text().includes("Reset physical location ATP (all mapped locations on this shop)"));
    expect(row).toBeDefined();
    await row!.find("ion-button").trigger("click"); await flushPromises();
    expect(harness.ensureShopPhysicalAtpResetJob).toHaveBeenCalledWith("100002");
    expect(wrapper.find('[role="alert"]').text()).toContain("Physical ATP reset setup is missing.");
    wrapper.unmount();
  });

  it("provisions a missing reset job from the row's Set up action and opens it", async () => {
    harness.ensureChannelResetJob.mockResolvedValue("reset_InventoryChannelInventory_IC_1002");

    const ShopifyInventorySync = (await import("@/views/ShopifyInventorySync.vue")).default;
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002" },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
          ServiceJobDetailsModal: {
            props: ["isOpen", "jobName", "title"],
            template: "<div data-testid=\"service-job-modal\" v-if=\"isOpen\">{{ title }}: {{ jobName }}</div>",
          },
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    // IC_1002 has no reset job, so its row offers Set up rather than a click-through. That row is on
    // the Wholesale Channel's own card, which is how the channel is identified without a name suffix.
    const wholesaleCard = wrapper.findAll("ion-card")
      .find((card) => card.text().includes("Wholesale Channel") && card.text().includes("Reset aggregate ATP"));
    expect(wholesaleCard).toBeDefined();

    // Scope to the reset ROW, not the card: cachedJobs is empty here, so the publisher row offers a
    // Set up of its own and the card's first one is not the one under test.
    const resetRow = wholesaleCard!.findAll("ion-item")
      .find((item) => item.text().includes("Reset aggregate ATP"));
    expect(resetRow).toBeDefined();

    const setUpButton = resetRow!.findAll("ion-button").find((b) => b.text().includes("Set up"));
    expect(setUpButton).toBeDefined();

    await setUpButton!.trigger("click");
    await flushPromises();

    expect(harness.ensureChannelResetJob).toHaveBeenCalledWith({
      inventoryChannelId: "IC_1002",
      description: "Full aggregate ATP reset for Wholesale Channel",
    });

    // Creating from a single channel's row lands in that job's modal, which is the one thing the
    // removed button did that Set up alone did not.
    const modal = wrapper.find("[data-testid='service-job-modal']");
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("Reset aggregate ATP - Wholesale Channel");
    expect(modal.text()).toContain("reset_InventoryChannelInventory_IC_1002");
  });
}, 20000);

describe("ShopifyInventorySync - the event table never claims empty over unreadable data", () => {
  const mountHistory = async () => {
    const { default: ShopifyInventorySync } = await import("@/views/ShopifyInventorySync.vue");
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002", initialView: "history" as const },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
          ServiceJobDetailsModal: true,
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    return wrapper;
  };

  const EMPTY_CLAIM = "No inventory events match this view";
  const NOT_LOADED = "Not loaded";

  beforeEach(() => {
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedAdjustmentDetails.value = [];
    cachedMessages.value = [];
    cachedChannels.value = [];
  });

  it("says the history is empty when the ledger really is readable and empty", async () => {
    const wrapper = await mountHistory();

    expect(wrapper.text()).toContain(EMPTY_CLAIM);
    expect(wrapper.text()).not.toContain(NOT_LOADED);
  });

  it("makes no empty claim before the ledger cache has hydrated", async () => {
    detailsHydrated.value = false;
    const wrapper = await mountHistory();

    expect(wrapper.text()).not.toContain(EMPTY_CLAIM);
    expect(wrapper.text()).toContain(NOT_LOADED);
  });

  it("makes no empty claim when the sync reported an error, and shows the banner in this view", async () => {
    syncError.value = "inventoryAdjustmentDetails returned 500";
    const wrapper = await mountHistory();

    expect(wrapper.text()).not.toContain(EMPTY_CLAIM);
    expect(wrapper.text()).toContain(NOT_LOADED);
    // The banner used to live inside the monitor template, so the history route never showed it.
    expect(wrapper.text()).toContain("Inventory data could not be loaded from the OMS");
    expect(wrapper.text()).toContain("inventoryAdjustmentDetails returned 500");
  });

  /**
   * A refused batch is finished and nothing retries it, so its row has to stay readable with the
   * message id that carried it. The table has one row per event and no section to fall out of, which
   * is the property this guards -- the old four-section layout could drop such a row entirely.
   */
  it("keeps a rejected batch's event in the table with its system message", async () => {
    cachedChannels.value = [{
      inventoryChannelId: "IC_1001", shopId: "100002", facilityGroupId: "FG_1",
      facilityGroupName: "Retail Channel", shopifyLocationId: "LOC_1", fromDate: 1000,
    }];
    cachedAdjustmentDetails.value = [{
      eventTypeId: "RECEIPT", eventReferenceId: "R1", inventoryChannelId: "IC_1001",
      shopifyInventoryItemId: "ITEM_1", detailStatusId: "DETAIL_ASSIGNED",
      systemMessageId: "BATCH_REJECTED", systemMessageStatusId: "SmsgRejected",
      computedInventoryChange: 1, createdDate: 1000,
    }];
    cachedMessages.value = [{ systemMessageId: "BATCH_REJECTED", statusId: "SmsgRejected" }];
    const wrapper = await mountHistory();

    expect(wrapper.findAll("[data-virtual-row]")).toHaveLength(1);
    expect(wrapper.text()).toContain("BATCH_REJECTED");
    expect(wrapper.text()).toContain("SmsgRejected");
    expect(wrapper.text()).not.toContain(EMPTY_CLAIM);
  });
});

describe("ShopifyInventorySync - the event table shows one row per event", () => {
  const pendingRow = (over: Record<string, any>) => ({
    detailStatusId: "DETAIL_PENDING",
    systemMessageId: "",
    inventoryChannelId: "IC_1001",
    shopifyInventoryItemId: "ITEM_1",
    eventTypeId: "RECEIPT",
    computedInventoryChange: 1,
    createdDate: 1000,
    ...over,
  });

  const mountHistory = async () => {
    const { default: ShopifyInventorySync } = await import("@/views/ShopifyInventorySync.vue");
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002", initialView: "history" as const },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
          ServiceJobDetailsModal: true,
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    return wrapper;
  };

  beforeEach(() => {
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedMessages.value = [];
    cachedJobs.value = [];
    resolvedProducts.value = new Map();
    cachedChannels.value = [{
      inventoryChannelId: "IC_1001", shopId: "100002", facilityGroupId: "FG_1",
      facilityGroupName: "Retail Channel", shopifyLocationId: "LOC_1", fromDate: 1000,
    }];
  });

  it("renders every event, unbatched ones included, and says so when a row has no batch", async () => {
    cachedAdjustmentDetails.value = [
      pendingRow({ eventReferenceId: "R_ONE" }),
      pendingRow({ eventReferenceId: "R_TWO", computedInventoryChange: -2 }),
    ];
    const wrapper = await mountHistory();

    expect(wrapper.findAll("[data-virtual-row]")).toHaveLength(2);
    expect(wrapper.text()).toContain("2 shown");
    expect(wrapper.text()).toContain("+1");
    expect(wrapper.text()).toContain("-2");
    expect(wrapper.text()).toContain("Not batched");
  });

  /**
   * The rule the search has to keep: a row is findable by anything printed on it. The variant prints
   * beside the SKU on the product cell, and leaving it out of the predicate meant typing the exact
   * text on screen filtered that row away.
   */
  it("finds a row by the variant printed on it", async () => {
    resolvedProducts.value = new Map([["140876", {
      productId: "140876",
      parentProductName: "Getty Wide Leg",
      productName: "After Hours",
      sku: "727A-218A-12160",
      internalName: "",
      mainImageUrl: "",
      goodIdentifications: [],
    }]]);
    cachedAdjustmentDetails.value = [
      pendingRow({
        eventReferenceId: "R_VARIANT",
        decisionComment: "Event RECEIPT:R_VARIANT: product 140876 publishable ATP 40.0 -> 41.0.",
      }),
      pendingRow({ eventReferenceId: "R_OTHER" }),
    ];
    const wrapper = await mountHistory();

    expect(wrapper.text()).toContain("After Hours");
    expect(wrapper.findAll("[data-virtual-row]")).toHaveLength(2);

    wrapper.findComponent({ name: "IonSearchbar" }).vm.$emit("update:modelValue", "After Hours");
    await flushPromises();

    expect(wrapper.findAll("[data-virtual-row]")).toHaveLength(1);
    expect(wrapper.text()).toContain("Getty Wide Leg");
  });

  /**
   * The row IS the control -- there is no chevron button any more -- so the click handler and the
   * keyboard handlers live on the grid row itself. A row that stops opening its detail is invisible
   * to every other test here, since they all assert on rendered text.
   */
  it("opens the event detail from the row itself", async () => {
    cachedAdjustmentDetails.value = [pendingRow({ eventReferenceId: "R_OPEN" })];
    const wrapper = await mountHistory();

    const row = wrapper.find("[data-virtual-row]");
    expect(row.attributes("role")).toBe("button");
    expect(row.attributes("tabindex")).toBe("0");
    // Asserted on the state, not on the modal's text: `IonModal` is stubbed as a plain slot wrapper
    // here, so its content is in the DOM whether it is open or not and any text assertion passes
    // vacuously.
    expect((wrapper.vm as any).selectedEvent).toBeNull();

    await row.trigger("click");
    await flushPromises();

    expect((wrapper.vm as any).selectedEvent?.eventReferenceId).toBe("R_OPEN");

    (wrapper.vm as any).selectedEvent = null;
    await row.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect((wrapper.vm as any).selectedEvent?.eventReferenceId).toBe("R_OPEN");
  });

  const MINUTE = 60_000;
  const kpi = (wrapper: VueWrapper, subtitle: string) => wrapper.findAll(".kpi-card")
    .find((card) => card.find("ion-card-subtitle").text() === subtitle)
    ?.find("ion-card-title").text();
  const sentRow = (over: Record<string, any>) => pendingRow({
    detailStatusId: "DETAIL_ASSIGNED",
    systemMessageId: "BATCH_OK",
    systemMessageStatusId: "SmsgSent",
    createdDate: 1_000_000,
    ...over,
  });

  it("says how long a delivered event took, and says nothing for one still in flight", async () => {
    cachedMessages.value = [{ systemMessageId: "BATCH_OK", statusId: "SmsgSent", processedDate: 1_000_000 + 5 * MINUTE }];
    cachedAdjustmentDetails.value = [sentRow({ eventReferenceId: "R_SENT" }), pendingRow({ eventReferenceId: "R_WAITING" })];
    const wrapper = await mountHistory();

    expect(wrapper.text()).toContain("sent 5.0 min later");
    expect(wrapper.text()).toContain("not sent yet");
  });

  /**
   * `processedDate` is stamped by the send ATTEMPT, not by its outcome. Reading it off a message the
   * sender is retrying, or one Shopify refused, would report a delivery that never happened — and on
   * this page that is the number an operator uses to decide whether Shopify is current.
   */
  it("does not read a failed send's attempt date as a delivery", async () => {
    cachedMessages.value = [{ systemMessageId: "BATCH_OK", statusId: "SmsgError", processedDate: 1_000_000 + 5 * MINUTE }];
    cachedAdjustmentDetails.value = [sentRow({ eventReferenceId: "R_FAILED", systemMessageStatusId: "SmsgError" })];
    const wrapper = await mountHistory();

    expect(wrapper.text()).toContain("not sent yet");
    expect(wrapper.text()).not.toContain("later");
  });

  it("summarises the typical lag over only the events that were delivered", async () => {
    cachedMessages.value = [
      { systemMessageId: "BATCH_A", statusId: "SmsgSent", processedDate: 1_000_000 + 2 * MINUTE },
      { systemMessageId: "BATCH_B", statusId: "SmsgSent", processedDate: 1_000_000 + 4 * MINUTE },
      { systemMessageId: "BATCH_C", statusId: "SmsgSent", processedDate: 1_000_000 + 9 * MINUTE },
    ];
    cachedAdjustmentDetails.value = [
      sentRow({ eventReferenceId: "R_A", systemMessageId: "BATCH_A" }),
      sentRow({ eventReferenceId: "R_B", systemMessageId: "BATCH_B" }),
      sentRow({ eventReferenceId: "R_C", systemMessageId: "BATCH_C" }),
      // Never delivered: it must not count toward the typical figure, and the denominator must say so.
      pendingRow({ eventReferenceId: "R_PENDING" }),
    ];
    const wrapper = await mountHistory();

    expect(kpi(wrapper, "Typically reaches Shopify in")).toBe("4.0 min");
    expect(kpi(wrapper, "Slowest")).toBe("9.0 min");
    // The denominator travels with the figure: the fourth event was never delivered.
    expect(wrapper.text()).toContain("median of 3 delivered");
    expect(kpi(wrapper, "Events")).toBe("4");
  });

  /**
   * A no-change row netted to zero and a cancelled batch is not coming back, so neither is "not sent
   * yet" -- that phrase promises a delivery the pipeline has already declined to make. Both carry no
   * time label at all, and neither can be the oldest thing owed to Shopify.
   */
  it("puts no time label on an event that will never be sent", async () => {
    cachedMessages.value = [{ systemMessageId: "BATCH_X", statusId: "SmsgCancelled" }];
    cachedAdjustmentDetails.value = [
      pendingRow({ eventReferenceId: "R_NOOP", detailStatusId: "DETAIL_NOOP", computedInventoryChange: 0 }),
      pendingRow({
        eventReferenceId: "R_CANCELLED", detailStatusId: "DETAIL_ASSIGNED",
        systemMessageId: "BATCH_X", systemMessageStatusId: "SmsgCancelled",
      }),
    ];
    const wrapper = await mountHistory();

    expect(wrapper.findAll("[data-virtual-row]")).toHaveLength(2);
    expect(wrapper.text()).not.toContain("not sent yet");
    expect(wrapper.text()).not.toContain("later");
    expect(kpi(wrapper, "Oldest still owed to Shopify")).toBe("Nothing waiting");
  });

  /**
   * Delivered is a fact about the STATUS, not about whether the message carrying the timestamp
   * happens to be cached -- only a few dozen messages are enriched per pass. Reading the missing
   * timestamp as "not sent" reported 31-hour-old delivered rows as the oldest thing Shopify was owed.
   */
  it("does not call a sent event undelivered just because its message is not cached", async () => {
    cachedMessages.value = [];
    cachedAdjustmentDetails.value = [pendingRow({
      eventReferenceId: "R_SENT_UNCACHED", detailStatusId: "DETAIL_ASSIGNED",
      systemMessageId: "BATCH_GONE", systemMessageStatusId: "SmsgSent",
    })];
    const wrapper = await mountHistory();

    expect(wrapper.text()).not.toContain("not sent yet");
    expect(kpi(wrapper, "Oldest still owed to Shopify")).toBe("Nothing waiting");
  });

  it("reports the oldest event Shopify is still owed", async () => {
    cachedAdjustmentDetails.value = [
      pendingRow({ eventReferenceId: "R_OLD", createdDate: Date.now() - 3 * 60 * 60 * 1000 }),
      pendingRow({ eventReferenceId: "R_NEW", createdDate: Date.now() - 60 * 1000 }),
    ];
    const wrapper = await mountHistory();

    expect(kpi(wrapper, "Oldest still owed to Shopify")).toBe("3h ago");
  });

  it("narrows the table to the rows the search matches", async () => {
    cachedAdjustmentDetails.value = [
      pendingRow({ eventReferenceId: "R_KEEP" }),
      pendingRow({ eventReferenceId: "R_HIDE", computedInventoryChange: -2 }),
    ];
    const wrapper = await mountHistory();

    expect(wrapper.findAll("[data-virtual-row]")).toHaveLength(2);

    wrapper.findComponent({ name: "IonSearchbar" }).vm.$emit("update:modelValue", "R_KEEP");
    await flushPromises();

    expect(wrapper.findAll("[data-virtual-row]")).toHaveLength(1);
    expect(wrapper.text()).toContain("1 shown");
    expect(wrapper.text()).toContain("+1");
    expect(wrapper.text()).not.toContain("-2");
  });
});

/**
 * The channel filter's options are objects -- `{ value, label }` -- because two channels can share a
 * facility group name, so the filter matches on the id while the label carries the name and, when a
 * name repeats, the id that tells them apart.
 *
 * Rendering the option itself instead of its label is legal Vue: it prints the JSON of the object and
 * nothing fails. Only the `:key` and `:value` keep working, so the filter still filters and the
 * regression is visible exclusively to a person reading the dropdown.
 */
describe("ShopifyInventorySync - the inventory channel filter", () => {
  const mountHistory = async () => {
    const { default: ShopifyInventorySync } = await import("@/views/ShopifyInventorySync.vue");
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002", initialView: "history" as const },
      global: {
        stubs: {
          IonModal: { template: "<div><slot /></div>" },
          ServiceJobDetailsModal: true,
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    return wrapper;
  };

  beforeEach(() => {
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedMessages.value = [];
    cachedJobs.value = [];
    cachedAdjustmentDetails.value = [];
    cachedChannels.value = [
      { inventoryChannelId: "IC_1001", shopId: "100002", facilityGroupId: "FG_1", facilityGroupName: "Retail Aggregate", shopifyLocationId: "LOC_1", fromDate: 1000 },
      { inventoryChannelId: "IC_1002", shopId: "100002", facilityGroupId: "FG_2", facilityGroupName: "Warehouse Aggregate", shopifyLocationId: "LOC_2", fromDate: 1000 },
      // Shares the first channel's name on purpose: this is the case the option object exists for.
      { inventoryChannelId: "IC_1003", shopId: "100002", facilityGroupId: "FG_3", facilityGroupName: "Retail Aggregate", shopifyLocationId: "LOC_3", fromDate: 1000 },
    ];
  });

  /**
   * Read off the option ELEMENTS and compare exactly. A `toContain` against the page text passes even
   * when the object is rendered, because the label it should have printed is inside that JSON.
   */
  const labelFor = (wrapper: VueWrapper, value: string) => wrapper.findAllComponents({ name: "IonSelectOption" })
    .find((option) => String(option.props("value") ?? "") === value)?.text();

  it("labels each option with the channel name, not the option object", async () => {
    const wrapper = await mountHistory();

    expect(labelFor(wrapper, "IC_1002")).toBe("Warehouse Aggregate");
  });

  it("appends the id to a name two channels share", async () => {
    const wrapper = await mountHistory();

    expect(labelFor(wrapper, "IC_1001")).toBe("Retail Aggregate (IC_1001)");
    expect(labelFor(wrapper, "IC_1003")).toBe("Retail Aggregate (IC_1003)");
  });
});
