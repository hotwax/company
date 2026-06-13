# Company Cold-Start Product Store Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Company app create product store flow that guides a first-time Shopify retailer from an empty OMS instance to a usable product store with Shopify connection, facilities, mappings, product identity, inventory setup, users, and selected job families.

**Architecture:** Treat onboarding as an orchestration UI over existing bounded APIs wherever they already exist, and as a research-backed readiness checklist where backend gaps remain. ProductStore fields and ProductStoreSetting enum IDs are grouped by setup topic in the UI; do not create per-feature settings endpoints. Non-settings setup actions such as inventory reset, user setup, Shopify job setup, AWS/SQS validation, order routing clone, and ATP rule copy get explicit backend gap contracts before the UI exposes them as executable tasks.

**Tech Stack:** Vue 3, Ionic Vue, Pinia, AccxUI workspace, Moqui/Maarg REST APIs, Shopify Admin APIs, DataManager upload/log flow, service job clone/update APIs.

---

## Current Baseline

### Existing Company App Flow

- `src/views/CreateProductStore.vue`
  - Creates the ProductStore with `productStoreId`, `storeName`, `defaultCurrencyUomId`, `companyName`, and `payToPartyId`.
  - Redirects to `/add-configurations/:productStoreId`.
  - Still contains DBIC/operating-country behavior that should be revalidated before building cold-start onboarding.
- `src/views/AddConfigurations.vue`
  - Offers manual setup or clone setup.
  - Manual mode currently writes `orderNumberPrefix`, `autoApproveOrder`, and `productIdentifierEnumId`.
  - Clone mode already has topic groups for ProductStore fields and ProductStoreSetting enum IDs.
- `src/store/productStore.ts`
  - Owns `admin/productStores`, `admin/productStores/{productStoreId}`, and `admin/productStores/{productStoreId}/settings`.
- `src/store/shopify.ts`
  - Owns Shopify shop, remote, type mapping, carrier/shipment mapping, location mapping, and Shopify facility import calls.
- `src/composables/useDataManagerLog.ts`
  - Owns DataManager log detail and file download helpers that onboarding should reuse for import task status.
- `docs/product-store-onboarding-rest-endpoint-gaps.md`
  - Tracks existing endpoints, candidate endpoints, and backend gaps discovered during research.

### Product Store Topic Groups

Use this grouping shape for setup UI and clone behavior. This is not a backend endpoint map.

| Topic | ProductStore fields | ProductStoreSetting enum IDs |
| --- | --- | --- |
| Order configurations | `autoApproveOrder`, `orderNumberPrefix` | `SAVE_BILL_TO_INF`, `RETURN_DEADLINE_DAYS` |
| Brokering rules | `enableBrokering`, `allowSplit` | `PRE_SLCTD_FAC_TAG`, `ORD_ITM_SHIP_FAC`, `BRK_SHPMNT_THRESHOLD` |
| Fulfillment settings | `daysToCancelNonPay` | `FULFILL_NOTIF`, `BOPIS_PART_ODR_REJ` |
| Inventory settings | `reserveInventory` | `INV_CNT_VIEW_QOH`, `HOLD_PRORD_PHYCL_INV`, `PRE_ORDER_GROUP_ID` |
| Product configurations | `productIdentifierEnumId` | `PRDT_IDEN_PREF` |
| Order edit permissions | none | `CUST_DLVRMTHD_UPDATE`, `RF_SHIPPING_METHOD`, `CUST_DLVRADR_UPDATE`, `CUST_PCKUP_UPDATE`, `CUST_ALLOW_CNCL` |

### Target Cold-Start Journey

1. Organization and product store basics.
2. Shopify connection or selection of an existing Shopify shop.
3. Facility creation/import and product-store facility association.
4. Shopify location to HotWax facility mapping.
5. Product identity and product import readiness.
6. Inventory source decision and initial inventory load.
7. User creation/import and security group assignment.
8. Shopify job families: sales order sync, inventory-to-Shopify sync, realtime order import through EventBridge/SQS.
9. Topic-based ProductStore fields/settings.
10. Final readiness review with incomplete tasks, backend gaps, and next actions.

## File Structure

### Documentation And Research

- Modify: `docs/product-store-onboarding-rest-endpoint-gaps.md`
  - Keep endpoint research current.
  - Mark endpoints as existing, candidate, composite, gap, or defer.
- Create: `docs/product-store-onboarding-cold-start-research.md`
  - Record research findings by setup area.
  - Keep exact repo paths, services, REST resources, payload notes, and decisions.
- Create: `docs/product-store-onboarding-test-matrix.md`
  - Record cold-start scenarios, API smoke checks, browser checks, and backend dependency status.

### Company App Config And State

- Create: `src/config/productStoreOnboarding.ts`
  - Store step definitions, topic group definitions, task IDs, required prerequisites, and backend capability flags.
- Create: `src/store/productStoreOnboarding.ts`
  - Own onboarding draft state, step completion, readiness checks, and calls that span existing stores.
- Modify: `src/store/productStore.ts`
  - Add only narrow actions that are missing for ProductStore basics or settings writes.
- Modify: `src/store/shopify.ts`
  - Add only narrow actions for onboarding status reads or wrappers around existing Shopify connection/mapping calls.

### Company App Views And Components

- Modify: `src/router/index.ts`
  - Add a route for the multi-step onboarding experience, or replace the `/add-configurations/:productStoreId` target after the new flow is ready.
- Modify: `src/views/CreateProductStore.vue`
  - Keep the first ProductStore creation step focused.
  - Route into the new onboarding flow after creation.
- Replace or retire: `src/views/AddConfigurations.vue`
  - Keep useful topic grouping logic by moving it into `src/config/productStoreOnboarding.ts`.
  - Avoid maintaining two competing setup experiences after the new flow is accepted.
- Create: `src/views/ProductStoreOnboarding.vue`
  - Main multi-step onboarding shell.
  - Use Ionic headers, list items, segments, toggles, selects, modals, progress, and buttons.
  - Do not use `ion-grid`, `ion-row`, `ion-col`, or Ionic grid utility classes.
- Create: `src/components/product-store-onboarding/OnboardingStepList.vue`
  - Mobile-friendly task list and progress state.
- Create: `src/components/product-store-onboarding/ProductStoreBasicsStep.vue`
  - Product store basics review and update.
- Create: `src/components/product-store-onboarding/ShopifyConnectionStep.vue`
  - Existing shop selection or new Shopify connection.
- Create: `src/components/product-store-onboarding/FacilitiesStep.vue`
  - Facility creation/import entry points and product-store association status.
- Create: `src/components/product-store-onboarding/ShopifyLocationMappingStep.vue`
  - Shopify location import/audit/mapping entry point using existing mapping patterns.
- Create: `src/components/product-store-onboarding/ProductIdentityStep.vue`
  - Product identifier and import readiness.
- Create: `src/components/product-store-onboarding/InventorySetupStep.vue`
  - Inventory source decision, Shopify bulk reset path, and DataManager reset status.
- Create: `src/components/product-store-onboarding/UserSetupStep.vue`
  - User creation/import readiness and security group/facility association prompts.
- Create: `src/components/product-store-onboarding/ShopifyJobsStep.vue`
  - Sales order sync, inventory-to-Shopify sync, and realtime SQS job family setup.
- Create: `src/components/product-store-onboarding/TopicSettingsStep.vue`
  - ProductStore field/settings groups.
- Create: `src/components/product-store-onboarding/ReadinessReviewStep.vue`
  - Final review showing complete, skipped, blocked, and backend-gap tasks.

### Verification

- Use wrapper root: `/Users/adityapatel/Documents/GitHub/accxui`.
- Use app path: `/Users/adityapatel/Documents/GitHub/accxui/apps/company`, which currently resolves to `/Users/adityapatel/Documents/GitHub/company`.
- Build command: `pnpm --filter company build`.
- Lint command: `pnpm --filter company lint`.
- Dev command: `pnpm --filter company dev --host 0.0.0.0 --port 8111`.

## Execution Plan

### Task 1: Baseline Current Flow And Remove Ambiguity

**Files:**
- Read: `src/views/CreateProductStore.vue`
- Read: `src/views/AddConfigurations.vue`
- Read: `src/router/index.ts`
- Read: `src/store/productStore.ts`
- Read: `src/store/shopify.ts`
- Modify: `docs/product-store-onboarding-cold-start-research.md`

- [ ] **Step 1: Verify the active app checkout and wrapper path**

Run:

```bash
pwd
git status --short --branch
readlink /Users/adityapatel/Documents/GitHub/accxui/apps/company
sed -n '1,220p' /Users/adityapatel/Documents/GitHub/accxui/apps/company/package.json
```

Expected:

```text
/Users/adityapatel/Documents/GitHub/company
```

The `readlink` output must point to the same Company checkout before implementation starts.

- [ ] **Step 2: Record current route behavior**

Write this section into `docs/product-store-onboarding-cold-start-research.md`:

```markdown
## Current Create Flow

- `/create-product-store` renders `CreateProductStore.vue`.
- Successful ProductStore creation redirects to `/add-configurations/:productStoreId`.
- `/add-configurations/:productStoreId` is guarded so it only opens from `CreateProductStore`.
- Manual configuration currently writes `orderNumberPrefix`, `autoApproveOrder`, and `productIdentifierEnumId`.
- Clone configuration copies selected ProductStore fields and ProductStoreSetting values by category.
```

- [ ] **Step 3: Record topic grouping source**

Write this section into `docs/product-store-onboarding-cold-start-research.md`:

```markdown
## Product Store Topic Groups

The current topic grouping lives in `src/views/AddConfigurations.vue` and `src/views/CloneProductStore.vue`.

| Topic | ProductStore fields | ProductStoreSetting enum IDs |
| --- | --- | --- |
| Order configurations | `autoApproveOrder`, `orderNumberPrefix` | `SAVE_BILL_TO_INF`, `RETURN_DEADLINE_DAYS` |
| Brokering rules | `enableBrokering`, `allowSplit` | `PRE_SLCTD_FAC_TAG`, `ORD_ITM_SHIP_FAC`, `BRK_SHPMNT_THRESHOLD` |
| Fulfillment settings | `daysToCancelNonPay` | `FULFILL_NOTIF`, `BOPIS_PART_ODR_REJ` |
| Inventory settings | `reserveInventory` | `INV_CNT_VIEW_QOH`, `HOLD_PRORD_PHYCL_INV`, `PRE_ORDER_GROUP_ID` |
| Product configurations | `productIdentifierEnumId` | `PRDT_IDEN_PREF` |
| Order edit permissions | none | `CUST_DLVRMTHD_UPDATE`, `RF_SHIPPING_METHOD`, `CUST_DLVRADR_UPDATE`, `CUST_PCKUP_UPDATE`, `CUST_ALLOW_CNCL` |
```

- [ ] **Step 4: Commit the research baseline**

Run:

```bash
git add docs/product-store-onboarding-cold-start-research.md
git commit -m "docs: capture product store onboarding baseline"
```

### Task 2: Build The Backend Capability Matrix

**Files:**
- Modify: `docs/product-store-onboarding-rest-endpoint-gaps.md`
- Modify: `docs/product-store-onboarding-cold-start-research.md`

- [ ] **Step 1: Verify existing endpoint claims from Company code**

Run:

```bash
rg -n "admin/productStores|productStores/.*/settings|oms/shopifyShops|oms/systemMessageRemotes|admin/serviceJobs|admin/dataManager|uploadDataManagerFile|shopify/webhook-subscription" src docs
```

Expected records to classify as existing:

```text
admin/productStores
admin/productStores/{productStoreId}
admin/productStores/{productStoreId}/settings
oms/shopifyShops/shops
oms/shopifyShops/typeMappings
oms/shopifyShops/locations
oms/shopifyShops/carrierShipments
oms/systemMessageRemotes
admin/serviceJobs
admin/dataManager
admin/uploadDataManagerFile
admin/dataManager/downloadDataManagerFile
shopify/webhook-subscription
```

- [ ] **Step 2: Verify backend service ownership from local Moqui repos**

Run from `/Users/adityapatel/Documents/GitHub`:

```bash
rg -n "admin/productStores|uploadDataManagerFile|downloadTemplate|create#WebhookSubscription|consume#SQSOrderMessages|resetShopifyInventoryQoh|queue_ShopifyOrderSync|sync_ShopifyOrderHistory|ExternalInventoryReset|create#ExternalInventoryReset|reset#InventoryItem|DataManagerConfig" hotwax-maarg-util hotwax-shopify-oms-bridge mantle-shopify-connector hotwax-poorti mantle-netsuite-connector oms
```

Record every confirmed owner in `docs/product-store-onboarding-cold-start-research.md` under:

```markdown
## Backend Capability Matrix

| Setup area | Existing capability | Owner | Endpoint/service | Gap |
| --- | --- | --- | --- | --- |
```

- [ ] **Step 3: Reclassify backend gaps**

Ensure `docs/product-store-onboarding-rest-endpoint-gaps.md` classifies these as gaps or composites:

```markdown
- `POST /rest/s1/admin/jwtTokens`
- generic inventory reset DataManager config and file-consuming service
- `POST /rest/s1/shopify/shops/{shopId}/inventory/reset-file-from-shopify`
- `POST /rest/s1/admin/users/setup`
- order routing clone wrapper
- ATP rule copy wrapper
- Shopify job family status/setup wrappers
- optional AWS EventBridge/SQS provisioning service
```

- [ ] **Step 4: Confirm settings are not backend gaps**

Run:

```bash
rg -n "features/.*/settings|Feature Setup Endpoints|per-feature settings endpoints" docs/product-store-onboarding-rest-endpoint-gaps.md
```

Expected: no matches.

- [ ] **Step 5: Commit capability matrix updates**

Run:

```bash
git add docs/product-store-onboarding-rest-endpoint-gaps.md docs/product-store-onboarding-cold-start-research.md
git commit -m "docs: map onboarding backend capabilities"
```

### Task 3: Define The User Journey And Step Model

**Files:**
- Create: `src/config/productStoreOnboarding.ts`
- Modify: `docs/product-store-onboarding-cold-start-research.md`

- [ ] **Step 1: Create onboarding step config**

Create `src/config/productStoreOnboarding.ts` with this initial content:

```ts
export type OnboardingStepStatus = "not-started" | "ready" | "complete" | "blocked" | "skipped";

export type OnboardingTaskId =
  | "product-store-basics"
  | "shopify-connection"
  | "facilities"
  | "shopify-location-mapping"
  | "product-identity"
  | "inventory-source"
  | "users"
  | "shopify-order-sync"
  | "shopify-inventory-sync"
  | "shopify-realtime-orders"
  | "topic-settings"
  | "readiness-review";

export interface OnboardingTaskDefinition {
  id: OnboardingTaskId;
  label: string;
  requiredForColdStart: boolean;
  backendCapability:
    | "existing"
    | "existing-wrapper-needed"
    | "backend-gap"
    | "manual-validation";
}

export interface ProductStoreSetupTopic {
  id: string;
  label: string;
  productStoreFields: string[];
  settingTypeEnumIds: string[];
}

export const PRODUCT_STORE_SETUP_TOPICS: ProductStoreSetupTopic[] = [
  {
    id: "order",
    label: "Order configurations",
    productStoreFields: ["autoApproveOrder", "orderNumberPrefix"],
    settingTypeEnumIds: ["SAVE_BILL_TO_INF", "RETURN_DEADLINE_DAYS"]
  },
  {
    id: "brokering",
    label: "Brokering rules",
    productStoreFields: ["enableBrokering", "allowSplit"],
    settingTypeEnumIds: ["PRE_SLCTD_FAC_TAG", "ORD_ITM_SHIP_FAC", "BRK_SHPMNT_THRESHOLD"]
  },
  {
    id: "fulfillment",
    label: "Fulfillment settings",
    productStoreFields: ["daysToCancelNonPay"],
    settingTypeEnumIds: ["FULFILL_NOTIF", "BOPIS_PART_ODR_REJ"]
  },
  {
    id: "inventory",
    label: "Inventory settings",
    productStoreFields: ["reserveInventory"],
    settingTypeEnumIds: ["INV_CNT_VIEW_QOH", "HOLD_PRORD_PHYCL_INV", "PRE_ORDER_GROUP_ID"]
  },
  {
    id: "product",
    label: "Product configurations",
    productStoreFields: ["productIdentifierEnumId"],
    settingTypeEnumIds: ["PRDT_IDEN_PREF"]
  },
  {
    id: "permissions",
    label: "Order edit permissions",
    productStoreFields: [],
    settingTypeEnumIds: ["CUST_DLVRMTHD_UPDATE", "RF_SHIPPING_METHOD", "CUST_DLVRADR_UPDATE", "CUST_PCKUP_UPDATE", "CUST_ALLOW_CNCL"]
  }
];

export const COLD_START_ONBOARDING_TASKS: OnboardingTaskDefinition[] = [
  { id: "product-store-basics", label: "Product store basics", requiredForColdStart: true, backendCapability: "existing" },
  { id: "shopify-connection", label: "Shopify connection", requiredForColdStart: true, backendCapability: "existing" },
  { id: "facilities", label: "Facilities", requiredForColdStart: true, backendCapability: "existing-wrapper-needed" },
  { id: "shopify-location-mapping", label: "Shopify location mapping", requiredForColdStart: true, backendCapability: "existing" },
  { id: "product-identity", label: "Product identity", requiredForColdStart: true, backendCapability: "existing" },
  { id: "inventory-source", label: "Inventory source and initial load", requiredForColdStart: true, backendCapability: "backend-gap" },
  { id: "users", label: "Users and roles", requiredForColdStart: true, backendCapability: "backend-gap" },
  { id: "shopify-order-sync", label: "Shopify sales order sync", requiredForColdStart: true, backendCapability: "existing-wrapper-needed" },
  { id: "shopify-inventory-sync", label: "Inventory sync to Shopify", requiredForColdStart: false, backendCapability: "existing-wrapper-needed" },
  { id: "shopify-realtime-orders", label: "Realtime order import", requiredForColdStart: false, backendCapability: "manual-validation" },
  { id: "topic-settings", label: "Setup topics", requiredForColdStart: true, backendCapability: "existing" },
  { id: "readiness-review", label: "Readiness review", requiredForColdStart: true, backendCapability: "existing" }
];
```

- [ ] **Step 2: Document the step model**

Add this section to `docs/product-store-onboarding-cold-start-research.md`:

```markdown
## Target Onboarding Step Model

The UI should show the user a cold-start checklist instead of a raw settings form. Each step explains the setup task, runs the available validation, and either performs the action or marks the backend gap clearly.

Required cold-start tasks:
- product store basics
- Shopify connection
- facilities
- Shopify location mapping
- product identity
- inventory source and initial load
- users and roles
- Shopify sales order sync
- setup topics
- readiness review

Optional or conditional tasks:
- inventory sync to Shopify
- realtime order import through EventBridge/SQS
- order routing clone
- ATP rule copy
- preorder jobs
```

- [ ] **Step 3: Build-test the config**

Run from `/Users/adityapatel/Documents/GitHub/accxui`:

```bash
pnpm --filter company build
```

Expected: build succeeds.

- [ ] **Step 4: Commit the step model**

Run:

```bash
git add src/config/productStoreOnboarding.ts docs/product-store-onboarding-cold-start-research.md
git commit -m "feat: define product store onboarding steps"
```

### Task 4: Design Backend Contracts Before UI Execution

**Files:**
- Modify: `docs/product-store-onboarding-rest-endpoint-gaps.md`
- Modify: `docs/product-store-onboarding-cold-start-research.md`

- [ ] **Step 1: Write contract for onboarding status**

Add this candidate contract to `docs/product-store-onboarding-rest-endpoint-gaps.md`:

````markdown
### Onboarding Status Contract

Candidate endpoint: `GET /rest/s1/admin/productStores/{productStoreId}/onboarding/status`

Purpose: return setup readiness for the selected product store without performing writes.

Response shape:

```json
{
  "productStoreId": "STORE",
  "shopify": {
    "shopId": "SHOP",
    "remoteId": "SHOP_REMOTE",
    "accessScopeEnumId": "SHOP_RW_ACCESS",
    "hasReadWriteAccess": true
  },
  "facilities": {
    "associatedCount": 4,
    "missingShopifyMappings": 0
  },
  "dataManager": {
    "facilityImportConfigId": "FACILITY_IMPORT",
    "inventoryResetConfigId": null,
    "userImportConfigId": "USER_IMPORT"
  },
  "jobs": {
    "orderSyncConfigured": false,
    "inventorySyncConfigured": false,
    "realtimeOrderImportConfigured": false
  },
  "blockedReasons": [
    {
      "taskId": "inventory-source",
      "message": "Generic inventory reset DataManager config is missing."
    }
  ]
}
```
````

- [ ] **Step 2: Write contract for non-settings setup actions**

Add this candidate contract list to `docs/product-store-onboarding-rest-endpoint-gaps.md`:

````markdown
### Non-Settings Setup Action Contracts

These are not ProductStoreSetting endpoints.

| Action | Current direction | Purpose |
| --- | --- | --- |
| Status | `GET /rest/s1/admin/productStores/{productStoreId}/onboarding/status` | Read readiness across product store, shop, facilities, DataManager, users, and jobs. |
| User setup | `POST /rest/s1/admin/users/setup` | Create one user and associate selected security groups/facilities/product stores. |
| Inventory reset from Shopify | `POST /rest/s1/shopify/shops/{shopId}/inventory/reset-file-from-shopify` | Run Shopify bulk inventory query, transform `on_hand`, and create a DataManager reset log. |
| Shopify jobs | Company-side composition from existing ProductStore, ShopifyShop, SystemMessageRemote, ServiceJob, and DataManagerConfig records | Read draft job, cloned job, SQS, and access-scope readiness without a ProductStore-specific wrapper endpoint. |
| Shopify order sync jobs | Existing `admin/serviceJobs` clone/update APIs | Configure fallback/history order sync jobs. |
| Shopify inventory sync jobs | Existing `admin/serviceJobs` clone/update APIs plus ProductStoreSetting writes where needed | Configure outbound inventory sync and `SHOPIFY_INV_SYNC`. |
| Realtime order import | Existing `admin/serviceJobs` update APIs for the selected SQS consumer | Store/validate AWS SQS connection details and consumer-job parameters; AWS provisioning remains a separate setup decision. |
```
````

- [ ] **Step 3: Create backend issue list**

In `docs/product-store-onboarding-cold-start-research.md`, add:

```markdown
## Backend Issue List

1. Compose onboarding readiness in Company from existing ProductStore, ShopifyShop, SystemMessageRemote, ServiceJob, and DataManager records.
2. Add generic inventory reset DataManager config and QOH-only reset service.
3. Add Shopify bulk inventory reset orchestration.
4. Add setup-safe user creation and security group association endpoint.
5. Configure Shopify job setup from existing service-job clone/update APIs for order sync, inventory sync, and realtime SQS.
6. Decide whether realtime SQS uses one instance-wide consumer or per-shop cloned consumers.
7. Keep AWS EventBridge/SQS resource provisioning out of v1 unless least-privilege IAM and rollback are designed.
```

- [ ] **Step 4: Commit backend contract docs**

Run:

```bash
git add docs/product-store-onboarding-rest-endpoint-gaps.md docs/product-store-onboarding-cold-start-research.md
git commit -m "docs: define onboarding backend contracts"
```

### Task 5: Build The Company App Onboarding Shell

**Files:**
- Create: `src/store/productStoreOnboarding.ts`
- Create: `src/views/ProductStoreOnboarding.vue`
- Create: `src/components/product-store-onboarding/OnboardingStepList.vue`
- Modify: `src/router/index.ts`
- Modify: `src/views/CreateProductStore.vue`

- [ ] **Step 1: Create onboarding store**

Create `src/store/productStoreOnboarding.ts` with state for selected product store, current task, task statuses, and selected setup topics. The store should import `COLD_START_ONBOARDING_TASKS` and `PRODUCT_STORE_SETUP_TOPICS` from `src/config/productStoreOnboarding.ts`.

Minimum behavior:

```ts
import { defineStore } from "pinia";
import { COLD_START_ONBOARDING_TASKS, PRODUCT_STORE_SETUP_TOPICS, type OnboardingTaskId, type OnboardingStepStatus } from "@/config/productStoreOnboarding";

type TaskStatusMap = Record<OnboardingTaskId, OnboardingStepStatus>;

function createInitialTaskStatus(): TaskStatusMap {
  return COLD_START_ONBOARDING_TASKS.reduce((acc, task) => {
    acc[task.id] = task.backendCapability === "backend-gap" ? "blocked" : "not-started";
    return acc;
  }, {} as TaskStatusMap);
}

export const useProductStoreOnboardingStore = defineStore("productStoreOnboarding", {
  state: () => ({
    productStoreId: "",
    currentTaskId: "product-store-basics" as OnboardingTaskId,
    taskStatus: createInitialTaskStatus(),
    selectedTopicIds: PRODUCT_STORE_SETUP_TOPICS.map((topic) => topic.id)
  }),
  getters: {
    tasks: () => COLD_START_ONBOARDING_TASKS,
    selectedTopics: (state) => PRODUCT_STORE_SETUP_TOPICS.filter((topic) => state.selectedTopicIds.includes(topic.id)),
    isComplete: (state) => Object.values(state.taskStatus).every((status) => status === "complete" || status === "skipped")
  },
  actions: {
    start(productStoreId: string) {
      this.productStoreId = productStoreId;
      this.currentTaskId = "product-store-basics";
      this.taskStatus = createInitialTaskStatus();
    },
    setCurrentTask(taskId: OnboardingTaskId) {
      this.currentTaskId = taskId;
    },
    setTaskStatus(taskId: OnboardingTaskId, status: OnboardingStepStatus) {
      this.taskStatus[taskId] = status;
    },
    setSelectedTopicIds(topicIds: string[]) {
      this.selectedTopicIds = topicIds;
    }
  },
  persist: true
});
```

- [ ] **Step 2: Add onboarding route**

Modify `src/router/index.ts`:

```ts
const ProductStoreOnboarding = () => import('@/views/ProductStoreOnboarding.vue')
```

Add route:

```ts
{
  path: '/product-store-onboarding/:productStoreId',
  name: 'ProductStoreOnboarding',
  component: ProductStoreOnboarding,
  props: true,
  beforeEnter: authGuard
}
```

- [ ] **Step 3: Route newly created stores into onboarding**

In `src/views/CreateProductStore.vue`, replace:

```ts
router.replace(`/add-configurations/${productStoreId}`);
```

with:

```ts
router.replace(`/product-store-onboarding/${productStoreId}`);
```

- [ ] **Step 4: Create step list component**

Create `src/components/product-store-onboarding/OnboardingStepList.vue` using `ion-list`, `ion-item`, `ion-label`, `ion-icon`, `ion-badge`, and `ion-button`. Do not add CSS. Each row should show label, status, and whether the task is blocked because a backend gap remains.

- [ ] **Step 5: Create onboarding shell view**

Create `src/views/ProductStoreOnboarding.vue` with:

- `ion-page`
- `ion-header`
- `ion-toolbar`
- `ion-back-button`
- `ion-title`
- `ion-progress-bar`
- `ion-content`
- `OnboardingStepList`
- one detail panel for the selected task
- footer buttons for previous, skip, and continue

Do not use `ion-grid`, custom CSS, or repeated explanatory copy inside every step.

- [ ] **Step 6: Build and lint**

Run from `/Users/adityapatel/Documents/GitHub/accxui`:

```bash
pnpm --filter company lint
pnpm --filter company build
```

Expected: both commands succeed.

- [ ] **Step 7: Commit onboarding shell**

Run:

```bash
git add src/config/productStoreOnboarding.ts src/store/productStoreOnboarding.ts src/views/ProductStoreOnboarding.vue src/components/product-store-onboarding/OnboardingStepList.vue src/router/index.ts src/views/CreateProductStore.vue
git commit -m "feat: add product store onboarding shell"
```

### Task 6: Implement Existing-Endpoint Steps

**Files:**
- Create: `src/components/product-store-onboarding/ProductStoreBasicsStep.vue`
- Create: `src/components/product-store-onboarding/ShopifyConnectionStep.vue`
- Create: `src/components/product-store-onboarding/ShopifyLocationMappingStep.vue`
- Create: `src/components/product-store-onboarding/ProductIdentityStep.vue`
- Create: `src/components/product-store-onboarding/TopicSettingsStep.vue`
- Modify: `src/views/ProductStoreOnboarding.vue`
- Modify: `src/store/productStoreOnboarding.ts`

- [ ] **Step 1: Product store basics**

Implement `ProductStoreBasicsStep.vue` so it reads and writes:

- `storeName`
- `defaultCurrencyUomId`
- `orderNumberPrefix`
- `autoApproveOrder`

Use:

```ts
productStoreStore.fetchProductStoreDetails(productStoreId)
productStoreStore.updateProductStore(payload)
```

- [ ] **Step 2: Shopify connection**

Implement `ShopifyConnectionStep.vue` so the user can:

- select an existing Shopify shop from `shopifyStore.fetchShopifyShops()`
- create a new Shopify connection using `shopifyStore.createShopifyConnection(payload)`
- associate the shop to the product store through `productStoreId`

Show a blocked state only when no Shopify connection can be created because required credentials are unavailable.

- [ ] **Step 3: Shopify location mapping**

Implement `ShopifyLocationMappingStep.vue` as a task entry point that reuses the existing route:

```ts
router.push(`/shopify-connection-details/${shopId}/locations`)
```

Also show current mapping count from:

```ts
shopifyStore.fetchShopifyShopLocations()
utilStore.fetchFacilities()
```

- [ ] **Step 4: Product identity**

Implement `ProductIdentityStep.vue` using:

```ts
utilStore.fetchProductIdentifiers()
productStoreStore.updateProductStore({
  ...productStore,
  productIdentifierEnumId
})
```

- [ ] **Step 5: Topic settings**

Implement `TopicSettingsStep.vue` using `PRODUCT_STORE_SETUP_TOPICS`.

Rules:

- Do not create per-feature endpoints.
- Write ProductStore fields through `productStoreStore.updateProductStore`.
- Write settings through `productStoreStore.saveCurrentStoreSettings`.
- Only show topics selected for the user's chosen setup path.
- Leave untouched settings unchanged.

- [ ] **Step 6: Build and lint**

Run:

```bash
cd /Users/adityapatel/Documents/GitHub/accxui
pnpm --filter company lint
pnpm --filter company build
```

Expected: both commands succeed.

- [ ] **Step 7: Commit existing-endpoint steps**

Run:

```bash
git add src/components/product-store-onboarding src/views/ProductStoreOnboarding.vue src/store/productStoreOnboarding.ts
git commit -m "feat: implement existing onboarding steps"
```

### Task 7: Implement Import And Backend-Gap Steps As Honest Task Cards

**Files:**
- Create: `src/components/product-store-onboarding/FacilitiesStep.vue`
- Create: `src/components/product-store-onboarding/InventorySetupStep.vue`
- Create: `src/components/product-store-onboarding/UserSetupStep.vue`
- Create: `src/components/product-store-onboarding/ShopifyJobsStep.vue`
- Create: `src/components/product-store-onboarding/ReadinessReviewStep.vue`
- Modify: `src/views/ProductStoreOnboarding.vue`
- Modify: `docs/product-store-onboarding-test-matrix.md`

- [ ] **Step 1: Facilities step**

The facilities step should show:

- create facility task using existing `POST /rest/s1/admin/facilities`
- facility CSV import task using `POST /rest/s1/admin/uploadDataManagerFile`
- template download using `GET /rest/s1/admin/dataManager/{configId}/downloadTemplate`
- import log status using `GET /rest/s1/admin/dataManager/details`

If the facility import `configId` is not confirmed, show the task as blocked and record it in the readiness review.

- [ ] **Step 2: Inventory setup step**

The inventory setup step should separate three directions:

- Shopify inventory to OMS initial reset.
- OMS inventory to Shopify ongoing sync.
- Manual CSV inventory reset.

Show backend-gap state for the generic inventory reset DataManager config until the backend issue is resolved.

- [ ] **Step 3: User setup step**

The user step should separate:

- create one user
- import users by CSV
- associate security groups
- associate store/facility access

Show backend-gap state for `POST /rest/s1/admin/users/setup` until the backend issue is resolved.

- [ ] **Step 4: Shopify jobs step**

The Shopify jobs step should show three job families:

- sales order sync
- inventory sync to Shopify
- realtime order import through EventBridge/SQS

Show assisted manual AWS setup for realtime order import. Do not imply that Moqui can create AWS EventBridge/SQS infrastructure until that backend service exists.

- [ ] **Step 5: Readiness review step**

The readiness review should group tasks into:

- complete
- skipped
- blocked by backend gap
- blocked by missing user input

The user should be able to finish setup only if required cold-start tasks are complete or intentionally skipped with a reason.

- [ ] **Step 6: Create test matrix**

Create `docs/product-store-onboarding-test-matrix.md` with:

```markdown
# Product Store Onboarding Test Matrix

## Personas

| Persona | Shopify connected? | Existing product stores? | Facilities? | Inventory source |
| --- | --- | --- | --- | --- |
| Cold-start Shopify retailer | No | No | No | Shopify |
| Existing Shopify retailer | Yes | No | No | Shopify |
| Existing HotWax customer adding a brand | Yes | Yes | Yes | HotWax |
| Non-realtime order sync customer | Yes | Yes | Yes | HotWax |

## Required Browser Checks

| Scenario | Expected result |
| --- | --- |
| Create first product store | Product store is created and user lands in onboarding. |
| Create another product store | User lands in onboarding without first-store-only company prompts blocking progress. |
| Skip optional realtime order import | Readiness review marks realtime as skipped, not failed. |
| Backend gap visible | Missing inventory reset/user setup/job wrapper appears as blocked with exact next action. |
| Mobile viewport | Steps, buttons, selects, and long labels fit without overlap. |
```

- [ ] **Step 7: Build and lint**

Run:

```bash
cd /Users/adityapatel/Documents/GitHub/accxui
pnpm --filter company lint
pnpm --filter company build
```

Expected: both commands succeed.

- [ ] **Step 8: Commit task cards**

Run:

```bash
git add src/components/product-store-onboarding src/views/ProductStoreOnboarding.vue docs/product-store-onboarding-test-matrix.md
git commit -m "feat: add onboarding task cards and readiness review"
```

### Task 8: Browser And API Verification

**Files:**
- Modify: `docs/product-store-onboarding-test-matrix.md`

- [ ] **Step 1: Start Company app from wrapper root**

Run:

```bash
cd /Users/adityapatel/Documents/GitHub/accxui
pnpm --filter company dev --host 0.0.0.0 --port 8111
```

Expected:

```text
Local: http://localhost:8111/
```

If port `8111` is already in use, use the next open port and record it in the test matrix.

- [ ] **Step 2: Verify current browser route**

Open:

```text
http://localhost:8111/create-product-store
```

Expected:

- user can create a product store
- success routes to `/product-store-onboarding/{productStoreId}`
- progress indicator is visible
- no text overlaps on desktop

- [ ] **Step 3: Verify mobile viewport**

Use the browser testing tool at a mobile width.

Expected:

- all steps remain reachable
- footer actions do not cover content
- long task labels wrap cleanly
- no `ion-grid`, `ion-row`, or `ion-col` layout is introduced

- [ ] **Step 4: Verify backend writes**

Using the app and network panel, verify these calls happen only when the user reaches the relevant step:

```text
POST /rest/s1/admin/productStores
PUT /rest/s1/admin/productStores/{productStoreId}
GET /rest/s1/admin/productStores/{productStoreId}/settings
POST /rest/s1/admin/productStores/{productStoreId}/settings
GET /rest/s1/oms/shopifyShops/shops
POST /rest/s1/oms/shopifyShops/shops
POST /rest/s1/oms/systemMessageRemotes
GET /rest/s1/oms/shopifyShops/locations
POST /rest/s1/oms/shopifyShops/locations
```

- [ ] **Step 5: Verify blocked backend gaps**

In a cold-start test instance where the backend gaps are not implemented, verify:

- generic inventory reset is blocked
- user setup is blocked
- Shopify job setup wrappers are blocked or manual-validation only
- readiness review names the exact missing backend work

- [ ] **Step 6: Record results**

Append this section to `docs/product-store-onboarding-test-matrix.md`:

```markdown
## Verification Results

| Date | Environment | Result | Notes |
| --- | --- | --- | --- |
| 2026-06-12 | local Company app + local Moqui | Not run | Record exact port, productStoreId, shopId, and failed checks during execution. |
```

- [ ] **Step 7: Commit verification notes**

Run:

```bash
git add docs/product-store-onboarding-test-matrix.md
git commit -m "test: document product store onboarding verification"
```

### Task 9: Release Readiness And PR Packaging

**Files:**
- Modify: `docs/product-store-onboarding-cold-start-research.md`
- Modify: `docs/product-store-onboarding-test-matrix.md`

- [ ] **Step 1: Final static checks**

Run:

```bash
cd /Users/adityapatel/Documents/GitHub/accxui
pnpm --filter company lint
pnpm --filter company build
```

Expected: both commands succeed.

- [ ] **Step 2: Check for forbidden Ionic layout**

Run:

```bash
rg -n "ion-grid|ion-row|ion-col" src/views src/components
```

Expected: no new matches from onboarding files.

- [ ] **Step 3: Check for feature-specific settings endpoints**

Run:

```bash
rg -n "features/.*/settings|bopis/settings|shipFromStore/settings|storeInventory/settings|preorders/settings" src docs
```

Expected: no matches.

- [ ] **Step 4: Check for accidental broad CSS changes**

Run:

```bash
git diff --name-only main...HEAD | rg "\\.css$|\\.scss$|\\.sass$|style"
```

Expected: no onboarding-related stylesheet churn. Scoped style blocks should be absent unless an explicit implementation review approved them.

- [ ] **Step 5: Prepare PR summary**

Use this PR business summary:

```markdown
## Business Summary

This PR turns product store creation into a guided cold-start onboarding flow for Shopify retailers. Instead of dropping users into a small configuration form, the Company app now walks them through the OMS setup journey: product store basics, Shopify connection, facilities, Shopify location mapping, product identity, inventory setup, user setup, Shopify job families, topic-based settings, and final readiness review.

The implementation uses existing ProductStore and ProductStoreSetting endpoints for settings and keeps real backend gaps visible as blocked setup tasks rather than hiding them behind incomplete UI.

## Validation

- `pnpm --filter company lint`
- `pnpm --filter company build`
- Browser verification on desktop and mobile viewports
- Cold-start readiness checks recorded in `docs/product-store-onboarding-test-matrix.md`
```

- [ ] **Step 6: Create final commit**

Run:

```bash
git status --short
git add docs src
git commit -m "feat: guide cold-start product store onboarding"
```

## Research Checklist

Use this list before implementation starts and again before PR.

- [ ] ProductStore creation payload is confirmed against live Moqui.
- [ ] First-store company-name behavior is confirmed or removed from the cold-start flow.
- [ ] DBIC operating-country behavior is confirmed as still needed or removed from onboarding.
- [ ] ProductStore topic groups are centralized in `src/config/productStoreOnboarding.ts`.
- [ ] No feature-specific settings endpoints are planned or implemented.
- [ ] Facility creation/import path is confirmed.
- [ ] Shopify location import/mapping path is confirmed.
- [ ] Product identity values are confirmed from `SHOP_PROD_IDENTITY`.
- [ ] Generic inventory reset backend gap is tracked.
- [ ] Shopify bulk inventory reset backend gap is tracked.
- [ ] User setup backend gap is tracked.
- [ ] Shopify job family setup backend gaps are tracked.
- [ ] AWS/EventBridge/SQS setup is manual-validation only until provisioning backend exists.
- [ ] Readiness review shows exact blockers instead of letting the user think setup is complete.

## Test Plan

### Static Tests

Run:

```bash
cd /Users/adityapatel/Documents/GitHub/accxui
pnpm --filter company lint
pnpm --filter company build
rg -n "ion-grid|ion-row|ion-col" /Users/adityapatel/Documents/GitHub/company/src/views /Users/adityapatel/Documents/GitHub/company/src/components
rg -n "features/.*/settings|bopis/settings|shipFromStore/settings|storeInventory/settings|preorders/settings" /Users/adityapatel/Documents/GitHub/company/src /Users/adityapatel/Documents/GitHub/company/docs
```

Expected:

- lint passes
- build passes
- no new Ionic grid matches
- no feature-specific settings endpoint matches

### Browser Tests

Run:

```bash
cd /Users/adityapatel/Documents/GitHub/accxui
pnpm --filter company dev --host 0.0.0.0 --port 8111
```

Check:

- desktop `/create-product-store`
- desktop `/product-store-onboarding/{productStoreId}`
- mobile `/create-product-store`
- mobile `/product-store-onboarding/{productStoreId}`
- existing-store create flow
- first-store create flow
- Shopify connected path
- Shopify not connected path
- skipped optional realtime order import path
- blocked backend-gap path

### API Smoke Tests

Use the authenticated app session and network panel to verify:

```text
POST /rest/s1/admin/productStores
PUT /rest/s1/admin/productStores/{productStoreId}
GET /rest/s1/admin/productStores/{productStoreId}/settings
POST /rest/s1/admin/productStores/{productStoreId}/settings
GET /rest/s1/oms/shopifyShops/shops
POST /rest/s1/oms/systemMessageRemotes
POST /rest/s1/oms/shopifyShops/shops
GET /rest/s1/oms/shopifyShops/locations
POST /rest/s1/oms/shopifyShops/locations
GET /rest/s1/admin/dataManager/details
GET /rest/s1/admin/dataManager/downloadDataManagerFile
```

Expected:

- settings are saved only through ProductStoreSetting endpoint
- ProductStore fields are saved only through ProductStore endpoint
- blocked backend gaps do not fire fake API calls
- skipped optional steps are recorded in readiness state

## Definition Of Done

- A first-time Shopify retailer can create a ProductStore and land in a guided onboarding flow.
- The flow covers the full cold-start OMS journey, not only ProductStore fields.
- Existing endpoints are used where they exist.
- Backend gaps are explicit and actionable.
- ProductStore fields and ProductStoreSetting enum IDs are grouped by topic in the UI.
- No per-feature settings endpoints exist.
- No Ionic grid layout is introduced.
- The flow is mobile-compatible.
- The readiness review gives an honest setup state: complete, skipped, blocked, or needs input.
- Lint, build, browser checks, and API smoke checks are recorded before PR.
