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

  it("lists each channel's aggregate reset job individually in monitored sync jobs", async () => {
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

    expect(wrapper.text()).toContain("Reset aggregate ATP (Retail Channel)");
    expect(wrapper.text()).toContain("Reset aggregate ATP (Wholesale Channel)");
  });

  it("renders a Schedule reset button and schedule summary on each channel item", async () => {
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

    // Verify Schedule reset buttons exist for channels
    const scheduleButtons = wrapper.findAll("ion-button").filter((b) => b.text().includes("Schedule reset"));
    expect(scheduleButtons.length).toBe(2);

    // Clicking Schedule reset for the existing job opens ServiceJobDetailsModal
    await scheduleButtons[0].trigger("click");
    await flushPromises();

    const modal = wrapper.find("[data-testid='service-job-modal']");
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("Reset aggregate ATP - Retail Channel");
    expect(modal.text()).toContain("reset_InventoryChannelInventory_IC_1001");
  });

  it("provisions the job via ensureChannelResetJob when scheduling a channel without an existing reset job", async () => {
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

    const scheduleButtons = wrapper.findAll("ion-button").filter((b) => b.text().includes("Schedule reset"));
    // Click Schedule reset on the second channel (IC_1002, which has no job in cachedJobs)
    await scheduleButtons[1].trigger("click");
    await flushPromises();

    expect(harness.ensureChannelResetJob).toHaveBeenCalledWith({
      inventoryChannelId: "IC_1002",
      description: "Full aggregate ATP reset for Wholesale Channel",
    });

    const modal = wrapper.find("[data-testid='service-job-modal']");
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain("Reset aggregate ATP - Wholesale Channel");
    expect(modal.text()).toContain("reset_InventoryChannelInventory_IC_1002");
  });
}, 20000);
