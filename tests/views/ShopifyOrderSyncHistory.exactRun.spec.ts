// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, onMounted, ref } from "vue"

const harness = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  resetForShop: vi.fn(),
  onboardingBatches: null as any,
  onboardingImports: null as any,
  jobRuns: null as any,
  historySession: null as any,
  orderSync: {
    batches: [] as any[],
    importsBySystemMessageId: {} as Record<string, any[]>,
    hydrated: true,
    shop: { name: "Example shop" }
  }
}))

vi.mock("@common", () => ({
  translate: (key: string, parameters?: Record<string, unknown>) => parameters
    ? Object.entries(parameters).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      key
    )
    : key
}))

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (callback: () => unknown) => onMounted(callback)
}))

vi.mock("vue-router", () => ({
  useRoute: () => harness.route
}))

vi.mock("@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue", () => ({
  default: { template: "<div />" }
}))

vi.mock("@/composables/useShopify", () => ({
  ORDER_HISTORY_SYNC_FEATURE: { id: "order" },
  deriveSyncOverallState: () => "completed",
  deriveSyncProgress: () => [
    { state: "completed", successfulRecords: 0, failedRecords: 0, logCount: 0 },
    { state: "completed", successfulRecords: 0, failedRecords: 0, logCount: 0 }
  ],
  mergeOrderSyncHistoryBatches: (regular: any[], onboarding: any[]) => [...onboarding, ...regular],
  useShopifyOrderSync: () => ({
    ...harness.orderSync,
    resetForShop: harness.resetForShop
  }),
  useShopifyOrderSyncHistorySession: () => harness.historySession,
  useShopifySyncContext: () => ({ hydrated: ref(true), remoteIds: ref(["REMOTE-SHOP"]) }),
  useShopifySyncImports: () => ({ bySystemMessageId: harness.onboardingImports }),
  useShopifySyncMessages: () => ({ records: harness.onboardingBatches, hydrated: ref(true) })
}))

vi.mock("@/composables/useProductStoreOnboardingInitialLoad", () => ({
  onboardingInitialLoadJobName: (_kind: string, shopId: string) => `sync_ShopifyOrderHistory_${shopId}`,
  onboardingJobRunSystemMessageId: (_kind: string, run: any) => {
    const value = typeof run?.results === "string" ? JSON.parse(run.results) : run?.results

    return String(value?.queuedSystemMessageId || "")
  }
}))

vi.mock("@/composables/useServiceJobs", () => ({
  useServiceJobRunsByJob: () => ({
    runsFor: () => harness.jobRuns.value
  })
}))

describe("ShopifyOrderSyncHistory exact run context", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.route.query = {}
    harness.onboardingBatches = ref([])
    harness.onboardingImports = ref({})
    harness.jobRuns = ref([])
    harness.historySession = {
      isRefreshing: ref(false),
      manualRefresh: vi.fn()
    }
    harness.orderSync.batches = [
      {
        systemMessageId: "NEWER-MESSAGE",
        createdByJobRunId: "NEWER-JOB",
        statusId: "SmsgConsumed",
        initDate: "2026-08-12T12:00:00Z"
      },
      {
        systemMessageId: "REQUESTED-MESSAGE",
        createdByJobRunId: "REQUESTED-JOB",
        statusId: "SmsgConsumed",
        initDate: "2026-08-12T11:00:00Z"
      }
    ]
  })

  it("identifies and highlights the queried onboarding run instead of implying the newest run", async () => {
    harness.route.query = {
      systemMessageId: "REQUESTED-MESSAGE",
      jobRunId: "REQUESTED-JOB",
      returnTo: "/product-store-onboarding/STORE"
    }

    const View = (await import("@/views/ShopifyOrderSyncHistory.vue")).default
    const wrapper = mount(View, {
      props: { id: "SHOP" },
      global: { stubs: { IonBackButton: true } }
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain("Requested onboarding run")
    expect(wrapper.text()).toContain("System message: REQUESTED-MESSAGE")
    expect(wrapper.text()).toContain("Job run: REQUESTED-JOB")
    expect(wrapper.find(".requested-run").text()).toContain("REQUESTED-MESSAGE")
    expect(wrapper.find(".requested-run").text()).toContain("Requested run")
    expect(wrapper.find(".requested-run").text()).not.toContain("NEWER-MESSAGE")
  })

  it("keeps the accepted job id visible while its system message has not reached history", async () => {
    harness.route.query = { jobRunId: "PENDING-JOB" }

    const View = (await import("@/views/ShopifyOrderSyncHistory.vue")).default
    const wrapper = mount(View, {
      props: { id: "SHOP" },
      global: { stubs: { IonBackButton: true } }
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain("Job run: PENDING-JOB")
    expect(wrapper.text()).toContain("This run is not in the loaded sync history yet.")
    expect(wrapper.find(".requested-run").exists()).toBe(false)
  })

  it("converges from the exact job result to its message without selecting a newer unrelated run", async () => {
    harness.route.query = { jobRunId: "REQUESTED-JOB" }
    harness.orderSync.batches = []
    harness.onboardingBatches.value = [{
      systemMessageId: "NEWER-UNRELATED",
      statusId: "SmsgConsumed",
      initDate: "2026-08-12T12:00:00Z"
    }]

    const View = (await import("@/views/ShopifyOrderSyncHistory.vue")).default
    const wrapper = mount(View, {
      props: { id: "SHOP" },
      global: { stubs: { IonBackButton: true } }
    })
    await nextTick()
    expect(wrapper.find(".requested-run").exists()).toBe(false)

    harness.jobRuns.value = [{
      jobRunId: "REQUESTED-JOB",
      results: { queuedSystemMessageId: "REQUESTED-MESSAGE" }
    }]
    harness.onboardingBatches.value = [
      harness.onboardingBatches.value[0],
      {
        systemMessageId: "REQUESTED-MESSAGE",
        statusId: "SmsgConsumed",
        initDate: "2026-08-12T11:00:00Z"
      }
    ]
    harness.onboardingImports.value = {
      "REQUESTED-MESSAGE": [{
        logId: "HISTORY-LOG",
        configId: "BULK_ORDER_HISTORY",
        totalRecordCount: 10,
        successRecordCount: 10,
        failedRecordCount: 0
      }]
    }
    await nextTick()

    expect(wrapper.text()).toContain("System message: REQUESTED-MESSAGE")
    expect(wrapper.find(".requested-run").text()).toContain("REQUESTED-MESSAGE")
    expect(wrapper.find(".requested-run").text()).not.toContain("NEWER-UNRELATED")
    expect(wrapper.text()).toContain("Historic order import")
  })
})
