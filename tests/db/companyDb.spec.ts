import { describe, expect, it } from "vitest";
import { companyDb, COMPANY_SCHEMA, COMPANY_SEED_ENTITIES } from "@/db/companyDb";
import { CACHE_TABLES } from "@/utils/appCacheDb";

describe("company database declaration", () => {
  it("composes exactly the 55 data stores Company has today", () => {
    // 16 seed picks + 39 own. Blindly spreading the full seed schema would give 67.
    expect(companyDb.tableNames.length).toBe(55);
  });

  it("names the database per OMS instance", () => {
    expect(companyDb.name("demo-oms")).toBe("demo-oms-CompanyDB");
    expect(() => companyDb.name("")).toThrow(/no OMS instance/i);
  });

  it("keeps statuses as its own table, because the endpoints disagree", () => {
    // Framework seed fetches admin/status; Company fetches oms/statuses.
    expect(companyDb.tableNames).toContain("statuses");
    expect(companyDb.seed.map((e) => e.name)).not.toContain("status");
  });

  it("creates none of the seed tables Company does not read", () => {
    for (const table of [
      "returnReasons", "returnTypes", "returnItemTypes", "orderAdjustmentTypes",
      "contactMechPurposeTypes", "communicationEventTypes", "partyRelationshipTypes",
      "statusFlowTransitions", "productStoreEmailSettings",
      // these three duplicate a Company table under a different name
      "shopifyShopLocations", "productStoreShipmentMethods", "productStoreFacilityGroups",
    ]) {
      expect(companyDb.tableNames, `should not create ${table}`).not.toContain(table);
    }
  });

  it("keeps the Company table that each unpicked duplicate would have shadowed", () => {
    expect(companyDb.tableNames).toContain("shopifyLocations");
    expect(companyDb.tableNames).toContain("productStoreShippingMethods");
    expect(companyDb.tableNames).toContain("facilityGroupProductStores");
  });

  it("widens the three shared tables without redefining their primary keys", () => {
    expect(companyDb.schema.carriers).toBe("partyId, groupName, roleTypeId");
    expect(companyDb.schema.carrierShipmentMethods)
      .toBe("carrierShipmentMethodKey, partyId, shipmentMethodTypeId, roleTypeId, sequenceNumber");
    expect(companyDb.schema.shopifyShops)
      .toBe("shopId, productStoreId, shopifyShopId, systemMessageRemoteId");
  });

  it("picks 16 seed entities", () => {
    expect(companyDb.seed.length).toBe(16);
  });

  // --- Additional coverage beyond the brief's floor ---

  it("does not declare syncMeta: BaseDB injects it, and defineAppDb would throw if it did", () => {
    expect(companyDb.tableNames).not.toContain("syncMeta");
    expect(Object.keys(COMPANY_SCHEMA)).not.toContain("syncMeta");
  });

  it("declares exactly the 39 own tables, matching COMPANY_SCHEMA's key count", () => {
    expect(Object.keys(COMPANY_SCHEMA).length).toBe(39);
    expect(companyDb.tableNames.length - COMPANY_SEED_ENTITIES.length).toBe(39);
  });

  it("composes tableNames as the union of the 16 seed tables and the 39 own tables, with no overlap", () => {
    const seedTables = new Set(companyDb.seed.map((e) => e.table));
    const ownTables = new Set(Object.keys(COMPANY_SCHEMA));

    // No table name is claimed twice.
    for (const table of ownTables) {
      expect(seedTables.has(table), `${table} is both a seed pick and an own table`).toBe(false);
    }

    expect(new Set(companyDb.tableNames)).toEqual(new Set([...seedTables, ...ownTables]));
  });

  it("matches CACHE_TABLES exactly once syncMeta is excluded — same 55 stores, just recomposed", () => {
    const legacyTables = new Set(CACHE_TABLES.filter((t) => t !== "syncMeta"));
    expect(new Set(companyDb.tableNames)).toEqual(legacyTables);
  });

  it("preserves every seed pick's own schema string unless it is one of the three widened tables", () => {
    for (const entity of companyDb.seed) {
      if (["carriers", "carrierShipmentMethods", "shopifyShops"].includes(entity.table)) continue;
      expect(companyDb.schema[entity.table]).toBe(entity.schema);
    }
  });

  it("names the seed entities Company opted into, verbatim", () => {
    expect([...COMPANY_SEED_ENTITIES]).toEqual([
      "productStore", "enum", "enumType", "facility", "facilityType", "facilityGroup",
      "groupFacility", "geo", "geoAssoc", "carrier", "shipmentMethodType",
      "carrierShipmentMethod", "paymentMethodType", "roleType", "productStoreFacility",
      "shopifyShop",
    ]);
  });
});
