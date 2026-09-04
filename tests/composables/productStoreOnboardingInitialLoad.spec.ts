import { beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, ref } from "vue"
import { useCacheSync } from "@/composables/useCacheSync"
import {
  ONBOARDING_INITIAL_LOAD_CONTRACTS,
  deriveOnboardingInitialLoadSnapshot,
  onboardingInitialLoadJobName,
  onboardingJobRunSystemMessageId,
  sanitizeOnboardingSyncDiagnostic,
  selectOnboardingInitialLoadRun,
  useProductStoreOnboardingInitialLoad
} from "@/composables/useProductStoreOnboardingInitialLoad"
import { useServiceJobRunsByJob } from "@/composables/useServiceJobs"
import {
  syncFeatureDomains,
  useShopifyProductSyncRun,
  useShopifyProductSyncRunState,
  useShopifySyncContext,
  useShopifySyncRuns
} from "@/composables/useShopify"

vi.mock("@/composables/useShopify", () => ({
  PRODUCT_SYNC_FEATURE: { activePollMs: 10_000 },
  PRODUCT_SYNC_REQUEST_MESSAGE_TYPE: "BulkQueryShopifyProductUpdates",
  PRODUCT_SYNC_RUN_WINDOW: 200,
  productSyncExtraDomains: vi.fn(() => []),
  syncFeatureDomains: vi.fn(() => []),
  useShopifyProductSyncRun: vi.fn(),
  useShopifyProductSyncRunState: vi.fn(),
  useShopifySyncContext: vi.fn(),
  useShopifySyncRuns: vi.fn()
}))

vi.mock("@/composables/useCacheSync", () => ({ useCacheSync: vi.fn() }))
vi.mock("@/composables/useServiceJobs", () => ({ useServiceJobRunsByJob: vi.fn() }))
vi.mock("@/utils", () => ({ formatDateTime: (value: unknown) => String(value) }))

function arrangeLiveInitialLoadScope(options: {
  contextHydrated: boolean
  remoteIds: string[]
  cachedProductRun?: Record<string, unknown>
}) {
  const fetchSyncRun = vi.fn().mockResolvedValue(undefined)
  const clearSyncRun = vi.fn()
  const start = vi.fn().mockResolvedValue(undefined)
  const stop = vi.fn()
  const syncNow = vi.fn().mockResolvedValue(undefined)
  const afterMutation = vi.fn().mockResolvedValue(undefined)
  const busy = ref(true)
  const manualRefreshing = ref(false)

  vi.mocked(useShopifySyncContext).mockReturnValue({
    shop: ref(null),
    productStore: ref(null),
    remote: ref(null),
    remoteId: ref(options.remoteIds[0] ?? ""),
    remoteIds: ref(options.remoteIds),
    shopId: ref("SHOP"),
    hydrated: ref(options.contextHydrated)
  } as any)
  vi.mocked(useShopifyProductSyncRunState).mockReturnValue({
    runState: ref({
      systemMessages: options.cachedProductRun ? [options.cachedProductRun] : [],
      latestSystemMessage: options.cachedProductRun ?? null,
      latestConfirmedSystemMessage: null,
      latestConsumedSystemMessage: null,
      lastSyncedAt: ""
    }),
    hydrated: ref(true)
  } as any)
  vi.mocked(useShopifyProductSyncRun).mockReturnValue({
    currentSyncRun: ref(null),
    fetchSyncRun,
    clearSyncRun
  } as any)
  vi.mocked(useShopifySyncRuns).mockReturnValue({
    records: ref([]),
    spine: ref([]),
    hydrated: ref(true)
  } as any)
  vi.mocked(useServiceJobRunsByJob).mockReturnValue({
    runsFor: () => [],
    hydrated: ref(true)
  } as any)
  vi.mocked(useCacheSync).mockReturnValue({
    start,
    stop,
    syncNow,
    afterMutation,
    busy,
    manualRefreshing,
    error: ref(""),
    lastSyncAt: ref(null)
  } as any)

  return { fetchSyncRun, clearSyncRun, start, stop, syncNow, afterMutation, busy, manualRefreshing }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(syncFeatureDomains).mockReturnValue([])
})

describe("useProductStoreOnboardingInitialLoad shop scope", () => {
  it.each([
    { contextHydrated: false, remoteIds: ["STALE-CACHED-REMOTE"] },
    { contextHydrated: true, remoteIds: [] }
  ])("does not poll or mark empty data authoritative without a resolved selected-shop scope", async (options) => {
    const mocks = arrangeLiveInitialLoadScope({
      ...options,
      cachedProductRun: { systemMessageId: "CACHED-RUN", statusId: "SmsgConsumed" }
    })
    const scope = effectScope()
    const initialLoad = scope.run(() => useProductStoreOnboardingInitialLoad(() => "SHOP"))!

    await initialLoad.activate()

    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.syncNow).not.toHaveBeenCalled()
    expect(mocks.fetchSyncRun).not.toHaveBeenCalled()
    expect(initialLoad.scopeRefreshed.value).toBe(false)
    expect(initialLoad.products.value.hydrated).toBe(false)
    expect(initialLoad.inventory.value.hydrated).toBe(false)
    expect(initialLoad.orders.value.hydrated).toBe(false)

    initialLoad.deactivate()
    scope.stop()
  })

  it("passes the selected shop's exact remotes to every SystemMessage domain activation", async () => {
    const mocks = arrangeLiveInitialLoadScope({
      contextHydrated: true,
      remoteIds: ["SHOP-REMOTE-B", "SHOP-REMOTE-A"]
    })
    vi.mocked(syncFeatureDomains).mockReturnValue([
      {
        name: "systemMessage",
        intervalMs: 10_000,
        args: { types: [{ systemMessageTypeId: "BulkQueryShopifyProductUpdates" }] }
      },
      {
        name: "dataManagerLog",
        intervalMs: 10_000,
        args: { configId: "SYNC_SHOPIFY_PRODUCT" }
      }
    ])
    const scope = effectScope()
    const initialLoad = scope.run(() => useProductStoreOnboardingInitialLoad(() => "SHOP"))!

    await initialLoad.activate()

    const domains = mocks.start.mock.calls[0][0]
    const systemMessageDomains = domains.filter((domain: any) => domain.name === "systemMessage")
    expect(systemMessageDomains).toHaveLength(2)
    expect(systemMessageDomains).toEqual(expect.arrayContaining([
      expect.objectContaining({
        args: expect.objectContaining({
          systemMessageRemoteIds: ["SHOP-REMOTE-B", "SHOP-REMOTE-A"],
          types: [{ systemMessageTypeId: "BulkQueryShopifyProductUpdates" }]
        })
      }),
      expect.objectContaining({
        args: expect.objectContaining({
          systemMessageRemoteIds: ["SHOP-REMOTE-B", "SHOP-REMOTE-A"],
          types: [
            expect.objectContaining({ systemMessageTypeId: "BulkQueryShopifyInventoryReset" }),
            expect.objectContaining({ systemMessageTypeId: "BulkOrderHistoryQuery" })
          ]
        })
      })
    ]))
    expect(mocks.syncNow).toHaveBeenCalledOnce()
    expect(initialLoad.scopeRefreshed.value).toBe(true)
    expect(initialLoad.products.value.hydrated).toBe(true)

    initialLoad.deactivate()
    scope.stop()
  })

  it("does not expose background cache activity as a manual refresh", () => {
    const mocks = arrangeLiveInitialLoadScope({
      contextHydrated: true,
      remoteIds: ["SHOP-REMOTE"]
    })
    const scope = effectScope()
    const initialLoad = scope.run(() => useProductStoreOnboardingInitialLoad(() => "SHOP"))!

    expect(mocks.busy.value).toBe(true)
    expect(initialLoad.refreshing.value).toBe(false)

    mocks.manualRefreshing.value = true
    expect(initialLoad.refreshing.value).toBe(true)

    scope.stop()
  })
})

describe("deriveOnboardingInitialLoadSnapshot", () => {
  it("does not infer completion from a consumed trigger without exact import evidence", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "inventory",
      shopId: "SHOP",
      hydrated: true,
      run: {
        systemMessageId: "M100",
        statusId: "SmsgConsumed",
        systemMessage: { systemMessageId: "M100", statusId: "SmsgConsumed" }
      }
    })

    expect(snapshot.run.status).toBe("unknown")
    expect(snapshot.run.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "system-message", status: "completed" }),
      expect.objectContaining({ id: "hotwax-import", status: "unavailable" })
    ]))
    expect(snapshot.details.configId).toBe("RESET_SHOPIFY_INVENTORY")
  })

  it.each([
    ["SmsgReceived", "queued"],
    ["SmsgConsuming", "running"]
  ])("keeps the valid %s system-message state in progress", (statusId, expectedStatus) => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "inventory",
      shopId: "SHOP",
      hydrated: true,
      run: {
        systemMessageId: "M-IN-PROGRESS",
        statusId,
        systemMessage: { systemMessageId: "M-IN-PROGRESS", statusId }
      }
    })

    expect(snapshot.run.status).toBe(expectedStatus)
    expect(snapshot.run.stages).toContainEqual(expect.objectContaining({
      id: "system-message",
      status: expectedStatus
    }))
  })

  it("reports inventory complete only from its exact joined DataManager log", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "inventory",
      shopId: "SHOP",
      hydrated: true,
      run: {
        systemMessageId: "M101",
        statusId: "SmsgConsumed",
        configId: "RESET_SHOPIFY_INVENTORY",
        logId: "L101",
        logStatusId: "DmlsFinished",
        totalRecordCount: 120,
        failedRecordCount: 0
      }
    })

    expect(snapshot.run.status).toBe("completed")
    expect(snapshot.run.totalRecordCount).toBe(120)
    expect(snapshot.details.logId).toBe("L101")
    expect(snapshot.details.route).toBeNull()
  })

  it("carries the authoritative ServiceJobRun correlation from the SystemMessage", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "inventory",
      shopId: "SHOP",
      hydrated: true,
      run: {
        systemMessageId: "M-JOB",
        statusId: "SmsgConsumed",
        systemMessage: {
          systemMessageId: "M-JOB",
          statusId: "SmsgConsumed",
          createdByJobRunId: "JR-100"
        },
        configId: "RESET_SHOPIFY_INVENTORY",
        logId: "L-JOB",
        logStatusId: "DmlsFinished"
      }
    })

    expect(snapshot.details.jobRunId).toBe("JR-100")
  })

  it("rejects a nearby order log from the wrong DataManager config", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "orders",
      shopId: "SHOP",
      hydrated: true,
      run: {
        systemMessageId: "M200",
        statusId: "SmsgConsumed",
        configId: "SYNC_SHOPIFY_ORDER",
        logId: "L200",
        logStatusId: "DmlsFinished",
        totalRecordCount: 40
      }
    })

    expect(snapshot.run.status).toBe("unknown")
    expect(snapshot.run.totalRecordCount).toBeUndefined()
    expect(snapshot.details.logId).toBe("")
    expect(snapshot.details.route).toBe("/shopify-connection-details/SHOP/order-sync/history")
  })

  it("reports order history completion from the exact seeded config", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "orders",
      shopId: "SHOP A",
      hydrated: true,
      run: {
        systemMessageId: "M201",
        statusId: "SmsgConsumed",
        configId: "BULK_ORDER_HISTORY",
        logId: "L201",
        mdmLog: {
          logId: "L201",
          configId: "BULK_ORDER_HISTORY",
          statusId: "DmlsFinished",
          totalRecordCount: 15,
          failedRecordCount: 0,
          finishDateTime: "2026-08-12 10:00:00"
        }
      }
    })

    expect(snapshot.run.status).toBe("completed")
    expect(snapshot.details.configId).toBe("BULK_ORDER_HISTORY")
    expect(snapshot.details.route).toBe("/shopify-connection-details/SHOP%20A/order-sync/history")
  })

  it("uses the existing Product Sync detailed model including a proven empty import", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "products",
      shopId: "SHOP",
      hydrated: true,
      run: { systemMessageId: "M300", statusId: "SmsgConsumed" },
      productRun: {
        systemMessageId: "M300",
        completed: true,
        systemMessage: { statusId: "SmsgConsumed" },
        bulkOperation: {
          id: "gid://shopify/BulkOperation/300",
          status: "COMPLETED",
          objectCount: 0
        },
        mdmLog: { statusId: "skipped" }
      }
    })

    expect(snapshot.run.status).toBe("completed")
    expect(snapshot.run.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "shopify-bulk-operation", status: "completed", totalRecordCount: 0 }),
      expect.objectContaining({
        id: "hotwax-import",
        status: "skipped",
        detail: "No records found",
        totalRecordCount: 0
      })
    ]))
    expect(snapshot.details.route).toBe("/shopify-connection-details/SHOP/product-sync")
  })

  it("does not accept a Product Sync detail log from another config", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "products",
      shopId: "SHOP",
      hydrated: true,
      run: { systemMessageId: "M301", statusId: "SmsgConsumed" },
      productRun: {
        systemMessageId: "M301",
        systemMessage: { statusId: "SmsgConsumed" },
        mdmLog: {
          id: "L301",
          configId: "UNRELATED_IMPORT",
          statusId: "DmlsFinished",
          finishDateTime: "2026-08-12 10:00:00"
        }
      }
    })

    expect(snapshot.run.status).toBe("unknown")
    expect(snapshot.details.logId).toBe("")
  })

  it("distinguishes loading from a hydrated first run", () => {
    const loading = deriveOnboardingInitialLoadSnapshot({
      kind: "products",
      shopId: "SHOP",
      hydrated: false
    })
    const empty = deriveOnboardingInitialLoadSnapshot({
      kind: "products",
      shopId: "SHOP",
      hydrated: true
    })

    expect(loading.run.status).toBe("unknown")
    expect(empty.run.status).toBe("not-started")
    expect(empty.run.stages).toHaveLength(0)
  })

  it("pins the source contracts to the proven message and config ids", () => {
    expect(ONBOARDING_INITIAL_LOAD_CONTRACTS).toMatchObject({
      products: {
        systemMessageTypeId: "BulkQueryShopifyProductUpdates",
        configId: "SYNC_SHOPIFY_PRODUCT"
      },
      inventory: {
        systemMessageTypeId: "BulkQueryShopifyInventoryReset",
        configId: "RESET_SHOPIFY_INVENTORY"
      },
      orders: {
        systemMessageTypeId: "BulkOrderHistoryQuery",
        configId: "BULK_ORDER_HISTORY"
      }
    })
  })

  it("parses the exact inventory and order message result keys", () => {
    expect(onboardingJobRunSystemMessageId("inventory", {
      results: JSON.stringify({ systemMessageId: "INV-MESSAGE", queuedSystemMessageId: "WRONG" })
    })).toBe("INV-MESSAGE")
    expect(onboardingJobRunSystemMessageId("orders", {
      results: { systemMessageId: "WRONG", queuedSystemMessageId: "ORDER-MESSAGE" }
    })).toBe("ORDER-MESSAGE")
    expect(onboardingJobRunSystemMessageId("inventory", { results: "not-json" })).toBe("")
  })

  it("uses deterministic per-shop initial-load job names", () => {
    expect(onboardingInitialLoadJobName("inventory", "SHOP")).toBe("sync_ShopifyInventoryReset_SHOP")
    expect(onboardingInitialLoadJobName("orders", "SHOP")).toBe("sync_ShopifyOrderHistory_SHOP")
  })

  it("selects only the persisted product request message instead of the latest run", () => {
    const selected = selectOnboardingInitialLoadRun({
      kind: "products",
      shopId: "SHOP",
      runs: [
        { systemMessageId: "NEWER-UNRELATED" },
        { systemMessageId: "REQUESTED" }
      ],
      request: {
        shopId: "SHOP",
        setupSnapshot: "setup",
        baselineSystemMessageId: "BASELINE",
        systemMessageId: "REQUESTED",
        jobRunId: "",
        requestedAt: 1
      }
    })

    expect(selected.run?.systemMessageId).toBe("REQUESTED")
    expect(selected.systemMessageId).toBe("REQUESTED")
  })

  /**
   * Runs are scoped to the SHOP, never to the Product Store, so a shop reconnected to a new store
   * still carries the previous store's runs. Attributing one to this setup showed a brand-new store
   * a three-day-old failed import as its "current or last run".
   */
  it("claims no run at all when this setup never requested one, whatever the shop's history holds", () => {
    const selected = selectOnboardingInitialLoadRun({
      kind: "products",
      shopId: "SHOP",
      runs: [
        { systemMessageId: "NEWER-PENDING-POLL", statusId: "SmsgProduced" },
        {
          systemMessageId: "HISTORICAL-IMPORT",
          logId: "L100",
          logStatusId: "DmlsFinished",
          statusId: "SmsgConsumed"
        }
      ]
    })

    expect(selected).toEqual({ run: null, jobRun: null, systemMessageId: "" })
  })

  it("correlates inventory through the exact requested ServiceJobRun and its result message", () => {
    const selected = selectOnboardingInitialLoadRun({
      kind: "inventory",
      shopId: "SHOP",
      runs: [
        { systemMessageId: "LATEST-UNRELATED" },
        { systemMessageId: "EXACT-INVENTORY" }
      ],
      jobRuns: [
        { jobRunId: "LATEST-JOB", results: { systemMessageId: "LATEST-UNRELATED" } },
        { jobRunId: "REQUESTED-JOB", results: { systemMessageId: "EXACT-INVENTORY" } }
      ],
      request: {
        shopId: "SHOP",
        setupSnapshot: "setup",
        baselineSystemMessageId: "BASELINE",
        systemMessageId: "",
        jobRunId: "REQUESTED-JOB",
        requestedAt: 1
      }
    })

    expect(selected.jobRun?.jobRunId).toBe("REQUESTED-JOB")
    expect(selected.systemMessageId).toBe("EXACT-INVENTORY")
    expect(selected.run?.systemMessageId).toBe("EXACT-INVENTORY")
  })

  it("never falls back to a nearby run while an order request is unresolved", () => {
    const selected = selectOnboardingInitialLoadRun({
      kind: "orders",
      shopId: "SHOP",
      runs: [{ systemMessageId: "LATEST-UNRELATED" }],
      jobRuns: [{ jobRunId: "LATEST-JOB", results: { queuedSystemMessageId: "LATEST-UNRELATED" } }],
      request: {
        shopId: "SHOP",
        setupSnapshot: "setup",
        baselineSystemMessageId: "BASELINE",
        systemMessageId: "",
        jobRunId: "REQUESTED-JOB",
        requestedAt: 1
      }
    })

    expect(selected).toEqual({ run: null, jobRun: null, systemMessageId: "" })
  })

  it.each([
    [{ jobRunId: "JOB", startTime: 1 }, "running"],
    [{ jobRunId: "JOB", startTime: 1, hasError: "Y", errors: "boom" }, "error"],
    [{ jobRunId: "JOB", startTime: 1, endTime: 2, results: {} }, "unavailable"]
  ])("reports requested ServiceJobRun state without inventing a SystemMessage", (jobRun, expected) => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "orders",
      shopId: "SHOP",
      hydrated: true,
      request: {
        shopId: "SHOP",
        setupSnapshot: "setup",
        baselineSystemMessageId: "BASELINE",
        systemMessageId: "",
        jobRunId: "JOB",
        requestedAt: 1
      },
      jobRun,
      jobRunHydrated: true
    })

    expect(snapshot.run.status).toBe(expected)
    expect(snapshot.details.systemMessageId).toBe("")
    expect(snapshot.run.stages).toContainEqual(expect.objectContaining({
      id: "service-job",
      status: expected
    }))
    expect(snapshot.run.stages.some((stage) => stage.id === "system-message")).toBe(false)
  })

  it.each([
    [
      "products" as const,
      {
        shopId: "SHOP",
        setupSnapshot: "setup",
        baselineSystemMessageId: "BASELINE",
        systemMessageId: "REQUESTED-MESSAGE",
        jobRunId: "",
        requestedAt: 1
      }
    ],
    [
      "inventory" as const,
      {
        shopId: "SHOP",
        setupSnapshot: "setup",
        baselineSystemMessageId: "BASELINE",
        systemMessageId: "",
        jobRunId: "REQUESTED-JOB",
        requestedAt: 1
      }
    ]
  ])("keeps persisted %s request ids out of evidence details until their cache row appears", (kind, request) => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind,
      shopId: "SHOP",
      hydrated: true,
      request,
      jobRunHydrated: true
    })

    expect(snapshot.details.systemMessageId).toBe("")
    expect(snapshot.details.jobRunId).toBe("")
    if(kind === "inventory") {
      expect(snapshot.run.stages).toContainEqual(expect.objectContaining({
        id: "service-job",
        detail: "REQUESTED-JOB"
      }))
    }
  })

  it("surfaces safe inventory job diagnostics and recovery actions", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "inventory",
      shopId: "SHOP",
      hydrated: true,
      request: {
        shopId: "SHOP",
        setupSnapshot: "setup",
        baselineSystemMessageId: "BASELINE",
        systemMessageId: "",
        jobRunId: "JOB",
        requestedAt: 1
      },
      jobRun: {
        jobRunId: "JOB",
        startTime: 1,
        endTime: 2,
        hasError: "Y",
        errors: ["Inventory request rejected", { message: "Remote shop is unavailable" }],
        responseMessage: "Run did not queue a system message",
        results: { token: "sensitive-value", status: "failed" }
      },
      jobRunHydrated: true
    })

    expect(snapshot.run.status).toBe("error")
    expect(snapshot.details.jobRunId).toBe("JOB")
    expect(snapshot.run.recoveryHint)
      .toBe("Refresh status to check for newer evidence. Retry starts a new inventory load.")
    expect(snapshot.run.stages).toContainEqual(expect.objectContaining({
      id: "service-job",
      status: "error",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ label: "Errors", detail: expect.stringContaining("Inventory request rejected") }),
        expect.objectContaining({ label: "Message", detail: "Run did not queue a system message" }),
        expect.objectContaining({ label: "Error details", detail: expect.stringContaining("[redacted]") })
      ])
    }))
  })

  it("surfaces an available correlated inventory SystemMessage error", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "inventory",
      shopId: "SHOP",
      hydrated: true,
      run: {
        systemMessageId: "MESSAGE-FAILED",
        statusId: "SmsgError",
        systemMessage: {
          systemMessageId: "MESSAGE-FAILED",
          statusId: "SmsgError",
          errorMessage: "Shopify rejected the inventory request.",
          messageText: "Inventory reset request for SHOP"
        }
      }
    })

    expect(snapshot.run.status).toBe("error")
    expect(snapshot.run.stages).toContainEqual(expect.objectContaining({
      id: "system-message",
      status: "error",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ label: "Errors", detail: "Shopify rejected the inventory request." }),
        expect.objectContaining({ label: "Message", detail: "Inventory reset request for SHOP" })
      ])
    }))
  })

  it("surfaces available correlated inventory import failure evidence", () => {
    const snapshot = deriveOnboardingInitialLoadSnapshot({
      kind: "inventory",
      shopId: "SHOP",
      hydrated: true,
      run: {
        systemMessageId: "MESSAGE-IMPORTED",
        statusId: "SmsgConsumed",
        configId: "RESET_SHOPIFY_INVENTORY",
        logId: "LOG-FAILED",
        mdmLog: {
          logId: "LOG-FAILED",
          configId: "RESET_SHOPIFY_INVENTORY",
          statusId: "DmlsFailed",
          failedRecordCount: 8,
          errorMessage: "Facility mapping was not found.",
          raw: { reason: "Unknown Shopify location" }
        }
      }
    })

    expect(snapshot.run.status).toBe("error")
    expect(snapshot.run.failedRecordCount).toBe(8)
    expect(snapshot.run.stages).toContainEqual(expect.objectContaining({
      id: "hotwax-import",
      status: "error",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ label: "Errors", detail: "Facility mapping was not found." }),
        expect.objectContaining({ label: "Error details", detail: expect.stringContaining("Unknown Shopify location") })
      ])
    }))
  })

  it("bounds and redacts raw diagnostic values before exposing them", () => {
    const long = `Bearer ${"a".repeat(40)} ${"x".repeat(700)}`
    const diagnostic = sanitizeOnboardingSyncDiagnostic({
      authorization: "Bearer private-token",
      nested: {
        password: "secret",
        endpoint: "https://operator:private-password@example.com/inventory",
        message: long
      }
    })

    expect(diagnostic).toContain("[redacted]")
    expect(diagnostic).not.toContain("private-token")
    expect(diagnostic).not.toContain("secret")
    expect(diagnostic).not.toContain("private-password")
    expect(diagnostic).not.toContain("a".repeat(40))
    expect(diagnostic.length).toBeLessThanOrEqual(600)
  })
})
