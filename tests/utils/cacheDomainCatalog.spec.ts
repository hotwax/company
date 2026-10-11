import { describe, expect, it } from "vitest";
import { CACHE_TABLES } from "@/utils/appCacheDb";
import { CACHE_DOMAIN_CATALOG } from "@/utils/cacheDomainCatalog";

describe("CACHE_DOMAIN_CATALOG", () => {
  // The Settings "Data Fetch Status" card reads every catalog table in one liveQuery, so a single
  // entry naming a table the schema does not declare throws InvalidTableError and blanks the whole
  // card, refresh buttons included.
  it("names only tables the cache schema declares", () => {
    const declared = new Set<string>(CACHE_TABLES);
    const undeclared = CACHE_DOMAIN_CATALOG.filter((entry) => !declared.has(entry.table))
      .map((entry) => `${entry.name} -> ${entry.table}`);

    expect(undeclared).toEqual([]);
  });
});
