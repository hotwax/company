import { defineStore } from "pinia"
import { PRODUCT_STORE_ONBOARDING_STEP_IDS, PRODUCT_STORE_ONBOARDING_STEPS } from "@/config/productStoreOnboarding"
import { generateInternalId } from "@/utils"

export interface ProductStoreOnboardingDraft {
  companyName: string
  storeName: string
  productStoreId: string
  defaultCurrencyUomId: string
  locale: string
  timezone: string
  shopifyDomain: string
  shopifyConnectionMode: string
  facilityMode: string
  productIdentifierEnumId: string
  inventorySource: string
  orderImportMode: string
  selectedWorkflows: string[]
}

type ProductStoreOnboardingStringField = Exclude<keyof ProductStoreOnboardingDraft, "selectedWorkflows">

const DEFAULT_DRAFT: ProductStoreOnboardingDraft = {
  companyName: "HotWax Retail",
  storeName: "Demo Product Store",
  productStoreId: "DEMO_PRODUCT_STORE",
  defaultCurrencyUomId: "USD",
  locale: "America / English",
  timezone: "America / English",
  shopifyDomain: "demo.myshopify.com",
  shopifyConnectionMode: "Prepare Shopify connection",
  facilityMode: "One store",
  productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU",
  inventorySource: "Shopify",
  orderImportMode: "Realtime and fallback batch",
  selectedWorkflows: ["routing", "pickup", "storeInventory"]
}

export const useProductStoreOnboardingStore = defineStore("productStoreOnboarding", {
  state: () => ({
    currentStepId: "name",
    completedStepIds: [] as string[],
    draft: { ...DEFAULT_DRAFT } as ProductStoreOnboardingDraft
  }),

  getters: {
    currentStep: (state) => PRODUCT_STORE_ONBOARDING_STEPS.find((step) => step.id === state.currentStepId) || PRODUCT_STORE_ONBOARDING_STEPS[0],
    currentStepIndex: (state) => PRODUCT_STORE_ONBOARDING_STEP_IDS.indexOf(state.currentStepId),
    completedCount: (state) => state.completedStepIds.length,
    totalStepCount: () => PRODUCT_STORE_ONBOARDING_STEPS.length,
    progressValue(): number {
      return this.totalStepCount ? this.completedCount / this.totalStepCount : 0
    }
  },

  actions: {
    selectStep(stepId: string) {
      if (PRODUCT_STORE_ONBOARDING_STEP_IDS.includes(stepId)) {
        this.currentStepId = stepId
      }
    },

    updateDraftField(field: ProductStoreOnboardingStringField, value: string) {
      this.draft[field] = value

      if (field === "storeName" && value && !this.draft.productStoreId) {
        this.draft.productStoreId = generateInternalId(value).slice(0, 20)
      }
    },

    toggleWorkflow(stepId: string, checked: boolean) {
      const selected = new Set(this.draft.selectedWorkflows)
      checked ? selected.add(stepId) : selected.delete(stepId)
      this.draft.selectedWorkflows = Array.from(selected)
    },

    markCurrentStepComplete() {
      if (!this.completedStepIds.includes(this.currentStepId)) {
        this.completedStepIds.push(this.currentStepId)
      }
    },

    goNext() {
      this.markCurrentStepComplete()
      const nextStepId = PRODUCT_STORE_ONBOARDING_STEP_IDS[this.currentStepIndex + 1]
      if (nextStepId) this.currentStepId = nextStepId
    },

    goPrevious() {
      const previousStepId = PRODUCT_STORE_ONBOARDING_STEP_IDS[this.currentStepIndex - 1]
      if (previousStepId) this.currentStepId = previousStepId
    },

    resetDraft() {
      this.currentStepId = "name"
      this.completedStepIds = []
      this.draft = { ...DEFAULT_DRAFT }
    }
  },

  persist: true
})
