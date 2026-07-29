import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  exposed: undefined as any,
  ensureCacheReady: vi.fn(),
  postMessage: vi.fn(),
  refetchOne: vi.fn(),
  syncDomain: vi.fn(),
}));

vi.mock("comlink", () => ({
  expose: (value: any) => {
    harness.exposed = value;
  },
}));

vi.mock("@/utils/appCacheDb", () => ({
  ensureCacheReady: (...args: any[]) => harness.ensureCacheReady(...args),
}));

vi.mock("@/utils/pollingTokenChannel", () => ({
  subscribeToken: vi.fn(),
}));

vi.mock("@/workers/syncRegistry", () => ({
  activationKey: (entry: any) => entry.name,
  dueDomains: vi.fn(() => []),
  effectiveInterval: vi.fn(),
  getSyncDomain: (name: string) => name === "carrier"
    ? {
      refetchOne: (...args: any[]) => harness.refetchOne(...args),
      sync: (...args: any[]) => harness.syncDomain(...args),
    }
    : undefined,
  registeredDomainNames: vi.fn(() => ["carrier"]),
}));

describe("polling worker targeted refetch failures", () => {
  beforeEach(async () => {
    vi.resetModules();
    harness.exposed = undefined;
    harness.ensureCacheReady.mockReset();
    harness.ensureCacheReady.mockResolvedValue(undefined);
    harness.postMessage.mockReset();
    harness.refetchOne.mockReset();
    harness.syncDomain.mockReset().mockResolvedValue(1);
    vi.stubGlobal("self", { postMessage: harness.postMessage });
    await import("@/workers/pollingWorkerHarness");
  });

  it("posts the domain error and rejects so mutation callers cannot report stale success", async () => {
    harness.refetchOne.mockRejectedValue(new Error("carrier refetch failed"));

    await expect(harness.exposed.refetchOne({
      domain: "carrier",
      pk: { partyId: "FEDEX" },
    })).rejects.toThrow("carrier refetch failed");

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "sync-error",
      domain: "carrier",
      scope: "{\"partyId\":\"FEDEX\"}",
      message: "carrier refetch failed",
    });
  });

  it("serializes targeted refetches for the same domain scope", async () => {
    let resolveFirst!: (written: number) => void;
    let resolveSecond!: (written: number) => void;
    harness.refetchOne
      .mockImplementationOnce(() => new Promise<number>((resolve) => {resolveFirst = resolve;}))
      .mockImplementationOnce(() => new Promise<number>((resolve) => {resolveSecond = resolve;}));

    const first = harness.exposed.refetchOne({
      domain: "carrier",
      pk: { partyId: "FEDEX" },
    });
    const second = harness.exposed.refetchOne({
      domain: "carrier",
      pk: { partyId: "FEDEX" },
    });

    await vi.waitFor(() => expect(harness.refetchOne).toHaveBeenCalledTimes(1));
    resolveFirst(1);
    await expect(first).resolves.toBe(1);
    await vi.waitFor(() => expect(harness.refetchOne).toHaveBeenCalledTimes(2));
    resolveSecond(1);
    await expect(second).resolves.toBe(1);
  });

  it("does not block a targeted refetch for an independent scope", async () => {
    let resolveFedEx!: (written: number) => void;
    let resolveUps!: (written: number) => void;
    harness.refetchOne
      .mockImplementationOnce(() => new Promise<number>((resolve) => {resolveFedEx = resolve;}))
      .mockImplementationOnce(() => new Promise<number>((resolve) => {resolveUps = resolve;}));

    const fedEx = harness.exposed.refetchOne({
      domain: "carrier",
      pk: { partyId: "FEDEX" },
    });
    const ups = harness.exposed.refetchOne({
      domain: "carrier",
      pk: { partyId: "UPS" },
    });

    await vi.waitFor(() => expect(harness.refetchOne).toHaveBeenCalledTimes(2));
    resolveFedEx(1);
    resolveUps(1);
    await expect(Promise.all([fedEx, ups])).resolves.toEqual([1, 1]);
  });

  it("marks cache-open failure as a global startup error and rejects start", async () => {
    harness.ensureCacheReady.mockRejectedValueOnce(new Error("IndexedDB unavailable"));

    await expect(harness.exposed.start({
      maargUrl: "https://example.test/rest/s1/",
      token: "token",
      domains: [],
    })).rejects.toThrow("cache open failed: IndexedDB unavailable");

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "sync-error",
      domain: "__start",
      message: "cache open failed: IndexedDB unavailable",
    });
  });

  it("rejects a missing targeted-refetch implementation", async () => {
    await expect(harness.exposed.refetchOne({
      domain: "missing",
      pk: { id: "1" },
    })).rejects.toThrow("domain has no refetchOne");

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "sync-error",
      domain: "missing",
      scope: "{\"id\":\"1\"}",
      message: "domain has no refetchOne",
    });
  });

  it("propagates a forced domain failure instead of reporting timestamp-based success", async () => {
    harness.syncDomain.mockRejectedValueOnce(new Error("carrier snapshot failed"));

    await expect(harness.exposed.syncDomainNow("carrier"))
      .rejects.toThrow("carrier snapshot failed");

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "sync-error",
      domain: "carrier",
      message: "carrier snapshot failed",
    });
  });
});
