// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { computed, onMounted, reactive, ref } from "vue"

const harness = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  /** The linked connection's OMS-side access scope; read-write is the ordinary case. */
  accessScope: "SHOP_RW_ACCESS",
  productStoreData: null as any,
  shops: null as any,
  shopsHydrated: null as any,
  updateShop: vi.fn(),
  createModal: vi.fn(),
  fetchShopifyShopLocations: vi.fn(),
  updateStore: vi.fn(),
  saveSettings: vi.fn(),
  shopifyLocations: [] as any[],
  landmarkDates: null as any,
  loadOrderLandmarkDates: vi.fn(),
  recordOrderLandmarkDates: vi.fn(),
  initialLoadStatus: null as any,
  initialLoadRequestSource: null as any,
  productSyncRunState: null as any,
  serviceJobs: null as any
}))

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewDidLeave: vi.fn(),
  onIonViewWillEnter: (callback: () => unknown) => onMounted(callback),
  modalController: { create: (...args: any[]) => harness.createModal(...args) }
}))

vi.mock("@common", () => ({
  api: vi.fn().mockResolvedValue({ data: [] }),
  commonUtil: {
    hasError: (response: any) => Boolean(response?.data?._ERROR_MESSAGE_),
    formatDateTime: (value: any) => String(value),
    getProductIdentificationValue: (id: string, product: any) => product?.[id] || id
  },
  DxpShopifyImg: { name: "DxpShopifyImg", template: "<div><slot /></div>" },
  logger: { error: vi.fn(), warn: vi.fn() },
  translate: (key: string, parameters?: Record<string, unknown>) => {
    if(!parameters) {return key}

    return Object.entries(parameters).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      key
    )
  },
  useSolrSearch: () => ({
    searchProducts: vi.fn().mockResolvedValue({
      products: [{ productId: "PROD-1", mainImageUrl: "image.png" }]
    })
  })
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ fullPath: "/product-store-onboarding" }),
  useRouter: () => ({
    push: harness.push,
    replace: harness.replace
  })
}))

// Deliberately NOT mocking @/composables/useProductStoreOnboardingWizard: this spec exists to
// exercise the real draft state, which the sibling spec replaces with a stub whose
// updateDraftField is a plain assignment. That stub is why the generate-id-from-store-name
// regression was invisible to the view suite.


vi.mock("@/composables/useProductStoreOnboardingInitialLoad", () => ({
  useProductStoreOnboardingInitialLoad: (_shopIdSource: unknown, requestSource: unknown) => {
    harness.initialLoadRequestSource = requestSource

    return harness.initialLoadStatus
  }
}))

vi.mock("@/composables/useProductStores", () => ({
  // `useProductStoreData` was merged into this module; the standalone one it used to live in is gone.
  useProductStoreData: () => harness.productStoreData,
  useProductStoreCreation: () => ({ createStore: vi.fn() }),
  useProductStoreMutations: () => ({
    updateStore: harness.updateStore,
    saveSettings: harness.saveSettings,
    addFacility: vi.fn()
  })
}))

vi.mock("@/composables/useShopify", () => ({
  fetchLiveCatalogCounts: vi.fn().mockResolvedValue({ shopifyProductCount: 0 }),
  fetchShopifyShopLocations: (...args: any[]) => harness.fetchShopifyShopLocations(...args),
  useOrderSyncLandmarkDates: () => ({
    landmarkDates: harness.landmarkDates,
    load: harness.loadOrderLandmarkDates,
    record: harness.recordOrderLandmarkDates
  }),
  useShopifyProductSyncRunState: () => ({
    runState: harness.productSyncRunState
  }),
  useShopifyShopMutations: () => ({ updateShop: harness.updateShop }),
  useShopifyShops: () => ({ shops: harness.shops, hydrated: harness.shopsHydrated }),
  // The shop -> SystemMessageRemote join. A ShopifyShop row carries no systemMessageRemoteId, so the
  // view reads it from here; the stub resolves one whenever a shop is linked.
  useShopifySyncContext: (shopIdSource: any) => {
    const shopId = computed(() => String(typeof shopIdSource === "function" ? shopIdSource() : shopIdSource ?? ""));
    const remoteId = computed(() => (shopId.value ? `REMOTE_${shopId.value}` : ""));

    return {
      shop: computed(() => null),
      productStore: computed(() => null),
      // Read-write by default: that is an ordinary connected shop, and every initial load needs it
      // because Shopify bulk queries are GraphQL mutations. Tests that care set harness.accessScope.
      remote: computed(() => (remoteId.value
        ? { systemMessageRemoteId: remoteId.value, accessScopeEnumId: harness.accessScope }
        : null)),
      remoteId,
      remoteIds: computed(() => (remoteId.value ? [remoteId.value] : [])),
      shopId,
      hydrated: computed(() => true)
    };
  }
}))

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobs: () => ({ jobs: harness.serviceJobs }),
  useServiceJobRunsByJob: () => ({ runsFor: () => [] }),
  useServiceJob: () => ({
    fetchJobDetail: vi.fn().mockResolvedValue({}),
    fetchJobRuns: vi.fn().mockResolvedValue([]),
    fetchJobAuditHistory: vi.fn().mockResolvedValue([]),
    updateJob: vi.fn().mockResolvedValue({})
  })
}))

vi.mock("@/composables/useFacilities", () => ({
  useFacilities: () => ({ facilities: ref([]) }),
  // #390 merged useFacilityCreation into useFacilityMutations; the old export no longer exists.
  useFacilityMutations: () => ({ createFacility: vi.fn() })
}))

vi.mock("@/composables/useSeed", () => ({
  useCurrencies: () => ({ currencies: ref([{ uomId: "USD", description: "US Dollar" }]) }),
  useOrganization: () => ({
    organizationPartyId: ref("COMPANY"),
    loadOrganizationPartyId: vi.fn().mockResolvedValue("COMPANY"),
    bootstrapOrganization: vi.fn()
  }),
  useTimeZones: () => ({
    loadTimeZones: vi.fn().mockResolvedValue([{ id: "America/New_York", label: "Eastern Time" }])
  }),
  useTypedEnums: () => ({ values: ref([{ enumId: "SHOPIFY_PRODUCT_SKU", description: "SKU" }]) }),
  useGoodIdentificationTypes: () => ({
    fetchGoodIdentificationTypes: vi.fn().mockResolvedValue([])
  })
}))

function buildProductStoreData() {
  const productStoreData = reactive({
    productStores: [{ productStoreId: "EXISTING" }],
    current: {} as any,
    currentStoreSettings: {} as any,
    currentFacilities: [] as any[],
    currentShopifyJobStatus: null as any,
    fetchStatus: {
      productStoreDetails: "none",
      currentStoreSettings: "none",
      facilities: "none",
      shopifyJobStatus: "none"
    },
    fetchProductStores: vi.fn(),
    fetchCompany: vi.fn(),
    fetchProductStoreDetails: vi.fn(),
    fetchCurrentStoreSettings: vi.fn(),
    fetchProductStoreFacilities: vi.fn(),
    fetchProductStoreShopifyJobStatus: vi.fn(),
    setupProductStoreShopifyProductImport: vi.fn(),
    runProductStoreShopifyProductImport: vi.fn(),
    setupProductStoreShopifyInventoryReset: vi.fn(),
    runProductStoreShopifyInventoryReset: vi.fn(),
    saveProductStoreShopifyOrderDates: vi.fn(),
    setupProductStoreShopifyOrderImport: vi.fn(),
    runProductStoreShopifyOrderHistoryImport: vi.fn()
  })
  productStoreData.fetchProductStoreShopifyJobStatus.mockImplementation(() =>
    Promise.resolve(productStoreData.currentShopifyJobStatus))

  return productStoreData
}

function initialLoadSnapshot(kind: "products" | "inventory" | "orders", status = "not-started") {
  return {
    kind,
    hydrated: true,
    run: { status, summary: "No sync request has been produced yet.", stages: [] },
    details: {
      route: kind === "products"
        ? "/shopify-connection-details/SHOP/product-sync"
        : kind === "orders"
          ? "/shopify-connection-details/SHOP/order-sync/history"
          : null,
      systemMessageId: "",
      bulkOperationId: "",
      logId: "",
      configId: kind === "products" ? "SYNC_SHOPIFY_PRODUCT" : kind === "inventory"
        ? "RESET_SHOPIFY_INVENTORY" : "BULK_ORDER_HISTORY",
      jobRunId: ""
    }
  }
}

function buildInitialLoadStatus() {
  return {
    products: ref(initialLoadSnapshot("products")),
    inventory: ref(initialLoadSnapshot("inventory")),
    orders: ref(initialLoadSnapshot("orders")),
    refreshing: ref(false),
    activate: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined)
  }
}

function completePersistedStore(productStoreId: string, overrides: Record<string, unknown> = {}) {
  return {
    productStoreId,
    storeName: `${productStoreId} Store`,
    defaultCurrencyUomId: "USD",
    defaultLocaleString: "en_US",
    defaultTimeZoneString: "America/New_York",
    autoApproveOrder: "N",
    orderNumberPrefix: "HC",
    ...overrides
  }
}

async function mountView(props: Record<string, unknown> = {}) {
  const View = (await import("@/views/ProductStoreOnboarding.vue")).default
  const wrapper = mount(View, {
    props,
    global: {
      stubs: {
        IonBackButton: true,
        IonContent: { template: "<div><slot /></div>" },
        IonIcon: true,
        AnimatedNumber: { name: "AnimatedNumber", template: "<span><slot /></span>" },
        ServiceJobDetailsModal: {
          name: "ServiceJobDetailsModal",
          props: ["isOpen", "jobName", "title"],
          template: "<div v-if=\"isOpen\" class=\"service-job-details-modal\" />"
        },
        DxpShopifyImg: { name: "DxpShopifyImg", template: "<img />" },
        IonSelect: {
          props: ["label", "value"],
          template: "<div><label>{{ label }}</label><slot /></div>"
        },
        IonSelectOption: {
          props: ["value"],
          template: "<option :value=\"value\"><slot /></option>"
        }
      }
    }
  })
  await flushPromises()

  return wrapper
}






const STORAGE_KEY = "company.productStoreOnboarding"

function idInput(wrapper: any) {
  return wrapper.find("[data-testid=\"product-store-id-input\"]")
}

function inputLabelled(wrapper: any, label: string) {
  return wrapper.findAll("ion-input").find((input: any) => (input.element as any).label === label)!
}

describe("ProductStoreOnboarding auto-generated Product Store ID", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // The wizard keeps module-level state and reads localStorage once at import time, so each
    // case needs a fresh module graph for its persisted fixture to take effect.
    vi.resetModules()
    harness.accessScope = "SHOP_RW_ACCESS"
    harness.productStoreData = buildProductStoreData()
    harness.shops = ref([])
    harness.shopsHydrated = ref(true)
    harness.productSyncRunState = ref({ systemMessages: [] })
    harness.serviceJobs = ref([])
    harness.landmarkDates = ref({ status: "idle", error: null, launchDate: "", historyLastSyncDate: "" })
    harness.initialLoadStatus = buildInitialLoadStatus()
    harness.initialLoadRequestSource = null
    harness.shopifyLocations = []
    harness.fetchShopifyShopLocations.mockImplementation(() => Promise.resolve([]))
  })

  it("generates the id from the store name on the base create route", async () => {
    const wrapper = await mountView()

    await inputLabelled(wrapper, "Store name").trigger("ionInput", {
      detail: { value: "Acme Outdoor Supply" }
    })
    await flushPromises()

    expect((idInput(wrapper).element as any).value).toBe("ACME_OUTDOOR_SUPPLY")
    expect((idInput(wrapper).element as any).disabled).toBeFalsy()
  })

  it("keeps the id in step with every keystroke of the store name", async () => {
    const wrapper = await mountView()
    const storeName = inputLabelled(wrapper, "Store name")

    for(const value of ["A", "Ac", "Acm", "Acme"]) {
      await storeName.trigger("ionInput", { detail: { value } })
    }
    await flushPromises()
    expect((idInput(wrapper).element as any).value).toBe("ACME")

    await storeName.trigger("ionInput", { detail: { value: "Acme Outdoor" } })
    await flushPromises()
    expect((idInput(wrapper).element as any).value).toBe("ACME_OUTDOOR")
  })

  it("leaves a hand-edited id alone when the store name keeps changing", async () => {
    const wrapper = await mountView()
    const storeName = inputLabelled(wrapper, "Store name")

    await storeName.trigger("ionInput", { detail: { value: "Acme" } })
    await idInput(wrapper).trigger("ionInput", { detail: { value: "ACME_US" } })
    await storeName.trigger("ionInput", { detail: { value: "Acme Outdoor" } })
    await flushPromises()

    expect((idInput(wrapper).element as any).value).toBe("ACME_US")
  })

  it("does not resume a already-created store when the base create route is opened", async () => {
    // A finished setup redirects to /product-store-onboarding/:id, so a created store lives at the
    // scoped url. Reaching the bare base url means "create another one" and must not rehydrate the
    // previous store, which would pin and disable the id field.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentStepId: "name",
      createdProductStoreId: "STORE_01",
      scopedProductStoreId: "STORE_01",
      draft: { storeName: "Store 01", productStoreId: "STORE_01" },
      stepStatuses: {},
      runRequests: { products: null, inventory: null, orders: null }
    }))
    harness.productStoreData.current = completePersistedStore("STORE_01")

    const wrapper = await mountView()

    await inputLabelled(wrapper, "Store name").trigger("ionInput", {
      detail: { value: "Second Store" }
    })
    await flushPromises()

    expect((idInput(wrapper).element as any).value).toBe("SECOND_STORE")
    expect((idInput(wrapper).element as any).disabled).toBeFalsy()
  })
})
