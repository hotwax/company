import { beforeAll, describe, expect, it, vi } from "vitest";
import { CACHE_DOMAIN_CATALOG } from "@/utils/cacheDomainCatalog";

/**
 * Every `registerSyncDomain` CALL, in order — not just the final registry contents.
 *
 * The registry is a `Map` keyed by name, so `getAllSyncDomains()` can never itself show a
 * duplicate: two registrations under one name collapse to the last writer before the test ever
 * observes them (that collapse is precisely the silent-overwrite failure mode Task 8 exists to
 * rule out). Asserting against the post-collapse registry would make "registers no domain twice"
 * vacuously true — it would pass identically whether or not a duplicate registration ever
 * happened (verified: registering "app" twice left `getAllSyncDomains()` with exactly one "app",
 * same as registering it once). Recording each call instead of trusting the end state is what
 * makes it a real check.
 */
const registrationCalls = vi.hoisted(() => [] as string[]);

vi.mock("@/workers/syncRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/workers/syncRegistry")>();
  return {
    ...actual,
    registerSyncDomain: (domain: { name: string }) => {
      registrationCalls.push(domain.name);
      return actual.registerSyncDomain(domain);
    },
  };
});

// `pollingWorkerHarness.ts` (imported last by `appSync.worker.ts`) calls Comlink's `expose()`,
// which needs a real worker global scope (`self.addEventListener`) that this test environment
// does not have. Every domain registers via a module-scope side effect BEFORE that import runs,
// so stubbing `expose` out does not touch anything this test is checking.
vi.mock("comlink", () => ({ expose: () => {} }));

describe("company domain registration", () => {
  let names: string[];

  beforeAll(async () => {
    const { clearSyncRegistry, getAllSyncDomains } = await import("@/workers/syncRegistry");
    clearSyncRegistry();
    registrationCalls.length = 0;
    // Import the REAL worker entry, statically — exactly how production loads it, with whatever
    // import order `appSync.worker.ts` actually declares.
    //
    // An earlier version of this test reconstructed the expected order by hand with a sequence of
    // `await import("@/workers/domains/...")` calls instead of importing the entry file. That
    // reconstruction imposes the order the TEST wrote, not the order the SOURCE declares, so it
    // could not catch a wrong static order in `appSync.worker.ts` itself. Concretely: with the
    // seed registration written as a bare statement placed textually above the domain imports (a
    // real bug this repo shipped), the hand-reconstructed test still passed, because it just
    // re-did the (correct) order itself — while the real registry, built from the actual file,
    // had fan-out children registering before their parents (`carrierFacility` at index 14,
    // `carrier` at index 41). Importing the real entry file closes that gap.
    await import("@/workers/appSync.worker");
    names = getAllSyncDomains().map((d) => d.name);
  });

  it("registers every worker-synced domain the catalog advertises", () => {
    // Class C ("shopifyBulkOperation") is write-through only: main-thread composables
    // (useSystemMessage.ts, useShopify.ts) upsert it directly from data already fetched for
    // another reason, and it never goes through the worker registry — so it is deliberately
    // excluded here, not a hole in registration.
    const missing = CACHE_DOMAIN_CATALOG
      .filter((entry) => entry.syncClass !== "C")
      .filter((entry) => !names.includes(entry.name))
      .map((entry) => entry.name);
    expect(missing, `catalog names with no registration: ${missing.join(", ")}`).toEqual([]);
  });

  it("registers no domain twice", () => {
    const seen = new Set<string>();
    const duplicates = registrationCalls.filter((name) => seen.has(name) || (seen.add(name), false));
    expect(duplicates, `registered more than once: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("orders each fan-out child after the parent whose rows it reads", () => {
    for (const [child, parent] of [
      ["carrierFacility", "carrier"],
      ["productStoreShippingMethod", "productStore"],
      ["facilityGroupProductStore", "productStore"],
    ]) {
      expect(names.indexOf(parent), `${parent} not registered`).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(child), `${child} not registered`).toBeGreaterThanOrEqual(0);
      expect(
        names.indexOf(child),
        `${child} must register after ${parent}; it fans out over cached ${parent} rows`,
      ).toBeGreaterThan(names.indexOf(parent));
    }
  });

  it("no longer registers facilityGroupMember under its old name", () => {
    expect(names).not.toContain("facilityGroupMember");
    expect(names).toContain("groupFacility");
  });
});
