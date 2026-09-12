// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, onMounted, ref } from "vue";

const harness = vi.hoisted(() => ({
  shop: {} as any,
  histories: [] as any[],
  returningViewProps: null as any,
}));

vi.mock("@common", () => ({
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string, parameters: Record<string, unknown> = {}) => Object.entries(parameters)
    .reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), key),
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (callback: () => unknown) => onMounted(callback),
}));

vi.mock("@/router", () => ({
  default: { currentRoute: ref({ query: {} }), push: vi.fn(), replace: vi.fn() },
}));

vi.mock("@/store/user", () => ({
  useUserStore: () => ({ hasPermission: () => true, getUserProfile: {} }),
}));

vi.mock("@/utils", () => ({
  downloadTextFile: vi.fn(),
  formatDateTime: (value: unknown) => String(value ?? ""),
  getDownloadFileContent: vi.fn(),
  parseDateTimeValue: (value: unknown) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
}));

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

vi.mock("@/composables/useSeed", () => ({
  useStatuses: () => ({ statusItems: ref({}) }),
}));

vi.mock("@/composables/useProductStores", () => ({
  useProductStores: () => ({ productStores: ref([{ productStoreId: "STORE", storeName: "Store" }]) }),
  useProductStoreMutations: () => ({ updateStore: vi.fn() }),
}));

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJob: () => ({
    products: ref([]),
    fetchJobDetail: vi.fn(),
    fetchJobRuns: vi.fn(),
    fetchJobAuditHistory: vi.fn(),
    updateJob: vi.fn(),
    runNow: vi.fn(),
  }),
  useServiceJobs: () => ({ jobs: ref([]) }),
  useServiceJobRunsByJob: () => ({ runsFor: () => [] }),
}));

vi.mock("@/composables/useDataManager", () => ({
  useDataManager: () => ({
    downloadDataManagerFile: vi.fn(),
    fetchLogDetails: vi.fn(),
    currentMdmLog: ref(null),
    errorLogs: ref([]),
    fetchAllRecentFailedRecords: vi.fn(),
    clearStorage: vi.fn(),
    loading: ref(false),
  }),
  useRecentDataManagerLogs: () => ({ logs: ref([]) }),
}));

vi.mock("@/composables/useProductUpdateHistory", () => ({
  useProductUpdateHistories: () => ({ productUpdateHistories: computed(() => harness.histories) }),
}));

vi.mock("@/composables/useShopify", () => ({
  PRODUCT_SYNC_FEATURE: { id: "product" },
  PRODUCT_SYNC_RUN_WINDOW: 5,
  productSyncExtraDomains: () => [],
  syncFeatureDomains: () => [],
  cancelSystemMessage: vi.fn(),
  configureProductSyncJob: vi.fn(),
  fetchPreflight: vi.fn().mockResolvedValue({}),
  fetchRecentlyUpdatedShopifyProducts: vi.fn().mockResolvedValue([]),
  fetchReviewStats: vi.fn().mockResolvedValue({ loaded: true }),
  fetchRunningBulkOperation: vi.fn().mockResolvedValue(null),
  fetchSetupState: vi.fn().mockResolvedValue({
    completed: true,
    syncJobId: "",
    selectedProductStoreId: "STORE",
    selectedIdentifierEnumId: "SHOPIFY_PROD_SKU",
    productStoreLocked: true,
    hasLinkedOmsProducts: true,
  }),
  fetchShopifyShopProductCount: vi.fn().mockResolvedValue(0),
  fetchShopSystemMessageRemoteId: vi.fn().mockResolvedValue(""),
  fetchSyncJobConfig: vi.fn().mockResolvedValue({}),
  fetchUnsyncedProductUpdates: vi.fn().mockResolvedValue([]),
  fetchUpdateFilesToProcessCount: vi.fn().mockResolvedValue(0),
  fetchWebhookSubscriptions: vi.fn().mockResolvedValue([]),
  searchShopifyProducts: vi.fn().mockResolvedValue([]),
  subscribeWebhook: vi.fn(),
  syncShopifyProducts: vi.fn(),
  syncShopifyProductsOnDemand: vi.fn(),
  unsubscribeWebhook: vi.fn(),
  useShopifyProductSyncRun: () => ({ currentSyncRun: ref(null), fetchSyncRun: vi.fn(), clearSyncRun: vi.fn() }),
  useShopifyProductSyncRunState: () => ({
    runState: ref({ systemMessages: [], latestSystemMessage: null, latestConfirmedSystemMessage: null, latestConsumedSystemMessage: null, lastSyncedAt: "" }),
    pendingRequests: ref(0),
  }),
  useShopifyShop: () => ({ record: computed(() => harness.shop) }),
  useShopifyShopMutations: () => ({ updateShop: vi.fn() }),
  useShopifyShops: () => ({ shops: ref([{ shopId: "1000" }]), hydrated: ref(true) }),
}));

vi.mock("@/components/ShopifyProductMappingsModal.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/shopify-product-sync/ShopifyProductSyncWizardView.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/common/ServiceJobDetailsModal.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/common/SystemMessageDetailsModal.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/common/AnimatedDuration.vue", () => ({ default: { template: "<div />" } }));

// The recent-sync rows are handed to the returning view as props, so the link each row carries can
// be read without rendering that whole surface.
vi.mock("@/components/shopify-product-sync/ShopifyProductSyncReturningView.vue", () => ({
  default: {
    name: "ShopifyProductSyncReturningView",
    inheritAttrs: false,
    props: { recentSyncUpdates: { type: Array, default: () => [] } },
    setup(props: any) {
      harness.returningViewProps = props;
      return () => null;
    },
  },
}));

const VARIANT_HISTORY = {
  shopId: "1000",
  parentProductId: "4604788917",
  productId: "5501234567",
  identifications: { shopifyVariantId: "5501234567" },
  lastUpdatedStamp: "1787700000000",
  details: [],
};

async function mountProductSync(shop: any, histories: any[]) {
  harness.shop = shop;
  harness.histories = histories;
  harness.returningViewProps = null;

  const ShopifyProductSync = (await import("@/views/ShopifyProductSync.vue")).default;
  const wrapper = mount(ShopifyProductSync, {
    props: { id: "1000" },
    global: {
      // The SFC never imports IonCardSubtitle — Ionic registers it globally in the app — and
      // IonBackButton wants a router nav manager this mount has no use for.
      components: { "ion-card-subtitle": { template: "<div><slot /></div>" } },
      stubs: { IonBackButton: true, teleport: true },
    },
  });
  await flushPromises();
  await flushPromises();

  return wrapper;
}

function adminUrls() {
  return (harness.returningViewProps?.recentSyncUpdates || []).map((row: any) => row.shopifyAdminUrl);
}

describe("ShopifyProductSync - Shopify admin product link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links a recent sync row at the variant in the admin of a real shop host", async () => {
    await mountProductSync(
      { shopId: "1000", productStoreId: "STORE", myshopifyDomain: "rails-paris.myshopify.com" },
      [VARIANT_HISTORY],
    );

    expect(adminUrls()).toEqual(["https://rails-paris.myshopify.com/admin/products/4604788917/variants/5501234567"]);
  });

  // myshopifyDomain is operator input the connection form only checks for non-emptiness, so a row
  // carries no link at all when the stored host is not a shop.
  it("carries no link when the stored shop domain is not a shop host", async () => {
    await mountProductSync(
      { shopId: "1000", productStoreId: "STORE", myshopifyDomain: "evil.com" },
      [VARIANT_HISTORY],
    );

    expect(adminUrls()).toEqual([""]);
  });

  it("carries no link when the row names no Shopify product", async () => {
    const shop = { shopId: "1000", productStoreId: "STORE", myshopifyDomain: "rails-paris.myshopify.com" };

    // "0" is digits, so it survives the view's own gid-to-numeric reduction and it is the shared
    // guard that has to reject it as a record that cannot exist.
    await mountProductSync(shop, [{ ...VARIANT_HISTORY, parentProductId: "", productId: "0", identifications: {} }]);
    expect(adminUrls()).toEqual([""]);

    await mountProductSync(shop, [{ ...VARIANT_HISTORY, parentProductId: "", productId: "not-a-number", identifications: {} }]);
    expect(adminUrls()).toEqual([""]);
  });
});
