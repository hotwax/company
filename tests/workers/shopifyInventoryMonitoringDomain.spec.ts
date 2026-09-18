import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  pageNewestFirst: [] as any[],
  pageAll: [] as any[],
  registered: [] as any[],
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageNewestFirst: vi.fn(async (options: any) => {
    calls.pageNewestFirst.push(options);
    return [];
  }),
  pageAll: vi.fn(async (options: any) => {
    calls.pageAll.push(options);
    return [];
  }),
  workerGet: vi.fn(async () => ({ systemMessages: [] })),
  unwrapCollection: (response: any) => (Array.isArray(response) ? response : []),
}));

vi.mock("@/workers/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => calls.registered.push(domain),
}));

vi.mock("@/utils/appCacheDb", () => ({
  hasSyncedThisLogin: vi.fn(async () => false),
  markSyncedThisLogin: vi.fn(async () => undefined),
}));

vi.mock("@/utils/cacheEntities", () => ({
  dataFeedCache: { snapshotReplace: vi.fn(async () => ({ written: 0 })) },
  inventoryChannelCache: { snapshotReplace: vi.fn(async () => ({ written: 0 })) },
  shopifyInventoryAdjustmentDetailCache: {
    all: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    upsertMany: vi.fn(async (rows: any[]) => rows.length),
  },
  shopifyInventoryAdjustmentDetailProjection: { buildKey: vi.fn() },
  systemMessageCache: { all: vi.fn(async () => []) },
}));

describe("Shopify inventory adjustment detail sync", () => {
  beforeEach(() => {
    calls.pageNewestFirst.length = 0;
    calls.pageAll.length = 0;
    calls.registered.length = 0;
    vi.resetModules();
  });

  it("orders recent ledger rows by the exposed createdDate timestamp", async () => {
    await import("@/workers/domains/shopifyInventoryMonitoringDomain");
    const domain = calls.registered.find((entry) => entry.name === "shopifyInventoryAdjustmentDetail");

    await domain.sync(
      { maargUrl: "https://example.test/", token: "test-token" },
      { inventoryChannelIds: ["100002"], total: 500, batchSize: 50 },
    );

    expect(calls.pageNewestFirst).toHaveLength(1);
    expect(calls.pageNewestFirst[0].params).toMatchObject({
      inventoryChannelId: "100002",
      inventoryChannelId_op: "in",
      orderByField: "-createdDate",
    });
  });
});
