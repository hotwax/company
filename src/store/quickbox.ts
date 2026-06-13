import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

// The connector ships these two fixed SystemMessageRemote ids (see
// quickbox-connector/data/QuickBoxConfigData.xml). They are the only records this UI touches.
const QUICKBOX_API_REMOTE = 'QuickBoxApi'
const QUICKBOX_WEBHOOK_REMOTE = 'QuickBoxWebhookIn'

type FetchStatus = '' | 'pending' | 'success' | 'error'

// The generic GET returns either a bare array or { systemMessageRemoteList: [...] }
// depending on the OMS build; handle both, matching src/store/klaviyo.ts.
const unwrapList = (data: any, key: string): any[] => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[key])) return data[key]
  return []
}

export const useQuickBoxStore = defineStore('quickbox', {
  state: () => ({
    // Only ever holds non-secret fields: GET omits `password` by design.
    apiConfig: { sendUrl: '', username: '' } as { sendUrl: string; username: string },
    fetchStatus: {
      connection: '' as FetchStatus,
      lastFetched: 0 as number
    }
  }),

  getters: {
    isApiConfigured: (state) => !!state.apiConfig.sendUrl,
    // username present ⇒ HTTP Basic; otherwise Bearer-token mode.
    getAuthMode: (state): 'bearer' | 'basic' => (state.apiConfig.username ? 'basic' : 'bearer'),
    getFetchStatus: (state) => state.fetchStatus,
    // The three inbound endpoints QuickBox posts to, composed from the OMS base URL.
    // getMaargURL() already includes the `/rest/s1` segment (commonUtil.ts), so we
    // normalise the trailing slash and append `quickbox/...`.
    getWebhookUrls: () => {
      const base = (commonUtil.getMaargURL() || '').replace(/\/+$/, '')
      if (!base) return { fulfillmentStatus: '', shipmentConfirm: '', inventoryAdjustment: '' }
      return {
        fulfillmentStatus: `${base}/quickbox/fulfillmentStatus`,
        shipmentConfirm: `${base}/quickbox/shipmentConfirm`,
        inventoryAdjustment: `${base}/quickbox/inventoryAdjustment`
      }
    }
  },

  actions: {
    // Fetch all remotes and pick out QuickBoxApi (matches klaviyo.ts; avoids relying on
    // list-param query serialization). Only QuickBoxApi has readable fields we use;
    // QuickBoxWebhookIn exposes nothing readable (just an omitted password).
    async fetchConnectionConfig() {
      this.fetchStatus = { ...this.fetchStatus, connection: 'pending' }
      try {
        const resp: any = await api({ url: 'oms/systemMessageRemotes', method: 'get' })
        const remotes = unwrapList(resp?.data, 'systemMessageRemoteList')
        const apiRemote = remotes.find((r: any) => r?.systemMessageRemoteId === QUICKBOX_API_REMOTE)
        this.apiConfig = {
          sendUrl: apiRemote?.sendUrl || '',
          username: apiRemote?.username || ''
        }
        this.fetchStatus = { ...this.fetchStatus, connection: 'success', lastFetched: Date.now() }
        return this.apiConfig
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, connection: 'error' }
        return null
      }
    },

    async updateApiCredentials(payload: { sendUrl: string; authMode: 'bearer' | 'basic'; username?: string; password?: string }) {
      const data: Record<string, any> = {
        systemMessageRemoteId: QUICKBOX_API_REMOTE,
        sendUrl: payload.sendUrl,
        // Bearer mode clears any stale basic-auth username; Basic mode sets it.
        username: payload.authMode === 'basic' ? (payload.username || '') : ''
      }
      // Only write the secret when the admin actually typed one — blank keeps the stored value.
      if (payload.password) data.password = payload.password
      const resp: any = await api({
        url: `oms/systemMessageRemotes/${encodeURIComponent(QUICKBOX_API_REMOTE)}`,
        method: 'put',
        data
      })
      return resp.data
    },

    async updateWebhookToken(payload: { password?: string }) {
      const data: Record<string, any> = { systemMessageRemoteId: QUICKBOX_WEBHOOK_REMOTE }
      if (payload.password) data.password = payload.password
      const resp: any = await api({
        url: `oms/systemMessageRemotes/${encodeURIComponent(QUICKBOX_WEBHOOK_REMOTE)}`,
        method: 'put',
        data
      })
      return resp.data
    },

    clearQuickBoxState() {
      this.$reset()
    }
  },

  persist: true
})
