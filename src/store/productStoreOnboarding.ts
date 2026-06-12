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
  selectedShopifyShopId: string
  linkedShopifyShopId: string
  facilityMode: string
  autoApproveOrder: string
  orderNumberPrefix: string
  saveBillingInformation: string
  productIdentifierEnumId: string
  primaryProductIdentification: string
  secondaryProductIdentification: string
  inventorySource: string
  reserveInventory: string
  showSystemicInventory: string
  holdPreorderPhysicalInventory: string
  preorderFacilityGroupId: string
  orderImportMode: string
  selectedWorkflows: string[]
}

type ProductStoreOnboardingStringField = Exclude<keyof ProductStoreOnboardingDraft, "selectedWorkflows">

const DEFAULT_DRAFT: ProductStoreOnboardingDraft = {
  companyName: "",
  storeName: "",
  productStoreId: "",
  defaultCurrencyUomId: "USD",
  locale: "America / English",
  timezone: "America / English",
  shopifyDomain: "",
  shopifyConnectionMode: "Prepare Shopify connection",
  selectedShopifyShopId: "",
  linkedShopifyShopId: "",
  facilityMode: "One store",
  autoApproveOrder: "N",
  orderNumberPrefix: "HC",
  saveBillingInformation: "Y",
  productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU",
  primaryProductIdentification: "",
  secondaryProductIdentification: "",
  inventorySource: "Shopify",
  reserveInventory: "Y",
  showSystemicInventory: "true",
  holdPreorderPhysicalInventory: "false",
  preorderFacilityGroupId: "",
  orderImportMode: "Realtime and fallback batch",
  selectedWorkflows: ["routing", "pickup", "storeInventory"]
}

export const useProductStoreOnboardingStore = defineStore("productStoreOnboarding", {
  state: () => ({
    currentStepId: "name",
    createdProductStoreId: "",
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

    setCreatedProductStoreId(productStoreId: string) {
      this.createdProductStoreId = productStoreId
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
      this.createdProductStoreId = ""
      this.completedStepIds = []
      this.draft = { ...DEFAULT_DRAFT }
    }
  },

  persist: true
})
