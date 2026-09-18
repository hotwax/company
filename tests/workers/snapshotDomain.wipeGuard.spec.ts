import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineEntity } from "@common/db/defineEntity";

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

vi.mock("@common/core/workerRemoteApi", () => ({
  pageAll: vi.fn(async () => state.fetched),
  pageNewestFirst: vi.fn(async () => []),
  workerGet: vi.fn(async () => null),
  workerPost: vi.fn(async () => null),
  unwrapCollection: (resp: any) => (Array.isArray(resp) ? resp : []),
}));

vi.mock("@common/db/baseDb", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    hasSyncedThisLogin: vi.fn(async () => state.syncedAlready),
    markSyncedThisLogin: vi.fn(async (_db: any, name: string) => { state.marked.push(name); }),
  };
});

const stubDb = () => ({
  table: () => ({
    count: async () => state.cachedCount,
    toArray: async () => [],
    toCollection: () => ({
      primaryKeys: async () => Array.from({ length: state.cachedCount }, (_, i) => `K${i}`),
      toArray: async () => [],
    }),
    where: () => ({ equals: () => ({ toArray: async () => [] }) }),
    bulkPut: async (rows: any[]) => { state.snapshotCalls.push(rows); },
    bulkDelete: async (keys: any[]) => { state.snapshotCalls.push(keys); },
    put: async () => {},
    delete: async () => {},
  }),
  transaction: async (_mode: any, _tables: any, fn: () => Promise<any>) => fn(),
  syncMeta: { get: async () => undefined, put: async () => {}, delete: async () => {} },
}) as any;

const CONFIG = {
  name: "productStoreTest",
  table: "productStores" as const,
  projection: defineEntity({ primaryKey: "productStoreId", fields: { productStoreId: "text" } }),
  listUrl: "admin/productStores",
  collectionKey: null,
};

const ctx = { maargUrl: "https://x.test/", token: "t" };

async function register() {
  vi.resetModules();
  const { registerSnapshotDomain } = await import("@common/db/sync/defineSnapshotDomain");
  return registerSnapshotDomain(CONFIG as any, () => stubDb());
}

beforeEach(() => {
  state.fetched = [];
  state.cachedCount = 0;
  state.snapshotCalls = [];
  state.marked = [];
  state.syncedAlready = false;
});

describe("snapshot domain zero-row wipe guard", () => {
  it("refuses to snapshot when the fetch is empty but the cache holds rows", async () => {
    state.fetched = [];
    state.cachedCount = 5;
    const domain = await register();

    const written = await domain.sync(ctx as any, undefined, { force: false });

    expect(written).toBe(0);
    expect(state.snapshotCalls).toHaveLength(0);
    // Crucial: not marked synced, so the next tick retries.
    expect(state.marked).toHaveLength(0);
  });

  it("allows an empty snapshot when the cache is also empty (a genuinely empty set)", async () => {
    state.fetched = [];
    state.cachedCount = 0;
    const domain = await register();

    const written = await domain.sync(ctx as any, undefined, { force: false });

    expect(written).toBe(0);
    expect(state.marked).toEqual(["productStoreTest"]);
  });

  it("lets a manual resync (force) clear a table deliberately", async () => {
    state.fetched = [];
    state.cachedCount = 5;
    const domain = await register();

    const written = await domain.sync(ctx as any, undefined, { force: true });

    expect(written).toBe(0);
    expect(state.snapshotCalls).toHaveLength(1);
    expect(state.marked).toEqual(["productStoreTest"]);
  });

  it("snapshots normally when the fetch returns rows", async () => {
    state.fetched = [{ productStoreId: "STORE_1" }];
    state.cachedCount = 5;
    const domain = await register();

    const written = await domain.sync(ctx as any, undefined, { force: false });

    expect(written).toBe(1);
    expect(state.snapshotCalls).toHaveLength(2); // 1 bulkDelete (stale keys) + 1 bulkPut
    expect(state.snapshotCalls[1][0]).toMatchObject({ productStoreId: "STORE_1" });
    expect(state.snapshotCalls[1][0]).toHaveProperty("syncedAt");
    expect(state.marked).toEqual(["productStoreTest"]);
  });
});
