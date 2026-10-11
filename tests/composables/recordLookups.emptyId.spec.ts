import { describe, expect, it, vi } from "vitest";
import { ref, toValue } from "vue";

/**
 * A single-record read with no id must find nothing. An empty query reads the whole table, so
 * `first` became an arbitrary row: a page whose id had not resolved yet showed another record.
 */
const harness = vi.hoisted(() => ({ queries: [] as Array<{ table: string; options: any }> }));

vi.mock("@common", () => ({
  api: vi.fn(),
  client: vi.fn(),
  commonUtil: { hasError: () => false },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string) => key,
  useDb: (table: string, options: any) => {
    harness.queries.push({ table, options });
    return { records: ref([]), first: ref(undefined), count: ref(0), hydrated: ref(true) };
  },
}));
vi.mock("@/services/appDbSync", () => ({ refreshAfterMutation: vi.fn(), resyncDomain: vi.fn() }));
vi.mock("@/store/user", () => ({ useUserStore: vi.fn() }));

import { useFacilityGroupRecord, useFacilityRecord } from "@/composables/useFacilities";
import { useCarrierRecord } from "@/composables/useCarriers";
import { useUserGroupRecord } from "@/composables/useSecurity";
import { useProductStoreRecord } from "@/composables/useProductStores";
import { useOrganizationRecord } from "@/composables/useOrganizations";

const ROWS = [{ facilityId: "F1", facilityGroupId: "G1", partyId: "P1", userGroupId: "U1", productStoreId: "S1" }];

function queryFor(table: string) {
  const query = harness.queries.filter((entry) => entry.table === table).at(-1);
  return toValue(query?.options) ?? {};
}

/** What the query would return against a non-empty table, applying only the parts it sets. */
function matches(options: any) {
  if (options.equals) return ROWS.filter((row: any) => Object.entries(options.equals).every(([k, v]) => row[k] === v));
  return options.filter ? ROWS.filter(options.filter) : ROWS;
}

describe("single-record reads with no id", () => {
  it.each([
    ["facilities", () => useFacilityRecord(undefined)],
    ["facilityGroups", () => useFacilityGroupRecord(undefined)],
    ["carriers", () => useCarrierRecord(undefined)],
    ["userGroups", () => useUserGroupRecord(undefined)],
    ["productStores", () => useProductStoreRecord(undefined)],
    ["organizations", () => useOrganizationRecord(ref(undefined))],
  ])("%s matches no row", (table, read) => {
    read();
    expect(matches(queryFor(table))).toEqual([]);
  });

  it("still reads by id once one is given", () => {
    useFacilityRecord("F1");
    expect(matches(queryFor("facilities"))).toEqual(ROWS);
  });
});
