import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: vi.fn(async (options: any) => { state.pageAllParams = options.params; return state.pageAllResponse; }),
  workerGet: vi.fn(async () => state.getResponse),
  // The real implementation: a `collectionKey` that is absent yields NO rows.
  unwrapCollection: (resp: any, collectionKey?: string | null) => {
    if (Array.isArray(resp)) return resp;
    if (collectionKey && Array.isArray(resp?.[collectionKey])) return resp[collectionKey];
    return [];
  },
}));

vi.mock("@/utils/appCacheDb", () => ({
  appCacheDb: { table: () => ({ count: async () => 1 }) },
  defineCachedEntity: () => ({
    table: "serviceJobs",
    snapshotReplace: vi.fn(async (rows: any[], scope: any) => {
      state.snapshots.push({ rows, scope });
      return { written: rows.length, pruned: 0 };
    }),
    upsertMany: vi.fn(async (rows: any[]) => { state.upserted.push(...rows); return rows.length; }),
    remove: vi.fn(async (key: string) => { state.removed.push(key); }),
  }),
  hasSyncedThisLogin: vi.fn(async () => false),
  markSyncedThisLogin: vi.fn(async () => undefined),
}));

const ctx = { maargUrl: "https://x.test/", token: "t" };

async function register(config: any) {
  vi.resetModules();
  const { registerSnapshotDomain } = await import("@/workers/domains/snapshotDomain");
  registerSnapshotDomain(config);
  const { getSyncDomain } = await import("@/workers/syncRegistry");
  return getSyncDomain(config.name)!;
}

const JOB_CONFIG = {
  name: "serviceJobTest",
  table: "serviceJobs" as const,
  projection: { keyField: "jobName", fields: { jobName: "text" as const } },
  listUrl: "admin/serviceJobs",
  collectionKey: "serviceJobList",
  byPk: (pk: any) => ({ url: `admin/serviceJobs/${pk.jobName}` }),
  byPkRecordKey: "jobDetail",
};

const REMOTE_CONFIG = {
  name: "systemMessageRemoteTest",
  table: "systemMessageRemotes" as const,
  projection: { keyField: "systemMessageRemoteId", fields: { systemMessageRemoteId: "text" as const } },
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
});

describe("by-PK refresh through a single-record envelope", () => {
  it("stores the RECORD, not the envelope, so the row keeps its key", async () => {
    const job = { jobName: "queue_ShopifyOrderSync_99992", paused: "Y", cronExpression: "0 0/5 * * * ?" };
    state.getResponse = { jobDetail: job };
    const domain = await register(JOB_CONFIG);

    const written = await domain.refetchOne!(ctx as any, { jobName: job.jobName });

    expect(written).toBe(1);
    expect(state.upserted).toEqual([job]);
    // The regression: storing the envelope would key on `undefined` and silently drop the row.
    expect(state.upserted[0].jobName).toBe(job.jobName);
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
    // Scoped so the prune cannot reach any other remote.
    expect(state.snapshots).toEqual([
      { rows: [remote], scope: { field: "systemMessageRemoteId", value: "99992_REMOTE" } },
    ]);
  });

  it("refuses an unscoped prune when the mutation supplied no id", async () => {
    state.pageAllResponse = [];
    const domain = await register(REMOTE_CONFIG);

    const written = await domain.refetchOne!(ctx as any, {});

    expect(written).toBe(0);
    expect(state.snapshots).toEqual([]);
  });
});
