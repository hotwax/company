import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  parentRows: {} as Record<string, any[]>,
  responses: {} as Record<string, any>,
  pageCalls: [] as any[],
  snapshots: [] as Array<{ table: string; rows: any[]; scope: any }>,
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: vi.fn((options: any) => {
    state.pageCalls.push(options);
    const response = state.responses[options.url] ?? [];
    if(options.strictCollection && !Array.isArray(response)) {
      return Promise.reject(new Error(`${options.label} response must be a bare array.`));
    }

    return Promise.resolve(response);
  }),
  workerGet: vi.fn(async () => null),
  unwrapCollection: (response: any, collectionKey?: string | null) => {
    if (Array.isArray(response)) return response;
    if (collectionKey && Array.isArray(response?.[collectionKey])) return response[collectionKey];
    return [];
  },
}));

vi.mock("@/db/companyDb", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    companyDb: {
      ...actual.companyDb,
      raw: () => ({
        table: (table: string) => ({
          count: async () => 0,
          toCollection: () => ({
            toArray: async () => state.parentRows[table] ?? [],
          }),
        }),
      }),
    },
  };
});

vi.mock("@/utils/db/appCacheDb", () => ({
  defineCachedEntity: (table: string) => ({
    table,
    snapshotReplace: vi.fn(async (rows: any[], scope: any) => {
      state.snapshots.push({ table, rows, scope });
      return { written: rows.length, pruned: 0 };
    }),
    upsertMany: vi.fn(async (rows: any[]) => rows.length),
    remove: vi.fn(async () => undefined),
  }),
  hasSyncedThisLogin: vi.fn(async () => false),
  markSyncedThisLogin: vi.fn(async () => undefined),
}));

const ctx = { maargUrl: "https://example.test/", token: "token" };

async function registeredDomain(name: string) {
  vi.resetModules();
  await import("@/workers/domains/referenceDomains");
  const { getSyncDomain } = await import("@/workers/syncRegistry");
  return getSyncDomain(name);
}

describe("carrier reference snapshots", () => {
  beforeEach(() => {
    state.parentRows = {};
    state.responses = {};
    state.pageCalls = [];
    state.snapshots = [];
  });

  it("lists carrier parties with CARRIER role", async () => {
    state.responses["oms/shippingGateways/carrierParties"] = [
      { partyId: "FEDEX", groupName: "FedEx", partyTypeId: "PARTY_GROUP", roleTypeId: "CARRIER" },
    ];

    const domain = await registeredDomain("carrier");
    const written = await domain!.sync(ctx as any, undefined, { force: true });

    expect(written).toBe(1);
    expect(state.pageCalls[0].params).toEqual({ roleTypeId: "CARRIER" });
    expect(state.snapshots).toEqual([
      {
        table: "carriers",
        rows: [{ partyId: "FEDEX", groupName: "FedEx", partyTypeId: "PARTY_GROUP", roleTypeId: "CARRIER" }],
        scope: undefined,
      },
    ]);
  });

  it("lists carrier shipment methods and refetches one carrier partition", async () => {
    state.responses["oms/shippingGateways/carrierShipmentMethods"] = [
      { partyId: "FEDEX", roleTypeId: "CARRIER", shipmentMethodTypeId: "GROUND", sequenceNumber: "10" },
    ];

    const domain = await registeredDomain("carrierShipmentMethod");
    await domain!.sync(ctx as any, undefined, { force: true });
    await domain!.refetchOne!(ctx as any, { partyId: "FEDEX" });

    expect(state.pageCalls[0].params).toEqual({ roleTypeId: "CARRIER" });
    expect(state.pageCalls[1].params).toEqual({ roleTypeId: "CARRIER", partyId: "FEDEX" });
    expect(state.snapshots[1].scope).toEqual({ field: "partyId", value: "FEDEX" });
  });

  it("fans facilities out over cached carriers and stamps the carrier scope", async () => {
    state.parentRows.carriers = [{ partyId: "FEDEX" }, { partyId: "UPS" }];
    state.responses["oms/shippingGateways/carrierParties/FEDEX/facilities"] = [
      { partyId: "FEDEX", facilityId: "BROADWAY", roleTypeId: "CARRIER", fromDate: 1_800_000_000_000 },
    ];
    state.responses["oms/shippingGateways/carrierParties/UPS/facilities"] = [
      { partyId: "UPS", facilityId: "BROADWAY", roleTypeId: "CARRIER", fromDate: 1_800_000_000_000 },
    ];

    const domain = await registeredDomain("carrierFacility");
    const written = await domain!.sync(ctx as any, undefined, { force: true });

    expect(written).toBe(2);
    expect(state.snapshots[0].table).toBe("carrierFacilities");
    expect(state.snapshots[0].rows).toEqual([
      { partyId: "FEDEX", facilityId: "BROADWAY", roleTypeId: "CARRIER", fromDate: 1_800_000_000_000 },
      { partyId: "UPS", facilityId: "BROADWAY", roleTypeId: "CARRIER", fromDate: 1_800_000_000_000 },
    ]);
  });

  it("fans shipping methods out over cached stores and stamps the store scope", async () => {
    state.parentRows.productStores = [{ productStoreId: "STORE_1" }];
    state.responses["admin/productStores/STORE_1/shippingMethods"] = [
      {
        productStoreShipMethId: "PSM_1",
        productStoreId: "STORE_1",
        shipmentMethodTypeId: "GROUND",
        partyId: "FEDEX",
        roleTypeId: "CARRIER",
      },
    ];

    const domain = await registeredDomain("productStoreShippingMethod");
    const written = await domain!.sync(ctx as any, undefined, { force: true });

    expect(written).toBe(1);
    expect(state.snapshots[0].table).toBe("productStoreShippingMethods");
    expect(state.snapshots[0].rows).toEqual([
      {
        productStoreShipMethId: "PSM_1",
        productStoreId: "STORE_1",
        shipmentMethodTypeId: "GROUND",
        partyId: "FEDEX",
        roleTypeId: "CARRIER",
      },
    ]);
  });

  it("'carrier' rejects an unsupported success envelope before snapshot replacement", async () => {
    state.responses["oms/shippingGateways/carrierParties"] = { partyList: [] };

    const domain = await registeredDomain("carrier");
    await expect(domain!.sync(ctx as any, undefined, { force: true })).rejects.toThrow(
      "carrier response must be a bare array.",
    );
  });

  it("'carrierShipmentMethod' rejects an unsupported success envelope before snapshot replacement", async () => {
    state.responses["oms/shippingGateways/carrierShipmentMethods"] = { carrierShipmentMethodList: [] };

    const domain = await registeredDomain("carrierShipmentMethod");
    await expect(domain!.sync(ctx as any, undefined, { force: true })).rejects.toThrow(
      "carrierShipmentMethod response must be a bare array.",
    );
  });

  it("'carrierFacility' rejects an unsupported success envelope before snapshot replacement", async () => {
    state.parentRows.carriers = [{ partyId: "FEDEX" }];
    state.responses["oms/shippingGateways/carrierParties/FEDEX/facilities"] = { carrierFacilityList: [] };

    const domain = await registeredDomain("carrierFacility");
    await expect(domain!.sync(ctx as any, undefined, { force: true })).rejects.toThrow(
      "carrierFacility:FEDEX response must be a bare array.",
    );
  });

  it("'productStoreShippingMethod' rejects an unsupported success envelope before snapshot replacement", async () => {
    state.parentRows.productStores = [{ productStoreId: "STORE_1" }];
    state.responses["admin/productStores/STORE_1/shippingMethods"] = { shippingMethodList: [] };

    const domain = await registeredDomain("productStoreShippingMethod");
    await expect(domain!.sync(ctx as any, undefined, { force: true })).rejects.toThrow(
      "productStoreShippingMethod:STORE_1 response must be a bare array.",
    );
  });
});

describe("'carrierFacility' scoped fan-out refetch", () => {
  beforeEach(() => {
    state.parentRows = {};
    state.responses = {};
    state.pageCalls = [];
    state.snapshots = [];
  });

  it("prunes only the selected parent partition", async () => {
    state.responses["oms/shippingGateways/carrierParties/FEDEX/facilities"] = [
      { partyId: "FEDEX", facilityId: "BROADWAY", roleTypeId: "CARRIER", fromDate: 1_800_000_000_000 },
    ];

    const domain = await registeredDomain("carrierFacility");
    const written = await domain!.refetchOne!(ctx as any, { partyId: "FEDEX" });

    expect(written).toBe(1);
    expect(state.snapshots).toEqual([
      {
        table: "carrierFacilities",
        rows: [{ partyId: "FEDEX", facilityId: "BROADWAY", roleTypeId: "CARRIER", fromDate: 1_800_000_000_000 }],
        scope: { field: "partyId", value: "FEDEX" },
      },
    ]);
  });

  it("refuses a refetch with no parent partition key", async () => {
    const domain = await registeredDomain("carrierFacility");
    const written = await domain!.refetchOne!(ctx as any, {});

    expect(written).toBe(0);
    expect(state.snapshots).toHaveLength(0);
  });
});

describe("'productStoreShippingMethod' scoped fan-out refetch", () => {
  beforeEach(() => {
    state.parentRows = {};
    state.responses = {};
    state.pageCalls = [];
    state.snapshots = [];
  });

  it("prunes only the selected parent partition", async () => {
    state.responses["admin/productStores/STORE_1/shippingMethods"] = [
      {
        productStoreShipMethId: "PSM_1",
        productStoreId: "STORE_1",
        shipmentMethodTypeId: "GROUND",
        partyId: "FEDEX",
        roleTypeId: "CARRIER",
      },
    ];

    const domain = await registeredDomain("productStoreShippingMethod");
    const written = await domain!.refetchOne!(ctx as any, { productStoreId: "STORE_1" });

    expect(written).toBe(1);
    expect(state.snapshots).toEqual([
      {
        table: "productStoreShippingMethods",
        rows: [
          {
            productStoreShipMethId: "PSM_1",
            productStoreId: "STORE_1",
            shipmentMethodTypeId: "GROUND",
            partyId: "FEDEX",
            roleTypeId: "CARRIER",
          },
        ],
        scope: { field: "productStoreId", value: "STORE_1" },
      },
    ]);
  });

  it("refuses a refetch with no parent partition key", async () => {
    const domain = await registeredDomain("productStoreShippingMethod");
    const written = await domain!.refetchOne!(ctx as any, {});

    expect(written).toBe(0);
    expect(state.snapshots).toHaveLength(0);
  });
});
