/**
 * KLAVIYO — the whole integration in one composable module.
 *
 * Klaviyo deliberately has NO cached domain (docs/cache-sync-remaining-work.md tracks it as an
 * open question), so unlike `useShopify` nothing here reads IndexedDB: every read is a live
 * fetch whose result lands in module-level reactive state. Module-level because the landing
 * page, the details view, and the connection modal all render the same connections and email
 * settings — one shared copy is the semantic the Pinia store provided (same shape as
 * `useOrderSyncLandmarkDates` in useShopify.ts).
 *
 * Sections, in order:
 *   1. Types
 *   2. API-key helpers            — pure functions, exported for the views and the modal
 *   3. State + reads              — module-level reactive state, live fetches
 *   4. Email types                — load-once memo (moved off `store/util.fetchEmailTypes`)
 *   5. Mutations                  — plain exported async functions
 *
 * Most mutations do not call `refreshAfterMutation`: Klaviyo connection data has no cached worker
 * domain, so call sites refetch the affected live list. Unigate remote configuration is the one
 * exception because carrier readiness consumes the shared `systemMessageRemote` cache.
 *
 * Deliberately NOT carried over from the store: `current` / `setCurrent` / `getCurrent`. That
 * state was write-only — its single writer was the landing page's row click (Klaviyo.vue,
 * immediately before routing) and nothing ever read it back; the details view resolves its
 * connection from the route param instead. Dead state, dropped.
 */

import { computed, reactive, ref } from "vue";
import { api, commonUtil, logger } from "@common";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";
import { getResponseErrorMessage } from "@/utils";
import { onSessionCleared } from "./sessionScope";

// =============================================================================================
// 1. Types (previously exported from store/klaviyo.ts)
// =============================================================================================

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

type FetchStatus = "none" | "pending" | "success" | "error";

// =============================================================================================
// 2. API-key helpers
// =============================================================================================

/** These endpoints answer both as a bare array and as a keyed list — accept either. */
const unwrapList = (data: any, key?: string): any[] => {
  if (Array.isArray(data)) return data;
  if (key && Array.isArray(data?.[key])) return data[key];
  return [];
};

const KLAVIYO_KEY_PREFIX = "Klaviyo-API-Key ";

/** Klaviyo expects the `Klaviyo-API-Key ` scheme on the Authorization value; users paste the bare key. */
export const ensureKeyPrefix = (rawKey: string) => {
  const trimmed = (rawKey || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith(KLAVIYO_KEY_PREFIX) ? trimmed : `${KLAVIYO_KEY_PREFIX}${trimmed}`;
};

const stripKeyPrefix = (publicKey?: string | null) => {
  if (!publicKey) return "";
  return publicKey.startsWith(KLAVIYO_KEY_PREFIX) ? publicKey.slice(KLAVIYO_KEY_PREFIX.length) : publicKey;
};

/** Keys are write-only in the UI: show at most the last four characters back. */
export const maskApiKey = (publicKey?: string | null) => {
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

/** A readable, collision-resistant `commGatewayAuthId` derived from the connection name. */
export const generateAuthId = (description: string) => {
  const slug = slugify(description) || "BRAND";
  const id = `KLAVIYO_${slug}_${Date.now()}`;
  return id.slice(0, 60);
};

// =============================================================================================
// 3. State + reads
// =============================================================================================

const initialFetchStatus = () => ({
  unigate: "none" as FetchStatus,
  connections: "none" as FetchStatus,
  configs: "none" as FetchStatus,
  emailSettings: "none" as FetchStatus,
  lastFetched: 0,
});

const state = reactive({
  unigateConfig: null as SystemMessageRemote | null,
  /**
   * Distinct from `unigateConfig === null`: false means "never asked yet", which is what keeps
   * the landing page's skeleton to the first visit only.
   */
  hasCheckedUnigate: false,
  connections: [] as CommGatewayAuth[],
  configs: [] as CommGatewayConfig[],
  emailSettings: [] as ProductStoreEmailSetting[],
  fetchStatus: initialFetchStatus(),
});

// Module state survives an SPA logout — without this, user B reads user A's connections and keys.
onSessionCleared(clearKlaviyoState);

/**
 * The Unigate tenant every Klaviyo call is proxied through. Fetch errors resolve to null rather
 * than throwing — the landing page renders "not set up yet" for both, and `hasCheckedUnigate`
 * still flips so the skeleton does not loop.
 */
async function fetchUnigateConfig(): Promise<SystemMessageRemote | null> {
  state.fetchStatus.unigate = "pending";
  try {
    const resp: any = await api({ url: "oms/systemMessageRemotes", method: "get" });
    const remotes = unwrapList(resp?.data, "systemMessageRemoteList");
    const config = remotes.find((row: any) => row?.systemMessageRemoteId === "UNIGATE_CONFIG") || null;
    state.unigateConfig = config;
    state.hasCheckedUnigate = true;
    state.fetchStatus.unigate = "success";
    state.fetchStatus.lastFetched = Date.now();
    return config;
  } catch (error) {
    logger.error(error);
    state.unigateConfig = null;
    state.hasCheckedUnigate = true;
    state.fetchStatus.unigate = "error";
    return null;
  }
}

async function fetchConnections(): Promise<CommGatewayAuth[]> {
  state.fetchStatus.connections = "pending";
  try {
    const resp: any = await api({ url: "oms/commGatewayAuths", method: "get" });
    const list = unwrapList(resp?.data, "commAuthList");
    state.connections = list;
    state.fetchStatus.connections = "success";
    return list;
  } catch (error) {
    logger.error(error);
    state.fetchStatus.connections = "error";
    return [];
  }
}

async function fetchConfigs(): Promise<CommGatewayConfig[]> {
  state.fetchStatus.configs = "pending";
  try {
    const resp: any = await api({ url: "oms/commGatewayConfigs", method: "get" });
    const list = unwrapList(resp?.data, "commConfigList");
    state.configs = list;
    state.fetchStatus.configs = "success";
    return list;
  } catch (error) {
    logger.error(error);
    state.fetchStatus.configs = "error";
    return [];
  }
}

/** ALL product stores' email settings in one unscoped list — screens slice by store or gateway. */
async function fetchAllEmailSettings(): Promise<ProductStoreEmailSetting[]> {
  state.fetchStatus.emailSettings = "pending";
  try {
    const resp: any = await api({ url: "oms/productStoreEmailSettings", method: "get" });
    const list = Array.isArray(resp?.data) ? resp.data : [];
    state.emailSettings = list;
    state.fetchStatus.emailSettings = "success";
    return list;
  } catch (error) {
    logger.error(error);
    state.fetchStatus.emailSettings = "error";
    return [];
  }
}

/**
 * Everything a Klaviyo screen needs, in dependency order: the Unigate tenant gates the rest —
 * without it there is nothing to send through, so the page renders setup guidance and skips the
 * other four requests. Refetches on every call (no memo): views invoke this on entry and after
 * destructive writes, and both expect fresh server state.
 */
async function hydrate(): Promise<void> {
  await fetchUnigateConfig();
  if (!state.unigateConfig) return;
  await Promise.all([
    fetchConnections(),
    fetchConfigs(),
    ensureEmailTypes(),
    fetchAllEmailSettings(),
  ]);
}

// =============================================================================================
// 4. Email types — load-once memo, moved off store/util
// =============================================================================================

/**
 * PRDS_EMAIL enums — the catalog the email-event toggles label themselves with.
 *
 * Moved off `store/util.fetchEmailTypes` so the Klaviyo views stop importing stores. The
 * endpoint and params are that action's, verbatim. Load-once promise memo (the
 * `useOrderSyncLandmarkDates` pattern): the in-flight promise is memoised, not just the result,
 * so two screens mounting in the same tick share ONE request; a successful load is never
 * repeated, and a FAILED load clears the memo so the next view entry retries instead of caching
 * the error forever — the same contract `store/util` kept via its `if (emailTypes.length)
 * return` guard.
 */
const emailTypes = ref<any[]>([]);
let emailTypesRequest: Promise<any[]> | null = null;

async function loadEmailTypes(): Promise<any[]> {
  try {
    const resp: any = await api({
      url: "admin/enums",
      method: "get",
      params: { enumTypeId: "PRDS_EMAIL", pageSize: 100 },
    });
    if (commonUtil.hasError(resp)) throw resp.data;
    emailTypes.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (error) {
    // Logged and swallowed, as the store did: labels fall back to the static
    // KLAVIYO_SUPPORTED_EMAIL_TYPES list, so a failed catalog read must not take the page down.
    logger.error(error);
    emailTypesRequest = null; // retryable
  }
  return emailTypes.value;
}

/** Idempotent: the first caller fetches, everyone after reuses the resolved state. */
function ensureEmailTypes(): Promise<any[]> {
  emailTypesRequest ||= loadEmailTypes();
  return emailTypesRequest;
}

// =============================================================================================
// 5. Mutations — live Klaviyo writes; Unigate updates also refresh its shared cached remote
// =============================================================================================

/** Update the Unigate tenant remote (tenant id, URL, description, optionally the API key). */
export async function updateSystemMessageRemote(
  systemMessageRemoteId: string,
  payload: Partial<SystemMessageRemote>,
): Promise<SystemMessageRemote> {
  const resp: any = await api({
    url: `oms/systemMessageRemotes/${encodeURIComponent(systemMessageRemoteId)}`,
    method: "put",
    data: payload,
  });
  if (commonUtil.hasError(resp)) {
    throw new Error(getResponseErrorMessage(resp, "Failed to update the Unigate remote."));
  }
  await refreshAfterMutation("systemMessageRemote", { systemMessageRemoteId });
  return resp.data;
}

export async function createCommGatewayAuth(payload: Partial<CommGatewayAuth>): Promise<CommGatewayAuth> {
  const resp: any = await api({ url: "oms/commGatewayAuths", method: "post", data: payload });
  return resp.data;
}

export async function updateCommGatewayAuth(
  commGatewayAuthId: string,
  payload: Partial<CommGatewayAuth>,
): Promise<CommGatewayAuth> {
  const resp: any = await api({
    url: `oms/commGatewayAuths/${encodeURIComponent(commGatewayAuthId)}`,
    method: "put",
    data: payload,
  });
  return resp.data;
}

export async function deleteCommGatewayAuth(commGatewayAuthId: string): Promise<void> {
  await api({
    url: `oms/commGatewayAuths/${encodeURIComponent(commGatewayAuthId)}`,
    method: "delete",
  });
}

/** Enable (or re-subject) one email event for one product store. The PK is (store, emailType). */
export async function upsertEmailSetting(payload: ProductStoreEmailSetting): Promise<ProductStoreEmailSetting> {
  const resp: any = await api({
    url: `oms/productStoreEmailSettings/${encodeURIComponent(payload.productStoreId)}/emailSettings`,
    method: "post",
    data: payload,
  });
  return resp.data || payload;
}

export async function deleteEmailSetting(productStoreId: string, emailType: string): Promise<void> {
  await api({
    url: `oms/productStoreEmailSettings/${encodeURIComponent(productStoreId)}/emailSettings/${encodeURIComponent(emailType)}`,
    method: "delete",
  });
}

// =============================================================================================
// Accessor + logout reset
// =============================================================================================

export function useKlaviyo() {
  const unigateConfig = computed(() => state.unigateConfig);
  const hasUnigateConfig = computed(() => !!state.unigateConfig);
  const hasCheckedUnigate = computed(() => state.hasCheckedUnigate);

  const connections = computed(() => state.connections);
  /** Only KLAVIYO gateway auths — `commGatewayAuths` returns every gateway the OMS knows. */
  const klaviyoConnections = computed(() =>
    state.connections.filter((connection) => connection?.commGatewayConfigId === "KLAVIYO"));

  const configs = computed(() => state.configs);
  const isKlaviyoConfigAvailable = computed(() =>
    state.configs.some((config) => config?.commGatewayConfigId === "KLAVIYO"));

  const emailSettings = computed(() => state.emailSettings);

  /** gatewayAuthId → how many email events it sends; the landing page's per-connection count. */
  const eventCountByGateway = computed<Record<string, number>>(() =>
    state.emailSettings.reduce((acc: Record<string, number>, setting) => {
      const id = setting?.gatewayAuthId;
      if (!id) return acc;
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {}));

  const fetchStatus = computed(() => state.fetchStatus);

  const connectionById = (commGatewayAuthId: string): CommGatewayAuth | null =>
    state.connections.find((connection) => connection?.commGatewayAuthId === commGatewayAuthId) ?? null;

  const emailSettingsForGateway = (commGatewayAuthId: string): ProductStoreEmailSetting[] =>
    state.emailSettings.filter((setting) => setting?.gatewayAuthId === commGatewayAuthId);

  const emailSettingsForStore = (productStoreId: string): ProductStoreEmailSetting[] =>
    state.emailSettings.filter((setting) => setting?.productStoreId === productStoreId);

  return {
    unigateConfig, hasUnigateConfig, hasCheckedUnigate,
    connections, klaviyoConnections,
    configs, isKlaviyoConfigAvailable,
    emailSettings, eventCountByGateway, fetchStatus,
    connectionById, emailSettingsForGateway, emailSettingsForStore,
    emailTypes, ensureEmailTypes,
    fetchUnigateConfig, fetchConnections, fetchConfigs, fetchAllEmailSettings, hydrate,
  };
}

/**
 * Wipe every module-level copy so no data leaks across sessions — the composable equivalent of
 * the store's `clear()` (`$reset`), including the email-types memo so the next login refetches.
 * Registered with `onSessionCleared` above; logout runs it via `clearSessionScopedState()`.
 */
export function clearKlaviyoState(): void {
  state.unigateConfig = null;
  state.hasCheckedUnigate = false;
  state.connections = [];
  state.configs = [];
  state.emailSettings = [];
  state.fetchStatus = initialFetchStatus();
  emailTypes.value = [];
  emailTypesRequest = null;
}
