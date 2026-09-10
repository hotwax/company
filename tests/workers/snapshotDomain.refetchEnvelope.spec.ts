import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineEntity } from "@common/db/defineEntity";

/**
 * A write-through that stores NOTHING is the worst kind of cache bug: the mutation succeeds, the
 * screen keeps rendering the pre-write row, and no error is raised anywhere. Two real instances,
 * both found by QA driving the live app, are pinned here.
 *
 * 1. `serviceJob`'s by-PK route answers a SINGLE-RECORD ENVELOPE — `{ jobDetail: { … } }` — while its
 *    list route answers `{ serviceJobList: [ … ] }`. The refresh stored the envelope, whose `jobName`
 *    is undefined, so the row was dropped: every serviceJob write-through (configure, schedule save,
 *    pause/resume, product-sync setup) left the cache stale until the next login. Verified live —
 *    creating `queue_ShopifyOrderSync_99992` left the cache at its pre-write 156 rows.
 *
 * 2. `systemMessageRemote` had NO working by-PK route at all: `GET oms/systemMessageRemotes/{id}`
 *    answers 405 for every id. So a brand-new Shopify connection's remote never reached the cache and
 *    the sync screens reported "Shopify remote: Unavailable" for a remote that existed on the server.
 *    The list route filters by id, so the domain re-lists that one id via `refetchScope` instead.
 */

const state = vi.hoisted(() => ({
  getResponse: null as any,
  pageAllResponse: [] as any[],
  pageAllParams: null as any,
  upserted: [] as any[],
  snapshots: [] as Array<{ rows: any[]; scope: any }>,
  removed: [] as string[],
  lastScope: undefined as any,
}));

vi.mock("@common/core/workerRemoteApi", () => ({
  pageAll: vi.fn(async (options: any) => { state.pageAllParams = options.params; return state.pageAllResponse; }),
  pageNewestFirst: vi.fn(async () => []),
  workerGet: vi.fn(async () => state.getResponse),
  workerPost: vi.fn(async () => null),
  unwrapCollection: (resp: any, collectionKey?: string | null) => {
    if (Array.isArray(resp)) return resp;
    if (collectionKey && Array.isArray(resp?.[collectionKey])) return resp[collectionKey];
    return [];
  },
}));

const stubDb = () => ({
  table: () => ({
    count: async () => 1,
    toArray: async () => [],
    toCollection: () => ({ primaryKeys: async () => [], toArray: async () => [] }),
    // Record the scope a prune was narrowed to; the refetchScope tests assert on it.
    where: (field: string) => ({
      equals: (value: unknown) => {
        state.lastScope = { field, value };
        return { toArray: async () => [] };
      },
    }),
    put: async (record: any) => { state.upserted.push(record); },
    bulkPut: async (rows: any[]) => {
      state.upserted.push(...rows);
      state.snapshots.push({ rows, scope: state.lastScope ?? null });
      state.lastScope = undefined;
    },
    delete: async (key: string) => { state.removed.push(key); },
    bulkDelete: async () => {},
  }),
  transaction: async (_mode: any, _tables: any, fn: () => Promise<any>) => fn(),
  syncMeta: { get: async () => undefined, put: async () => {}, delete: async () => {} },
}) as any;

const ctx = { maargUrl: "https://x.test/", token: "t" };

async function register(config: any) {
  vi.resetModules();
  const { registerSnapshotDomain } = await import("@common/db/sync/defineSnapshotDomain");
  return registerSnapshotDomain(config, () => stubDb());
}

const JOB_CONFIG = {
  name: "serviceJobTest",
  table: "serviceJobs" as const,
  projection: defineEntity({ primaryKey: "jobName", fields: { jobName: "text" } }),
  listUrl: "admin/serviceJobs",
  collectionKey: "serviceJobList",
  byPk: (pk: any) => ({ url: `admin/serviceJobs/${pk.jobName}` }),
  byPkRecordKey: "jobDetail",
};

const REMOTE_CONFIG = {
  name: "systemMessageRemoteTest",
  table: "systemMessageRemotes" as const,
  projection: defineEntity({ primaryKey: "systemMessageRemoteId", fields: { systemMessageRemoteId: "text" } }),
  listUrl: "oms/systemMessageRemotes",
  collectionKey: "systemMessageRemoteList",
  refetchScope: (pk: any) => ({
    params: { systemMessageRemoteId: pk.systemMessageRemoteId },
    scope: { field: "systemMessageRemoteId", value: pk.systemMessageRemoteId },
  }),
};

beforeEach(() => {
  state.getResponse = null;
  state.pageAllResponse = [];
  state.pageAllParams = null;
  state.upserted = [];
  state.snapshots = [];
  state.removed = [];
  state.lastScope = undefined;
});

describe("by-PK refresh through a single-record envelope", () => {
  it("stores the RECORD, not the envelope, so the row keeps its key", async () => {
    const job = { jobName: "queue_ShopifyOrderSync_99992", paused: "Y", cronExpression: "0 0/5 * * * ?" };
    state.getResponse = { jobDetail: job };
    const domain = await register(JOB_CONFIG);

    const written = await domain.refetchOne!(ctx as any, { jobName: job.jobName });

    expect(written).toBe(1);
    expect(state.upserted).toHaveLength(1);
    expect(state.upserted[0].jobName).toBe("queue_ShopifyOrderSync_99992");
    expect(state.upserted[0]).toHaveProperty("syncedAt");
  });

  it("drops a row the server no longer returns, rather than keeping a ghost", async () => {
    state.getResponse = { jobDetail: null };
    const domain = await register(JOB_CONFIG);

    const written = await domain.refetchOne!(ctx as any, { jobName: "gone_job" });

    expect(written).toBe(0);
    expect(state.removed).toEqual(["gone_job"]);
  });
});

describe("scoped refresh for a domain with no by-PK route", () => {
  it("re-lists just that id and snapshot-replaces only its scope", async () => {
    const remote = { systemMessageRemoteId: "99992_REMOTE", internalId: "99992" };
    state.pageAllResponse = [remote];
    const domain = await register(REMOTE_CONFIG);

    const written = await domain.refetchOne!(ctx as any, { systemMessageRemoteId: "99992_REMOTE" });

    expect(written).toBe(1);
    expect(state.pageAllParams).toEqual({ systemMessageRemoteId: "99992_REMOTE" });
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].rows[0]).toMatchObject({ systemMessageRemoteId: "99992_REMOTE" });
    expect(state.snapshots[0].scope).toEqual({ field: "systemMessageRemoteId", value: "99992_REMOTE" });
  });

  it("refuses an unscoped prune when the mutation supplied no id", async () => {
    state.pageAllResponse = [];
    const domain = await register(REMOTE_CONFIG);

    const written = await domain.refetchOne!(ctx as any, {});

    expect(written).toBe(0);
    expect(state.snapshots).toEqual([]);
  });
});
