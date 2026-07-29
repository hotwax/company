import {
  carrierFacilityProjection,
  carrierProjection,
  carrierShipmentMethodProjection,
  enumProjection,
  facilityTypeProjection,
  paymentMethodTypeProjection,
  productTypeProjection,
  roleTypeProjection,
  shipmentMethodTypeProjection,
  shopifyLocationProjection,
  shopifyTypeMappingProjection,
  productStoreShipmentCountProjection,
  productStoreShippingMethodProjection,
  shopifyCarrierShipmentProjection,
  enumTypeProjection,
  geoProjection,
  geoAssocProjection,
  productStoreFacilityProjection,
  facilityGroupProductStoreProjection,
  enumGroupMemberProjection,
  facilityIdentificationProjection,
  systemMessageTypeProjection,
  appProjection,
  appVersionProjection,
  PRODUCT_STORE_ID_FOR_SHIPPING_METHODS,
  statusProjection,
  userGroupProjection,
  facilityGroupProjection,
  facilityProjection,
  groupFacilityProjection,
  integrationTypeMappingProjection,
  organizationRelationshipProjection,
  permissionProjection,
  productStoreProjection,
  currencyProjection,
  inventoryEventDocumentProjection,
  serviceJobProjection,
  shopifyShopProjection,
  systemMessageRemoteProjection,
} from "@/utils/cacheEntities";
import { registerSnapshotDomain } from "./snapshotDomain";

registerSnapshotDomain({
  name: "organizationRelationship",
  table: "organizationRelationships",
  projection: organizationRelationshipProjection,
  listUrl: "oms/partyRelationships",
  collectionKey: null,
  listParams: {
    roleTypeIdFrom: "INTERNAL_ORGANIZATIO",
    roleTypeIdTo: "INTERNAL_ORGANIZATIO",
    partyRelationshipTypeId: "SUB_DIVISION",
  },
  refetchScope: (pk) => ({
    params: { partyIdTo: pk.partyIdTo },
    scope: { field: "partyIdTo", value: pk.partyIdTo },
  }),
});

/**
 * Class-B (reference/config) sync domains — registration is pure configuration; the snapshot +
 * prune + refetch-by-PK behavior lives in `snapshotDomain.ts`.
 *
 * These have NO cadence: the harness runs each once when activated (app load, per decision D2)
 * and thereafter only when a mutation triggers `refetchOne`.
 *
 * Every endpoint, envelope key, and PK below was VERIFIED live on 2026-07-26 — note that the
 * envelope convention differs per endpoint (bare array vs `{ <name>List }`), which is why
 * `collectionKey` is explicit rather than inferred.
 */

registerSnapshotDomain({
  name: "serviceJob",
  table: "serviceJobs",
  projection: serviceJobProjection,
  listUrl: "admin/serviceJobs",
  collectionKey: "serviceJobList",
  byPk: (pk) => ({ url: `admin/serviceJobs/${encodeURIComponent(String(pk.jobName))}` }),
  /**
   * The by-PK route wraps the job in `jobDetail` (the LIST route uses `serviceJobList`). Without
   * this the refresh stored the envelope, whose `jobName` is undefined, so the row was silently
   * dropped: EVERY serviceJob write-through — configure, schedule save, pause/resume, product-sync
   * setup — left the cache stale until the next login. Verified live: creating
   * `queue_ShopifyOrderSync_99992` left the cache at its pre-write 156 rows.
   */
  byPkRecordKey: "jobDetail",
});

registerSnapshotDomain({
  name: "inventoryEventDocument",
  table: "inventoryEventDocuments",
  projection: inventoryEventDocumentProjection,
  listUrl: "admin/dataDocuments",
  collectionKey: "dataDocuments",
  /**
   * `queryString` bounds the response, it does not define the set - the screen decides that from the
   * documents this feature ships. Without it this would snapshot every DataDocument on the OMS to
   * answer a question about ten of them.
   */
  listParams: { queryString: "Shopify", pageSize: 200 },
  /**
   * Scoped re-list, not `byPk`: there is no by-id route, and the cache row is (document, feed) while
   * a mutation only knows the document. Re-listing that one document and pruning its slice is what
   * makes attach/detach correct - the row for the feed it just left has to disappear, and a plain
   * upsert would leave it behind.
   */
  refetchScope: (pk) => ({
    params: { queryString: pk.dataDocumentId },
    scope: { field: "dataDocumentId", value: pk.dataDocumentId },
  }),
});

registerSnapshotDomain({
  name: "systemMessageRemote",
  table: "systemMessageRemotes",
  projection: systemMessageRemoteProjection,
  listUrl: "oms/systemMessageRemotes",
  collectionKey: "systemMessageRemoteList",
  /**
   * Scoped re-list, NOT `byPk`: `GET oms/systemMessageRemotes/{id}` does not exist — it answers 405
   * `Method get not supported` for every id, including ones that resolve fine through the list
   * (probed live 2026-07-27). The by-PK route was configured anyway, so every
   * `refreshAfterMutation("systemMessageRemote", …)` failed inside the worker and returned 0: a
   * newly created Shopify connection's remote stayed absent from the cache until the next login, and
   * the sync screens reported "Shopify remote: Unavailable" for a shop whose remote existed on the
   * server. Found by QA setting a shop up from scratch.
   *
   * The list route DOES filter by id, so re-listing that one id and snapshot-replacing its scope
   * gives the same one-row refresh (and still prunes the row if the server no longer returns it).
   */
  refetchScope: (pk) => ({
    params: { systemMessageRemoteId: pk.systemMessageRemoteId },
    scope: { field: "systemMessageRemoteId", value: pk.systemMessageRemoteId },
  }),
});

registerSnapshotDomain({
  name: "productStore",
  table: "productStores",
  projection: productStoreProjection,
  listUrl: "admin/productStores",
  collectionKey: null, // bare array
  byPk: (pk) => ({ url: `admin/productStores/${encodeURIComponent(String(pk.productStoreId))}` }),
});

registerSnapshotDomain({
  name: "carrier",
  table: "carriers",
  projection: carrierProjection,
  listUrl: "oms/shippingGateways/carrierParties",
  collectionKey: null,
  strictCollection: true,
  listParams: { partyTypeId: "PARTY_GROUP", roleTypeId: "CARRIER" },
  refetchScope: (pk) => ({
    params: { partyId: pk.partyId },
    scope: { field: "partyId", value: pk.partyId },
  }),
});

registerSnapshotDomain({
  name: "carrierShipmentMethod",
  table: "carrierShipmentMethods",
  projection: carrierShipmentMethodProjection,
  listUrl: "oms/shippingGateways/carrierShipmentMethods",
  collectionKey: null,
  strictCollection: true,
  listParams: { roleTypeId: "CARRIER" },
  refetchScope: (pk) => ({
    params: { partyId: pk.partyId },
    scope: { field: "partyId", value: pk.partyId },
  }),
});

/**
 * Carrier ↔ facility associations have no global list. Build the snapshot by walking the cached
 * carrier ids, and use the same parent scope for post-mutation refetch/prune.
 */
registerSnapshotDomain({
  name: "carrierFacility",
  table: "carrierFacilities",
  projection: carrierFacilityProjection,
  listUrl: "oms/shippingGateways/carrierParties",
  collectionKey: null,
  strictCollection: true,
  fanOut: {
    parentTable: "carriers",
    parentKeyField: "partyId",
    urlFor: (partyId) =>
      `oms/shippingGateways/carrierParties/${encodeURIComponent(partyId)}/facilities`,
  },
});

registerSnapshotDomain({
  name: "shopifyShop",
  table: "shopifyShops",
  projection: shopifyShopProjection,
  listUrl: "oms/shopifyShops/shops",
  collectionKey: null, // bare array
  /**
   * By-PK re-read on `shopId`. `oms/shopifyShops/shops/{shopId}` is a real route (GET → ShopifyShop
   * `one`), so a single shop refresh costs one request.
   *
   * This replaced a `refetchScope` keyed on `productStoreId`: every caller refreshes after changing
   * ONE shop and so passes `{ shopId }`, which made `pk.productStoreId` undefined — the request
   * dropped the param and re-listed every shop, then snapshot-replaced under the scope
   * `productStoreId: undefined`. Keying on what callers actually pass removes that mismatch.
   */
  byPk: (pk) => ({ url: `oms/shopifyShops/shops/${encodeURIComponent(String(pk.shopId))}` }),
});

registerSnapshotDomain({
  name: "facility",
  table: "facilities",
  projection: facilityProjection,
  listUrl: "oms/facilities",
  collectionKey: null, // bare array (view entity FacilityAndType)
  byPk: (pk) => ({ url: `oms/facilities/${encodeURIComponent(String(pk.facilityId))}` }),
});

registerSnapshotDomain({
  name: "facilityGroup",
  table: "facilityGroups",
  projection: facilityGroupProjection,
  listUrl: "oms/facilityGroups",
  collectionKey: null, // bare array
  // No id-level GET in use — re-list and snapshot the whole (small) set.
  refetchScope: () => ({ params: {} }),
});

registerSnapshotDomain({
  name: "facilityGroupMember",
  table: "groupFacilities",
  projection: groupFacilityProjection,
  listUrl: "oms/groupFacilities",
  collectionKey: null, // bare array (view entity FacilityGroupAndMember)
  // Composite key + no by-PK route: re-list one group and snapshot just that scope, so a
  // member removed from the group is pruned rather than left behind.
  refetchScope: (pk) => ({
    params: { facilityGroupId: pk.facilityGroupId },
    scope: { field: "facilityGroupId", value: pk.facilityGroupId },
  }),
});

registerSnapshotDomain({
  name: "permission",
  table: "permissions",
  projection: permissionProjection,
  listUrl: "admin/userPermissions",
  collectionKey: null, // bare array
  listParams: { orderByField: "userPermissionId" },
});

registerSnapshotDomain({
  name: "integrationTypeMapping",
  table: "integrationTypeMappings",
  projection: integrationTypeMappingProjection,
  listUrl: "admin/integrationTypeMappings",
  collectionKey: null, // bare array
  byPk: (pk) => ({
    url: `admin/integrationTypeMappings/${encodeURIComponent(String(pk.integrationMappingId))}`,
  }),
});

// --- Tier 2: lookup / type reference domains. Small, bounded, bare-array endpoints. ---

const LOOKUPS: Array<{ name: string; table: any; projection: any; listUrl: string; listParams?: Record<string, unknown> }> = [
  { name: "status", table: "statuses", projection: statusProjection, listUrl: "oms/statuses" },
  { name: "enum", table: "enums", projection: enumProjection, listUrl: "admin/enums" },
  { name: "facilityType", table: "facilityTypes", projection: facilityTypeProjection, listUrl: "oms/facilityTypes" },
  { name: "userGroup", table: "userGroups", projection: userGroupProjection, listUrl: "admin/userGroups" },
  { name: "productType", table: "productTypes", projection: productTypeProjection, listUrl: "oms/products/productTypes" },
  { name: "shipmentMethodType", table: "shipmentMethodTypes", projection: shipmentMethodTypeProjection, listUrl: "oms/shippingGateways/shipmentMethodTypes" },
  // `admin/uoms` covers every unit of measure; only the currency ones are wanted here.
  { name: "currency", table: "currencies", projection: currencyProjection, listUrl: "admin/uoms", listParams: { uomTypeEnumId: "UT_CURRENCY_MEASURE" } },
  { name: "paymentMethodType", table: "paymentMethodTypes", projection: paymentMethodTypeProjection, listUrl: "oms/paymentMethodTypes" },
  { name: "roleType", table: "roleTypes", projection: roleTypeProjection, listUrl: "oms/roleTypes" },
  { name: "systemMessageType", table: "systemMessageTypes", projection: systemMessageTypeProjection, listUrl: "admin/systemMessages/types" },
];

for (const lookup of LOOKUPS) {
  registerSnapshotDomain({
    name: lookup.name,
    table: lookup.table,
    projection: lookup.projection,
    listUrl: lookup.listUrl,
    listParams: lookup.listParams,
    collectionKey: null, // bare array
  });
}

// --- Tier 3: shop-scoped tables, fetched unscoped as ONE snapshot (verified: the endpoints
// return every shop and every mappedTypeId). Pages read their slice with a `shopId` scope, so a
// single table serves all four Shopify mapping pages. ---

registerSnapshotDomain({
  name: "shopifyLocation",
  table: "shopifyLocations",
  projection: shopifyLocationProjection,
  listUrl: "oms/shopifyShops/locations",
  collectionKey: null,
  // A mutation affects one shop, so re-list just that shop and prune within it.
  refetchScope: (pk) => ({
    params: { shopId: pk.shopId },
    scope: { field: "shopId", value: pk.shopId },
  }),
});

registerSnapshotDomain({
  name: "shopifyTypeMapping",
  table: "shopifyTypeMappings",
  projection: shopifyTypeMappingProjection,
  listUrl: "oms/shopifyShops/typeMappings",
  collectionKey: null,
  /**
   * Re-list EVERY mapping type for the shop, not just the one that changed.
   *
   * ⚠️ Do not add `mappedTypeId` to `params`. `snapshotReplace` prunes everything inside `scope`
   * and re-inserts what was fetched, and the scope can only be `shopId` (it is a single field), so
   * narrowing the fetch to one type deletes the shop's OTHER types from the cache. That was a live
   * bug: editing product types for shop 10000 dropped its payment-type, order-source, payment-term
   * and weight-unit rows — 45 cached rows fell to 28 — leaving those cache-backed pages blank until
   * the next login sync (verified 2026-07-27).
   *
   * Fetching all types for one shop is a single small request, so matching the fetch to the scope
   * costs nothing.
   */
  refetchScope: (pk) => ({
    params: { shopId: pk.shopId },
    scope: { field: "shopId", value: pk.shopId },
  }),
});

registerSnapshotDomain({
  name: "productStoreShipmentCount",
  table: "productStoreShipmentCounts",
  projection: productStoreShipmentCountProjection,
  listUrl: "oms/productStores/shipmentMethods/counts",
  collectionKey: null, // bare array
});

registerSnapshotDomain({
  name: "shopifyCarrierShipment",
  table: "shopifyCarrierShipments",
  projection: shopifyCarrierShipmentProjection,
  listUrl: "oms/shopifyShops/carrierShipments",
  collectionKey: null, // bare array
  refetchScope: (pk) => ({
    params: { shopId: pk.shopId },
    scope: { field: "shopId", value: pk.shopId },
  }),
});


// NetSuite reference sets: the reason group it maps variances to, and the facility identifications
// it uses as departments. Both are filtered server-side to the single id the app cares about.
registerSnapshotDomain({
  name: "enumGroupMember",
  table: "enumGroupMembers",
  projection: enumGroupMemberProjection,
  listUrl: "admin/enumGroups/NETSUITE_IIV_REASON/members",
  collectionKey: null,
  listParams: { enumerationGroupId: "NETSUITE_IIV_REASON" },
});

/**
 * Every facility's identifications, ALL types — the detail page lists them and the find page will
 * search them. Deliberately unfiltered: a `facilityIdenTypeId: "ORDR_ORGN_DPT"` filter used to sit
 * here (copied from the Departments page, which legitimately wants only that type) and silently
 * reduced this to 0 rows on an instance with no ERP department codes, blanking the detail page's
 * identification cards.
 */
registerSnapshotDomain({
  name: "facilityIdentification",
  table: "facilityIdentifications",
  projection: facilityIdentificationProjection,
  listUrl: "oms/facilities/identifications",
  collectionKey: null,
});

// Shipping methods configured on every cached product store. The response does not reliably echo
// productStoreId, so the generic fan-out contract stamps the parent scope onto every child row.
registerSnapshotDomain({
  name: "productStoreShippingMethod",
  table: "productStoreShippingMethods",
  projection: productStoreShippingMethodProjection,
  listUrl: "admin/productStores",
  collectionKey: null, // bare array
  strictCollection: true,
  fanOut: {
    parentTable: "productStores",
    parentKeyField: "productStoreId",
    urlFor: (productStoreId) =>
      `admin/productStores/${encodeURIComponent(productStoreId)}/shippingMethods`,
  },
});

// --- Enumeration types, geo reference, and the facility <-> product-store association. ---

registerSnapshotDomain({
  name: "enumType",
  table: "enumTypes",
  projection: enumTypeProjection,
  listUrl: "admin/enumTypes",
  collectionKey: null,
});

registerSnapshotDomain({
  name: "geo",
  table: "geos",
  projection: geoProjection,
  listUrl: "admin/geos",
  collectionKey: null,
});

registerSnapshotDomain({
  name: "geoAssoc",
  table: "geoAssocs",
  projection: geoAssocProjection,
  listUrl: "admin/geos/assocs",
  collectionKey: null,
});

/**
 * Facility <-> product store. Only `oms/productStores/{id}/facilities` exists (no global list), so
 * fan out over the cached product stores — few in number and already synced before this runs.
 */
registerSnapshotDomain({
  name: "productStoreFacility",
  table: "productStoreFacilities",
  projection: productStoreFacilityProjection,
  // No global association list exists, so this is never fetched — both the initial snapshot and the
  // post-mutation refetch go through `fanOut.urlFor`. It previously doubled as the refetch URL,
  // which fetched product stores instead of associations and pruned the whole table.
  listUrl: "oms/productStores",
  collectionKey: null,
  fanOut: {
    parentTable: "productStores",
    parentKeyField: "productStoreId",
    urlFor: (productStoreId) => `oms/productStores/${encodeURIComponent(productStoreId)}/facilities`,
  },
});

registerSnapshotDomain({
  name: "facilityGroupProductStore",
  table: "facilityGroupProductStores",
  projection: facilityGroupProductStoreProjection,
  listUrl: "oms/groupProductStores",
  collectionKey: null, // bare array
  refetchScope: (pk) => ({
    params: { facilityGroupId: pk.facilityGroupId },
    scope: { field: "facilityGroupId", value: pk.facilityGroupId },
  }),
});

// --- App registry + version pins (the App Version screen). ---

registerSnapshotDomain({
  name: "app",
  table: "apps",
  projection: appProjection,
  listUrl: "admin/apps",
  collectionKey: null, // bare array
});

registerSnapshotDomain({
  name: "appVersion",
  table: "appVersions",
  projection: appVersionProjection,
  // `CommerceAppAndDeployment` list — INNER-joined, so it returns only apps that HAVE a deployment.
  listUrl: "admin/apps/appVersions",
  collectionKey: null, // bare array
  // Composite key and no by-PK route: create/update/delete are path-scoped by appId
  // (`admin/apps/{appId}/appVersions`). The set is tiny, so a mutation re-lists the whole thing and
  // the snapshot prunes any pin the server dropped. Callers trigger this via `resyncDomain("appVersion")`.
  refetchScope: () => ({ params: {} }),
});
