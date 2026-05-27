# Shopify Product Sync App-to-Shopify API Calls

## Purpose

This document defines the Shopify Admin GraphQL reads that the Company app should make through a Moqui passthrough layer for the first-time product sync wizard.

This file intentionally excludes the backend bulk sync lifecycle that Moqui already owns:

- bulk operation queueing
- bulk operation mutation dispatch
- webhook or polling completion handling
- JSONL download and transformation
- diff computation
- OMS ingestion
- sync history persistence

The app still surfaces the operational timing for the Moqui jobs that drive the Shopify bulk-operation lifecycle:

- `send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery` sends produced system messages to Shopify when a bulk-operation slot is available.
- `poll_ShopifyBulkOperationResult` checks Shopify for completed bulk operations and lets Moqui continue into file processing and import.

The focus here is only the extra Shopify reads the app needs for UX, preflight, and live review states.

## Assumptions

- The browser never talks to Shopify directly.
- The Company app calls a Moqui passthrough endpoint that executes Shopify Admin GraphQL on behalf of the selected shop.
- Catalog-related queries require the Shopify `read_products` scope.
- The product type mapping step is still a dummy state in v1, so its Shopify read is future-facing rather than required on day one.

## Recommended Passthrough Contract

Suggested request shape:

```json
{
  "shopId": "10010",
  "operationName": "WizardLiveCatalogCounts",
  "query": "query WizardLiveCatalogCounts { productsCount { count precision } productVariantsCount { count precision } }",
  "variables": {}
}
```

Suggested Moqui passthrough responsibilities:

- resolve Shopify credentials from `shopId`
- execute the GraphQL request server-side
- return GraphQL `data`, `errors`, and cost metadata
- centralize throttling and retry behavior
- optionally allowlist operation names for app safety

## Required v1 Calls

### 1. Shop context and connectivity

Use this when the app needs fresh store metadata from Shopify instead of only relying on the locally stored shop record.

Primary uses:

- confirm the passthrough is working for the selected shop
- show live shop metadata in debug or review contexts
- anchor time zone or currency-sensitive copy if needed later

Validated query:

```graphql
query WizardShopContext {
  shop {
    id
    name
    myshopifyDomain
    ianaTimezone
    timezoneAbbreviation
    currencyCode
  }
}
```

Notes:

- This is a lightweight sanity-check query.
- The current UI can often use persisted shop data first and only fall back to this call when live confirmation matters.

Docs:

- [shop](https://shopify.dev/docs/api/admin-graphql/latest/queries/shop)
- [GraphQL Admin API reference](https://shopify.dev/docs/api/admin-graphql/latest)

### 2. Live catalog counts for review and reconcile

Use this on the review and reconcile screens to show live Shopify product and variant counts.

Primary uses:

- review screen live Shopify stats
- reconcile screen post-import comparison
- sanity checking before the first import starts

Validated query:

```graphql
query WizardLiveCatalogCounts {
  productsCount {
    count
    precision
  }
  productVariantsCount {
    count
    precision
  }
}
```

Notes:

- Treat `precision` as part of the payload and surface it in logs or diagnostics when counts are estimates.
- Cache this only briefly. The review state should feel live.

Docs:

- [productsCount](https://shopify.dev/docs/api/admin-graphql/latest/queries/productsCount)
- [productVariantsCount](https://shopify.dev/docs/api/admin-graphql/latest/queries/productVariantsCount)

### 3. Identifier sample for the "Am I making a mistake?" modal

Use this query to fetch a small rolling sample of products and variant identifiers from Shopify so Moqui can compare them against the selected Product Store before the import starts.

Primary uses:

- fetch a 10-variant sample for the preflight modal
- compare Shopify identifiers against OMS-linked products
- support the match thresholds documented in the implementation spec

Validated query:

```graphql
query WizardVariantSample($first: Int!) {
  productVariants(first: $first) {
    nodes {
      id
      sku
      barcode
      legacyResourceId
    }
  }
}
```

How the app should use it:

- For `SKU`, compare against variant `sku`.
- For `UPCA / Barcode`, compare against variant `barcode`.
- For `Shopify internal id`, compare against variant `legacyResourceId`.
- Page until Moqui has enough usable variants for the preflight sample, or until the catalog is exhausted.

Notes:

- This is intentionally a small-sample preflight query, not a replacement for the real bulk sync.
- The modal thresholds should be enforced by Moqui after comparison:
  - fewer than 5 matches out of 10: warning plus explicit confirmation
  - at least 7 matches out of 10: passive warning only
  - 5 to 6 matches out of 10: default to warning plus explicit confirmation until product defines a stricter rule

Docs:

- [products](https://shopify.dev/docs/api/admin-graphql/latest/queries/products)
- [product](https://shopify.dev/docs/api/admin-graphql/latest/queries/product)
- [productVariants](https://shopify.dev/docs/api/admin-graphql/latest/queries/productVariants)

## Deferred Call For Later Product-Type Work

The product type mapping step is a dummy state in v1, but if the step becomes data-backed later, use a paginated products query and dedupe `productType` values server-side.

Validated query:

```graphql
query WizardProductTypeDiscovery($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      productType
      updatedAt
    }
  }
}
```

Notes:

- Shopify doesn’t provide a distinct "all product types in this shop" convenience query in this plan, so Moqui should paginate and dedupe.
- This should stay out of v1 unless the placeholder product type step becomes interactive.

Docs:

- [products](https://shopify.dev/docs/api/admin-graphql/latest/queries/products)
- [product](https://shopify.dev/docs/api/admin-graphql/latest/queries/product)

## Bulk Operation Progress Reads

These reads are useful for the progress tracker when the UI needs Shopify-native bulk-operation telemetry in addition to Moqui status.

Important boundary:

- Shopify can provide progress signals for bulk operations that already exist in Shopify.
- Shopify cannot tell the app how many jobs are queued ahead inside Moqui before a request is submitted to Shopify.
- "Queued jobs ahead of yours" must still come from Moqui queue and system-message state, not from Shopify Admin GraphQL alone.

### 4. Current bulk query progress

Use this if the app needs live Shopify-side progress counters for the active bulk query that Moqui has already sent to Shopify.

Primary uses:

- fetch the exact Shopify bulk operation using the `remoteId` stored on the corresponding Moqui system message
- render object-count and root-object-count progress for the currently tracked sync job
- fetch result URLs or error state once the operation completes or fails

Validated query:

```graphql
query WizardBulkOperationById($id: ID!) {
  bulkOperation(id: $id) {
    id
    status
    type
    createdAt
    completedAt
    objectCount
    rootObjectCount
    fileSize
    errorCode
    url
    partialDataUrl
  }
}
```

Notes:

- The app should not discover the active job by using the deprecated `currentBulkOperation` query.
- Instead, Moqui should provide the Shopify bulk operation id from the system message `remoteId` field, and the app should pass that id into `bulkOperation(id: ...)`.
- `objectCount` is the running total of all processed objects.
- `rootObjectCount` is the running total of root objects only, which is often a better user-facing progress number for nested product exports.
- This is the preferred query for the app's own in-flight sync because it is deterministic and tied to the exact job Moqui created.

Docs:

- [bulkOperation](https://shopify.dev/docs/api/admin-graphql/latest/queries/bulkOperation)
- [BulkOperation](https://shopify.dev/docs/api/admin-graphql/latest/objects/BulkOperation)

### 5. Recent bulk query operations

Use this when the app needs recent Shopify-side bulk query history for the connected app on the shop.

Primary uses:

- inspect whether Shopify already has other bulk query operations in `created` or `running` states
- show recent Shopify operation history around the current job
- complement Moqui queue visibility with actual Shopify-side operation visibility

Validated query:

```graphql
query WizardRecentBulkQueryOperations($first: Int!, $query: String) {
  bulkOperations(first: $first, sortKey: CREATED_AT, query: $query) {
    nodes {
      id
      status
      type
      createdAt
      completedAt
      objectCount
      rootObjectCount
      errorCode
    }
  }
}
```

Suggested filter values:

- active query operations: `status:created OR status:running`
- completed recent query operations: `status:completed`
- query operations only: add `operation_type:query`

Notes:

- This is the preferred modern query surface for bulk-operation history.
- It can show other Shopify bulk operations that already exist for the app on the shop, including jobs still in `created` or `running` states.
- Use this for "other Shopify bulk operations on the shop" and "recent Shopify bulk history".
- Do not confuse this with Moqui's own pre-submit queue. Jobs that exist only as queued Moqui system messages will not appear here until Moqui has actually sent them to Shopify.

Docs:

- [BulkOperation](https://shopify.dev/docs/api/admin-graphql/latest/objects/BulkOperation)
- [bulkOperation](https://shopify.dev/docs/api/admin-graphql/latest/queries/bulkOperation)

## Calls The App Should Not Make Directly

These remain Moqui-owned responsibilities and should not be modeled as app-driven Shopify passthrough reads for the wizard:

- `bulkOperationRunQuery` or any bulk query mutation
- webhook registration or webhook payload handling
- resolving the app's tracked sync job without first reading the Moqui system message `remoteId`
- direct progress derivation from Shopify alone when the UI really needs Moqui system-message state
- JSONL result download and transformation
- data ingestion or history writes

For the progress screen, prefer a Moqui status endpoint that already merges:

- system message state
- current bulk operation state fetched by `remoteId`
- queue or lock state inside Moqui
- ingest status

That will produce a more accurate UI than polling Shopify in isolation.

## Screen-to-Call Mapping

| Wizard state | Shopify call | Required in v1 |
| --- | --- | --- |
| Home | none | yes |
| Select product store | none | yes |
| Select product identifier | none | yes |
| Product type mapping | `WizardProductTypeDiscovery` | no |
| Review | `WizardLiveCatalogCounts` | yes |
| Mistake modal | `WizardVariantSample` | yes |
| Start sync modal | none | yes |
| Progress tracker | `WizardBulkOperationById` using Moqui `remoteId`, and optionally `WizardRecentBulkQueryOperations`, plus Moqui aggregated status | yes |
| Reconcile | `WizardLiveCatalogCounts` | yes |

The progress tracker should combine these reads with ServiceJob next-run timing for `send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery` and `poll_ShopifyBulkOperationResult` so operators can see when Moqui will next attempt the send and poll steps.

## Implementation Recommendation

The minimal v1 set is:

1. `WizardLiveCatalogCounts`
2. `WizardVariantSample`
3. `WizardBulkOperationById` for Shopify-side progress counters tied to Moqui `remoteId`
4. optional `WizardRecentBulkQueryOperations` for recent Shopify-side bulk history
5. optional `WizardShopContext` for live sanity checks

Keep `WizardProductTypeDiscovery` documented but deferred until the product type step stops being a placeholder.
