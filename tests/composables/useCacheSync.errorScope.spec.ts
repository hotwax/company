/* eslint-disable require-await -- service mocks intentionally preserve the production async API */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  options: undefined as any,
  service: {
    start: vi.fn(async () => undefined),
    syncNow: vi.fn(async () => undefined),
    setDomains: vi.fn(async () => undefined),
    syncDomainNow: vi.fn(async () => 0),
    refetchOne: vi.fn(async () => 0),
    registeredDomains: vi.fn(async () => []),
    stop: vi.fn(),
  },
}));

vi.mock("vue", async (importOriginal) => ({
  ...await importOriginal<any>(),
  onUnmounted: vi.fn(),
}));

vi.mock("@/services/pollingService", () => ({
  createSyncService: (options: any) => {
    harness.options = options;

    return harness.service;
  },
}));

import { useCacheSync } from "@/composables/useCacheSync";

describe("useCacheSync error scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.options = undefined;
  });

  it("clears only the domain whose later sync succeeds", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "shopifyTransferSync" }, { name: "serviceJob" }]);

    harness.options.onStatus({ type: "sync-error", domain: "shopifyTransferSync", message: "transfer failed" });
    harness.options.onStatus({ type: "sync-error", domain: "serviceJob", message: "jobs failed" });
    expect(sync.error.value).toBe("serviceJob: jobs failed");

    harness.options.onStatus({ type: "sync-end", domain: "serviceJob", written: 2, at: 100 });
    expect(sync.error.value).toBe("shopifyTransferSync: transfer failed");

    harness.options.onStatus({ type: "sync-end", domain: "shopifyTransferSync", written: 1, at: 101 });
    expect(sync.error.value).toBe("");
  });

  it("clears a stale domain error when a manual retry posts sync-end", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "shopifyTransferSync" }]);
    harness.options.onStatus({ type: "sync-error", domain: "shopifyTransferSync", message: "transfer failed" });
    harness.service.syncNow.mockImplementationOnce(async () => {
      harness.options.onStatus({ type: "sync-end", domain: "shopifyTransferSync", written: 0, at: 102 });
    });

    await sync.syncNow();

    expect(sync.error.value).toBe("");
  });

  /**
   * `error` is retired at every cycle start, which is right for "the most recent attempt" and wrong for
   * anything rendered from it: a domain that fails every tick blinked out and back in each cycle.
   * `failingDomains` holds each domain's latest outcome instead.
   */
  it("keeps a failing domain steady across cycle boundaries until it succeeds", async () => {
    const sync = useCacheSync();
    await sync.start([{ name: "inventoryEventProduct" }, { name: "shopifyInventoryAdjustmentDetail" }]);

    harness.options.onStatus({ type: "sync-cycle-start" });
    harness.options.onStatus({ type: "sync-error", domain: "inventoryEventProduct", message: "404" });
    harness.options.onStatus({ type: "sync-cycle-end", at: 1 });
    const settled = sync.failingDomains.value;

    harness.options.onStatus({ type: "sync-cycle-start" });
    expect(sync.error.value).toBe("");
    expect(sync.failingDomains.value).toEqual({ inventoryEventProduct: "404" });
    harness.options.onStatus({ type: "sync-error", domain: "inventoryEventProduct", message: "404" });
    // The same failure again is not a change, so nothing rendered from it re-renders.
    expect(sync.failingDomains.value).toBe(settled);

    harness.options.onStatus({ type: "sync-end", domain: "inventoryEventProduct", written: 0, at: 2 });
    expect(sync.failingDomains.value).toEqual({});
  });
});
