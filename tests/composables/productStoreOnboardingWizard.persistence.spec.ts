import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS,
  PRODUCT_STORE_ONBOARDING_STEP_IDS
} from "@/config/productStoreOnboarding"

const STORAGE_KEY = "company.productStoreOnboarding"
const LEGACY_STORAGE_KEY = "productStoreOnboarding"

const storage = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() }
})

async function importWizardGraph() {
  vi.resetModules()
  const [wizardModule, sessionScope] = await Promise.all([
    import("@/composables/useProductStoreOnboardingWizard"),
    import("@/composables/sessionScope")
  ])

  return {
    wizard: wizardModule.useProductStoreOnboardingWizard(),
    clearSessionScopedState: sessionScope.clearSessionScopedState
  }
}

function storedState() {
  const raw = localStorage.getItem(STORAGE_KEY)

  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  localStorage.clear()
})

describe("useProductStoreOnboardingWizard persistence", () => {
  it("defines the focused eight-step flow and excludes readiness from progress", async () => {
    const { wizard } = await importWizardGraph()

    expect(PRODUCT_STORE_ONBOARDING_STEP_IDS).toEqual([
      "name", "shopify", "products", "facilities", "locations", "inventory", "orders", "readiness"
    ])
    expect(wizard.totalStepCount).toBe(7)
    expect(PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS).not.toContain("readiness")
  })

  it("migrates legacy completion, removed steps, and draft fields safely", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentStepId: "general",
      createdProductStoreId: "STORE_1",
      completedStepIds: ["name", "general", "shopify", "routing", 42],
      draft: {
        storeName: "Acme",
        locale: "America / English",
        facilityMode: "One store",
        selectedWorkflows: ["routing"],
        orderSqsQueueName: "must-not-survive"
      }
    }))

    const { wizard } = await importWizardGraph()

    expect(wizard.currentStepId).toBe("name")
    expect(wizard.createdProductStoreId).toBe("STORE_1")
    expect(wizard.stepStatuses.name).toBe("complete")
    expect(wizard.stepStatuses.shopify).toBe("complete")
    expect(wizard.completedCount).toBe(2)
    expect(wizard.draft.storeName).toBe("Acme")
    expect(wizard.draft).not.toHaveProperty("selectedWorkflows")
    expect(wizard.draft).not.toHaveProperty("orderSqsQueueName")
    expect(wizard.draft.defaultCurrencyUomId).toBe("USD")
    expect(wizard.draft.locale).toBe("en_US")
    expect(wizard.draft.facilityMode).toBe("create")
  })

  it("migrates an in-flight draft from the retired Pinia key, then removes that key", async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({
      currentStepId: "shopify",
      completedStepIds: ["name"],
      draft: { storeName: "Legacy Store" }
    }))

    const { wizard } = await importWizardGraph()

    expect(wizard.currentStepId).toBe("shopify")
    expect(wizard.draft.storeName).toBe("Legacy Store")
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()

    wizard.updateDraftField("orderNumberPrefix", "LG")
    expect(storedState()?.draft.orderNumberPrefix).toBe("LG")
  })

  it("navigates without completing and changes status only through explicit actions", async () => {
    const { wizard } = await importWizardGraph()

    wizard.updateDraftField("storeName", "Acme Outdoor Supply Company")
    expect(wizard.draft.productStoreId).toBe("ACME_OUTDOOR_SUPPLY_")
    wizard.updateDraftField("storeName", "Renamed")
    expect(wizard.draft.productStoreId).toBe("ACME_OUTDOOR_SUPPLY_")

    wizard.goNext()
    expect(wizard.currentStepId).toBe("shopify")
    expect(wizard.completedCount).toBe(0)
    expect(wizard.progressValue).toBe(0)

    wizard.markStepInProgress("shopify")
    expect(wizard.stepStatuses.shopify).toBe("in-progress")
    wizard.markStepAttention("shopify")
    expect(wizard.stepStatuses.shopify).toBe("attention")
    wizard.markStepComplete("shopify")
    expect(wizard.stepStatuses.shopify).toBe("complete")
    expect(wizard.progressValue).toBeCloseTo(1 / PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS.length)

    wizard.markStepComplete("readiness")
    expect(wizard.completedCount).toBe(1)
    expect(wizard.progressValue).toBeCloseTo(1 / PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS.length)
  })

  it("resumes the same Product Store and clears state before initializing another", async () => {
    const { wizard } = await importWizardGraph()

    wizard.setCreatedProductStoreId("STORE_1")
    wizard.updateDraftField("storeName", "First Store")
    wizard.markStepComplete("name")
    wizard.initializeForProductStore("STORE_1")
    expect(wizard.draft.storeName).toBe("First Store")
    expect(wizard.stepStatuses.name).toBe("complete")

    wizard.initializeForProductStore("STORE_2")
    expect(wizard.createdProductStoreId).toBe("STORE_2")
    expect(wizard.draft.productStoreId).toBe("STORE_2")
    expect(wizard.draft.storeName).toBe("")
    expect(wizard.completedCount).toBe(0)

    wizard.updateDraftField("storeName", "Second Store")
    wizard.startNewSetup()
    expect(wizard.createdProductStoreId).toBe("")
    expect(wizard.draft.storeName).toBe("")
  })

  it("persists exact initial-load correlation within a store scope and clears it across scopes", async () => {
    const { wizard } = await importWizardGraph()
    wizard.setCreatedProductStoreId("STORE_1")
    wizard.setRunRequest("products", {
      shopId: "SHOP_1",
      setupSnapshot: "snapshot",
      baselineSystemMessageId: "M_OLD",
      systemMessageId: "M_NEW",
      jobRunId: "",
      requestedAt: 123
    })

    expect(storedState()?.runRequests.products.systemMessageId).toBe("M_NEW")

    const resumed = (await importWizardGraph()).wizard
    expect(resumed.runRequests.products).toMatchObject({ shopId: "SHOP_1", systemMessageId: "M_NEW" })
    resumed.initializeForProductStore("STORE_2")
    expect(resumed.runRequests.products).toBeNull()
  })

  it("recognizes a matching draft id as the same scope during legacy resume", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentStepId: "products",
      createdProductStoreId: "",
      completedStepIds: ["name", "shopify"],
      draft: { productStoreId: "LEGACY_STORE", storeName: "Legacy scoped store" }
    }))

    const { wizard } = await importWizardGraph()
    wizard.initializeForProductStore("LEGACY_STORE")

    expect(wizard.currentStepId).toBe("products")
    expect(wizard.draft.storeName).toBe("Legacy scoped store")
    expect(wizard.completedCount).toBe(2)
  })

  it("falls back after bad storage and clears persisted session state", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    const { wizard, clearSessionScopedState } = await importWizardGraph()

    expect(wizard.currentStepId).toBe("name")
    wizard.updateDraftField("storeName", "User A Store")
    wizard.markStepComplete("name")
    expect(storedState()?.draft.storeName).toBe("User A Store")

    clearSessionScopedState()
    expect(wizard.currentStepId).toBe("name")
    expect(wizard.completedCount).toBe(0)
    expect(wizard.draft.storeName).toBe("")
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
