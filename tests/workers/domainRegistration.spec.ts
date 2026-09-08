import { beforeAll, describe, expect, it, vi } from "vitest";
import { CACHE_DOMAIN_CATALOG } from "@/utils/cacheDomainCatalog";
import { registerCompanySeedDomains } from "@/workers/domains/registerSeedDomains";
import { companyDb } from "@/db/companyDb";

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

describe("company domain registration", () => {
  let names: string[];

  beforeAll(async () => {
    const { clearSyncRegistry, getAllSyncDomains } = await import("@/workers/syncRegistry");
    clearSyncRegistry();
    registrationCalls.length = 0;
    // Same order as appSync.worker.ts: seed first, then every one of Company's own domain
    // modules (everything appSync.worker.ts imports except the Comlink harness itself, which
    // exposes an API rather than registering anything).
    registerCompanySeedDomains(companyDb.seed);
    await import("@/workers/domains/dataManagerLogDomain");
    await import("@/workers/domains/systemMessageDomain");
    await import("@/workers/domains/serviceJobRunDomain");
    await import("@/workers/domains/syncRunDomain");
    await import("@/workers/domains/productUpdateHistoryDomain");
    await import("@/workers/domains/organizationDomain");
    await import("@/workers/domains/shopifyInventoryMonitoringDomain");
    await import("@/workers/domains/netSuiteOrderPushDomain");
    await import("@/workers/domains/referenceDomains");
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
