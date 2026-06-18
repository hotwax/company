# Migrate Shopify order-history to the new-path bulk processors + deprecate the legacy poller

**Status:** spec · adversarially verified against source (workflow, 2026-06-17) · no new endpoints, no connector code change
**Repos:** `hotwax-shopify-oms-bridge` (new reader + seed), `mantle-shopify-connector` (deprecation marking only)
**Confidence:** the target processors (`poll_ShopifyBulkOperationResult` → `process#ShopifyBulkOperationResult` → `consume#ReceivedSystemMessage` → the type's reader) are **already proven end-to-end** for inventory reset (live: 13,726 Shopify objects → +9,679 OMS reset rows) and product updates. Order history is the same shape; the only new code is a near-verbatim port of the proven reader.

## Goal & two corrections

**Goal:** order-history sync should run on the *same* bulk processors as product/inventory sync, not the legacy two-hop consumption jobs.

**Correction 1 — the "fallback order job" is out of scope.** `queue_ShopifyOrderSync → ShopifyOrderSync` (`SOBServiceJobData.xml:130-138`) is **not** a Shopify bulk-operation query: it has no `parentTypeId`, does synchronous live GraphQL orders-connection pagination + SQS staging entirely inside `OrderFeedServices.send#ShopifyOrderSync`, produces no bulk-operation id, and is never polled. It is an ongoing **delta** sync, architecturally distinct from the bulk pipeline; it cannot "ride the bulk poller" without being rewritten as a bulk query. **Leave it unchanged.** Putting order *data* on the new bulk processor = the `BulkOrderHistoryQuery` migration below.

**Correction 2 — don't fully delete the legacy poller.** Besides order history, ~10 other `ShopifyBulkQuery` child types still use the legacy poller + `consume#BulkOperationResult` (BulkVariantsMetafieldQuery, BulkOrderMetafieldsQuery, BulkOrderHeadersQuery, BulkOrderItemsQuery, BulkOrderCustomAttributesQuery, BulkOrderDiscountCodeApplQuery, BulkCanceledOrderItemsQuery, BulkFulfillmentOrderQuery, BulkProductMetaFieldByTagsQuery, + hybrid BulkProductAndVariantsByIdQuery). They define `receivePath` (not `receiveMovePath`) and the new processor requires `receiveMovePath` — so **deprecate by pausing the job, not deleting/renaming services.** Paused legacy types simply wait at `SmsgSent` until migrated or resumed (safe).

## The migration — 4 changes (ordered)

### 1. Deprecate the legacy poller (kills the dual-poller race) — *connector*
Both `poll_ShopifyBulkOperationResult` and `poll_BulkOperationResult_ShopifyBulkQuery` select `SystemMessageAndType WHERE statusId=SmsgSent AND parentTypeId=ShopifyBulkQuery LIMIT 1` over the same pool — whichever fires first wins. Keep the legacy job **paused** (`data/ShopifyServiceJobData.xml:114`, already `paused="Y"` in seed; verify the live `ServiceJob` row isn't resumed) and mark its description `DEPRECATED…` (exact edit below). Do **not** delete/rename `process#BulkOperationResult` or the shared `store#BulkOperationResultFile` (also used by the new path + modified by PR #356).

```xml
<!-- DEPRECATED legacy ShopifyBulkQuery poller; superseded by poll_ShopifyBulkOperationResult; keep paused to avoid
     the dual-poller race; do NOT delete (~10 legacy ShopifyBulkQuery child types still use it until migrated). -->
<moqui.service.job.ServiceJob jobName="poll_BulkOperationResult_ShopifyBulkQuery" ... paused="Y"
        description="DEPRECATED legacy ShopifyBulkQuery poller; superseded by poll_ShopifyBulkOperationResult; paused to avoid dual-poller race">
```

### 2. Unpause the new poller — *connector / live row*
Set `poll_ShopifyBulkOperationResult` (`data/ShopifyServiceJobData.xml:369`) `paused="N"`. With the legacy poller paused it becomes the sole consumer of the `ShopifyBulkQuery` pool. (Seed change + correct the live `ServiceJob` row, since seed doesn't auto-update provisioned rows.)

### 3. Add a new-path reader `consume#BulkOrderHistoryDataFile` — *bridge*
`shopify-oms-bridge/service/co/hotwax/sob/order/ShopifyOrderSyncHistoryServices.xml` — single-hop reader that sources the file from `receiveMovePath/{systemMessageId}.jsonl` (the new processor already downloaded it there) and reuses the existing JSONL Order/LineItem streaming + `BULK_ORDER_HISTORY` MDM upload body **verbatim**. Replaces the two-hop `store#BulkOrderHistoryResult` + `consume#BulkOrderHistoryResult`:

```xml
<service verb="consume" noun="BulkOrderHistoryDataFile" authenticate="anonymous-all" transaction-timeout="3600">
    <description>New-path reader for BulkOrderHistoryQuery. The bulk processor (process#ShopifyBulkOperationResult)
        has already downloaded the JSONL to receiveMovePath/{systemMessageId}.jsonl; stream it, accumulate orders,
        and upload to the BULK_ORDER_HISTORY DataManager config. Mirrors consume#ShopifyInventoryResetDataFile.</description>
    <implements service="org.moqui.impl.SystemMessageServices.consume#SystemMessage"/>
    <actions>
        <entity-find-one entity-name="moqui.service.message.SystemMessage" value-field="systemMessage"/>
        <entity-find-related-one value-field="systemMessage" relationship-name="type" to-value-field="systemMessageType"/>
        <entity-find-one entity-name="moqui.service.message.SystemMessageRemote" value-field="systemMessageRemote">
            <field-map field-name="systemMessageRemoteId" from="systemMessage.systemMessageRemoteId"/>
        </entity-find-one>
        <set field="shopId" from="systemMessageRemote?.internalId"/>
        <if condition="!shopId"><return error="true" message="shopId (internalId) not configured on SystemMessageRemote [${systemMessage.systemMessageRemoteId}]"/></if>
        <entity-find-one entity-name="co.hotwax.shopify.ShopifyShop" value-field="shopifyShop" cache="true">
            <field-map field-name="shopId" from="shopId"/>
        </entity-find-one>
        <set field="productStoreId" from="shopifyShop?.productStoreId"/>
        <entity-find-one entity-name="org.apache.ofbiz.common.property.SystemProperty" value-field="launchDateProperty" cache="false">
            <field-map field-name="systemResourceId" from="shopId"/>
            <field-map field-name="systemPropertyId" value="newOrderSync.launchDate"/>
        </entity-find-one>
        <set field="newOrderSyncLaunchDate" from="launchDateProperty?.systemPropertyValue"/>
        <!-- NEW PATH: file already downloaded by process#ShopifyBulkOperationResult -->
        <set field="receiveMovePath" from="ec.resource.expand(systemMessageType.receiveMovePath, null)"/>
        <if condition="!receiveMovePath.endsWith('/')"><set field="receiveMovePath" from="receiveMovePath + '/'"/></if>
        <set field="fileLocation" from="receiveMovePath + systemMessage.systemMessageId + '.jsonl'"/>
        <!-- BODY: identical to the current consume#BulkOrderHistoryResult lines 191-269 (JSONL stream -> Order/LineItem
             accumulation by GID objectType -> jGenerator JSON array -> upload#DataManagerFile configId=BULK_ORDER_HISTORY). -->
        <script><![CDATA[ /* port verbatim from consume#BulkOrderHistoryResult */ ]]></script>
        <if condition="orderCount > 0">
            <service-call name="co.hotwax.util.UtilityServices.upload#DataManagerFile"
                          in-map="[configId:'BULK_ORDER_HISTORY', contentFile:fileItem, parameters:[shopId:shopId, productStoreId:productStoreId, newOrderSyncLaunchDate:newOrderSyncLaunchDate].entrySet().toList()]"/>
        </if>
    </actions>
</service>
```
Keep the legacy `store#`/`consume#BulkOrderHistoryResult` services in place (other tooling may reference them) but they're no longer wired for order history.

### 4. Repoint the `BulkOrderHistoryQuery` seed — *bridge*
`shopify-oms-bridge/data/SOBOrderSyncData.xml:16-22`:
- **ADD** `receiveMovePath="runtime://datamanager/shopify/BulkOrderHistory"`
- **DROP** `receivePath="…"`
- **REPOINT** `consumeServiceName` → `co.hotwax.sob.order.ShopifyOrderSyncHistoryServices.consume#BulkOrderHistoryDataFile`
- **KEEP** `sendServiceName="…send#BulkQuerySystemMessage"` — ⚠️ do **not** swap to `send#ShopifyBulkQueryMessage`: this type's `messageText` is a `{fromDate, thruDate}` map (not a resolved GraphQL query), so the swap would send the map verbatim to Shopify and the bulk op would fail.

Resulting flow (identical shape to the proven inventory/product flows):
`sync#ShopifyOrderHistory` → `send#BulkQuerySystemMessage` → Shopify bulk op → `process#ShopifyBulkOperationResult` (download to `receiveMovePath/{id}.jsonl`, `SmsgReceived`) → `consume#ReceivedSystemMessage` → `consume#BulkOrderHistoryDataFile` → `create#ShopifyOrderSyncHistory`.

## Blockers / dependencies (not introduced by this migration)

- **Config gap (must resolve to flow end-to-end):** `sync_ShopifyOrderHistory` (`SOBOrderSyncData.xml:50-57`) ships with an empty but **required** `systemMessageRemoteId`. Order history will not run until the job has `systemMessageRemoteId` set, the `SystemMessageRemote.internalId` (shopId) is valid, and an `orderSyncHistory.lastSyncDate` cursor / `newOrderSync.launchDate` exists.
- **Retryability** (shared with inventory/product): `process#ShopifyBulkOperationResult` leaves a *failed* consume at `SmsgReceived`, which the `SmsgSent`-only poller won't re-drive — so apply the same hardening proposed in `product-store-onboarding-inventory-import-fix.md` (transition→guard→`SystemMessageError`) and land **PR #356**. Necessary for reliability, complementary to this migration.

## Net
Order history moves onto the proven bulk processors with **one ported reader + one seed edit**, the legacy poller is safely paused (not deleted), the other 10 legacy types are untouched (defer their migration), and the non-bulk fallback delta-sync is left alone. No new endpoints, no connector code change.
