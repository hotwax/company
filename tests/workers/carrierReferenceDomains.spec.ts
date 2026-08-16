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

vi.mock("@/utils/appCacheDb", () => ({
  appCacheDb: {
    table: (table: string) => ({
      count: async () => 0,
      toCollection: () => ({
        toArray: async () => state.parentRows[table] ?? [],
      }),
    }),
  },
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

beforeEach(() => {
  state.parentRows = {};
  state.responses = {};
  state.pageCalls = [];
  state.snapshots = [];
});

describe("carrier reference snapshots", () => {
  it.each([
    {
      name: "carrier",
      responseUrl: "oms/shippingGateways/carrierParties",
      parentTable: undefined,
      parent: undefined,
    },
    {
      name: "carrierShipmentMethod",
      responseUrl: "oms/shippingGateways/carrierShipmentMethods",
      parentTable: undefined,
      parent: undefined,
    },
    {
      name: "carrierFacility",
      responseUrl: "oms/shippingGateways/carrierParties/FEDEX/facilities",
      parentTable: "carriers",
      parent: { partyId: "FEDEX" },
    },
    {
      name: "productStoreShippingMethod",
      responseUrl: "admin/productStores/STORE_1/shippingMethods",
      parentTable: "productStores",
      parent: { productStoreId: "STORE_1" },
    },
  ])("$name rejects an unsupported success envelope before snapshot replacement", async ({
    name,
    responseUrl,
    parentTable,
    parent,
  }) => {
    if(parentTable && parent) {
      state.parentRows[parentTable] = [parent];
    }
    state.responses[responseUrl] = { _ERROR_MESSAGE_: "permission denied" };
    const domain = await registeredDomain(name);

    await expect(domain!.sync(ctx as any, undefined, { force: true }))
      .rejects.toThrow(/bare array/i);
    expect(state.snapshots).toEqual([]);
  });

  it("lists carrier parties with CARRIER role", async () => {
    state.responses["oms/shippingGateways/carrierParties"] = [{
      partyId: "FEDEX",
      partyTypeId: "PARTY_GROUP",
      roleTypeId: "CARRIER",
    }];
    const domain = await registeredDomain("carrier");

    expect(domain).toBeDefined();
    await domain!.sync(ctx as any, undefined, { force: true });

    expect(state.pageCalls).toHaveLength(1);
    expect(state.pageCalls[0]).toMatchObject({
      url: "oms/shippingGateways/carrierParties",
      params: { roleTypeId: "CARRIER" },
    });

    state.pageCalls = [];
    state.snapshots = [];
    await domain!.refetchOne!(ctx as any, { partyId: "FEDEX" });

    expect(state.pageCalls[0]).toMatchObject({
      url: "oms/shippingGateways/carrierParties",
      params: { roleTypeId: "CARRIER", partyId: "FEDEX" },
    });
    expect(state.snapshots[0]).toMatchObject({
      table: "carriers",
      scope: { field: "partyId", value: "FEDEX" },
    });
  });

  it("lists carrier shipment methods and refetches one carrier partition", async () => {
    state.responses["oms/shippingGateways/carrierShipmentMethods"] = [{
      partyId: "FEDEX",
      roleTypeId: "CARRIER",
      shipmentMethodTypeId: "GROUND",
    }];
    const domain = await registeredDomain("carrierShipmentMethod");

    expect(domain).toBeDefined();
    await domain!.sync(ctx as any, undefined, { force: true });

    expect(state.pageCalls[0]).toMatchObject({
      url: "oms/shippingGateways/carrierShipmentMethods",
      params: { roleTypeId: "CARRIER" },
    });

    state.pageCalls = [];
    state.snapshots = [];
    await domain!.refetchOne!(ctx as any, { partyId: "FEDEX" });

    expect(state.pageCalls[0]).toMatchObject({
      url: "oms/shippingGateways/carrierShipmentMethods",
      params: { roleTypeId: "CARRIER", partyId: "FEDEX" },
    });
    expect(state.snapshots).toEqual([{
      table: "carrierShipmentMethods",
      rows: [{
        partyId: "FEDEX",
        roleTypeId: "CARRIER",
        shipmentMethodTypeId: "GROUND",
      }],
      scope: { field: "partyId", value: "FEDEX" },
    }]);

    state.pageCalls = [];
    state.snapshots = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const written = await domain!.refetchOne!(ctx as any, {});

    expect(written).toBe(0);
    expect(state.pageCalls).toEqual([]);
    expect(state.snapshots).toEqual([]);
    warn.mockRestore();
  });

  it("fans facilities out over cached carriers and stamps the carrier scope", async () => {
    state.parentRows.carriers = [{ partyId: "FEDEX" }, { partyId: "DHL/INTL" }];
    state.responses["oms/shippingGateways/carrierParties/FEDEX/facilities"] = [{
      facilityId: "FACILITY_1",
      roleTypeId: "CARRIER",
      fromDate: 1_800_000_000_000,
    }];
    state.responses["oms/shippingGateways/carrierParties/DHL%2FINTL/facilities"] = [{
      facilityId: "FACILITY_2",
      roleTypeId: "CARRIER",
      fromDate: 1_800_000_000_001,
    }];
    const domain = await registeredDomain("carrierFacility");

    expect(domain).toBeDefined();
    await domain!.sync(ctx as any, undefined, { force: true });

    expect(state.pageCalls.map((call) => call.url)).toEqual([
      "oms/shippingGateways/carrierParties/FEDEX/facilities",
      "oms/shippingGateways/carrierParties/DHL%2FINTL/facilities",
    ]);
    expect(state.snapshots).toEqual([{
      table: "carrierFacilities",
      rows: [
        {
          partyId: "FEDEX",
          facilityId: "FACILITY_1",
          roleTypeId: "CARRIER",
          fromDate: 1_800_000_000_000,
        },
        {
          partyId: "DHL/INTL",
          facilityId: "FACILITY_2",
          roleTypeId: "CARRIER",
          fromDate: 1_800_000_000_001,
        },
      ],
      scope: undefined,
    }]);
  });

  it("fans shipping methods out over cached stores and stamps the store scope", async () => {
    state.parentRows.productStores = [{ productStoreId: "STORE_1" }, { productStoreId: "STORE/2" }];
    state.responses["admin/productStores/STORE_1/shippingMethods"] = [{
      productStoreShipMethId: "PSM_1",
      shipmentMethodTypeId: "GROUND",
    }];
    state.responses["admin/productStores/STORE%2F2/shippingMethods"] = [{
      productStoreShipMethId: "PSM_2",
      shipmentMethodTypeId: "AIR",
    }];
    const domain = await registeredDomain("productStoreShippingMethod");

    expect(domain).toBeDefined();
    await domain!.sync(ctx as any, undefined, { force: true });

    expect(state.pageCalls.map((call) => call.url)).toEqual([
      "admin/productStores/STORE_1/shippingMethods",
      "admin/productStores/STORE%2F2/shippingMethods",
    ]);
    expect(state.snapshots).toEqual([{
      table: "productStoreShippingMethods",
      rows: [
        {
          productStoreId: "STORE_1",
          productStoreShipMethId: "PSM_1",
          shipmentMethodTypeId: "GROUND",
        },
        {
          productStoreId: "STORE/2",
          productStoreShipMethId: "PSM_2",
          shipmentMethodTypeId: "AIR",
        },
      ],
      scope: undefined,
    }]);
  });
});

describe.each([
  {
    name: "carrierFacility",
    table: "carrierFacilities",
    key: "partyId",
    value: "FEDEX",
    url: "oms/shippingGateways/carrierParties/FEDEX/facilities",
    response: { facilityId: "FACILITY_1", roleTypeId: "CARRIER" },
  },
  {
    name: "productStoreShippingMethod",
    table: "productStoreShippingMethods",
    key: "productStoreId",
    value: "STORE_1",
    url: "admin/productStores/STORE_1/shippingMethods",
    response: { productStoreShipMethId: "PSM_1", shipmentMethodTypeId: "GROUND" },
  },
])("$name scoped fan-out refetch", ({ name, table, key, value, url, response }) => {
  it("prunes only the selected parent partition", async () => {
    state.responses[url] = [response];
    const domain = await registeredDomain(name);

    expect(domain).toBeDefined();
    await domain!.refetchOne!(ctx as any, { [key]: value });

    expect(state.pageCalls).toHaveLength(1);
    expect(state.pageCalls[0].url).toBe(url);
    expect(state.snapshots).toEqual([{
      table,
      rows: [{ [key]: value, ...response }],
      scope: { field: key, value },
    }]);
  });

  it("refuses a refetch with no parent partition key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const domain = await registeredDomain(name);

    expect(domain).toBeDefined();
    const written = await domain!.refetchOne!(ctx as any, {});

    expect(written).toBe(0);
    expect(state.pageCalls).toEqual([]);
    expect(state.snapshots).toEqual([]);
    warn.mockRestore();
  });
});

it("orders dependent fan-out domains after their cached parents", async () => {
  const { REFERENCE_DOMAIN_NAMES } = await import("@/utils/cacheDomainCatalog");

  expect(REFERENCE_DOMAIN_NAMES.indexOf("carrierFacility"))
    .toBeGreaterThan(REFERENCE_DOMAIN_NAMES.indexOf("carrier"));
  expect(REFERENCE_DOMAIN_NAMES.indexOf("productStoreShippingMethod"))
    .toBeGreaterThan(REFERENCE_DOMAIN_NAMES.indexOf("productStore"));
});
