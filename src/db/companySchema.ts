/**
 * Company's own tables, each declared exactly once.
 *
 * Keyed by IndexedDB store name. Replaces the split between `COMPANY_SCHEMA`'s hand-written Dexie
 * strings in `companyDb.ts` and the projections in `src/utils/db/cacheEntities.ts` — the two could
 * disagree, and nothing checked them against each other.
 *
 * This file covers the 29 tables whose primary key is a single stored field. Composite-key tables
 * (whose PK is a synthetic `*Key` field) are declared separately in a later module.
 *
 * Deep imports, never the `@common/db` barrel: the sync worker reaches this file and Vite must emit
 * that chunk as a single iife.
 */

import { defineEntity } from "@common/db/defineEntity";
import { defineSchema } from "@common/db/defineSchema";

export const companySchema = defineSchema({
  // --- class A: live, append-mostly (incremental cursor sync) ---
  //
  // COMPOUND INDEXES here are load-bearing for sync monitoring, which always asks a two-part
  // question — "this remote's messages OF THIS TYPE, newest first". A single-field index answers
  // only half and leaves the rest to a scan-and-sort. Dexie names them `[a+b]`; adding one here is
  // picked up by Dexie's own schema patch on the next open (verified against a database built
  // without them: the index was created and `where('[configId+createdDate]')` worked).

  /** DataManagerLog — class A (live, append-mostly). Cursor: `createdDate`. */
  dataManagerLogs: defineEntity({
    primaryKey: "logId",
    fields: {
      logId: "text",
      configId: "text",
      systemMessageId: "text",
      statusId: "text",
      totalRecordCount: "count",
      failedRecordCount: "count",
      successRecordCount: "count",
      createdDate: "date",
      startDateTime: "date",
      finishDateTime: "date",
      cancelDateTime: "date",
      lastUpdatedStamp: "date",
    },
    indexes: [
      "configId",
      "systemMessageId",
      "statusId",
      "createdDate",
      "startDateTime",
      "finishDateTime",
      "cancelDateTime",
      "lastUpdatedStamp",
      "[configId+createdDate]",
      "[configId+finishDateTime]",
    ],
  }),

  /** SystemMessage — class A (live, append-mostly). Cursor: `initDate`. */
  systemMessages: defineEntity({
    primaryKey: "systemMessageId",
    fields: {
      systemMessageId: "text",
      systemMessageTypeId: "text",
      systemMessageRemoteId: "text",
      statusId: "text",
      initDate: "date",
      processedDate: "date",
      lastAttemptDate: "date",
      // ⚠️ The response does NOT carry `lastUpdatedStamp` (verified live) — it stays declared
      // because the table indexes it, but expect `undefined`. `initDate` is the usable cursor.
      lastUpdatedStamp: "date",

      // --- fields the sync-monitoring screens read; without these a cached message is unusable ---
      /**
       * The Shopify BulkOperation gid, e.g. `gid://shopify/BulkOperation/7001295421693`. This is the
       * message → bulk-operation link that `getSystemMessageBulkOperationId` resolves, so the sync
       * cards cannot associate a message with its operation without it.
       */
      remoteMessageId: "text",
      /** Also part of the bulk-operation resolution chain (see utils/shopifyBulkOperation.ts). */
      parentMessageId: "text",
      /**
       * The produced request body — for Shopify bulk queries this is the whole GraphQL mutation, so
       * it is by far the largest field here (~1KB per message). Kept because the product-sync run
       * view and history both display it; at the configured 200-message window that is ~200KB.
       */
      messageText: "text",
    },
    indexes: [
      "systemMessageTypeId",
      "systemMessageRemoteId",
      "statusId",
      "initDate",
      "processedDate",
      "lastAttemptDate",
      "lastUpdatedStamp",
      "[systemMessageRemoteId+initDate]",
      "[systemMessageRemoteId+systemMessageTypeId]",
      "[systemMessageRemoteId+systemMessageTypeId+initDate]",
      "[systemMessageRemoteId+statusId]",
    ],
  }),

  /**
   * ServiceJobRun (`moqui.service.job.ServiceJobRun`) — one execution of a scheduled job.
   *
   * Heavy columns are deliberately dropped: `results` (text-very-long), `parameters`, `messages` and
   * the host/thread diagnostics. The sync screens only ask "did the last run succeed, and when" —
   * `hasError` plus the timestamps answer that, and `errors` carries the reason when it did not.
   */
  serviceJobRuns: defineEntity({
    primaryKey: "jobRunId",
    fields: {
      jobRunId: "text",
      jobName: "text",
      hasError: "text",
      errors: "text",
      startTime: "date",
      endTime: "date",
    },
    indexes: ["jobName", "startTime", "endTime", "hasError", "[jobName+startTime]"],
  }),

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
   *
   * The document is a SPARSE projection: log-side fields are simply absent on a run that never imported
   * (verified live — M227136 carries `logId`/`totalRecordCount`, M228375 carries neither). `logId`
   * being absent IS the meaning of "consumed but imported nothing", so it must not coerce to 0 or "".
   */
  syncRuns: defineEntity({
    primaryKey: "systemMessageId",
    fields: {
      systemMessageId: "text",
      systemMessageTypeId: "text",
      systemMessageRemoteId: "text",
      statusId: "text",
      initDate: "date",
      processedDate: "date",
      remoteMessageId: "text",
      /** `remoteInternalId` from the document — the HotWax shop id. What makes this table shop-scoped. */
      shopId: "text",
      configId: "text",
      logId: "text",
      logStatusId: "text",
      totalRecordCount: "count",
      failedRecordCount: "count",
      lastUpdatedStamp: "date",
    },
    indexes: [
      "shopId",
      "configId",
      "systemMessageTypeId",
      "systemMessageRemoteId",
      "statusId",
      "logId",
      "initDate",
      "lastUpdatedStamp",
      "[shopId+systemMessageTypeId+initDate]",
      "[shopId+configId+initDate]",
    ],
    // Keyed by the CACHED name, valued by the SOURCE field — the direction `projectRow` looks up.
    rename: { shopId: "remoteInternalId" },
  }),

  // --- class B: reference/config (snapshot replace + per-mutation refetch) ---

  /**
   * DataFeed — an OMS-wide routing switch for entity-feed delivery.
   *
   * The Shopify aggregate inventory documents currently share one DataFeed, so this record is
   * deliberately not shop-scoped. Every Shopify connection reads the same cached server value.
   */
  dataFeeds: defineEntity({
    primaryKey: "dataFeedId",
    fields: {
      dataFeedId: "text",
      dataFeedTypeEnumId: "text",
      feedName: "text",
      feedReceiveServiceName: "text",
      feedDeleteServiceName: "text",
      lastFeedStamp: "date",
      lastUpdatedStamp: "date",
    },
    indexes: ["dataFeedTypeEnumId", "lastUpdatedStamp"],
  }),

  /** ServiceJob definitions. Real response also carries computed `nextExecutionDateTime`. */
  serviceJobs: defineEntity({
    primaryKey: "jobName",
    fields: {
      jobName: "text",
      description: "text",
      serviceName: "text",
      cronExpression: "text",
      cronDescription: "text",
      paused: "text",
      nextExecutionDateTime: "date",
      executionTimeZone: "text",
      /**
       * The job's bound parameters — how a job is matched to a shop.
       *
       * ⚠️ These come back on the LIST response, not just the detail one (verified live 2026-07-27:
       * 144 of 156 cached jobs carry them, e.g. `sync_ShopifyProductUpdates_10000` →
       * `shopId=10000, productStoreIds=STORE`). They were being projected away, which is why screens
       * fetched `admin/serviceJobs/{jobName}` per job just to read a parameter that was already local.
       *
       * Matching MUST use these rather than the job name: `queue_ShopifyOrderSync_10010` carries
       * `systemMessageRemoteId=HCDemoShopifyConfig`, which belongs to shop 10000 — a name-based guess
       * picks the wrong job silently.
       */
      serviceJobParameters: "structured",
    },
    indexes: ["serviceName", "paused", "cronExpression", "nextExecutionDateTime"],
  }),

  /**
   * SystemMessageRemote — the anchor that scopes a shop's messages.
   *
   * The previous comment here claimed the list response returns only `systemMessageRemoteId`. That is
   * WRONG (verified live 2026-07-27): `oms/systemMessageRemotes` returns the full record, including
   * the two ids that link a remote to a shop. Because those were projected away, every consumer had
   * to reach into `row.raw` to get them, and the worker's message scope — which read the projected
   * row — silently resolved to nothing.
   *
   *   internalId / internalIdType   → the HotWax shopId  (HOTWAX_SHOP_ID)
   *   remoteId   / remoteIdType     → the Shopify shop id (SHOPIFY_SHOP_ID)
   */
  systemMessageRemotes: defineEntity({
    primaryKey: "systemMessageRemoteId",
    fields: {
      systemMessageRemoteId: "text",
      internalId: "text",
      internalIdType: "text",
      remoteId: "text",
      remoteIdType: "text",
      accessScopeEnumId: "text",
      description: "text",
      sendUrl: "text",
    },
  }),

  /**
   * InventoryChannel — one facility-group ATP pool mapped to one Shopify aggregate location.
   * This is the missing ownership link between an aggregate reset ServiceJob parameter and a shop.
   */
  inventoryChannels: defineEntity({
    primaryKey: "inventoryChannelId",
    fields: {
      inventoryChannelId: "text",
      shopId: "text",
      facilityGroupId: "text",
      facilityGroupName: "text",
      shopifyLocationId: "text",
      description: "text",
      fromDate: "date",
      thruDate: "date",
      lastUpdatedStamp: "date",
    },
    indexes: ["shopId", "facilityGroupId", "shopifyLocationId", "fromDate", "thruDate", "[shopId+fromDate]"],
  }),

  /** Internal organization — Party(PARTY_GROUP) + PartyGroup + INTERNAL_ORGANIZATIO PartyRole. */
  organizations: defineEntity({
    primaryKey: "partyId",
    fields: {
      partyId: "text",
      partyTypeId: "text",
      groupName: "text",
      externalId: "text",
      statusId: "text",
      roleTypeId: "text",
      lastUpdatedStamp: "date",
    },
    indexes: ["groupName", "externalId", "statusId"],
  }),

  /**
   * DISAGREEMENT: `COMPANY_SCHEMA` declares `users: "partyId, userLoginId"`, but no
   * `defineCachedEntity("users", ...)` / projection exists anywhere in `cacheEntities.ts` — the
   * table is listed in `appCacheDb.ts`'s `CACHE_TABLES` but nothing registers what it stores. There
   * is no second source to copy `fields` from, so this declares only the two fields the schema
   * string itself names; a real cache entity for `users`, if one is ever written, should replace
   * this rather than the other way round.
   */
  users: defineEntity({
    primaryKey: "partyId",
    fields: {
      partyId: "text",
      userLoginId: "text",
    },
    indexes: ["userLoginId"],
  }),

  /** UserPermission master catalog. PK is `userPermissionId` (not `permissionId`). */
  permissions: defineEntity({
    primaryKey: "userPermissionId",
    fields: { userPermissionId: "text", description: "text", lastUpdatedStamp: "date" },
  }),

  integrationTypeMappings: defineEntity({
    primaryKey: "integrationMappingId",
    fields: {
      integrationMappingId: "text",
      integrationTypeId: "text",
      mappingKey: "text",
      mappingValue: "text",
      lastUpdatedStamp: "date",
    },
    indexes: ["integrationTypeId"],
  }),

  // --- lookup / type reference (all bare-array endpoints; PKs verified live 2026-07-26) ---

  // PK UNVERIFIED: oms/facilityGroups/types returns an empty 200 on this instance, so the field
  // name could not be confirmed. Named for consistency with facilityTypes/roleTypes.
  facilityGroupTypes: defineEntity({
    primaryKey: "facilityGroupTypeId",
    fields: { facilityGroupTypeId: "text", description: "text" },
  }),

  userGroups: defineEntity({
    primaryKey: "userGroupId",
    fields: { userGroupId: "text", description: "text", groupTypeEnumId: "text" },
    indexes: ["groupTypeEnumId"],
  }),

  productTypes: defineEntity({
    primaryKey: "productTypeId",
    fields: { productTypeId: "text", description: "text", parentTypeId: "text" },
    indexes: ["parentTypeId"],
  }),

  /** Currencies are UOMs of type UT_CURRENCY_MEASURE; the picker shows description + abbreviation. */
  currencies: defineEntity({
    primaryKey: "uomId",
    fields: {
      uomId: "text",
      description: "text",
      abbreviation: "text",
      uomTypeEnumId: "text",
    },
  }),

  // --- per-store aggregate used by the product-store list ---

  /** Per-product-store shipment-method count (bare-array aggregate endpoint). */
  productStoreShipmentCounts: defineEntity({
    primaryKey: "productStoreId",
    fields: { productStoreId: "text", shipmentMethodCount: "count" },
  }),

  /** Product-store shipping methods (per store; PK is a real single field). */
  productStoreShippingMethods: defineEntity({
    primaryKey: "productStoreShipMethId",
    fields: {
      productStoreShipMethId: "text",
      productStoreId: "text",
      shipmentMethodTypeId: "text",
      partyId: "text",
      roleTypeId: "text",
      description: "text",
      isTrackingRequired: "text",
      shipmentGatewayConfigId: "text",
      sequenceNumber: "count",
      fromDate: "date",
      thruDate: "date",
    },
    indexes: [
      "productStoreId",
      "partyId",
      "roleTypeId",
      "shipmentMethodTypeId",
      "sequenceNumber",
      "thruDate",
      "[partyId+productStoreId]",
    ],
  }),

  /** SystemMessageType seed data — the type catalog every sync screen labels messages with. */
  systemMessageTypes: defineEntity({
    primaryKey: "systemMessageTypeId",
    fields: {
      systemMessageTypeId: "text",
      description: "text",
      parentTypeId: "text",
      lastUpdatedStamp: "date",
    },
    indexes: ["parentTypeId"],
  }),

  // App registry (admin/apps) — the app catalog the version screen and its create modal read.
  /**
   * App registry (`admin/apps`) — the catalog of apps that can be version-pinned. Read-only reference
   * data: the version screen labels rows with it and the create modal offers app + environment combos
   * that do not yet have a pin.
   */
  apps: defineEntity({
    primaryKey: "appId",
    fields: {
      appId: "text",
      appName: "text",
    },
  }),

  /**
   * A Shopify bulk operation, keyed by its GraphQL node id.
   *
   * Terminal operations (COMPLETED / FAILED / CANCELED) never change again, so once cached they can
   * be read without touching Shopify. Only RUNNING/CREATED ones need re-fetching.
   */
  shopifyBulkOperations: defineEntity({
    primaryKey: "id",
    fields: {
      id: "text",
      status: "text",
      errorCode: "text",
      systemMessageRemoteId: "text",
      objectCount: "count",
      rootObjectCount: "count",
      fileSize: "count",
      url: "text",
      query: "text",
      createdAt: "date",
      completedAt: "date",
    },
    indexes: ["status", "systemMessageRemoteId", "completedAt"],
  }),

  // =============================================================================================
  // NetSuite order push — the rule-group export path (co.hotwax.netsuite.OrderServices)
  //
  // Deepak's rule-group push replaced the single scheduled feed job with a RuleGroup of
  // DecisionRules, each carrying RuleConditions that narrow which orders that rule exports. All
  // three are the SHARED `co.hotwax.rule.*` model the safety-stock screens already drive through
  // `available-to-promise/*`, so nothing here is NetSuite-specific except the
  // `groupTypeEnumId = RG_NS_ORDER_PUSH` scope the reads apply.
  //
  // Rule groups and their rules are class B config: small, read constantly by the monitor, and
  // refetched after a mutation rather than polled. Runs are class A, cursored on `startDate`.
  // =============================================================================================

  /**
   * RuleGroup — one NetSuite order-push configuration for a product store.
   *
   * `jobName` is the link to the scheduled job that runs the group; the schedule itself lives on
   * `moqui.service.job.ServiceJob` and is read through `ruleGroups/{id}/schedule`, not stored here.
   */
  netSuiteRuleGroups: defineEntity({
    primaryKey: "ruleGroupId",
    fields: {
      ruleGroupId: "text",
      productStoreId: "text",
      groupName: "text",
      groupTypeEnumId: "text",
      statusId: "text",
      sequenceNum: "count",
      jobName: "text",
      description: "text",
      createdDate: "date",
      lastModifiedDate: "date",
    },
    indexes: ["productStoreId", "groupTypeEnumId", "statusId", "jobName"],
  }),

  /**
   * DecisionRule — one rule inside a group.
   *
   * The rule's conditions arrive nested on the `default` master (`ruleConditions`), so they are kept
   * on the row as structured data rather than given their own table: a rule is never rendered
   * without them, and the composite PK (ruleId + conditionSeqId) would otherwise need a synthetic key
   * for no read that asks for conditions independently.
   */
  netSuiteDecisionRules: defineEntity({
    primaryKey: "ruleId",
    fields: {
      ruleId: "text",
      ruleGroupId: "text",
      ruleName: "text",
      statusId: "text",
      sequenceNum: "count",
      createdDate: "date",
      ruleConditions: "structured",
      ruleActions: "structured",
    },
    indexes: ["ruleGroupId", "statusId", "sequenceNum", "[ruleGroupId+sequenceNum]"],
  }),

  /**
   * RuleGroupRun — one execution of a rule group. This is the run history the monitor renders.
   *
   * ⚠️ Written by `co.hotwax.rule.DecisionRuleServices`, NOT by
   * `co.hotwax.netsuite.OrderServices.run#NetSuiteDMOrderFeed` itself — that service iterates the
   * rules and creates a DataManagerLog per generated file, and never stamps a RuleGroupRun. So a
   * group invoked directly as a plain ServiceJob produces job runs and MDM logs but NO rows here.
   * Treat an empty run history as "not driven through the rule-group scheduler", never as "no syncs".
   */
  netSuiteRuleGroupRuns: defineEntity({
    primaryKey: "ruleGroupRunId",
    fields: {
      ruleGroupRunId: "text",
      ruleGroupId: "text",
      productStoreId: "text",
      hasError: "text",
      startDate: "date",
      endDate: "date",
      ruleGroupRunResult: "text",
    },
    indexes: ["ruleGroupId", "productStoreId", "hasError", "startDate", "[ruleGroupId+startDate]"],
  }),

  /**
   * The pending-to-sync backlog, as a single row per product store.
   *
   * A scalar count has no entity of its own, so it is stored keyed by `productStoreId` — that is what
   * makes it readable through the same `live()` path as every other cached read, so the monitor card
   * re-renders from the worker's write with no main-thread fetch.
   *
   * `isSupported` records whether the backing endpoint exists on this instance at all:
   * `netsuite/orderPushPending/count` ships in mantle-netsuite-connector and an instance that has not
   * taken that release 404s. That is a "cannot know" answer, which must render differently from a
   * genuine zero backlog — see `useNetSuiteOrderPushBacklog`. One row per product store, not a
   * server entity — see `netSuiteOrderPushBacklogProjection`.
   */
  netSuiteOrderPushBacklog: defineEntity({
    primaryKey: "productStoreId",
    fields: {
      productStoreId: "text",
      pendingCount: "count",
      isSupported: "text",
      checkedAt: "date",
    },
    indexes: ["checkedAt"],
  }),

  // =============================================================================================
  // Composite-key tables (formerly a synthetic `*Key` field joining the fields below with `|`).
  // Each `primaryKey` here was derived from the corresponding `buildKey` in `cacheEntities.ts`,
  // in that function's join order, cross-checked against its doc comment.
  // =============================================================================================

  /**
   * SystemMessageError — on-demand (class C), fetched when a run is inspected. Composite entity PK
   * (systemMessageId + errorDate) — matches `systemMessageErrorProjection.buildKey` exactly.
   *
   * `errorDate` was a tolerated-missing trailing member (`raw?.errorDate ?? ""`) in the old
   * `buildKey`; treated here as a required key member, since an OFBiz-style error record is always
   * stamped with the date it occurred.
   */
  systemMessageErrors: defineEntity({
    primaryKey: "systemMessageId,errorDate",
    fields: {
      systemMessageId: "text",
      errorDate: "date",
      attemptedStatusId: "text",
      errorText: "text",
    },
    indexes: ["systemMessageId", "errorDate", "attemptedStatusId"],
  }),

  /**
   * ProductUpdateHistory — what a sync actually changed, per product. Composite entity PK.
   *
   * ⚠️ DISAGREEMENT (order only, not field set) found while converting this table:
   * `productUpdateHistoryProjection`'s doc comment states "PK is composite (productId + shopId)",
   * but its `buildKey` actually joins `${shop}|${product}` — shopId FIRST. The old `COMPANY_SCHEMA`
   * string agrees with the code (`shopId, productId, ...`), so two of three sources put shopId
   * first and only the prose comment orders it the other way. `primaryKey` below follows the code
   * and the old index order; the prose reads as an informal description, not a literal spec.
   */
  productUpdateHistories: defineEntity({
    primaryKey: "shopId,productId",
    fields: {
      productId: "text",
      shopId: "text",
      systemMessageId: "text",
      parentProductId: "text",
      price: "count",
      features: "text",
      identifications: "text",
      tags: "text",
      assocs: "text",
      differenceMap: "text",
      lastUpdatedStamp: "date",
      createdStamp: "date",
    },
    indexes: ["shopId", "productId", "systemMessageId", "lastUpdatedStamp", "[shopId+lastUpdatedStamp]"],
  }),

  /**
   * ShopifyInventoryAdjustmentDetail — one immutable OMS event contribution to one Shopify
   * inventory item at one channel. The real primary key is (eventTypeId, eventReferenceId,
   * inventoryChannelId, shopifyInventoryItemId) — `shopifyInventoryAdjustmentDetailProjection`'s
   * doc comment states this explicitly and its `buildKey` requires all four with no tolerance,
   * so there is no missing-member judgment call here.
   */
  shopifyInventoryAdjustmentDetails: defineEntity({
    primaryKey: "eventTypeId,eventReferenceId,inventoryChannelId,shopifyInventoryItemId",
    fields: {
      eventTypeId: "text",
      eventReferenceId: "text",
      eventTypeDescription: "text",
      shopifyReason: "text",
      inventoryChannelId: "text",
      shopifyInventoryItemId: "text",
      computedInventoryChange: "count",
      decisionComment: "text",
      systemMessageId: "text",
      detailStatusId: "text",
      createdDate: "date",
      lastUpdatedStamp: "date",
      facilityGroupId: "text",
      inventoryChannelDescription: "text",
      shopifyLocationId: "text",
      // Normally null. Set only on a delta written to drain a location the channel has stopped
      // pointing at, so a retarget stays visible even though the publisher still targets the OLD
      // location.
      publishShopifyLocationId: "text",
      systemMessageStatusId: "text",
      systemMessageInitDate: "date",
      systemMessageProcessedDate: "date",
      systemMessageLastAttemptDate: "date",
    },
    indexes: [
      "eventTypeId",
      "eventReferenceId",
      "inventoryChannelId",
      "shopifyInventoryItemId",
      "systemMessageId",
      "detailStatusId",
      "createdDate",
      "lastUpdatedStamp",
      "[inventoryChannelId+createdDate]",
      "[inventoryChannelId+lastUpdatedStamp]",
      "[inventoryChannelId+detailStatusId]",
      "[systemMessageId+createdDate]",
    ],
  }),

  /**
   * CarrierFacility — a date-effective carrier role at one facility. `carrierFacilityProjection`'s
   * `buildKey` joins partyId + facilityId + roleTypeId + fromDate, tolerating a missing `fromDate`
   * (`?? ""`); treated here as a required key member (OFBiz date-effective PKs are non-null
   * server-side).
   */
  carrierFacilities: defineEntity({
    primaryKey: "partyId,facilityId,roleTypeId,fromDate",
    fields: {
      partyId: "text",
      facilityId: "text",
      facilityName: "text",
      facilityTypeId: "text",
      roleTypeId: "text",
      fromDate: "date",
      thruDate: "date",
    },
    indexes: ["partyId", "facilityId", "roleTypeId", "fromDate", "thruDate"],
  }),

  /**
   * DataDocument ⋈ its feed — which OMS changes an inventory event feed listens to. One row per
   * (document, feed): `DataDocumentAndFeed` left-joins, so a document attached to nothing arrives
   * with no `dataFeedId` at all, and a document on two feeds arrives twice. Both are real rows, not
   * errors, so `dataFeedId` stays a required key member (with an empty-string value standing for
   * "attached to nothing") rather than being dropped from the key — dropping it would collapse the
   * two-feed case onto one row, exactly what `inventoryEventDocumentProjection`'s `buildKey` was
   * written to avoid.
   */
  inventoryEventDocuments: defineEntity({
    primaryKey: "dataDocumentId,dataFeedId",
    fields: {
      dataDocumentId: "text",
      dataFeedId: "text",
      documentName: "text",
      primaryEntityName: "text",
    },
    indexes: ["dataDocumentId", "dataFeedId"],
  }),

  /**
   * Parent → child internal-organization edge (PartyRelationship). Date-effective composite key;
   * `organizationRelationshipProjection.buildKey` joins partyIdFrom + partyIdTo + roleTypeIdFrom +
   * roleTypeIdTo + partyRelationshipTypeId + fromDate, tolerating a missing `fromDate` (`?? ""`);
   * treated here as a required key member for the same OFBiz date-effective reason as above.
   */
  organizationRelationships: defineEntity({
    primaryKey: "partyIdFrom,partyIdTo,roleTypeIdFrom,roleTypeIdTo,partyRelationshipTypeId,fromDate",
    fields: {
      partyIdFrom: "text",
      partyIdTo: "text",
      roleTypeIdFrom: "text",
      roleTypeIdTo: "text",
      partyRelationshipTypeId: "text",
      fromDate: "date",
      thruDate: "date",
      statusId: "text",
    },
    indexes: ["partyIdFrom", "partyIdTo", "partyRelationshipTypeId", "fromDate", "thruDate"],
  }),

  /**
   * ShopifyLocation — a shop's Shopify location mapped to an internal facility. Tier-3 shop-scoped
   * reference, fetched unscoped as one snapshot. `shopifyLocationProjection.buildKey` joins only
   * shopId + shopifyLocationId (not `facilityId`, which is a mapped attribute, not part of
   * identity) with no tolerated members.
   */
  shopifyLocations: defineEntity({
    primaryKey: "shopId,shopifyLocationId",
    fields: {
      shopId: "text",
      facilityId: "text",
      shopifyLocationId: "text",
      lastUpdatedStamp: "date",
    },
    indexes: ["shopId", "facilityId", "shopifyLocationId"],
  }),

  /**
   * ShopifyTypeMapping — tier-3 shop-scoped reference. `shopifyTypeMappingProjection.buildKey`
   * joins shopId + mappedTypeId + mappedKey, tolerating a missing `mappedKey` (`?? ""`); treated
   * here as a required key member — there is no comment or live evidence suggesting it can be
   * genuinely absent from a real mapping row.
   */
  shopifyTypeMappings: defineEntity({
    primaryKey: "shopId,mappedTypeId,mappedKey",
    fields: {
      shopId: "text",
      mappedTypeId: "text",
      mappedKey: "text",
      mappedValue: "text",
      lastUpdatedStamp: "date",
    },
    indexes: ["shopId", "mappedTypeId", "mappedKey"],
  }),

  /**
   * Shopify carrier → shipment-method mapping. Composite key (shop + carrier + method), matching
   * `shopifyCarrierShipmentProjection`'s doc comment. `buildKey` requires `shopId` but tolerates a
   * missing `carrierPartyId`/`shipmentMethodTypeId` (`?? ""`); both are treated here as required
   * key members per the default rule, consistent with the comment's stated 3-part key. Judgment
   * call: could not confirm live whether an unscoped "applies to all carriers/methods" row exists;
   * if one does, it would need a real (non-synthetic) sentinel value rather than an absent field.
   */
  shopifyCarrierShipments: defineEntity({
    primaryKey: "shopId,carrierPartyId,shipmentMethodTypeId",
    fields: {
      shopId: "text",
      carrierPartyId: "text",
      shipmentMethodTypeId: "text",
      shopifyShippingMethod: "text",
      lastUpdatedStamp: "date",
    },
    indexes: ["shopId", "carrierPartyId", "shipmentMethodTypeId"],
  }),

  /**
   * ProductStoreFacilityGroup (co.hotwax.facility.ProductStoreFacilityGroup) — facility group ↔
   * product store, date-effective.
   *
   * ⚠️ DISAGREEMENT (order only, not field set) found while converting this table:
   * `facilityGroupProductStoreProjection`'s doc comment states the natural key as "(productStoreId
   * + facilityGroupId + fromDate)", but its `buildKey` actually joins
   * `${facilityGroupId}|${productStoreId}|${fromDate}` — facilityGroupId FIRST. The old
   * `COMPANY_SCHEMA` string agrees with the code (`facilityGroupId, productStoreId, ...`), so
   * `primaryKey` below follows the code and the old index order, same reasoning as
   * `productUpdateHistories` above.
   *
   * `fromDate` was a tolerated-missing trailing member (`?? ""`); treated here as a required key
   * member for the same OFBiz date-effective reason as `carrierFacilities`.
   */
  facilityGroupProductStores: defineEntity({
    primaryKey: "facilityGroupId,productStoreId,fromDate",
    fields: {
      facilityGroupId: "text",
      productStoreId: "text",
      sequenceNumber: "count",
      fromDate: "date",
      thruDate: "date",
    },
    indexes: ["facilityGroupId", "productStoreId", "fromDate", "thruDate"],
  }),

  /**
   * PK UNVERIFIED: `enumGroupMemberProjection`'s doc comment records that its endpoint returns an
   * empty 200 on the available instance, so the natural key could not be confirmed live. Converted
   * to its implied compound key (enumerationGroupId + enumId), the fields `buildKey` joins in
   * order — that function defaults a missing `enumerationGroupId` to the literal constant
   * `"NETSUITE_IIV_REASON"` rather than reading it from another field, so this is not a `rename`
   * case.
   */
  enumGroupMembers: defineEntity({
    primaryKey: "enumerationGroupId,enumId",
    fields: {
      enumerationGroupId: "text",
      enumId: "text",
      description: "text",
      fromDate: "date",
      thruDate: "date",
    },
    indexes: ["enumerationGroupId", "enumId"],
  }),

  /**
   * PK UNVERIFIED: `facilityIdentificationProjection`'s doc comment records that its endpoint also
   * returns an empty 200 on the available instance, so the natural key could not be confirmed
   * live. Converted to its implied compound key (facilityId + facilityIdenTypeId) — `buildKey`
   * requires both with no tolerance, per its own comment explaining that defaulting a missing type
   * would make two different identifications on one facility collide.
   */
  facilityIdentifications: defineEntity({
    primaryKey: "facilityId,facilityIdenTypeId",
    fields: {
      facilityId: "text",
      facilityIdenTypeId: "text",
      idValue: "text",
      description: "text",
    },
    indexes: ["facilityId", "facilityIdenTypeId"],
  }),

  /**
   * App version pin (admin/appVersion) — which build of each app is served per environment.
   * Composite natural key (appId + environmentTypeId), matching `appVersionProjection`'s doc
   * comment and its `buildKey` exactly, with no tolerated members.
   */
  appVersions: defineEntity({
    primaryKey: "appId,environmentTypeId",
    fields: {
      appId: "text",
      appName: "text",
      environmentTypeId: "text",
      currentVersion: "text",
      enumDesc: "text",
    },
    indexes: ["appId", "environmentTypeId"],
  }),
});
