import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineEntity } from "@common/db/defineEntity";

const AUTHORITATIVE_STORE = "STORE_EXPECTED";

const state = vi.hoisted(() => ({
  fetched: [] as any[],
  pageKeys: [] as Array<string | undefined>,
  snapshots: [] as Array<{ rows: any[]; scope: any }>,
}));

const mockWorkerFetch = vi.hoisted(() => () => ({
  pageAll: vi.fn(async (options: any) => state.fetched.filter((row) => {
    const key = options.keyOf?.(row);
    state.pageKeys.push(key);
    return key !== undefined;
  })),
  workerGet: vi.fn(async () => null),
  unwrapCollection: (response: any) => (Array.isArray(response) ? response : []),
}));

vi.mock("@/workers/domains/workerFetch", mockWorkerFetch);
vi.mock("./workerFetch", mockWorkerFetch);
vi.mock("@common/db/sync/workerFetch", mockWorkerFetch);


import { setAppDb } from "@common/db/appDbRegistry";

vi.mock("@/db/companyDb", async (importOriginal) => {
  const actual = await importOriginal<any>();
  const mockRaw = () => ({
    table: (table: string) => ({
      count: async () => 0,
      toCollection: () => ({
        toArray: async () => table === "productStores"
          ? [{ productStoreId: AUTHORITATIVE_STORE }]
          : [],
        primaryKeys: async () => [],
      }),
      where: () => ({
        equals: () => ({
          toArray: async () => [],
        }),
      }),
      bulkDelete: async () => {},
      bulkPut: async (rows: any[]) => {
        state.snapshots.push({ rows, scope: null });
      },
      put: async () => {},
      delete: async () => {},
    }),
    transaction: async (_mode: any, _tables: any, fn: () => Promise<any>) => fn(),
  });
  const mockDb = {
    ...actual.companyDb,
    raw: mockRaw,
    get: mockRaw,
  };
  setAppDb(mockDb as any);
  return { companyDb: mockDb };
});


vi.mock("@/utils/db/appCacheDb", () => ({
  defineCachedEntity: () => ({
    table: "productStoreShippingMethods",
    snapshotReplace: vi.fn(async (rows: any[], scope: any) => {
      state.snapshots.push({ rows, scope });
      return { written: rows.length, pruned: 0 };
    }),
    upsertMany: vi.fn(async (rows: any[]) => rows.length),
    remove: vi.fn(async () => undefined),
  }),
  hasSyncedThisLogin: vi.fn(async () => false),
  markSyncedThisLogin: vi.fn(async () => undefined),
}));

const CONFIG = {
  name: "storeMethodFanOutTest",
  table: "productStoreShippingMethods" as const,
  projection: defineEntity({
    primaryKey: "productStoreId,shipmentMethodTypeId",
    fields: {
      productStoreId: "text",
      shipmentMethodTypeId: "text",
    },
  }),
  listUrl: "admin/productStores",
  collectionKey: null,
  fanOut: {
    parentTable: "productStores" as const,
    parentKeyField: "productStoreId",
    urlFor: (productStoreId: string) =>
      `admin/productStores/${productStoreId}/shippingMethods`,
  },
};

const ctx = { maargUrl: "https://example.test/", token: "token" };

async function register() {
  vi.resetModules();
  const { companyDb } = await import("@/db/companyDb");
  const { setAppDb } = await import("@common/db/appDbRegistry");
  setAppDb(companyDb as any);
  const { registerSnapshotDomain } = await import("@common/db/sync/snapshotDomain");
  registerSnapshotDomain(CONFIG as any);
  const { getSyncDomain } = await import("@/workers/syncRegistry");
  return getSyncDomain(CONFIG.name)!;
}

describe("snapshot domain authoritative fan-out scope", () => {
  beforeEach(() => {
    state.fetched = [];
    state.pageKeys = [];
    state.snapshots = [];
  });

  it("overrides a conflicting child parent id during the initial snapshot", async () => {
    state.fetched = [
      { productStoreId: "STORE_STALE", shipmentMethodTypeId: "GROUND" },
    ];

    const domain = await register();
    await domain.sync(ctx as any, undefined, { force: true });

    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
  });

  it("overrides a conflicting child parent id during a scoped refetch", async () => {
    state.fetched = [
      { productStoreId: "STORE_STALE", shipmentMethodTypeId: "GROUND" },
    ];

    const domain = await register();
    await domain.refetchOne!(ctx as any, { productStoreId: AUTHORITATIVE_STORE });

    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
  });

  it("keys a parent-less child with the initial fan-out scope before paging deduplication", async () => {
    state.fetched = [{ shipmentMethodTypeId: "GROUND" }];

    const domain = await register();
    await domain.sync(ctx as any, undefined, { force: true });

    expect(state.pageKeys).toContain(AUTHORITATIVE_STORE + "\u0000GROUND");
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
  });

  it("keys a parent-less child with the refetch scope before paging deduplication", async () => {
    state.fetched = [{ shipmentMethodTypeId: "GROUND" }];

    const domain = await register();
    await domain.refetchOne!(ctx as any, { productStoreId: AUTHORITATIVE_STORE });

    expect(state.pageKeys).toContain(AUTHORITATIVE_STORE + "\u0000GROUND");
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
  });
});
