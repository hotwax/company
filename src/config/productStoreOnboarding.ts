export type ProductStoreOnboardingStepGroup = "setup" | "review"

export type ProductStoreOnboardingStepId =
  | "name" |
  "shopify" |
  "products" |
  "facilities" |
  "locations" |
  "inventory" |
  "orders" |
  "readiness"

export type ProductStoreOnboardingStepStatus =
  | "not-started" |
  "in-progress" |
  "complete" |
  "attention"

export interface ProductStoreOnboardingStep {
  id: ProductStoreOnboardingStepId
  group: ProductStoreOnboardingStepGroup
  label: string
  summary: string
}

export interface ProductStoreOnboardingGroup {
  id: ProductStoreOnboardingStepGroup
  label: string
}

export const PRODUCT_STORE_ONBOARDING_GROUPS: ProductStoreOnboardingGroup[] = [
  { id: "setup", label: "Setup" },
  { id: "review", label: "Review" }
]

export const PRODUCT_STORE_ONBOARDING_STEPS: ProductStoreOnboardingStep[] = [
  {
    id: "name",
    group: "setup",
    label: "Store",
    summary: "Create the Product Store and save its operating defaults."
  },
  {
    id: "shopify",
    group: "setup",
    label: "Shopify",
    summary: "Associate an existing Shopify shop with this Product Store."
  },
  {
    id: "products",
    group: "setup",
    label: "Products",
    summary: "Choose product identifiers and load the catalog."
  },
  {
    id: "facilities",
    group: "setup",
    label: "Facilities",
    summary: "Create or import facilities for this Product Store."
  },
  {
    id: "locations",
    group: "setup",
    label: "Location mapping",
    summary: "Map Shopify locations to HotWax facilities."
  },
  {
    id: "inventory",
    group: "setup",
    label: "Inventory",
    summary: "Save inventory preferences and load initial inventory."
  },
  {
    id: "orders",
    group: "setup",
    label: "Orders",
    summary: "Save the order import window and load order history."
  },
  {
    id: "readiness",
    group: "review",
    label: "Readiness review",
    summary: "Review the setup outcomes before using the Product Store."
  }
]

export const PRODUCT_STORE_ONBOARDING_STEP_IDS: ProductStoreOnboardingStepId[] =
  PRODUCT_STORE_ONBOARDING_STEPS.map((step) => step.id)

export const PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS: ProductStoreOnboardingStepId[] =
  PRODUCT_STORE_ONBOARDING_STEP_IDS.filter((stepId) => stepId !== "readiness")

export function isProductStoreOnboardingStepId(value: unknown): value is ProductStoreOnboardingStepId {
  return typeof value === "string" && PRODUCT_STORE_ONBOARDING_STEP_IDS.includes(value as ProductStoreOnboardingStepId)
}
