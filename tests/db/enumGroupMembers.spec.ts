import { describe, expect, it } from "vitest";
import { snapshotKeyOf } from "@common/db/sync/defineSnapshotDomain";
import { entityKeyOf, isEffectiveNow, projectRows } from "@common/db/storage/projection";
import { companyDb } from "@/db/companyDb";

/**
 * NS-12: re-adding a variance reason after its membership expired. The members endpoint returns the
 * expired row AND the active replacement (a new `fromDate`). Keyed on group + enum alone, the
 * snapshot walk de-duplicated them and kept the first — the expired one — so the reason stayed
 * unchecked. Keyed with `fromDate`, both survive and the reader picks the effective one.
 */
describe("enumGroupMembers keying", () => {
  const entity = companyDb.entities.enumGroupMembers;
  const NOW = Date.UTC(2026, 9, 7);
  const expired = { enumerationGroupId: "IA_VAR_NETSUITE", enumId: "VAR_DAMAGED", fromDate: NOW - 86_400_000, thruDate: NOW - 3_600_000 };
  const replacement = { enumerationGroupId: "IA_VAR_NETSUITE", enumId: "VAR_DAMAGED", fromDate: NOW - 60_000 };

  it("keys a membership on its fromDate, the entity's own PK", () => {
    expect(entity.primaryKeyFields).toEqual(["enumerationGroupId", "enumId", "fromDate"]);
  });

  it("gives the expired row and its replacement different snapshot keys", () => {
    expect(snapshotKeyOf(expired, entity)).not.toBe(snapshotKeyOf(replacement, entity));
  });

  it("keeps both rows, so the effective one is what the screen finds", () => {
    const rows = projectRows([expired, replacement], entity, NOW);
    const keys = new Set(rows.map((row) => JSON.stringify(entityKeyOf(row, entity))));
    expect(keys.size).toBe(2);

    const effective = rows.find((row: any) => row.enumId === "VAR_DAMAGED" && isEffectiveNow(row, NOW));
    expect(effective?.fromDate).toBe(replacement.fromDate);
  });
});
