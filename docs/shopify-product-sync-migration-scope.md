# Shopify Product Sync Migration Scope

## Purpose

This document defines the migration scope for moving a Shopify shop from the legacy product-sync implementation to the new bulk-query product-sync implementation used by the Company app.

The goal is to make the implementation work off a concrete inventory of:

- legacy data that must be deprecated, removed, or deactivated
- new data that must exist after migration
- IDs and job names the app code must check for
- the ownership boundary between deployment seed data and app-created runtime data
- the version or release gate that determines whether the migration path is allowed

This is a scope document for implementation. It is intentionally biased toward concrete identifiers and verification rules instead of UI behavior.

## Migration Boundary

The migration is not only a UI change. It is a tenant-data migration that moves a shop from an older feed-based product sync into the newer Shopify bulk-query product sync.

Two classes of data are involved:

1. Seed or upgrade data that should already be present in a compatible backend deployment.
2. Runtime shop-specific data that the Company app or PWA must create, update, remove, or verify.

## Ownership

### App-owned migration work

The app or PWA owns the code that:

- deprecates, tears down, or deactivates legacy product-sync data
- creates or activates shop-specific runtime data for the new sync
- cancels or deactivates legacy in-flight work
- verifies that expected shop-specific runtime records exist after migration

### Deployment-owned seed data

The compatible backend deployment is expected to already contain seed or upgrade data for the new sync foundation. The app should verify that these artifacts exist before proceeding, but it should not assume responsibility for seeding them unless product explicitly decides otherwise.

Examples:

- shared SystemMessageType definitions
- shared ServiceJob templates
- shared webhook message types
- shared data documents used by the app

## Compatibility Gate

Migration must be blocked unless the connected backend is on a release that is compatible with the new bulk-query product sync.

The implementation should use a two-part gate:

1. Version or release gate
2. Artifact verification gate

### Version or release gate

The app should read deployment release metadata from the Maarg admin endpoint before exposing migration actions.

Current backend contract example:

- `GET /rest/s1/admin/maarg`
- Response path for the release gate: `instanceInfo.componentRelease`

Sample response shape:

```json
{
  "instanceInfo": {
    "instancePurpose": "dev",
    "instanceName": "devhc1",
    "omsInstanceUrl": "https://localhost:8443",
    "componentRelease": "UpcomingRelease"
  },
  "components": [
    {
      "name": "OFBizMigrate",
      "version": "unknown"
    }
  ]
}
```

Implementation guidance:

- Add a single minimum compatible release constant in the app, for example `MIN_PRODUCT_SYNC_MIGRATION_RELEASE`.
- For now, document the placeholder minimum release as `ProductSyncMigrationGate_2026_05`.
- Compare `instanceInfo.componentRelease` against that minimum.
- Do not allow migration when the backend release is lower than the minimum.
- Replace the placeholder value with the real release name before implementation ships.

### Artifact verification gate

Even when the release check passes, the app should verify that the required new-sync artifacts exist before teardown starts.

The version gate should answer "should this backend support the migration?"

The artifact gate should answer "does this tenant actually have the required seed data loaded?"

## Confirmed New Product Sync IDs

The following identifiers are confirmed in local source and should be treated as the current target state for the new sync.

### New system message types

| Artifact | ID | Source | Notes |
| --- | --- | --- | --- |
| Product sync bulk query SystemMessageType | `BulkQueryShopifyProductUpdates` | `mantle-shopify-connector/data/ShopifySetupSeedData.xml`, `company/src/services/ShopifyProductSyncService.ts` | The app uses this as the current product-sync message type. |
| Bulk operation finish webhook SystemMessageType | `BulkOperationsFinish` | `mantle-shopify-connector/data/ShopifySetupSeedData.xml` | Used to subscribe to `bulk_operations/finish`. |
| Shopify webhook parent type | `ShopifyWebhook` | `mantle-shopify-connector/data/ShopifySetupSeedData.xml` | Shared parent for webhook message types. |
| Optional delete-webhook helper type | `DeleteWebhookSubscription` | `mantle-shopify-connector/data/ShopifySetupSeedData.xml` | Useful if migration actively replaces a bad subscription rather than only checking presence. |

### New service jobs

| Artifact | ID | Source | Notes |
| --- | --- | --- | --- |
| Base per-shop product sync template job | `sync_ShopifyProductUpdates` | `mantle-shopify-connector/data/ShopifyServiceJobData.xml`, `company/src/views/ShopifyProductSync.vue` | The app clones this per shop. |
| Per-shop product sync runtime job pattern | `sync_ShopifyProductUpdates_{shopId}` | `company/src/services/ShopifyProductSyncService.ts` | Created by app logic using the base template job. |
| Shared send job | `send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery` | `mantle-shopify-connector/data/ShopifyServiceJobData.xml`, `company/src/views/ShopifyProductSync.vue` | Shared sender for `ShopifyBulkQuery` parent type. |
| Shared poll job expected by Company app | `poll_ShopifyBulkOperationResult` | `mantle-shopify-connector/data/ShopifyServiceJobData.xml`, `company/src/views/ShopifyProductSync.vue` | Current app expects this newer poller name. |

### New webhook topic mapping

| Artifact | ID | Source | Notes |
| --- | --- | --- | --- |
| Webhook enumeration | `BulkOperationsFinish` | `mantle-shopify-connector/data/ShopifySetupSeedData.xml` | Mapped to `enumCode = bulk_operations/finish`. |
| Webhook topic | `bulk_operations/finish` | `mantle-shopify-connector/data/ShopifySetupSeedData.xml` | The Shopify webhook that signals bulk query completion. |

### New data manager and data-document IDs

| Artifact | ID | Source | Notes |
| --- | --- | --- | --- |
| Product sync DataManager config contract | `SYNC_SHOPIFY_PRODUCT` | `company/src/views/ShopifyProductSync.vue`, `company/src/views/ShopifyProductSyncHistory.vue`, `company/src/services/ShopifyProductSyncService.ts`, `mantle-shopify-connector/service/co/hotwax/shopify/system/ShopifySystemMessageServices.xml` | Required by the app contract, but not found in local seed XML. Treat as a runtime artifact the app must create or verify. |
| Data document for job parameter lookup | `SERVICE_JOB_PARAMETER` | `company/src/services/ShopifyProductSyncService.ts` | Needed to discover whether a per-shop sync job already exists. |
| Data document for error log lookup | `DATA_MANAGER_LOG_AND_PARAMETER` | `company/src/services/ShopifyProductSyncService.ts` | Needed for recent failed record lookups. |
| Data document for OMS product/variant counts | `PRODUCT_STORE_PRODUCT` | `company/src/services/ShopifyProductSyncService.ts` | Needed for review and reconcile counts. |

## Confirmed Legacy Product Sync IDs

The legacy implementation is feed-based rather than bulk-query-based. The migration code should be prepared to find and remove or deactivate these records when they are present.

### Legacy system message types

| Artifact | ID | Source | Notes |
| --- | --- | --- | --- |
| Legacy incoming new-products feed | `ShopifyNewProductsFeed` | `hotwax-shopify-oms-bridge/data/UpgradeData_v1.0.0.xml`, `hotwax-shopify-oms-bridge/data/SOBSystemMessageTypeData.xml` | Legacy feed-based new-product path. |
| Legacy OMS new-products generation type | `GenerateOMSNewProductsFeed` | same | Legacy intermediate type. |
| Legacy OMS new-products send type | `SendOMSNewProductsFeed` | same | Legacy terminal send type. |
| Legacy incoming update-products feed | `ShopifyUpdateProductsFeed` | `hotwax-shopify-oms-bridge/data/UpgradeData_v1.0.0.xml` | Older legacy naming family. |
| Legacy OMS update-products generation type | `GenerateOMSUpdateProductsFeed` | `hotwax-shopify-oms-bridge/data/UpgradeData_v1.0.0.xml`, `hotwax-shopify-oms-bridge/data/SOBSystemMessageTypeData.xml` | Legacy intermediate type. |
| Legacy OMS update-products send type | `SendOMSUpdateProductsFeed` | `hotwax-shopify-oms-bridge/data/UpgradeData_v1.0.0.xml` | Legacy terminal send type. |
| Legacy product updates consume override type | `ShopifyProductUpdatesFeed` | `hotwax-shopify-oms-bridge/data/SOBSystemMessageTypeData.xml`, `hotwax-shopify-oms-bridge/data/UpgradeData_v1.4.0.xml` | Later legacy naming family. |
| Intermediate post-legacy update type | `GenerateOMSUpdateProductsFeedNew` | `hotwax-shopify-oms-bridge/data/SOBSystemMessageTypeData.xml`, `hotwax-shopify-oms-bridge/upgrade/v1.11.0/UpgradeData.xml` | This is still part of the older feed lineage and should be considered a legacy migration candidate if present. |

### Legacy enumerations

The local source shows multiple product-feed enum families across bridge versions. Migration code should inspect for all of the following before delete:

| Artifact | ID | Source | Notes |
| --- | --- | --- | --- |
| Legacy enum | `ShopifyNewProductsFeed` | bridge seed/upgrade data | Legacy feed mapping enum. |
| Legacy enum | `GenerateOMSNewProductsFeed` | bridge seed/upgrade data | Legacy feed mapping enum. |
| Legacy enum | `SendOMSNewProductsFeed` | bridge seed/upgrade data | Legacy feed mapping enum. |
| Legacy enum | `ShopifyUpdateProductsFeed` | bridge seed/upgrade data | Older legacy naming family. |
| Legacy enum | `GenerateOMSUpdateProductsFeed` | bridge seed/upgrade data | Legacy feed mapping enum. |
| Legacy enum | `SendOMSUpdateProductsFeed` | bridge seed/upgrade data | Legacy feed mapping enum. |
| Legacy enum | `ShopifyProductUpdatesFeed` | bridge seed/upgrade data | Later legacy naming family. |
| Legacy enum | `ProductUpdatesFeed` | bridge seed/upgrade data | OMS-side related enum used by the legacy update path. |
| Legacy enum | `NewProductsFeed` | bridge seed/upgrade data | OMS-side related enum used by the legacy new-product path. |
| Legacy enum | `GenerateOMSUpdateProductsFeedNew` | bridge seed/upgrade data | Intermediate post-legacy update enum. |
| Legacy enum | `ProductUpdatesFeedNew` | bridge seed/upgrade data | OMS-side related enum for the intermediate update path. |

### Legacy service jobs

| Artifact | ID | Source | Notes |
| --- | --- | --- | --- |
| Legacy poll job for new-products feed | `poll_SystemMessageFileSftp_ShopifyNewProductsFeed` | `hotwax-shopify-oms-bridge/data/SOBServiceJobData.xml`, `hotwax-shopify-oms-bridge/data/UpgradeData_v1.0.0.xml` | Remove if still present and unused. |
| Legacy poll job for update-products feed | `poll_SystemMessageFileSftp_ShopifyUpdateProductsFeed` | same | Remove if still present and unused. |
| Older bulk-query poller name | `poll_BulkOperationResult_ShopifyBulkQuery` | `mantle-shopify-connector/data/ShopifyServiceJobData.xml`, `mantle-shopify-connector/data/UpgradeData_v1.2.0.xml` | This is a superseded bulk-query poll job name. The current Company app expects `poll_ShopifyBulkOperationResult`. |

### Legacy runtime jobs still needing live confirmation

The following old-runtime categories are in scope, but I do not see a single confirmed canonical ID for every one in local source:

- old per-shop queue jobs that produced product-update system messages for each shop
- old shared sender jobs if the tenant used a generic "send all produced system messages" pattern

Implementation guidance:

- Discover these jobs by `serviceName`, `parentSystemMessageTypeId`, `systemMessageTypeId`, and `shopId` parameters rather than relying only on a single job name.
- Record the exact live job names encountered during implementation so this document can be tightened later.

## Migration Actions

## 1. Legacy teardown actions

The app or PWA must remove or deactivate the old implementation before enabling the new one.

### Required teardown checks

1. Deprecate old product-sync system message types in place.
2. Disable or remove old product-sync service jobs for every shop that queued legacy system messages.
3. Disable or remove the old queue job if it is product-sync-specific.
4. Disable or remove the old poll job for the old path.
5. Disable or remove the old sender job only if it is dedicated to the old product-sync path.
6. Cancel old typed system messages that have not reached their terminal confirmed state.
7. Delete old product-sync-only enumerations that are no longer needed.

### Teardown behavior rules

- Do not delete legacy system message types if historical references depend on them.
- Deprecate each legacy product-sync system message type by renaming it with a clear deprecated label.
- Clear service bindings from deprecated legacy product-sync system message types so they cannot run accidentally.
- Do not assume legacy service jobs can always be deleted cleanly because referential integrity may prevent removal.
- When a legacy product-sync service job cannot be deleted, clear its service execution fields so that an accidental run becomes a no-op.
- Do not delete shared jobs blindly.
- For a shared sender or poller, first inspect its parameters to determine whether it serves only the old product-sync types or also serves other message-type families.
- If a shared job serves broader system-message behavior, keep the job and remove or disable only the obsolete product-sync types and shop-specific jobs.
- When cancelling old system messages, treat `SmsgConfirmed` as terminal and leave those records alone unless product later decides historical cleanup is acceptable.

Suggested deprecation convention:

- Prefix or suffix the legacy type description or name with `Deprecated`.
- Keep the primary ID stable so existing historical records still resolve cleanly.
- Null out or clear service-related fields that would otherwise allow the type to be produced, sent, polled, or consumed again.

Suggested service job deactivation convention:

- First try to delete legacy product-sync-only jobs when the data model allows it.
- If delete is blocked or risky, keep the same job primary key, pause the job, and clear the service name or equivalent execution fields.
- Also clear or neutralize parameters that could still target a legacy product-sync path.
- Prefer deactivation over speculative hard deletion when the live tenant model is uncertain.

### Legacy system message statuses to inspect

The teardown code must explicitly look for old product-sync messages in statuses such as:

- `SmsgProduced`
- `SmsgSending`
- `SmsgSent`
- `SmsgReceived`
- `SmsgConsuming`
- `SmsgConsumed`
- `SmsgError`

The migration should cancel or otherwise retire any old product-sync message that is not already in a terminal confirmed state.

Message-matching rule:

- Legacy product-sync message teardown must match exact `systemMessageTypeId` values from the configured legacy product-sync list.
- Do not treat all messages on the shop's `SystemMessageRemote` as product-sync candidates, because the same remote can carry unrelated flows such as returns.

## 2. New activation actions

The app or PWA must ensure the new bulk-query sync is fully activated for the selected shop.

### Required activation checks

1. Verify the new system message type exists.
2. Verify or create the `SYNC_SHOPIFY_PRODUCT` DataManager config.
3. Verify the base `sync_ShopifyProductUpdates` job exists.
4. Verify or create the per-shop `sync_ShopifyProductUpdates_{shopId}` job.
5. Verify the shared send job exists.
6. Verify the shared poll job exists.
7. Verify the bulk-operations-finish webhook is subscribed for the shop.
8. Verify all required data documents exist.

### Shop-specific runtime data created by the app

These are the artifacts that should be treated as shop runtime data rather than deployment seed data:

| Artifact | ID pattern | How it is used |
| --- | --- | --- |
| Per-shop product sync job | `sync_ShopifyProductUpdates_{shopId}` | Created by cloning the base `sync_ShopifyProductUpdates` job. |
| Per-shop webhook subscription | Shopify webhook subscription ID for `bulk_operations/finish` | Should exist for each active shop after migration. |
| Product sync DataManager config, if not seeded | `SYNC_SHOPIFY_PRODUCT` | The app currently treats this as required but local seed data does not show it pre-created. |

### Seed data the app must verify, not create blindly

| Artifact | ID |
| --- | --- |
| Product sync message type | `BulkQueryShopifyProductUpdates` |
| Shared send job | `send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery` |
| Shared poll job | `poll_ShopifyBulkOperationResult` |
| Webhook message type | `BulkOperationsFinish` |
| Data documents | `SERVICE_JOB_PARAMETER`, `DATA_MANAGER_LOG_AND_PARAMETER`, `PRODUCT_STORE_PRODUCT` |

## Source-of-Truth Matrix For Implementation

This is the matrix the app code should follow when implemented.

| Category | ID or pattern | Legacy/New | Expected owner | App action |
| --- | --- | --- | --- | --- |
| SystemMessageType | `ShopifyNewProductsFeed` | Legacy | Tenant runtime from old bridge seeds | rename as deprecated and clear bound services |
| SystemMessageType | `ShopifyUpdateProductsFeed` | Legacy | Tenant runtime from old bridge seeds | rename as deprecated and clear bound services |
| SystemMessageType | `ShopifyProductUpdatesFeed` | Legacy | Tenant runtime from old bridge seeds | rename as deprecated and clear bound services |
| SystemMessageType | `GenerateOMSUpdateProductsFeed` | Legacy | Tenant runtime from old bridge seeds | rename as deprecated and clear bound services |
| SystemMessageType | `GenerateOMSUpdateProductsFeedNew` | Legacy/intermediate | Tenant runtime from old bridge seeds | rename as deprecated and clear bound services |
| ServiceJob | `poll_SystemMessageFileSftp_ShopifyNewProductsFeed` | Legacy | Tenant runtime | delete if safe, otherwise keep the same job id, pause it, and clear execution fields |
| ServiceJob | `poll_SystemMessageFileSftp_ShopifyUpdateProductsFeed` | Legacy | Tenant runtime | delete if safe, otherwise keep the same job id, pause it, and clear execution fields |
| ServiceJob | `poll_BulkOperationResult_ShopifyBulkQuery` | Older bulk-query | Deployment/runtime depending on upgrade path | replace with current poller or deactivate safely |
| SystemMessageType | `BulkQueryShopifyProductUpdates` | New | Deployment seed | verify exists |
| ServiceJob | `sync_ShopifyProductUpdates` | New | Deployment seed | verify exists |
| ServiceJob | `sync_ShopifyProductUpdates_{shopId}` | New | App-created runtime | create or verify |
| ServiceJob | `send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery` | New shared | Deployment seed | verify exists |
| ServiceJob | `poll_ShopifyBulkOperationResult` | New shared | Deployment seed | verify exists |
| Webhook type | `BulkOperationsFinish` | New shared | Deployment seed | verify exists |
| Webhook subscription | `bulk_operations/finish` on each shop | New runtime | App-created runtime | create or verify |
| DataManagerConfig | `SYNC_SHOPIFY_PRODUCT` | New runtime contract | App-created or tenant runtime | create or verify |
| Data document | `SERVICE_JOB_PARAMETER` | New shared | Deployment seed | verify exists |
| Data document | `DATA_MANAGER_LOG_AND_PARAMETER` | New shared | Deployment seed | verify exists |
| Data document | `PRODUCT_STORE_PRODUCT` | New shared | Deployment seed | verify exists |

## App Migration Config Plan

The app should keep the migration identifiers in a single config file rather than scattering IDs across services and views.

Suggested file:

- `src/config/productSyncMigration.ts`

The goal of this file is to define:

- the minimum compatible backend release
- the legacy IDs the app should search for and tear down
- the target IDs the app should verify or create
- the explicit mappings between outgoing legacy IDs and incoming replacement IDs

### Suggested config shape

```ts
export const PRODUCT_SYNC_MIGRATION_CONFIG = {
  minimumComponentRelease: "ProductSyncMigrationGate_2026_05",
  outgoing: {
    systemMessageTypes: [
      "ShopifyNewProductsFeed",
      "GenerateOMSNewProductsFeed",
      "SendOMSNewProductsFeed",
      "ShopifyUpdateProductsFeed",
      "GenerateOMSUpdateProductsFeed",
      "SendOMSUpdateProductsFeed",
      "ShopifyProductUpdatesFeed",
      "GenerateOMSUpdateProductsFeedNew"
    ],
    serviceJobs: [
      "poll_SystemMessageFileSftp_ShopifyNewProductsFeed",
      "poll_SystemMessageFileSftp_ShopifyUpdateProductsFeed",
      "poll_BulkOperationResult_ShopifyBulkQuery"
    ],
    enumerations: [
      "ShopifyNewProductsFeed",
      "GenerateOMSNewProductsFeed",
      "SendOMSNewProductsFeed",
      "ShopifyUpdateProductsFeed",
      "GenerateOMSUpdateProductsFeed",
      "SendOMSUpdateProductsFeed",
      "ShopifyProductUpdatesFeed",
      "ProductUpdatesFeed",
      "NewProductsFeed",
      "GenerateOMSUpdateProductsFeedNew",
      "ProductUpdatesFeedNew"
    ]
  },
  incoming: {
    systemMessageTypes: {
      productSync: "BulkQueryShopifyProductUpdates",
      webhook: "BulkOperationsFinish",
      webhookParent: "ShopifyWebhook"
    },
    serviceJobs: {
      baseSync: "sync_ShopifyProductUpdates",
      perShopPattern: "sync_ShopifyProductUpdates_{shopId}",
      send: "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery",
      poll: "poll_ShopifyBulkOperationResult"
    },
    dataManagerConfig: "SYNC_SHOPIFY_PRODUCT",
    dataDocuments: [
      "SERVICE_JOB_PARAMETER",
      "DATA_MANAGER_LOG_AND_PARAMETER",
      "PRODUCT_STORE_PRODUCT"
    ],
    webhookTopic: "bulk_operations/finish"
  },
  mappings: {
    systemMessageTypeReplacement: {
      ShopifyNewProductsFeed: "BulkQueryShopifyProductUpdates",
      ShopifyUpdateProductsFeed: "BulkQueryShopifyProductUpdates",
      ShopifyProductUpdatesFeed: "BulkQueryShopifyProductUpdates"
    },
    jobReplacement: {
      poll_BulkOperationResult_ShopifyBulkQuery: "poll_ShopifyBulkOperationResult"
    }
  }
} as const
```

### Config rules

- `outgoing` should list the legacy IDs the migration must remove, cancel, or inspect.
- `incoming` should list the target IDs the migration must verify or create.
- `mappings` should capture only true replacement relationships, not every artifact in the flow.
- Shop-specific runtime patterns should stay parameterized, for example `sync_ShopifyProductUpdates_{shopId}`.
- If a legacy runtime job cannot be identified by a stable ID, add a discovery rule next to the config rather than hardcoding guessed names in feature code.

### Why this should live in config

- It gives the app one source of truth for migration behavior.
- It keeps implementation code focused on verification and actions rather than constants.
- It makes it easier to update legacy coverage if more old tenant variants are discovered later.
- It allows tests to assert migration behavior against one stable definition.

## Implementation Notes

### 1. Do not rely only on names when deleting old jobs

Some old runtime jobs are not cleanly recoverable from local source with a single canonical name. The implementation should support parameter-based discovery, for example:

- parent message type
- service name
- `systemMessageTypeId` parameter
- `shopId` parameter

### 2. Treat the version gate as necessary but not sufficient

A compatible release should be required, but the app must still verify the actual presence of the required seed artifacts.

### 3. Preserve history when the record is already terminal

Historical records that already reached the terminal confirmed state should usually be left as historical evidence unless product explicitly wants destructive cleanup.

### 4. Keep the migration idempotent

Every teardown and activation step should be safe to re-run. The code should tolerate:

- partially migrated shops
- repeated migration attempts
- tenants where some artifacts were manually created earlier

## Open Items To Confirm During Implementation

The following are in scope but are not fully confirmed by local source alone:

1. The exact minimum backend release that should unlock migration.
2. Whether `SYNC_SHOPIFY_PRODUCT` is always app-created or sometimes seeded by a deployment outside the local repo snapshot.
3. The exact source repository and seed file for the required data documents:
   - `SERVICE_JOB_PARAMETER`
   - `DATA_MANAGER_LOG_AND_PARAMETER`
   - `PRODUCT_STORE_PRODUCT`
4. The exact canonical old per-shop queue-job names for every legacy tenant variant.
5. Whether any generic old sender job must be deleted, or whether removing old message types is sufficient.

Until those are confirmed, the implementation should keep these checks explicit and log what it discovered in the tenant.
