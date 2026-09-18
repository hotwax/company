import { describe, expect, it } from "vitest";
import { companySchema } from "@/db/companySchema";
import after from "../fixtures/companySchemaAfter.json";

describe("companySchema", () => {
  it("emits the intended Dexie string for every table it declares", () => {
    for (const [table, schema] of Object.entries(after.schema)) {
      expect(companySchema.stores[table], `${table}`).toBe(schema);
    }
  });

  it("declares every primary-key field and every index member as a projected field", () => {
    for (const [table, entity] of Object.entries(companySchema.entities)) {
      for (const field of entity.primaryKeyFields) {
        expect(entity.fields[field], `${table}: pk field ${field} not projected`).toBeTruthy();
      }
      for (const index of entity.indexes) {
        const members = index.startsWith("[") ? index.slice(1, -1).split("+") : [index];
        for (const member of members) {
          expect(entity.fields[member], `${table}: index member ${member} not projected`).toBeTruthy();
        }
      }
    }
  });

  it("preserves every compound secondary index", () => {
    expect(companySchema.stores.dataManagerLogs).toContain("[configId+createdDate]");
    expect(companySchema.stores.dataManagerLogs).toContain("[configId+finishDateTime]");
    expect(companySchema.stores.syncRuns).toContain("[shopId+systemMessageTypeId+initDate]");
    expect(companySchema.stores.syncRuns).toContain("[shopId+configId+initDate]");
    expect(companySchema.stores.systemMessages).toContain("[systemMessageRemoteId+systemMessageTypeId+initDate]");
  });

  // An explicit list, not a `/Key$/` suffix pattern: a suffix match flags correct code.
  // `mappedKey` (shopifyTypeMappings) is a legitimate compound-PK member and `mappingKey`
  // (integrationTypeMappings) is an ordinary business field — neither is a retired synthetic
  // key, so a blanket pattern would false-positive on both. Naming exactly what must be gone
  // is what stops that mistake from silently passing again.
  const RETIRED_SYNTHETIC_KEYS = [
    "errorKey", "updateKey", "adjustmentKey", "carrierShipmentMethodKey",
    "carrierFacilityKey", "documentFeedKey", "relationshipKey", "locationKey",
    "typeMappingKey", "carrierShipmentKey", "facilityGroupProductStoreKey",
    "enumGroupMemberKey", "facilityIdentificationKey", "appVersionKey",
  ];

  it("retires every synthetic key column", () => {
    for (const [table, entity] of Object.entries(companySchema.entities)) {
      const leftovers = entity.fieldNames.filter((f) => RETIRED_SYNTHETIC_KEYS.includes(f));
      expect(leftovers, `${table} still declares a retired synthetic key`).toEqual([]);
    }
  });
});
