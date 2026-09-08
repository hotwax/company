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

  it("has no synthetic key column left anywhere", () => {
    for (const [table, entity] of Object.entries(companySchema.entities)) {
      expect(entity.fieldNames.filter((f) => /Key$/.test(f)), `${table}`).toEqual([]);
    }
  });
});
