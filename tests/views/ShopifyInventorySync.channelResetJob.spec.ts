// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cachedJobs = ref<any[]>([]);
const cachedChannels = ref<any[]>([]);
const cachedShops = ref<any[]>([]);
const cachedDataFeeds = ref<any[]>([]);
const cachedAdjustmentDetails = ref<any[]>([]);
const cachedMessages = ref<any[]>([]);

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
    ready: ref(true),
    error: ref(null),
    afterMutation: vi.fn(),
  }),
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (cache: any) => {
    const table = String(cache?.table || cache?.name || "");
    if (table.includes("shopifyShop") || table.includes("ShopifyShop")) {
      return { records: cachedShops, rows: cachedShops, hydrated: ref(true) };
    }
    if (table.includes("inventoryChannel") || table.includes("InventoryChannel")) {
      return { records: cachedChannels, rows: cachedChannels, hydrated: ref(true) };
    }
    if (table.includes("dataFeed") || table.includes("DataFeed")) {
      return { records: cachedDataFeeds, rows: cachedDataFeeds, hydrated: ref(true) };
    }
    if (table.includes("shopifyInventoryAdjustmentDetail") || table.includes("ShopifyInventoryAdjustmentDetail")) {
      return { records: cachedAdjustmentDetails, rows: cachedAdjustmentDetails, hydrated: ref(true) };
    }
    if (table.includes("systemMessage") || table.includes("SystemMessage")) {
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
            template: `<div data-testid="service-job-modal" v-if="isOpen">{{ title }}: {{ jobName }}</div>`,
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
            template: `<div data-testid="service-job-modal" v-if="isOpen">{{ title }}: {{ jobName }}</div>`,
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
            template: `<div data-testid="service-job-modal" v-if="isOpen">{{ title }}: {{ jobName }}</div>`,
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
