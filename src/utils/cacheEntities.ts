import { defineCachedEntity } from "./appCacheDb";

/**
 * Cached entity definitions — the shared contract between the worker (which writes) and views /
 * stores (which read via `live()`).
 *
 * These live outside the worker on purpose: the projection defines the row shape, so both sides
 * must agree on it. Importing this module is side-effect-free beyond opening the Dexie handle;
 * registering a *sync domain* (the fetching behavior) is separate and worker-only.
 */

/** DataManagerLog — class A (live, append-mostly). Cursor: `createdDate`. */
export const dataManagerLogCache = defineCachedEntity("dataManagerLogs", {
  keyField: "logId",
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
});

/** SystemMessage — class A (live, append-mostly). Cursor: `initDate`. */
export const systemMessageCache = defineCachedEntity("systemMessages", {
  keyField: "systemMessageId",
  fields: {
    systemMessageId: "text",
    systemMessageTypeId: "text",
    systemMessageRemoteId: "text",
    statusId: "text",
    initDate: "date",
    processedDate: "date",
    lastAttemptDate: "date",
    // ⚠️ The response does NOT carry `lastUpdatedStamp` (verified live) — it stays declared because
    // the table indexes it, but expect `undefined`. `initDate` is the usable cursor.
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
});

// --- class B: reference/config. Field sets and PKs VERIFIED live 2026-07-26 (§6.1 probe). ---

/** ServiceJob definitions. Real response also carries computed `nextExecutionDateTime`. */
export const serviceJobProjection = {
  keyField: "jobName",
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
} as const;

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
export const systemMessageRemoteProjection = {
  keyField: "systemMessageRemoteId",
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
} as const;

export const productStoreProjection = {
  keyField: "productStoreId",
  fields: {
    productStoreId: "text",
    storeName: "text",
    companyName: "text",
    inventoryFacilityId: "text",
    defaultCurrencyUomId: "text",
    // The NetSuite subsidiary id lives on the store as `externalId`, so the NetSuite mapping can
    // be derived from the cache instead of mirrored in persisted local state.
    externalId: "text",
    /**
     * Which product field Shopify identifies products by (`SHOPIFY_PRODUCT_SKU`, …).
     *
     * The product sync wizard defaults its identifier step from this. It was present in `raw` but not
     * projected, so the wizard read `undefined` off the cached row and silently fell back to its
     * recommendation instead of the store's actual setting — and the page paid an
     * `admin/productStores/{id}` request that landed in Pinia where nothing read it.
     */
    productIdentifierEnumId: "text",
    lastUpdatedStamp: "date",
  },
} as const;

export const shopifyShopProjection = {
  keyField: "shopId",
  fields: {
    shopId: "text",
    shopifyShopId: "text",
    productStoreId: "text",
    name: "text",
    myshopifyDomain: "text",
    domain: "text",
    currency: "text",
    primaryLocationId: "text",
    lastUpdatedStamp: "date",
  },
} as const;

/** Read shape is the `FacilityAndType` view — note `parentTypeId`, not `parentFacilityId`. */
export const facilityProjection = {
  keyField: "facilityId",
  fields: {
    facilityId: "text",
    facilityName: "text",
    facilityTypeId: "text",
    parentTypeId: "text",
    ownerPartyId: "text",
    typeDescription: "text",
    externalId: "text",
    // Added after the F0 probe (docs/facility-detail-plan.md): the detail endpoint
    // `oms/facilities/{id}` returns FEWER fields than this list view, so the detail page reads the
    // cached row instead of fetching. These two are what it additionally renders.
    defaultInventoryItemTypeId: "text",
    description: "text",
    lastUpdatedStamp: "date",
  },
} as const;

/** Internal organization — Party(PARTY_GROUP) + PartyGroup + INTERNAL_ORGANIZATIO PartyRole. */
export const organizationProjection = {
  keyField: "partyId",
  fields: {
    partyId: "text",
    partyTypeId: "text",
    groupName: "text",
    externalId: "text",
    statusId: "text",
    roleTypeId: "text",
    lastUpdatedStamp: "date",
  },
} as const;

/**
 * Parent → child internal-organization edge.
 *
 * PartyRelationship has a date-effective composite key, so the cache uses a stable synthetic key.
 */
export const organizationRelationshipProjection = {
  keyField: "relationshipKey",
  fields: {
    relationshipKey: "text",
    partyIdFrom: "text",
    partyIdTo: "text",
    roleTypeIdFrom: "text",
    roleTypeIdTo: "text",
    partyRelationshipTypeId: "text",
    fromDate: "date",
    thruDate: "date",
    statusId: "text",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if(!raw?.partyIdFrom || !raw?.partyIdTo) {return undefined;}

    return [
      raw.partyIdFrom,
      raw.partyIdTo,
      raw.roleTypeIdFrom,
      raw.roleTypeIdTo,
      raw.partyRelationshipTypeId,
      raw.fromDate ?? "",
    ].join("|");
  },
} as const;

export const facilityGroupProjection = {
  keyField: "facilityGroupId",
  fields: {
    facilityGroupId: "text",
    facilityGroupName: "text",
    facilityGroupTypeId: "text",
    lastUpdatedStamp: "date",
  },
} as const;

/**
 * FacilityGroupAndMember — date-effective association with a COMPOSITE natural key
 * (facilityGroupId + facilityId + fromDate), so the cache stores a synthetic `memberKey`.
 */
export const groupFacilityProjection = {
  keyField: "memberKey",
  fields: {
    memberKey: "text",
    facilityGroupId: "text",
    facilityId: "text",
    facilityName: "text",
    facilityGroupName: "text",
    facilityTypeId: "text",
    fromDate: "date",
    thruDate: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    const group = raw?.facilityGroupId;
    const facility = raw?.facilityId;
    if (!group || !facility) return undefined;
    return `${group}|${facility}|${raw?.fromDate ?? ""}`;
  },
} as const;

/** UserPermission master catalog. PK is `userPermissionId` (not `permissionId`). */
export const permissionProjection = {
  keyField: "userPermissionId",
  fields: { userPermissionId: "text", description: "text", lastUpdatedStamp: "date" },
} as const;

export const integrationTypeMappingProjection = {
  keyField: "integrationMappingId",
  fields: {
    integrationMappingId: "text",
    integrationTypeId: "text",
    mappingKey: "text",
    mappingValue: "text",
    lastUpdatedStamp: "date",
  },
} as const;

export const serviceJobCache = defineCachedEntity("serviceJobs", serviceJobProjection);
export const systemMessageRemoteCache = defineCachedEntity("systemMessageRemotes", systemMessageRemoteProjection);
/**
 * SyncRun — one row of `SYSTEM_MESSAGE_DATA_MANAGER_LOG`, used as a shop-scoped CURSOR.
 *
 * Deliberately thin: this records WHICH runs a shop has and which import each became. Detail lives in
 * `systemMessages` and `dataManagerLogs`, enriched by id — see the schema note on `syncRuns`.
 *
 * The document is a SPARSE projection: log-side fields are simply absent on a run that never imported
 * (verified live — M227136 carries `logId`/`totalRecordCount`, M228375 carries neither). `logId`
 * being absent IS the meaning of "consumed but imported nothing", so it must not coerce to 0 or "".
 */
export const syncRunProjection = {
  keyField: "systemMessageId",
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
  /** Keyed by the CACHED name, valued by the SOURCE field — the direction `projectRow` looks up. */
  rename: { shopId: "remoteInternalId" },
} as const;

export const productStoreCache = defineCachedEntity("productStores", productStoreProjection);
export const syncRunCache = defineCachedEntity("syncRuns", syncRunProjection);
export const shopifyShopCache = defineCachedEntity("shopifyShops", shopifyShopProjection);
export const facilityCache = defineCachedEntity("facilities", facilityProjection);
export const organizationCache = defineCachedEntity("organizations", organizationProjection);
export const organizationRelationshipCache = defineCachedEntity(
  "organizationRelationships",
  organizationRelationshipProjection,
);
export const facilityGroupCache = defineCachedEntity("facilityGroups", facilityGroupProjection);
export const groupFacilityCache = defineCachedEntity("groupFacilities", groupFacilityProjection);
export const permissionCache = defineCachedEntity("permissions", permissionProjection);
export const integrationTypeMappingCache = defineCachedEntity("integrationTypeMappings", integrationTypeMappingProjection);

// --- Tier 2: lookup / type reference. All bare-array endpoints; PKs verified live 2026-07-26. ---

const lookup = (keyField: string, extra: Record<string, "text" | "count" | "date"> = {}) => ({
  keyField,
  fields: { [keyField]: "text" as const, description: "text" as const, ...extra },
});

export const statusProjection = lookup("statusId", { statusTypeId: "text" });
/**
 * Every enumeration in the system, in ONE table.
 *
 * `admin/enums` is the `EnumerationAndType` view, which does `<alias-all>` over Enumeration —
 * so `enumTypeId` is present on every row and the table can be sliced by type client-side.
 * (An earlier note claiming the field only appears when the request filters on it was wrong: it
 * came from inspecting a single row, and Moqui strips null fields per row.)
 */
export const enumProjection = {
  keyField: "enumId",
  fields: {
    enumId: "text", enumTypeId: "text", enumCode: "text",
    description: "text", typeDescription: "text", sequenceNum: "count",
  },
} as const;

/** The enumeration type catalog (`moqui.basic.EnumerationType`). */
export const enumTypeProjection = {
  keyField: "enumTypeId",
  fields: { enumTypeId: "text", parentTypeId: "text", description: "text" },
} as const;
export const facilityTypeProjection = lookup("facilityTypeId", { parentTypeId: "text" });
/** PK UNVERIFIED — `oms/facilityGroups/types` returns an empty 200 on this instance. */
export const facilityGroupTypeProjection = lookup("facilityGroupTypeId");
export const userGroupProjection = lookup("userGroupId", { groupTypeEnumId: "text" });
export const productTypeProjection = lookup("productTypeId", { parentTypeId: "text" });
export const shipmentMethodTypeProjection = lookup("shipmentMethodTypeId", { sequenceNum: "count" });
export const paymentMethodTypeProjection = lookup("paymentMethodTypeId", { paymentMethodCode: "text" });
export const roleTypeProjection = lookup("roleTypeId", { parentTypeId: "text" });
/** Currencies are UOMs of type UT_CURRENCY_MEASURE; the picker shows description + abbreviation. */
export const currencyProjection = lookup("uomId", { abbreviation: "text", uomTypeEnumId: "text" });

export const statusCache = defineCachedEntity("statuses", statusProjection);
export const enumCache = defineCachedEntity("enums", enumProjection);
export const facilityTypeCache = defineCachedEntity("facilityTypes", facilityTypeProjection);
export const facilityGroupTypeCache = defineCachedEntity("facilityGroupTypes", facilityGroupTypeProjection);
export const userGroupCache = defineCachedEntity("userGroups", userGroupProjection);
export const productTypeCache = defineCachedEntity("productTypes", productTypeProjection);
export const shipmentMethodTypeCache = defineCachedEntity("shipmentMethodTypes", shipmentMethodTypeProjection);
export const currencyCache = defineCachedEntity("currencies", currencyProjection);
export const paymentMethodTypeCache = defineCachedEntity("paymentMethodTypes", paymentMethodTypeProjection);
export const roleTypeCache = defineCachedEntity("roleTypes", roleTypeProjection);

// --- Tier 3: shop-scoped. Fetched UNSCOPED as one snapshot (verified: returns every shop and
// every mappedTypeId), then read per shop via live({ scope: { field: "shopId", value } }).
// Both have composite natural keys, so they carry a synthetic PK. ---

export const shopifyLocationProjection = {
  keyField: "locationKey",
  fields: {
    locationKey: "text",
    shopId: "text",
    facilityId: "text",
    shopifyLocationId: "text",
    lastUpdatedStamp: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.shopId || !raw?.shopifyLocationId) return undefined;
    return `${raw.shopId}|${raw.shopifyLocationId}`;
  },
} as const;

/**
 * InventoryChannel — one facility-group ATP pool mapped to one Shopify aggregate location.
 * This is the missing ownership link between an aggregate reset ServiceJob parameter and a shop.
 */
export const inventoryChannelProjection = {
  keyField: "inventoryChannelId",
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
} as const;

/**
 * DataFeed — an OMS-wide routing switch for entity-feed delivery.
 *
 * The Shopify aggregate inventory documents currently share one DataFeed, so this record is
 * deliberately not shop-scoped. Every Shopify connection reads the same cached server value.
 */
export const dataFeedProjection = {
  keyField: "dataFeedId",
  fields: {
    dataFeedId: "text",
    dataFeedTypeEnumId: "text",
    feedName: "text",
    feedReceiveServiceName: "text",
    feedDeleteServiceName: "text",
    lastFeedStamp: "date",
    lastUpdatedStamp: "date",
  },
} as const;

/**
 * ShopifyInventoryAdjustmentDetail — the write-ahead event ledger behind aggregate inventory.
 * Mirrors the server entity, whose PK is eventKey + inventoryChannelId + shopifyInventoryItemId;
 * `adjustmentKey` is the synthetic cache key for that so fan-out rows never overwrite each other.
 *
 * Deliberately absent, because the server row does not carry them:
 *  - shopId / shopifyLocationId — the channel IS the target identity (it maps a facility group to
 *    exactly one shop and one Shopify location). Scope by channel, resolve the shop through
 *    `inventoryChannels`.
 *  - productId / shopifyProductId / internalName — a detail row identifies a Shopify inventory item
 *    at a channel and carries no OMS product. Consumers needing a product join ShopifyShopProduct
 *    on shopId + shopifyInventoryItemId.
 */
export const shopifyInventoryAdjustmentDetailProjection = {
  keyField: "adjustmentKey",
  fields: {
    adjustmentKey: "text",
    eventKey: "text",
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
    systemMessageStatusId: "text",
    systemMessageInitDate: "date",
    systemMessageProcessedDate: "date",
    systemMessageLastAttemptDate: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    const identity = [
      raw?.eventKey,
      raw?.inventoryChannelId,
      raw?.shopifyInventoryItemId,
    ];
    if (identity.some((value) => value === undefined || value === null || value === "")) return undefined;
    return JSON.stringify(identity.map(String));
  },
} as const;

export const shopifyTypeMappingProjection = {
  keyField: "typeMappingKey",
  fields: {
    typeMappingKey: "text",
    shopId: "text",
    mappedTypeId: "text",
    mappedKey: "text",
    mappedValue: "text",
    lastUpdatedStamp: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.shopId || !raw?.mappedTypeId) return undefined;
    return `${raw.shopId}|${raw.mappedTypeId}|${raw.mappedKey ?? ""}`;
  },
} as const;

/**
 * DataDocument ⋈ its feed — which OMS changes an inventory event feed listens to.
 *
 * One row per (document, feed). `DataDocumentAndFeed` left-joins, so a document attached to nothing
 * arrives with NO dataFeedId at all, and a document on two feeds arrives twice; neither is an error
 * and both have to survive into the cache. Hence the composite key, with an empty second half
 * standing for "attached to nothing" - a key built from dataDocumentId alone would collapse the two
 * feed rows onto each other, and returning undefined for the unattached case would drop exactly the
 * row the screen exists to show.
 */
export const inventoryEventDocumentProjection = {
  keyField: "documentFeedKey",
  fields: {
    documentFeedKey: "text",
    dataDocumentId: "text",
    dataFeedId: "text",
    documentName: "text",
    primaryEntityName: "text",
  },
  buildKey: (raw: Record<string, unknown>) => {
    const dataDocumentId = raw?.dataDocumentId;
    if (!dataDocumentId) return undefined;
    return `${String(dataDocumentId)}|${raw?.dataFeedId ? String(raw.dataFeedId) : ""}`;
  },
} as const;

export const inventoryEventDocumentCache =
  defineCachedEntity("inventoryEventDocuments", inventoryEventDocumentProjection);
export const shopifyLocationCache = defineCachedEntity("shopifyLocations", shopifyLocationProjection);
export const shopifyTypeMappingCache = defineCachedEntity("shopifyTypeMappings", shopifyTypeMappingProjection);
export const dataFeedCache = defineCachedEntity("dataFeeds", dataFeedProjection);
export const inventoryChannelCache = defineCachedEntity("inventoryChannels", inventoryChannelProjection);
export const shopifyInventoryAdjustmentDetailCache = defineCachedEntity(
  "shopifyInventoryAdjustmentDetails",
  shopifyInventoryAdjustmentDetailProjection,
);

/** Per-product-store shipment-method count (bare-array aggregate endpoint). */
export const productStoreShipmentCountProjection = {
  keyField: "productStoreId",
  fields: { productStoreId: "text", shipmentMethodCount: "count" },
} as const;

export const productStoreShipmentCountCache = defineCachedEntity(
  "productStoreShipmentCounts",
  productStoreShipmentCountProjection,
);

/** Shopify carrier → shipment-method mappings. Composite key (shop + carrier + method). */
export const shopifyCarrierShipmentProjection = {
  keyField: "carrierShipmentKey",
  fields: {
    carrierShipmentKey: "text", shopId: "text", carrierPartyId: "text",
    shipmentMethodTypeId: "text", shopifyShippingMethod: "text", lastUpdatedStamp: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.shopId) return undefined;
    return `${raw.shopId}|${raw.carrierPartyId ?? ""}|${raw.shipmentMethodTypeId ?? ""}`;
  },
} as const;

/** Product-store shipping methods (per store; PK is a real single field). */
export const productStoreShippingMethodProjection = {
  keyField: "productStoreShipMethId",
  fields: {
    productStoreShipMethId: "text", productStoreId: "text", shipmentMethodTypeId: "text",
    partyId: "text", roleTypeId: "text", description: "text", isTrackingRequired: "text",
    fromDate: "date",
  },
} as const;


export const shopifyCarrierShipmentCache = defineCachedEntity("shopifyCarrierShipments", shopifyCarrierShipmentProjection);
export const productStoreShippingMethodCache = defineCachedEntity("productStoreShippingMethods", productStoreShippingMethodProjection);

/** EnumerationGroupMember rows for a NetSuite reason group. PK UNVERIFIED (empty on this instance). */
export const enumGroupMemberProjection = {
  keyField: "enumGroupMemberKey",
  fields: {
    enumGroupMemberKey: "text", enumerationGroupId: "text", enumId: "text",
    description: "text", fromDate: "date", thruDate: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.enumId) return undefined;
    return `${raw.enumerationGroupId ?? "NETSUITE_IIV_REASON"}|${raw.enumId}`;
  },
} as const;

/** FacilityIdentification rows (NetSuite department mapping). PK UNVERIFIED (empty on this instance). */
export const facilityIdentificationProjection = {
  keyField: "facilityIdentificationKey",
  fields: {
    facilityIdentificationKey: "text", facilityId: "text", facilityIdenTypeId: "text",
    idValue: "text", description: "text",
  },
  buildKey: (raw: Record<string, unknown>) => {
    // Both parts are required. This used to default a missing type to "ORDR_ORGN_DPT", which was
    // survivable while only that type was cached — now that every type is, defaulting would make
    // two different identifications on one facility collide and silently overwrite each other.
    // Returning undefined drops the row loudly instead (see `isUnkeyableFetch`).
    if (!raw?.facilityId || !raw?.facilityIdenTypeId) return undefined;
    return `${raw.facilityId}|${raw.facilityIdenTypeId}`;
  },
} as const;

export const enumGroupMemberCache = defineCachedEntity("enumGroupMembers", enumGroupMemberProjection);
export const facilityIdentificationCache = defineCachedEntity("facilityIdentifications", facilityIdentificationProjection);

/**
 * The product store whose shipping methods are cached.
 *
 * HARDCODED for now by explicit decision: the NetSuite/Shopify shipment-method screens read one
 * store's methods, and the id was previously resolved from store state (which produced a request
 * for `admin/productStores/undefined/shippingMethods`). Replace with a fan-out over cached product
 * stores when those screens need to cover more than one store.
 */
export const PRODUCT_STORE_ID_FOR_SHIPPING_METHODS = "STORE";

/** Geo reference straight from Moqui (`moqui.basic.Geo`) — countries, states, regions. */
export const geoProjection = {
  keyField: "geoId",
  fields: {
    geoId: "text", geoTypeEnumId: "text", geoName: "text",
    geoCode: "text", geoCodeAlpha3: "text", wellKnownText: "text",
  },
} as const;

/** Geo associations (`moqui.basic.GeoAssoc`) — e.g. which states belong to which country. */
export const geoAssocProjection = {
  keyField: "geoAssocKey",
  fields: {
    geoAssocKey: "text", geoId: "text", toGeoId: "text", geoAssocTypeEnumId: "text",
  },
  // The server field is `toGeoId` (verified live). An earlier `geoIdTo` guess made buildKey
  // return undefined for every row, so all 1225 associations were silently dropped.
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.geoId || !raw?.toGeoId) return undefined;
    return `${raw.geoId}|${raw.toGeoId}`;
  },
} as const;

/**
 * Facility ↔ product store associations (`ProductStoreFacilityDetail`).
 *
 * No global endpoint exists — only `oms/productStores/{id}/facilities` — so this is built by
 * fanning out over the (already cached, few) product stores at app load. Cached because the
 * facility list will filter by product store.
 */
export const productStoreFacilityProjection = {
  keyField: "storeFacilityKey",
  fields: {
    storeFacilityKey: "text", productStoreId: "text", facilityId: "text",
    facilityName: "text", facilityTypeId: "text", sequenceNum: "count", fromDate: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.productStoreId || !raw?.facilityId) return undefined;
    return `${raw.productStoreId}|${raw.facilityId}`;
  },
} as const;

export const enumTypeCache = defineCachedEntity("enumTypes", enumTypeProjection);
export const geoCache = defineCachedEntity("geos", geoProjection);
export const geoAssocCache = defineCachedEntity("geoAssocs", geoAssocProjection);
export const productStoreFacilityCache = defineCachedEntity("productStoreFacilities", productStoreFacilityProjection);

/** SystemMessageType seed data — the type catalog every sync screen labels messages with. */
export const systemMessageTypeProjection = {
  keyField: "systemMessageTypeId",
  fields: {
    systemMessageTypeId: "text",
    description: "text",
    parentTypeId: "text",
    lastUpdatedStamp: "date",
  },
} as const;

/**
 * A Shopify bulk operation, keyed by its GraphQL node id.
 *
 * Terminal operations (COMPLETED / FAILED / CANCELED) never change again, so once cached they can
 * be read without touching Shopify. Only RUNNING/CREATED ones need re-fetching.
 */
export const shopifyBulkOperationProjection = {
  keyField: "id",
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
} as const;

/**
 * SystemMessageError (`moqui.service.message.SystemMessageError`) — why a message failed.
 *
 * Composite entity PK (systemMessageId + errorDate), so rows carry a synthetic `errorKey`. Class C:
 * fetched on demand when a run is inspected, never polled — errors only exist for failed messages
 * and the list view never shows them.
 */
export const systemMessageErrorProjection = {
  keyField: "errorKey",
  fields: {
    errorKey: "text",
    systemMessageId: "text",
    errorDate: "date",
    attemptedStatusId: "text",
    errorText: "text",
  },
  buildKey: (raw: Record<string, unknown>) => {
    const message = raw?.systemMessageId;
    if (!message) return undefined;
    return `${message}|${raw?.errorDate ?? ""}`;
  },
} as const;

/**
 * ProductUpdateHistory — what a sync actually changed, per product.
 *
 * Composite entity PK (productId + shopId) → synthetic `updateKey`. `systemMessageId` links a
 * product change back to the run that made it, which is how the run view answers "what did this
 * sync touch". The heavy JSON columns (`differenceMap`, `features`, `tags`, `identifications`,
 * `assocs`) are kept because the history view renders diffs from them — see the bounded-window note
 * on the table in appCacheDb.ts.
 */
export const productUpdateHistoryProjection = {
  keyField: "updateKey",
  fields: {
    updateKey: "text",
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
  buildKey: (raw: Record<string, unknown>) => {
    const product = raw?.productId;
    const shop = raw?.shopId;
    if (!product || !shop) return undefined;
    return `${shop}|${product}`;
  },
} as const;

/**
 * ServiceJobRun (`moqui.service.job.ServiceJobRun`) — one execution of a scheduled job.
 *
 * Heavy columns are deliberately dropped: `results` (text-very-long), `parameters`, `messages` and
 * the host/thread diagnostics. The sync screens only ask "did the last run succeed, and when" —
 * `hasError` plus the timestamps answer that, and `errors` carries the reason when it did not.
 */
export const serviceJobRunProjection = {
  keyField: "jobRunId",
  fields: {
    jobRunId: "text",
    jobName: "text",
    hasError: "text",
    errors: "text",
    startTime: "date",
    endTime: "date",
  },
} as const;

export const serviceJobRunCache = defineCachedEntity("serviceJobRuns", serviceJobRunProjection);

export const systemMessageErrorCache = defineCachedEntity("systemMessageErrors", systemMessageErrorProjection);
export const productUpdateHistoryCache = defineCachedEntity("productUpdateHistories", productUpdateHistoryProjection);

export const systemMessageTypeCache = defineCachedEntity("systemMessageTypes", systemMessageTypeProjection);
export const shopifyBulkOperationCache = defineCachedEntity("shopifyBulkOperations", shopifyBulkOperationProjection);

/**
 * Facility group ↔ product store (`co.hotwax.facility.ProductStoreFacilityGroup`).
 *
 * Global list at `oms/groupProductStores` — one call, no fan-out. Date-effective with a composite
 * natural key (productStoreId + facilityGroupId + fromDate), so it carries a synthetic PK.
 */
export const facilityGroupProductStoreProjection = {
  keyField: "facilityGroupProductStoreKey",
  fields: {
    facilityGroupProductStoreKey: "text", facilityGroupId: "text", productStoreId: "text",
    sequenceNumber: "count", fromDate: "date", thruDate: "date",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.facilityGroupId || !raw?.productStoreId) return undefined;
    return `${raw.facilityGroupId}|${raw.productStoreId}|${raw.fromDate ?? ""}`;
  },
} as const;

export const facilityGroupProductStoreCache = defineCachedEntity("facilityGroupProductStores", facilityGroupProductStoreProjection);

/**
 * App registry (`admin/apps`) — the catalog of apps that can be version-pinned. Read-only reference
 * data: the version screen labels rows with it and the create modal offers app + environment combos
 * that do not yet have a pin.
 */
export const appProjection = {
  keyField: "appId",
  fields: {
    appId: "text",
    appName: "text",
  },
} as const;

/**
 * App version pin (`admin/appVersion`) — which build of each app is served per environment.
 *
 * The natural key is COMPOSITE (appId + environmentTypeId), so rows carry a synthetic `appVersionKey`.
 * `appName` and `enumDesc` (the environment description) come joined on the list response, so they
 * are projected here rather than looked up — the screen renders straight from the cached row.
 */
export const appVersionProjection = {
  keyField: "appVersionKey",
  fields: {
    appVersionKey: "text",
    appId: "text",
    appName: "text",
    environmentTypeId: "text",
    currentVersion: "text",
    enumDesc: "text",
  },
  buildKey: (raw: Record<string, unknown>) => {
    if (!raw?.appId || !raw?.environmentTypeId) return undefined;
    return `${raw.appId}|${raw.environmentTypeId}`;
  },
} as const;

export const appCache = defineCachedEntity("apps", appProjection);
export const appVersionCache = defineCachedEntity("appVersions", appVersionProjection);
