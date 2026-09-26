import { beforeEach, describe, expect, it, vi } from "vitest";

/* eslint-disable require-await -- service mocks deliberately implement the production async API */

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
  startCalls: 0,
  startResolved: false,
  startError: null as Error | null,
  refetchError: null as Error | null,
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
      start: () => {
        harnessState.startCalls += 1;

        return new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            if(harnessState.startError) {
              harnessState.statusHandler?.({
                type: "sync-error",
                message: harnessState.startError.message,
              });
              reject(harnessState.startError);

              return;
            }
            harnessState.startResolved = true;
            resolve();
          }, 5);
        });
      },
      // Mirrors pollingService: returns 0 while `harness` is still null.
      refetchOne: async (domain: string) => {
        harnessState.refetchCalls.push({ domain, whenStartResolved: harnessState.startResolved });
        if(harnessState.refetchError) {throw harnessState.refetchError;}

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
    harnessState.startCalls = 0;
    harnessState.startResolved = false;
    harnessState.startError = null;
    harnessState.refetchError = null;
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

  it("clears only the recovered scope when a targeted refetch succeeds", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    await mod.startReferenceSync();

    harnessState.statusHandler?.({
      type: "sync-error",
      domain: "carrier",
      scope: "{\"partyId\":\"FEDEX\"}",
      message: "FEDEX HTTP 503",
    });
    harnessState.statusHandler?.({
      type: "sync-error",
      domain: "carrier",
      scope: "{\"partyId\":\"UPS\"}",
      message: "UPS HTTP 503",
    });
    expect(mod.bootstrapState.errors.carrier).toBe("UPS HTTP 503");

    harnessState.statusHandler?.({
      type: "refetch-end",
      domain: "carrier",
      scope: "{\"partyId\":\"FEDEX\"}",
      written: 1,
    });

    expect(mod.bootstrapState.written.carrier).toBe(1);
    expect(mod.bootstrapState.errors.carrier).toBe("UPS HTTP 503");
  });

  it("clears every scoped error only after a domain-wide resync succeeds", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    await mod.startReferenceSync();

    harnessState.statusHandler?.({
      type: "sync-error",
      domain: "carrier",
      scope: "{\"partyId\":\"FEDEX\"}",
      message: "FEDEX HTTP 503",
    });
    harnessState.statusHandler?.({
      type: "sync-error",
      domain: "carrier",
      scope: "{\"partyId\":\"UPS\"}",
      message: "UPS HTTP 503",
    });

    harnessState.statusHandler?.({
      type: "sync-end",
      domain: "carrier",
      written: 7,
    });

    expect(mod.bootstrapState.errors).not.toHaveProperty("carrier");
  });

  it("records and clears a service-level refetch rejection under the canonical PK scope", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    await mod.startReferenceSync();
    const cause = new Error("carrier refetch HTTP 503");
    harnessState.refetchError = cause;
    const pk = { roleTypeId: "CARRIER", partyId: "FEDEX" };

    await expect(mod.refreshAfterMutation("carrier", pk))
      .rejects.toMatchObject({
        name: "CacheReconciliationError",
        mutationCommitted: true,
        domain: "carrier",
        pk,
        cause,
      });
    expect(mod.bootstrapState.errors.carrier).toBe(cause.message);

    harnessState.statusHandler?.({
      type: "refetch-end",
      domain: "carrier",
      scope: "{\"partyId\":\"FEDEX\",\"roleTypeId\":\"CARRIER\"}",
      written: 1,
    });

    expect(mod.bootstrapState.errors).not.toHaveProperty("carrier");
  });

  it("does not reorder a worker-recorded scoped error when the service rejects it again", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    await mod.startReferenceSync();

    harnessState.statusHandler?.({
      type: "sync-error",
      domain: "carrier",
      scope: "{\"partyId\":\"FEDEX\"}",
      message: "FEDEX HTTP 503",
    });
    harnessState.statusHandler?.({
      type: "sync-error",
      domain: "carrier",
      scope: "{\"partyId\":\"UPS\"}",
      message: "UPS HTTP 503",
    });
    harnessState.refetchError = new Error("FEDEX HTTP 503");

    await expect(mod.refreshAfterMutation("carrier", { partyId: "FEDEX" }))
      .rejects.toMatchObject({ name: "CacheReconciliationError" });

    expect(mod.bootstrapState.errors.carrier).toBe("UPS HTTP 503");
  });

  it("wraps a missing service after a concurrent stop instead of silently returning zero", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    const refresh = mod.refreshAfterMutation("carrier", { partyId: "FEDEX" });

    mod.stopReferenceSync();

    await expect(refresh).rejects.toMatchObject({
      name: "CacheReconciliationError",
      mutationCommitted: true,
      domain: "carrier",
      pk: { partyId: "FEDEX" },
    });
  });

  it("records domainless startup failures globally and clears them only after recovery", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    harnessState.startError = new Error("cache open failed: IndexedDB unavailable");

    await mod.startReferenceSync();
    expect(mod.bootstrapState.errors.__start)
      .toBe("cache open failed: IndexedDB unavailable");

    mod.stopReferenceSync();
    expect(mod.bootstrapState.errors.__start)
      .toBe("cache open failed: IndexedDB unavailable");

    harnessState.startError = null;
    await mod.startReferenceSync();

    expect(mod.bootstrapState.errors).not.toHaveProperty("__start");
  });

  it("restarts a failed bootstrap from the visible domain-refresh path", async () => {
    const mod = await import("@/services/appCacheBootstrap");
    harnessState.startError = new Error("cache open failed: IndexedDB unavailable");

    await mod.startReferenceSync();
    expect(harnessState.startCalls).toBe(1);
    expect(mod.bootstrapState.errors.__start)
      .toBe("cache open failed: IndexedDB unavailable");

    harnessState.startError = null;
    await mod.resyncDomain("carrier");

    expect(harnessState.startCalls).toBe(2);
    expect(harnessState.syncDomainCalls).toEqual(["carrier"]);
    expect(mod.bootstrapState.errors).not.toHaveProperty("__start");
  });
});
