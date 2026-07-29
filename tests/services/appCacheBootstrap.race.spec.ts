import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The mutation → cache-refresh handshake must survive being called while the app-load bootstrap
 * is still in flight.
 *
 * `App.vue` starts the reference sync fire-and-forget (`void startReferenceSync()`), so a user who
 * mutates something during the bootstrap window reaches `refreshAfterMutation` while the worker
 * has not finished spawning. If that call is dropped, the write lands on the server and the cached
 * read never updates — a stale screen with no error anywhere.
 */

/** A worker handle that only exists once `start()` has resolved — exactly like pollingService. */
const harnessState = vi.hoisted(() => ({
  startResolved: false,
  refetchCalls: [] as Array<{ domain: string; whenStartResolved: boolean }>,
  syncDomainCalls: [] as string[],
  statusHandler: undefined as undefined | ((status: Record<string, any>) => void),
}));

vi.mock("@/services/pollingService", () => ({
  createSyncService: (options: { onStatus?: (status: Record<string, any>) => void }) => {
    harnessState.statusHandler = options.onStatus;
    return {
      // Spawning a worker takes real time. Resolving on a macrotask reproduces the window in which
      // `service` is already assigned but the Comlink handle is not.
      start: () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            harnessState.startResolved = true;
            resolve();
          }, 5);
        }),
      // Mirrors pollingService: returns 0 while `harness` is still null.
      refetchOne: async (domain: string) => {
        harnessState.refetchCalls.push({ domain, whenStartResolved: harnessState.startResolved });
        return harnessState.startResolved ? 1 : 0;
      },
      syncDomainNow: async (domain: string) => {
        harnessState.syncDomainCalls.push(domain);
        return harnessState.startResolved ? 1 : 0;
      },
      syncNow: async () => undefined,
      setDomains: async () => undefined,
      registeredDomains: async () => [],
      stop: () => undefined,
    };
  },
}));

vi.mock("@common", () => ({
  commonUtil: { getMaargURL: () => "https://example.test/rest/s1/" },
}));

vi.mock("@/utils/appCacheDb", () => ({
  appCacheDb: { syncMeta: { delete: vi.fn(async () => undefined) } },
  clearSyncMarkers: vi.fn(async () => undefined),
  ensureCacheIdentity: vi.fn(async () => false),
}));

vi.mock("@/store/user", () => ({ useUserStore: () => ({ current: { userId: "u1" } }) }));

describe("refreshAfterMutation during the app-load bootstrap", () => {
  beforeEach(async () => {
    harnessState.startResolved = false;
    harnessState.refetchCalls = [];
    harnessState.syncDomainCalls = [];
    harnessState.statusHandler = undefined;
    vi.resetModules();
  });

  it("does not drop the refresh when the worker is still starting", async () => {
    const mod = await import("@/services/appCacheBootstrap");

    // App.vue: fire-and-forget. `service` is assigned synchronously, `start()` is still pending.
    void mod.startReferenceSync();

    // A user saves something in that window.
    const written = await mod.refreshAfterMutation("facility", { facilityId: "F1" });

    expect(harnessState.refetchCalls).toHaveLength(1);
    // The refetch must not have been issued against a worker that does not exist yet.
    expect(harnessState.refetchCalls[0].whenStartResolved).toBe(true);
    expect(written).toBe(1);
  });

  it("does not drop a forced domain resync when the worker is still starting", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    void mod.startReferenceSync();

    await mod.resyncDomain("facilityGroup");

    expect(harnessState.syncDomainCalls).toEqual(["facilityGroup"]);
    expect(harnessState.startResolved).toBe(true);
  });

  it("still works when nothing started the bootstrap yet", async () => {
    const mod = await import("@/services/appCacheBootstrap");

    const written = await mod.refreshAfterMutation("productStore", { productStoreId: "STORE" });

    expect(harnessState.refetchCalls[0].whenStartResolved).toBe(true);
    expect(written).toBe(1);
  });

  it("clears a stale domain error when a later sync succeeds", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    await mod.startReferenceSync();

    harnessState.statusHandler?.({
      type: "sync-error",
      domain: "carrier",
      message: "HTTP 503",
    });

    expect(mod.bootstrapState.errors.carrier).toBe("HTTP 503");

    harnessState.statusHandler?.({
      type: "sync-end",
      domain: "carrier",
      written: 7,
    });

    expect(mod.bootstrapState.written.carrier).toBe(7);
    expect(mod.bootstrapState.errors).not.toHaveProperty("carrier");
  });
});
