# Audit Summary
1. Search `src/components/shopify-fulfillment/FulfillmentDiagnosis.vue` and `src/components/shopify-fulfillment/FulfillmentOrderSearch.vue` for `api()` calls.
2. The `api()` calls to `sob/shopify/fulfillmentHold`, `sob/shopify/fulfillmentDiagnosis`, and `oms/dataDocumentView` should be extracted to `src/composables/useShopifyFulfillment.ts`.

# Extraction Plan
- In `src/composables/useShopifyFulfillment.ts`, add:
  - `releaseFulfillmentHold(shopId, shipmentId, fulfillmentOrderId, holdId)`
  - `scheduleFulfillmentDiagnosis(shopId, shipmentId, systemMessageId?, inspectHolds?)`
  - `searchFulfillmentOrders(searchQuery, pageIndex, pageSize)`
- Replace the direct `api()` calls in `src/components/shopify-fulfillment/FulfillmentDiagnosis.vue` and `src/components/shopify-fulfillment/FulfillmentOrderSearch.vue` with these composable functions.
