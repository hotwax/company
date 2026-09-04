// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const cachedJobs = ref<any[]>([]);
const cachedChannels = ref<any[]>([]);
const cachedShops = ref<any[]>([]);
const cachedDataFeeds = ref<any[]>([]);
const cachedAdjustmentDetails = ref<any[]>([]);
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
  showToast: vi.fn(),
  push: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: harness.push,
  }),
  useRoute: () => ({
    params: { id: "100002" },
    query: {},
  }),
}));

vi.mock("@common", () => ({
  useProducts: () => ({ products: ref(new Map()), resolve: vi.fn(), reset: vi.fn() }),
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
  SHOPIFY_INVENTORY_EVENT_FEED_MANUAL: "manual",
  SHOPIFY_INVENTORY_EVENT_FEED_PUSH: "push",
  ABSOLUTE_CHANNEL_RESET_SERVICE: "co.hotwax.sob.product.InventoryServices.post#InventoryChannelInventory",
  DISCARD_PENDING_EVENTS_SERVICE: "co.hotwax.sob.product.InventoryServices.cancel#PendingShopifyInventoryAdjustmentEvents",
  PRODUCED_SENDER_SERVICE: "org.moqui.impl.SystemMessageServices.send#AllProducedSystemMessages",
  INVENTORY_ADJUSTMENT_MESSAGE_TYPE: "ShopifyInventoryAdjustment",
  ensureChannelEventDiscardJob: (...args: any[]) => harness.ensureChannelEventDiscardJob(...args),
  ensureChannelEventPublisherJob: (...args: any[]) => harness.ensureChannelEventPublisherJob(...args),
  ensureChannelResetJob: (...args: any[]) => harness.ensureChannelResetJob(...args),
  ensureInventoryAdjustmentSenderJob: (...args: any[]) => harness.ensureInventoryAdjustmentSenderJob(...args),
  ensureShopPhysicalInventoryResetJob: (...args: any[]) => harness.ensureShopPhysicalInventoryResetJob(...args),
  setInventoryEventDocumentAttached: vi.fn(),
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
    harness.ensureChannelResetJob.mockReset();
    harness.showToast.mockReset();
    harness.push.mockReset();
  });

  it("surfaces each channel's own jobs on that channel's card", async () => {
    cachedJobs.value = [
      {
        jobName: "reset_InventoryChannelInventory_IC_1001",
        serviceName: "co.hotwax.sob.product.InventoryServices.post#InventoryChannelInventory",
        paused: "N",
        cronExpression: "0 0 2 * * ?",
        serviceJobParameters: [
          { parameterName: "inventoryChannelId", parameterValue: "IC_1001" },
        ],
      },
      {
        jobName: "reset_InventoryChannelInventory_IC_1002",
        serviceName: "co.hotwax.sob.product.InventoryServices.post#InventoryChannelInventory",
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
        serviceName: "co.hotwax.sob.product.InventoryServices.post#InventoryChannelInventory",
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

describe("ShopifyInventorySync - the pipeline never claims all-clear over unreadable data", () => {
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

  const allClearText = [
    "Every recorded event has been claimed into a batch or settled.",
    "Every batch produced for this connection has reached Shopify.",
    "No event has produced a summed delta the publisher had to refuse.",
  ];

  beforeEach(() => {
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedAdjustmentDetails.value = [];
    cachedMessages.value = [];
    cachedChannels.value = [];
  });

  it("says the sections are all clear when the ledger really is readable and empty", async () => {
    const wrapper = await mountHistory();

    for(const claim of allClearText) {
      expect(wrapper.text()).toContain(claim);
    }
    expect(wrapper.text()).not.toContain("Not loaded");
  });

  it("makes no all-clear claim before the ledger cache has hydrated", async () => {
    detailsHydrated.value = false;
    const wrapper = await mountHistory();

    for(const claim of allClearText) {
      expect(wrapper.text()).not.toContain(claim);
    }
    expect(wrapper.text()).toContain("Not loaded");
  });

  it("makes no all-clear claim when the sync reported an error, and shows the banner in this view", async () => {
    syncError.value = "inventoryAdjustmentDetails returned 500";
    const wrapper = await mountHistory();

    for(const claim of allClearText) {
      expect(wrapper.text()).not.toContain(claim);
    }
    // The banner used to live inside the monitor template, so the history route never showed it.
    expect(wrapper.text()).toContain("Inventory data could not be loaded from the OMS");
    expect(wrapper.text()).toContain("inventoryAdjustmentDetails returned 500");
  });

  it("keeps a rejected batch on the page instead of dropping it out of every section", async () => {
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

    expect(wrapper.text()).toContain("BATCH_REJECTED");
    expect(wrapper.text()).toContain("The sender will not retry this batch");
    expect(wrapper.text()).not.toContain("Every batch produced for this connection has reached Shopify.");
  });
});

describe("ShopifyInventorySync - a group summarises the rows it actually holds", () => {
  const PUBLISH_SERVICE = "co.hotwax.sob.product.InventoryServices.publish#PendingShopifyInventoryAdjustments";

  const publisherJob = (channelId: string, groupByFields?: string) => ({
    jobName: `publish_PendingShopifyInventoryAdjustments_${channelId}`,
    serviceName: PUBLISH_SERVICE,
    paused: "N",
    serviceJobParameters: [
      { parameterName: "inventoryChannelId", parameterValue: channelId },
      ...(groupByFields ? [{ parameterName: "groupByFields", parameterValue: groupByFields }] : []),
    ],
  });

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
    cachedJobs.value = [publisherJob("IC_1001")];
    cachedChannels.value = [{
      inventoryChannelId: "IC_1001", shopId: "100002", facilityGroupId: "FG_1",
      facilityGroupName: "Retail Channel", shopifyLocationId: "LOC_1", fromDate: 1000,
    }];
  });

  /**
   * A filter that matches part of a group changes what that group would publish, so its summed entries
   * and count have to be restated. Left whole, the card showed a delta for rows the filter had hidden.
   */
  it("restates a partially matched group's count and summed delta from the matching rows", async () => {
    cachedAdjustmentDetails.value = [
      pendingRow({ eventReferenceId: "R_KEEP" }),
      pendingRow({ eventReferenceId: "R_HIDE" }),
    ];
    const wrapper = await mountHistory();

    // Both rows group together, so the card speaks for two events and a summed +2.
    expect(wrapper.text()).toContain("2 events");
    expect(wrapper.text()).toContain("+2");

    wrapper.findComponent({ name: "IonSearchbar" }).vm.$emit("update:modelValue", "R_KEEP");
    await flushPromises();

    expect(wrapper.text()).toContain("1 events");
    expect(wrapper.text()).toContain("+1");
    expect(wrapper.text()).not.toContain("+2");
  });

  /**
   * `groupByFields` is a parameter on each channel's OWN drain job. Applying the first configured job's
   * grouping to every channel previewed one of them the way its own publisher will not batch it.
   */
  it("groups each channel by its own publisher job's groupByFields", async () => {
    cachedChannels.value = [
      { inventoryChannelId: "IC_1001", shopId: "100002", facilityGroupId: "FG_1", facilityGroupName: "Splits By Type", shopifyLocationId: "LOC_1", fromDate: 1000 },
      { inventoryChannelId: "IC_1002", shopId: "100002", facilityGroupId: "FG_2", facilityGroupName: "Mixes Types", shopifyLocationId: "LOC_2", fromDate: 1000 },
    ];
    cachedJobs.value = [
      // Keeps event type in the boundary: two event types stay in two groups.
      publisherJob("IC_1001", "inventoryChannelId,shopifyInventoryItemId,eventTypeId"),
      // Drops it: the same two event types land in ONE group and must publish under correction.
      publisherJob("IC_1002", "inventoryChannelId,shopifyInventoryItemId"),
    ];
    cachedAdjustmentDetails.value = [
      pendingRow({ inventoryChannelId: "IC_1001", eventReferenceId: "A1", eventTypeId: "RECEIPT" }),
      pendingRow({ inventoryChannelId: "IC_1001", eventReferenceId: "A2", eventTypeId: "POS_ISSUANCE" }),
      pendingRow({ inventoryChannelId: "IC_1002", eventReferenceId: "B1", eventTypeId: "RECEIPT" }),
      pendingRow({ inventoryChannelId: "IC_1002", eventReferenceId: "B2", eventTypeId: "POS_ISSUANCE" }),
    ];
    const wrapper = await mountHistory();

    // Only the channel that dropped event type reports a mixed group.
    expect(wrapper.text()).toContain("2 event types mixed");
    expect(wrapper.text().match(/2 event types mixed/g)?.length).toBe(1);
    // And the warning names only the fields of the channel that actually drops it.
    expect(wrapper.text()).toContain("Batches can mix event types");
  });
});
