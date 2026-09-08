import { describe, expect, it } from "vitest";
import { companyDb, COMPANY_SCHEMA, COMPANY_SEED_ENTITIES } from "@/db/companyDb";
import { CACHE_TABLES } from "@/utils/appCacheDb";

describe("company database declaration", () => {
  it("composes exactly the 55 data stores Company has today", () => {
    // 12 seed picks + 43 own. Blindly spreading the full seed schema would give a different count.
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

  /**
   * `carrier`, `carrierShipmentMethod`, `shopifyShop`, and `facilityGroup` are NOT seed picks
   * (see `COMPANY_SEED_ENTITIES`'s comment: the same-named seed entities are missing
   * `listParams`/`refetchScope`/`strictCollection`/`byPk` Company's own registration relies on).
   * Their tables are therefore declared directly in `COMPANY_SCHEMA`, full index set included —
   * there is nothing left to "widen".
   */
  it("declares the four rejected-seed tables as its own, full index set included", () => {
    expect(companyDb.schema.carriers).toBe("partyId, groupName, roleTypeId");
    expect(companyDb.schema.carrierShipmentMethods)
      .toBe("carrierShipmentMethodKey, partyId, roleTypeId, shipmentMethodTypeId, sequenceNumber");
    expect(companyDb.schema.shopifyShops)
      .toBe("shopId, productStoreId, systemMessageRemoteId, shopifyShopId");
    expect(companyDb.schema.facilityGroups).toBe("facilityGroupId, facilityGroupTypeId");
  });

  it("picks 12 seed entities", () => {
    expect(companyDb.seed.length).toBe(12);
  });

  // --- Additional coverage beyond the brief's floor ---

  it("does not declare syncMeta: BaseDB injects it, and defineAppDb would throw if it did", () => {
    expect(companyDb.tableNames).not.toContain("syncMeta");
    expect(Object.keys(COMPANY_SCHEMA)).not.toContain("syncMeta");
  });

  it("declares exactly the 43 own tables, matching COMPANY_SCHEMA's key count", () => {
    expect(Object.keys(COMPANY_SCHEMA).length).toBe(43);
    expect(companyDb.tableNames.length - COMPANY_SEED_ENTITIES.length).toBe(43);
  });

  it("composes tableNames as the union of the 12 seed tables and the 43 own tables, with no overlap", () => {
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

  it("preserves every seed pick's own schema string verbatim — no seed pick is widened", () => {
    for (const entity of companyDb.seed) {
      expect(companyDb.schema[entity.table]).toBe(entity.schema);
    }
  });

  it("names the seed entities Company opted into, verbatim", () => {
    expect([...COMPANY_SEED_ENTITIES]).toEqual([
      "productStore", "enum", "enumType", "facility", "facilityType", "groupFacility",
      "geo", "geoAssoc", "shipmentMethodType", "paymentMethodType", "roleType",
      "productStoreFacility",
    ]);
  });

  it("does not pick the 4 same-named seed entities whose config is not a drop-in equivalent", () => {
    const seedNames = companyDb.seed.map((e) => e.name);
    for (const rejected of ["facilityGroup", "carrier", "carrierShipmentMethod", "shopifyShop"]) {
      expect(seedNames, `${rejected} should not be a seed pick`).not.toContain(rejected);
    }
  });
});
