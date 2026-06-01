import { defineStore } from 'pinia'
import { api, logger } from '@common'
import { useUtilStore } from './util'

// ---------------------------------------------------------------------------
// Types (previously in KlaviyoService.ts)
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
// Private module-level helpers
// ---------------------------------------------------------------------------

const unwrapList = (data: any, key?: string): any[] => {
  if (Array.isArray(data)) return data;
  if (key && Array.isArray(data?.[key])) return data[key];
  return [];
};

const KLAVIYO_KEY_PREFIX = "Klaviyo-API-Key ";

const ensureKeyPrefix = (rawKey: string) => {
  const trimmed = (rawKey || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith(KLAVIYO_KEY_PREFIX) ? trimmed : `${KLAVIYO_KEY_PREFIX}${trimmed}`;
};

const stripKeyPrefix = (publicKey?: string | null) => {
  if (!publicKey) return "";
  return publicKey.startsWith(KLAVIYO_KEY_PREFIX) ? publicKey.slice(KLAVIYO_KEY_PREFIX.length) : publicKey;
};

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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type FetchStatus = 'none' | 'pending' | 'success' | 'error'

export const useKlaviyoStore = defineStore('klaviyo', {
  state: () => ({
    unigateConfig: null as SystemMessageRemote | null,
    hasCheckedUnigate: false,
    connections: [] as CommGatewayAuth[],
    current: null as CommGatewayAuth | null,
    configs: [] as CommGatewayConfig[],
    emailSettings: [] as ProductStoreEmailSetting[],
    fetchStatus: {
      unigate: 'none' as FetchStatus,
      connections: 'none' as FetchStatus,
      configs: 'none' as FetchStatus,
      emailSettings: 'none' as FetchStatus,
      lastFetched: 0
    }
  }),

  getters: {
    getUnigateConfig: (state) => state.unigateConfig,
    hasUnigateConfig: (state) => !!state.unigateConfig,
    hasCheckedUnigateStatus: (state) => state.hasCheckedUnigate,
    getConnections: (state) => state.connections,
    getKlaviyoConnections: (state) =>
      state.connections.filter((c: any) => c?.commGatewayConfigId === 'KLAVIYO'),
    getConnectionById: (state) => (commGatewayAuthId: string) =>
      state.connections.find((c: any) => c?.commGatewayAuthId === commGatewayAuthId) || null,
    getCurrent: (state) => state.current,
    getEmailSettings: (state) => state.emailSettings,
    getEmailSettingsForGateway: (state) => (commGatewayAuthId: string) =>
      state.emailSettings.filter((s: any) => s?.gatewayAuthId === commGatewayAuthId),
    getEmailSettingsForStore: (state) => (productStoreId: string) =>
      state.emailSettings.filter((s: any) => s?.productStoreId === productStoreId),
    getEventCountByGateway: (state) =>
      state.emailSettings.reduce((acc: Record<string, number>, setting: any) => {
        const id = setting?.gatewayAuthId
        if (!id) return acc
        acc[id] = (acc[id] || 0) + 1
        return acc
      }, {}),
    getFetchStatus: (state) => state.fetchStatus,
    isKlaviyoConfigAvailable: (state) =>
      state.configs.some((c: any) => c?.commGatewayConfigId === 'KLAVIYO'),
    // Helper getters exposed for components
    maskApiKey: () => maskApiKey,
    generateAuthId: () => generateAuthId,
    ensureKeyPrefix: () => ensureKeyPrefix,
  },

  actions: {
    async fetchUnigateConfig() {
      this.fetchStatus = { ...this.fetchStatus, unigate: 'pending' }
      try {
        const resp: any = await api({ url: "oms/systemMessageRemotes", method: "get" })
        const remotes = unwrapList(resp?.data, "systemMessageRemoteList")
        const config = remotes.find((r: any) => r?.systemMessageRemoteId === "UNIGATE_CONFIG") || null
        this.unigateConfig = config
        this.hasCheckedUnigate = true
        this.fetchStatus = { ...this.fetchStatus, unigate: 'success', lastFetched: Date.now() }
        return config
      } catch (error) {
        logger.error(error)
        this.unigateConfig = null
        this.hasCheckedUnigate = true
        this.fetchStatus = { ...this.fetchStatus, unigate: 'error' }
        return null
      }
    },

    async updateSystemMessageRemote(systemMessageRemoteId: string, payload: Partial<SystemMessageRemote>): Promise<SystemMessageRemote> {
      const resp: any = await api({
        url: `oms/systemMessageRemotes/${encodeURIComponent(systemMessageRemoteId)}`,
        method: "put",
        data: payload,
      })
      return resp.data
    },

    async fetchConnections() {
      this.fetchStatus = { ...this.fetchStatus, connections: 'pending' }
      try {
        const resp: any = await api({ url: "oms/commGatewayAuths", method: "get" })
        const list = unwrapList(resp?.data, "commAuthList")
        this.connections = list
        this.fetchStatus = { ...this.fetchStatus, connections: 'success' }
        return list
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, connections: 'error' }
        return []
      }
    },

    async fetchConfigs() {
      this.fetchStatus = { ...this.fetchStatus, configs: 'pending' }
      try {
        const resp: any = await api({ url: "oms/commGatewayConfigs", method: "get" })
        const list = unwrapList(resp?.data, "commConfigList")
        this.configs = list
        this.fetchStatus = { ...this.fetchStatus, configs: 'success' }
        return list
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, configs: 'error' }
        return []
      }
    },

    async fetchAllEmailSettings() {
      this.fetchStatus = { ...this.fetchStatus, emailSettings: 'pending' }
      try {
        const resp: any = await api({ url: "oms/productStoreEmailSettings", method: "get" })
        const list = Array.isArray(resp?.data) ? resp.data : []
        this.emailSettings = list
        this.fetchStatus = { ...this.fetchStatus, emailSettings: 'success' }
        return list
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, emailSettings: 'error' }
        return []
      }
    },

    async createCommGatewayAuth(payload: Partial<CommGatewayAuth>): Promise<CommGatewayAuth> {
      const resp: any = await api({ url: "oms/commGatewayAuths", method: "post", data: payload })
      return resp.data
    },

    async updateCommGatewayAuth(commGatewayAuthId: string, payload: Partial<CommGatewayAuth>): Promise<CommGatewayAuth> {
      const resp: any = await api({
        url: `oms/commGatewayAuths/${encodeURIComponent(commGatewayAuthId)}`,
        method: "put",
        data: payload,
      })
      return resp.data
    },

    async deleteCommGatewayAuth(commGatewayAuthId: string): Promise<void> {
      await api({
        url: `oms/commGatewayAuths/${encodeURIComponent(commGatewayAuthId)}`,
        method: "delete",
      })
    },

    async upsertEmailSetting(payload: ProductStoreEmailSetting): Promise<ProductStoreEmailSetting> {
      const resp: any = await api({
        url: `oms/productStoreEmailSettings/${encodeURIComponent(payload.productStoreId)}/emailSettings`,
        method: "post",
        data: payload,
      })
      return resp.data || payload
    },

    async deleteEmailSetting(productStoreId: string, emailType: string): Promise<void> {
      await api({
        url: `oms/productStoreEmailSettings/${encodeURIComponent(productStoreId)}/emailSettings/${encodeURIComponent(emailType)}`,
        method: "delete",
      })
    },

    setCurrent(connection: CommGatewayAuth | null) {
      this.current = connection
    },

    async hydrate() {
      await this.fetchUnigateConfig()
      if (!this.unigateConfig) return
      const utilStore = useUtilStore()
      await Promise.all([
        this.fetchConnections(),
        this.fetchConfigs(),
        utilStore.fetchEmailTypes(),
        this.fetchAllEmailSettings()
      ])
    },

    clear() {
      this.$reset()
    }
  }
})

// Re-export helpers so components can import from the store module
export { maskApiKey, ensureKeyPrefix, generateAuthId }
