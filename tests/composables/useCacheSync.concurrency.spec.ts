import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCacheSync } from "@/composables/useCacheSync";

const serviceState = vi.hoisted(() => ({
  onStatus: undefined as ((status: Record<string, unknown>) => void) | undefined,
  resolveSyncNow: undefined as (() => void) | undefined,
}));

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();

  return { ...actual, onUnmounted: vi.fn() };
});

vi.mock("@/services/pollingService", () => ({
  createSyncService: (options: { onStatus?: (status: Record<string, unknown>) => void }) => {
    serviceState.onStatus = options.onStatus;

    return {
      start: vi.fn(() => Promise.resolve()),
      syncNow: vi.fn(() => new Promise<void>((resolve) => {
        serviceState.resolveSyncNow = resolve;
      })),
      setDomains: vi.fn(() => Promise.resolve()),
      refetchOne: vi.fn(() => Promise.resolve(0)),
      registeredDomains: vi.fn(() => Promise.resolve(["first", "second"])),
      stop: vi.fn(),
    };
  },
}));

describe("useCacheSync cycle status", () => {
  beforeEach(() => {
    serviceState.onStatus = undefined;
    serviceState.resolveSyncNow = undefined;
  });

  it("stays busy until the whole multi-domain cycle ends", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "first" }, { name: "second" }]);

    serviceState.onStatus?.({ type: "sync-cycle-start" });
    serviceState.onStatus?.({ type: "sync-start", domain: "first" });
    serviceState.onStatus?.({ type: "sync-end", domain: "first", written: 2, at: 10 });

    expect(sync.busy.value).toBe(true);
    expect(sync.manualRefreshing.value).toBe(false);
    expect(sync.domainStatus.value.first).toEqual({ written: 2, at: 10 });

    serviceState.onStatus?.({ type: "sync-start", domain: "second" });
    serviceState.onStatus?.({ type: "sync-error", domain: "second", message: "offline" });
    serviceState.onStatus?.({ type: "sync-end", domain: "first", written: 3, at: 15 });

    expect(sync.busy.value).toBe(true);
    expect(sync.error.value).toBe("second: offline");

    serviceState.onStatus?.({ type: "sync-cycle-end", at: 20 });

    expect(sync.busy.value).toBe(false);
    expect(sync.lastSyncAt.value).toBe(20);
    expect(sync.error.value).toBe("second: offline");
  });

  it("retires a prior failure when a newer background cycle succeeds", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "first" }]);

    serviceState.onStatus?.({ type: "sync-cycle-start" });
    serviceState.onStatus?.({ type: "sync-error", domain: "first", message: "offline" });
    serviceState.onStatus?.({ type: "sync-cycle-end", at: 20 });

    expect(sync.error.value).toBe("first: offline");

    serviceState.onStatus?.({ type: "sync-cycle-start" });

    expect(sync.error.value).toBe("");
    expect(sync.busy.value).toBe(true);

    serviceState.onStatus?.({ type: "sync-end", domain: "first", written: 1, at: 30 });
    serviceState.onStatus?.({ type: "sync-cycle-end", at: 31 });

    expect(sync.error.value).toBe("");
    expect(sync.busy.value).toBe(false);
  });

  it("preserves the latest authentication failure when its cycle ends", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "first" }]);

    serviceState.onStatus?.({ type: "sync-cycle-start" });
    serviceState.onStatus?.({ type: "auth-error", message: "session expired" });
    serviceState.onStatus?.({ type: "sync-cycle-end", at: 32 });

    expect(sync.error.value).toBe("auth: session expired");
    expect(sync.busy.value).toBe(false);
  });

  it("keeps a manual refresh busy until the worker RPC itself resolves", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "first" }]);
    serviceState.onStatus?.({ type: "sync-error", domain: "first", message: "stale" });

    const refresh = sync.syncNow();

    expect(sync.error.value).toBe("");
    expect(sync.busy.value).toBe(true);
    expect(sync.manualRefreshing.value).toBe(true);

    serviceState.onStatus?.({ type: "sync-cycle-start" });
    serviceState.onStatus?.({ type: "sync-end", domain: "first", written: 1, at: 30 });
    serviceState.onStatus?.({ type: "sync-cycle-end", at: 31 });

    // The Comlink response is the completion contract. A status event arriving first must not make
    // the UI announce success while the worker call is still pending.
    expect(sync.busy.value).toBe(true);
    expect(sync.manualRefreshing.value).toBe(true);

    serviceState.resolveSyncNow?.();
    await refresh;

    expect(sync.busy.value).toBe(false);
    expect(sync.manualRefreshing.value).toBe(false);
  });

  it("keeps an in-flight failure until the queued manual cycle actually starts", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "first" }]);

    serviceState.onStatus?.({ type: "sync-cycle-start", force: false });
    serviceState.onStatus?.({ type: "sync-error", domain: "first", message: "offline" });

    const refresh = sync.syncNow();

    expect(sync.error.value).toBe("first: offline");
    expect(sync.busy.value).toBe(true);
    expect(sync.manualRefreshing.value).toBe(true);

    serviceState.onStatus?.({ type: "sync-cycle-end", at: 40, force: false });

    expect(sync.error.value).toBe("first: offline");

    serviceState.onStatus?.({ type: "sync-cycle-start", force: true });

    expect(sync.error.value).toBe("");

    serviceState.onStatus?.({ type: "sync-end", domain: "first", written: 1, at: 41 });
    serviceState.onStatus?.({ type: "sync-cycle-end", at: 42, force: true });
    serviceState.resolveSyncNow?.();
    await refresh;

    expect(sync.error.value).toBe("");
    expect(sync.busy.value).toBe(false);
    expect(sync.manualRefreshing.value).toBe(false);
  });

  it("does not carry a previous scope failure through re-scope or stop", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "first", args: { shopId: "OLD" } }]);
    serviceState.onStatus?.({ type: "sync-error", domain: "first", message: "old shop failed" });

    await sync.start([{ name: "first", args: { shopId: "NEW" } }]);

    expect(sync.error.value).toBe("");

    serviceState.onStatus?.({ type: "sync-error", domain: "first", message: "new shop failed" });
    sync.stop();

    expect(sync.error.value).toBe("");
    expect(sync.busy.value).toBe(false);
    expect(sync.manualRefreshing.value).toBe(false);
  });
});
