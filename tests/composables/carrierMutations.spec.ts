import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: vi.fn(),
  refreshAfterMutation: vi.fn(),
  resyncDomain: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: {
    hasError: (response: any) => Boolean(
      response?.data?._ERROR_MESSAGE_
      || response?.data?._ERROR_MESSAGE_LIST_?.length
      || response?.data?.error,
    ),
  },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  bootstrapState: { running: false, written: {}, errors: {} },
  refreshAfterMutation: (...args: any[]) => harness.refreshAfterMutation(...args),
  resyncDomain: (...args: any[]) => harness.resyncDomain(...args),
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (error: any, fallback: string) =>
    error?.data?._ERROR_MESSAGE_
    || error?.data?._ERROR_MESSAGE_LIST_?.join(", ")
    || error?.response?.data?._ERROR_MESSAGE_
    || error?.message
    || fallback,
}));

import {
  createCarrier,
  deleteCarrierShipmentMethod,
  enableCarrierShipmentMethod,
  renameCarrier,
  resequenceCarrierShipmentMethods,
  updateCarrierShipmentMethod,
} from "@/composables/useCarriers";
import { setCarrierFacilityAssociation } from "@/composables/useFacilities";
import { useProductStoreMutations } from "@/composables/useProductStores";
import { useShipmentMethodTypeMutations } from "@/composables/useSeed";
import { updateSystemMessageRemote } from "@/composables/useKlaviyo";

const NOW = 1_800_000_000_000;
const ok = (data: any = {}) => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config: {},
});

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.clearAllMocks();
  harness.api.mockResolvedValue(ok());
  harness.refreshAfterMutation.mockResolvedValue(1);
  harness.resyncDomain.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("carrier identity mutations", () => {
  it("creates a carrier and refreshes the returned party partition", async () => {
    harness.api.mockResolvedValue(ok({ partyId: "FEDEX" }));

    await expect(createCarrier({ partyId: "FEDEX", groupName: "FedEx" })).resolves.toBe("FEDEX");

    expect(harness.api).toHaveBeenCalledWith({
      url: "oms/shippingGateways/carrierParties",
      method: "post",
      data: { partyId: "FEDEX", groupName: "FedEx" },
    });
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("carrier", { partyId: "FEDEX" });
  });

  it("renames through the encoded organization route and rejects payload-level errors", async () => {
    await renameCarrier("CARRIER/1", "Carrier One");
    expect(harness.api).toHaveBeenLastCalledWith({
      url: "admin/organizations/CARRIER%2F1",
      method: "post",
      data: { partyId: "CARRIER/1", groupName: "Carrier One" },
    });
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith("carrier", { partyId: "CARRIER/1" });

    vi.clearAllMocks();
    harness.api.mockResolvedValue(ok({ _ERROR_MESSAGE_: "duplicate" }));
    await expect(createCarrier({ partyId: "FEDEX", groupName: "FedEx" }))
      .rejects.toThrow("duplicate");
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
  });
});

describe("carrier shipment-method mutations", () => {
  it("enables and updates with the three-part carrier-method key", async () => {
    await enableCarrierShipmentMethod("FEDEX", "GROUND");
    await updateCarrierShipmentMethod("FEDEX", "GROUND", {
      carrierServiceCode: "FEDEX_GROUND",
      deliveryDays: 3,
    });

    expect(harness.api.mock.calls.map(([request]) => request)).toEqual([
      {
        url: "oms/shippingGateways/carrierShipmentMethods",
        method: "post",
        data: {
          partyId: "FEDEX",
          roleTypeId: "CARRIER",
          shipmentMethodTypeId: "GROUND",
        },
      },
      {
        url: "oms/shippingGateways/carrierShipmentMethods",
        method: "put",
        data: {
          partyId: "FEDEX",
          roleTypeId: "CARRIER",
          shipmentMethodTypeId: "GROUND",
          carrierServiceCode: "FEDEX_GROUND",
          deliveryDays: 3,
        },
      },
    ]);
    expect(harness.refreshAfterMutation).toHaveBeenNthCalledWith(
      1,
      "carrierShipmentMethod",
      { partyId: "FEDEX" },
    );
    expect(harness.refreshAfterMutation).toHaveBeenNthCalledWith(
      2,
      "carrierShipmentMethod",
      { partyId: "FEDEX" },
    );
  });

  it("expires active store associations before hard-deleting the carrier method", async () => {
    await deleteCarrierShipmentMethod("FEDEX", "GROUND", [
      {
        productStoreShipMethId: "PSM_1",
        productStoreId: "STORE/1",
        partyId: "FEDEX",
        shipmentMethodTypeId: "GROUND",
        fromDate: 1_000,
      },
      {
        productStoreShipMethId: "PSM_2",
        productStoreId: "STORE/1",
        partyId: "FEDEX",
        shipmentMethodTypeId: "GROUND",
        fromDate: 1_000,
      },
      {
        productStoreShipMethId: "PSM_EXPIRED",
        productStoreId: "STORE/1",
        partyId: "FEDEX",
        shipmentMethodTypeId: "GROUND",
        fromDate: 1_000,
        thruDate: NOW,
      },
      {
        productStoreShipMethId: "PSM_UPS",
        productStoreId: "STORE/1",
        partyId: "UPS",
        shipmentMethodTypeId: "GROUND",
        fromDate: 1_000,
      },
    ]);

    expect(harness.api.mock.calls.map(([request]) => request)).toEqual([
      {
        url: "oms/productStores/STORE%2F1/shipmentMethods",
        method: "put",
        data: { productStoreShipMethId: "PSM_1", thruDate: NOW },
      },
      {
        url: "oms/productStores/STORE%2F1/shipmentMethods",
        method: "put",
        data: { productStoreShipMethId: "PSM_2", thruDate: NOW },
      },
      {
        url: "oms/shippingGateways/carrierShipmentMethods",
        method: "delete",
        data: {
          partyId: "FEDEX",
          roleTypeId: "CARRIER",
          shipmentMethodTypeId: "GROUND",
        },
      },
    ]);
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith(
      "productStoreShippingMethod",
      { productStoreId: "STORE/1" },
    );
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith(
      "carrierShipmentMethod",
      { partyId: "FEDEX" },
    );
    expect(harness.refreshAfterMutation).toHaveBeenCalledTimes(2);
    expect(harness.resyncDomain).toHaveBeenCalledTimes(1);
    expect(harness.resyncDomain).toHaveBeenCalledWith("productStoreShipmentCount");
    const deleteCallOrder = harness.api.mock.invocationCallOrder[2];
    expect(harness.refreshAfterMutation.mock.invocationCallOrder.every(
      (callOrder) => callOrder > deleteCallOrder,
    )).toBe(true);
    expect(harness.resyncDomain.mock.invocationCallOrder.every(
      (callOrder) => callOrder > deleteCallOrder,
    )).toBe(true);
  });

  it("does not delete after a partial store expiry and forces full store-domain resync", async () => {
    harness.api
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({ _ERROR_MESSAGE_: "store two failed" }));

    await expect(deleteCarrierShipmentMethod("FEDEX", "GROUND", [
      {
        productStoreShipMethId: "PSM_1",
        productStoreId: "STORE_1",
        partyId: "FEDEX",
        shipmentMethodTypeId: "GROUND",
      },
      {
        productStoreShipMethId: "PSM_2",
        productStoreId: "STORE_2",
        partyId: "FEDEX",
        shipmentMethodTypeId: "GROUND",
      },
    ])).rejects.toThrow(/1 of 2 product-store associations were expired/i);

    expect(harness.api.mock.calls.some(([request]) =>
      request.method === "delete" && request.url.includes("carrierShipmentMethods"))).toBe(false);
    expect(harness.resyncDomain).toHaveBeenCalledWith("productStoreShippingMethod");
    expect(harness.resyncDomain).toHaveBeenCalledWith("productStoreShipmentCount");
    expect(harness.resyncDomain).toHaveBeenCalledTimes(2);
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
  });

  it("full-resyncs both affected domain families when delete fails after expiries commit", async () => {
    harness.api
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({ _ERROR_MESSAGE_: "carrier delete refused" }));

    await expect(deleteCarrierShipmentMethod("FEDEX", "GROUND", [{
      productStoreShipMethId: "PSM_1",
      productStoreId: "STORE_1",
      partyId: "FEDEX",
      shipmentMethodTypeId: "GROUND",
    }])).rejects.toThrow(/carrier delete refused.*1 product-store associations were already expired/i);

    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
    expect(harness.resyncDomain.mock.calls).toEqual(expect.arrayContaining([
      ["productStoreShippingMethod"],
      ["productStoreShipmentCount"],
      ["carrierShipmentMethod"],
    ]));
    expect(harness.resyncDomain).toHaveBeenCalledTimes(3);
  });

  it("writes one-based sequence positions, refreshes once, and resyncs after partial commits", async () => {
    await resequenceCarrierShipmentMethods("FEDEX", [
      { shipmentMethodTypeId: "GROUND" },
      { shipmentMethodTypeId: "NEXT_DAY" },
    ]);

    expect(harness.api.mock.calls.map(([request]) => request.data.sequenceNumber)).toEqual([1, 2]);
    expect(harness.refreshAfterMutation).toHaveBeenCalledTimes(1);
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith(
      "carrierShipmentMethod",
      { partyId: "FEDEX" },
    );

    vi.clearAllMocks();
    harness.api
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({ error: "cannot update" }));
    await expect(resequenceCarrierShipmentMethods("FEDEX", [
      { shipmentMethodTypeId: "GROUND" },
      { shipmentMethodTypeId: "NEXT_DAY" },
    ])).rejects.toThrow(/1 of 2 shipment methods were resequenced/i);
    expect(harness.resyncDomain).toHaveBeenCalledWith("carrierShipmentMethod");
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
  });
});

describe("owned association mutations", () => {
  it("renames a shipment type and re-snapshots the global type domain", async () => {
    const { renameShipmentMethodType } = useShipmentMethodTypeMutations();
    await renameShipmentMethodType("NEXT/DAY", "Next day");

    expect(harness.api).toHaveBeenCalledWith({
      url: "oms/shippingGateways/shipmentMethodTypes/NEXT%2FDAY",
      method: "put",
      data: { shipmentMethodTypeId: "NEXT/DAY", description: "Next day" },
    });
    expect(harness.resyncDomain).toHaveBeenCalledWith("shipmentMethodType");
  });

  it("creates and closes the exact carrier-facility row before refreshing its carrier partition", async () => {
    await setCarrierFacilityAssociation({
      partyId: "FEDEX",
      facilityId: "FAC/1",
      enabled: true,
    });
    await setCarrierFacilityAssociation({
      partyId: "FEDEX",
      facilityId: "FAC/1",
      enabled: false,
      fromDate: "1700000000000",
    });

    expect(harness.api.mock.calls.map(([request]) => request)).toEqual([
      {
        url: "oms/facilities/FAC%2F1/parties",
        method: "post",
        data: {
          partyId: "FEDEX",
          facilityId: "FAC/1",
          roleTypeId: "CARRIER",
          fromDate: NOW,
        },
      },
      {
        url: "oms/facilities/FAC%2F1/parties",
        method: "put",
        data: {
          partyId: "FEDEX",
          facilityId: "FAC/1",
          roleTypeId: "CARRIER",
          fromDate: "1700000000000",
          thruDate: NOW,
        },
      },
    ]);
    expect(harness.refreshAfterMutation).toHaveBeenNthCalledWith(
      1,
      "carrierFacility",
      { partyId: "FEDEX" },
    );
    expect(harness.refreshAfterMutation).toHaveBeenNthCalledWith(
      2,
      "carrierFacility",
      { partyId: "FEDEX" },
    );
  });

  it("adds, updates, and expires store methods through the OMS route and refreshes both domains", async () => {
    const mutations = useProductStoreMutations("STORE/1");

    await mutations.addShipmentMethod({
      shipmentMethodTypeId: "GROUND",
      partyId: "FEDEX",
    });
    await mutations.updateShipmentMethod("PSM_1", {
      isTrackingRequired: "Y",
      shipmentGatewayConfigId: "FEDEX_CONFIG",
      productStoreShipMethId: "ATTACKER_SELECTED_DIFFERENT_ROW",
    });
    await mutations.expireShipmentMethod("PSM_1");

    expect(harness.api.mock.calls.map(([request]) => request)).toEqual([
      {
        url: "oms/productStores/STORE%2F1/shipmentMethods",
        method: "post",
        data: {
          productStoreId: "STORE/1",
          shipmentMethodTypeId: "GROUND",
          partyId: "FEDEX",
          roleTypeId: "CARRIER",
          fromDate: NOW,
        },
      },
      {
        url: "oms/productStores/STORE%2F1/shipmentMethods",
        method: "put",
        data: {
          productStoreShipMethId: "PSM_1",
          isTrackingRequired: "Y",
          shipmentGatewayConfigId: "FEDEX_CONFIG",
        },
      },
      {
        url: "oms/productStores/STORE%2F1/shipmentMethods",
        method: "put",
        data: {
          productStoreShipMethId: "PSM_1",
          thruDate: NOW,
        },
      },
    ]);
    expect(harness.refreshAfterMutation).toHaveBeenCalledTimes(3);
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith(
      "productStoreShippingMethod",
      { productStoreId: "STORE/1" },
    );
    expect(harness.resyncDomain).toHaveBeenCalledTimes(2);
    expect(harness.resyncDomain).toHaveBeenCalledWith("productStoreShipmentCount");
  });

  it("reports payload error lists and does not refresh the store cache", async () => {
    harness.api.mockResolvedValue(ok({ _ERROR_MESSAGE_LIST_: ["association rejected"] }));
    const mutations = useProductStoreMutations("STORE/1");

    await expect(mutations.updateShipmentMethod("PSM_1", { isTrackingRequired: "Y" }))
      .rejects.toThrow("association rejected");
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
    expect(harness.resyncDomain).not.toHaveBeenCalled();
  });
});

describe("Unigate cache coherence", () => {
  it("refreshes the cached system-message remote only after a successful update", async () => {
    harness.api.mockResolvedValue(ok({
      systemMessageRemoteId: "UNIGATE/1",
      internalId: "tenant",
      sendUrl: "https://unigate.example/",
    }));

    await updateSystemMessageRemote("UNIGATE/1", {
      internalId: "tenant",
      sendUrl: "https://unigate.example/",
    });

    expect(harness.api).toHaveBeenCalledWith({
      url: "oms/systemMessageRemotes/UNIGATE%2F1",
      method: "put",
      data: {
        internalId: "tenant",
        sendUrl: "https://unigate.example/",
      },
    });
    expect(harness.refreshAfterMutation).toHaveBeenCalledWith(
      "systemMessageRemote",
      { systemMessageRemoteId: "UNIGATE/1" },
    );

    vi.clearAllMocks();
    harness.api.mockResolvedValue(ok({ _ERROR_MESSAGE_: "remote update failed" }));
    await expect(updateSystemMessageRemote("UNIGATE/1", { internalId: "tenant" }))
      .rejects.toThrow("remote update failed");
    expect(harness.refreshAfterMutation).not.toHaveBeenCalled();
  });
});
