// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { computed, nextTick, onMounted, reactive, ref, toRefs } from "vue"
import { PRODUCT_STORE_ONBOARDING_STEPS } from "@/config/productStoreOnboarding"

const harness = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  /** The linked connection's OMS-side access scope; read-write is the ordinary case. */
  accessScope: "SHOP_RW_ACCESS",
  wizard: null as any,
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

vi.mock("@/composables/useProductStoreOnboardingWizard", () => ({
  useProductStoreOnboardingWizard: () => harness.wizard
}))


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

function buildWizard() {
  const state = reactive({
    currentStepId: "name",
    createdProductStoreId: "",
    draft: {
      companyName: "",
      storeName: "",
      productStoreId: "",
      defaultCurrencyUomId: "USD",
      locale: "en_US",
      timezone: "America/New_York",
      autoApproveOrder: "N",
      orderNumberPrefix: "HC",
      saveBillingInformation: "Y",
      selectedShopifyShopId: "",
      linkedShopifyShopId: "",
      productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU",
      primaryProductIdentification: "",
      secondaryProductIdentification: "",
      facilityMode: "import",
      inventorySource: "Shopify",
      reserveInventory: "Y",
      showSystemicInventory: "true",
      orderHistoryStartDate: "",
      orderLaunchDate: ""
    },
    stepStatuses: Object.fromEntries(PRODUCT_STORE_ONBOARDING_STEPS.map((step) => [step.id, "not-started"])),
    currentStepIndex: 0,
    completedCount: 0,
    totalStepCount: 7,
    progressValue: 0
  })

  return reactive({
    ...toRefs(state),
    currentStep: computed(() => PRODUCT_STORE_ONBOARDING_STEPS.find((step) => step.id === state.currentStepId)),
    selectStep: (stepId: string) => {
      state.currentStepId = stepId
      state.currentStepIndex = PRODUCT_STORE_ONBOARDING_STEPS.findIndex((step) => step.id === stepId)
    },
    updateDraftField: (field: string, value: string) => { (state.draft as any)[field] = value },
    markStepComplete: (stepId: string = state.currentStepId) => { (state.stepStatuses as any)[stepId] = "complete" },
    markStepAttention: (stepId: string = state.currentStepId) => { (state.stepStatuses as any)[stepId] = "attention" },
    markStepInProgress: (stepId: string = state.currentStepId) => { (state.stepStatuses as any)[stepId] = "in-progress" },
    runRequests: reactive({ products: null, inventory: null, orders: null }) as any,
    setRunRequest: (kind: "products" | "inventory" | "orders", request: any) => {
      ;(harness.wizard.runRequests as any)[kind] = request
    },
    setCreatedProductStoreId: (id: string) => { state.createdProductStoreId = id },
    initializeForProductStore: vi.fn(),
    startNewSetup: vi.fn(),
    goNext: () => {
      const next = PRODUCT_STORE_ONBOARDING_STEPS[state.currentStepIndex + 1]
      if(next) {state.currentStepId = next.id; state.currentStepIndex += 1}
    },
    goPrevious: vi.fn()
  })
}

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

function buttonNamed(wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
  return wrapper.findAll("ion-button").find((button) => button.text() === label)!
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve })

  return { promise, resolve }
}

function configureExistingShopifySetup(stepId: "products" | "inventory" | "orders") {
  harness.wizard.selectStep(stepId)
  harness.wizard.draft.linkedShopifyShopId = "SHOP"
  harness.wizard.draft.selectedShopifyShopId = "SHOP"
  harness.wizard.draft.orderHistoryStartDate = "2026-08-01"
  harness.wizard.draft.orderLaunchDate = "2026-08-08"
  harness.productStoreData.current = {
    productStoreId: "STORE",
    productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU",
    reserveInventory: "Y"
  }
  harness.productStoreData.currentStoreSettings = {
    PRDT_IDEN_PREF: { settingValue: "{}" },
    INV_CNT_VIEW_QOH: { settingValue: "true" }
  }
  harness.productStoreData.currentShopifyJobStatus = {
    productStoreId: "STORE",
    linkedShops: [{ shopId: "SHOP", productStoreId: "STORE" }],
    jobs: [
      { key: "productSync", ready: true },
      { key: "productBulkSend", ready: true },
      { key: "productBulkPoll", ready: true },
      { key: "inventoryReset", ready: true },
      { key: "orderImport", ready: true },
      { key: "orderHistory", ready: true }
    ]
  }
  harness.productStoreData.fetchStatus.productStoreDetails = "success"
  harness.productStoreData.fetchStatus.currentStoreSettings = "success"
  harness.productStoreData.fetchStatus.shopifyJobStatus = "success"
  harness.shops.value = [{ shopId: "SHOP", productStoreId: "STORE" }]
  harness.shopifyLocations = [{ shopifyLocationId: "LOCATION" }]
  harness.landmarkDates.value = {
    status: "ready",
    error: null,
    historyLastSyncDate: "2026-08-01 00:00:00",
    launchDate: "2026-08-08 00:00:00"
  }
}

function initialLoadSetupSnapshot(kind: "products" | "inventory" | "orders", shopId = "SHOP") {
  if(kind === "products") {
    return JSON.stringify(["STORE", shopId, "SHOPIFY_PRODUCT_SKU", "", ""])
  }
  if(kind === "inventory") {
    return JSON.stringify(["STORE", shopId, "Y", "true"])
  }

  return JSON.stringify([
    "STORE",
    shopId,
    "2026-08-01 00:00:00",
    "2026-08-08 00:00:00"
  ])
}

function trackedInitialLoadRequest(
  kind: "products" | "inventory" | "orders",
  trackingId: string,
  requestedAt = Date.now()
) {
  return {
    shopId: "SHOP",
    setupSnapshot: initialLoadSetupSnapshot(kind),
    baselineSystemMessageId: "",
    systemMessageId: kind === "products" ? trackingId : "",
    jobRunId: kind === "products" ? "" : trackingId,
    requestedAt
  }
}

describe("ProductStoreOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.accessScope = "SHOP_RW_ACCESS"
    harness.wizard = buildWizard()
    harness.productStoreData = buildProductStoreData()
    harness.shops = ref([])
    harness.shopsHydrated = ref(true)
    harness.productSyncRunState = ref({ systemMessages: [] })
    harness.serviceJobs = ref([])
    harness.landmarkDates = ref({ status: "idle", error: null, launchDate: "", historyLastSyncDate: "" })
    harness.initialLoadStatus = buildInitialLoadStatus()
    harness.initialLoadRequestSource = null
    harness.shopifyLocations = []
    harness.fetchShopifyShopLocations.mockReset()
    harness.fetchShopifyShopLocations.mockImplementation(() => Promise.resolve(harness.shopifyLocations))
    harness.updateShop.mockResolvedValue({ data: {} })
    harness.updateStore.mockResolvedValue({ data: {} })
    harness.saveSettings.mockResolvedValue({ data: {} })
    harness.productStoreData.setupProductStoreShopifyProductImport.mockResolvedValue({ data: {} })
    harness.productStoreData.runProductStoreShopifyProductImport.mockResolvedValue({ data: {} })
    harness.productStoreData.setupProductStoreShopifyInventoryReset.mockResolvedValue({ data: {} })
    harness.productStoreData.runProductStoreShopifyInventoryReset.mockResolvedValue({ data: {} })
    harness.productStoreData.saveProductStoreShopifyOrderDates.mockResolvedValue({ data: {} })
    harness.productStoreData.setupProductStoreShopifyOrderImport.mockResolvedValue({ data: {} })
    harness.productStoreData.runProductStoreShopifyOrderHistoryImport.mockResolvedValue({ data: {} })
    harness.createModal.mockResolvedValue({
      present: vi.fn(),
      onDidDismiss: vi.fn().mockResolvedValue({})
    })
  })

  it("renders the focused eight-step flow without token, workflow, or package setup", async () => {
    const wrapper = await mountView()

    const text = wrapper.text()
    for(const step of PRODUCT_STORE_ONBOARDING_STEPS) {
      expect(text).toContain(step.label)
    }
    expect(text).not.toContain("JWT")
    expect(text).not.toContain("Setup package")
    expect(text).not.toContain("Workflow")
    expect(text).not.toContain("SQS")
  })

  it("shows Product Sync configuration with jobs, live Shopify count, and product identifiers", async () => {
    configureExistingShopifySetup("products")
    harness.productStoreData.fetchStatus.shopifyJobStatus = "success"
    harness.productSyncRunState.value = {
      systemMessages: [
        {
          systemMessageId: "M100",
          logId: "L100",
          logStatusId: "DmlsFinished",
          statusId: "SmsgConsumed"
        }
      ]
    }
    harness.serviceJobs.value = [
      { jobName: "sync_ShopifyProductUpdates_SHOP", serviceName: "sync_ShopifyProductUpdates", paused: "N" },
      { jobName: "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery", serviceName: "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery", paused: "N" },
      { jobName: "poll_ShopifyBulkOperationResult", serviceName: "poll_ShopifyBulkOperationResult", paused: "N" }
    ]

    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(wrapper.text()).toContain("Shopify primary identifier")
    expect(wrapper.text()).toContain("Product sync jobs")
    expect(wrapper.text()).toContain("Queue update requests")
    expect(wrapper.text()).toContain("Send update request")
    expect(wrapper.text()).toContain("Import completed requests")
    expect(wrapper.text()).toContain("Products in Shopify")
    expect(wrapper.text()).toContain("Product Identifier")
    expect(wrapper.text()).toContain("Primary")
    expect(wrapper.text()).toContain("Secondary")
    expect(harness.wizard.stepStatuses.products).toBe("complete")
  })

  it("renders sample product preview only when products are imported", async () => {
    configureExistingShopifySetup("products")
    harness.productSyncRunState.value = {
      systemMessages: [{ systemMessageId: "M100", logId: "L100", logStatusId: "DmlsFinished", statusId: "SmsgConsumed" }]
    }
    const wrapper = await mountView({ productStoreId: "STORE" })
    expect(wrapper.text()).toContain("Preview Product Identifier")
  })

  it("does not render sample product preview when no products are imported", async () => {
    configureExistingShopifySetup("products")
    harness.productSyncRunState.value = { systemMessages: [] }
    const wrapper = await mountView({ productStoreId: "STORE" })
    expect(wrapper.text()).not.toContain("Preview Product Identifier")
  })

  it.each([
    {
      evidence: "missing",
      // Names the template from the job status, so the operator is sent after the seed data setup
      // actually clones rather than a hardcoded name that drifted away from it.
      detail: "The backend service-job template resetShopifyInventoryQoh is missing. Ask the backend owner to load the Shopify inventory seed data, then select Refresh."
    },
    {
      evidence: "unknown",
      detail: "The backend inventory job template has not been verified. Select Refresh before saving inventory preferences."
    }
  ])("disables inventory Save and explains $evidence template evidence", async ({ evidence, detail }) => {
    configureExistingShopifySetup("inventory")
    if(evidence === "missing") {
      harness.productStoreData.currentShopifyJobStatus.jobs = harness.productStoreData.currentShopifyJobStatus.jobs.map((job: any) => {
        if(job.key === "inventoryReset") {
          return {
            ...job,
            ready: false,
            status: "missing-template",
            templateJobName: "resetShopifyInventoryQoh",
            templateJob: null,
            expectedJob: null
          }
        }

        return job
      })
    } else {
      harness.productStoreData.fetchStatus.shopifyJobStatus = "pending"
    }

    const wrapper = await mountView({ productStoreId: "STORE" })
    const saveButton = buttonNamed(wrapper, "Save inventory setup")

    expect(wrapper.text()).toContain(detail)
    expect((saveButton.element as any).disabled).toBe(true)
    await saveButton.trigger("click")
    expect(harness.productStoreData.setupProductStoreShopifyInventoryReset).not.toHaveBeenCalled()
    expect(harness.updateStore).not.toHaveBeenCalled()
    expect(harness.saveSettings).not.toHaveBeenCalled()
  })

  it("runs inventory job preflight before preference writes and leaves preferences untouched when it fails", async () => {
    configureExistingShopifySetup("inventory")
    const wrapper = await mountView({ productStoreId: "STORE" })
    harness.wizard.draft.reserveInventory = "N"
    await nextTick()
    harness.productStoreData.setupProductStoreShopifyInventoryReset.mockRejectedValueOnce(new Error("Initial inventory import cannot be configured because the backend service-job template sync_ShopifyInventoryReset is missing. Ask the backend owner to load the Shopify inventory reset seed data, then refresh setup."))

    const saveButton = buttonNamed(wrapper, "Save inventory setup")
    expect((saveButton.element as any).disabled).toBe(false)
    await saveButton.trigger("click")
    await flushPromises()

    expect(harness.productStoreData.setupProductStoreShopifyInventoryReset).toHaveBeenCalledOnce()
    expect(harness.updateStore).not.toHaveBeenCalled()
    expect(harness.saveSettings).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("Initial inventory import cannot be configured because the backend service-job template sync_ShopifyInventoryReset is missing.")
    expect(harness.wizard.stepStatuses.inventory).toBe("attention")
  })

  it("passes persisted run requests into exact initial-load correlation", async () => {
    await mountView({ productStoreId: "STORE" })

    expect(harness.initialLoadRequestSource).toBeTypeOf("function")
    expect(harness.initialLoadRequestSource()).toBe(harness.wizard.runRequests)
  })

  it("opens service job details modal when a product sync job item is clicked", async () => {
    configureExistingShopifySetup("products")
    harness.serviceJobs.value = [
      { jobName: "sync_ShopifyProductUpdates_SHOP", serviceName: "sync_ShopifyProductUpdates", paused: "N" }
    ]

    const wrapper = await mountView({ productStoreId: "STORE" })
    const queueJobItem = wrapper.findAll("ion-item").find((item) => item.text().includes("Queue update requests"))
    expect(queueJobItem).toBeDefined()
    await queueJobItem!.trigger("click")
    await nextTick()

    const modal = wrapper.findComponent({ name: "ServiceJobDetailsModal" })
    expect(modal.exists()).toBe(true)
    expect(modal.props("isOpen")).toBe(true)
    expect(modal.props("jobName")).toBe("sync_ShopifyProductUpdates_SHOP")
  })

  it.each([
    {
      stepId: "inventory" as const,
      saveLabel: "Save inventory setup",
      runLabel: "Load inventory",
      runSpy: () => harness.productStoreData.runProductStoreShopifyInventoryReset
    },
    {
      stepId: "orders" as const,
      saveLabel: "Save order import",
      runLabel: "Load order history",
      runSpy: () => harness.productStoreData.runProductStoreShopifyOrderHistoryImport
    }
  ])("keeps the whole $stepId refresh busy and deduplicates its actions", async ({
    stepId,
    saveLabel,
    runLabel,
    runSpy
  }) => {
    configureExistingShopifySetup(stepId)
    const wrapper = await mountView({ productStoreId: "STORE" })
    const configurationRefresh = deferred<void>()
    harness.productStoreData.fetchProductStoreDetails.mockClear()
    harness.productStoreData.fetchProductStoreDetails.mockReturnValueOnce(configurationRefresh.promise)
    harness.initialLoadStatus.refresh.mockClear()
    runSpy().mockClear()

    const refreshButton = buttonNamed(wrapper, "Refresh")
    const saveButton = buttonNamed(wrapper, saveLabel)
    const runButton = buttonNamed(wrapper, runLabel)
    expect((runButton.element as any).disabled).toBe(false)

    await refreshButton.trigger("click")
    await nextTick()

    expect(harness.initialLoadStatus.refresh).toHaveBeenCalledOnce()
    expect((refreshButton.element as any).disabled).toBe(true)
    expect((saveButton.element as any).disabled).toBe(true)
    expect((runButton.element as any).disabled).toBe(true)

    await refreshButton.trigger("click")
    await runButton.trigger("click")
    expect(harness.initialLoadStatus.refresh).toHaveBeenCalledOnce()
    expect(runSpy()).not.toHaveBeenCalled()

    configurationRefresh.resolve()
    await flushPromises()
    await flushPromises()

    expect((refreshButton.element as any).disabled).toBe(false)
    expect((runButton.element as any).disabled).toBe(false)
    expect(wrapper.text()).toContain("Sync status refreshed.")
  })

  it("opens Order history scoped to the exact accepted job and correlated message", async () => {
    configureExistingShopifySetup("orders")
    harness.initialLoadStatus.orders.value = {
      ...initialLoadSnapshot("orders", "running"),
      details: {
        ...initialLoadSnapshot("orders").details,
        systemMessageId: "ORDER-MESSAGE",
        jobRunId: "ORDER-JOB"
      }
    }
    harness.wizard.setRunRequest("orders", {
      shopId: "SHOP",
      setupSnapshot: initialLoadSetupSnapshot("orders"),
      baselineSystemMessageId: "",
      systemMessageId: "",
      jobRunId: "ORDER-JOB",
      requestedAt: Date.now()
    })

    const wrapper = await mountView({ productStoreId: "STORE" })

    await buttonNamed(wrapper, "View details").trigger("click")
    expect(harness.push).toHaveBeenCalledWith({
      path: "/shopify-connection-details/SHOP/order-sync/history",
      query: {
        returnTo: "/product-store-onboarding",
        systemMessageId: "ORDER-MESSAGE",
        jobRunId: "ORDER-JOB"
      }
    })
  })

  it("navigates without completing the current step", async () => {
    harness.wizard.setCreatedProductStoreId("STORE")
    const wrapper = await mountView()

    const continueButton = wrapper.findAll("ion-button").find((button) => button.text() === "Continue")
    expect(continueButton).toBeDefined()
    await continueButton!.trigger("click")

    expect(harness.wizard.currentStepId).toBe("shopify")
    expect(harness.wizard.stepStatuses.name).toBe("not-started")
  })

  it("does not let wizard defaults make an incomplete persisted Store look complete", async () => {
    harness.wizard.stepStatuses.name = "complete"
    harness.productStoreData.current = completePersistedStore("STORE", {
      defaultLocaleString: "",
      orderNumberPrefix: ""
    })
    harness.productStoreData.currentStoreSettings = {}

    await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.draft.locale).toBe("")
    expect(harness.wizard.draft.orderNumberPrefix).toBe("")
    expect(harness.wizard.draft.saveBillingInformation).toBe("")
    expect(harness.wizard.stepStatuses.name).toBe("attention")
  })

  it("completes Store only when every displayed default and billing truth are persisted", async () => {
    harness.productStoreData.current = completePersistedStore("STORE")
    harness.productStoreData.currentStoreSettings = {
      SAVE_BILL_TO_INF: { settingTypeEnumId: "SAVE_BILL_TO_INF", settingValue: "N" }
    }

    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.draft.saveBillingInformation).toBe("N")
    expect(harness.wizard.stepStatuses.name).toBe("complete")

    const storeName = wrapper.findAll("ion-input").find((input) => (input.element as any).label === "Store name")
    await storeName!.trigger("ionInput", { detail: { value: "Unsaved name" } })
    expect(harness.wizard.stepStatuses.name).toBe("in-progress")
  })

  it("serializes rapid route loads and hydrates only the currently requested Product Store", async () => {
    const firstDetails = deferred<void>()
    harness.productStoreData.fetchProductStoreDetails.mockImplementation(async (productStoreId: string) => {
      if(productStoreId === "STORE_A") {await firstDetails.promise}
      harness.productStoreData.current = completePersistedStore(productStoreId)
    })
    harness.productStoreData.fetchCurrentStoreSettings.mockImplementation((productStoreId: string) => {
      harness.productStoreData.currentStoreSettings = {
        SAVE_BILL_TO_INF: {
          settingTypeEnumId: "SAVE_BILL_TO_INF",
          settingValue: productStoreId === "STORE_A" ? "Y" : "N"
        }
      }
    })

    const View = (await import("@/views/ProductStoreOnboarding.vue")).default
    const wrapper = mount(View, {
      props: { productStoreId: "STORE_A" },
      global: { stubs: { IonBackButton: true, IonContent: { template: "<div><slot /></div>" }, IonIcon: true } }
    })
    await nextTick()
    await flushPromises()
    expect(harness.productStoreData.fetchProductStoreDetails).toHaveBeenCalledWith("STORE_A")
    await wrapper.setProps({ productStoreId: "STORE_B" })
    await nextTick()

    firstDetails.resolve()
    await flushPromises()
    await flushPromises()

    expect(harness.productStoreData.fetchProductStoreDetails.mock.calls.map(([id]: [string]) => id)).toEqual([
      "STORE_A",
      "STORE_B"
    ])
    expect(harness.wizard.draft.productStoreId).toBe("STORE_B")
    expect(harness.wizard.draft.storeName).toBe("STORE_B Store")
    expect(harness.wizard.draft.saveBillingInformation).toBe("N")
    expect(harness.wizard.stepStatuses.name).toBe("complete")
  })

  it("exposes setup progress as an accessible count on desktop and mobile", async () => {
    harness.wizard.completedCount = 3
    harness.wizard.progressValue = 3 / 7
    const wrapper = await mountView()

    const progress = wrapper.get("ion-progress-bar")
    expect(progress.attributes("aria-label")).toBe("3 of 7 setup steps complete")
    expect(progress.attributes("aria-valuemin")).toBe("0")
    expect(progress.attributes("aria-valuemax")).toBe("7")
    expect(progress.attributes("aria-valuenow")).toBe("3")
    expect(progress.attributes("aria-valuetext")).toBe("3 of 7 setup steps complete")

    const mobileCount = wrapper.get("[data-testid=\"mobile-progress-count\"]")
    expect(mobileCount.text()).toBe("3 / 7")
    expect(mobileCount.attributes("aria-label")).toBe("3 of 7 setup steps complete")
    expect(mobileCount.attributes("aria-live")).toBe("polite")
  })

  it("dynamically updates toolbar progress bar value as user navigates steps", async () => {
    harness.wizard.currentStepIndex = 0
    const wrapper = await mountView()

    const progress = wrapper.findComponent({ name: "IonProgressBar" })
    expect(progress.props("value")).toBe(1 / 8)

    harness.wizard.selectStep("shopify")
    await wrapper.vm.$nextTick()
    expect(progress.props("value")).toBe(2 / 8)

    harness.wizard.selectStep("readiness")
    await wrapper.vm.$nextTick()
    expect(progress.props("value")).toBe(1)
  })

  it("keeps Store ID and locale validation visible and reachable", async () => {
    harness.wizard.draft.storeName = "Test store"
    harness.wizard.draft.productStoreId = ""
    harness.wizard.draft.locale = "en-us"
    const wrapper = await mountView()

    const storeIdInput = wrapper.get("[data-testid=\"product-store-id-input\"]")
    expect((storeIdInput.element as any).maxlength).toBe(20)
    expect((storeIdInput.element as any).required).toBe(true)

    const createButton = wrapper.findAll("ion-button").find((button) => button.text() === "Create product store")
    expect((createButton?.element as any)?.disabled).toBe(false)
    await createButton!.trigger("click")
    await flushPromises()

    expect((storeIdInput.element as any).errorText).toBe("Product Store ID is required.")
    expect(storeIdInput.classes()).toEqual(expect.arrayContaining(["ion-invalid", "ion-touched"]))
    expect((wrapper.get("[data-testid=\"default-locale-input\"]").element as any).errorText)
      .toBe("Enter a locale in the format en_US.")
    expect(wrapper.get("[role=\"alert\"]").text()).toBe("Complete every required store field before saving.")
  })

  it("constrains the order date range and explains an invalid relationship inline", async () => {
    harness.wizard.selectStep("orders")
    harness.wizard.draft.linkedShopifyShopId = "SHOP"
    harness.wizard.draft.orderHistoryStartDate = "2026-08-12"
    harness.wizard.draft.orderLaunchDate = "2026-08-11"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.shops.value = [{ shopId: "SHOP", productStoreId: "STORE" }]
    const wrapper = await mountView({ productStoreId: "STORE" })

    const historyInput = wrapper.get("[data-testid=\"order-history-start-input\"]")
    const launchInput = wrapper.get("[data-testid=\"order-launch-date-input\"]")
    expect((historyInput.element as any).max).toBe("2026-08-11")
    expect((launchInput.element as any).min).toBe("2026-08-12")

    await historyInput.trigger("ionBlur")
    await flushPromises()

    expect((launchInput.element as any).errorText)
      .toBe("Order history start date must be on or before the order launch date.")
    expect(launchInput.classes()).toEqual(expect.arrayContaining(["ion-invalid", "ion-touched"]))
    const saveButton = wrapper.findAll("ion-button").find((button) => button.text() === "Save order import")
    expect((saveButton?.element as any)?.disabled).toBe(true)
  })

  it("restores focus to the facility import opener after its modal closes", async () => {
    harness.wizard.selectStep("facilities")
    harness.wizard.draft.linkedShopifyShopId = "SHOP"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.shops.value = [{ shopId: "SHOP", productStoreId: "STORE" }]
    const wrapper = await mountView({ productStoreId: "STORE" })
    const importButton = wrapper.findAll("ion-button").find((button) => button.text() === "Import Shopify locations")!
    const setFocus = vi.fn()
    Object.assign(importButton.element, { setFocus })

    await importButton.trigger("click")
    await flushPromises()

    expect(harness.createModal).toHaveBeenCalledOnce()
    expect(setFocus).toHaveBeenCalledOnce()
  })

  it("completes Facilities when a previously imported mapping is associated on retry", async () => {
    harness.wizard.selectStep("facilities")
    harness.wizard.draft.linkedShopifyShopId = "SHOP"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.shops.value = [{ shopId: "SHOP", productStoreId: "STORE" }]
    harness.createModal.mockResolvedValue({
      present: vi.fn(),
      onDidDismiss: vi.fn().mockResolvedValue({
        data: {
          imported: 0,
          retried: 1,
          associated: 1,
          facilityIds: [],
          retriedFacilityIds: ["FACILITY"],
          associationFacilityIds: ["FACILITY"],
          associatedFacilityIds: ["FACILITY"],
          failedAssociationFacilityIds: [],
          associationFailed: false
        }
      })
    })

    const wrapper = await mountView({ productStoreId: "STORE" })
    await buttonNamed(wrapper, "Import Shopify locations").trigger("click")
    await flushPromises()

    expect(harness.wizard.stepStatuses.facilities).toBe("complete")
    expect(wrapper.text()).toContain("Every selected facility was associated with this Product Store.")
  })

  it.each([
    { assignment: "unassigned", productStoreId: "" },
    { assignment: "assigned to another Product Store", productStoreId: "OTHER_STORE" }
  ])("clears a persisted shop that is now $assignment and blocks job setup", async ({ productStoreId }) => {
    harness.wizard.selectStep("products")
    harness.wizard.draft.linkedShopifyShopId = "STALE_SHOP"
    harness.wizard.draft.selectedShopifyShopId = "STALE_SHOP"
    harness.wizard.stepStatuses.shopify = "complete"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.shops.value = [{ shopId: "STALE_SHOP", productStoreId }]

    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.draft.linkedShopifyShopId).toBe("")
    expect(harness.wizard.draft.selectedShopifyShopId).toBe("")
    expect(harness.wizard.stepStatuses.shopify).toBe("attention")
    const saveButton = wrapper.findAll("ion-button").find((button) => button.text() === "Save product setup")
    expect((saveButton?.element as (HTMLElement & { disabled: boolean }) | undefined)?.disabled).toBe(true)
    await saveButton!.trigger("click")
    expect(harness.productStoreData.setupProductStoreShopifyProductImport).not.toHaveBeenCalled()
  })

  it("prefers the live assignment response over a stale cached link", async () => {
    harness.wizard.selectStep("products")
    harness.wizard.draft.linkedShopifyShopId = "STALE_SHOP"
    harness.wizard.draft.selectedShopifyShopId = "STALE_SHOP"
    harness.wizard.stepStatuses.shopify = "complete"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.productStoreData.currentShopifyJobStatus = {
      productStoreId: "STORE",
      linkedShops: [],
      jobs: []
    }
    harness.shops.value = [{ shopId: "STALE_SHOP", productStoreId: "STORE" }]

    await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.draft.linkedShopifyShopId).toBe("")
    expect(harness.wizard.stepStatuses.shopify).toBe("attention")
  })

  it("clears all initial-load correlations when live evidence verifies a different linked shop", async () => {
    harness.wizard.selectStep("products")
    harness.wizard.draft.linkedShopifyShopId = "SHOP_OLD"
    harness.wizard.draft.selectedShopifyShopId = "SHOP_OLD"
    harness.wizard.stepStatuses.shopify = "complete"
    harness.wizard.setRunRequest("products", trackedInitialLoadRequest("products", "MSG-OLD"))
    harness.wizard.setRunRequest("inventory", trackedInitialLoadRequest("inventory", "RUN-INVENTORY-OLD"))
    harness.wizard.setRunRequest("orders", trackedInitialLoadRequest("orders", "RUN-ORDERS-OLD"))
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.productStoreData.currentShopifyJobStatus = {
      productStoreId: "STORE",
      linkedShops: [{ shopId: "SHOP_NEW", productStoreId: "STORE" }],
      jobs: []
    }
    harness.productStoreData.fetchStatus.shopifyJobStatus = "success"
    harness.shops.value = [{ shopId: "SHOP_NEW", productStoreId: "STORE" }]

    await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.draft.linkedShopifyShopId).toBe("SHOP_NEW")
    expect(harness.wizard.draft.selectedShopifyShopId).toBe("SHOP_NEW")
    expect(harness.wizard.runRequests).toEqual({
      products: null,
      inventory: null,
      orders: null
    })
  })

  it("persists a Shopify link only after the saved association is currently assigned", async () => {
    harness.wizard.selectStep("shopify")
    harness.wizard.draft.selectedShopifyShopId = "NEW_SHOP"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.shops.value = [{ shopId: "NEW_SHOP", productStoreId: "" }]
    harness.updateShop.mockImplementation(() => {
      harness.shops.value = [{ shopId: "NEW_SHOP", productStoreId: "STORE" }]

      return Promise.resolve({ data: {} })
    })

    const wrapper = await mountView({ productStoreId: "STORE" })
    const linkButton = wrapper.findAll("ion-button").find((button) => button.text() === "Link Shopify shop")
    expect(linkButton).toBeDefined()
    await linkButton!.trigger("click")
    await flushPromises()

    expect(harness.updateShop).toHaveBeenCalledWith({ productStoreId: "STORE" })
    expect(harness.wizard.draft.linkedShopifyShopId).toBe("NEW_SHOP")
    expect(harness.wizard.stepStatuses.shopify).toBe("complete")
  })

  it.each([
    {
      stepId: "inventory" as const,
      loadLabel: "Load inventory",
      edit: () => { harness.wizard.draft.reserveInventory = "N" }
    },
    {
      stepId: "orders" as const,
      loadLabel: "Load order history",
      edit: () => { harness.wizard.draft.orderHistoryStartDate = "2026-08-02" }
    }
  ])("blocks $stepId load after editing a reconciled saved setup", async ({ stepId, loadLabel, edit }) => {
    configureExistingShopifySetup(stepId)
    const wrapper = await mountView({ productStoreId: "STORE" })
    const loadButton = buttonNamed(wrapper, loadLabel)
    expect((loadButton.element as any).disabled).toBe(false)

    edit()
    harness.wizard.stepStatuses[stepId] = "in-progress"
    await nextTick()

    expect((loadButton.element as any).disabled).toBe(true)
  })

  it("saves product setup and transitions to complete when finished MDM log exists", async () => {
    configureExistingShopifySetup("products")
    harness.productSyncRunState.value = {
      systemMessages: [{ systemMessageId: "M100", logId: "L100", logStatusId: "DmlsFinished", statusId: "SmsgConsumed" }]
    }
    const wrapper = await mountView({ productStoreId: "STORE" })
    const saveButton = buttonNamed(wrapper, "Save product setup")
    await saveButton.trigger("click")
    await flushPromises()

    expect(harness.updateStore).toHaveBeenCalledWith({ productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU" })
    expect(harness.saveSettings).toHaveBeenCalledWith({
      settingTypeEnumId: "PRDT_IDEN_PREF",
      settingValue: "{}"
    })
    expect(harness.productStoreData.setupProductStoreShopifyProductImport).toHaveBeenCalledWith({
      productStoreId: "STORE",
      shopId: "SHOP",
      productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU",
      activateJobs: true
    })
    expect(harness.wizard.stepStatuses.products).toBe("complete")
  })

  it("only shows products step in-progress when there is not 1 or more finished MDM log", async () => {
    configureExistingShopifySetup("products")
    harness.productSyncRunState.value = { systemMessages: [] }
    const wrapper = await mountView({ productStoreId: "STORE" })
    const saveButton = buttonNamed(wrapper, "Save product setup")
    await saveButton.trigger("click")
    await flushPromises()

    expect(harness.wizard.stepStatuses.products).toBe("in-progress")
  })

  it.each([
    {
      stepId: "inventory" as const,
      saveLabel: "Save inventory setup",
      loadLabel: "Load inventory",
      importSpy: () => harness.productStoreData.runProductStoreShopifyInventoryReset
    },
    {
      stepId: "orders" as const,
      saveLabel: "Save order import",
      loadLabel: "Load order history",
      importSpy: () => harness.productStoreData.runProductStoreShopifyOrderHistoryImport
    }
  ])("cross-disables and deduplicates $stepId actions while Load runs", async ({ stepId, saveLabel, loadLabel, importSpy }) => {
    configureExistingShopifySetup(stepId)
    const pending = deferred<any>()
    importSpy().mockReturnValueOnce(pending.promise)
    const wrapper = await mountView({ productStoreId: "STORE" })
    const saveButton = buttonNamed(wrapper, saveLabel)
    const loadButton = buttonNamed(wrapper, loadLabel)

    await loadButton.trigger("click")
    expect((saveButton.element as any).disabled).toBe(true)
    expect((loadButton.element as any).disabled).toBe(true)
    await loadButton.trigger("click")
    await saveButton.trigger("click")

    expect(importSpy()).toHaveBeenCalledOnce()
    pending.resolve({ data: {} })
    await flushPromises()
  })

  it.each([
    {
      stepId: "inventory" as const,
      loadLabel: "Load inventory",
      importSpy: () => harness.productStoreData.runProductStoreShopifyInventoryReset,
      expectedMessage: "The initial inventory load was queued. This step stays in progress until the load finishes successfully."
    },
    {
      stepId: "orders" as const,
      loadLabel: "Load order history",
      importSpy: () => harness.productStoreData.runProductStoreShopifyOrderHistoryImport,
      expectedMessage: "The initial order history load was queued. This step stays in progress until the import finishes successfully."
    }
  ])("keeps $stepId in progress when the backend only accepts the initial-load request", async ({
    stepId,
    loadLabel,
    importSpy,
    expectedMessage
  }) => {
    configureExistingShopifySetup(stepId)
    importSpy().mockResolvedValueOnce({ data: { jobRunId: "RUN-1", systemMessageId: "MSG-1" } })
    const wrapper = await mountView({ productStoreId: "STORE" })

    await buttonNamed(wrapper, loadLabel).trigger("click")
    await flushPromises()

    expect(harness.wizard.stepStatuses[stepId]).toBe("in-progress")
    expect(wrapper.text()).toContain(expectedMessage)
    expect(wrapper.text()).toContain("Request accepted. Waiting for its sync run to appear.")
    expect((buttonNamed(wrapper, loadLabel).element as any).disabled).toBe(true)
  })

  it.each([
    {
      stepId: "inventory" as const,
      saveLabel: "Save inventory setup",
      loadLabel: "Load inventory",
      trackingId: "RUN-INVENTORY-ACCEPTED"
    },
    {
      stepId: "orders" as const,
      saveLabel: "Save order import",
      loadLabel: "Load order history",
      trackingId: "RUN-ORDERS-ACCEPTED"
    }
  ])("shows the Waiting overlay and blocks $stepId actions until accepted request evidence appears", async ({
    stepId,
    saveLabel,
    loadLabel,
    trackingId
  }) => {
    configureExistingShopifySetup(stepId)
    harness.wizard.setRunRequest(stepId, trackedInitialLoadRequest(stepId, trackingId))
    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(wrapper.text()).toContain("Request accepted. Waiting for its sync run to appear.")
    expect(wrapper.text()).toContain(trackingId)
    expect((buttonNamed(wrapper, saveLabel).element as any).disabled).toBe(true)
    expect((buttonNamed(wrapper, loadLabel).element as any).disabled).toBe(true)
    expect(harness.wizard.runRequests[stepId]).not.toBeNull()
  })

  it("keeps an exactly correlated unavailable inventory run recoverable", async () => {
    configureExistingShopifySetup("inventory")
    harness.wizard.setRunRequest("inventory", trackedInitialLoadRequest("inventory", "RUN-UNAVAILABLE"))
    harness.initialLoadStatus.inventory.value = {
      ...initialLoadSnapshot("inventory", "unavailable"),
      run: {
        status: "unavailable",
        summary: "The inventory job finished without a usable sync result.",
        stages: []
      },
      details: {
        ...initialLoadSnapshot("inventory").details,
        jobRunId: "RUN-UNAVAILABLE"
      }
    }

    const wrapper = await mountView({ productStoreId: "STORE" })
    const retryButton = buttonNamed(wrapper, "Retry")

    expect(harness.wizard.stepStatuses.inventory).toBe("attention")
    expect(wrapper.text()).toContain("The inventory job finished without a usable sync result.")
    expect((retryButton.element as any).disabled).toBe(false)
    expect(harness.wizard.runRequests.inventory?.jobRunId).toBe("RUN-UNAVAILABLE")
  })

  it("does not let an unrelated completed inventory run complete the accepted request", async () => {
    configureExistingShopifySetup("inventory")
    harness.wizard.stepStatuses.inventory = "in-progress"
    harness.wizard.setRunRequest("inventory", trackedInitialLoadRequest("inventory", "RUN-REQUESTED"))
    harness.initialLoadStatus.inventory.value = {
      ...initialLoadSnapshot("inventory", "completed"),
      run: {
        status: "completed",
        summary: "An unrelated inventory run completed.",
        stages: []
      },
      details: {
        ...initialLoadSnapshot("inventory").details,
        jobRunId: "RUN-OTHER"
      }
    }

    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.stepStatuses.inventory).not.toBe("complete")
    expect(wrapper.text()).toContain("Request accepted. Waiting for its sync run to appear.")
    expect(wrapper.text()).not.toContain("An unrelated inventory run completed.")
    expect((buttonNamed(wrapper, "Load inventory").element as any).disabled).toBe(true)
    expect(harness.wizard.runRequests.inventory?.jobRunId).toBe("RUN-REQUESTED")
  })

  it("enables Retry when accepted inventory evidence is still unmatched after 15 minutes", async () => {
    configureExistingShopifySetup("inventory")
    harness.wizard.setRunRequest(
      "inventory",
      trackedInitialLoadRequest("inventory", "RUN-STALLED", Date.now() - (16 * 60 * 1000))
    )

    const wrapper = await mountView({ productStoreId: "STORE" })
    const retryButton = buttonNamed(wrapper, "Retry")

    expect(wrapper.text()).toContain("No sync evidence appeared for the accepted request. Refresh, then retry if needed.")
    expect((retryButton.element as any).disabled).toBe(false)
    expect(harness.wizard.runRequests.inventory?.jobRunId).toBe("RUN-STALLED")
  })

  it("keeps an exactly correlated active inventory request blocked after 15 minutes", async () => {
    configureExistingShopifySetup("inventory")
    harness.wizard.setRunRequest(
      "inventory",
      trackedInitialLoadRequest("inventory", "RUN-ACTIVE", Date.now() - (16 * 60 * 1000))
    )
    harness.initialLoadStatus.inventory.value = {
      ...initialLoadSnapshot("inventory", "running"),
      run: {
        status: "running",
        summary: "The exact inventory request is still running.",
        stages: []
      },
      details: {
        ...initialLoadSnapshot("inventory").details,
        jobRunId: "RUN-ACTIVE"
      }
    }

    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(wrapper.text()).toContain("The exact inventory request is still running.")
    expect(buttonNamed(wrapper, "Retry")).toBeUndefined()
    expect((buttonNamed(wrapper, "Load inventory").element as any).disabled).toBe(true)
    expect(harness.wizard.stepStatuses.inventory).toBe("in-progress")
  })

  it("completes an exactly correlated inventory run without making pristine setup editable", async () => {
    configureExistingShopifySetup("inventory")
    harness.wizard.setRunRequest("inventory", trackedInitialLoadRequest("inventory", "RUN-COMPLETE"))
    harness.initialLoadStatus.inventory.value = {
      ...initialLoadSnapshot("inventory", "completed"),
      run: {
        status: "completed",
        summary: "The exact inventory request completed.",
        stages: []
      },
      details: {
        ...initialLoadSnapshot("inventory").details,
        jobRunId: "RUN-COMPLETE"
      }
    }

    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.stepStatuses.inventory).toBe("complete")
    expect(wrapper.text()).toContain("The exact inventory request completed.")
    expect((buttonNamed(wrapper, "Save inventory setup").element as any).disabled).toBe(true)
    expect((buttonNamed(wrapper, "Load inventory").element as any).disabled).toBe(false)
    expect(buttonNamed(wrapper, "Retry")).toBeUndefined()
  })

  /**
   * An empty `accessScopeEnumId` on a remote that EXISTS is a real state the connector treats as
   * read-only. Deciding "resolved" from the scope string instead of the remote conflated it with
   * "still loading": the Grant button was hidden behind a message promising a value that would never
   * arrive, while the load stayed disabled. The store could not be imported into and offered no
   * control to fix it.
   */
  it("treats a resolved connection with no scope as read-only, not as still loading", async () => {
    harness.accessScope = ""
    configureExistingShopifySetup("inventory")
    harness.wizard.selectStep("shopify")
    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(wrapper.text()).toContain("Read only")
    expect(wrapper.text()).not.toContain("access level is unknown")
    expect(buttonNamed(wrapper, "Grant write access").exists()).toBe(true)
  })

  /**
   * A read-only connection completes every form in this wizard and fails only later, inside a job on
   * a fifteen-minute cron: `bulkOperationRunQuery` is a GraphQL mutation, and the connector answers
   * "Cannot post graphQL mutation, only read access is enabled for Shopify". Nothing reached the
   * operator, so the step is gated on write access up front instead.
   */
  it.each([
    { stepId: "inventory" as const, loadLabel: "Load inventory" },
    { stepId: "orders" as const, loadLabel: "Load order history" }
  ])("blocks the $stepId load on a read-only connection and says why", async ({ stepId, loadLabel }) => {
    harness.accessScope = "SHOP_READ_ACCESS"
    configureExistingShopifySetup(stepId)
    const wrapper = await mountView({ productStoreId: "STORE" })

    expect(wrapper.text()).toContain("Shopify write access")
    expect(wrapper.text()).toContain("Shopify bulk imports are sent as GraphQL mutations")
    expect((buttonNamed(wrapper, loadLabel).element as any).disabled).toBe(true)
    // Saving preferences is a local write and stays available; only the load needs the mutation.
    expect(wrapper.text()).not.toContain("The sync request could not be tracked")
  })


  /**
   * The defect this guards: the inventory load posts to the connector's `inventoryReset` resource,
   * which produces a SystemMessage and answers with its id. The step recorded tracking ids by step
   * rather than by what arrived, looked for a `jobRunId`, found none, and told the operator the run
   * could not be tracked — while the backend had already accepted it and started the import.
   */
  it("tracks an inventory load by the SystemMessage id the connector returns", async () => {
    configureExistingShopifySetup("inventory")
    harness.productStoreData.runProductStoreShopifyInventoryReset
      .mockResolvedValueOnce({ data: { systemMessageId: "M102603" } })
    const wrapper = await mountView({ productStoreId: "STORE" })

    await buttonNamed(wrapper, "Load inventory").trigger("click")
    await flushPromises()
    await flushPromises()

    expect(harness.wizard.runRequests.inventory).toMatchObject({ systemMessageId: "M102603", jobRunId: "" })
    expect(harness.wizard.stepStatuses.inventory).not.toBe("attention")
    expect(wrapper.text()).not.toContain("The sync request could not be tracked because the backend returned no tracking ID.")
  })

  /**
   * Untrackable means the backend named NEITHER identifier. Which one it names is a property of the
   * transport: the connector's inventory resource answers with a SystemMessage id, the order-history
   * job with a ServiceJobRun id. Asserting a per-step identifier here is what hid a real defect —
   * inventory's accepted run was reported to the operator as untrackable.
   */
  it.each([
    {
      stepId: "inventory" as const,
      loadLabel: "Load inventory",
      importSpy: () => harness.productStoreData.runProductStoreShopifyInventoryReset,
      response: { data: { queued: true } }
    },
    {
      stepId: "orders" as const,
      loadLabel: "Load order history",
      importSpy: () => harness.productStoreData.runProductStoreShopifyOrderHistoryImport,
      response: { data: { queued: true } }
    }
  ])("rejects an untrackable $stepId trigger response", async ({
    stepId,
    loadLabel,
    importSpy,
    response
  }) => {
    configureExistingShopifySetup(stepId)
    importSpy().mockResolvedValueOnce(response)
    const wrapper = await mountView({ productStoreId: "STORE" })

    await buttonNamed(wrapper, loadLabel).trigger("click")
    await flushPromises()
    await flushPromises()

    expect(harness.wizard.stepStatuses[stepId]).toBe("attention")
    expect(harness.wizard.runRequests[stepId]).toBeNull()
    expect(wrapper.text()).toContain("The sync request could not be tracked because the backend returned no tracking ID.")
    expect(wrapper.text()).not.toContain("Request accepted. Waiting for its sync run to appear.")
  })

  it.each(["inventory", "orders"] as const)(
    "treats a payload-level $stepId run failure as Needs attention",
    async (stepId) => {
      configureExistingShopifySetup(stepId)
      const labels = {
        inventory: "Load inventory",
        orders: "Load order history"
      }
      harness.productStoreData[
        stepId === "inventory"
          ? "runProductStoreShopifyInventoryReset"
          : "runProductStoreShopifyOrderHistoryImport"
      ].mockResolvedValueOnce({ hasError: true, errorMessages: ["Backend rejected the run"] })
      const wrapper = await mountView({ productStoreId: "STORE" })

      await buttonNamed(wrapper, labels[stepId]).trigger("click")
      await flushPromises()

      expect(harness.wizard.stepStatuses[stepId]).toBe("attention")
      expect(wrapper.text()).toContain("Backend rejected the run")
    }
  )

  it("demotes stale facilities, mappings, and job configuration only after successful evidence loads", async () => {
    harness.wizard.stepStatuses.facilities = "complete"
    harness.wizard.stepStatuses.locations = "complete"
    harness.wizard.stepStatuses.products = "complete"
    harness.wizard.stepStatuses.inventory = "complete"
    harness.wizard.stepStatuses.orders = "complete"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.productStoreData.fetchStatus = { facilities: "success", shopifyJobStatus: "success" }
    harness.productStoreData.currentFacilities = []
    harness.productStoreData.currentShopifyJobStatus = {
      productStoreId: "STORE",
      linkedShops: [],
      jobs: []
    }
    harness.shopifyLocations = []

    await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.stepStatuses.facilities).toBe("attention")
    expect(harness.wizard.stepStatuses.locations).toBe("attention")
    expect(harness.wizard.stepStatuses.products).toBe("attention")
    expect(harness.wizard.stepStatuses.inventory).toBe("attention")
    expect(harness.wizard.stepStatuses.orders).toBe("attention")
  })

  it("does not erase existing completion when authoritative facility or job refreshes fail", async () => {
    harness.wizard.stepStatuses.facilities = "complete"
    harness.wizard.stepStatuses.products = "complete"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.productStoreData.fetchStatus = { facilities: "error", shopifyJobStatus: "error" }
    harness.productStoreData.currentFacilities = []
    harness.productStoreData.currentShopifyJobStatus = null

    await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.stepStatuses.facilities).toBe("complete")
    expect(harness.wizard.stepStatuses.products).toBe("attention")
  })

  it("preserves a completed location step when its mapping refresh fails", async () => {
    configureExistingShopifySetup("inventory")
    harness.wizard.stepStatuses.locations = "complete"
    harness.fetchShopifyShopLocations.mockRejectedValueOnce(new Error("mapping fetch failed"))

    await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.stepStatuses.locations).toBe("complete")
  })

  it("demotes a completed location step when current evidence proves the Shopify link is gone", async () => {
    harness.wizard.stepStatuses.shopify = "complete"
    harness.wizard.stepStatuses.locations = "complete"
    harness.wizard.draft.linkedShopifyShopId = "SHOP"
    harness.wizard.draft.selectedShopifyShopId = "SHOP"
    harness.productStoreData.current = { productStoreId: "STORE" }
    harness.productStoreData.currentShopifyJobStatus = {
      productStoreId: "STORE",
      linkedShops: [],
      jobs: []
    }
    harness.productStoreData.fetchStatus.shopifyJobStatus = "success"

    await mountView({ productStoreId: "STORE" })

    expect(harness.wizard.stepStatuses.locations).toBe("attention")
  })

  it("keeps Finish blocked while any initial load has only queued evidence", async () => {
    for(const step of PRODUCT_STORE_ONBOARDING_STEPS) {
      if(step.id !== "readiness") {harness.wizard.stepStatuses[step.id] = "complete"}
    }
    harness.wizard.stepStatuses.products = "in-progress"
    harness.wizard.selectStep("readiness")
    const wrapper = await mountView()

    const finishButton = buttonNamed(wrapper, "Finish setup")
    expect((finishButton.element as any).disabled).toBe(true)
    expect(wrapper.text()).toContain("Queued imports are still in progress. Verify each initial load completes successfully before finishing.")
  })
})
