import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineEntity } from "@common/db/defineEntity";

const AUTHORITATIVE_STORE = "STORE_EXPECTED";

const state = vi.hoisted(() => ({
  fetched: [] as any[],
  pageKeys: [] as Array<string | undefined>,
  snapshots: [] as Array<{ rows: any[]; scope: any }>,
}));

vi.mock("@common/db/sync/workerFetch", () => ({
  pageAll: vi.fn(async (options: any) => state.fetched.filter((row) => {
    const key = options.keyOf?.(row);
    state.pageKeys.push(key);
    return key !== undefined;
  })),
  pageNewestFirst: vi.fn(async () => []),
  workerGet: vi.fn(async () => null),
  workerPost: vi.fn(async () => null),
  unwrapCollection: (response: any) => (Array.isArray(response) ? response : []),
}));

vi.mock("@/db/companyDb", async (importOriginal) => {
  const actual = await importOriginal<any>();
  const mockRaw = () => ({
    table: (table: string) => ({
      count: async () => 0,
      toArray: async () => table === "productStores" ? [{ productStoreId: AUTHORITATIVE_STORE }] : [],
      toCollection: () => ({
        toArray: async () => table === "productStores" ? [{ productStoreId: AUTHORITATIVE_STORE }] : [],
        primaryKeys: async () => [],
      }),
      where: (field: string) => ({
        equals: (value: unknown) => {
          state.snapshots.push({ rows: [], scope: { field, value } });
          return { toArray: async () => [] };
        },
      }),
      bulkDelete: async () => {},
      bulkPut: async (rows: any[]) => {
        state.snapshots.push({ rows, scope: null });
      },
      put: async () => {},
      delete: async () => {},
    }),
    transaction: async (_mode: any, _tables: any, fn: () => Promise<any>) => fn(),
    syncMeta: { get: async () => undefined, put: async () => {}, delete: async () => {} },
  });
  const mockDb = {
    ...actual.companyDb,
    raw: mockRaw,
    get: mockRaw,
  };
  return { companyDb: mockDb };
});

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
  const { registerSnapshotDomain } = await import("@common/db/sync/snapshotDomain");
  return registerSnapshotDomain(CONFIG as any, () => (companyDb as any).raw());
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

    const put = state.snapshots.filter((s) => s.rows.length).at(-1)!;
    expect(put.rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
    expect(put.rows[0]).toHaveProperty("syncedAt");
  });

  it("overrides a conflicting child parent id during a scoped refetch", async () => {
    state.fetched = [
      { productStoreId: "STORE_STALE", shipmentMethodTypeId: "GROUND" },
    ];

    const domain = await register();
    await domain.refetchOne!(ctx as any, { productStoreId: AUTHORITATIVE_STORE });

    const put = state.snapshots.filter((s) => s.rows.length).at(-1)!;
    expect(put.rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
    expect(put.rows[0]).toHaveProperty("syncedAt");
  });

  it("keys a parent-less child with the initial fan-out scope before paging deduplication", async () => {
    state.fetched = [{ shipmentMethodTypeId: "GROUND" }];

    const domain = await register();
    await domain.sync(ctx as any, undefined, { force: true });

    expect(state.pageKeys).toContain(AUTHORITATIVE_STORE + "\u0000GROUND");
    const put = state.snapshots.filter((s) => s.rows.length).at(-1)!;
    expect(put.rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
  });

  it("keys a parent-less child with the refetch scope before paging deduplication", async () => {
    state.fetched = [{ shipmentMethodTypeId: "GROUND" }];

    const domain = await register();
    await domain.refetchOne!(ctx as any, { productStoreId: AUTHORITATIVE_STORE });

    expect(state.pageKeys).toContain(AUTHORITATIVE_STORE + "\u0000GROUND");
    const put = state.snapshots.filter((s) => s.rows.length).at(-1)!;
    expect(put.rows[0].productStoreId).toBe(AUTHORITATIVE_STORE);
  });
});
