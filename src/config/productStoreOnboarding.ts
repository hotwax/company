export type ProductStoreOnboardingStepGroup = "setup" | "workflows"
export type ProductStoreOnboardingCapability = "preview" | "existing-api" | "backend-gap"

export interface ProductStoreOnboardingStep {
  id: string
  group: ProductStoreOnboardingStepGroup
  label: string
  summary: string
  capability: ProductStoreOnboardingCapability
  questions: string[]
  outputs: string[]
}

export interface ProductStoreOnboardingGroup {
  id: ProductStoreOnboardingStepGroup
  label: string
}

export const PRODUCT_STORE_ONBOARDING_GROUPS: ProductStoreOnboardingGroup[] = [
  { id: "setup", label: "Setup" },
  { id: "workflows", label: "Workflows" }
]

export const PRODUCT_STORE_ONBOARDING_STEPS: ProductStoreOnboardingStep[] = [
  {
    id: "name",
    group: "setup",
    label: "Name",
    summary: "Create the ProductStore identity that every later setup area depends on.",
    capability: "existing-api",
    questions: [
      "What is the retail brand or storefront name?",
      "Which ID should HotWax use for this Product Store?",
      "Which currency, locale, and timezone should this store use?"
    ],
    outputs: ["ProductStore", "Organization link", "Currency and locale defaults"]
  },
  {
    id: "general",
    group: "setup",
    label: "General",
    summary: "Capture the operating defaults that should exist before solution-specific setup starts.",
    capability: "existing-api",
    questions: [
      "Should imported orders auto-approve?",
      "What sales order prefix should this store use?",
      "Should billing information be saved on imported orders?"
    ],
    outputs: ["Order number prefix", "Approval policy", "Billing preference"]
  },
  {
    id: "shopify",
    group: "setup",
    label: "Shopify",
    summary: "Connect or reserve the Shopify shop that will feed products, orders, inventory, and locations.",
    capability: "backend-gap",
    questions: [
      "Is this Product Store connected to an existing Shopify shop?",
      "Which myshopify domain should this setup use?",
      "Should the user install the HotWax Shopify app now or later?"
    ],
    outputs: ["ShopifyShop", "SystemMessageRemote", "Shopify app install token"]
  },
  {
    id: "products",
    group: "setup",
    label: "Products",
    summary: "Choose the product identifier and import direction before inventory or order sync is enabled.",
    capability: "existing-api",
    questions: [
      "What identifier matches Shopify and HotWax products most reliably?",
      "Should products import from Shopify, ERP, or an existing catalog?",
      "Are variants identified by SKU, UPC, barcode, or Shopify variant ID?"
    ],
    outputs: ["Product identifier", "Identifier preference", "Product import readiness"]
  },
  {
    id: "facilities",
    group: "setup",
    label: "Facilities",
    summary: "Create or import the physical places that can hold, ship, receive, or stage inventory.",
    capability: "existing-api",
    questions: [
      "How many stores, warehouses, hubs, and pickup locations are in scope?",
      "Should a one-store retailer start with an automatic facility?",
      "Which facilities should be associated with this Product Store?"
    ],
    outputs: ["Facilities", "Facility groups", "ProductStoreFacility associations"]
  },
  {
    id: "locations",
    group: "setup",
    label: "Location mapping",
    summary: "Map Shopify inventory locations to HotWax facilities before inventory and fulfillment sync starts.",
    capability: "existing-api",
    questions: [
      "Which Shopify location maps to each HotWax facility?",
      "Are any Shopify locations fulfillment-service locations instead of stores?",
      "Which mapped locations should be allowed to fulfill, receive, or offer pickup?"
    ],
    outputs: ["ShopifyShopLocation", "Facility mapping audit", "Inventory location readiness"]
  },
  {
    id: "inventory",
    group: "setup",
    label: "Inventory",
    summary: "Decide the source of truth and first load path before fulfillment workflows are turned on.",
    capability: "backend-gap",
    questions: [
      "Which system owns available inventory?",
      "Should HotWax reserve inventory for online orders?",
      "Should initial QOH load from Shopify, ERP, WMS, or a file?"
    ],
    outputs: ["Inventory source", "Reservation policy", "Initial inventory load task"]
  },
  {
    id: "orders",
    group: "setup",
    label: "Orders",
    summary: "Prepare order import, order updates, and realtime Shopify order flow before activation.",
    capability: "backend-gap",
    questions: [
      "Should orders import in realtime, scheduled batches, or both?",
      "Which tags or order types should be included?",
      "Should fallback order sync jobs be active?"
    ],
    outputs: ["Order import jobs", "Webhook/SQS readiness", "Fallback sync jobs"]
  },
  {
    id: "users",
    group: "setup",
    label: "Users",
    summary: "Map the people who will operate the store into app roles, security groups, and facility scope.",
    capability: "backend-gap",
    questions: [
      "Which teams need access: stores, inventory, fulfillment, routing, or admins?",
      "Which users should be associated with each facility?",
      "Which order edit actions should customer service manage?"
    ],
    outputs: ["Users", "Security groups", "Facility and ProductStore scope"]
  },
  {
    id: "routing",
    group: "workflows",
    label: "Order routing and fulfillment",
    summary: "Decide whether HotWax should broker, split, reserve, and route online orders.",
    capability: "preview",
    questions: [
      "Which locations can fulfill online orders?",
      "Can orders split across locations?",
      "What should happen when a facility rejects an order?"
    ],
    outputs: ["Brokering defaults", "Routing setup task", "Fulfillment permissions"]
  },
  {
    id: "pickup",
    group: "workflows",
    label: "In store pickup",
    summary: "Model pickup promises, pickup facility mapping, and customer-facing pickup changes.",
    capability: "preview",
    questions: [
      "Which stores allow pickup?",
      "How should pickup orders be identified?",
      "Can customers change pickup location before fulfillment?"
    ],
    outputs: ["Pickup setup task", "BOPIS behavior", "Pickup permissions"]
  },
  {
    id: "storeInventory",
    group: "workflows",
    label: "Store inventory management",
    summary: "Prepare counts, receiving, transfer receiving, adjustments, and scanner expectations.",
    capability: "preview",
    questions: [
      "Which store inventory workflows are in scope?",
      "What do store teams scan?",
      "Who can approve adjustments and discrepancies?"
    ],
    outputs: ["Inventory app role package", "Barcode preference", "Receiving/count setup task"]
  },
  {
    id: "preorders",
    group: "workflows",
    label: "Pre-orders",
    summary: "Capture preorder eligibility, inventory pools, release behavior, and routing groups.",
    capability: "preview",
    questions: [
      "How are preorder products identified?",
      "Where should preorder inventory live?",
      "Should preorder orders split from in-stock items?"
    ],
    outputs: ["Preorder setup task", "Preorder facility group", "Release routing task"]
  }
]

export const PRODUCT_STORE_ONBOARDING_STEP_IDS = PRODUCT_STORE_ONBOARDING_STEPS.map((step) => step.id)
