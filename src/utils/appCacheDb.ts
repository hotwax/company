import Dexie, { type Table, liveQuery, type Observable } from "dexie";
import {
  type CachedRow,
  type EntityProjection,
  diffStaleKeys,
  newestValue,
  projectRows,
} from "./cacheProjection";

/**
 * The app's local read cache (IndexedDB via Dexie) — one database, one table per domain.
 *
 * The worker writes; the main thread reads through `live()` (Dexie broadcasts every commit over
 * a BroadcastChannel, so main-thread liveQuery subscriptions re-emit without any postMessage).
 * The cache is durable: it survives view exit and full reloads, so returning to a view renders
 * instantly from IndexedDB and revalidates in the background. It is cleared on logout only.
 *
 * Dexie schema strings list the PRIMARY KEY first, then secondary indexes — not columns. Row
 * values are arbitrary structured-clone-safe JSON, so each row also carries the untouched
 * server object in `raw`.
 */
class CompanyCacheDB extends Dexie {
  dataManagerLogs!: Table<CachedRow, string>;
  systemMessages!: Table<CachedRow, string>;
  systemMessageRemotes!: Table<CachedRow, string>;
  serviceJobRuns!: Table<CachedRow, string>;
  /** Shop-scoped sync cursor/spine — see the `syncRuns` schema note. */
  syncRuns!: Table<CachedRow, string>;
  serviceJobs!: Table<CachedRow, string>;
  productStores!: Table<CachedRow, string>;
  carriers!: Table<CachedRow, string>;
  carrierShipmentMethods!: Table<CachedRow, string>;
  carrierFacilities!: Table<CachedRow, string>;
  shopifyShops!: Table<CachedRow, string>;
  organizations!: Table<CachedRow, string>;
  organizationRelationships!: Table<CachedRow, string>;
  facilities!: Table<CachedRow, string>;
  facilityGroups!: Table<CachedRow, string>;
  groupFacilities!: Table<CachedRow, string>;
  users!: Table<CachedRow, string>;
  permissions!: Table<CachedRow, string>;
  integrationTypeMappings!: Table<CachedRow, string>;
  // NetSuite order push (rule-group export path)
  netSuiteRuleGroups!: Table<CachedRow, string>;
  netSuiteDecisionRules!: Table<CachedRow, string>;
  netSuiteRuleGroupRuns!: Table<CachedRow, string>;
  netSuiteOrderPushBacklog!: Table<CachedRow, string>;
  // lookup / type reference tables
  statuses!: Table<CachedRow, string>;
  enums!: Table<CachedRow, string>;
  facilityTypes!: Table<CachedRow, string>;
  facilityGroupTypes!: Table<CachedRow, string>;
  userGroups!: Table<CachedRow, string>;
  productTypes!: Table<CachedRow, string>;
  shipmentMethodTypes!: Table<CachedRow, string>;
  currencies!: Table<CachedRow, string>;
  paymentMethodTypes!: Table<CachedRow, string>;
  roleTypes!: Table<CachedRow, string>;
  // shop-scoped tables
  shopifyLocations!: Table<CachedRow, string>;
  shopifyTypeMappings!: Table<CachedRow, string>;
  productStoreShipmentCounts!: Table<CachedRow, string>;
  shopifyCarrierShipments!: Table<CachedRow, string>;
  productStoreShippingMethods!: Table<CachedRow, string>;
  enumTypes!: Table<CachedRow, string>;
  geos!: Table<CachedRow, string>;
  geoAssocs!: Table<CachedRow, string>;
  productStoreFacilities!: Table<CachedRow, string>;
  facilityGroupProductStores!: Table<CachedRow, string>;

  enumGroupMembers!: Table<CachedRow, string>;
  facilityIdentifications!: Table<CachedRow, string>;
  systemMessageTypes!: Table<CachedRow, string>;
  apps!: Table<CachedRow, string>;
  appVersions!: Table<CachedRow, string>;
  shopifyBulkOperations!: Table<CachedRow, string>;
  systemMessageErrors!: Table<CachedRow, string>;
  productUpdateHistories!: Table<CachedRow, string>;
  /** OMS-wide Shopify inventory event feed configuration. */
  dataFeeds!: Table<CachedRow, string>;
  /** Shopify aggregate inventory event ledger, scoped by shop. */
  shopifyInventoryAdjustmentDetails!: Table<CachedRow, string>;
  /** Shopify per-location real-time inventory push ledger, scoped by shop. */
  shopifyLocationInventoryAdjustmentDetails!: Table<CachedRow, string>;
  /** Shopify aggregate ATP channel configuration, scoped by shop. */
  inventoryChannels!: Table<CachedRow, string>;
  /** Which DataDocuments the Shopify inventory event feed listens to. */
  inventoryEventDocuments!: Table<CachedRow, string>;
  /** Shopify inventory transfer sync — one row per (shopId, orderId). */
  shopifyTransferSyncs!: Table<CachedRow, string>;
  /** Latest transfer webhook subscription health check, one row per shop. */
  shopifyTransferWebhookHealth!: Table<CachedRow, string>;
  syncMeta!: Table<Record<string, any>, string>;

  constructor() {
    super("CompanyCacheDB");
    // ONE schema version, deliberately. This is a disposable read cache, so schema changes are
    // resolved by recreating the database (see `ensureCacheReady`) rather than by migrations.
    // Just edit the schema below; you do NOT need to bump anything. Measured against real Dexie
    // 4.4.3 + real IndexedDB:
    //   - added store or added index → Dexie itself patches it in ("Schema was extended without
    //     increasing the number passed to db.version()") and bumps the native version;
    //   - changed primary key       → `open()` rejects with `UpgradeError`, which `ensureCacheReady`
    //     catches and resolves by rebuilding.
    // An earlier note here blamed a silent missing store on the version bump. That was a
    // misdiagnosis of the `versionchange` handler we used to install — see the note at the bottom
    // of this file.
    this.version(1).stores(CACHE_SCHEMA as Record<string, string>);
  }
}

/**
 * The cache schema: primary key first, then secondary indexes (not columns). Edit freely — a
 * mismatch against the stored database triggers a rebuild, not a migration.
 */
const CACHE_SCHEMA = {
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
  /**
   * ShopifyLocationInventoryAdjustmentDetail — the per-Shopify-location real-time push ledger.
   * PK is eventTypeId + eventReferenceId + shopId + shopifyLocationId, so `locationAdjustmentKey`
   * is the synthetic cache key. Indexed by shopId directly (unlike the aggregate ledger, this row
   * carries its shop identity natively rather than through a channel indirection).
   */
  shopifyLocationInventoryAdjustmentDetails:
    "locationAdjustmentKey, eventTypeId, eventReferenceId, shopId, shopifyLocationId, systemMessageId, createdDate, lastUpdatedStamp, [shopId+createdDate], [shopId+systemMessageId]",
  // --- class B: reference/config (snapshot replace + per-mutation refetch) ---
  dataFeeds: "dataFeedId, dataFeedTypeEnumId, lastUpdatedStamp",
  serviceJobs: "jobName, serviceName, paused, cronExpression, nextExecutionDateTime",
  systemMessageRemotes: "systemMessageRemoteId",
  productStores: "productStoreId, storeName",
  carriers: "partyId, groupName, roleTypeId",
  carrierShipmentMethods:
    "carrierShipmentMethodKey, partyId, roleTypeId, shipmentMethodTypeId, sequenceNumber",
  carrierFacilities:
    "carrierFacilityKey, partyId, facilityId, roleTypeId, fromDate, thruDate",
  shopifyShops: "shopId, productStoreId, systemMessageRemoteId, shopifyShopId",
  inventoryChannels:
    "inventoryChannelId, shopId, facilityGroupId, shopifyLocationId, fromDate, thruDate, [shopId+fromDate]",
  // Keyed by (document, feed) because one document can sit on several feeds, or on none.
  inventoryEventDocuments: "documentFeedKey, dataDocumentId, dataFeedId",
  organizations: "partyId, groupName, externalId, statusId",
  organizationRelationships:
    "relationshipKey, partyIdFrom, partyIdTo, partyRelationshipTypeId, fromDate, thruDate",
  facilities: "facilityId, facilityTypeId, parentTypeId, ownerPartyId",
  facilityGroups: "facilityGroupId, facilityGroupTypeId",
  groupFacilities: "memberKey, facilityGroupId, facilityId, fromDate, thruDate",
  users: "partyId, userLoginId",
  permissions: "userPermissionId",
  integrationTypeMappings: "integrationMappingId, integrationTypeId",
  // --- lookup / type reference (all bare-array endpoints) ---
  statuses: "statusId, statusTypeId",
  enums: "enumId, enumTypeId, enumCode",
  facilityTypes: "facilityTypeId, parentTypeId",
  // PK UNVERIFIED: oms/facilityGroups/types returns an empty 200 on this instance, so the field
  // name could not be confirmed. Named for consistency with facilityTypes/roleTypes.
  facilityGroupTypes: "facilityGroupTypeId",
  userGroups: "userGroupId, groupTypeEnumId",
  productTypes: "productTypeId, parentTypeId",
  shipmentMethodTypes: "shipmentMethodTypeId",
  currencies: "uomId",
  paymentMethodTypes: "paymentMethodTypeId",
  roleTypes: "roleTypeId, parentTypeId",
  // --- shop-scoped: composite natural keys, so a synthetic PK + indexed parts ---
  shopifyLocations: "locationKey, shopId, facilityId, shopifyLocationId",
  shopifyTypeMappings: "typeMappingKey, shopId, mappedTypeId, mappedKey",
  // per-store aggregate used by the product-store list
  productStoreShipmentCounts: "productStoreId",
  shopifyCarrierShipments: "carrierShipmentKey, shopId, carrierPartyId, shipmentMethodTypeId",
  productStoreShippingMethods:
    "productStoreShipMethId, productStoreId, partyId, roleTypeId, shipmentMethodTypeId, sequenceNumber, thruDate, [partyId+productStoreId]",
  enumTypes: "enumTypeId, parentTypeId",
  // Geo reference straight from Moqui (moqui.basic.Geo / GeoAssoc) — replaces utilStore states
  // and operating countries.
  geos: "geoId, geoTypeEnumId, geoCode",
  geoAssocs: "geoAssocKey, geoId, toGeoId, geoAssocTypeEnumId",
  // facility <-> product store association, built by fanning out over cached product stores.
  productStoreFacilities: "storeFacilityKey, productStoreId, facilityId",
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
  // --- Shopify transfer sync monitoring (sob/shopify/transferSync) ---
  // One row per (shopId, orderId). `syncStage` is indexed because the list view filters on it, and
  // `needsAttention` because those rows sort first.
  shopifyTransferSyncs:
    "transferSyncKey, shopId, orderId, syncStage, needsAttention, lastActivityAt, [shopId+lastActivityAt], [shopId+syncStage]",
  // One row per shop, not an entity — see `shopifyTransferWebhookHealthProjection`.
  shopifyTransferWebhookHealth: "shopId, checkedAt",
  // Bookkeeping, not domain data: per-domain sync markers + the cache identity stamp.
  syncMeta: "key",
} as const;

/** Every table the current schema declares. */
export const CACHE_TABLES = Object.keys(CACHE_SCHEMA);

export const appCacheDb = new CompanyCacheDB();

/** Table names that exist in the cache. */
/**
 * Derived from the schema so it can never drift. Adding a table to `CACHE_SCHEMA` is the only
 * step needed — this union, and every `defineCachedEntity` call site, updates automatically.
 */
export type CacheTableName = keyof typeof CACHE_SCHEMA;

/**
 * How a view narrows a cached table.
 *
 * `scope` + `dateField` are resolved through a COMPOUND index when one is declared for that exact
 * pair — `[scopeField+dateField]` — so the newest-N query is an index range read rather than a
 * fetch-everything-then-sort. `equals` adds a second equality (e.g. remote + message type) and uses
 * `[a+b+date]` when available. Anything not expressible as an index (a status set, an arbitrary
 * predicate) goes in `filter`, which runs inside the same `liveQuery` and stays reactive.
 */
export interface LiveQueryOptions {
  /** Sort descending by this date field. */
  dateField?: string;
  /** Primary partition, e.g. `{ field: "systemMessageRemoteId", value: remoteId }`. */
  scope?: { field: string; value: unknown };
  /** Additional equality narrowing, e.g. `{ systemMessageTypeId: "BulkQueryShopifyProductUpdates" }`. */
  equals?: Record<string, unknown>;
  /** Anything an index cannot express. Applied after the index read, before sort/limit. */
  filter?: (row: CachedRow) => boolean;
  /** Keep only the first N rows after sorting — the "newest 10" case. */
  limit?: number;
}

export interface CachedEntity {
  readonly table: CacheTableName;
  /** Upsert raw server records (insert-or-replace by primary key). Returns rows written. */
  upsertMany(rawRows: Array<Record<string, unknown>>): Promise<number>;
  /**
   * Class-B snapshot: replace the whole (optionally scoped) set — upsert the fresh rows and
   * delete cached rows the server no longer returns, in one transaction.
   */
  snapshotReplace(
    rawRows: Array<Record<string, unknown>>,
    scope?: { field: string; value: unknown },
  ): Promise<{ written: number; pruned: number }>;
  /**
   * Newest cached value of `dateField`, optionally scoped — the incremental-poll cursor.
   *
   * `equals` narrows further (e.g. one message type within one remote) and resolves through the
   * `[scope+equals+date]` compound index when one is declared, so a per-(scope, type) cursor is an
   * index seek rather than a scan of the whole table.
   */
  newestCursor(
    dateField: string,
    scope?: { field: string; value: unknown },
    equals?: Record<string, unknown>,
  ): Promise<number | undefined>;
  /**
   * Cached rows where `dateField` is absent (e.g. logs with no finish time) — refresh targets.
   *
   * `since` bounds the candidate set by AGE, which is what keeps this from growing without limit:
   * a row that will never gain `dateField` (an errored message never gets a `processedDate`) would
   * otherwise stay a refresh target forever, and each target costs one request on every tick.
   */
  rowsMissing(
    dateField: string,
    options?: { limit?: number; since?: { field: string; afterMs: number } },
  ): Promise<CachedRow[]>;
  /**
   * How many rows a scope currently holds — the backfill test.
   *
   * A cursor-driven domain only ever asks for page 0 once it has a cursor, so a window that was first
   * synced shallow stays shallow forever and raising its configured depth does nothing. Comparing this
   * against the target is what tells a domain to page deeper.
   */
  count(scope?: { field: string; value: unknown }, equals?: Record<string, unknown>): Promise<number>;
  /** Remove one row by primary key (used after a delete mutation). */
  remove(key: string): Promise<void>;
  /** Live, reactive view of the table, newest `dateField` first when given. */
  live(options?: LiveQueryOptions): Observable<CachedRow[]>;
  /** All rows, one shot. */
  all(): Promise<CachedRow[]>;
  clear(): Promise<void>;
}

/** Dexie names a compound index `[a+b]`; normalize before comparing against a declared key path. */
function normalizeIndexName(name: string): string {
  return name.replace(/\s+/g, "");
}

/**
 * Bind a projection to a cache table, yielding the operations every sync domain needs. This is
 * the seam that keeps domain code free of Dexie: a domain declares its fields and gets storage.
 */
export function defineCachedEntity(table: CacheTableName, projection: EntityProjection): CachedEntity {
  const dexieTable = () => appCacheDb[table] as Table<CachedRow, string>;

  return {
    table,

    async upsertMany(rawRows) {
      const rows = projectRows(rawRows, projection, Date.now());
      if (rows.length) await dexieTable().bulkPut(rows);
      return rows.length;
    },

    async snapshotReplace(rawRows, scope) {
      const rows = projectRows(rawRows, projection, Date.now());
      let pruned = 0;
      await appCacheDb.transaction("rw", dexieTable(), async () => {
        const existing = scope
          ? await dexieTable().where(scope.field).equals(scope.value as any).primaryKeys()
          : await dexieTable().toCollection().primaryKeys();
        const stale = diffStaleKeys(
          existing as string[],
          rows.map((row) => String(row[projection.keyField])),
        );
        if (stale.length) {
          await dexieTable().bulkDelete(stale);
          pruned = stale.length;
        }
        if (rows.length) await dexieTable().bulkPut(rows);
      });
      return { written: rows.length, pruned };
    },

    async newestCursor(dateField, scope, equals) {
      const table = dexieTable();
      const equalityFields = equals ? Object.keys(equals) : [];

      if (scope && equalityFields.length) {
        // Prefer `[scope+...equals+date]` — one index seek for the newest row of this partition.
        const path = `[${[scope.field, ...equalityFields, dateField].join("+")}]`;
        const indexed = (table.schema.indexes ?? []).some(
          (index: any) => normalizeIndexName(index?.name ?? "") === path,
        );
        const prefix = [scope.value, ...equalityFields.map((field) => equals![field])];
        if (indexed) {
          const newest = await table
            .where(path)
            .between([...prefix, -Infinity], [...prefix, Infinity])
            .last();
          return newest?.[dateField] as number | undefined;
        }
        const rows = (await table.where(scope.field).equals(scope.value as any).toArray())
          .filter((row) => equalityFields.every((field) => row[field] === equals![field]));
        return newestValue(rows, dateField);
      }

      if (scope) {
        // Scoped: walk the scoped rows (small by construction) and take the max.
        const rows = await table.where(scope.field).equals(scope.value as any).toArray();
        return newestValue(rows, dateField);
      }

      if (equalityFields.length) {
        // No partition, but still narrowed (e.g. one message type across all remotes). Seek on the
        // first equality field when it is indexed, then apply the rest in memory.
        const [first, ...rest] = equalityFields;
        const firstIndexed = (table.schema.indexes ?? []).some(
          (index: any) => normalizeIndexName(index?.name ?? "") === first,
        );
        const rows = firstIndexed
          ? await table.where(first).equals(equals![first] as any).toArray()
          : await table.toCollection().toArray();
        const narrowed = rows.filter((row) =>
          (firstIndexed ? rest : equalityFields).every((field) => row[field] === equals![field]));
        return newestValue(narrowed, dateField);
      }

      const newest = await table.orderBy(dateField).last();
      return newest?.[dateField] as number | undefined;
    },

    async rowsMissing(dateField, options = {}) {
      const { limit = 50, since } = options;
      const table = dexieTable();

      // Bound by age through the index when we can, so this is a range read rather than a scan of
      // every cached row. Rows with no `since` value at all are excluded: without one there is no
      // way to tell a still-in-flight record from an abandoned one.
      const indexed = since
        ? (table.schema.indexes ?? []).some(
            (index: any) => normalizeIndexName(index?.name ?? "") === since.field,
          )
        : false;

      const collection = since && indexed
        ? table.where(since.field).above(since.afterMs)
        : table.toCollection();

      const rows = await collection
        .filter((row) => {
          if (row[dateField] !== undefined) return false;
          if (!since || indexed) return true;
          const stamp = row[since.field];
          return typeof stamp === "number" && stamp > since.afterMs;
        })
        .limit(limit)
        .toArray();

      return rows;
    },

    async count(scope, equals) {
      const rows = await dexieTable().toArray();
      return rows.filter((row: any) => {
        if (scope && String(row?.[scope.field]) !== String(scope.value)) return false;
        for (const [field, value] of Object.entries(equals ?? {})) {
          if (String(row?.[field]) !== String(value)) return false;
        }
        return true;
      }).length;
    },

    async remove(key) {
      await dexieTable().delete(key);
    },

    live(options: LiveQueryOptions = {}) {
      const { dateField, scope, equals, filter, limit } = options;

      return liveQuery(async () => {
        const table = dexieTable();
        const equalityFields = equals ? Object.keys(equals) : [];

        /** An index exists for this exact key path, so the read can be a range scan. */
        const hasIndex = (path: string) =>
          (table.schema.indexes ?? []).some((index: any) => normalizeIndexName(index?.name ?? "") === path);

        let rows: CachedRow[];

        if (scope) {
          // Prefer the widest compound index that covers scope + equalities (+ the date, which
          // gives sorted output for free).
          const compoundWithDate = `[${[scope.field, ...equalityFields, dateField].filter(Boolean).join("+")}]`;
          const compound = `[${[scope.field, ...equalityFields].join("+")}]`;

          if (dateField && equalityFields.length && hasIndex(compoundWithDate)) {
            // Range over [scope, ...equals, *] — every row of this partition, index-ordered by date.
            const prefix = [scope.value, ...equalityFields.map((field) => equals![field])];
            rows = await table
              .where(compoundWithDate)
              .between([...prefix, -Infinity], [...prefix, Infinity])
              .reverse()
              .toArray();
          } else if (equalityFields.length && hasIndex(compound)) {
            rows = await table
              .where(compound)
              .equals([scope.value, ...equalityFields.map((field) => equals![field])] as any)
              .toArray();
          } else if (dateField && !equalityFields.length && hasIndex(`[${scope.field}+${dateField}]`)) {
            rows = await table
              .where(`[${scope.field}+${dateField}]`)
              .between([scope.value, -Infinity], [scope.value, Infinity])
              .reverse()
              .toArray();
          } else {
            rows = await table.where(scope.field).equals(scope.value as any).toArray();
            // Equalities the index could not absorb still have to hold.
            if (equalityFields.length) {
              rows = rows.filter((row) =>
                equalityFields.every((field) => row[field] === equals![field]));
            }
          }
        } else if (dateField) {
          rows = await table.orderBy(dateField).reverse().toArray();
          if (equalityFields.length) {
            rows = rows.filter((row) => equalityFields.every((field) => row[field] === equals![field]));
          }
        } else {
          rows = await table.toCollection().toArray();
          if (equalityFields.length) {
            rows = rows.filter((row) => equalityFields.every((field) => row[field] === equals![field]));
          }
        }

        if (filter) rows = rows.filter(filter);

        // Re-sort only when the index did not already deliver date order.
        const indexOrdered = Boolean(
          scope && dateField && (
            hasIndex(`[${[scope.field, ...equalityFields, dateField].filter(Boolean).join("+")}]`) ||
            (!equalityFields.length && hasIndex(`[${scope.field}+${dateField}]`))
          ),
        );
        if (dateField && !indexOrdered) {
          rows = [...rows].sort((a, b) => ((b[dateField] as number) ?? 0) - ((a[dateField] as number) ?? 0));
        }

        return typeof limit === "number" ? rows.slice(0, limit) : rows;
      });
    },

    all() {
      return dexieTable().toCollection().toArray();
    },

    async clear() {
      await dexieTable().clear();
    },
  };
}

/**
 * Wipe every cached table. Called on logout — the cache is not persisted across sessions yet
 * (cross-session / cross-tab caches are later-stage work), so one user's data never surfaces
 * in another's session.
 */
export async function clearAllCaches(): Promise<void> {
  await Promise.all(appCacheDb.tables.map((table) => table.clear()));
}

/**
 * Open the cache, RECREATING it if the stored schema can't be upgraded to the current one.
 *
 * This is a disposable read cache (never the source of truth, re-seeds from the server), so a
 * schema change is resolved by throwing the old database away rather than writing a migration.
 * Without this, adding a table strands every existing installation: the upgrade fails and every
 * subsequent write silently no-ops while fetches keep succeeding — exactly the failure this was
 * added to fix (verified 2026-07-26: stale v1 DB ⇒ all class-B writes lost).
 *
 * Call before the first cache operation in each context (worker and main thread).
 */
export async function ensureCacheReady(): Promise<void> {
  if (appCacheDb.isOpen() && !hasSchemaDrift()) return;

  try {
    if (!appCacheDb.isOpen()) await appCacheDb.open();
  } catch {
    // Any open failure on a disposable cache is resolved the same way: rebuild.
    await rebuild();
    return;
  }

  // Deterministic check on the STORE SET — do not rely on an exception. A missing store means a new
  // domain was added; an orphaned one means a domain was renamed or removed and its old rows are
  // still being served under a previous key field.
  const drift = schemaDrift();
  if (drift.missing.length || drift.orphaned.length) {
    console.warn(
      `[cache] schema drift — rebuilding. missing: [${drift.missing.join(", ")}], ` +
      `orphaned: [${drift.orphaned.join(", ")}]`,
    );
    await rebuild();
  }
}

/**
 * Difference between the declared STORE SET and the backing database — in EITHER direction.
 *
 * Missing tables mean a new domain was added. Extra tables mean one was renamed or removed, and
 * those matter too: checking only for missing tables left the old store behind after a rename,
 * holding stale rows under the previous key field (observed with `groupProductStores` →
 * `facilityGroupProductStores`). Either way the answer is the same — rebuild.
 *
 * Deliberately NOT checked here: index sets. There used to be an `indexDrift()` pass that compared
 * declared index names against `appCacheDb.table(t).schema.indexes`, but `schema` is built from the
 * `.stores()` spec — it is the DECLARED schema, readable before the database is even opened, not
 * what is installed. Both sides of that comparison were the same object, so it could never report
 * drift (verified: a database built with zero secondary indexes produced no drift report). It was
 * also unnecessary — Dexie patches added indexes in on the next open by itself, and rebuilding for
 * an index Dexie would have added just throws away a warm cache and re-syncs ~30 domains.
 */
function schemaDrift(): { missing: string[]; orphaned: string[] } {
  try {
    const backend = appCacheDb.backendDB();
    const actual = [...(backend?.objectStoreNames ?? [])] as string[];
    const declared = new Set(CACHE_TABLES);
    return {
      missing: CACHE_TABLES.filter((table) => !actual.includes(table)),
      orphaned: actual.filter((table) => !declared.has(table)),
    };
  } catch {
    return { missing: [], orphaned: [] };
  }
}

function hasSchemaDrift(): boolean {
  const { missing, orphaned } = schemaDrift();
  return missing.length > 0 || orphaned.length > 0;
}

async function rebuild(): Promise<void> {
  await appCacheDb.delete();
  await appCacheDb.open();
}

// NO `versionchange` / `blocked` handlers here — deliberately. Dexie's own defaults are correct and
// adding ours on top was actively harmful.
//
// `db.close()` called with NO ARGUMENTS defaults to `{ disableAutoOpen: true }`, which sets
// `autoOpen = false` and parks a permanent `DatabaseClosedError` on the connection. Dexie's built-in
// handler already closes with `{ disableAutoOpen: false }` (so the handle recovers), and these events
// are additive — ours ran *after* Dexie's and downgraded a recoverable close into a permanent one.
//
// Measured on real Dexie 4.4.3 + real IndexedDB, two connections (main thread + worker), where the
// second connection declares one extra store — i.e. ANY edit to `CACHE_SCHEMA`:
//
//   with our handlers : read/write -> DatabaseClosedError forever; autoOpen=false;
//                       the liveQuery went SILENT (its `error` callback never even fired, so the
//                       page froze on stale rows with nothing logged anywhere)
//   Dexie defaults    : read OK, write OK, liveQuery kept emitting through the version bump
//
// That is the whole mechanism behind "every write failed while fetches kept succeeding": the schema
// edit was never the problem, closing our own handle in response to it was.
//
// Closing on `blocked` was wrong on its own terms too: `blocked` fires on the connection that is
// itself being blocked by someone else, so closing yourself cannot unblock anything — it only
// disables auto-open.

/** Drop the superseded single-purpose DataManagerLog cache database, if present. */
export async function deleteLegacyCaches(): Promise<void> {
  try {
    await Dexie.delete("DataManagerLogCacheDB");
  } catch {
    // best-effort cleanup; a failure here must never block app start
  }
}


// ---------------------------------------------------------------------------------------------
// Sync bookkeeping: "already synced for this login" markers + the cache identity stamp.
//
// Reference data syncs once per LOGIN, not per page load. A browser refresh keeps the session but
// wipes all JS state, so the marker has to live in the cache itself. Logout clears every table
// (including these markers), so the next login re-syncs from scratch with no timers involved.
// ---------------------------------------------------------------------------------------------

const DOMAIN_MARKER_PREFIX = "domain:";
const IDENTITY_KEY = "identity";

/** Has this domain already synced for the current login? */
export async function hasSyncedThisLogin(domain: string): Promise<boolean> {
  await ensureCacheReady();
  const row = await appCacheDb.syncMeta.get(DOMAIN_MARKER_PREFIX + domain);
  return !!row;
}

export async function markSyncedThisLogin(domain: string): Promise<void> {
  await appCacheDb.syncMeta.put({ key: DOMAIN_MARKER_PREFIX + domain, syncedAt: Date.now() });
}

/** Drop every domain marker so the next pass re-snapshots (used by a manual resync). */
export async function clearSyncMarkers(): Promise<void> {
  await ensureCacheReady();
  const keys = await appCacheDb.syncMeta.toCollection().primaryKeys();
  const domainKeys = (keys as string[]).filter((key) => key.startsWith(DOMAIN_MARKER_PREFIX));
  if (domainKeys.length) await appCacheDb.syncMeta.bulkDelete(domainKeys);
}

/**
 * Bind the cache to one identity (user + backend instance) and WIPE it when that changes.
 *
 * Required because a stale cache can outlive a login: if the browser closes or the session expires
 * without a logout, `postLogout()` never runs and the cache survives. Without this check the next
 * login — possibly a different user or a different OMS instance — would skip syncing and read the
 * previous session's reference data. Returns true when the cache was wiped.
 */
export async function ensureCacheIdentity(identity: string): Promise<boolean> {
  await ensureCacheReady();
  const stored = await appCacheDb.syncMeta.get(IDENTITY_KEY);
  if (stored?.identity === identity) return false;
  await clearAllCaches();
  await appCacheDb.syncMeta.put({ key: IDENTITY_KEY, identity, at: Date.now() });
  return true;
}
