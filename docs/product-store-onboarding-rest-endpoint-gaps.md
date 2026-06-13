# Product Store Onboarding REST Endpoint Gaps

## Purpose

Track REST endpoints needed for the product store onboarding/setup assistant. This is a running research document: each endpoint should stay marked as candidate, existing, gap, or needs more research until verified against the live backend and source REST files.

The goal is to keep a simple list of backend APIs needed for setup flows, especially APIs that do not exist today or are not bounded enough for a self-serve onboarding UI.

## Status Legend

| Status | Meaning |
| --- | --- |
| Existing | A bounded REST endpoint exists today and appears suitable. |
| Gap | No suitable bounded REST endpoint found yet. |
| Candidate | A possible endpoint exists, but payload, semantics, or ownership need validation. |
| Composite | The setup action spans multiple existing endpoints and may need a purpose-built orchestration endpoint. |
| Defer | Too complex to define as a single endpoint yet; needs separate breakdown. |

## Endpoint Inventory

### 1. Update Product Store Entity

| Field | Value |
| --- | --- |
| Status | Existing |
| Existing endpoint | `PUT /rest/s1/admin/productStores/{productStoreId}` |
| Source evidence | `hotwax-maarg-util/service/admin.rest.xml` has `admin/productStores/{productStoreId}` with `put` on `ProductStore`. Company app already calls `admin/productStores/${productStoreId}`. |
| Notes | This covers raw ProductStore field updates. Guided setup should group fields by topic in the UI and write through this endpoint; do not add feature-specific ProductStore update endpoints. |

### 2. Generate OMS JWT Token For App Handoff

| Field | Value |
| --- | --- |
| Status | Candidate |
| Existing current-user auth endpoint | `POST /rest/s1/admin/login` |
| Existing backend primitives | `co.hotwax.auth.JWTManager.createJwt(...)`; deprecated helper `co.hotwax.util.MaargUtil.getOmsJwtToken(...)`; `OmsRestServiceRunner` also signs OMS REST calls with this JWT manager. |
| OFBiz precedent | `generateJwtToken` service plus `CreateJwtToken` screen creates long-lived JWTs for integration users; `CommerceAuthEvents.goToLaunchpad` creates short-lived current-user handoff tokens. |
| Proposed endpoint | `POST /rest/s1/admin/jwtTokens` |
| Purpose | Generate a general OMS/Maarg JWT directly from Moqui for an integration/service user. This should not call OFBiz REST and should not be owned by the Shopify bridge. |
| Draft payload | `subjectUserLoginId`, `expireIn`, `purpose`, `category`; default `category` should probably be `INTEGRATION` for integration-user tokens. |
| Notes | The original wording "Shopify app token" was misleading. If the UI only needs to launch another browser app as the current user, no new minting endpoint is needed; use the current Moqui token from `admin/login`/`commonUtil.getToken()`. If onboarding needs a server-side credential for Nifi, Shopify, MDM, or another integration, create a Moqui-native admin/auth REST wrapper around `JWTManager.createJwt(...)` and permission it like OFBiz `JWT_TOKEN_CREATE`. |

### 3. Update Shopify Shop Type Table

| Field | Value |
| --- | --- |
| Status | Existing |
| Existing endpoints | `GET /rest/s1/oms/shopifyShops/typeMappings`, `POST /rest/s1/oms/shopifyShops/typeMappings` |
| Source evidence | Company app reads and stores mappings through `oms/shopifyShops/typeMappings`; OMS REST exposes GET list and POST `store` for `ShopifyShopTypeMapping`. |
| Notes | No new endpoint appears necessary. The POST is a `store` operation, so onboarding can reuse the current table-mapping contract instead of adding `PUT /typeMappings/{mappingId}`. If a mapping key changes, the existing UI pattern is replace-by-delete-and-store rather than partial update. |

### 4. Update Shopify Shop Read And Write Access

| Field | Value |
| --- | --- |
| Status | Existing primitive |
| Existing endpoint | `PUT /rest/s1/oms/systemMessageRemotes/{systemMessageRemoteId}` |
| Existing read endpoint | `GET /rest/s1/oms/systemMessageRemotes` |
| Owner | `moqui.service.message.SystemMessageRemote.accessScopeEnumId` |
| Purpose | Update Shopify read/write access state for the Shopify remote tied to a shop. |
| Notes | Active Shopify access scope is managed on `SystemMessageRemote`, not on `ShopifyShop`. `ShopifyShop` has no `accessScopeEnumId`. `ShopifyConfig.accessScopeEnumId` exists in the older/config model and appears through `ShopifyShopAndConfig`, but the current Shopify remote setup and runtime write-access checks use `SystemMessageRemote.accessScopeEnumId`. Onboarding can use the existing system-message-remote update endpoint if it has resolved the correct remote. A shop-level wrapper is only needed if we want the backend to resolve the remote from `shopId` and prevent updating unrelated remote fields. |

### 5. Create Facility

| Field | Value |
| --- | --- |
| Status | Existing |
| Existing endpoint | `POST /rest/s1/admin/facilities` |
| Source evidence | `hotwax-maarg-util/service/admin.rest.xml` has `admin/facilities` POST on `Facility`. |
| Notes | This creates the base facility. Full onboarding may also need address, facility roles, facility/product-store association, Shopify location mapping, and facility group membership. |

### 6. Import/Create Facilities CSV From MDM

| Field | Value |
| --- | --- |
| Status | Existing |
| Existing upload endpoint | `POST /rest/s1/admin/uploadDataManagerFile` |
| Required upload fields | Multipart `contentFile`, `configId=<facility-import DataManagerConfig>` |
| Companion endpoints | `GET /rest/s1/admin/dataManager`, `GET /rest/s1/admin/dataManager/{configId}`, `GET /rest/s1/admin/dataManager/{configId}/downloadTemplate`, `GET /rest/s1/admin/dataManager/details` |
| Notes | Do not add a bespoke `admin/mdm/facility-imports` endpoint. Company should clone the Job Manager manual upload flow and scope the available configs to the facility-import task. The remaining work is identifying the correct facility import `configId`, required CSV columns, and any optional `parameters` needed by the import service. |

### 7. Upload Inventory Reset To MDM

| Field | Value |
| --- | --- |
| Status | Gap |
| Existing upload endpoint | `POST /rest/s1/admin/uploadDataManagerFile` |
| Existing merged Moqui reset primitive | `co.hotwax.poorti.FulfillmentServices.create#ExternalInventoryReset` exists in `hotwax-poorti` and creates `ExternalInventoryReset` plus an `InventoryItemDetail` diff after resolving the facility/product inventory item. Current `origin/main` shape requires `externalATP`, `externalQOH`, and `unitCost`. |
| Branch-only generic reset candidate | `hotwax-poorti#267` adds `co.hotwax.poorti.FulfillmentServices.reset#InventoryItem` for QOH-only, ATP-only, or both-value reset inputs, validates a reason, skips no-op resets, and links `resetItemId`/`reasonEnumId` onto the inventory detail. `create#ExternalInventoryReset` remains as the external-identifier compatibility entry point and delegates into the centralized reset path. |
| Existing merged DataManager precedent | `mantle-netsuite-connector` has `DataManagerConfig configId="STORE_INV_RESET"` pointing to `co.hotwax.netsuite.InventoryServices.process#ExternalInventoryReset`. This is NetSuite-specific: it reads a NetSuite reset/import row and records variance data in `co.netsuite.integration.NetsuiteInventoryReset`; it does not provide a generic Shopify/OMS inventory reset file import. |
| Missing generic DataManager config | Need a generic Moqui `DataManagerConfig` for onboarding inventory reset, likely reusing the Poorti reset primitive instead of the NetSuite-specific service. No generic `RESET_INVENTORY` or Shopify-ready reset config was found in `oms`, `hotwax-maarg-util`, `hotwax-poorti`, or `hotwax-shopify-oms-bridge`. |
| Missing generic file import wrapper | Need a file-consuming service that maps CSV rows to product/facility identity and calls the generic reset service. The likely target should be the branch-style `reset#InventoryItem` contract, or an equivalent merged version of `create#ExternalInventoryReset` that supports QOH-only resets. |
| Existing lower-level Moqui primitives | `co.hotwax.oms.product.ProductServices.findOrCreate#FacilityInventoryItem`, `co.hotwax.oms.product.InventoryServices.create#InventoryItemDetail`, and `co.hotwax.oms.product.InventoryServices.update#InventoryItemFromDetail` remain the low-level building blocks. |
| Legacy OFBiz precedent | Old OFBiz OMS has `RESET_INVENTORY` -> `resetInventoryByIdentification`, where `resetByATP=false` dispatches to `resetInHandInventory`. This is not a Moqui OMS endpoint/config. |
| Required upload fields | TBD after choosing the generic reset service shape. Likely fields: external facility id or facility id, product identity type/value or product id, reset quantity, reset mode (`QOH` for onboarding), reason, and optional description/import id. |
| Companion endpoints | `GET /rest/s1/admin/dataManager/{configId}/downloadTemplate`, `GET /rest/s1/admin/dataManager/details`, `GET /rest/s1/admin/dataManager/downloadDataManagerFile` |
| Notes | Do not add a bespoke `admin/mdm/inventory-resets` endpoint for CSV upload. The onboarding UI should present inventory reset as a task-specific wrapper over the generic DataManager upload/log schema, with guardrails in UI copy, config selection, and confirmation. Backend work is still needed to merge/finish the generic reset service shape and seed a generic file-consuming DataManager config. |

### 8. Import Inventory From Shopify And Reset OMS

| Field | Value |
| --- | --- |
| Status | Composite |
| Candidate Shopify source | Admin GraphQL `bulkOperationRunQuery` over `inventoryItems { inventoryLevels { quantities } }` |
| Proposed orchestration endpoint | `POST /rest/s1/shopify/shops/{shopId}/inventory/reset-file-from-shopify` |
| Implementation pattern | Mirror the product import bulk-operation pattern: produce a Shopify bulk-query system message, send through the shared bulk-operation sender, poll the exact Shopify bulk operation id, then continue into file processing/DataManager import. |
| Purpose | Pull Shopify inventory in bulk, transform it into the OMS inventory reset CSV shape, and then feed the file into the generic DataManager upload/log flow. |
| Reset quantity | Use Shopify `on_hand`. The goal is to load physical on-hand stock into OMS, then let HotWax ATP, safety stock, and routing rules calculate sellable inventory. |
| Notes | This should not be modeled as a raw file upload from the user, but the output should still become a normal DataManager inventory reset file/log. Needs careful semantics: source shop, product store, Shopify location-to-OMS facility mapping, SKU/product mapping, dry run, irreversible-write confirmation, and suppression of outbound Shopify inventory echo if `ExternalInventoryReset` creation triggers Shopify bridge SECAs. |

#### Shopify Bulk Inventory Export Candidate

Shopify Admin GraphQL bulk operations can fetch inventory asynchronously as JSONL. The validated candidate query shape is:

```graphql
mutation StartInventoryResetExport {
  bulkOperationRunQuery(
    groupObjects: false
    query: """
    {
      inventoryItems(first: 250) {
        edges {
          node {
            id
            legacyResourceId
            sku
            tracked
            inventoryLevels(first: 250) {
              edges {
                node {
                  id
                  location {
                    id
                    name
                    legacyResourceId
                  }
                  quantities(names: ["available", "on_hand", "committed", "reserved", "incoming", "safety_stock"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    }
    """
  ) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
```

The runtime should follow the same pattern as Shopify product import:

1. Create/queue an inventory bulk-query system message for the shop.
2. Let the shared Shopify bulk-operation sender submit the `bulkOperationRunQuery` when Shopify has an open bulk-operation slot.
3. Store the Shopify bulk operation id on the Moqui system message, the same way product import tracks the remote bulk operation.
4. Poll the exact operation with `bulkOperation(id: ...)`, not a generic `currentBulkOperation` lookup.
5. When Shopify returns the JSONL URL, transform each inventory item/location row into the inventory reset CSV.
6. For each row, use the `on_hand` quantity as the reset quantity.
7. Submit the generated file through `POST /rest/s1/admin/uploadDataManagerFile` with the inventory reset `configId`, so the result is a normal DataManager log with imported/error files.

### 9. Download MDM Template Files

| Field | Value |
| --- | --- |
| Status | Existing |
| Existing endpoints | `GET /rest/s1/admin/dataManager`, `GET /rest/s1/admin/dataManager/{configId}`, `GET /rest/s1/admin/dataManager/{configId}/downloadTemplate` |
| Source evidence | `hotwax-maarg-util/service/admin.rest.xml` has DataManager config list/detail plus `admin/dataManager/{configId}/downloadTemplate`. Job Manager uses the same template endpoint from `ImportDetail.vue`. |
| Notes | No template-download endpoint gap. Company should expose a friendly onboarding task catalog that maps each task to the correct DataManager `configId`, then call the generic template endpoint. |

### 10. Create User And Associate To Security Group

| Field | Value |
| --- | --- |
| Status | Gap |
| Proposed endpoint | `POST /rest/s1/admin/users/setup` |
| Purpose | Create user, attach security groups, and optionally associate facilities/product stores in one setup-safe call. |
| Notes | Old Users app uses legacy `service/*` calls and `performFind`; this onboarding flow should use bounded REST. Need payload for user profile, login, groups, facility roles, product store roles, and invitation/reset-password behavior. |

### 11. Import Users From CSV

| Field | Value |
| --- | --- |
| Status | Existing |
| Existing upload endpoint | `POST /rest/s1/admin/uploadDataManagerFile` |
| Required upload fields | Multipart `contentFile`, `configId=<user-import DataManagerConfig>` |
| Companion endpoints | `GET /rest/s1/admin/dataManager/{configId}/downloadTemplate`, `GET /rest/s1/admin/dataManager/details`, `GET /rest/s1/admin/dataManager/downloadDataManagerFile` |
| Notes | Do not add `admin/users/imports` for CSV upload. User CSV import should be another curated DataManager upload task. The remaining work is confirming the user import config, required role/security-group columns, duplicate behavior, and whether facility/product-store associations can be handled by the import service or need a post-import setup step. |

### 12. Clone Order Routing To Product Store

| Field | Value |
| --- | --- |
| Status | Defer |
| Candidate existing endpoint | `POST /rest/s1/order-routing/routings/{orderRoutingId}/clone` |
| Proposed onboarding endpoint | `POST /rest/s1/admin/productStores/{productStoreId}/orderRouting/clone` |
| Notes | Existing order-routing clone is not necessarily product-store onboarding ready. Need break down source routing selection, target product store scoping, rule/action/filter copying, schedule/jobs, and conflict behavior. |

### 13. Copy ATP Rules

| Field | Value |
| --- | --- |
| Status | Defer |
| Proposed endpoint | `POST /rest/s1/admin/productStores/{productStoreId}/atpRules/clone` |
| Notes | Needs separate breakdown. Must identify source app/API ownership in Available to Promise, rule groups, inventory channels, facility groups, and product-store scope. |

### 14. Setup Shopify Jobs

| Field | Value |
| --- | --- |
| Status | Composite |
| Existing endpoints | `GET/POST/PUT /rest/s1/admin/serviceJobs`, `POST /rest/s1/admin/serviceJobs/{jobName}/clone` |
| Existing webhook primitive | `co.hotwax.shopify.webhook.ShopifyWebhookServices.create#WebhookSubscription` can create Shopify webhook subscriptions and accepts an EventBridge ARN as the `endPoint`/`uri`. Company has precedent for `shopify/webhook-subscription` calls in product sync, but the order onboarding wrapper still needs to accept and validate the destination ARN. |
| Existing setup precedent | `hotwax-shopify-oms-bridge/screen/ShopifyOmsBridge/ShopifyOrderIntegrationSetup.xml` is Purushottam's Moqui setup screen. It checks integration health, updates AWS SQS credentials, edits/clones fallback and history jobs, subscribes webhooks, and shows manual AWS setup instructions. It does not provision AWS EventBridge/SQS resources. |
| Proposed umbrella endpoint | `POST /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/setup` |
| Notes | Existing service-job CRUD/clone exists. Onboarding needs task-oriented setup endpoints that know the draft job names, set `systemMessageRemoteId`/queue parameters safely, validate access scopes, and activate only the selected job families. |

#### Shopify Job Families

This onboarding area should help a Shopify retailer clone and configure only the draft jobs they selected:

1. Sync Shopify sales orders into HotWax.
2. Sync HotWax inventory to Shopify.
3. Configure Amazon EventBridge/SQS so Shopify order events can be imported in near real time.

| Job family | Proposed endpoint | Status | Current primitives | Setup writes |
| --- | --- | --- | --- | --- |
| Shopify sales order sync, fallback/batch | `POST /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/orderImport/setup` | Gap wrapper over existing jobs | Draft job `queue_ShopifyOrderSync` queues `ShopifyOrderSync` messages. Draft job `sync_ShopifyOrderHistory` uses `BULK_ORDER_HISTORY`. Both eventually stage orders through the same DataManager order import path. | Clone draft jobs to the selected shop/product store, set `systemMessageRemoteId`, set schedule/cadence, set launch/history dates, ensure `SYNC_SHOPIFY_ORDER`, `UPDATE_SHOPIFY_ORDER`, and `BULK_ORDER_HISTORY` DataManager configs exist, then optionally unpause. |
| Shopify sales order sync, realtime SQS | `POST /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/orderImport/realtimeSqs/setup` | Gap wrapper plus possible AWS provisioning gap | Existing consumer job `consume_ShopifyOrders_SQS` calls `co.hotwax.shopify.order.SqsOrderImport.consume#SQSOrderMessages`. It reads EventBridge messages from SQS, resolves the Shopify remote from the message shop domain, stages orders, and deletes consumed messages. | Decide whether to use one instance-wide consumer job or clone one per shop. Store AWS SQS connection in `SystemMessageRemote` such as `AWS_CONFIG`, set `queueName` and `systemMessageRemoteId` on the consumer job, create Shopify webhook subscriptions for order topics using the EventBridge ARN, then unpause after validation. |
| Inventory sync to Shopify | `POST /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/inventoryToShopify/setup` | Gap wrapper over existing bridge behavior | Draft job `resetShopifyInventoryQoh` queues `ResetInventoryQoh`. Inventory SECAs in the Shopify bridge post inventory updates only when `ProductStoreSetting SHOPIFY_INV_SYNC=Y`. The bridge service uses Shopify `inventorySetQuantities` with `name=on_hand`. | Clone/configure `resetShopifyInventoryQoh`, set `systemMessageRemoteId`, enable `ProductStoreSetting SHOPIFY_INV_SYNC=Y`, validate Shopify `write_inventory` access, validate `ShopifyShopLocation` mappings, and confirm HotWax is intended to be the inventory source of truth before unpausing. |
| Inventory import from Shopify to reset OMS | `POST /rest/s1/shopify/shops/{shopId}/inventory/reset-file-from-shopify` | Already tracked in section 8 | This is not the same as syncing HotWax inventory to Shopify. It should run a Shopify bulk operation, transform Shopify `on_hand` into an OMS inventory reset file, and feed the generic DataManager reset flow. | Keep this separate from `inventoryToShopify/setup` so first-time setup does not accidentally echo Shopify-sourced reset quantities back to Shopify. |

#### Realtime Order Import: Shopify EventBridge + AWS SQS

Current backend reality:

- Moqui already has an SQS consumer path for Shopify order events: `consume_ShopifyOrders_SQS` -> `co.hotwax.shopify.order.SqsOrderImport.consume#SQSOrderMessages`.
- `AwsSqsTool` can validate and consume SQS queues using an AWS access key, secret, and SQS URL stored on `SystemMessageRemote`.
- `ShopifyWebhookServices.create#WebhookSubscription` can register an EventBridge ARN as the Shopify webhook destination.
- No current Moqui code was found that creates AWS partner event buses, SQS queues, EventBridge rules, targets, queue policies, or DLQs.

Recommended onboarding shape for v1:

| Mode | What user provides | What HotWax validates/does | Why |
| --- | --- | --- | --- |
| Assisted manual AWS setup | AWS region, AWS account id, EventBridge partner event source/bus ARN, SQS queue URL/name, SQS queue ARN, optional DLQ ARN, AWS access key/secret for SQS consume, selected Shopify order topics. | Validate SQS connectivity with `AwsSqsTool.canConnect`, register Shopify webhook subscription to the EventBridge ARN, configure/clone the consumer job, show a health checklist. | This matches what the backend can do today and avoids giving Moqui broad AWS resource-creation permissions before we design the security model. |
| Fully automated AWS provisioning | AWS credentials or role with EventBridge/SQS management permissions, desired queue/rule names, region/account, selected Shopify order topics. | Create/associate partner event bus, create SQS/DLQ, create EventBridge rule, set SQS target, attach queue policy, store metadata, register Shopify webhook subscription, configure/clone jobs. | Cleaner UX later, but this is a real backend gap because current code only consumes SQS. |

Fully automated provisioning would require a new AWS setup service, likely outside the Shopify bridge or in a narrow integration setup package. Minimum AWS actions to design around:

| Area | Required capability |
| --- | --- |
| EventBridge partner source | The Shopify partner event source must be created/available for the AWS account, then associated to a partner event bus. Events sent before association are dropped by EventBridge. |
| EventBridge management | `events:CreateEventBus` with `--event-source-name`, `events:DescribeEventSource`, `events:PutRule`, `events:PutTargets`, `events:DescribeRule`, `events:ListTargetsByRule`, plus cleanup actions if onboarding supports rollback. |
| SQS management | `sqs:CreateQueue`, `sqs:GetQueueUrl`, `sqs:GetQueueAttributes`, `sqs:SetQueueAttributes`, and DLQ/redrive-policy management if we create a DLQ. |
| SQS consume runtime | `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility`, `sqs:GetQueueAttributes`. These are the runtime permissions the Moqui consumer needs after setup. |
| SQS target permission | The SQS queue policy must allow the EventBridge service principal `events.amazonaws.com` to call `sqs:SendMessage`, restricted by the EventBridge rule ARN using `aws:SourceArn`. |
| Encryption | If the queue uses a customer-managed KMS key, the consumer needs `kms:Decrypt`; the producer path also needs the KMS permissions required for the service delivering to SQS. |
| Shopify access | Webhook topics require Shopify app access scopes. For order import, start with `ORDERS_CREATE` and `ORDERS_UPDATED`; `ORDERS_CREATE` requires `read_orders` or `read_marketplace_orders`, while `ORDERS_UPDATED` can also require `read_buyer_membership_orders` depending on the selected scope model. |

Candidate backend endpoints:

| Endpoint | Status | Purpose |
| --- | --- | --- |
| `GET /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/status` | Gap | Return selected shop, access scopes, draft job status, cloned job status, webhook subscriptions, AWS config health, SQS connectivity, and missing prerequisites. |
| `POST /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/cloneDrafts` | Gap | Clone only the requested draft job families to the shop/product store and set common parameters. |
| `PUT /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/orderImport` | Gap | Configure fallback/history order import jobs and dates. |
| `PUT /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/inventoryToShopify` | Gap | Configure outbound inventory sync job plus `SHOPIFY_INV_SYNC` setting after source-of-truth confirmation. |
| `PUT /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/realtimeOrders/awsSqs` | Gap | Store or validate AWS SQS connection, queue name, EventBridge ARN, order topics, and consumer-job parameters. |
| `POST /rest/s1/admin/productStores/{productStoreId}/shopifyJobs/realtimeOrders/awsResources` | Future gap | Optional later endpoint to provision EventBridge/SQS resources if we decide Moqui should create AWS infrastructure. |
| `POST /rest/s1/admin/productStores/{productStoreId}/shopifyWebhooks/orderImport` | Gap wrapper | Create/update Shopify order webhook subscriptions with an explicit EventBridge ARN destination and selected topics. |

Product decision to keep explicit:

- For self-serve onboarding, the cleanest v1 is assisted AWS setup plus validation. The user performs or pastes the AWS resources, and HotWax validates, stores, subscribes, and clones jobs.
- Fully automated AWS creation is a separate backend feature. It needs IAM/credential design, resource naming, rollback behavior, DLQ policy, secret rotation, and audit before it should be exposed to users.
- We should not merge "inventory from Shopify to reset OMS" with "inventory sync to Shopify". They are opposite directions and can create loops if the reset import triggers outbound inventory SECAs.

### 15. Configure Product Store Fields And Settings By Topic

| Field | Value |
| --- | --- |
| Status | Existing endpoints; UI/topic grouping work |
| ProductStore endpoint | `PUT /rest/s1/admin/productStores/{productStoreId}` |
| ProductStoreSetting endpoint | `POST /rest/s1/admin/productStores/{productStoreId}/settings` |
| Existing grouping source | `src/views/AddConfigurations.vue` and `src/views/CloneProductStore.vue` already group ProductStore fields and ProductStoreSetting enum IDs by setup topic. If there is a separate canonical Markdown settings catalog, link it here when found. |
| Notes | Do not create one backend endpoint per feature such as BOPIS, Ship from Store, Store Inventory Management, or Pre-orders. The backend already has the needed raw writes for this part. Onboarding should present curated topic groups, write ProductStore fields/settings through the existing endpoints, and leave untouched settings out of the flow. |

#### Topic Groups

| Topic | ProductStore fields | ProductStoreSetting enum IDs | UI implication |
| --- | --- | --- | --- |
| Order configurations | `autoApproveOrder`, `orderNumberPrefix` | `SAVE_BILL_TO_INF`, `RETURN_DEADLINE_DAYS` | Ask only the order-numbering and approval questions needed for the selected setup path. |
| Brokering rules | `enableBrokering`, `allowSplit` | `PRE_SLCTD_FAC_TAG`, `ORD_ITM_SHIP_FAC`, `BRK_SHPMNT_THRESHOLD` | Present routing/brokering controls as a setup topic, not as a feature-specific REST contract. Revalidate whether every existing setting in this group should remain visible in guided onboarding. |
| Fulfillment settings | `daysToCancelNonPay` | `FULFILL_NOTIF`, `BOPIS_PART_ODR_REJ` | Covers fulfillment notification behavior and BOPIS partial-rejection behavior when those flows are selected. |
| Inventory settings | `reserveInventory` | `INV_CNT_VIEW_QOH`, `HOLD_PRORD_PHYCL_INV`, `PRE_ORDER_GROUP_ID` | Covers inventory reservation, store inventory visibility, and preorder inventory behavior. |
| Product configurations | `productIdentifierEnumId` | `PRDT_IDEN_PREF` | Keep product identity setup as a first-class onboarding topic because downstream imports and Shopify mappings depend on it. |
| Order edit permissions | None in current map | `CUST_DLVRMTHD_UPDATE`, `RF_SHIPPING_METHOD`, `CUST_DLVRADR_UPDATE`, `CUST_PCKUP_UPDATE`, `CUST_ALLOW_CNCL` | Present as customer/order-edit permissions; these are settings-only writes. |

## Current Existing Endpoint Evidence

These endpoints are currently known to exist and should not be listed as gaps unless the onboarding UI needs a stricter workflow wrapper.

| Endpoint | Use |
| --- | --- |
| `GET /rest/s1/admin/productStores` | List product stores. |
| `POST /rest/s1/admin/productStores` | Create product store. |
| `GET /rest/s1/admin/productStores/{productStoreId}` | Read product store. |
| `PUT /rest/s1/admin/productStores/{productStoreId}` | Update product store. |
| `GET /rest/s1/admin/productStores/{productStoreId}/settings` | List product store settings. |
| `POST /rest/s1/admin/productStores/{productStoreId}/settings` | Store product store setting. |
| `POST /rest/s1/admin/facilities` | Create facility. |
| `PUT /rest/s1/admin/facilities/{facilityId}` | Update facility. |
| `POST /rest/s1/admin/facilityGroups` | Create facility group. |
| `POST /rest/s1/admin/facilityGroups/{facilityGroupId}/facilities/{facilityId}/association` | Store facility group member association. |
| `POST /rest/s1/admin/productStores/{productStoreId}/facilities/{facilityId}/association` | Store product-store facility association. |
| `GET/POST/PUT /rest/s1/admin/serviceJobs` | Service job list/create/update. |
| `POST /rest/s1/admin/serviceJobs/{jobName}/clone` | Clone service job. |
| `GET /rest/s1/admin/dataManager` | List DataManager configs. |
| `GET /rest/s1/admin/dataManager/{configId}` | Read one DataManager config. |
| `POST /rest/s1/admin/uploadDataManagerFile` | Generic DataManager file upload. |
| `GET /rest/s1/admin/dataManager/{configId}/downloadTemplate` | Download DataManager template. |
| `GET /rest/s1/admin/dataManager/details` | Read DataManager log details, including imported/error content metadata and record counts. |
| `GET /rest/s1/admin/dataManager/downloadDataManagerFile` | Download imported or error file content for a DataManager log. |
| `GET/PUT/DELETE /rest/s1/admin/dataManager/logs/{logId}` | Read, update, or delete a DataManager log. |
| `GET/POST /rest/s1/oms/shopifyShops/shops` | Shopify shop list/create. |
| `PUT /rest/s1/oms/shopifyShops/shops/{shopId}` | Shopify shop update. |
| `GET/POST /rest/s1/oms/shopifyShops/typeMappings` | Shopify type mapping list/store. |
| `GET/POST /rest/s1/oms/shopifyShops/locations` | Shopify location mapping list/store. |
| `GET/POST /rest/s1/oms/shopifyShops/carrierShipments` | Shopify shipping method/carrier mapping. |
| `POST /rest/s1/admin/login` | Existing Maarg auth endpoint. Accepts username/password or an OMS JWT and returns the current app token, expiration time, and login key. |

## Existing Backend Primitives Without Onboarding REST Wrappers

These are not gaps in backend capability, but may still need bounded REST contracts before the onboarding UI can use them safely.

| Capability | Existing owner | Onboarding implication |
| --- | --- | --- |
| JWT signing/validation | `hotwax-maarg-util` `co.hotwax.auth.JWTManager` | Do not reimplement in Shopify bridge. Add a small admin/auth wrapper only if users must generate an integration or app-handoff token from Company. |
| OFBiz-style integration token creation | `hotwax-oms` `generateJwtToken` service and `CreateJWTToken.ftl` | Moqui should mirror this as an admin/auth endpoint if we need self-serve integration-token creation. |
| App login with OMS JWT | `POST /rest/s1/admin/login` | If the token is only used to launch another HotWax app, the receiving app can exchange/accept the token through the existing login path. |

## Generic DataManager File Upload Contract

All onboarding file imports should use the same DataManager upload/log schema that Job Manager uses for manual uploads. Company should clone that flow instead of creating one-off REST endpoints for each CSV import.

### Flow

| Step | Endpoint | UI behavior |
| --- | --- | --- |
| Choose import task | `GET /rest/s1/admin/dataManager` or a curated local task-to-`configId` map | Show onboarding tasks such as facilities, inventory reset, or users instead of exposing raw config IDs. |
| Read task config | `GET /rest/s1/admin/dataManager/{configId}` | Display the config description/script title and use it to label the task. |
| Download template | `GET /rest/s1/admin/dataManager/{configId}/downloadTemplate` | Download the exact CSV template for the selected task. |
| Upload file | `POST /rest/s1/admin/uploadDataManagerFile` | Send multipart form data with `contentFile`, `configId`, and optional `parameters`. The backend creates a pending `DataManagerLog` and returns `logId`. |
| Track result | `GET /rest/s1/admin/dataManager/details?logId=...` or `?configId=...` | Poll or refresh log status, counts, and imported/error content metadata. |
| Download files | `GET /rest/s1/admin/dataManager/downloadDataManagerFile?configId=...&logContentId=...` | Download the imported file or error file for a log. Company already has helpers for this in `useDataManagerLog`. |
| Cancel/update log | `PUT /rest/s1/admin/dataManager/logs/{logId}` | Update `statusId`, such as canceling a pending log. Job Manager currently has a singular `log` path in its store, but the REST source defines `logs/{logId}`; verify the route before copying cancel behavior. |

### Shared payload shape

```text
POST /rest/s1/admin/uploadDataManagerFile
Content-Type: multipart/form-data

contentFile=<csv file>
configId=<DataManagerConfig.configId>
parameters=<optional task-specific parameter map/list>
```

Backend behavior comes from `co.hotwax.util.UtilityServices.upload#DataManagerFile`: it verifies the config exists, stores the file under `runtime://datamanager/imported/{configId}`, creates a `DataManagerLog` with `statusId=DmlsPending`, links imported file content, stores optional parameters, and returns `logId`.

### Company onboarding implication

The Company app needs a reusable "DataManager upload task" UI, not new REST endpoints. Each onboarding section should supply:

- Task label and description.
- `configId`.
- Template download action.
- Upload action.
- Recent log/progress panel.
- Error-record download and review action.
- Optional parameters required by that import service.

The current backend gap is only the curated mapping of onboarding tasks to the correct DataManager configs and required parameters. If a needed config is missing from seed data, that is a seed/config gap, not a new upload endpoint gap.

## Moqui-Native JWT Token Issuance Spec

Use this spec for `POST /rest/s1/admin/jwtTokens` if onboarding needs to create an integration token without sending the user to OFBiz.

### Required distinction

| Use case | Endpoint | Behavior |
| --- | --- | --- |
| Current user signs into Company or another HotWax app | `POST /rest/s1/admin/login` | Existing endpoint. Accepts username/password or a valid OMS JWT and returns a current-user token, expiration time, and login key. |
| Admin creates a long-lived token for an integration/service user | `POST /rest/s1/admin/jwtTokens` | New endpoint. Authenticated admin action that signs a JWT directly in Moqui for a selected subject user. |

### Proposed request

```json
{
  "subjectUserLoginId": "nifi",
  "category": "INTEGRATION",
  "purpose": "NIFI_PRODUCT_IMPORT",
  "expireIn": 2592000
}
```

### Proposed response

```json
{
  "token": "eyJ...",
  "expirationTime": 1760000000000,
  "expireIn": 2592000,
  "issuedTo": "nifi",
  "issuedBy": "admin",
  "category": "INTEGRATION",
  "purpose": "NIFI_PRODUCT_IMPORT"
}
```

### Validation rules

- Caller must be authenticated and must have a Moqui/OFBiz permission equivalent to `JWT_TOKEN_CREATE`.
- `subjectUserLoginId` is required. Tokens should never be issued without a concrete user principal.
- `subjectUserLoginId` must resolve to an enabled `org.apache.ofbiz.security.login.UserLogin` because JWT auth and permissions still resolve through `userLoginId`.
- The same identity should exist as `moqui.security.UserAccount.username` or `externalUserId`; otherwise Moqui JWT login/app-auth may fail even if the token can be signed.
- For `category=INTEGRATION`, the subject user should be a member of the `INTEGRATION` security group. This mirrors the OFBiz token screen, which only lists users from `UserLoginSecurityGroup` where `groupId=INTEGRATION`.
- Reject disabled users and users where `requirePasswordChange=Y`.
- Set or verify `hasLoggedOut=N` for the subject user before issuing the token, matching the OFBiz workaround for integration tokens.
- Do not accept arbitrary claims from the UI. The service should own the allowed claim set.

### Claims to mint

| Claim | Source | Notes |
| --- | --- | --- |
| `userLoginId` | `subjectUserLoginId` | Required. This is the identity downstream auth uses. |
| `userId` | `moqui.security.UserAccount.userId` | Useful for Moqui apps, but `userLoginId` remains the compatibility key. |
| `issuedBy` | Current authenticated user | Audit/display only. |
| `purpose` | Request body | Required human-readable reason, capped like OFBiz currently caps purpose. |
| `category` | Request body, default `INTEGRATION` | Should be an enum/allow-list, not free-form trust. |

### Security notes

- The endpoint should not store the plaintext token. Return it once.
- If revocation is needed before expiry, disable the subject user or mark it logged out. There is no token-specific revocation list in the current model.
- Default expiry should be conservative. OFBiz supports 30 days, 6 months, 1 year, and 5 years; onboarding should default to 30 days and require deliberate selection for longer periods.
- This endpoint belongs in `hotwax-maarg-util` under `admin/auth` or `admin/jwtTokens`; it should not live in `hotwax-shopify-oms-bridge`.

## Research Log

| Date | Finding |
| --- | --- |
| 2026-06-12 | Initial pass from Company app calls plus local REST XML. ProductStore, facility, service job, DataManager template/upload/log, and Shopify mapping primitives exist. Feature-level setup endpoints and direct user setup are still gaps. |
| 2026-06-12 | Rechecked OFBiz `hotwax-oms` and Maarg. JWT generation is general auth/integration infrastructure, not Shopify bridge infrastructure. Maarg already has `JWTManager.createJwt(...)` and `admin/login` can accept OMS JWTs; the remaining gap is a bounded admin/auth REST wrapper if onboarding must create long-lived integration tokens. |
| 2026-06-12 | Refined JWT spec: Moqui can issue tokens directly with `JWTManager.createJwt(...)`; the token still must be issued against a real `userLoginId`/`UserAccount` principal so auth, permissions, and audit resolve correctly. For integration tokens, the subject should be a service user such as `nifi` and should belong to `INTEGRATION`. |
| 2026-06-12 | Reclassified Shopify shop type mappings as existing/no-change. Existing `GET/POST /rest/s1/oms/shopifyShops/typeMappings` is enough for onboarding because POST is an entity `store` operation. |
| 2026-06-12 | Confirmed Shopify read/write access scope is operationally managed on `moqui.service.message.SystemMessageRemote.accessScopeEnumId`. `ShopifyShop` does not have this field; `ShopifyConfig.accessScopeEnumId` exists but current remote creation/update and write-access checks use the system-message-remote row. |
| 2026-06-12 | Reclassified MDM file imports. Facility CSV import, inventory reset CSV upload, template download, and user CSV import should all clone Job Manager's generic DataManager upload/log flow in Company instead of adding bespoke REST endpoints. |
| 2026-06-12 | Validated that Shopify inventory can be fetched through Admin GraphQL bulk operations using `inventoryItems` with nested `inventoryLevels` and `quantities`. The reset-from-Shopify flow should be treated as bulk export, transform to inventory reset CSV, then generic DataManager upload/log. |
| 2026-06-12 | Product-store onboarding decision: Shopify-sourced inventory reset should mirror the existing Shopify product import bulk-operation pattern and load Shopify `on_hand` as the OMS reset quantity. |
| 2026-06-12 | Corrected inventory reset research boundary. `RESET_INVENTORY`, `resetInventoryByIdentification`, and `resetInHandInventory` are old OFBiz OMS artifacts from `hotwax-oms`, not Moqui OMS. Moqui has a merged reset primitive in `hotwax-poorti` (`create#ExternalInventoryReset`), but current `origin/main` does not have a generic inventory-reset DataManager config. |
| 2026-06-12 | Found Chinmay's branch candidate in `hotwax-poorti`: `origin/netsuite-external-inventory-reset` adds `reset#InventoryItem` and improves `create#ExternalInventoryReset` for QOH-only or ATP-only reset semantics. This has been recreated in `hotwax-poorti#267`; onboarding can depend on it once that PR is merged. |
| 2026-06-12 | Found merged NetSuite DataManager precedent: `mantle-netsuite-connector` seeds `STORE_INV_RESET` -> `co.hotwax.netsuite.InventoryServices.process#ExternalInventoryReset`. This confirms the DataManager upload pattern, but the implementation is NetSuite-specific and writes `NetsuiteInventoryReset` variance records rather than providing a generic Shopify/OMS reset import. |
| 2026-06-12 | Found Shopify bridge side effect: `hotwax-shopify-oms-bridge` has a SECA on `create#org.apache.ofbiz.product.inventory.ExternalInventoryReset` that calls `post#ShopifyExternalInventoryReset`. A Shopify-sourced inventory reset flow needs an origin/skip mechanism so importing Shopify `on_hand` into OMS does not immediately echo an adjustment back to Shopify. |
| 2026-06-12 | Expanded Shopify job-family setup. Existing backend can clone/edit service jobs, subscribe Shopify webhooks to an EventBridge ARN, and consume SQS messages through `consume_ShopifyOrders_SQS`, but it does not provision AWS EventBridge partner buses, rules, SQS queues, queue policies, or DLQs. |
| 2026-06-12 | Confirmed Purushottam's Shopify order integration setup screen is a Moqui health/setup screen, not a Company onboarding flow. It edits AWS SQS credentials, consumer/fallback/history jobs, and webhooks, while instructing the user to create SQS/EventBridge manually. |
| 2026-06-12 | Split inventory job directionality. `resetShopifyInventoryQoh` and `SHOPIFY_INV_SYNC=Y` are outbound HotWax-to-Shopify inventory sync, while the Shopify bulk inventory reset flow is inbound Shopify-to-OMS and should stay separate to avoid reset echo loops. |
| 2026-06-12 | AWS/EventBridge setup decision: v1 onboarding should probably be assisted manual AWS setup plus validation because current Moqui only consumes SQS. Fully automated provisioning is a separate backend gap requiring AWS EventBridge/SQS management clients, least-privilege IAM, queue policies, DLQ handling, rollback, and audit. |
| 2026-06-12 | Corrected feature-settings scope. We do not need per-feature settings endpoints; ProductStore fields and ProductStoreSetting enum IDs should be grouped by setup topic in the UI and saved through the existing ProductStore and ProductStoreSetting endpoints. Existing Company category maps already provide the topic grouping shape. |

## Open Questions

- For non-settings setup actions, should onboarding call low-level existing endpoints directly, or should backend expose solution setup endpoints that perform multiple writes atomically?
- Which integration users should cold-start onboarding create by default, if any: `nifi`, Shopify app user, MDM import user, or none until that integration is selected?
- Should `POST /rest/s1/admin/jwtTokens` require the subject user to already exist, or should it call the future user setup endpoint to create the service user first?
- For Shopify access updates, should onboarding call `PUT /rest/s1/oms/systemMessageRemotes/{systemMessageRemoteId}` directly, or should backend expose a narrow shop-level wrapper that only updates `accessScopeEnumId` after resolving the correct remote?
- Which curated DataManager config IDs should onboarding expose for facility import, inventory reset, and user import?
- What should the generic Moqui inventory reset DataManager config and file-consuming service be named, and where should they be seeded?
- How should Shopify-origin inventory reset suppress outbound Shopify echo from the `ExternalInventoryReset` SECA?
- Which optional DataManager upload `parameters` are required for each onboarding import task, such as product store, shop, owner party, facility group, or security group?
- Are any required DataManager configs missing from seed data, and if so should they be seeded before the onboarding UI exposes the task?
- Which Shopify location mapping is authoritative for inventory reset: Shopify `Location.id`, `Location.legacyResourceId`, or an existing `ShopifyShopLocation` mapping row?
- Should user setup live under `admin/users` or a dedicated onboarding namespace?
- Should the realtime SQS order consumer remain one instance-wide `consume_ShopifyOrders_SQS` job, or should onboarding clone a per-shop/per-product-store consumer job?
- Should v1 support only assisted manual AWS setup, or should we build automated EventBridge/SQS provisioning before exposing realtime order import?
- Where should onboarding persist AWS/EventBridge metadata beyond the SQS connection: event source ARN, partner event bus name, EventBridge rule ARN, queue ARN, DLQ ARN, and selected webhook topics?
- Which Shopify order topics should the standard setup enable: `ORDERS_CREATE`, `ORDERS_UPDATED`, `ORDERS_CANCELLED`, `REFUNDS_CREATE`, or a narrower first pass?
- Should order webhook subscriptions be app-specific config, shop-specific Admin GraphQL subscriptions, or shop-specific only when each merchant has a different EventBridge ARN?
- What should the least-privilege AWS credential story be: customer-owned AWS access key, assume-role into customer AWS account, HotWax-owned AWS account per tenant, or manual resources with only SQS consume credentials stored in Moqui?
- How should AWS credentials and Shopify webhook destinations be rotated, tested, and audited from the onboarding UI?
- What failure/retry contract should realtime order import expose: DLQ inspection, replay, fallback batch job, or "run order sync now" from a date?
- Which preorder job/setup actions are already owned by OMS and should be wrapped rather than rewritten, separate from ProductStore field/settings grouping?
