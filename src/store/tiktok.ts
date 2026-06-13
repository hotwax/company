import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

export const useTikTokStore = defineStore('tiktok', {
  state: () => ({
    appCredentials: { appKey: '', sendUrl: '', receiveUrl: '', configured: false } as any,
    shops: [] as any[],
    current: null as any,
    shopMappings: {} as any, // keyed `${shopId}_${mappedTypeId}` -> mapping rows
    fetchStatus: {
      shops: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getShops: (state) => state.shops,
    getCurrentShop: (state) => state.current,
    getShopById: (state) => (id: string) => state.shops.find((s: any) => String(s.shopId) === String(id)),
    isAppConfigured: (state) => !!state.appCredentials.configured,
    getShopMappings: (state) => (shopId: string, mappedTypeId: string) =>
      state.shopMappings[`${shopId}_${mappedTypeId}`] ?? [],
    getFetchStatus: (state) => state.fetchStatus,
    // ok | expiring (<7d) | expired | unknown — from accessTokenExpireDate
    getTokenHealth: () => (shop: any): string => {
      const value = shop?.accessTokenExpireDate
      if (!value) return 'unknown'
      const expiry = typeof value === 'number' ? value : new Date(value).getTime()
      if (isNaN(expiry)) return 'unknown'
      const now = Date.now()
      if (expiry < now) return 'expired'
      if (expiry < now + 7 * 24 * 60 * 60 * 1000) return 'expiring'
      return 'ok'
    }
  },

  actions: {
    async fetchAppCredentials() {
      try {
        const resp = await api({ url: "tiktok/appCredentials", method: "get" })
        if (!commonUtil.hasError(resp) && resp.data) {
          this.appCredentials = resp.data
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
      }
    },

    async updateAppCredentials(payload: { appKey: string, appSecret: string }) {
      const resp = await api({ url: "tiktok/appCredentials", method: "put", data: payload })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchAppCredentials()
      return resp.data
    },

    async authorizeTikTok(authCode: string) {
      const resp = await api({ url: "tiktok/authorize", method: "post", data: { authCode } })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShops()
      return resp.data // { shopIds: [...] }
    },

    async fetchTikTokShops() {
      this.fetchStatus = { ...this.fetchStatus, shops: 'pending' }
      let shops: any[] = []
      try {
        const resp = await api({ url: "tiktok/shops", method: "get" })
        if (!commonUtil.hasError(resp) && resp.data) {
          shops = resp.data.shops ?? []
          this.fetchStatus = { shops: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, shops: 'error' }
      }
      this.shops = shops
    },

    async fetchTikTokShop(shopId: string) {
      const resp = await api({ url: `tiktok/shops/${shopId}`, method: "get" })
      if (commonUtil.hasError(resp)) throw resp.data
      this.current = resp.data.shop ?? resp.data
      return this.current
    },

    async updateTikTokShop(payload: any) {
      const resp = await api({ url: `tiktok/shops/${payload.shopId}`, method: "put", data: payload })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShop(payload.shopId)
      await this.fetchTikTokShops()
      return resp.data
    },

    async fetchTikTokShopMappings(shopId: string, mappedTypeId: string) {
      try {
        const resp = await api({ url: `tiktok/shops/${shopId}/mappings`, method: "get", params: { mappedTypeId } })
        if (!commonUtil.hasError(resp) && resp.data) {
          this.shopMappings = { ...this.shopMappings, [`${shopId}_${mappedTypeId}`]: resp.data.mappings ?? [] }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
      }
    },

    async createTikTokShopMapping(payload: { shopId: string, mappedTypeId: string, mappedKey: string, mappedValue: string }) {
      const resp = await api({ url: `tiktok/shops/${payload.shopId}/mappings`, method: "post", data: payload })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShopMappings(payload.shopId, payload.mappedTypeId)
      return resp.data
    },

    async deleteTikTokShopMapping(payload: { shopId: string, mappedTypeId: string, mappedKey: string }) {
      // params (not body): Moqui REST DELETE reads query parameters reliably
      const resp = await api({ url: `tiktok/shops/${payload.shopId}/mappings`, method: "delete", params: { mappedTypeId: payload.mappedTypeId, mappedKey: payload.mappedKey } })
      if (commonUtil.hasError(resp)) throw resp.data
      await this.fetchTikTokShopMappings(payload.shopId, payload.mappedTypeId)
      return resp.data
    },

    updateCurrentShop(shop: any) {
      this.current = shop
    },

    clearTikTokState() {
      this.$reset()
    }
  },

  persist: true
})
