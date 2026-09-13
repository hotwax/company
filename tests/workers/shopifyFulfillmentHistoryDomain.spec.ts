/* eslint-disable require-await -- mocked async boundaries intentionally match worker/cache contracts */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULFILLMENT_HISTORY_ENDPOINT_MISSING } from "@/utils/cacheEntities";

/**
 * L1 unit — the shopifyFulfillmentHistory worker domain.
 *
 * The behavior worth locking is the 404 protocol: `sob/shopify/fulfillmentHistories` ships in a
 * connector release deployed independently of this app, so "endpoint absent" is an expected state
 * that must (a) raise the ONE stable message the screen recognizes, (b) record the verdict on the
 * shop's support row, and (c) stop touching the network on scheduled ticks — the failure mode this
 * guards against is a 10s poll hammering a missing resource with an error toast per tick.
 */

const state = vi.hoisted(() => ({
  cachedCount: 0,
  cursor: undefined as number | undefined,
  domains: [] as any[],
  fetchCalls: [] as any[],
  fetchError: undefined as unknown,
  refetchResponse: undefined as unknown,
  serverPage: [] as any[],
  supportRows: [] as any[],
  supportUpserts: [] as any[][],
  upserts: [] as any[][],
}));

vi.mock("@/utils/cacheEntities", async (importOriginal) => ({
  // The real module keeps `FULFILLMENT_HISTORY_ENDPOINT_MISSING` genuine — a copy pasted into the
  // mock could drift from what the domain actually throws and this suite would keep passing.
  ...(await importOriginal<typeof import("@/utils/cacheEntities")>()),
  shopifyFulfillmentHistoryCache: {
    count: vi.fn(async () => state.cachedCount),
    newestCursor: vi.fn(async () => state.cursor),
    upsertMany: vi.fn(async (rows: any[]) => {
      state.upserts.push(rows);

      return rows.length;
    }),
  },
  shopifyFulfillmentHistorySupportCache: {
    all: vi.fn(async () => state.supportRows),
    upsertMany: vi.fn(async (rows: any[]) => {
      state.supportUpserts.push(rows);

      return rows.length;
    }),
  },
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageNewestFirst: vi.fn(async (options: any) => {
    state.fetchCalls.push(options);
    if(state.fetchError) {throw state.fetchError;}

    return options.keep ? options.keep(state.serverPage) : state.serverPage;
  }),
  unwrapCollection: (resp: any) => (Array.isArray(resp) ? resp : []),
  workerGet: vi.fn(async () => state.refetchResponse),
}));

vi.mock("@/workers/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => { state.domains.push(domain); },
}));

const ctx = { maargUrl: "https://example.test", token: "token" } as any;

async function loadDomain() {
  vi.resetModules();
  state.domains = [];
  await import("@/workers/domains/shopifyFulfillmentHistoryDomain");

  return state.domains.find((domain) => domain.name === "shopifyFulfillmentHistory");
}

describe("shopifyFulfillmentHistory cache domain", () => {
  beforeEach(() => {
    state.cachedCount = 0;
    state.cursor = undefined;
    state.domains = [];
    state.fetchCalls = [];
    state.fetchError = undefined;
    state.refetchResponse = undefined;
    state.serverPage = [];
    state.supportRows = [];
    state.supportUpserts = [];
    state.upserts = [];
  });

  it("fetches nothing without a shop scope", async () => {
    const domain = await loadDomain();

    expect(await domain.sync(ctx, {})).toBe(0);
    expect(state.fetchCalls).toHaveLength(0);
  });

  it("caches the shop's rows newest-first and records the endpoint as supported", async () => {
    state.serverPage = [
      { shopId: "10000", fulfillmentId: "4471301884", shipmentId: "SHP-88801", lastUpdatedStamp: 300 },
      { fulfillmentId: "4471302915", shipmentId: "SHP-88815", lastUpdatedStamp: 200 },
    ];

    const domain = await loadDomain();
    const written = await domain.sync(ctx, { shopId: "10000" });

    expect(written).toBe(3); // 2 history rows + 1 support row
    expect(state.fetchCalls[0]).toMatchObject({
      url: "sob/shopify/fulfillmentHistories",
      params: { shopId: "10000", orderByField: "-lastUpdatedStamp" },
    });
    // The row the server sent without a shopId is stamped, so the synthetic key can be built.
    expect(state.upserts[0]).toEqual([
      expect.objectContaining({ shopId: "10000", fulfillmentId: "4471301884" }),
      expect.objectContaining({ shopId: "10000", fulfillmentId: "4471302915" }),
    ]);
    expect(state.supportUpserts[0]).toEqual([
      expect.objectContaining({ shopId: "10000", isSupported: "Y" }),
    ]);
  });

  it("skips the support write while the verdict holds", async () => {
    state.supportRows = [{ shopId: "10000", isSupported: "Y", checkedAt: 1 }];

    const domain = await loadDomain();
    await domain.sync(ctx, { shopId: "10000" });

    expect(state.supportUpserts).toHaveLength(0);
  });

  it("deepens a shallow window without a cursor, and reads one page once full", async () => {
    const domain = await loadDomain();

    // Shallow: 10 cached of a 200 target → page from 0 with no `keep`, asking for the full target.
    state.cachedCount = 10;
    state.cursor = 500;
    await domain.sync(ctx, { shopId: "10000" });
    expect(state.fetchCalls[0]).toMatchObject({ total: 200 });
    expect(state.fetchCalls[0].keep).toBeUndefined();

    // Full: at target → incremental read of one batch, bounded by the cursor.
    state.cachedCount = 200;
    state.serverPage = [
      { shopId: "10000", fulfillmentId: "1", lastUpdatedStamp: 600 },
      { shopId: "10000", fulfillmentId: "2", lastUpdatedStamp: 400 },
    ];
    await domain.sync(ctx, { shopId: "10000" });
    expect(state.fetchCalls[1]).toMatchObject({ total: 50 });
    // `keep` drops the at-or-below-cursor row, so a quiet tick writes nothing.
    expect(state.upserts[1]).toEqual([
      expect.objectContaining({ fulfillmentId: "1" }),
    ]);
  });

  it("turns a 404 into the stable endpoint-missing state and stops polling", async () => {
    state.fetchError = { errorCode: 404, errors: "Resource Not Found" };

    const domain = await loadDomain();

    await expect(domain.sync(ctx, { shopId: "10000" }))
      .rejects.toThrow(FULFILLMENT_HISTORY_ENDPOINT_MISSING);
    expect(state.supportUpserts[0]).toEqual([
      expect.objectContaining({ shopId: "10000", isSupported: "N" }),
    ]);

    // Scheduled ticks after the verdict: no request, no throw — the poll goes quiet.
    state.fetchError = undefined;
    expect(await domain.sync(ctx, { shopId: "10000" })).toBe(0);
    expect(await domain.sync(ctx, { shopId: "10000" })).toBe(0);
    expect(state.fetchCalls).toHaveLength(1);

    // A targeted refetch respects the verdict too.
    expect(await domain.refetchOne(ctx, { shopId: "10000", fulfillmentId: "1" })).toBe(0);
  });

  it("re-probes on a forced pass and heals once the endpoint answers", async () => {
    state.fetchError = { errorCode: 404, errors: "Resource Not Found" };
    const domain = await loadDomain();
    await expect(domain.sync(ctx, { shopId: "10000" })).rejects.toThrow();

    // The connector lands; the user pulls to refresh. The forced pass re-asks the question.
    state.fetchError = undefined;
    state.serverPage = [{ shopId: "10000", fulfillmentId: "1", lastUpdatedStamp: 100 }];
    const written = await domain.sync(ctx, { shopId: "10000" }, { force: true });

    expect(written).toBe(2); // 1 row + the support row flipping back to "Y"
    expect(state.supportUpserts[1]).toEqual([
      expect.objectContaining({ shopId: "10000", isSupported: "Y" }),
    ]);
    // And the ordinary cadence resumes.
    await domain.sync(ctx, { shopId: "10000" });
    expect(state.fetchCalls).toHaveLength(3);
  });

  it("leaves a non-404 failure to the ordinary retry path", async () => {
    state.fetchError = { errors: "Service temporarily unavailable" };

    const domain = await loadDomain();
    await expect(domain.sync(ctx, { shopId: "10000" })).rejects.toMatchObject({
      errors: "Service temporarily unavailable",
    });

    // No verdict recorded, and the next tick fetches again — a blip must not disable the feed.
    expect(state.supportUpserts).toHaveLength(0);
    state.fetchError = undefined;
    await domain.sync(ctx, { shopId: "10000" });
    expect(state.fetchCalls).toHaveLength(2);
  });

  it("refetches one fulfillment by its composite identity", async () => {
    state.refetchResponse = [{ fulfillmentId: "4471301884", lastUpdatedStamp: 100 }];

    const domain = await loadDomain();
    const written = await domain.refetchOne(ctx, { shopId: "10000", fulfillmentId: "4471301884" });

    expect(written).toBe(1);
    expect(state.upserts[0]).toEqual([
      expect.objectContaining({ shopId: "10000", fulfillmentId: "4471301884" }),
    ]);
  });
});
