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
  shopifyTokenSubjectUserLoginId: string
  shopifyTokenPurpose: string
  shopifyTokenExpireIn: string
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
  enableBrokering: string
  allowSplit: string
  sendFulfillmentNotification: string
  autoCancelOrders: string
  daysToCancelNonPay: string
  bopisPartialRejection: string
  customerDeliveryMethodUpdate: string
  rerouteShippingMethodId: string
  customerDeliveryAddressUpdate: string
  customerPickupUpdate: string
  customerCancelBeforeFulfillment: string
  orderImportMode: string
  orderHistoryStartDate: string
  orderLaunchDate: string
  orderSqsQueueName: string
  orderSqsAwsRemoteId: string
  orderSqsExpireLockTime: string
  selectedWorkflows: string[]
}

type ProductStoreOnboardingStringField = Exclude<keyof ProductStoreOnboardingDraft, "selectedWorkflows">

const DEFAULT_DRAFT: ProductStoreOnboardingDraft = {
  companyName: "",
  storeName: "",
  productStoreId: "",
  defaultCurrencyUomId: "USD",
  locale: "en_US",
  // Default to the user's browser timezone so a new product store starts with the right zone;
  // falls back to America/New_York if detection fails. (Existing stores load their saved zone.)
  timezone: (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
    } catch {
      return "America/New_York"
    }
  })(),
  shopifyDomain: "",
  shopifyConnectionMode: "Use existing Shopify shop",
  selectedShopifyShopId: "",
  linkedShopifyShopId: "",
  shopifyTokenSubjectUserLoginId: "nifi",
  shopifyTokenPurpose: "SHOPIFY_APP_HANDOFF",
  shopifyTokenExpireIn: "2592000",
  facilityMode: "One store",
  autoApproveOrder: "N",
  orderNumberPrefix: "HC",
  saveBillingInformation: "Y",
  productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU",
  primaryProductIdentification: "SKU",
  secondaryProductIdentification: "UPCA",
  inventorySource: "Shopify",
  reserveInventory: "Y",
  showSystemicInventory: "true",
  holdPreorderPhysicalInventory: "false",
  preorderFacilityGroupId: "",
  enableBrokering: "Y",
  allowSplit: "N",
  sendFulfillmentNotification: "Y",
  autoCancelOrders: "N",
  daysToCancelNonPay: "",
  bopisPartialRejection: "false",
  customerDeliveryMethodUpdate: "false",
  rerouteShippingMethodId: "",
  customerDeliveryAddressUpdate: "false",
  customerPickupUpdate: "false",
  customerCancelBeforeFulfillment: "false",
  orderImportMode: "Realtime and fallback batch",
  orderHistoryStartDate: "",
  orderLaunchDate: "",
  orderSqsQueueName: "",
  orderSqsAwsRemoteId: "AWS_CONFIG",
  orderSqsExpireLockTime: "10",
  selectedWorkflows: ["routing", "pickup", "storeInventory"]
}

export const useProductStoreOnboardingStore = defineStore("productStoreOnboarding", {
  state: () => ({
    currentStepId: "name",
    createdProductStoreId: "",
    completedStepIds: [] as string[],
    // Tracks whether the user has hand-edited the product store ID. Until they do, the ID
    // mirrors the store name; once edited we stop overwriting their choice.
    productStoreIdEdited: false,
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

      if (field === "productStoreId") {
        // A non-empty manual value locks the ID; clearing it resumes auto-derivation.
        this.productStoreIdEdited = value.trim().length > 0
      }

      if (field === "storeName" && !this.productStoreIdEdited) {
        this.draft.productStoreId = value ? generateInternalId(value).slice(0, 20) : ""
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
      this.productStoreIdEdited = false
      this.draft = { ...DEFAULT_DRAFT }
    }
  },

  // Connection modes were reduced to two ("Use existing Shopify shop" / "Authenticate new shop").
  // Coerce any persisted value from a removed mode (e.g. the old "Prepare Shopify connection"
  // default or "Connect now") so returning users don't hydrate into a mode with no valid radio.
  persist: {
    afterHydrate: (ctx: any) => {
      const mode = ctx.store.draft?.shopifyConnectionMode
      if (mode !== "Use existing Shopify shop" && mode !== "Authenticate new shop") {
        ctx.store.draft.shopifyConnectionMode = "Use existing Shopify shop"
      }
    }
  }
})
