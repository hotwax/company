import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Every `registerSyncDomain` CALL, in order — not just the final registry contents.
 */
const registrationCalls = vi.hoisted(() => [] as string[]);

vi.mock("@common/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@common/db")>();
  return {
    ...actual,
    registerSyncDomain: (domain: { name: string }) => {
      registrationCalls.push(domain.name);
      return actual.registerSyncDomain(domain);
    },
  };
});

// `pollingWorkerHarness.ts` (imported last by `appSync.worker.ts`) calls Comlink's `expose()`.
vi.mock("comlink", () => ({ expose: () => {} }));

describe("company domain registration", () => {
  let names: string[];

  beforeAll(async () => {
    const { clearSyncRegistry, getAllSyncDomains } = await import("@common/db/sync/syncRegistry");
    clearSyncRegistry();
    registrationCalls.length = 0;
    await import("@/workers/appSync.worker");
    names = getAllSyncDomains().map((d) => d.name);
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

  it("gives every registered domain a label and a sync class", async () => {
    const { getAllSyncDomains } = await import("@common/db/sync/syncRegistry");

    const missing = getAllSyncDomains()
      .filter((d) => !d.label || !d.syncClass)
      .map((d) => d.name);

    expect(missing).toEqual([]);
  });
});
