import { describe, expect, it, vi } from "vitest";

/**
 * Settings' refresh controls have to reach the worker that actually owns the sync.
 *
 * `useDbStatus` used to hard-wire its refresh to `@common/db/sync/appDbBootstrap`. Company never
 * calls `startDbBootstrap` — it runs its own sync service — so that bootstrap holds no harness
 * proxy and falls through to `getSyncDomain(name)` on the MAIN thread, where the registry is empty
 * because every domain registers as a side effect inside the worker module. Both buttons in
 * Settings.vue therefore resolved successfully having done nothing at all, which is
 * indistinguishable from a refresh that ran and found no changes.
 */
const service = vi.hoisted(() => ({
  resyncDomain: vi.fn(async () => {}),
  resyncReferenceData: vi.fn(async () => {}),
}));

vi.mock("@/services/appCacheBootstrap", () => service);

// The status list itself is not under test here; keep the live subscription out of the way.
vi.mock("dexie", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    liveQuery: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  };
});

vi.mock("@/db/companyDb", () => ({
  companyDb: {
    raw: () => ({
      syncMeta: { toArray: async () => [] },
      table: () => ({ count: async () => 0 }),
    }),
  },
}));

describe("useCacheStatus refresh routing", () => {
  it("refreshes one domain through the app's own sync service", async () => {
    const { useCacheStatus } = await import("@/composables/useCacheStatus");
    const { refreshDomain } = useCacheStatus();

    await refreshDomain("carrier");

    expect(service.resyncDomain).toHaveBeenCalledWith("carrier");
  });

  it("refreshes everything through the app's own sync service", async () => {
    const { useCacheStatus } = await import("@/composables/useCacheStatus");
    const { refreshAll } = useCacheStatus();

    await refreshAll();

    expect(service.resyncReferenceData).toHaveBeenCalled();
  });

  it("clears the in-flight marker once a refresh settles", async () => {
    const { useCacheStatus } = await import("@/composables/useCacheStatus");
    const { refreshDomain, refreshing } = useCacheStatus();

    await refreshDomain("carrier");

    expect(refreshing.value).toBeNull();
  });
});
