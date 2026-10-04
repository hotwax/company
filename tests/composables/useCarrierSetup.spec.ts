import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const h = vi.hoisted(() => ({ api: vi.fn(), enable: vi.fn(), update: vi.fn(), createType: vi.fn(), store: vi.fn(), facility: vi.fn(), group: vi.fn(), mapping: vi.fn(), refresh: vi.fn(), detail: {} as any, sla: {} as any, types: {} as any, mappings: {} as any }));
vi.mock("@common", () => ({ api: (...args: any[]) => h.api(...args), commonUtil: { hasError: (response: any) => !!response?.data?.errors } }));
vi.mock("@/composables/useCarriers", () => ({ useCarrier: (id: string) => id === "_NA_" ? h.sla : h.detail, useCarrierShipmentMethods: () => ({ configuredMethods: h.sla.configuredShipmentMethods, hydrated: ref(true) }), enableCarrierShipmentMethod: (...args: any[]) => h.enable(...args), updateCarrierShipmentMethod: (...args: any[]) => h.update(...args), activeAt: (row: any) => !row.thruDate }));
vi.mock("@/composables/useSeed", () => ({ useShipmentMethodTypes: () => ({ shipmentMethodTypes: h.types, hydrated: ref(true) }), useShipmentMethodTypeMutations: () => ({ createShipmentMethodType: (...args: any[]) => h.createType(...args) }) }));
vi.mock("@/composables/useFacilities", () => ({ useGroupMembershipIndex: () => ({ active: ref([]), hydrated: ref(true) }), useFacilityMutations: () => ({ addToGroup: (...args: any[]) => h.group(...args) }), setCarrierFacilityAssociation: (...args: any[]) => h.facility(...args) }));
vi.mock("@/composables/useProductStores", () => ({ addProductStoreShipmentMethod: (...args: any[]) => h.store(...args) }));
vi.mock("@/composables/useShopify", () => ({ useShopifyShops: () => ({ shops: ref([]), hydrated: ref(true) }), useShopifyCarrierShipments: () => ({ carrierShipments: h.mappings, hydrated: ref(true) }), useShopifyShopMutations: () => ({ saveCarrierShipment: (...args: any[]) => h.mapping(...args) }) }));
vi.mock("@/services/appCacheBootstrap", () => ({ bootstrapState: { errors: {} }, resyncDomain: (...args: any[]) => h.refresh(...args) }));
vi.mock("@/composables/sessionScope", () => ({ onSessionCleared: () => () => {} }));
import { useCarrierSetup } from "@/composables/useCarrierSetup";
import { CacheReconciliationError } from "@/utils/cacheReconciliationError";

beforeEach(() => {
  vi.clearAllMocks();
  h.detail = { readyForMutation: ref(true), configuredShipmentMethods: ref([]), facilities: ref([]), productStoreShipmentMethods: ref([]), refreshDetails: h.refresh };
  h.sla = { configuredShipmentMethods: ref([]), productStoreShipmentMethods: ref([]) };
  h.types = ref([]); h.mappings = ref([]);
  [h.enable, h.update, h.createType, h.store, h.facility, h.group, h.mapping, h.refresh].forEach(fn => fn.mockReset().mockResolvedValue({ data: {} }));
  h.api.mockReset();
});
describe("carrier setup write safety", () => {
  it("creates service types before carrier rows and writes real service codes", async () => {
    const setup = useCarrierSetup("FEDEX");
    const service = { shipmentMethodTypeId: "FDX_GROUND", description: "FedEx Ground", carrierServiceCode: "FEDEX_GROUND" };
    expect(await setup.saveMethods([service], [])).toBe(true);
    expect(h.createType).toHaveBeenCalledWith({ shipmentMethodTypeId: "FDX_GROUND", description: "FedEx Ground" });
    expect(h.enable).toHaveBeenCalledWith("FEDEX", "FDX_GROUND");
    expect(h.update).toHaveBeenCalledWith("FEDEX", "FDX_GROUND", { carrierServiceCode: "FEDEX_GROUND" });
    expect(h.createType.mock.invocationCallOrder[0]).toBeLessThan(h.enable.mock.invocationCallOrder[0]);
    await setup.saveMethods([service], []);
    expect(h.enable).toHaveBeenCalledTimes(1);
  });
  it("preserves existing methods and writes SLA promises to the neutral carrier", async () => {
    h.types.value = [{ shipmentMethodTypeId: "GROUND" }];
    h.detail.configuredShipmentMethods.value = [{ shipmentMethodTypeId: "GROUND", carrierServiceCode: "FEDEX_GROUND" }];
    const setup = useCarrierSetup("FEDEX");
    await setup.saveMethods([{ shipmentMethodTypeId: "GROUND", description: "Ground", carrierServiceCode: "FEDEX_GROUND" }], [{ shipmentMethodTypeId: "NEXT_DAY", description: "Next Day", deliveryDays: 1 }]);
    expect(h.enable).toHaveBeenCalledTimes(1);
    expect(h.enable).toHaveBeenCalledWith("_NA_", "NEXT_DAY");
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith("_NA_", "NEXT_DAY", { deliveryDays: 1 });
  });
  it("blocks replay after a committed write whose refresh failed", async () => {
    h.createType.mockRejectedValue(new CacheReconciliationError("shipmentMethodType", { shipmentMethodTypeId: "GROUND" }, new Error("refresh")));
    const setup = useCarrierSetup("FEDEX");
    const methods = [{ shipmentMethodTypeId: "GROUND", description: "Ground" }];
    expect(await setup.saveMethods(methods, [])).toBe(false);
    expect(setup.needsRefresh.value).toBe(true);
    expect(setup.notice.value).toContain("saved");
    expect(await setup.saveMethods(methods, [])).toBe(false);
    expect(h.createType).toHaveBeenCalledTimes(1);
    expect(h.enable).not.toHaveBeenCalled();
  });
  it("does not overwrite a configured service code", async () => {
    h.types.value = [{ shipmentMethodTypeId: "GROUND" }];
    h.detail.configuredShipmentMethods.value = [{ shipmentMethodTypeId: "GROUND", carrierServiceCode: "OTHER" }];
    const setup = useCarrierSetup("FEDEX");
    expect(await setup.saveMethods([{ shipmentMethodTypeId: "GROUND", description: "Ground", carrierServiceCode: "FEDEX_GROUND" }], [])).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
    expect(setup.notice.value).toContain("different service code");
  });
  it("enables fulfillment before creating the carrier facility association", async () => {
    const setup = useCarrierSetup("FEDEX");
    await setup.saveFacilities(["F1"], true, false);
    expect(h.group).toHaveBeenCalledWith(expect.objectContaining({ facilityGroupId: "OMS_FULFILLMENT" }));
    expect(h.group.mock.invocationCallOrder[0]).toBeLessThan(h.facility.mock.invocationCallOrder[0]);
    expect(h.group).toHaveBeenCalledTimes(1);
  });
  it("does not duplicate existing store links", async () => {
    h.detail.productStoreShipmentMethods.value = [{ productStoreId: "STORE", shipmentMethodTypeId: "GROUND" }];
    const setup = useCarrierSetup("FEDEX");
    await setup.saveStores(["STORE"], [{ shipmentMethodTypeId: "GROUND", description: "Ground" }], [], true);
    expect(h.store).not.toHaveBeenCalled();
  });
  it("never replaces an existing Shopify shipping-name mapping", async () => {
    h.mappings.value = [{ shopId: "SHOP", shopifyShippingMethod: "Standard", carrierPartyId: "UPS" }];
    const setup = useCarrierSetup("FEDEX");
    expect(await setup.saveMapping("SHOP", "Standard", "GROUND", false)).toBe(false);
    expect(h.mapping).not.toHaveBeenCalled();
  });
  it("fails closed on malformed credential reads and does not expose returned secrets", async () => {
    h.api.mockResolvedValueOnce({ data: { unexpected: [] } });
    const setup = useCarrierSetup("FEDEX");
    await expect(setup.loadCredentials()).rejects.toThrow();
    expect(setup.credentialsLoaded.value).toBe(false);
    h.api.mockResolvedValueOnce({ data: { shipAuthList: [{ shippingGatewayConfigId: "FEDEX", shippingGatewayAuthId: "A", username: "private-key", publicKey: "private-secret", baseUrl: "https://apis-sandbox.fedex.com" }] } });
    await setup.loadCredentials();
    expect(JSON.stringify(setup.credentials.value)).not.toContain("private");
    expect(setup.credentials.value[0].id).toBe("A");
  });
  it("refuses an existing facility account from another credential/environment", async () => {
    h.api.mockResolvedValueOnce({ data: { shipAuthList: [{ shippingGatewayAuthId: "TEST", shippingGatewayConfigId: "FEDEX" }] } }).mockResolvedValueOnce({ data: { carrierConfigList: [{ carrierPartyId: "FEDEX", carrierConfigId: "OLD", productStoreId: "STORE", facilityId: "F1", gatewayAuthId: "LIVE" }] } });
    const setup = useCarrierSetup("FEDEX"); await setup.loadCredentials();
    expect(await setup.saveAccounts(["STORE"], ["F1"], "TEST", "account", {}, {})).toBe(false);
    expect(h.api).toHaveBeenCalledTimes(2);
    expect(setup.notice.value).toContain("different credentials");
  });
});
