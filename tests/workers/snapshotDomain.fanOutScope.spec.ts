import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTHORITATIVE_STORE = "STORE_EXPECTED";

const state = vi.hoisted(() => ({
  fetched: [] as any[],
  pageKeys: [] as Array<string | undefined>,
  snapshots: [] as Array<{ rows: any[]; scope: any }>,
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  // Mirrors pageAll's unkeyable-row behavior: a record whose keyOf returns undefined is dropped
  // before the fan-out code receives the page.
  pageAll: vi.fn(async (options: any) => state.fetched.filter((row) => {
    const key = options.keyOf?.(row);
    state.pageKeys.push(key);
    return key !== undefined;
  })),
  workerGet: vi.fn(async () => null),
  unwrapCollection: (response: any) => (Array.isArray(response) ? response : []),
}));

vi.mock("@/utils/appCacheDb", () => ({
  appCacheDb: {
    table: (table: string) => ({
      count: async () => 0,
      toCollection: () => ({
        toArray: async () => table === "productStores"
          ? [{ productStoreId: AUTHORITATIVE_STORE }]
          : [],
      }),
    }),
  },
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
  projection: {
    keyField: "storeMethodKey",
    fields: {
      storeMethodKey: "text" as const,
      productStoreId: "text" as const,
      shipmentMethodTypeId: "text" as const,
    },
    buildKey: (row: Record<string, unknown>) =>
      row.productStoreId && row.shipmentMethodTypeId
        ? `${row.productStoreId}|${row.shipmentMethodTypeId}`
        : undefined,
  },
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
  const { registerSnapshotDomain } = await import("@/workers/domains/snapshotDomain");
  registerSnapshotDomain(CONFIG);
  const { getSyncDomain } = await import("@/workers/syncRegistry");
  return getSyncDomain(CONFIG.name)!;
}

beforeEach(() => {
  state.fetched = [{
    productStoreId: "STORE_CONFLICTING",
    shipmentMethodTypeId: "GROUND",
  }];
  state.pageKeys = [];
  state.snapshots = [];
});

describe("snapshot domain authoritative fan-out scope", () => {
  it("overrides a conflicting child parent id during the initial snapshot", async () => {
    const domain = await register();

    await domain.sync(ctx as any, undefined, { force: true });

    expect(state.snapshots).toEqual([{
      rows: [{
        productStoreId: "STORE_EXPECTED",
        shipmentMethodTypeId: "GROUND",
      }],
      scope: undefined,
    }]);
  });

  it("overrides a conflicting child parent id during a scoped refetch", async () => {
    const domain = await register();

    await domain.refetchOne!(ctx as any, { productStoreId: AUTHORITATIVE_STORE });

    expect(state.snapshots).toEqual([{
      rows: [{
        productStoreId: "STORE_EXPECTED",
        shipmentMethodTypeId: "GROUND",
      }],
      scope: { field: "productStoreId", value: "STORE_EXPECTED" },
    }]);
  });

  it("keys a parent-less child with the initial fan-out scope before paging deduplication", async () => {
    state.fetched = [{ shipmentMethodTypeId: "GROUND" }];
    const domain = await register();

    await domain.sync(ctx as any, undefined, { force: true });

    expect(state.pageKeys).toEqual(["STORE_EXPECTED|GROUND"]);
    expect(state.snapshots[0].rows).toEqual([{
      productStoreId: "STORE_EXPECTED",
      shipmentMethodTypeId: "GROUND",
    }]);
  });

  it("keys a parent-less child with the refetch scope before paging deduplication", async () => {
    state.fetched = [{ shipmentMethodTypeId: "GROUND" }];
    const domain = await register();

    await domain.refetchOne!(ctx as any, { productStoreId: AUTHORITATIVE_STORE });

    expect(state.pageKeys).toEqual(["STORE_EXPECTED|GROUND"]);
    expect(state.snapshots[0]).toEqual({
      rows: [{
        productStoreId: "STORE_EXPECTED",
        shipmentMethodTypeId: "GROUND",
      }],
      scope: { field: "productStoreId", value: "STORE_EXPECTED" },
    });
  });
});
