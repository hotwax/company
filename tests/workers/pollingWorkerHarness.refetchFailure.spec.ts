import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  exposed: undefined as any,
  ensureDbReady: vi.fn(),
  setOmsInstanceResolver: vi.fn(),
  getDb: vi.fn(() => ({})),
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
  hasSyncedThisLogin: vi.fn(async () => true),
}));

vi.mock("@/db/companyDb", () => ({
  companyDb: {
    setOmsInstanceResolver: (...args: any[]) => harness.setOmsInstanceResolver(...args),
    get: (...args: any[]) => harness.getDb(...args),
    raw: vi.fn(() => ({})),
  },
}));

vi.mock("@common/db/baseDb", () => ({
  ensureDbReady: (...args: any[]) => harness.ensureDbReady(...args),
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
    harness.ensureDbReady.mockReset();
    harness.ensureDbReady.mockResolvedValue(undefined);
    harness.setOmsInstanceResolver.mockReset();
    harness.getDb.mockReset().mockReturnValue({});
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
    harness.ensureDbReady.mockRejectedValueOnce(new Error("IndexedDB unavailable"));

    await expect(harness.exposed.start({
      maargUrl: "https://example.test/rest/s1/",
      token: "token",
      omsInstance: "test-oms",
      domains: [],
    })).rejects.toThrow("cache open failed: IndexedDB unavailable");

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "sync-error",
      domain: "__start",
      message: "cache open failed: IndexedDB unavailable",
    });
  });

  it("registers the OMS instance resolver before opening the database, resolving to the payload's instance", async () => {
    await harness.exposed.start({
      maargUrl: "https://example.test/rest/s1/",
      token: "token",
      omsInstance: "acme-oms",
      domains: [],
    });

    expect(harness.setOmsInstanceResolver).toHaveBeenCalledTimes(1);
    expect(harness.getDb).toHaveBeenCalledWith("acme-oms");
    expect(harness.ensureDbReady).toHaveBeenCalledTimes(1);

    // Registration must precede every database access — a worker realm that opens the db
    // before the resolver is registered throws "no OMS instance resolver registered" the first
    // time anything downstream falls back to `companyDb.raw()`.
    const resolverCallOrder = harness.setOmsInstanceResolver.mock.invocationCallOrder[0];
    const getDbCallOrder = harness.getDb.mock.invocationCallOrder[0];
    const ensureDbReadyCallOrder = harness.ensureDbReady.mock.invocationCallOrder[0];
    expect(resolverCallOrder).toBeLessThan(getDbCallOrder);
    expect(resolverCallOrder).toBeLessThan(ensureDbReadyCallOrder);

    // The captured resolver must resolve to THIS payload's instance, not a stale/default one.
    const registeredResolver = harness.setOmsInstanceResolver.mock.calls[0][0];
    expect(registeredResolver()).toBe("acme-oms");
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
