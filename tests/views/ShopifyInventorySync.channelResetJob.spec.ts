// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const cachedJobs = ref<any[]>([]);
const cachedChannels = ref<any[]>([]);
const cachedShops = ref<any[]>([]);
const cachedDataFeeds = ref<any[]>([]);
const cachedAdjustmentDetails = ref<any[]>([]);
const cachedLocationDetails = ref<any[]>([]);
const cachedMessages = ref<any[]>([]);
const cachedGroupFacilities = ref<any[]>([]);
const cachedInventoryEventDocuments = ref<any[]>([]);
const inventoryEventDocumentsHydrated = ref(true);
const groupFacilitiesHydrated = ref(true);
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
  saveFacilityGroupMembers: vi.fn(),
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

// The ledgers are polled by the inventory sync area, not by this view, so the view only reads its health.
vi.mock("@/services/inventorySyncArea", () => ({
  useInventorySyncArea: () => ({
    ready: syncReady,
    error: syncError,
    failingDomains: ref({}),
    busy: ref(false),
    manualRefreshing: ref(false),
    syncNow: vi.fn(),
    afterMutation: vi.fn(),
  }),
}));

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    ready: syncReady,
    error: syncError,
    failingDomains: ref({}),
    afterMutation: vi.fn(),
  }),
}));

vi.mock("@/composables/useFacilities", () => ({
  useFacilityTypes: () => ({ facilityTypes: ref([]) }),
  useFacilities: () => ({ facilities: ref([]), hydrated: ref(true) }),
  useFacilityGroupMutations: (facilityGroupId: string) => ({
    saveMembers: (...args: any[]) => harness.saveFacilityGroupMembers(facilityGroupId, ...args),
  }),
}));

/**
 * The shape `useCachedList` really hands back: `records` are the server objects, `rows` the cached
 * rows that carry them in `raw` beside their projected key. The inventory event model reads `rows`, so a
 * stub that passed the records through as rows would feed it objects with no `raw` at all.
 */
function asCachedRows(records: { value: any[] }) {
  return computed(() => records.value.map((raw: any) => ({
    ...raw,
    adjustmentKey: raw.adjustmentKey ?? [raw.eventTypeId, raw.eventReferenceId, raw.inventoryChannelId, raw.shopifyInventoryItemId].join("|"),
    locationAdjustmentKey: raw.locationAdjustmentKey ?? [raw.eventTypeId, raw.eventReferenceId, raw.shopId, raw.shopifyLocationId, raw.shopifyInventoryItemId].join("|"),
    raw,
    cachedAt: raw.cachedAt ?? 0,
  })));
}

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
      return { records: cachedAdjustmentDetails, rows: asCachedRows(cachedAdjustmentDetails), hydrated: detailsHydrated };
    }
    if(table.includes("shopifyLocationInventoryAdjustmentDetail") || table.includes("ShopifyLocationInventoryAdjustmentDetail")) {
      return { records: cachedLocationDetails, rows: asCachedRows(cachedLocationDetails), hydrated: ref(true) };
    }
    if(table.includes("groupFacilities") || table.includes("GroupFacility")) {
      return { records: cachedGroupFacilities, rows: cachedGroupFacilities, hydrated: groupFacilitiesHydrated };
    }
    if(table.includes("systemMessage") || table.includes("SystemMessage")) {
      return { records: cachedMessages, rows: asCachedRows(cachedMessages), hydrated: ref(true) };
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
    ensureSystemMessageById: vi.fn().mockResolvedValue(null),
    ensureSystemMessageErrors: vi.fn().mockResolvedValue([]),
    resendSystemMessage: vi.fn(),
    useRecentSystemMessages: () => ({ messages: ref([]), hydrated: ref(true) }),
  }),
}));

vi.mock("@/composables/useShopify", () => ({
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
    documents: cachedInventoryEventDocuments,
    hydrated: inventoryEventDocumentsHydrated,
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

  it.each([undefined, 1000])("retains an active job's cadence when its cached next run is %s", async (nextExecutionDateTime) => {
    cachedJobs.value = [{
      jobName: 'purge_OldShopifyInventoryAdjustmentDetails_hourly',
      serviceName: 'co.hotwax.sob.product.InventoryServices.purge#OldShopifyInventoryAdjustmentDetails',
      paused: 'N', cronExpression: '0 0 * * * ?', cronString: 'Every hour', nextExecutionDateTime,
    }];
    const View = (await import('@/views/ShopifyInventorySync.vue')).default;
    const wrapper = mount(View, { props: { id: '100002' }, global: { stubs: { IonModal: true, ServiceJobDetailsModal: true } } });
    await flushPromises();
    const row = wrapper.findAll('ion-item').find(item => item.text().includes('Purge old channel events (all shops)'))!;
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
    for (const [label, jobName] of [['Purge old channel events', 'AGGREGATE_RETENTION'], ['Purge old physical events', 'PHYSICAL_RETENTION']]) {
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
      .filter((card) => card.text().includes("Reset channel ATP"));
    expect(channelCards.length).toBe(2);

    expect(channelCards[0].text()).toContain("Retail Channel");
    expect(channelCards[1].text()).toContain("Wholesale Channel");

    // Resolved independently rather than collapsed onto the first job: IC_1001 is active and
    // IC_1002 is paused in the fixture above.
    expect(channelCards[0].text()).toContain("Active");
    expect(channelCards[1].text()).toContain("Paused");

    // The publisher is grouped with it, on the same card.
    channelCards.forEach((card) => {
      expect(card.text()).toContain("Send channel batches");
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
      .find((item) => item.text().includes("Reset channel ATP") && item.text().includes("Active"));
    expect(resetRow).toBeDefined();

    await resetRow!.trigger("click");
    await flushPromises();

    const modal = wrapper.find("[data-testid='service-job-modal']");
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("Reset channel ATP");
    expect(modal.text()).toContain("Retail Channel");
    expect(modal.text()).toContain("reset_InventoryChannelInventory_IC_1001");
  });

  it("keeps a physical ATP setup failure visible and scopes setup to the current shop", async () => {
    harness.ensureShopPhysicalAtpResetJob.mockRejectedValue(new Error("Physical ATP reset setup is missing."));
    const View = (await import("@/views/ShopifyInventorySync.vue")).default;
    const wrapper = mount(View, { props: { id: "100002" }, global: { stubs: { IonModal: true, ServiceJobDetailsModal: true, EditInventoryChannelModal: true, SetupInventoryChannelModal: true } } });
    await flushPromises();
    const row = wrapper.findAll("ion-item").find(item => item.text().includes("Reset physical ATP (this shop)"));
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
      .find((card) => card.text().includes("Wholesale Channel") && card.text().includes("Reset channel ATP"));
    expect(wholesaleCard).toBeDefined();

    // Scope to the reset ROW, not the card: cachedJobs is empty here, so the publisher row offers a
    // Set up of its own and the card's first one is not the one under test.
    const resetRow = wholesaleCard!.findAll("ion-item")
      .find((item) => item.text().includes("Reset channel ATP"));
    expect(resetRow).toBeDefined();

    const setUpButton = resetRow!.findAll("ion-button").find((b) => b.text().includes("Set up"));
    expect(setUpButton).toBeDefined();

    await setUpButton!.trigger("click");
    await flushPromises();

    expect(harness.ensureChannelResetJob).toHaveBeenCalledWith({
      inventoryChannelId: "IC_1002",
      description: "Full channel ATP reset for Wholesale Channel",
    });

    // Creating from a single channel's row lands in that job's modal, which is the one thing the
    // removed button did that Set up alone did not.
    const modal = wrapper.find("[data-testid='service-job-modal']");
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("Reset channel ATP - Wholesale Channel");
    expect(modal.text()).toContain("reset_InventoryChannelInventory_IC_1002");
  });
}, 20000);

/**
 * The discard job's channel parameter is a dropdown of channel names. Two channels can share a facility
 * group name, so a repeated label carries the id that tells the options apart; the value is the id
 * either way. Rendering the option object instead of its label is legal Vue and prints JSON, so this
 * reads the option labels the job modal is handed.
 */
describe("ShopifyInventorySync - the discard job's channel choices", () => {
  beforeEach(() => {
    vi.resetModules();
    cachedJobs.value = [{
      jobName: "cancel_PendingShopifyInventoryAdjustmentEvents",
      serviceName: "co.hotwax.sob.product.InventoryServices.cancel#PendingShopifyInventoryAdjustmentEvents",
      paused: "Y",
    }];
    cachedAdjustmentDetails.value = [];
    cachedChannels.value = [
      { inventoryChannelId: "IC_1001", shopId: "100002", facilityGroupId: "FG_1", facilityGroupName: "Retail Aggregate", shopifyLocationId: "LOC_1", fromDate: 1000 },
      { inventoryChannelId: "IC_1002", shopId: "100002", facilityGroupId: "FG_2", facilityGroupName: "Warehouse Aggregate", shopifyLocationId: "LOC_2", fromDate: 1000 },
      // Shares the first channel's name on purpose: this is the case the option labels exist for.
      { inventoryChannelId: "IC_1003", shopId: "100002", facilityGroupId: "FG_3", facilityGroupName: "Retail Aggregate", shopifyLocationId: "LOC_3", fromDate: 1000 },
    ];
  });

  it("labels each channel by name and appends the id to a name two channels share", async () => {
    const { default: ShopifyInventorySync } = await import("@/views/ShopifyInventorySync.vue");
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002" },
      global: { stubs: { IonModal: true, ServiceJobDetailsModal: true, EditInventoryChannelModal: true, SetupInventoryChannelModal: true } },
    });
    await flushPromises();

    const row = wrapper.findAll("ion-item").find((item) => item.text().includes("Discard unbatched channel events (manual)"))!;
    await row.trigger("click");
    await flushPromises();

    const options = wrapper.findComponent({ name: "ServiceJobDetailsModal" }).props("parameterOptions").inventoryChannelId;
    expect(options).toEqual([
      { value: "IC_1001", label: "Retail Aggregate (IC_1001)" },
      { value: "IC_1002", label: "Warehouse Aggregate" },
      { value: "IC_1003", label: "Retail Aggregate (IC_1003)" },
    ]);
    wrapper.unmount();
  });
});

describe("ShopifyInventorySync - shared jobs location groups", () => {
  beforeEach(() => {
    vi.resetModules();
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedJobs.value = [];
    cachedChannels.value = [];
    cachedShops.value = [{ shopId: "100002", name: "Shopify Store", inventoryFeedType: "manual" }];
    cachedMessages.value = [];
    cachedAdjustmentDetails.value = [];
  });

  it("renders shared channel and physical jobs in their event summary cards", async () => {
    const { default: ShopifyInventorySync } = await import("@/views/ShopifyInventorySync.vue");
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002" },
      global: {
        stubs: {
          IonModal: true,
          ServiceJobDetailsModal: true,
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    const cards = wrapper.findAll("ion-card");
    const channelCard = cards.find((item) => item.text().includes("Channel inventory events"))!;
    const physicalCard = cards.find((item) => item.text().includes("Physical inventory events"))!;
    const channelGroup = channelCard.find("ion-item-group");
    const physicalGroup = physicalCard.find("ion-item-group");
    const channelJobs = channelGroup.findAll("ion-item").map((row) => row.text().trim());
    const physicalJobs = physicalGroup.findAll("ion-item").map((row) => row.text().trim());

    expect(wrapper.text()).not.toContain("Manage scheduling of inventory sync with Shopify");
    expect(channelCard.findAll("ion-item-group")).toHaveLength(1);
    expect(physicalCard.findAll("ion-item-group")).toHaveLength(1);
    expect(channelGroup.find("ion-item-divider").text().trim()).toBe("Jobs");
    expect(physicalGroup.find("ion-item-divider").text().trim()).toBe("Jobs");
    expect(channelJobs).toHaveLength(6);
    expect(physicalJobs).toHaveLength(4);
    expect(channelJobs.join(" ")).toContain("Publish channel batches");
    expect(channelJobs.join(" ")).toContain("Purge old channel events");
    expect(channelJobs.join(" ")).toContain("Apply effective-dated inventory changes");
    expect(channelJobs.join(" ")).toContain("Send channel batches");
    expect(physicalJobs.join(" ")).toContain("Reset physical on-hand");
    expect(physicalJobs.join(" ")).toContain("Purge old physical events");
    expect(channelJobs.join(" ")).not.toContain("Reset physical on-hand");
    expect(physicalJobs.join(" ")).not.toContain("Send channel batches");
    expect([...channelJobs, ...physicalJobs]).toHaveLength(10);
    wrapper.unmount();
  });
});

describe("ShopifyInventorySync - channel facilities", () => {
  beforeEach(() => {
    vi.resetModules();
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedJobs.value = [];
    cachedChannels.value = [{
      inventoryChannelId: "IC_1001",
      shopId: "100002",
      facilityGroupId: "FG_1",
      facilityGroupName: "Retail Aggregate",
      description: "Retail Aggregate aggregate inventory",
      shopifyLocationId: "LOC_1",
      fromDate: 1000,
    }];
    cachedShops.value = [{ shopId: "100002", name: "Shopify Store" }];
    cachedDataFeeds.value = [{ dataFeedId: "ShopifyInventoryEventFeed", dataFeedTypeEnumId: "push" }];
    cachedGroupFacilities.value = [{
      facilityGroupId: "FG_1",
      facilityId: "STORE_1",
      facilityName: "Store One",
      facilityTypeId: "STORE",
      fromDate: 1000,
      sequenceNum: 7,
    }];
    cachedInventoryEventDocuments.value = [{
      dataDocumentId: "ShopifyFacilityGroupMemberEvent",
      channelAttached: true,
      missing: false,
    }];
    inventoryEventDocumentsHydrated.value = true;
    groupFacilitiesHydrated.value = true;
    cachedMessages.value = [];
    cachedAdjustmentDetails.value = [];
    harness.showToast.mockReset();
    harness.saveFacilityGroupMembers.mockReset().mockResolvedValue({ failed: false });
  });

  const mountMonitor = async () => {
    const { default: ShopifyInventorySync } = await import("@/views/ShopifyInventorySync.vue");
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002" },
      global: {
        stubs: {
          IonModal: true,
          ServiceJobDetailsModal: true,
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();
    return wrapper;
  };

  it("shows the group once and saves facility changes from the member row", async () => {
    const overlay = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ data: {
        value: {
          facilitiesToAdd: [{ facilityId: "STORE_2" }],
          facilitiesToRemove: [{ facilityId: "STORE_1", fromDate: 1000 }],
        },
      } }),
    };
    const { modalController } = await import("@ionic/vue");
    const createModal = vi.spyOn(modalController, "create").mockResolvedValue(overlay as any);
    const wrapper = await mountMonitor();
    const channelCard = wrapper.findAll("ion-card").find((card) => card.text().includes("Facilities"))!;

    expect(channelCard.text()).toContain("Retail Aggregate");
    expect(channelCard.text()).not.toContain("Retail Aggregate aggregate inventory");
    expect(channelCard.text()).not.toContain("Retail Aggregate, Shopify Store");

    const memberRow = channelCard.findAll("ion-item").find((row) => row.text().includes("Facilities"))!;
    await memberRow.trigger("click");
    await flushPromises();

    expect(createModal).toHaveBeenCalledOnce();
    const modalOptions = createModal.mock.calls[0][0] as any;
    expect(modalOptions.componentProps.selectedFacilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ facilityId: "STORE_1", facilityName: "Store One", fromDate: 1000 }),
    ]));
    expect(modalOptions.componentProps.bannerTitle).toBe("Shopify group-member updates");
    expect(modalOptions.componentProps.bannerMessage).toContain("set to real-time push");
    expect(modalOptions.componentProps.bannerColor).toBe("success");
    expect(harness.saveFacilityGroupMembers).toHaveBeenCalledWith("FG_1", [
      { facilityId: "STORE_2", fromDate: expect.any(Number), sequenceNum: 8 },
    ], [
      { facilityId: "STORE_1", fromDate: 1000, thruDate: expect.any(Number) },
    ]);
    expect(harness.showToast).toHaveBeenCalledWith("Facilities updated");

    wrapper.unmount();
    createModal.mockRestore();
  });

  it.each([
    {
      attached: false,
      feedType: "push",
      message: "Facility group changes are not being captured for Shopify",
    },
    {
      attached: true,
      feedType: "manual",
      message: "not set to real-time push",
    },
  ])("explains when group-member updates are not real-time (attached=$attached, mode=$feedType)", async ({ attached, feedType, message }) => {
    cachedInventoryEventDocuments.value = [{
      dataDocumentId: "ShopifyFacilityGroupMemberEvent",
      channelAttached: attached,
      missing: false,
    }];
    cachedDataFeeds.value = [{ dataFeedId: "ShopifyInventoryEventFeed", dataFeedTypeEnumId: feedType }];
    const overlay = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ data: undefined }),
    };
    const { modalController } = await import("@ionic/vue");
    const createModal = vi.spyOn(modalController, "create").mockResolvedValue(overlay as any);
    const wrapper = await mountMonitor();
    const channelCard = wrapper.findAll("ion-card").find((card) => card.text().includes("Facilities"))!;
    const memberRow = channelCard.findAll("ion-item").find((row) => row.text().includes("Facilities"))!;

    await memberRow.trigger("click");
    await flushPromises();

    expect((createModal.mock.calls[0][0] as any).componentProps.bannerMessage).toContain(message);
    expect((createModal.mock.calls[0][0] as any).componentProps.bannerColor).toBe("warning");
    expect(harness.saveFacilityGroupMembers).not.toHaveBeenCalled();

    wrapper.unmount();
    createModal.mockRestore();
  });
});

describe("ShopifyInventorySync - monitor batch carousels", () => {
  const BATCH_COUNT = 25;

  beforeEach(() => {
    vi.resetModules();
    detailsHydrated.value = true;
    syncReady.value = true;
    syncError.value = null;
    cachedJobs.value = [];
    cachedChannels.value = [{
      inventoryChannelId: "IC_1001", shopId: "100002", facilityGroupId: "FG_1",
      facilityGroupName: "Retail Channel", shopifyLocationId: "LOC_1", fromDate: 1000,
    }];
    cachedShops.value = [{ shopId: "100002", name: "Shopify Store", inventoryFeedType: "manual" }];
    cachedMessages.value = [];
    // One batch per row, createdDate ascending, so the newest batch is the last one built.
    cachedAdjustmentDetails.value = Array.from({ length: BATCH_COUNT }, (_, index) => ({
      eventTypeId: "RECEIPT", eventReferenceId: `R${index + 1}`, inventoryChannelId: "IC_1001",
      shopifyInventoryItemId: "ITEM_1",
      systemMessageId: `CH_${index + 1}`, systemMessageStatusId: "SmsgConfirmed",
      computedInventoryChange: 1, createdDate: 1000 + index,
    }));
    cachedLocationDetails.value = Array.from({ length: BATCH_COUNT }, (_, index) => ({
      locationAdjustmentKey: `LOC_ROW_${index + 1}`, shopId: "100002", shopifyLocationId: "LOC_1",
      eventTypeId: "RECEIPT", eventReferenceId: `R${index + 1}`, shopifyInventoryItemId: "ITEM_1",
      systemMessageId: `PL_${index + 1}`, systemMessageStatusId: "SmsgConfirmed",
      computedInventoryChange: 1, createdDate: 1000 + index,
    }));
  });

  afterEach(() => {
    cachedAdjustmentDetails.value = [];
    cachedLocationDetails.value = [];
  });

  it.each([
    { label: "Channel event batches", prefix: "CH_" },
    { label: "Physical location event batches", prefix: "PL_" },
  ])("renders only the 20 newest batches in the $label carousel", async ({ label, prefix }) => {
    const { default: ShopifyInventorySync } = await import("@/views/ShopifyInventorySync.vue");
    const wrapper = mount(ShopifyInventorySync, {
      props: { id: "100002" },
      global: {
        stubs: {
          IonModal: true,
          ServiceJobDetailsModal: true,
          EditInventoryChannelModal: true,
          SetupInventoryChannelModal: true,
        },
      },
    });
    await flushPromises();

    const titles = wrapper.find(`.run-carousel[aria-label="${label}"]`)
      .findAll("ion-card-title").map((title) => title.text().trim());

    expect(titles).toHaveLength(20);
    expect(titles[0]).toBe(`${prefix}${BATCH_COUNT}`);
    expect(titles.at(-1)).toBe(`${prefix}${BATCH_COUNT - 19}`);
    wrapper.unmount();
  });
});
