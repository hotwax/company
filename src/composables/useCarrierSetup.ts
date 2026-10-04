
import { api, commonUtil } from "@common";
import { computed, ref } from "vue";
import { bootstrapState, resyncDomain } from "@/services/appCacheBootstrap";
import { isCacheReconciliationError } from "@/utils/cacheReconciliationError";
import { type SetupMethod, fedexCredentialPayload } from "@/utils/carrierSetup";
import { onSessionCleared } from "./sessionScope";
import { activeAt, enableCarrierShipmentMethod, updateCarrierShipmentMethod, useCarrier, useCarrierShipmentMethods } from "./useCarriers";
import { setCarrierFacilityAssociation, useFacilityMutations, useGroupMembershipIndex } from "./useFacilities";
import { addProductStoreShipmentMethod } from "./useProductStores";
import { useShipmentMethodTypeMutations, useShipmentMethodTypes } from "./useSeed";
import { useShopifyCarrierShipments, useShopifyShopMutations, useShopifyShops } from "./useShopify";

// Projection deliberately excludes API credentials; secrets never enter persistent cache/drafts.
class SetupConflict extends Error {}

type CredentialSummary = { id: string; description: string; baseUrl: string };
type AccountConfig = { carrierConfigId: string; carrierPartyId: string; productStoreId: string; facilityId?: string; gatewayAuthId: string };
export function useCarrierSetup(partyId: string) {
  const detail = useCarrier(partyId);
  const sla = useCarrierShipmentMethods("_NA_");
  const types = useShipmentMethodTypes();
  const typeMutations = useShipmentMethodTypeMutations();
  const groups = useGroupMembershipIndex();
  const shopRead = useShopifyShops();
  const shopMappings = useShopifyCarrierShipments(undefined);
  const busy = ref(false);
  const notice = ref("");
  const needsRefresh = ref(false);
  const credentials = ref<CredentialSummary[]>([]);
  const configs = ref<AccountConfig[]>([]);
  const credentialsLoaded = ref(false);
  const configsLoaded = ref(false);
  // Prevent replay within a mounted wizard after a committed write or ambiguous network failure.
  const completedWrites = new Set<string>();
  const blockedWrites = new Set<string>();
  const ready = computed(() => detail.readyForMutation.value && types.hydrated.value && groups.hydrated.value && sla.hydrated.value && shopRead.hydrated.value && shopMappings.hydrated.value && !needsRefresh.value && !["facilityGroupMember", "shopifyShop", "shopifyCarrierShipment"].some(domain => bootstrapState.errors[domain]));
  const inGroup = (facilityId: string, groupId: string) => groups.active.value.some(row => row.facilityId === facilityId && row.facilityGroupId === groupId && activeAt(row));

  async function run(action: () => Promise<void>, success = "Changes saved.") {
    if(busy.value) {return false;}
    busy.value = true; notice.value = "";
    try {
      await action(); notice.value = success;

      return true;
    } catch (error) {
      if(isCacheReconciliationError(error)) {
        needsRefresh.value = true;
        notice.value = "Changes were saved, but the screen could not refresh. Reload setup before making more changes.";
      } else if(error instanceof SetupConflict) {
        notice.value = error.message;
      } else {
        notice.value = "This step could not be completed. Earlier saved changes are retained. Refresh setup before retrying.";
      }

      return false;
    } finally { busy.value = false; }
  }
  async function writeOnce(key: string, action: () => Promise<unknown>) {
    if(completedWrites.has(key)) {return;}
    if(blockedWrites.has(key)) {throw new Error("Refresh required");}
    try { await action(); completedWrites.add(key); } catch (error) {
      if(isCacheReconciliationError(error)) {completedWrites.add(key);} else {blockedWrites.add(key);}
      needsRefresh.value = true;
      throw error;
    }
  }
  function assertReady() { if(!ready.value) {throw new Error("Setup data unavailable");} }
  async function ensureMethod(carrierId: string, method: SetupMethod) {
    const id = method.shipmentMethodTypeId;
    if(!types.shipmentMethodTypes.value.some(row => row.shipmentMethodTypeId === id)) {
      await writeOnce(`type:${id}`, () => typeMutations.createShipmentMethodType({ shipmentMethodTypeId: id, description: method.description }));
    }
    const records = carrierId === partyId ? detail.configuredShipmentMethods.value : sla.configuredMethods.value;
    const existing = records.find(row => row.shipmentMethodTypeId === id);
    if(!existing) {await writeOnce(`method:${carrierId}:${id}`, () => enableCarrierShipmentMethod(carrierId, id));}
    // Do not silently change existing carrier codes or shared SLA promises.
    if(existing && ((method.carrierServiceCode && existing.carrierServiceCode && existing.carrierServiceCode !== method.carrierServiceCode) ||
      (method.deliveryDays !== "" && method.deliveryDays != null && existing.deliveryDays != null && existing.deliveryDays !== "" && Number(existing.deliveryDays) !== Number(method.deliveryDays)))) {
      throw new SetupConflict("A selected method already has a different service code or delivery promise. Review its existing settings before continuing.");
    }
    const fields: Record<string, string | number> = {};
    if(method.carrierServiceCode && !existing?.carrierServiceCode) {fields.carrierServiceCode = method.carrierServiceCode;}
    if(method.deliveryDays !== "" && method.deliveryDays != null && (existing?.deliveryDays == null || existing.deliveryDays === "")) {fields.deliveryDays = Number(method.deliveryDays);}
    if(Object.keys(fields).length) {await writeOnce(`fields:${carrierId}:${id}:${JSON.stringify(fields)}`, () => updateCarrierShipmentMethod(carrierId, id, fields));}
  }
  function saveMethods(methods: SetupMethod[], promises: SetupMethod[]) {
    return run(async () => { assertReady(); for(const method of methods) {await ensureMethod(partyId, method);} for(const method of promises) {await ensureMethod("_NA_", method);} });
  }
  function saveFacilities(ids: string[], enableFulfillment: boolean, automatic: boolean) {
    return run(async () => {
      assertReady();
      for(const id of ids) {
        const mutations = useFacilityMutations(id);
        if(!inGroup(id, "OMS_FULFILLMENT")) {
          if(!enableFulfillment) {throw new Error("Fulfillment must be enabled");}
          await writeOnce(`fulfillment:${id}`, async () => { const response = await mutations.addToGroup({ facilityGroupId: "OMS_FULFILLMENT", fromDate: Date.now() }); if(commonUtil.hasError(response)) {throw new Error("Membership failed");} });
        }
        if(!detail.facilities.value.some(row => row.facilityId === id && row.isConfigured)) {await writeOnce(`facility:${id}`, () => setCarrierFacilityAssociation({ partyId, facilityId: id, enabled: true }));}
        if(automatic && !inGroup(id, "AUTO_SHIPPING_LABEL")) {
          await writeOnce(`automatic:${id}`, async () => { const response = await mutations.addToGroup({ facilityGroupId: "AUTO_SHIPPING_LABEL", fromDate: Date.now() }); if(commonUtil.hasError(response)) {throw new Error("Membership failed");} });
        }
      }
    });
  }
  function saveStores(ids: string[], methods: SetupMethod[], promises: SetupMethod[], labels: boolean) {
    return run(async () => {
      assertReady();
      for(const storeId of ids) {
        for(const method of [...methods.map(row => ({ ...row, partyId })), ...promises.map(row => ({ ...row, partyId: "_NA_" }))]) {
          const rows = method.partyId === partyId ? detail.productStoreShipmentMethods.value : slaStoreMethods.value;
          if(!rows.some(row => row.productStoreId === storeId && row.shipmentMethodTypeId === method.shipmentMethodTypeId && activeAt(row))) {
            await writeOnce(`store:${storeId}:${method.partyId}:${method.shipmentMethodTypeId}`, () => addProductStoreShipmentMethod(storeId, { partyId: method.partyId, shipmentMethodTypeId: method.shipmentMethodTypeId, isTrackingRequired: labels ? "Y" : "N" }));
          }
        }
      }
    });
  }
  // Cached read through the same carrier aggregate also covers carrier-neutral SLA store rows.
  const { productStoreShipmentMethods: slaStoreMethods } = useCarrier("_NA_");
  async function loadCredentials() {
    credentialsLoaded.value = false; credentials.value = [];
    const response = await api({ url: "oms/shipping/gatewayAuths", method: "get", cache: false });
    const rows = response.data?.shipAuthList;
    if(commonUtil.hasError(response) || !Array.isArray(rows) || !rows.every((row: any) => typeof row?.shippingGatewayAuthId === "string" && row.shippingGatewayAuthId && typeof row?.shippingGatewayConfigId === "string")) {throw new Error("Credentials unavailable");}
    credentials.value = rows.filter((row: any) => row.shippingGatewayConfigId === (partyId === "CANADA_POST" ? "CANADAPOST" : partyId)).map((row: any) => ({ id: String(row.shippingGatewayAuthId), description: String(row.description || row.shippingGatewayAuthId), baseUrl: String(row.baseUrl || "") }));
    credentialsLoaded.value = true;
  }
  async function loadConfigs() {
    configsLoaded.value = false; configs.value = [];
    const response = await api({ url: "oms/shipping/carrierConfigs", method: "get", cache: false });
    const rows = response.data?.carrierConfigList;
    if(commonUtil.hasError(response) || !Array.isArray(rows)) {throw new Error("Accounts unavailable");}
    configs.value = rows.filter((row: any) => row.carrierPartyId === partyId).map((row: any) => ({ carrierConfigId: row.carrierConfigId, carrierPartyId: row.carrierPartyId, productStoreId: row.productStoreId, facilityId: row.facilityId, gatewayAuthId: row.gatewayAuthId }));
    configsLoaded.value = true;
  }
  function saveCredential(id: string, environment: "test" | "live", name: string, key: string, secret: string) {
    return run(async () => {
      if(partyId !== "FEDEX" || !credentialsLoaded.value || !key.trim() || !secret.trim()) {throw new Error("Missing credentials");}
      await writeOnce(`credential:${id}`, async () => {
        const response = await api({ url: "oms/shipping/gatewayAuths", method: "post", data: fedexCredentialPayload(id, environment, name, key, secret) });
        if(commonUtil.hasError(response)) {throw new Error("Credential save failed");}
      });
      await loadCredentials();
    }, "Credentials saved. FedEx authentication and label generation still need verification.");
  }
  function saveAccounts(stores: string[], facilities: string[], authId: string, account: string, overrides: Record<string, string>, preferences: Record<string, string>) {
    return run(async () => {
      assertReady();
      if(!credentialsLoaded.value || !credentials.value.some(row => row.id === authId) || !account.trim()) {throw new Error("Account required");}
      await loadConfigs();
      for(const productStoreId of stores) {
        for(const facilityId of facilities) {
          const existing = configs.value.find(row => row.productStoreId === productStoreId && row.facilityId === facilityId);
          // Existing accounts are never overwritten by the wizard's defaults.
          if(existing) {
            if(existing.gatewayAuthId !== authId) {throw new SetupConflict("An existing facility account uses different credentials. Review existing accounts before changing environment or account.");}
            continue;
          }
          await writeOnce(`account:${productStoreId}:${facilityId}`, async () => {
            const response = await api({ url: "oms/shipping/carrierConfigs", method: "post", data: { carrierPartyId: partyId, productStoreId, facilityId, gatewayAuthId: authId, carrierAccountId: overrides[facilityId]?.trim() || account.trim(), ...preferences } });
            if(commonUtil.hasError(response)) {throw new Error("Account save failed");}
          });
        }
      }
      await loadConfigs();
    });
  }
  function saveMapping(shopId: string, incoming: string, methodId: string, rate: boolean) {
    return run(async () => {
      assertReady();
      const existing = shopMappings.carrierShipments.value.find(row => row.shopId === shopId && row.shopifyShippingMethod === incoming.trim());
      if(existing) {throw new SetupConflict("This Shopify shipping name already has a mapping. Review it in Shopify settings before changing it.");}
      await writeOnce(`shop:${shopId}:${incoming.trim()}`, async () => {
        const response = await useShopifyShopMutations(shopId).saveCarrierShipment({ shopifyShippingMethod: incoming.trim(), carrierPartyId: rate ? "_NA_" : partyId, shipmentMethodTypeId: methodId });
        if(commonUtil.hasError(response)) {throw new Error("Mapping save failed");}
      });
    });
  }
  const clearSession = onSessionCleared(() => { credentials.value = []; configs.value = []; credentialsLoaded.value = false; configsLoaded.value = false; completedWrites.clear(); blockedWrites.clear(); });
  function refresh() {
    return run(async () => {
      await Promise.all([detail.refreshDetails(), ...["carrierShipmentMethod", "shipmentMethodType", "carrierFacility", "facilityGroupMember", "productStoreShippingMethod", "shopifyCarrierShipment"].map(domain => resyncDomain(domain))]);
      blockedWrites.clear(); needsRefresh.value = false;
    });
  }

  return { ...detail, ready, busy, notice, needsRefresh, credentials, credentialsLoaded, configs, configsLoaded, shops: shopRead.shops, shopMappings: shopMappings.carrierShipments,
    inGroup, saveMethods, saveFacilities, saveStores, loadCredentials, loadConfigs, saveCredential, saveAccounts, saveMapping, refresh, clearSession };
}
