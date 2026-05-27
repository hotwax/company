import api from "@/api";

// All Klaviyo backend endpoints are documented in
// `documentation/klaviyo-api-contracts.md`. The functions in this file are the
// single layer that translates Vue components → REST.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommGatewayAuth = {
  commGatewayAuthId: string;
  commGatewayConfigId: string;
  tenantPartyId?: string;
  description: string;
  baseUrl: string;
  authHeaderName: string;
  publicKey: string;
  username?: string | null;
  password?: string | null;
  modeEnumId?: string | null;
  authTypeEnumId?: string | null;
};

export type CommGatewayConfig = {
  commGatewayConfigId: string;
  description: string;
  sendEmailServiceName?: string;
  createEventServiceName?: string;
};

export type ProductStoreEmailSetting = {
  productStoreId: string;
  emailType: string;
  subject: string;
  fromAddress?: string | null;
  systemMessageRemoteId: string;
  gatewayAuthId: string;
};

export type SystemMessageRemote = {
  systemMessageRemoteId: string;
  internalId?: string;
  description?: string;
  sendUrl?: string;
  publicKey?: string;
  authHeaderName?: string;
};

// ---------------------------------------------------------------------------
// Response shape helpers
// ---------------------------------------------------------------------------

// The OMS service returns either a bare array OR `{ <listKey>: [...] }`
// depending on which underlying service handles the request. Normalize here.
const unwrapList = (data: any, key?: string): any[] => {
  if (Array.isArray(data)) return data;
  if (key && Array.isArray(data?.[key])) return data[key];
  return [];
};

// ---------------------------------------------------------------------------
// Tenant readiness — UNIGATE_CONFIG check
// ---------------------------------------------------------------------------

const fetchSystemMessageRemotes = async (): Promise<SystemMessageRemote[]> => {
  const resp: any = await api({ url: "oms/systemMessageRemotes", method: "get" });
  return unwrapList(resp?.data, "systemMessageRemoteList");
};

const fetchUnigateConfig = async (): Promise<SystemMessageRemote | null> => {
  const remotes = await fetchSystemMessageRemotes();
  return remotes.find((r: any) => r?.systemMessageRemoteId === "UNIGATE_CONFIG") || null;
};

const updateSystemMessageRemote = async (
  systemMessageRemoteId: string,
  payload: Partial<SystemMessageRemote>
): Promise<SystemMessageRemote> => {
  const resp: any = await api({
    url: `oms/systemMessageRemotes/${encodeURIComponent(systemMessageRemoteId)}`,
    method: "put",
    data: payload,
  });
  return resp.data;
};

// ---------------------------------------------------------------------------
// CommGatewayAuth (Klaviyo connections)
// ---------------------------------------------------------------------------

const fetchCommGatewayAuths = async (): Promise<CommGatewayAuth[]> => {
  const resp: any = await api({ url: "oms/commGatewayAuths", method: "get" });
  return unwrapList(resp?.data, "commAuthList");
};

const fetchCommGatewayConfigs = async (): Promise<CommGatewayConfig[]> => {
  const resp: any = await api({ url: "oms/commGatewayConfigs", method: "get" });
  return unwrapList(resp?.data, "commConfigList");
};

const createCommGatewayAuth = async (payload: Partial<CommGatewayAuth>): Promise<CommGatewayAuth> => {
  const resp: any = await api({ url: "oms/commGatewayAuths", method: "post", data: payload });
  return resp.data;
};

const updateCommGatewayAuth = async (commGatewayAuthId: string, payload: Partial<CommGatewayAuth>): Promise<CommGatewayAuth> => {
  const resp: any = await api({
    url: `oms/commGatewayAuths/${encodeURIComponent(commGatewayAuthId)}`,
    method: "put",
    data: payload,
  });
  return resp.data;
};

const deleteCommGatewayAuth = async (commGatewayAuthId: string): Promise<void> => {
  await api({
    url: `oms/commGatewayAuths/${encodeURIComponent(commGatewayAuthId)}`,
    method: "delete",
  });
};

// ---------------------------------------------------------------------------
// ProductStoreEmailSetting
// ---------------------------------------------------------------------------

const fetchEmailSettingsForStore = async (productStoreId: string): Promise<ProductStoreEmailSetting[]> => {
  const resp: any = await api({
    url: `oms/productStoreEmailSettings/${encodeURIComponent(productStoreId)}/emailSettings`,
    method: "get",
  });
  return Array.isArray(resp?.data) ? resp.data : [];
};

const fetchAllEmailSettings = async (): Promise<ProductStoreEmailSetting[]> => {
  const resp: any = await api({ url: "oms/productStoreEmailSettings", method: "get" });
  return Array.isArray(resp?.data) ? resp.data : [];
};

const upsertEmailSetting = async (payload: ProductStoreEmailSetting): Promise<ProductStoreEmailSetting> => {
  const resp: any = await api({
    url: `oms/productStoreEmailSettings/${encodeURIComponent(payload.productStoreId)}/emailSettings`,
    method: "post",
    data: payload,
  });
  return resp.data || payload;
};

const deleteEmailSetting = async (productStoreId: string, emailType: string): Promise<void> => {
  await api({
    url: `oms/productStoreEmailSettings/${encodeURIComponent(productStoreId)}/emailSettings/${encodeURIComponent(emailType)}`,
    method: "delete",
  });
};

// Email-type enumerations are not fetched here. They live in the existing
// `util` Vuex module (action: `util/fetchEmailTypes`, getter: `util/getEmailTypes`)
// which calls the existing `admin/enums?enumTypeId=PRDS_EMAIL` endpoint and
// caches per-session like every other enum the app uses.

// ---------------------------------------------------------------------------
// Helpers — formatting + ID generation
// ---------------------------------------------------------------------------

const KLAVIYO_KEY_PREFIX = "Klaviyo-API-Key ";

const stripKeyPrefix = (publicKey?: string | null) => {
  if (!publicKey) return "";
  return publicKey.startsWith(KLAVIYO_KEY_PREFIX) ? publicKey.slice(KLAVIYO_KEY_PREFIX.length) : publicKey;
};

const ensureKeyPrefix = (rawKey: string) => {
  const trimmed = (rawKey || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith(KLAVIYO_KEY_PREFIX) ? trimmed : `${KLAVIYO_KEY_PREFIX}${trimmed}`;
};

// `••••••••wxyz` style mask. The underlying value never leaves the service.
const maskApiKey = (publicKey?: string | null) => {
  const stripped = stripKeyPrefix(publicKey);
  if (!stripped) return "";
  if (stripped.length <= 4) return "•".repeat(stripped.length);
  const tail = stripped.slice(-4);
  return `${"•".repeat(8)}${tail}`;
};

const slugify = (input: string) => {
  return (input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
};

const generateAuthId = (description: string) => {
  const slug = slugify(description) || "BRAND";
  const id = `KLAVIYO_${slug}_${Date.now()}`;
  return id.slice(0, 60);
};

export const KlaviyoService = {
  // Tenant
  fetchSystemMessageRemotes,
  fetchUnigateConfig,
  updateSystemMessageRemote,
  // CommGatewayAuth
  fetchCommGatewayAuths,
  fetchCommGatewayConfigs,
  createCommGatewayAuth,
  updateCommGatewayAuth,
  deleteCommGatewayAuth,
  // Email settings
  fetchEmailSettingsForStore,
  fetchAllEmailSettings,
  upsertEmailSetting,
  deleteEmailSetting,
  // Helpers
  stripKeyPrefix,
  ensureKeyPrefix,
  maskApiKey,
  generateAuthId,
  slugify,
  KLAVIYO_KEY_PREFIX,
};
