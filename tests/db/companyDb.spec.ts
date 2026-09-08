import { describe, expect, it } from "vitest";
import { companyDb } from "@/db/companyDb";
import { CACHE_TABLES } from "@/utils/db/appCacheDb";

describe("company database declaration", () => {
  it("composes exactly the 55 data stores Company has today", () => {
    // 12 seed picks + 43 own.
    expect(companyDb.tableNames.length).toBe(55);
  });

  it("names the database per OMS instance", () => {
    expect(companyDb.name("demo-oms")).toBe("demo-oms-CompanyDB");
    expect(() => companyDb.name("")).toThrow(/no OMS instance/i);
  });

  it("keeps statuses as its own table, because the endpoints disagree", () => {
    expect(companyDb.tableNames).toContain("statuses");
    expect(companyDb.seedTables.has("statuses")).toBe(false);
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

  it("declares groupFacilities as a compound-key seed pick with 3 key fields", () => {
    expect(companyDb.entities.groupFacilities.primaryKeyFields).toEqual([
      "facilityGroupId", "facilityId", "fromDate",
    ]);
    expect(companyDb.seedTables.has("groupFacilities")).toBe(true);
  });

  it("matches CACHE_TABLES exactly once syncMeta is excluded — same 55 stores", () => {
    const legacyTables = new Set(CACHE_TABLES.filter((t) => t !== "syncMeta"));
    expect(new Set(companyDb.tableNames)).toEqual(legacyTables);
  });

  it("picks all 12 seed tables", () => {
    expect(companyDb.seedTables.size).toBe(12);
  });
});
