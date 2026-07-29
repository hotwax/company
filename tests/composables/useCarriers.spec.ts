import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const harness = vi.hoisted(() => ({
  records: {
    carriers: [] as any[],
    carrierMethods: [] as any[],
    carrierFacilities: [] as any[],
    shipmentMethodTypes: [] as any[],
    facilities: [] as any[],
    productStores: [] as any[],
    productStoreMethods: [] as any[],
    remotes: [] as any[],
  } as Record<string, any[]>,
  hydrated: {
    carriers: true,
    carrierMethods: true,
    carrierFacilities: true,
    shipmentMethodTypes: true,
    facilities: true,
    productStores: true,
    productStoreMethods: true,
    remotes: true,
  } as Record<string, boolean>,
  bootstrapState: {
    running: false,
    written: {} as Record<string, number>,
    errors: {} as Record<string, string>,
  },
  resyncDomain: vi.fn(),
  startReferenceSync: vi.fn(),
}));

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: vi.fn(() => false) },
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (_error: any, fallback: string) => fallback,
}));

vi.mock("@/utils/cacheEntities", () => ({
  carrierCache: { __kind: "carriers" },
  carrierShipmentMethodCache: { __kind: "carrierMethods" },
  carrierFacilityCache: { __kind: "carrierFacilities" },
  shipmentMethodTypeCache: { __kind: "shipmentMethodTypes" },
  facilityCache: { __kind: "facilities" },
  productStoreCache: { __kind: "productStores" },
  productStoreShippingMethodCache: { __kind: "productStoreMethods" },
  systemMessageRemoteCache: { __kind: "remotes" },
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  bootstrapState: harness.bootstrapState,
  refreshAfterMutation: vi.fn(),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
  startReferenceSync: (...args: any[]) => harness.startReferenceSync(...args),
}));

vi.mock("@/composables/useCachedList", () => ({
  useCachedList: (entity: any, options: any = {}) => {
    const kind = String(entity?.__kind ?? "");
    const scope = options?.scope;
    const rows = scope
      ? harness.records[kind].filter((row: any) => row?.[scope.field] === scope.value)
      : harness.records[kind];

    return {
      records: ref(rows),
      rows: ref(rows.map((raw: any) => ({ ...raw, raw }))),
      hydrated: ref(harness.hydrated[kind]),
    };
  },
  useCachedRecord: (entity: any, keyField: string, id: string | undefined) => {
    const records = harness.records[String(entity?.__kind ?? "")];

    return {
      record: computed(() => records.find((row: any) => String(row?.[keyField]) === String(id))),
      hydrated: ref(harness.hydrated[String(entity?.__kind ?? "")]),
    };
  },
}));

import {
  activeAt,
  deriveCarrierReadiness,
  mergeCarrierShipmentMethods,
  orderedCarrierMethods,
  useCarrier,
  useCarriers,
} from "@/composables/useCarriers";

describe("carrier pure behavior", () => {
  it("treats numeric and string effective dates identically at the close boundary", () => {
    expect(activeAt({ fromDate: "1000" }, 2_000)).toBe(true);
    expect(activeAt({ fromDate: 2_001 }, 2_000)).toBe(false);
    expect(activeAt({ thruDate: "2001" }, 2_000)).toBe(true);
    expect(activeAt({ thruDate: 2_000 }, 2_000)).toBe(false);
  });

  it("joins carrier fields onto a fresh copy without overwriting global type identity", () => {
    const types = [
      { shipmentMethodTypeId: "GROUND", description: "Ground", sequenceNum: 10 },
      { shipmentMethodTypeId: "NEXT_DAY", description: "Next day", sequenceNum: 20 },
    ];
    const configured = [{
      shipmentMethodTypeId: "GROUND",
      description: "stale carrier description",
      partyId: "FEDEX",
      carrierServiceCode: "FEDEX_GROUND",
      sequenceNumber: 2,
    }];
    const typesBefore = structuredClone(types);
    const configuredBefore = structuredClone(configured);

    expect(mergeCarrierShipmentMethods(types, configured)).toEqual([
      {
        shipmentMethodTypeId: "GROUND",
        description: "Ground",
        sequenceNum: 10,
        partyId: "FEDEX",
        carrierServiceCode: "FEDEX_GROUND",
        sequenceNumber: 2,
        isConfigured: true,
      },
      {
        shipmentMethodTypeId: "NEXT_DAY",
        description: "Next day",
        sequenceNum: 20,
        isConfigured: false,
      },
    ]);
    expect(types).toEqual(typesBefore);
    expect(configured).toEqual(configuredBefore);
  });

  it("sorts configured sequence numbers stably and leaves unsequenced rows last", () => {
    const rows = [
      { shipmentMethodTypeId: "LATE", sequenceNumber: "20" },
      { shipmentMethodTypeId: "FIRST_A", sequenceNumber: 1 },
      { shipmentMethodTypeId: "UNSEQUENCED" },
      { shipmentMethodTypeId: "FIRST_B", sequenceNumber: "1" },
    ];

    expect(orderedCarrierMethods(rows).map((row) => row.shipmentMethodTypeId)).toEqual([
      "FIRST_A",
      "FIRST_B",
      "LATE",
      "UNSEQUENCED",
    ]);
    expect(rows.map((row) => row.shipmentMethodTypeId)).toEqual([
      "LATE",
      "FIRST_A",
      "UNSEQUENCED",
      "FIRST_B",
    ]);
  });
});

describe("carrier readiness", () => {
  const fedex = { partyId: "FEDEX", groupName: "FedEx" };
  const completeRemote = {
    systemMessageRemoteId: "UNIGATE_CONFIG",
    internalId: "tenant-1",
    sendUrl: "https://unigate.example/",
  };

  it("requires only observable tenant fields and keeps hidden carrier prerequisites unavailable", () => {
    expect(deriveCarrierReadiness(fedex, completeRemote, {
      hydrated: true,
      error: null,
    })).toEqual({
      carrierPartyId: "FEDEX",
      automaticAddressValidationCapable: true,
      remote: { hydrated: true, error: null },
      tenant: "ready",
      credential: "verification-unavailable",
      storeLink: "verification-unavailable",
      automaticAddressValidation: "verification-unavailable",
    });
  });

  it("does not turn an unhydrated or failed remote read into missing configuration", () => {
    expect(deriveCarrierReadiness(fedex, null, {
      hydrated: false,
      error: null,
    }).tenant).toBe("loading");

    const failed = deriveCarrierReadiness(fedex, null, {
      hydrated: true,
      error: "systemMessageRemote request failed",
    });
    expect(failed.tenant).toBe("verification-unavailable");
    expect(failed.automaticAddressValidation).toBe("verification-unavailable");
    expect(failed.remote.error).toBe("systemMessageRemote request failed");
  });

  it("marks a hydrated, incomplete tenant actionable and non-FedEx validation not applicable", () => {
    expect(deriveCarrierReadiness(fedex, { internalId: "tenant-1", sendUrl: "" }, {
      hydrated: true,
      error: null,
    }).automaticAddressValidation).toBe("action-required");

    const ups = deriveCarrierReadiness({ partyId: "UPS" }, completeRemote, {
      hydrated: true,
      error: null,
    });
    expect(ups.automaticAddressValidationCapable).toBe(false);
    expect(ups.credential).toBe("not-applicable");
    expect(ups.storeLink).toBe("not-applicable");
    expect(ups.automaticAddressValidation).toBe("not-applicable");
  });
});

describe("carrier cache-backed reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.resyncDomain.mockResolvedValue(undefined);
    harness.startReferenceSync.mockResolvedValue(undefined);
    Object.assign(harness.hydrated, {
      carriers: true,
      carrierMethods: true,
      carrierFacilities: true,
      shipmentMethodTypes: true,
      facilities: true,
      productStores: true,
      productStoreMethods: true,
      remotes: true,
    });
    Object.assign(harness.records, {
      carriers: [
        { partyId: "FEDEX", groupName: "FedEx" },
        { partyId: "UPS", groupName: "UPS" },
      ],
      carrierMethods: [
        { partyId: "FEDEX", roleTypeId: "CARRIER", shipmentMethodTypeId: "GROUND", sequenceNumber: 2 },
        { partyId: "FEDEX", roleTypeId: "CARRIER", shipmentMethodTypeId: "NEXT_DAY", sequenceNumber: 1 },
        { partyId: "UPS", roleTypeId: "CARRIER", shipmentMethodTypeId: "GROUND", sequenceNumber: 1 },
      ],
      carrierFacilities: [{
        partyId: "FEDEX",
        facilityId: "FAC_1",
        roleTypeId: "CARRIER",
        fromDate: 1_000,
      }],
      shipmentMethodTypes: [
        { shipmentMethodTypeId: "GROUND", description: "Ground" },
        { shipmentMethodTypeId: "NEXT_DAY", description: "Next day" },
      ],
      facilities: [
        { facilityId: "FAC_1", facilityName: "One", facilityTypeId: "WAREHOUSE" },
        { facilityId: "FAC_2", facilityName: "Two", facilityTypeId: "STORE" },
      ],
      productStores: [{ productStoreId: "STORE", storeName: "Store" }],
      productStoreMethods: [
        {
          productStoreShipMethId: "PSM_1",
          productStoreId: "STORE",
          partyId: "FEDEX",
          roleTypeId: "CARRIER",
          shipmentMethodTypeId: "GROUND",
          fromDate: 1_000,
        },
        {
          productStoreShipMethId: "PSM_2",
          productStoreId: "STORE",
          partyId: "UPS",
          roleTypeId: "CARRIER",
          shipmentMethodTypeId: "GROUND",
          fromDate: 1_000,
        },
      ],
      remotes: [{
        systemMessageRemoteId: "UNIGATE_CONFIG",
        internalId: "tenant-1",
        sendUrl: "https://unigate.example/",
      }],
    });
    harness.bootstrapState.errors = {};
  });

  it("derives catalog method counts from the carrier-method cache", () => {
    const { carriers, hydrated, readyForDisplay } = useCarriers();

    expect(hydrated.value).toBe(true);
    expect(readyForDisplay.value).toBe(true);
    expect(carriers.value).toEqual([
      expect.objectContaining({ partyId: "FEDEX", shipmentMethodCount: 2 }),
      expect.objectContaining({ partyId: "UPS", shipmentMethodCount: 1 }),
    ]);
  });

  it("carries the global type description onto configured methods for store association views", () => {
    // `CarrierShipmentMethod` rows carry no `description` (see the `carrierMethods` fixture, which
    // matches the live payload). Consumers that render only configured methods must still get the
    // description from the type table, or they fall back to the raw id and show it twice.
    const detail = useCarrier("FEDEX");

    expect(detail.configuredShipmentMethods.value).toEqual([
      expect.objectContaining({ shipmentMethodTypeId: "NEXT_DAY", description: "Next day" }),
      expect.objectContaining({ shipmentMethodTypeId: "GROUND", description: "Ground" }),
    ]);
    // Still scoped to this carrier's enabled methods only — not the whole global type table.
    expect(detail.configuredShipmentMethods.value).toHaveLength(2);
  });

  it("does not present a failed cold carrier catalog as a genuine empty state", () => {
    harness.bootstrapState.errors = {
      carrier: "carrier snapshot failed",
      carrierShipmentMethod: "method snapshot failed",
    };
    const catalog = useCarriers();

    expect(catalog.hydrated.value).toBe(true);
    expect(catalog.catalogErrors.value).toEqual({
      carrier: "carrier snapshot failed",
      carrierShipmentMethod: "method snapshot failed",
    });
    expect(catalog.readyForDisplay.value).toBe(false);
  });

  it("surfaces a global bootstrap failure in both catalog and detail readiness", () => {
    harness.bootstrapState.errors = {
      __start: "cache worker failed to start",
    };

    const catalog = useCarriers();
    const detail = useCarrier("FEDEX");

    expect(catalog.catalogErrors.value).toEqual({
      __start: "cache worker failed to start",
    });
    expect(catalog.readyForDisplay.value).toBe(false);
    expect(detail.detailErrors.value).toEqual({
      __start: "cache worker failed to start",
    });
    expect(detail.readyForMutation.value).toBe(false);
  });

  it("refreshes both catalog domains behind the composable facade", async () => {
    const { refreshCarriers } = useCarriers();

    await refreshCarriers();

    expect(harness.resyncDomain.mock.calls).toEqual([
      ["carrier"],
      ["carrierShipmentMethod"],
    ]);
  });

  it("combines every detail cache hydration flag, including the remote domain", () => {
    harness.hydrated.remotes = false;
    const detail = useCarrier("FEDEX");

    expect(detail.carrier.value?.partyId).toBe("FEDEX");
    expect(detail.productStoreShipmentMethods.value.map((row: any) => row.productStoreShipMethId))
      .toEqual(["PSM_1"]);
    expect(detail.hydrated.value).toBe(false);
    expect(detail.readiness.value.tenant).toBe("loading");
  });

  it("rejects mutation readiness for an error in every required detail domain", () => {
    const requiredDomains = [
      "carrier",
      "carrierShipmentMethod",
      "carrierFacility",
      "facility",
      "productStore",
      "productStoreShippingMethod",
      "shipmentMethodType",
      "systemMessageRemote",
    ];

    for(const domain of requiredDomains) {
      harness.bootstrapState.errors = { [domain]: `${domain} snapshot failed` };
      const detail = useCarrier("FEDEX");

      expect(detail.hydrated.value).toBe(true);
      expect(detail.detailErrors.value).toEqual({ [domain]: `${domain} snapshot failed` });
      expect(detail.readyForMutation.value).toBe(false);
    }
  });

  it("retries precisely the detail domains that are currently failed", async () => {
    harness.bootstrapState.errors = {
      carrierFacility: "carrier facility snapshot failed",
      productStore: "product store snapshot failed",
      userGroup: "unrelated snapshot failed",
    };
    const detail = useCarrier("FEDEX");

    await detail.refreshDetails();

    expect(harness.startReferenceSync).not.toHaveBeenCalled();
    expect(harness.resyncDomain.mock.calls).toEqual([
      ["carrierFacility"],
      ["productStore"],
    ]);
  });

  it("recovers startup before retrying the detail domains captured for this attempt", async () => {
    harness.bootstrapState.errors = {
      __start: "cache worker failed to start",
      facility: "facility snapshot failed",
    };
    harness.startReferenceSync.mockImplementationOnce(() => {
      delete harness.bootstrapState.errors.__start;

      return Promise.resolve(undefined);
    });
    harness.resyncDomain.mockImplementationOnce(() => {
      delete harness.bootstrapState.errors.facility;

      return Promise.resolve(undefined);
    });
    const detail = useCarrier("FEDEX");

    expect(detail.readyForMutation.value).toBe(false);
    await detail.refreshDetails();

    expect(harness.startReferenceSync).toHaveBeenCalledTimes(1);
    expect(harness.resyncDomain.mock.calls).toEqual([["facility"]]);
    expect(harness.bootstrapState.errors).toEqual({});
  });

  it("does not retry detail domains while startup recovery remains failed", async () => {
    harness.bootstrapState.errors = {
      __start: "cache worker failed to start",
      facility: "facility snapshot failed",
    };
    const detail = useCarrier("FEDEX");

    await expect(detail.refreshDetails()).rejects.toThrow("cache worker failed to start");

    expect(harness.startReferenceSync).toHaveBeenCalledTimes(1);
    expect(harness.resyncDomain).not.toHaveBeenCalled();
    expect(detail.readyForMutation.value).toBe(false);
  });
});
