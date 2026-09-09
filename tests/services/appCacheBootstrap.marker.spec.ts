// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const deleted: string[] = [];

vi.mock("@/db/companyDb", () => ({
  companyDb: {
    tableNames: [],
    raw: () => ({ syncMeta: { delete: async (key: string) => { deleted.push(key); } } }),
  },
}));

vi.mock("@common/db", () => ({
  createSyncService: () => ({
    start: async () => {},
    setDomains: async () => {},
    syncNow: async () => {},
    syncDomainNow: async () => 0,
    refetchOne: async () => 0,
    registeredDomains: async () => [],
    stop: () => {},
  }),
}));

/**
 * `markSyncedThisLogin` writes `loginSync:<domain>`. Deleting `domain:<domain>` clears nothing,
 * so a resync that does not also force is a silent no-op.
 */
describe("resyncDomain login marker", () => {
  it("deletes the marker key that markSyncedThisLogin actually writes", async () => {
    deleted.length = 0;
    const { resyncDomain } = await import("@/services/appCacheBootstrap");

    await resyncDomain("carrier").catch(() => {});

    expect(deleted).toContain("loginSync:carrier");
    expect(deleted).not.toContain("domain:carrier");
  });
});
