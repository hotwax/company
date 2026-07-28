/**
 * Product store onboarding wizard — step/draft state, `store/productStoreOnboarding.ts` relocated.
 *
 * Same conversion as `useShopifyOrderSync` (see `useShopify.ts`): the Pinia store became a
 * module-level `reactive` bundle so every caller shares the one wizard, each getter became a
 * `computed`, each action a module function, and the returned surface is identical so the view's
 * `onboardingStore.member` accesses did not change.
 *
 * PERSISTENCE: the store was `persist: true` and that IS load-bearing here — users leave mid-wizard
 * and resume the draft after a reload. Reproduced explicitly: hydrate from localStorage at module
 * init (including a one-time read of the retired plugin's key, so an in-flight draft survives the
 * store-to-composable migration) and write on every change through a deep watch. Logout clears both
 * the state and the key via the `sessionScope` registry, which replaced the stores' `$reset()` calls.
 */

import { computed, reactive, toRefs, watch } from "vue"
import { PRODUCT_STORE_ONBOARDING_STEP_IDS, PRODUCT_STORE_ONBOARDING_STEPS } from "@/config/productStoreOnboarding"
import { generateInternalId } from "@/utils"
import { onSessionCleared } from "./sessionScope"

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
  locale: "America / English",
  timezone: "America/New_York",
  shopifyDomain: "",
  shopifyConnectionMode: "Prepare Shopify connection",
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
  primaryProductIdentification: "",
  secondaryProductIdentification: "",
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

const STORAGE_KEY = "company.productStoreOnboarding"
/** The retired Pinia persistence plugin keyed on the store id. Read once at init, then removed. */
const LEGACY_STORAGE_KEY = "productStoreOnboarding"

interface OnboardingWizardState {
  currentStepId: string
  createdProductStoreId: string
  completedStepIds: string[]
  draft: ProductStoreOnboardingDraft
}

function defaultWizardState(): OnboardingWizardState {
  return {
    currentStepId: "name",
    createdProductStoreId: "",
    completedStepIds: [],
    draft: { ...DEFAULT_DRAFT }
  }
}

function readStoredWizardState(): OnboardingWizardState {
  const base = defaultWizardState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    if (!raw) return base
    const stored = JSON.parse(raw)
    if (!stored || typeof stored !== "object") return base
    return {
      currentStepId: typeof stored.currentStepId === "string" && stored.currentStepId ? stored.currentStepId : base.currentStepId,
      createdProductStoreId: typeof stored.createdProductStoreId === "string" ? stored.createdProductStoreId : "",
      completedStepIds: Array.isArray(stored.completedStepIds) ? stored.completedStepIds.filter((id: any) => typeof id === "string") : [],
      // Merged over the defaults, like the plugin's `$patch` hydration: a draft persisted before a
      // field existed keeps that field's default instead of losing it.
      draft: { ...DEFAULT_DRAFT, ...(stored.draft && typeof stored.draft === "object" ? stored.draft : {}) }
    }
  } catch {
    // Unparseable storage (or no localStorage at all in a node test) — start clean.
    return base
  }
}

const state = reactive<OnboardingWizardState>(readStoredWizardState())

/**
 * Write-on-change replaces the persistence plugin's `$subscribe` writer. `flush: "sync"` so that a
 * reset-then-removeItem sequence (session clear below) ends with the key actually gone instead of a
 * queued flush re-writing it after the removal.
 */
watch(
  state,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentStepId: state.currentStepId,
        createdProductStoreId: state.createdProductStoreId,
        completedStepIds: state.completedStepIds,
        draft: state.draft
      }))
    } catch {
      // Quota or private mode — the wizard still works, it just will not resume after a reload.
    }
  },
  { deep: true, flush: "sync" }
)

// Module state survives an SPA logout — replaces the store's `$reset()`. The reset writes run
// synchronously (see the watcher), so removing the key afterwards leaves nothing behind.
onSessionCleared(() => {
  Object.assign(state, defaultWizardState())
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
})

const currentStep = computed(() => PRODUCT_STORE_ONBOARDING_STEPS.find((step) => step.id === state.currentStepId) || PRODUCT_STORE_ONBOARDING_STEPS[0])
const currentStepIndex = computed(() => PRODUCT_STORE_ONBOARDING_STEP_IDS.indexOf(state.currentStepId))
const completedCount = computed(() => state.completedStepIds.length)
const totalStepCount = computed(() => PRODUCT_STORE_ONBOARDING_STEPS.length)
const progressValue = computed(() => totalStepCount.value ? completedCount.value / totalStepCount.value : 0)

function selectStep(stepId: string) {
  if (PRODUCT_STORE_ONBOARDING_STEP_IDS.includes(stepId)) {
    state.currentStepId = stepId
  }
}

function updateDraftField(field: ProductStoreOnboardingStringField, value: string) {
  state.draft[field] = value

  if (field === "storeName" && value && !state.draft.productStoreId) {
    state.draft.productStoreId = generateInternalId(value).slice(0, 20)
  }
}

function toggleWorkflow(stepId: string, checked: boolean) {
  const selected = new Set(state.draft.selectedWorkflows)
  checked ? selected.add(stepId) : selected.delete(stepId)
  state.draft.selectedWorkflows = Array.from(selected)
}

function markCurrentStepComplete() {
  if (!state.completedStepIds.includes(state.currentStepId)) {
    state.completedStepIds.push(state.currentStepId)
  }
}

function setCreatedProductStoreId(productStoreId: string) {
  state.createdProductStoreId = productStoreId
}

function goNext() {
  markCurrentStepComplete()
  const nextStepId = PRODUCT_STORE_ONBOARDING_STEP_IDS[currentStepIndex.value + 1]
  if (nextStepId) state.currentStepId = nextStepId
}

function goPrevious() {
  const previousStepId = PRODUCT_STORE_ONBOARDING_STEP_IDS[currentStepIndex.value - 1]
  if (previousStepId) state.currentStepId = previousStepId
}

function resetDraft() {
  Object.assign(state, defaultWizardState())
}

/**
 * Returned as ONE `reactive` object so the view keeps store-style access — `onboardingStore.draft`,
 * `onboardingStore.currentStepIndex` — with reactivity intact. Same wrapper as `useShopifyOrderSync`:
 * `reactive()` unwraps the refs and computeds on property access, which a plain `{ ...state }` spread
 * would not (the caller would read a frozen snapshot of the primitives).
 */
export function useProductStoreOnboardingWizard() {
  return reactive({
    ...toRefs(state),
    // getters
    currentStep,
    currentStepIndex,
    completedCount,
    totalStepCount,
    progressValue,
    // actions
    selectStep,
    updateDraftField,
    toggleWorkflow,
    markCurrentStepComplete,
    setCreatedProductStoreId,
    goNext,
    goPrevious,
    resetDraft
  })
}
