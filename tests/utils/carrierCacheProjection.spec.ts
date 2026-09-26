import { describe, expect, it } from "vitest";
import {
  carrierCache,
  carrierFacilityCache,
  carrierFacilityProjection,
  carrierProjection,
  carrierShipmentMethodCache,
  carrierShipmentMethodProjection,
  productStoreShippingMethodProjection,
} from "@/utils/cacheEntities";
import { projectRow } from "@/utils/cacheProjection";

const CACHED_AT = 1_800_000_000_000;

describe("carrier cache projections", () => {
  it("keys a carrier by partyId and retains the carrier identity fields", () => {
    const row = projectRow({
      partyId: "FEDEX",
      groupName: "FedEx",
      partyTypeId: "PARTY_GROUP",
      roleTypeId: "CARRIER",
    }, carrierProjection, CACHED_AT);

    expect(row).toMatchObject({
      partyId: "FEDEX",
      groupName: "FedEx",
      partyTypeId: "PARTY_GROUP",
      roleTypeId: "CARRIER",
      cachedAt: CACHED_AT,
    });
    expect(carrierCache.table).toBe("carriers");
  });

  it("includes the carrier in a shipment-method key so equal methods do not collide", () => {
    const fedex = projectRow({
      partyId: "FEDEX",
      roleTypeId: "CARRIER",
      shipmentMethodTypeId: "GROUND",
      sequenceNumber: "10",
      carrierServiceCode: "FEDEX_GROUND",
      deliveryDays: "5",
    }, carrierShipmentMethodProjection, CACHED_AT);
    const ups = projectRow({
      partyId: "UPS",
      roleTypeId: "CARRIER",
      shipmentMethodTypeId: "GROUND",
      sequenceNumber: "10",
    }, carrierShipmentMethodProjection, CACHED_AT);

    expect(fedex).toMatchObject({
      carrierShipmentMethodKey: "FEDEX|CARRIER|GROUND",
      sequenceNumber: 10,
      carrierServiceCode: "FEDEX_GROUND",
      deliveryDays: 5,
    });
    expect(ups?.carrierShipmentMethodKey).toBe("UPS|CARRIER|GROUND");
    expect(ups?.carrierShipmentMethodKey).not.toBe(fedex?.carrierShipmentMethodKey);
    expect(carrierShipmentMethodCache.table).toBe("carrierShipmentMethods");
  });

  it("includes carrier, facility, role, and effective start in a facility key", () => {
    const fedex = projectRow({
      partyId: "FEDEX",
      facilityId: "BROADWAY",
      roleTypeId: "CARRIER",
      fromDate: "1800000000000",
      thruDate: "1800003600000",
    }, carrierFacilityProjection, CACHED_AT);
    const ups = projectRow({
      partyId: "UPS",
      facilityId: "BROADWAY",
      roleTypeId: "CARRIER",
      fromDate: "1800000000000",
    }, carrierFacilityProjection, CACHED_AT);

    expect(fedex).toMatchObject({
      carrierFacilityKey: "FEDEX|BROADWAY|CARRIER|1800000000000",
      fromDate: 1_800_000_000_000,
      thruDate: 1_800_003_600_000,
    });
    expect(ups?.carrierFacilityKey).toBe("UPS|BROADWAY|CARRIER|1800000000000");
    expect(ups?.carrierFacilityKey).not.toBe(fedex?.carrierFacilityKey);
    expect(carrierFacilityCache.table).toBe("carrierFacilities");
  });

  it("retains store scope, sequencing, gateway, and expiration fields", () => {
    const storeOne = projectRow({
      productStoreShipMethId: "PSM_1",
      productStoreId: "STORE_1",
      shipmentMethodTypeId: "GROUND",
      partyId: "FEDEX",
      roleTypeId: "CARRIER",
      sequenceNumber: "20",
      shipmentGatewayConfigId: "FEDEX_CONFIG",
      fromDate: "1800000000000",
      thruDate: "1800003600000",
    }, productStoreShippingMethodProjection, CACHED_AT);
    const storeTwo = projectRow({
      productStoreShipMethId: "PSM_2",
      productStoreId: "STORE_2",
      shipmentMethodTypeId: "GROUND",
      partyId: "FEDEX",
      roleTypeId: "CARRIER",
    }, productStoreShippingMethodProjection, CACHED_AT);

    expect(storeOne).toMatchObject({
      productStoreShipMethId: "PSM_1",
      productStoreId: "STORE_1",
      sequenceNumber: 20,
      shipmentGatewayConfigId: "FEDEX_CONFIG",
      thruDate: 1_800_003_600_000,
    });
    expect(storeTwo?.productStoreShipMethId).toBe("PSM_2");
    expect(storeTwo?.productStoreId).toBe("STORE_2");
  });
});
