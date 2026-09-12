// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { RouteRecordRaw } from "vue-router"

const routerHarness = vi.hoisted(() => ({
  routes: [] as RouteRecordRaw[],
  beforeEach: vi.fn(),
}))
const storage = new Map<string, string>()
let wizardModule: typeof import("@/composables/useProductStoreOnboardingWizard")
let routerModule: typeof import("@/router")

vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
})

vi.mock("@ionic/vue-router", () => ({
  createWebHistory: vi.fn(() => ({})),
  createRouter: vi.fn((options: { routes: RouteRecordRaw[] }) => {
    routerHarness.routes = options.routes

    return { beforeEach: routerHarness.beforeEach }
  }),
}))

vi.mock("@common/composables/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: { value: true },
    checkAppVersionRedirect: vi.fn(() => false),
  }),
}))

vi.mock("@common/index", () => ({
  Login: {},
  commonUtil: { showToast: vi.fn() },
  translate: (value: string) => value,
}))

vi.mock("@/store/user", () => ({
  useUserStore: () => ({ hasPermission: vi.fn(() => true) }),
}))

beforeAll(async () => {
  wizardModule = await import("@/composables/useProductStoreOnboardingWizard")
  routerModule = await import("@/router")
})

beforeEach(() => {
  localStorage.clear()
  wizardModule.useProductStoreOnboardingWizard().startNewSetup()
  routerHarness.beforeEach.mockClear()
})

describe("Product Store onboarding route contract", () => {
  it("treats the legacy create URL as a fresh-start command without persisting a query flag", () => {
    const wizard = wizardModule.useProductStoreOnboardingWizard()
    wizard.setCreatedProductStoreId("OLD_STORE")
    wizard.updateDraftField("storeName", "Previously persisted store")
    wizard.markStepComplete("name")

    const query = { returnTo: "/product-store", source: "legacy-link" }
    const redirect = routerModule.redirectLegacyProductStoreCreation({
      query,
      hash: "#store-details",
    })

    expect(wizard.createdProductStoreId).toBe("")
    expect(wizard.scopedProductStoreId).toBe("")
    expect(wizard.draft.storeName).toBe("")
    expect(wizard.stepStatuses.name).toBe("not-started")
    expect(redirect).toEqual({
      name: "ProductStoreOnboarding",
      query,
      hash: "#store-details",
    })
    expect(redirect.query).toBe(query)
    expect(Object.keys(redirect.query)).not.toContain("freshSetup")

    const legacyRoute = routerHarness.routes.find((route) => route.name === "CreateProductStore")
    expect(legacyRoute?.redirect).toBe(routerModule.redirectLegacyProductStoreCreation)
  })

  it("keeps the canonical base route resumable and the id route explicitly scoped", () => {
    const wizard = wizardModule.useProductStoreOnboardingWizard()
    wizard.updateDraftField("storeName", "Resumable draft")
    wizard.selectStep("products")

    const baseRoute = routerHarness.routes.find((route) => route.name === "ProductStoreOnboarding")
    const scopedRoute = routerHarness.routes.find((route) => route.name === "ProductStoreOnboardingForStore")

    expect(baseRoute?.path).toBe("/product-store-onboarding")
    expect(baseRoute).not.toHaveProperty("redirect")
    expect(wizard.draft.storeName).toBe("Resumable draft")
    expect(wizard.currentStepId).toBe("products")

    expect(scopedRoute?.path).toBe("/product-store-onboarding/:productStoreId")
    expect(scopedRoute?.props).toBe(true)

    wizard.initializeForProductStore("STORE_2")
    expect(wizard.scopedProductStoreId).toBe("STORE_2")
    expect(wizard.draft.productStoreId).toBe("STORE_2")
    expect(wizard.draft.storeName).toBe("")
  })
})
