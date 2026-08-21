/**
 * Product Store onboarding navigation and persisted draft state.
 *
 * Completion is explicit: moving between steps never changes their status. The state is scoped to
 * one Product Store once an id is known, preventing an edit route from reusing another store's
 * draft. Entering the base route does not reset anything, so an unfinished new-store draft resumes.
 */

import { computed, reactive, toRefs, watch } from "vue"
import {
  PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS,
  PRODUCT_STORE_ONBOARDING_STEPS,
  PRODUCT_STORE_ONBOARDING_STEP_IDS,
  type ProductStoreOnboardingStepId,
  type ProductStoreOnboardingStepStatus,
  isProductStoreOnboardingStepId
} from "@/config/productStoreOnboarding"
import { generateInternalId } from "@/utils"
import { onSessionCleared } from "./sessionScope"

export interface ProductStoreOnboardingDraft {
  companyName: string
  storeName: string
  productStoreId: string
  defaultCurrencyUomId: string
  locale: string
  timezone: string
  autoApproveOrder: string
  orderNumberPrefix: string
  saveBillingInformation: string
  selectedShopifyShopId: string
  linkedShopifyShopId: string
  productIdentifierEnumId: string
  primaryProductIdentification: string
  secondaryProductIdentification: string
  facilityMode: string
  inventorySource: string
  reserveInventory: string
  showSystemicInventory: string
  orderHistoryStartDate: string
  orderLaunchDate: string
}

export interface ProductStoreOnboardingRunRequest {
  shopId: string
  setupSnapshot: string
  baselineSystemMessageId: string
  systemMessageId: string
  jobRunId: string
  requestedAt: number
}

type ProductStoreOnboardingDraftField = keyof ProductStoreOnboardingDraft
type ProductStoreOnboardingStepStatuses = Record<ProductStoreOnboardingStepId, ProductStoreOnboardingStepStatus>

const DEFAULT_DRAFT: ProductStoreOnboardingDraft = {
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
}

const STORAGE_KEY = "company.productStoreOnboarding"
/** The retired Pinia persistence plugin keyed on the store id. Read once at init, then removed. */
const LEGACY_STORAGE_KEY = "productStoreOnboarding"

interface OnboardingWizardState {
  currentStepId: ProductStoreOnboardingStepId
  createdProductStoreId: string
  scopedProductStoreId: string
  stepStatuses: ProductStoreOnboardingStepStatuses
  draft: ProductStoreOnboardingDraft
  runRequests: Record<"products" | "inventory" | "orders", ProductStoreOnboardingRunRequest | null>
}

function defaultStepStatuses(): ProductStoreOnboardingStepStatuses {
  return Object.fromEntries(PRODUCT_STORE_ONBOARDING_STEP_IDS.map((stepId) => [stepId, "not-started"])) as ProductStoreOnboardingStepStatuses
}

function defaultWizardState(): OnboardingWizardState {
  return {
    currentStepId: "name",
    createdProductStoreId: "",
    scopedProductStoreId: "",
    stepStatuses: defaultStepStatuses(),
    draft: { ...DEFAULT_DRAFT },
    runRequests: { products: null, inventory: null, orders: null }
  }
}

function isStepStatus(value: unknown): value is ProductStoreOnboardingStepStatus {
  return value === "not-started" || value === "in-progress" || value === "complete" || value === "attention"
}

function migrateCurrentStepId(value: unknown): ProductStoreOnboardingStepId {
  if(value === "general") {return "name"}

  return isProductStoreOnboardingStepId(value) ? value : "name"
}

function migrateStepStatuses(stored: Record<string, any>): ProductStoreOnboardingStepStatuses {
  const statuses = defaultStepStatuses()

  if(stored.stepStatuses && typeof stored.stepStatuses === "object") {
    for(const stepId of PRODUCT_STORE_ONBOARDING_STEP_IDS) {
      const status = stored.stepStatuses[stepId]
      if(isStepStatus(status)) {statuses[stepId] = status}
    }
  }

  // Older drafts only recorded completed ids. General settings now belong to the Store step.
  if(Array.isArray(stored.completedStepIds)) {
    for(const rawStepId of stored.completedStepIds) {
      const stepId = rawStepId === "general" ? "name" : rawStepId
      if(isProductStoreOnboardingStepId(stepId)) {statuses[stepId] = "complete"}
    }
  }

  return statuses
}

function narrowDraft(value: unknown): ProductStoreOnboardingDraft {
  const draft = { ...DEFAULT_DRAFT }
  if(!value || typeof value !== "object") {return draft}

  for(const field of Object.keys(DEFAULT_DRAFT) as ProductStoreOnboardingDraftField[]) {
    const storedValue = (value as Record<string, unknown>)[field]
    if(typeof storedValue === "string") {draft[field] = storedValue}
  }

  // The retired wizard persisted a human-readable locale label and sentence-case facility modes.
  // Neither is a backend value, so normalize those two fields while preserving valid new drafts.
  if(!/^[a-z]{2}_[A-Z]{2}$/.test(draft.locale)) {draft.locale = DEFAULT_DRAFT.locale}
  if(!["import", "create"].includes(draft.facilityMode)) {
    draft.facilityMode = draft.facilityMode === "One store" ? "create" : DEFAULT_DRAFT.facilityMode
  }

  return draft
}

function readStoredWizardState(): OnboardingWizardState {
  const base = defaultWizardState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    if(!raw) {return base}

    const stored = JSON.parse(raw)
    if(!stored || typeof stored !== "object") {return base}

    const createdProductStoreId = typeof stored.createdProductStoreId === "string"
      ? stored.createdProductStoreId
      : ""
    const scopedProductStoreId = typeof stored.scopedProductStoreId === "string"
      ? stored.scopedProductStoreId
      : createdProductStoreId

    return {
      currentStepId: migrateCurrentStepId(stored.currentStepId),
      createdProductStoreId,
      scopedProductStoreId,
      stepStatuses: migrateStepStatuses(stored),
      draft: narrowDraft(stored.draft),
      runRequests: {
        products: narrowRunRequest(stored.runRequests?.products),
        inventory: narrowRunRequest(stored.runRequests?.inventory),
        orders: narrowRunRequest(stored.runRequests?.orders)
      }
    }
  } catch {
    return base
  }
}

const state = reactive<OnboardingWizardState>(readStoredWizardState())

watch(
  state,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentStepId: state.currentStepId,
        createdProductStoreId: state.createdProductStoreId,
        scopedProductStoreId: state.scopedProductStoreId,
        stepStatuses: state.stepStatuses,
        draft: state.draft,
        runRequests: state.runRequests
      }))
    } catch {
      // Storage can be unavailable; the in-memory wizard remains usable.
    }
  },
  { deep: true, flush: "sync" }
)

function replaceState(nextState: OnboardingWizardState) {
  state.currentStepId = nextState.currentStepId
  state.createdProductStoreId = nextState.createdProductStoreId
  state.scopedProductStoreId = nextState.scopedProductStoreId
  state.stepStatuses = nextState.stepStatuses
  state.draft = nextState.draft
  state.runRequests = nextState.runRequests
}

function narrowRunRequest(value: unknown): ProductStoreOnboardingRunRequest | null {
  if(!value || typeof value !== "object") {return null}
  const request = value as Record<string, unknown>
  if(typeof request.shopId !== "string" || typeof request.setupSnapshot !== "string") {return null}

  return {
    shopId: request.shopId,
    setupSnapshot: request.setupSnapshot,
    baselineSystemMessageId: typeof request.baselineSystemMessageId === "string" ? request.baselineSystemMessageId : "",
    systemMessageId: typeof request.systemMessageId === "string" ? request.systemMessageId : "",
    jobRunId: typeof request.jobRunId === "string" ? request.jobRunId : "",
    requestedAt: Number(request.requestedAt) || 0
  }
}

onSessionCleared(() => {
  replaceState(defaultWizardState())
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
})

const currentStep = computed(() =>
  PRODUCT_STORE_ONBOARDING_STEPS.find((step) => step.id === state.currentStepId) ??
  PRODUCT_STORE_ONBOARDING_STEPS[0])
const currentStepIndex = computed(() => PRODUCT_STORE_ONBOARDING_STEP_IDS.indexOf(state.currentStepId))
const completedStepIds = computed(() =>
  PRODUCT_STORE_ONBOARDING_STEP_IDS.filter((stepId) => state.stepStatuses[stepId] === "complete"))
const completedCount = computed(() =>
  PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS.filter((stepId) => state.stepStatuses[stepId] === "complete").length)
const totalStepCount = computed(() => PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS.length)
const progressValue = computed(() => totalStepCount.value ? completedCount.value / totalStepCount.value : 0)

function selectStep(stepId: ProductStoreOnboardingStepId) {
  if(isProductStoreOnboardingStepId(stepId)) {state.currentStepId = stepId}
}

function updateDraftField(field: ProductStoreOnboardingDraftField, value: string) {
  state.draft[field] = value

  if(field === "storeName" && value && !state.draft.productStoreId) {
    state.draft.productStoreId = generateInternalId(value).slice(0, 20)
  }
}

function setStepStatus(stepId: ProductStoreOnboardingStepId, status: ProductStoreOnboardingStepStatus) {
  if(isProductStoreOnboardingStepId(stepId)) {state.stepStatuses[stepId] = status}
}

function markStepComplete(stepId: ProductStoreOnboardingStepId = state.currentStepId) {
  setStepStatus(stepId, "complete")
}

function markStepAttention(stepId: ProductStoreOnboardingStepId = state.currentStepId) {
  setStepStatus(stepId, "attention")
}

function markStepInProgress(stepId: ProductStoreOnboardingStepId = state.currentStepId) {
  setStepStatus(stepId, "in-progress")
}

function setCreatedProductStoreId(productStoreId: string) {
  const normalizedId = productStoreId.trim()
  state.createdProductStoreId = normalizedId
  state.scopedProductStoreId = normalizedId
  if(normalizedId) {state.draft.productStoreId = normalizedId}
}

function setRunRequest(
  kind: "products" | "inventory" | "orders",
  request: ProductStoreOnboardingRunRequest | null
) {
  state.runRequests[kind] = request
}

/** Explicitly starts a different new-store flow. Base-route entry alone deliberately does not. */
function startNewSetup() {
  replaceState(defaultWizardState())
}

/**
 * Opens setup for an existing Product Store. The same store resumes; a different store gets a
 * clean scoped draft so status and form data cannot leak across stores.
 */
function initializeForProductStore(productStoreId: string) {
  const normalizedId = productStoreId.trim()
  if(!normalizedId) {return}

  const currentScope = state.scopedProductStoreId || state.createdProductStoreId || state.draft.productStoreId
  if(currentScope === normalizedId) {return}

  const nextState = defaultWizardState()
  nextState.createdProductStoreId = normalizedId
  nextState.scopedProductStoreId = normalizedId
  nextState.draft.productStoreId = normalizedId
  replaceState(nextState)
}

function goNext() {
  const nextStepId = PRODUCT_STORE_ONBOARDING_STEP_IDS[currentStepIndex.value + 1]
  if(nextStepId) {state.currentStepId = nextStepId}
}

function goPrevious() {
  const previousStepId = PRODUCT_STORE_ONBOARDING_STEP_IDS[currentStepIndex.value - 1]
  if(previousStepId) {state.currentStepId = previousStepId}
}

function resetDraft() {
  startNewSetup()
}

export function useProductStoreOnboardingWizard() {
  return reactive({
    ...toRefs(state),
    currentStep,
    currentStepIndex,
    completedStepIds,
    completedCount,
    totalStepCount,
    progressValue,
    selectStep,
    updateDraftField,
    markStepComplete,
    markStepAttention,
    markStepInProgress,
    setRunRequest,
    setCreatedProductStoreId,
    startNewSetup,
    initializeForProductStore,
    goNext,
    goPrevious,
    resetDraft
  })
}
