import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

export const useShopifyStore = defineStore('shopify', {
  state: () => ({
    shops: [] as any[],
    current: null as any,
    shopifyTypeMappings: {} as any,
    shopifyShopsCarrierShipments: {} as any,
    shopifyShopsLocations: {} as any,
    fetchStatus: {
      shops: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getShops: (state) => state.shops,
    getCurrentShop: (state) => state.current,
    getShopById: (state) => (id: string) => state.shops.find((s: any) => s.shopId === id),
    getShopifyTypeMappings: (state) => (mappedTypeId: string) =>
      state.shopifyTypeMappings[mappedTypeId] ?? [],
    getShopifyShopsCarrierShipments: (state) => state.shopifyShopsCarrierShipments,
    getShopifyShopsLocations: (state) => state.shopifyShopsLocations,
    getFetchStatus: (state) => state.fetchStatus
  },

  actions: {
    async fetchShopifyShops() {
      this.fetchStatus = { ...this.fetchStatus, shops: 'pending' }
      let shops: any[] = []
      try {
        const resp = await api({ url: "oms/shopifyShops/shops", method: "get", params: { pageSize: 100 } })
        if (!commonUtil.hasError(resp) && resp.data) {
          shops = resp.data
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

    updateCurrentShop(shop: any) {
      this.current = shop
    },

    async fetchShopifyShopsCarrierShipments(payload: any = {}) {
      let shopifyShopsCarrierShipments: any = {}, pageIndex = 0, resp: any
      let shipments: any[] = []
      try {
        do {
          resp = await api({
            url: "oms/shopifyShops/carrierShipments",
            method: "get",
            params: { ...payload, pageSize: 100, pageIndex }
          })
          if (!commonUtil.hasError(resp)) {
            shipments = [...shipments, ...resp.data]
            const newShipments = resp.data.reduce((acc: any, item: any) => {
              acc[`${item.carrierPartyId}_${item.shipmentMethodTypeId}`] = {
                carrierPartyId: item.carrierPartyId,
                shopifyShippingMethod: item.shopifyShippingMethod
              }
              return acc
            }, {})
            shopifyShopsCarrierShipments = { ...shopifyShopsCarrierShipments, ...newShipments }
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (error) {
        logger.error(error)
      }
      this.shopifyShopsCarrierShipments = shopifyShopsCarrierShipments
      return shipments
    },

    async fetchShopifyShopLocations(payload: any = {}) {
      let shopifyShopLocations: any = {}, pageIndex = 0, resp: any
      try {
        do {
          resp = await api({ url: "oms/shopifyShops/locations", method: "get", params: { ...payload, pageSize: 100, pageIndex } })
          if (!commonUtil.hasError(resp)) {
            const newLocations = resp.data.reduce((acc: any, item: any) => {
              acc[item.facilityId] = item.shopifyLocationId
              return acc
            }, {})
            shopifyShopLocations = { ...shopifyShopLocations, ...newLocations }
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (error: any) {
        logger.error(error)
      }
      this.shopifyShopsLocations = shopifyShopLocations
      return shopifyShopLocations
    },

    async fetchShopifyTypeMappings(payload: string | { mappedTypeId: string, shopId?: string }) {
      const mappedTypeId = typeof payload === "string" ? payload : payload.mappedTypeId
      const params = typeof payload === "string" ? {} : { shopId: payload.shopId }
      let shopifyTypeMappings: any = { [mappedTypeId]: [] }, pageIndex = 0, resp: any
      try {
        do {
          resp = await api({ url: "oms/shopifyShops/typeMappings", method: "get", params: { ...params, mappedTypeId, pageSize: 100, pageIndex } })
          if (!commonUtil.hasError(resp) && resp.data) {
            const newMappings = resp.data.reduce((acc: any, item: any) => {
              const typeId = item.mappedTypeId
              if (!acc[typeId]) acc[typeId] = []
              acc[typeId].push(item)
              return acc
            }, {})
            Object.keys(newMappings).forEach((typeId) => {
              shopifyTypeMappings[typeId] = [
                ...(shopifyTypeMappings[typeId] || []),
                ...newMappings[typeId]
              ]
            })
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (error) {
        logger.error(error)
      }
      this.shopifyTypeMappings = { ...this.shopifyTypeMappings, ...shopifyTypeMappings }
      return shopifyTypeMappings[mappedTypeId] || []
    },

    async updateShopifyShop(payload: any) {
      return api({
        url: `oms/shopifyShops/shops/${payload.shopId}`,
        method: "put",
        data: payload
      })
    },

    async createShopifyShopTypeMapping(payload: any) {
      return api({
        url: "oms/shopifyShops/typeMappings",
        method: "post",
        data: payload
      })
    },

    async deleteShopifyShopTypeMapping(payload: any) {
      return api({
        url: "oms/shopifyShops/typeMappings",
        method: "delete",
        data: payload
      })
    },

    async createShopifyShopCarrierShipment(payload: any) {
      return api({
        url: "oms/shopifyShops/carrierShipments",
        method: "post",
        data: payload
      })
    },

    async createShopifyShopLocation(payload: any) {
      return api({
        url: "oms/shopifyShops/locations",
        method: "post",
        data: payload
      })
    },

    async fetchLocationsFromShopify(payload: any) {
      return api({
        url: `shopify/shops/${payload.shopId}/shopify-locations`,
        method: 'get'
      })
    },

    async fetchShopifyShopLocationsRaw(payload: any) {
      return api({
        url: "oms/shopifyShops/locations",
        method: "get",
        params: payload
      })
    },

    async importShopifyFacilities(payload: any) {
      return api({
        url: `shopify/shops/${payload.shopId}/shopify-locations`,
        method: 'post',
        data: {
          locations: payload.locations
        }
      })
    },

    async createShopifyConnection(payload: {
      shopId: string
      shopifyShopId: string
      myshopifyDomain: string
      shopAccessToken: string
      clientId: string
      clientSecret: string
      name?: string
      productStoreId?: string
    }) {
      // Create SystemMessageRemote with predictable ID so it links back to the shop
      const remoteResp = await api({
        url: 'oms/systemMessageRemotes',
        method: 'post',
        data: {
          systemMessageRemoteId: `${payload.shopId}_REMOTE`,
          sendUrl: payload.myshopifyDomain,
          remoteAppCode: payload.clientId,
          sharedSecret: payload.clientSecret,
          sendSharedSecret: payload.shopAccessToken,
          password: payload.shopAccessToken,
          remoteId: payload.shopifyShopId,
          remoteIdType: 'SHOPIFY_SHOP_ID',
          internalId: payload.shopId,
          internalIdType: 'HOTWAX_SHOP_ID',
          accessScopeEnumId: 'SHOP_RW_ACCESS',
          authHeaderName: 'X-Shopify-Access-Token',
          description: payload.name || payload.myshopifyDomain
        }
      })
      if (commonUtil.hasError(remoteResp)) throw remoteResp

      // Create ShopifyShop
      const shopResp = await api({
        url: 'oms/shopifyShops/shops',
        method: 'post',
        data: {
          shopId: payload.shopId,
          shopifyShopId: payload.shopifyShopId,
          myshopifyDomain: payload.myshopifyDomain,
          name: payload.name || payload.myshopifyDomain.split('.')[0],
          productStoreId: payload.productStoreId || undefined,
          isEnabled: 'Y'
        }
      })
      if (commonUtil.hasError(shopResp)) throw shopResp

      const newShop = {
        shopId: payload.shopId,
        shopifyShopId: payload.shopifyShopId,
        myshopifyDomain: payload.myshopifyDomain,
        name: payload.name || payload.myshopifyDomain.split('.')[0],
        productStoreId: payload.productStoreId || null,
        isEnabled: 'Y'
      }
      this.shops.push(newShop)
      return newShop
    },

    async updateShopifyRemote(payload: {
      myShopifydomain: string
      shopifyShopId: string
      shopAccessToken: string
      clientId: string
      clientSecret: string
      oldClientSecret?: string
      name?: string
      hotwaxShopId?: string
    }) {
      const resp = await api({ url: 'sob/shop/remote', method: 'post', data: payload })
      if (commonUtil.hasError(resp)) throw resp
      return resp.data
    },

    async fetchSystemMessageRemote(shopId: string) {
      const resp = await api({ url: 'oms/systemMessageRemotes', method: 'get' })
      if (commonUtil.hasError(resp)) throw resp
      const list: any[] = resp.data?.systemMessageRemoteList ?? []
      return list.find((r: any) => r.internalId === shopId && r.internalIdType === 'HOTWAX_SHOP_ID') ?? null
    },

    clearShopifyState() {
      this.$reset()
    }
  },

  persist: true
})
