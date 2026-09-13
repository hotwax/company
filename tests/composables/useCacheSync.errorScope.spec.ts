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
});
