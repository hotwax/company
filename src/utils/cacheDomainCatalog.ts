import type { CacheTableName } from "./appCacheDb";

/**
 * The catalog of sync domains — the single list shared by the app-load bootstrap and the
 * Settings "Data Fetch Status" card, so the two can never disagree about what is cached.
 *
 * `syncClass`:
 *   - `B` reference/config: snapshot-synced once per login, then only on mutation.
 *   - `A` live/append-mostly: polled on a cadence while a view that needs it is open.
 */
export interface CacheDomainEntry {
  /** Registry name used to activate / force-resync the domain. */
  name: string;
  table: CacheTableName;
  /** Human label for the Settings card. */
  label: string;
  syncClass: "A" | "B" | "C";
}

export const CACHE_DOMAIN_CATALOG: CacheDomainEntry[] = [
  // --- class B: reference / config ---
  { name: "productStore", table: "productStores", label: "Product stores", syncClass: "B" },
  { name: "carrier", table: "carriers", label: "Carriers", syncClass: "B" },
  { name: "carrierShipmentMethod", table: "carrierShipmentMethods", label: "Carrier shipment methods", syncClass: "B" },
  // must come AFTER carrier: it fans out over the cached carriers
  { name: "carrierFacility", table: "carrierFacilities", label: "Carrier facilities", syncClass: "B" },
  { name: "shopifyShop", table: "shopifyShops", label: "Shopify shops", syncClass: "B" },
  { name: "shopifyInventoryEventFeed", table: "dataFeeds", label: "Shopify inventory event feed", syncClass: "B" },
  { name: "inventoryChannel", table: "inventoryChannels", label: "Shopify inventory channels", syncClass: "B" },
  {
    name: "inventoryEventDocument",
    table: "inventoryEventDocuments",
    label: "Shopify inventory event sources",
    syncClass: "B",
  },
  { name: "systemMessageRemote", table: "systemMessageRemotes", label: "System message remotes", syncClass: "B" },
  { name: "serviceJob", table: "serviceJobs", label: "Service jobs", syncClass: "B" },
  { name: "organization", table: "organizations", label: "Organizations", syncClass: "B" },
  {
    name: "organizationRelationship",
    table: "organizationRelationships",
    label: "Organization relationships",
    syncClass: "B",
  },
  { name: "facility", table: "facilities", label: "Facilities", syncClass: "B" },
  { name: "facilityGroup", table: "facilityGroups", label: "Facility groups", syncClass: "B" },
  { name: "facilityGroupMember", table: "groupFacilities", label: "Facility group members", syncClass: "B" },
  { name: "permission", table: "permissions", label: "Permissions", syncClass: "B" },
  { name: "integrationTypeMapping", table: "integrationTypeMappings", label: "Integration type mappings", syncClass: "B" },
  { name: "status", table: "statuses", label: "Statuses", syncClass: "B" },
  { name: "enum", table: "enums", label: "Enumerations", syncClass: "B" },
  { name: "facilityType", table: "facilityTypes", label: "Facility types", syncClass: "B" },
  { name: "userGroup", table: "userGroups", label: "User groups", syncClass: "B" },
  { name: "productType", table: "productTypes", label: "Product types", syncClass: "B" },
  { name: "shipmentMethodType", table: "shipmentMethodTypes", label: "Shipment method types", syncClass: "B" },
  { name: "currency", table: "currencies", label: "Currencies", syncClass: "B" },
  { name: "paymentMethodType", table: "paymentMethodTypes", label: "Payment method types", syncClass: "B" },
  { name: "roleType", table: "roleTypes", label: "Role types", syncClass: "B" },
  { name: "systemMessageType", table: "systemMessageTypes", label: "System message types", syncClass: "B" },
  { name: "shopifyLocation", table: "shopifyLocations", label: "Shopify locations", syncClass: "B" },
  { name: "shopifyTypeMapping", table: "shopifyTypeMappings", label: "Shopify type mappings", syncClass: "B" },
  { name: "productStoreShipmentCount", table: "productStoreShipmentCounts", label: "Store shipment counts", syncClass: "B" },
  { name: "shopifyCarrierShipment", table: "shopifyCarrierShipments", label: "Shopify carrier shipments", syncClass: "B" },
  { name: "enumGroupMember", table: "enumGroupMembers", label: "NetSuite reason group", syncClass: "B" },
  { name: "facilityIdentification", table: "facilityIdentifications", label: "Facility identifications", syncClass: "B" },
  { name: "productStoreShippingMethod", table: "productStoreShippingMethods", label: "Store shipping methods", syncClass: "B" },
  { name: "enumType", table: "enumTypes", label: "Enumeration types", syncClass: "B" },
  { name: "geo", table: "geos", label: "Geos (countries/states)", syncClass: "B" },
  { name: "geoAssoc", table: "geoAssocs", label: "Geo associations", syncClass: "B" },
  // must come AFTER productStore: it fans out over the cached product stores
  { name: "productStoreFacility", table: "productStoreFacilities", label: "Store facilities", syncClass: "B" },
  { name: "facilityGroupProductStore", table: "facilityGroupProductStores", label: "Facility group product stores", syncClass: "B" },
  { name: "app", table: "apps", label: "Apps", syncClass: "B" },
  { name: "appVersion", table: "appVersions", label: "App versions", syncClass: "B" },
  // --- class A: live, view-scoped (shown for visibility; not synced at login) ---
  { name: "dataManagerLog", table: "dataManagerLogs", label: "Data manager logs", syncClass: "A" },
  { name: "systemMessage", table: "systemMessages", label: "System messages", syncClass: "A" },
  {
    name: "shopifyInventoryAdjustmentDetail",
    table: "shopifyInventoryAdjustmentDetails",
    label: "Shopify aggregate inventory events",
    syncClass: "A",
  },
  { name: "shopifyBulkOperation", table: "shopifyBulkOperations", label: "Shopify bulk operations", syncClass: "C" },
];

export const REFERENCE_DOMAIN_NAMES = CACHE_DOMAIN_CATALOG
  .filter((entry) => entry.syncClass === "B")
  .map((entry) => entry.name);
