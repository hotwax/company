import { computed, reactive, ref, type Ref, unref } from "vue";
import { api, commonUtil } from "@common";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";
import { onSessionCleared } from "./sessionScope";

const log = {
  error: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.warn(...args),
};

const safeApi = async (req: any) => {
  if (typeof api === "function") {
    return await api(req);
  }
  return { data: [] };
};

export type UnigateRemoteConfig = {
  systemMessageRemoteId: string;
  internalId?: string;
  description?: string;
  sendUrl?: string;
  publicKey?: string;
  password?: string;
  authHeaderName?: string;
};

export type ShippingGatewayConfig = {
  shippingGatewayConfigId: string;
  description: string;
};

export type ShippingGatewayAuth = {
  shippingGatewayAuthId: string;
  shippingGatewayConfigId: string;
  tenantPartyId?: string;
  description?: string;
  baseUrl?: string;
  authHeaderName?: string;
  publicKey?: string;
  username?: string | null;
  password?: string | null;
};

export type ShippingCarrierConfig = {
  carrierConfigId?: string;
  carrierPartyId: string;
  productStoreId: string;
  facilityId?: string;
  gatewayAuthId: string;
  carrierAccountId?: string;
  customerNumber?: string;
  packagingType?: string;
  dropoffType?: string;
  labelSize?: string;
  labelImageType?: string;
  zplLabelImageType?: string;
  weightUomId?: string;
  smartPostHub?: string;
  physicalStoreLabelSize?: string;
  distributionCenterLabelSize?: string;
};

export type ShippingCarrierBillingConfig = {
  carrierBillingConfigId?: string;
  carrierPartyId: string;
  productStoreId: string;
  facilityId?: string;
  salesChannelEnumId?: string;
  billingAccountNumber?: string;
};

type FetchStatus = "none" | "pending" | "success" | "error";

const DEFAULT_GATEWAY_CONFIGS: ShippingGatewayConfig[] = [
  { shippingGatewayConfigId: "FEDEX", description: "FedEx Web Services / REST" },
  { shippingGatewayConfigId: "UPS", description: "UPS REST API" },
  { shippingGatewayConfigId: "CANADAPOST", description: "Canada Post" },
  { shippingGatewayConfigId: "SHIPHAWK", description: "ShipHawk" },
  { shippingGatewayConfigId: "DRIVIN", description: "DrivIn" },
  { shippingGatewayConfigId: "PUROLATOR", description: "Purolator" },
  { shippingGatewayConfigId: "C807", description: "C807 Express" },
];

const unwrapList = (data: any, key?: string): any[] => {
  if (Array.isArray(data)) return data;
  if (key && Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.docs)) return data.docs;
  return [];
};

const state = reactive({
  unigateConfig: null as UnigateRemoteConfig | null,
  shippingGatewayConfigs: [] as ShippingGatewayConfig[],
  shippingGatewayAuths: [] as ShippingGatewayAuth[],
  shippingCarrierConfigs: [] as ShippingCarrierConfig[],
  shippingCarrierBillingConfigs: [] as ShippingCarrierBillingConfig[],
});

const status = reactive({
  config: "none" as FetchStatus,
  gatewayConfigs: "none" as FetchStatus,
  auths: "none" as FetchStatus,
  carrierConfigs: "none" as FetchStatus,
  billingConfigs: "none" as FetchStatus,
});

onSessionCleared("useUnigate", () => {
  state.unigateConfig = null;
  state.shippingGatewayConfigs = [];
  state.shippingGatewayAuths = [];
  state.shippingCarrierConfigs = [];
  state.shippingCarrierBillingConfigs = [];
  status.config = "none";
  status.gatewayConfigs = "none";
  status.auths = "none";
  status.carrierConfigs = "none";
  status.billingConfigs = "none";
});

// =============================================================================================
// Remote Tenant Reads & Writes
// =============================================================================================

export async function fetchUnigateRemoteConfig(force = false): Promise<UnigateRemoteConfig | null> {
  if (status.config === "pending") return state.unigateConfig;
  if (!force && status.config === "success" && state.unigateConfig) return state.unigateConfig;

  status.config = "pending";
  try {
    const resp = await safeApi({
      url: "oms/systemMessageRemotes",
      method: "get",
      params: { systemMessageRemoteId: "UNIGATE_CONFIG" },
    });
    const list = unwrapList(resp.data, "systemMessageRemoteList");
    const found = list.find((item: any) => item.systemMessageRemoteId === "UNIGATE_CONFIG");
    state.unigateConfig = found || null;
    status.config = "success";
    return state.unigateConfig;
  } catch (err) {
    log.error("Failed to fetch UNIGATE_CONFIG", err);
    status.config = "error";
    return null;
  }
}

export async function updateUnigateConnection(payload: {
  sendUrl: string;
  internalId: string;
  publicKey?: string;
  password?: string;
  description?: string;
}): Promise<void> {
  const data: any = {
    systemMessageRemoteId: "UNIGATE_CONFIG",
    sendUrl: payload.sendUrl.trim(),
    internalId: payload.internalId.trim(),
    description: payload.description?.trim() || "Unigate configuration for shipping and communication integrations",
  };
  if (payload.publicKey?.trim()) {
    data.publicKey = payload.publicKey.trim();
  }
  if (payload.password?.trim()) {
    data.password = payload.password.trim();
  }

  await safeApi({
    url: state.unigateConfig ? "oms/systemMessageRemotes/UNIGATE_CONFIG" : "oms/systemMessageRemotes",
    method: state.unigateConfig ? "put" : "post",
    data,
  });

  try {
    await refreshAfterMutation("systemMessageRemote", { systemMessageRemoteId: "UNIGATE_CONFIG" });
  } catch (err) {
    log.warn("Cache refresh after remote mutation rejected", err);
  }

  await fetchUnigateRemoteConfig(true);
}

// =============================================================================================
// Shipping Gateway Configs (Providers)
// =============================================================================================

export async function fetchShippingGatewayConfigs(force = false): Promise<ShippingGatewayConfig[]> {
  if (status.gatewayConfigs === "pending") return state.shippingGatewayConfigs;
  if (!force && status.gatewayConfigs === "success" && state.shippingGatewayConfigs.length > 0) {
    return state.shippingGatewayConfigs;
  }

  status.gatewayConfigs = "pending";
  try {
    const resp = await safeApi({
      url: "oms/shippingGatewayConfigs",
      method: "get",
    });
    const list = unwrapList(resp.data, "shipGatewayConfigList");
    state.shippingGatewayConfigs = list.length > 0 ? list : DEFAULT_GATEWAY_CONFIGS;
    status.gatewayConfigs = "success";
  } catch (err) {
    log.warn("Failed to fetch shippingGatewayConfigs from server, using default registry", err);
    state.shippingGatewayConfigs = DEFAULT_GATEWAY_CONFIGS;
    status.gatewayConfigs = "success";
  }
  return state.shippingGatewayConfigs;
}

// =============================================================================================
// Shipping Gateway Auths (Carrier Credentials)
// =============================================================================================

export async function fetchShippingGatewayAuths(force = false): Promise<ShippingGatewayAuth[]> {
  if (status.auths === "pending") return state.shippingGatewayAuths;
  if (!force && status.auths === "success" && state.shippingGatewayAuths.length > 0) {
    return state.shippingGatewayAuths;
  }

  status.auths = "pending";
  try {
    const resp = await safeApi({
      url: "oms/shippingGatewayAuths",
      method: "get",
    });
    state.shippingGatewayAuths = unwrapList(resp.data, "shipAuthList");
    status.auths = "success";
  } catch (err) {
    log.error("Failed to fetch shippingGatewayAuths", err);
    status.auths = "error";
  }
  return state.shippingGatewayAuths;
}

export async function createShippingGatewayAuth(data: {
  shippingGatewayAuthId?: string;
  shippingGatewayConfigId: string;
  description: string;
  baseUrl?: string;
  username?: string;
  password?: string;
  publicKey?: string;
  authHeaderName?: string;
}): Promise<void> {
  await safeApi({
    url: "oms/shippingGatewayAuths",
    method: "post",
    data: {
      ...data,
      authHeaderName: data.authHeaderName || "Authorization",
    },
  });
  await fetchShippingGatewayAuths(true);
}

export async function updateShippingGatewayAuth(
  shippingGatewayAuthId: string,
  data: Partial<ShippingGatewayAuth>
): Promise<void> {
  await safeApi({
    url: `oms/shippingGatewayAuths/${shippingGatewayAuthId}`,
    method: "put",
    data,
  });
  await fetchShippingGatewayAuths(true);
}

export async function deleteShippingGatewayAuth(shippingGatewayAuthId: string): Promise<void> {
  await safeApi({
    url: `oms/shippingGatewayAuths/${shippingGatewayAuthId}`,
    method: "delete",
  });
  await fetchShippingGatewayAuths(true);
}

// =============================================================================================
// Shipping Carrier Configurations (OMS Carrier to Unigate Mappings)
// =============================================================================================

export async function fetchShippingCarrierConfigs(force = false): Promise<ShippingCarrierConfig[]> {
  if (status.carrierConfigs === "pending") return state.shippingCarrierConfigs;
  if (!force && status.carrierConfigs === "success" && state.shippingCarrierConfigs.length > 0) {
    return state.shippingCarrierConfigs;
  }

  status.carrierConfigs = "pending";
  try {
    const resp = await safeApi({
      url: "oms/shippingCarrierConfigs",
      method: "get",
    });
    state.shippingCarrierConfigs = unwrapList(resp.data);
    status.carrierConfigs = "success";
  } catch (err) {
    log.error("Failed to fetch shippingCarrierConfigs", err);
    status.carrierConfigs = "error";
  }
  return state.shippingCarrierConfigs;
}

export async function saveShippingCarrierConfig(data: ShippingCarrierConfig): Promise<void> {
  await safeApi({
    url: "oms/shippingCarrierConfigs",
    method: "post",
    data,
  });
  await fetchShippingCarrierConfigs(true);
}

export async function deleteShippingCarrierConfig(carrierConfigId: string): Promise<void> {
  await safeApi({
    url: `oms/shippingCarrierConfigs/${carrierConfigId}`,
    method: "delete",
  });
  await fetchShippingCarrierConfigs(true);
}

// =============================================================================================
// Shipping Carrier Billing Configurations
// =============================================================================================

export async function fetchShippingCarrierBillingConfigs(force = false): Promise<ShippingCarrierBillingConfig[]> {
  if (status.billingConfigs === "pending") return state.shippingCarrierBillingConfigs;
  if (!force && status.billingConfigs === "success" && state.shippingCarrierBillingConfigs.length > 0) {
    return state.shippingCarrierBillingConfigs;
  }

  status.billingConfigs = "pending";
  try {
    const resp = await safeApi({
      url: "oms/shippingCarrierBillingConfigs",
      method: "get",
    });
    state.shippingCarrierBillingConfigs = unwrapList(resp.data);
    status.billingConfigs = "success";
  } catch (err) {
    log.error("Failed to fetch shippingCarrierBillingConfigs", err);
    status.billingConfigs = "error";
  }
  return state.shippingCarrierBillingConfigs;
}

export async function saveShippingCarrierBillingConfig(data: ShippingCarrierBillingConfig): Promise<void> {
  await safeApi({
    url: "oms/shippingCarrierBillingConfigs",
    method: "post",
    data,
  });
  await fetchShippingCarrierBillingConfigs(true);
}

export async function deleteShippingCarrierBillingConfig(carrierBillingConfigId: string): Promise<void> {
  await safeApi({
    url: `oms/shippingCarrierBillingConfigs/${carrierBillingConfigId}`,
    method: "delete",
  });
  await fetchShippingCarrierBillingConfigs(true);
}

// =============================================================================================
// Composable Hook
// =============================================================================================

export function useUnigate() {
  const isConfigured = computed(() => {
    const cfg = state.unigateConfig;
    return Boolean(cfg?.internalId && cfg?.sendUrl);
  });

  const tenantId = computed(() => state.unigateConfig?.internalId || "");
  const sendUrl = computed(() => state.unigateConfig?.sendUrl || "");
  const hasKey = computed(() => Boolean(state.unigateConfig?.publicKey || state.unigateConfig?.password));

  const refreshAll = async () => {
    await Promise.allSettled([
      fetchUnigateRemoteConfig(true),
      fetchShippingGatewayConfigs(true),
      fetchShippingGatewayAuths(true),
      fetchShippingCarrierConfigs(true),
      fetchShippingCarrierBillingConfigs(true),
    ]);
  };

  return {
    unigateConfig: computed(() => state.unigateConfig),
    shippingGatewayConfigs: computed(() => state.shippingGatewayConfigs),
    shippingGatewayAuths: computed(() => state.shippingGatewayAuths),
    shippingCarrierConfigs: computed(() => state.shippingCarrierConfigs),
    shippingCarrierBillingConfigs: computed(() => state.shippingCarrierBillingConfigs),
    status: computed(() => status),
    isConfigured,
    tenantId,
    sendUrl,
    hasKey,
    refreshAll,
    fetchUnigateRemoteConfig,
    updateUnigateConnection,
    fetchShippingGatewayConfigs,
    fetchShippingGatewayAuths,
    createShippingGatewayAuth,
    updateShippingGatewayAuth,
    deleteShippingGatewayAuth,
    fetchShippingCarrierConfigs,
    saveShippingCarrierConfig,
    deleteShippingCarrierConfig,
    fetchShippingCarrierBillingConfigs,
    saveShippingCarrierBillingConfig,
    deleteShippingCarrierBillingConfig,
  };
}

export function useCarrierUnigateReadiness(carrierPartyIdRef: Ref<string | undefined> | string) {
  const { isConfigured, shippingGatewayAuths, shippingCarrierConfigs } = useUnigate();

  const carrierPartyId = computed(() => unref(carrierPartyIdRef));

  const matchingAuths = computed(() => {
    const party = (carrierPartyId.value || "").toUpperCase();
    if (!party) return [];
    return shippingGatewayAuths.value.filter((auth) => {
      const configId = (auth.shippingGatewayConfigId || "").toUpperCase();
      const authId = (auth.shippingGatewayAuthId || "").toUpperCase();
      const desc = (auth.description || "").toUpperCase();
      return (
        configId.includes(party) ||
        party.includes(configId) ||
        authId.includes(party) ||
        desc.includes(party)
      );
    });
  });

  const carrierConfigs = computed(() => {
    const party = carrierPartyId.value;
    if (!party) return [];
    return shippingCarrierConfigs.value.filter((cfg) => cfg.carrierPartyId === party);
  });

  const tenantStatus = computed<"ready" | "loading" | "unavailable">(() => {
    if (status.config === "pending") return "loading";
    return isConfigured.value ? "ready" : "unavailable";
  });

  const credentialStatus = computed<"ready" | "loading" | "unavailable">(() => {
    if (status.auths === "pending") return "loading";
    if (!isConfigured.value) return "unavailable";
    return matchingAuths.value.length > 0 ? "ready" : "unavailable";
  });

  const storeLinkStatus = computed<"ready" | "loading" | "unavailable">(() => {
    if (status.carrierConfigs === "pending") return "loading";
    if (!isConfigured.value) return "unavailable";
    return carrierConfigs.value.length > 0 ? "ready" : "unavailable";
  });

  const addressValidationStatus = computed<"ready" | "loading" | "unavailable">(() => {
    const party = (carrierPartyId.value || "").toUpperCase();
    if (party !== "FEDEX" && party !== "_NA_") return "unavailable";
    return isConfigured.value && credentialStatus.value === "ready" ? "ready" : "unavailable";
  });

  return {
    carrierPartyId,
    matchingAuths,
    carrierConfigs,
    tenantStatus,
    credentialStatus,
    storeLinkStatus,
    addressValidationStatus,
  };
}
