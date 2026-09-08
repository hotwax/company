import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteLegacyCaches } from "@/utils/appCacheDb";

/**
 * Per-instance database naming ({omsInstance}-CompanyDB) orphans the old fixed-name
 * `CompanyCacheDB` forever unless something deletes it. `deleteLegacyCaches` is that
 * cleanup, called fire-and-forget on app start (`pollingService.ts`), so it must never
 * throw and must never let one database's failure stop the other from being attempted.
 */
describe("deleteLegacyCaches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes both legacy databases", async () => {
    const deleteSpy = vi.spyOn(Dexie, "delete").mockResolvedValue(undefined);

    await deleteLegacyCaches();

    const deletedNames = deleteSpy.mock.calls.map((call) => call[0]);
    expect(deletedNames).toContain("DataManagerLogCacheDB");
    expect(deletedNames).toContain("CompanyCacheDB");
  });

  it("still attempts the second delete when the first rejects", async () => {
    const deleteSpy = vi.spyOn(Dexie, "delete").mockImplementation((name: string) =>
      name === "DataManagerLogCacheDB" ? Promise.reject(new Error("boom")) : Promise.resolve(undefined),
    );

    await expect(deleteLegacyCaches()).resolves.toBeUndefined();

    const deletedNames = deleteSpy.mock.calls.map((call) => call[0]);
    expect(deletedNames).toContain("DataManagerLogCacheDB");
    expect(deletedNames).toContain("CompanyCacheDB");
  });

  it("never rejects, even when both deletes fail", async () => {
    vi.spyOn(Dexie, "delete").mockRejectedValue(new Error("boom"));

    await expect(deleteLegacyCaches()).resolves.toBeUndefined();
  });
});
