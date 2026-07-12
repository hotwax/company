import { describe, expect, it } from "vitest";
import {
  mergeCarrierShipmentMethods,
  mergeProductStoreShipmentMethods,
} from "./carrierManagement";

describe("carrier management", () => {
  const methodTypes = [
    { shipmentMethodTypeId: "GROUND", description: "Ground" },
    { shipmentMethodTypeId: "NEXT_DAY", description: "Next day" },
  ];

  it("keeps every OMS shipment method and marks the carrier configuration", () => {
    expect(mergeCarrierShipmentMethods(methodTypes, [{
      shipmentMethodTypeId: "GROUND",
      carrierServiceCode: "FEDEX_GROUND",
    }])).toEqual([
      {
        shipmentMethodTypeId: "GROUND",
        description: "Ground",
        carrierServiceCode: "FEDEX_GROUND",
        isConfigured: true,
      },
      {
        shipmentMethodTypeId: "NEXT_DAY",
        description: "Next day",
        isConfigured: false,
      },
    ]);
  });

  it("scopes product-store associations to the selected store", () => {
    const methods = mergeProductStoreShipmentMethods(
      [{ shipmentMethodTypeId: "GROUND", partyId: "FEDEX" }],
      [
        { productStoreId: "STORE_A", shipmentMethodTypeId: "GROUND", isTrackingRequired: "Y" },
        { productStoreId: "STORE_B", shipmentMethodTypeId: "GROUND", isTrackingRequired: "N" },
      ],
      methodTypes,
      "STORE_A",
    );

    expect(methods).toEqual([expect.objectContaining({
      shipmentMethodTypeId: "GROUND",
      description: "Ground",
      isConfigured: true,
      isTrackingRequired: true,
    })]);
  });

  it("does not offer shipment methods that are not enabled for the carrier", () => {
    const methods = mergeProductStoreShipmentMethods(
      [{ shipmentMethodTypeId: "GROUND" }],
      [{ productStoreId: "STORE_A", shipmentMethodTypeId: "NEXT_DAY" }],
      methodTypes,
      "STORE_A",
    );

    expect(methods).toEqual([expect.objectContaining({
      shipmentMethodTypeId: "GROUND",
      isConfigured: false,
      isTrackingRequired: false,
    })]);
  });
});
