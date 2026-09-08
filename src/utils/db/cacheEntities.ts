import { defineCachedEntity } from "./appCacheDb";
import { companyDb } from "@/db/companyDb";

/**
 * Cached entity definitions — the shared contract between the worker (which writes) and views /
 * stores (which read via `live()`).
 *
 * These live outside the worker on purpose: the entity defines the row shape, so both sides
 * must agree on it. Importing this module is side-effect-free beyond opening the Dexie handle;
 * registering a *sync domain* (the fetching behavior) is separate and worker-only.
 */

/** DataManagerLog — class A (live, append-mostly). Cursor: `createdDate`. */
export const dataManagerLogCache = defineCachedEntity("dataManagerLogs", companyDb.entities.dataManagerLogs);

/** SystemMessage — class A (live, append-mostly). Cursor: `initDate`. */
export const systemMessageCache = defineCachedEntity("systemMessages", companyDb.entities.systemMessages);

/** ServiceJob definitions. Real response also carries computed `nextExecutionDateTime`. */
export const serviceJobCache = defineCachedEntity("serviceJobs", companyDb.entities.serviceJobs);

/**
 * SystemMessageRemote — the anchor that scopes a shop's messages.
 *
 *   internalId / internalIdType   → the HotWax shopId  (HOTWAX_SHOP_ID)
 *   remoteId   / remoteIdType     → the Shopify shop id (SHOPIFY_SHOP_ID)
 */
export const systemMessageRemoteCache = defineCachedEntity("systemMessageRemotes", companyDb.entities.systemMessageRemotes);

export const productStoreCache = defineCachedEntity("productStores", companyDb.entities.productStores);

/**
 * SyncRun — the SHOP-SCOPED CURSOR (spine) for sync monitoring. Not a data table.
 */
export const syncRunCache = defineCachedEntity("syncRuns", companyDb.entities.syncRuns);

export const shopifyShopCache = defineCachedEntity("shopifyShops", companyDb.entities.shopifyShops);

/** Read shape is the `FacilityAndType` view — note `parentTypeId`, not `parentFacilityId`. */
export const facilityCache = defineCachedEntity("facilities", companyDb.entities.facilities);

/** Internal organization — Party(PARTY_GROUP) + PartyGroup + INTERNAL_ORGANIZATIO PartyRole. */
export const organizationCache = defineCachedEntity("organizations", companyDb.entities.organizations);

/** Parent → child internal-organization edge. */
export const organizationRelationshipCache = defineCachedEntity("organizationRelationships", companyDb.entities.organizationRelationships);

export const facilityGroupCache = defineCachedEntity("facilityGroups", companyDb.entities.facilityGroups);

/**
 * FacilityGroupAndMember — date-effective association with a COMPOSITE natural key
 * (facilityGroupId + facilityId + fromDate).
 */
export const groupFacilityCache = defineCachedEntity("groupFacilities", companyDb.entities.groupFacilities);

export const permissionCache = defineCachedEntity("permissions", companyDb.entities.permissions);

export const integrationTypeMappingCache = defineCachedEntity("integrationTypeMappings", companyDb.entities.integrationTypeMappings);

// --- lookup / type reference ---
export const statusCache = defineCachedEntity("statuses", companyDb.entities.statuses);
export const enumCache = defineCachedEntity("enums", companyDb.entities.enums);
export const facilityTypeCache = defineCachedEntity("facilityTypes", companyDb.entities.facilityTypes);
export const facilityGroupTypeCache = defineCachedEntity("facilityGroupTypes", companyDb.entities.facilityGroupTypes);
export const userGroupCache = defineCachedEntity("userGroups", companyDb.entities.userGroups);
export const productTypeCache = defineCachedEntity("productTypes", companyDb.entities.productTypes);
export const shipmentMethodTypeCache = defineCachedEntity("shipmentMethodTypes", companyDb.entities.shipmentMethodTypes);
export const currencyCache = defineCachedEntity("currencies", companyDb.entities.currencies);
export const paymentMethodTypeCache = defineCachedEntity("paymentMethodTypes", companyDb.entities.paymentMethodTypes);
export const roleTypeCache = defineCachedEntity("roleTypes", companyDb.entities.roleTypes);

export const shopifyLocationCache = defineCachedEntity("shopifyLocations", companyDb.entities.shopifyLocations);

/** Per-shop mapping of Shopify locations / metafields / types to Moqui identities. */
export const shopifyTypeMappingCache = defineCachedEntity("shopifyTypeMappings", companyDb.entities.shopifyTypeMappings);

/** DataFeed config (e.g. `ShopifyInventoryChannelEventFeed`). */
export const dataFeedCache = defineCachedEntity("dataFeeds", companyDb.entities.dataFeeds);

/** InventoryChannel — OMS inventory channel mapping. */
export const inventoryChannelCache = defineCachedEntity("inventoryChannels", companyDb.entities.inventoryChannels);

/** ShopifyInventoryAdjustmentDetail — source-event level adjustment line item. */
export const shopifyInventoryAdjustmentDetailCache = defineCachedEntity(
  "shopifyInventoryAdjustmentDetails",
  companyDb.entities.shopifyInventoryAdjustmentDetails,
);

/** Joined document ↔ feed table for inventory event filtering. */
export const inventoryEventDocumentCache = defineCachedEntity("inventoryEventDocuments", companyDb.entities.inventoryEventDocuments);

/** Per-productStore counts used by the ProductStore list view. */
export const productStoreShipmentCountCache = defineCachedEntity("productStoreShipmentCounts", companyDb.entities.productStoreShipmentCounts);

// --- Carrier configuration ---
export const carrierCache = defineCachedEntity("carriers", companyDb.entities.carriers);
export const carrierShipmentMethodCache = defineCachedEntity("carrierShipmentMethods", companyDb.entities.carrierShipmentMethods);
export const carrierFacilityCache = defineCachedEntity("carrierFacilities", companyDb.entities.carrierFacilities);
export const shopifyCarrierShipmentCache = defineCachedEntity("shopifyCarrierShipments", companyDb.entities.shopifyCarrierShipments);
export const productStoreShippingMethodCache = defineCachedEntity("productStoreShippingMethods", companyDb.entities.productStoreShippingMethods);

export const enumGroupMemberCache = defineCachedEntity("enumGroupMembers", companyDb.entities.enumGroupMembers);
export const facilityIdentificationCache = defineCachedEntity("facilityIdentifications", companyDb.entities.facilityIdentifications);

export const enumTypeCache = defineCachedEntity("enumTypes", companyDb.entities.enumTypes);
export const geoCache = defineCachedEntity("geos", companyDb.entities.geos);
export const geoAssocCache = defineCachedEntity("geoAssocs", companyDb.entities.geoAssocs);
export const productStoreFacilityCache = defineCachedEntity("productStoreFacilities", companyDb.entities.productStoreFacilities);

export const serviceJobRunCache = defineCachedEntity("serviceJobRuns", companyDb.entities.serviceJobRuns);
export const systemMessageErrorCache = defineCachedEntity("systemMessageErrors", companyDb.entities.systemMessageErrors);
export const productUpdateHistoryCache = defineCachedEntity("productUpdateHistories", companyDb.entities.productUpdateHistories);
export const systemMessageTypeCache = defineCachedEntity("systemMessageTypes", companyDb.entities.systemMessageTypes);
export const shopifyBulkOperationCache = defineCachedEntity("shopifyBulkOperations", companyDb.entities.shopifyBulkOperations);

/** Facility group ↔ product store (`co.hotwax.facility.ProductStoreFacilityGroup`). */
export const facilityGroupProductStoreCache = defineCachedEntity("facilityGroupProductStores", companyDb.entities.facilityGroupProductStores);

export const appCache = defineCachedEntity("apps", companyDb.entities.apps);
export const appVersionCache = defineCachedEntity("appVersions", companyDb.entities.appVersions);

// NetSuite order push — rule group export path
export const netSuiteRuleGroupCache = defineCachedEntity("netSuiteRuleGroups", companyDb.entities.netSuiteRuleGroups);
export const netSuiteDecisionRuleCache = defineCachedEntity("netSuiteDecisionRules", companyDb.entities.netSuiteDecisionRules);
export const netSuiteRuleGroupRunCache = defineCachedEntity("netSuiteRuleGroupRuns", companyDb.entities.netSuiteRuleGroupRuns);
export const netSuiteOrderPushBacklogCache = defineCachedEntity("netSuiteOrderPushBacklog", companyDb.entities.netSuiteOrderPushBacklog);
