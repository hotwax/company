import { describe, expect, it } from "vitest";
import { companyDb } from "@/db/companyDb";
import { entityKeyOf, projectRow } from "@common/db/storage/projection";

const project = (table: string, raw: Record<string, unknown>) => projectRow(raw, companyDb.entities[table], 0);

/**
 * A stored row carries only declared fields. Each case here is a field a screen reads, which was
 * silently empty after rows stopped carrying the raw server payload.
 */
describe("stored rows keep the fields screens read", () => {
  it.each([
    ["facilities", { facilityId: "F", closedDate: 1700000000000, facilityTimeZone: "UTC", externalId: "X" }, ["closedDate", "facilityTimeZone", "externalId"]],
    ["groupFacilities", { facilityGroupId: "G", facilityId: "F", fromDate: 1, sequenceNum: 3 }, ["sequenceNum"]],
    ["shopifyShops", { shopId: "S", timezone: "America/New_York", processRefund: "Y" }, ["timezone", "processRefund"]],
    ["systemMessageTypes", { systemMessageTypeId: "T", sendServiceName: "send#X", consumeServiceName: "consume#X" }, ["sendServiceName", "consumeServiceName"]],
    ["serviceJobRuns", { jobRunId: "R", results: "{\"ok\":true}", parameters: { shopId: "S" } }, ["results", "parameters"]],
    ["dataManagerLogs", { logId: "L", errorLogContentId: "C", fileName: "a.json" }, ["errorLogContentId", "fileName"]],
    ["serviceJobs", { jobName: "J", parentJobName: "P" }, ["parentJobName"]],
    ["enums", { enumId: "E", enumName: "Name" }, ["enumName"]],
    ["geos", { geoId: "USA_NY", geoName: "New York", wellKnownText: "NY" }, ["wellKnownText"]],
    ["productStoreFacilities", { productStoreId: "PS", facilityId: "F", storeName: "Store" }, ["storeName"]],
    ["systemMessages", { systemMessageId: "M", orderId: "O1" }, ["orderId"]],
    ["facilityIdentifications", { facilityId: "F", facilityIdenTypeId: "T", fromDate: 1, thruDate: 2 }, ["fromDate", "thruDate"]],
  ])("%s", (table, raw, fields) => {
    const row = project(table, raw)!;
    for (const field of fields) expect(row[field], field).toBeDefined();
  });

  it("keeps an empty structured list as a list", () => {
    const row = project("shopifyOrderSyncHistory", { shopId: "S", orderId: "O", pending: [], messages: [] })!;
    expect(row.pending).toEqual([]);
    expect(row.messages).toEqual([]);
  });
});

describe("keys that must not collapse distinct rows", () => {
  it("keys transfer work by artifact, so two receipts of one order are two rows", () => {
    const a = project("shopifyTransferPending", { segment: "receipt", shopId: "S", orderId: "O", artifactId: "R1" })!;
    const b = project("shopifyTransferPending", { segment: "receipt", shopId: "S", orderId: "O", artifactId: "R2" })!;
    const entity = companyDb.entities.shopifyTransferPending;
    expect(entityKeyOf(a, entity)).not.toEqual(entityKeyOf(b, entity));
  });

  it("keeps a document attached to no feed", () => {
    expect(project("inventoryEventDocuments", { dataDocumentId: "D" })?.dataFeedId).toBe("");
  });

  it("keeps an expired identification apart from its replacement", () => {
    const entity = companyDb.entities.facilityIdentifications;
    const old = project("facilityIdentifications", { facilityId: "F", facilityIdenTypeId: "T", fromDate: 1, thruDate: 2 })!;
    const current = project("facilityIdentifications", { facilityId: "F", facilityIdenTypeId: "T", fromDate: 3 })!;
    expect(entityKeyOf(old, entity)).not.toEqual(entityKeyOf(current, entity));
  });
});
