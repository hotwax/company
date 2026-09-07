/**
 * Company Dexie database instance.
 *
 * Scoped per OMS instance, so switching instances lands on a different IndexedDB database
 * instead of reading the previous tenant's rows.
 *
 * Deep imports, never the `@common/db` barrel: the barrel re-exports modules that import
 * `vue`, and the sync worker imports this file — Vite must emit that chunk as a single iife.
 * This module must likewise never import `commonUtil`; `main.ts` registers the resolver.
 */

import { defineAppDb } from "@common/db/defineAppDb";

/**
 * The 16 seed entities Company takes wholesale from the framework. Each was verified to use
 * the same endpoint and projection as Company's own registration before being adopted.
 *
 * `status` is deliberately absent: the framework fetches `admin/status` while Company fetches
 * `oms/statuses`. Until that is resolved, `statuses` stays a Company-declared table below.
 */
const COMPANY_SEED_ENTITIES = [
  "productStore",
  "enum",
  "enumType",
  "facility",
  "facilityType",
  "facilityGroup",
  "groupFacility",
  "geo",
  "geoAssoc",
  "carrier",
  "shipmentMethodType",
  "carrierShipmentMethod",
  "paymentMethodType",
  "roleType",
  "productStoreFacility",
  "shopifyShop",
] as const;

/**
 * Company's own 39 tables — everything the seed picks above do not provide. Moved verbatim
 * from `CACHE_SCHEMA` in `src/utils/appCacheDb.ts`, comments included: several document
 * measured findings and index-ordering rationale that still apply here unchanged.
 */
const COMPANY_SCHEMA: Record<string, string> = {
  // --- class A: live, append-mostly (incremental cursor sync) ---
  //
  // COMPOUND INDEXES here are load-bearing for sync monitoring, which always asks a two-part
  // question — "this remote's messages OF THIS TYPE, newest first". A single-field index answers
  // only half and leaves the rest to a scan-and-sort. Dexie names them `[a+b]`; adding one here is
  // picked up by Dexie's own schema patch on the next open (verified against a database built
  // without them: the index was created and `where('[configId+createdDate]')` worked).
  dataManagerLogs:
    "logId, configId, systemMessageId, statusId, createdDate, startDateTime, finishDateTime, cancelDateTime, lastUpdatedStamp, [configId+createdDate], [configId+finishDateTime]",
  systemMessages:
    "systemMessageId, systemMessageTypeId, systemMessageRemoteId, statusId, initDate, processedDate, lastAttemptDate, lastUpdatedStamp, [systemMessageRemoteId+initDate], [systemMessageRemoteId+systemMessageTypeId], [systemMessageRemoteId+systemMessageTypeId+initDate], [systemMessageRemoteId+statusId]",
  serviceJobRuns: "jobRunId, jobName, startTime, endTime, hasError, [jobName+startTime]",
  /**
   * SyncRun — the SHOP-SCOPED CURSOR (spine) for sync monitoring. Not a data table.
   *
   * ⚠️ IT EXISTS BECAUSE LOGS CANNOT BE KEYED BY SHOP AND MESSAGES CAN.
   *
   * `systemMessages` partition cleanly per shop: `SystemMessage.systemMessageRemoteId` → remote →
   * `internalId` = shopId, and a remote belongs to exactly one shop, so each (remote, type) gets its
   * own window and cursor and adding a shop takes nothing from the others.
   *
   * `dataManagerLogs` do not. Probed live: `admin/dataManager/details` ignores every shop filter (a
   * nonexistent shop id returns the full unfiltered set) and `DATA_MANAGER_LOG_AND_PARAMETER`, which
   * DOES scope by shop, omits `systemMessageId` — the join key — so it cannot be tied to a message.
   * One `configId` window is therefore shared by every shop, and depth is the only lever: ample for
   * one shop, structurally insufficient combined.
   *
   * `SYSTEM_MESSAGE_DATA_MANAGER_LOG` breaks the deadlock. It is scoped by `remoteInternalId` (the
   * shop) + `systemMessageTypeId` and returns the PAIRING — `systemMessageId` alongside `logId` — which
   * is precisely the join no other feed can produce. So rows here are identity, not detail: which runs
   * belong to this shop and which import each became. The full message and log records are then
   * ENRICHED by id into their own tables (see `syncRunDomain`), which is per-id and therefore always
   * possible. That removes the window-alignment problem: a shop's log is fetched because its run says
   * it exists, not because it happened to fall inside a shared window.
   *
   * `[shopId+systemMessageTypeId+initDate]` is the read every sync screen makes.
   */
  syncRuns:
    "systemMessageId, shopId, configId, systemMessageTypeId, systemMessageRemoteId, statusId, logId, initDate, lastUpdatedStamp, [shopId+systemMessageTypeId+initDate], [shopId+configId+initDate]",
  /**
   * SystemMessageError — on-demand (class C) write-through, fetched when a run is inspected.
   *
   * The entity PK is COMPOSITE (systemMessageId + errorDate), so rows carry a synthetic `errorKey`
   * exactly like `groupFacilities.memberKey`. Indexed by `systemMessageId` because the only query is
   * "the errors for this message".
   */
  systemMessageErrors: "errorKey, systemMessageId, errorDate, attemptedStatusId",
  /**
   * ProductUpdateHistory — the per-product record of what a sync changed. PK is composite
   * (productId + shopId) → synthetic `updateKey`.
   *
   * ⚠️ BOUNDED WINDOW, not a snapshot: one shop had 1,882 rows and each carries multi-KB JSON
   * (`differenceMap`, `features`, `tags`), so caching the full set would cost megabytes to serve a
   * screen that shows ten. `systemMessageId` is indexed because it links a product change back to
   * the sync run that made it.
   */
  productUpdateHistories: "updateKey, shopId, productId, systemMessageId, lastUpdatedStamp, [shopId+lastUpdatedStamp]",
  /**
   * ShopifyInventoryAdjustmentDetail — one immutable OMS event contribution to one Shopify
   * inventory item at one channel. Mirrors the server entity, whose PK is
   * eventTypeId + eventReferenceId + inventoryChannelId + shopifyInventoryItemId; `adjustmentKey`
   * is the synthetic cache key for that. The type says what kind of source event a row came from
   * and the reference says which occurrence of it — they replaced a single packed `eventKey`, and
   * both are indexed because the history screen filters on type alone.
   * No shopId/shopifyLocationId and no product columns: the channel is the target identity, so
   * shop-scoped reads resolve the shop's channels through `inventoryChannels` first.
   * `lastUpdatedStamp` moves when a pending detail is assigned/no-op/error.
   */
  shopifyInventoryAdjustmentDetails:
    "adjustmentKey, eventTypeId, eventReferenceId, inventoryChannelId, shopifyInventoryItemId, systemMessageId, detailStatusId, createdDate, lastUpdatedStamp, [inventoryChannelId+createdDate], [inventoryChannelId+lastUpdatedStamp], [inventoryChannelId+detailStatusId], [systemMessageId+createdDate]",
  // --- class B: reference/config (snapshot replace + per-mutation refetch) ---
  dataFeeds: "dataFeedId, dataFeedTypeEnumId, lastUpdatedStamp",
  serviceJobs: "jobName, serviceName, paused, cronExpression, nextExecutionDateTime",
  systemMessageRemotes: "systemMessageRemoteId",
  carrierFacilities:
    "carrierFacilityKey, partyId, facilityId, roleTypeId, fromDate, thruDate",
  inventoryChannels:
    "inventoryChannelId, shopId, facilityGroupId, shopifyLocationId, fromDate, thruDate, [shopId+fromDate]",
  // Keyed by (document, feed) because one document can sit on several feeds, or on none.
  inventoryEventDocuments: "documentFeedKey, dataDocumentId, dataFeedId",
  organizations: "partyId, groupName, externalId, statusId",
  organizationRelationships:
    "relationshipKey, partyIdFrom, partyIdTo, partyRelationshipTypeId, fromDate, thruDate",
  users: "partyId, userLoginId",
  permissions: "userPermissionId",
  integrationTypeMappings: "integrationMappingId, integrationTypeId",
  // --- lookup / type reference (all bare-array endpoints) ---
  statuses: "statusId, statusTypeId",
  // PK UNVERIFIED: oms/facilityGroups/types returns an empty 200 on this instance, so the field
  // name could not be confirmed. Named for consistency with facilityTypes/roleTypes.
  facilityGroupTypes: "facilityGroupTypeId",
  userGroups: "userGroupId, groupTypeEnumId",
  productTypes: "productTypeId, parentTypeId",
  currencies: "uomId",
  // --- shop-scoped: composite natural keys, so a synthetic PK + indexed parts ---
  shopifyLocations: "locationKey, shopId, facilityId, shopifyLocationId",
  shopifyTypeMappings: "typeMappingKey, shopId, mappedTypeId, mappedKey",
  // per-store aggregate used by the product-store list
  productStoreShipmentCounts: "productStoreId",
  shopifyCarrierShipments: "carrierShipmentKey, shopId, carrierPartyId, shipmentMethodTypeId",
  productStoreShippingMethods:
    "productStoreShipMethId, productStoreId, partyId, roleTypeId, shipmentMethodTypeId, sequenceNumber, thruDate, [partyId+productStoreId]",
  // facility group <-> product store (co.hotwax.facility.ProductStoreFacilityGroup).
  // Date-effective composite PK, so a synthetic key plus indexed parts.
  facilityGroupProductStores: "facilityGroupProductStoreKey, facilityGroupId, productStoreId, fromDate, thruDate",
  // PKs UNVERIFIED: both endpoints return an empty 200 on this instance, so the natural key could
  // not be confirmed; synthetic keys are built from the fields the entity model implies.
  enumGroupMembers: "enumGroupMemberKey, enumerationGroupId, enumId",
  facilityIdentifications: "facilityIdentificationKey, facilityId, facilityIdenTypeId",
  systemMessageTypes: "systemMessageTypeId, parentTypeId",
  // App registry (admin/apps) — the app catalog the version screen and its create modal read.
  apps: "appId",
  // App version pins (admin/appVersion). Composite natural key (appId + environmentTypeId), so a
  // synthetic PK plus the two indexed parts. `enumDesc`/`appName` come joined on the list response.
  appVersions: "appVersionKey, appId, environmentTypeId",
  // Shopify bulk operations, keyed by the GraphQL node id. A completed operation is immutable, so
  // it can be served from cache forever; only in-flight ones need a re-read.
  shopifyBulkOperations: "id, status, systemMessageRemoteId, completedAt",
  // --- NetSuite order push (rule-group export path) ---
  // Rule groups and their rules are class B config: small, read constantly by the monitor, and
  // refetched after a mutation rather than polled. Runs are class A, cursored on `startDate`.
  netSuiteRuleGroups: "ruleGroupId, productStoreId, groupTypeEnumId, statusId, jobName",
  netSuiteDecisionRules: "ruleId, ruleGroupId, statusId, sequenceNum, [ruleGroupId+sequenceNum]",
  netSuiteRuleGroupRuns: "ruleGroupRunId, ruleGroupId, productStoreId, hasError, startDate, [ruleGroupId+startDate]",
  // One row per product store, not an entity — see `netSuiteOrderPushBacklogProjection`.
  netSuiteOrderPushBacklog: "productStoreId, checkedAt",
};

export const companyDb = defineAppDb({
  suffix: "CompanyDB",
  seed: COMPANY_SEED_ENTITIES,
  schema: COMPANY_SCHEMA,
  /**
   * Company indexes more fields on three shared tables than the seed entity declares.
   * Appended after the seed primary key and indexes, so nothing is redefined.
   */
  extendIndexes: {
    carriers: "groupName, roleTypeId",
    carrierShipmentMethods: "roleTypeId, sequenceNumber",
    shopifyShops: "systemMessageRemoteId",
  },
});

export { COMPANY_SCHEMA, COMPANY_SEED_ENTITIES };
