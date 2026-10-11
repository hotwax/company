import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The per-tick REQUEST BUDGET of the live system-message domain.
 *
 * The domain's own header documents a quiet tick as costing "one 25-row page ... and writes zero
 * rows". That is the number this test pins down, because the cost is what justifies polling on a
 * 10s cadence at all: the domain fans out per (remote x type) AND re-reads every cached message
 * that has no `processedDate`, and neither multiplier is in that claim.
 *
 * Counted in fetch OPERATIONS: each `workerGet` is exactly one HTTP request; each
 * `pageNewestFirst` is one or more.
 */
const calls = vi.hoisted(() => ({ pageNewestFirst: [] as any[], workerGet: [] as any[] }));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageNewestFirst: vi.fn(async (options: any) => {
    calls.pageNewestFirst.push(options.params);
    return [];
  }),
  workerGet: vi.fn(async (_ctx: any, url: string, params: any) => {
    calls.workerGet.push({ url, params });
    return { systemMessages: [] };
  }),
  pageAll: vi.fn(async () => []),
  unwrapCollection: (resp: any) => (Array.isArray(resp) ? resp : []),
}));

/** Rows the cache would hold. `rowsMissing` is what drives the per-row refresh pass. */
const cacheState = vi.hoisted(() => ({ unprocessed: [] as any[] }));

vi.mock("@/utils/cacheEntities", () => ({
  systemMessageCache: {
    all: vi.fn(async () => []),
    newestCursor: vi.fn(async () => undefined),
    /**
     * Depth check. The domain pages DEEP while a scope holds fewer rows than its target and
     * incrementally once it is full, so a mock that reports an empty window would measure the
     * one-time backfill rather than the steady-state tick this budget is about.
     */
    count: vi.fn(async () => Number.MAX_SAFE_INTEGER),
    // Mirrors the real `rowsMissing` contract: bounded by AGE as well as count.
    rowsMissing: vi.fn(async (_field: string, options: any = {}) => {
      const { limit = 50, since } = options;
      const rows = since
        ? cacheState.unprocessed.filter(
            (row) => typeof row[since.field] === "number" && row[since.field] > since.afterMs,
          )
        : cacheState.unprocessed;
      return rows.slice(0, limit);
    }),
    upsertMany: vi.fn(async (rows: any[]) => rows.length),
  },
  // Two shops, each linked to one remote by remoteId === shopifyShopId.
  shopifyShopCache: {
    all: vi.fn(async () => [
      { shopId: "10000", shopifyShopId: "111" },
      { shopId: "10010", shopifyShopId: "222" },
    ]),
  },
  systemMessageRemoteCache: {
    all: vi.fn(async () => [
      { systemMessageRemoteId: "RemoteA", remoteId: "111", internalId: "10000" },
      { systemMessageRemoteId: "RemoteB", remoteId: "222", internalId: "10010" },
    ]),
  },
}));

describe("systemMessage domain per-tick request budget", () => {
  beforeEach(() => {
    calls.pageNewestFirst = [];
    calls.workerGet = [];
    cacheState.unprocessed = [];
    vi.resetModules();
  });

  async function runTick() {
    await import("@/workers/domains/systemMessageDomain");
    const { getSyncDomain } = await import("@/workers/syncRegistry");
    const domain = getSyncDomain("systemMessage")!;
    await domain.sync({ maargUrl: "https://x.test/", token: "t" }, {});
    return calls.pageNewestFirst.length + calls.workerGet.length;
  }

  it("costs one page per (remote x configured type) on a cold cache", async () => {
    const total = await runTick();
    // appSyncConfig declares 6 message types; the fixture has 2 remotes.
    expect(calls.pageNewestFirst).toHaveLength(12);
    expect(calls.workerGet).toHaveLength(0);
    expect(total).toBe(12);
  });

  it("costs ONE REQUEST PER recent unprocessed row, capped by refreshMax", async () => {
    // 40 recent messages that have not reached a processedDate yet.
    const now = Date.now();
    cacheState.unprocessed = Array.from({ length: 40 }, (_, i) => ({
      systemMessageId: `M${i}`,
      initDate: now - 60_000,
    }));

    const total = await runTick();

    // The refresh pass is per row, capped at the default 25 -> 12 pages + 25 gets.
    expect(calls.workerGet).toHaveLength(25);
    expect(calls.workerGet.every((c) => c.params.systemMessageId)).toBe(true);
    expect(total).toBe(37);
  });

  /**
   * The regression that matters. "No processedDate" is not "still in flight": an errored message
   * never gets one, so without an age bound the same rows are re-requested on every 10s tick for
   * the rest of the session — permanent request load that never converges.
   */
  it("does NOT re-request messages too old to still be in flight", async () => {
    const now = Date.now();
    cacheState.unprocessed = [
      { systemMessageId: "RECENT", initDate: now - 60_000 },
      { systemMessageId: "ALSO_RECENT", initDate: now - 5 * 60 * 1000 },
      { systemMessageId: "STUCK_OLD", initDate: now - 48 * 60 * 60 * 1000 },
      { systemMessageId: "STUCK_ANCIENT", initDate: now - 30 * 24 * 60 * 60 * 1000 },
    ];

    await runTick();

    const requested = calls.workerGet.map((c) => c.params.systemMessageId).sort();
    expect(requested).toEqual(["ALSO_RECENT", "RECENT"]);
  });

  it("honours an explicit refreshMaxAgeMs", async () => {
    const now = Date.now();
    cacheState.unprocessed = [
      { systemMessageId: "WITHIN", initDate: now - 30_000 },
      { systemMessageId: "OUTSIDE", initDate: now - 10 * 60 * 1000 },
    ];

    await import("@/workers/domains/systemMessageDomain");
    const { getSyncDomain } = await import("@/workers/syncRegistry");
    await getSyncDomain("systemMessage")!.sync(
      { maargUrl: "https://x.test/", token: "t" },
      { refreshMaxAgeMs: 60_000 },
    );

    expect(calls.workerGet.map((c) => c.params.systemMessageId)).toEqual(["WITHIN"]);
  });

  it("seeks the per-(remote,type) cursor through the index instead of reading the whole table", async () => {
    const { systemMessageCache } = await import("@/utils/cacheEntities");
    await runTick();

    // The old implementation called `.all()` once per (remote x type) — 12 full table reads a tick.
    expect(systemMessageCache.all).not.toHaveBeenCalled();
    expect(systemMessageCache.newestCursor).toHaveBeenCalledWith(
      "initDate",
      { field: "systemMessageRemoteId", value: expect.any(String) },
      { systemMessageTypeId: expect.any(String) },
    );
  });
});
