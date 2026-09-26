import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  exposed: undefined as any,
  ensureCacheReady: vi.fn(),
  postMessage: vi.fn(),
  productStoreRefetchOne: vi.fn(),
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
  getSyncDomain: (name: string) => {
    if(name === "carrier") {
      return {
        refetchOne: (...args: any[]) => harness.refetchOne(...args),
        sync: (...args: any[]) => harness.syncDomain(...args),
      };
    }
    if(name === "productStore") {
      return {
        refetchOne: (...args: any[]) => harness.productStoreRefetchOne(...args),
        sync: vi.fn(() => Promise.resolve(1)),
      };
    }

    return undefined;
  },
  registeredDomainNames: vi.fn(() => ["carrier", "productStore"]),
}));

describe("polling worker targeted refetch failures", () => {
  beforeEach(async () => {
    vi.resetModules();
    harness.exposed = undefined;
    harness.ensureCacheReady.mockReset();
    harness.ensureCacheReady.mockResolvedValue(undefined);
    harness.postMessage.mockReset();
    harness.productStoreRefetchOne.mockReset().mockResolvedValue(1);
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

  it("waits for an earlier full snapshot before refetching the same domain", async () => {
    let resolveSync!: (written: number) => void;
    harness.syncDomain.mockImplementationOnce(() =>
      new Promise<number>((resolve) => {resolveSync = resolve;}));
    harness.refetchOne.mockResolvedValueOnce(1);

    const snapshot = harness.exposed.syncDomainNow("carrier");
    await vi.waitFor(() => expect(harness.syncDomain).toHaveBeenCalledTimes(1));
    const refetch = harness.exposed.refetchOne({
      domain: "carrier",
      pk: { partyId: "FEDEX" },
    });

    await Promise.resolve();
    expect(harness.refetchOne).not.toHaveBeenCalled();

    resolveSync(7);
    await expect(snapshot).resolves.toBe(7);
    await expect(refetch).resolves.toBe(1);
  });

  it("waits for an earlier targeted refetch before snapshotting the same domain", async () => {
    let resolveRefetch!: (written: number) => void;
    harness.refetchOne.mockImplementationOnce(() =>
      new Promise<number>((resolve) => {resolveRefetch = resolve;}));

    const refetch = harness.exposed.refetchOne({
      domain: "carrier",
      pk: { partyId: "FEDEX" },
    });
    await vi.waitFor(() => expect(harness.refetchOne).toHaveBeenCalledTimes(1));
    const snapshot = harness.exposed.syncDomainNow("carrier");

    await Promise.resolve();
    expect(harness.syncDomain).not.toHaveBeenCalled();

    resolveRefetch(1);
    await expect(refetch).resolves.toBe(1);
    await expect(snapshot).resolves.toBe(1);
  });

  it("keeps a different domain concurrent with an in-flight full snapshot", async () => {
    let resolveSync!: (written: number) => void;
    harness.syncDomain.mockImplementationOnce(() =>
      new Promise<number>((resolve) => {resolveSync = resolve;}));

    const snapshot = harness.exposed.syncDomainNow("carrier");
    await vi.waitFor(() => expect(harness.syncDomain).toHaveBeenCalledTimes(1));
    const productStoreRefetch = harness.exposed.refetchOne({
      domain: "productStore",
      pk: { productStoreId: "STORE" },
    });

    await expect(productStoreRefetch).resolves.toBe(1);
    resolveSync(1);
    await expect(snapshot).resolves.toBe(1);
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
