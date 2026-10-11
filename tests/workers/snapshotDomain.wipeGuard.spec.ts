import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An automatic snapshot must never empty a populated table on the strength of a zero-row fetch.
 *
 * `snapshotReplace` prunes whatever the fetch did not return, so a fetch that yields nothing prunes
 * the entire scope — and a zero-row fetch is exactly what a soft failure looks like from here. The
 * chain that made this data loss silent: a non-JSON response was read as "no records", the snapshot
 * pruned every row, and `assertWrote(0, 0)` returned true so the domain was MARKED SYNCED and never
 * retried for the rest of the login.
 */
const state = vi.hoisted(() => ({
  fetched: [] as any[],
  cachedCount: 0,
  snapshotCalls: [] as any[],
  marked: [] as string[],
  syncedAlready: false,
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: vi.fn(async () => state.fetched),
  workerGet: vi.fn(async () => null),
  unwrapCollection: (resp: any) => (Array.isArray(resp) ? resp : []),
}));

vi.mock("@/utils/appCacheDb", () => ({
  appCacheDb: { table: () => ({ count: async () => state.cachedCount }) },
  defineCachedEntity: () => ({
    table: "productStores",
    snapshotReplace: vi.fn(async (rows: any[]) => {
      state.snapshotCalls.push(rows);
      return { written: rows.length, pruned: state.cachedCount };
    }),
    upsertMany: vi.fn(async (rows: any[]) => rows.length),
    remove: vi.fn(async () => undefined),
  }),
  hasSyncedThisLogin: vi.fn(async () => state.syncedAlready),
  markSyncedThisLogin: vi.fn(async (name: string) => { state.marked.push(name); }),
}));

const CONFIG = {
  name: "productStoreTest",
  table: "productStores" as const,
  projection: { keyField: "productStoreId", fields: { productStoreId: "text" as const } },
  listUrl: "admin/productStores",
  collectionKey: null,
};

const ctx = { maargUrl: "https://x.test/", token: "t" };

async function register() {
  vi.resetModules();
  const { registerSnapshotDomain } = await import("@/workers/domains/snapshotDomain");
  registerSnapshotDomain(CONFIG as any);
  const { getSyncDomain } = await import("@/workers/syncRegistry");
  return getSyncDomain("productStoreTest")!;
}

describe("snapshot domain zero-row wipe guard", () => {
  beforeEach(() => {
    state.fetched = [];
    state.cachedCount = 0;
    state.snapshotCalls = [];
    state.marked = [];
    state.syncedAlready = false;
  });

  it("refuses to snapshot when the fetch is empty but the cache holds rows", async () => {
    state.fetched = [];
    state.cachedCount = 17;

    const domain = await register();
    const written = await domain.sync(ctx, undefined, {});

    expect(written).toBe(0);
    expect(state.snapshotCalls).toHaveLength(0); // nothing pruned
    expect(state.marked).toEqual([]); // and NOT marked synced, so the next pass retries
  });

  it("allows an empty snapshot when the cache is also empty (a genuinely empty set)", async () => {
    state.fetched = [];
    state.cachedCount = 0;

    const domain = await register();
    await domain.sync(ctx, undefined, {});

    expect(state.snapshotCalls).toHaveLength(1);
    expect(state.marked).toEqual(["productStoreTest"]);
  });

  it("lets a manual resync (force) clear a table deliberately", async () => {
    state.fetched = [];
    state.cachedCount = 17;

    const domain = await register();
    await domain.sync(ctx, undefined, { force: true });

    expect(state.snapshotCalls).toHaveLength(1);
    expect(state.snapshotCalls[0]).toEqual([]);
  });

  it("snapshots normally when the fetch returns rows", async () => {
    state.fetched = [{ productStoreId: "STORE" }, { productStoreId: "STORE2" }];
    state.cachedCount = 17;

    const domain = await register();
    const written = await domain.sync(ctx, undefined, {});

    expect(written).toBe(2);
    expect(state.marked).toEqual(["productStoreTest"]);
  });
});
