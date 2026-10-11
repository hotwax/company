import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WINDOW DEPTH — does a scope ever reach its configured `total`?
 *
 * The bug this pins down: with a cursor, `pageNewestFirst` stops at the first already-cached row, so
 * once anything is cached only page 0 is ever requested. A window first synced shallow stayed shallow
 * forever and raising `total` later did nothing.
 *
 * Measured live before the fix: the product-message window held 25 rows while configured for 100, and
 * the import window's newest row predated the message window's oldest — so the message ⋈ log join had
 * ZERO overlap and a shop that had synced the previous day reported as never having synced. "100
 * records is enough for one shop and guaranteed insufficient combined" is the same failure seen from
 * the scoping side; this is it seen from the depth side.
 *
 * The contract: short of target → page from 0 with NO cursor (walk past cached rows). At target →
 * one-page incremental read. Exactly one `pageNewestFirst` per (remote, type) either way, so the
 * steady-state tick budget is untouched.
 */
const calls = vi.hoisted(() => ({ pageNewestFirst: [] as any[] }));

vi.mock("@common/core/workerRemoteApi", () => ({
  pageNewestFirst: vi.fn(async (options: any) => {
    calls.pageNewestFirst.push(options);
    return [];
  }),
  workerGet: vi.fn(async () => ({ systemMessages: [] })),
  pageAll: vi.fn(async () => []),
  unwrapCollection: (resp: any) => (Array.isArray(resp) ? resp : []),
}));

/** How many rows the cache claims to hold for the scope under test. */
const cacheState = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/db/companyDb", () => ({
  companyDb: {
    entity: (table: string) => {
      if (table === "systemMessages") {
        return {
          all: vi.fn(async () => []),
          count: vi.fn(async () => cacheState.count),
          newestCursor: vi.fn(async () => 1_700_000_000_000),
          rowsMissing: vi.fn(async () => []),
          upsertMany: vi.fn(async (rows: any[]) => rows.length),
        };
      }
      if (table === "shopifyShops") {
        return { all: vi.fn(async () => [{ shopId: "10000", shopifyShopId: "111" }]) };
      }
      if (table === "systemMessageRemotes") {
        return {
          all: vi.fn(async () => [{ systemMessageRemoteId: "RemoteA", remoteId: "111", internalId: "10000" }]),
        };
      }
      return {};
    },
  },
}));

vi.mock("@/config/appSyncConfig", () => ({
  liveScopeFor: () => ({ scopeToShopifyShopRemotes: true, total: 100, batchSize: 25 }),
}));

vi.mock("@/utils/systemMessage", () => ({
  resolveShopRemoteIds: () => ["RemoteA"],
}));

vi.mock("@common/db", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    keepNewerThan: (page: any[]) => page,
  };
});

import { systemMessageDomain } from "@/workers/domains/systemMessageDomain";

const ctx = { maargUrl: "http://x", token: "t" } as any;

async function tick(args: any) {
  return systemMessageDomain.sync(ctx, args);
}

beforeEach(() => {
  calls.pageNewestFirst.length = 0;
  cacheState.count = 0;
});

const TYPE = { systemMessageTypeId: "BulkQueryShopifyProductUpdates", total: 100 };

describe("systemMessage window depth", () => {
  it("pages to the full target when the scope is EMPTY", async () => {
    cacheState.count = 0;
    await tick({ types: [TYPE] });

    expect(calls.pageNewestFirst).toHaveLength(1);
    expect(calls.pageNewestFirst[0].total).toBe(100);
  });

  it("pages to the full target when the scope is SHALLOW — the case that never used to happen", async () => {
    // 25 cached against a target of 100: exactly the live state that produced a zero-overlap join.
    cacheState.count = 25;
    await tick({ types: [TYPE] });

    expect(calls.pageNewestFirst[0].total).toBe(100);
  });

  it("sends NO cursor while deepening, so paging walks past rows already held", async () => {
    cacheState.count = 25;
    await tick({ types: [TYPE] });

    const options = calls.pageNewestFirst[0];
    // A `keep` bound is what stopped paging at the boundary; deepening must not have one.
    expect(options.keep).toBeUndefined();
    expect(options.params.initDate_from).toBeUndefined();
  });

  it("reverts to a ONE-PAGE incremental read once the window is full", async () => {
    cacheState.count = 100;
    await tick({ types: [TYPE] });

    const options = calls.pageNewestFirst[0];
    expect(options.total).toBe(25);
    expect(options.keep).toBeTypeOf("function");
  });

  it("treats over-full as full — a window past target never re-deepens", async () => {
    cacheState.count = 500;
    await tick({ types: [TYPE] });

    expect(calls.pageNewestFirst[0].total).toBe(25);
  });

  it("costs exactly one paging call per (remote, type) in both modes", async () => {
    cacheState.count = 25;
    await tick({ types: [TYPE] });
    expect(calls.pageNewestFirst).toHaveLength(1);

    calls.pageNewestFirst.length = 0;
    cacheState.count = 100;
    await tick({ types: [TYPE] });
    expect(calls.pageNewestFirst).toHaveLength(1);
  });
});
