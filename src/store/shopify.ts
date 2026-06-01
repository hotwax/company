import { defineStore } from 'pinia'
import { commonUtil } from '@common'
import { logger } from '@common'
import { ShopifyService } from '@/services/ShopifyService'

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
        const resp = await ShopifyService.fetchShopifyShops({ pageSize: 100 })
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
      try {
        do {
          resp = await ShopifyService.fetchShopifyShopsCarrierShipments({
            ...payload,
            pageSize: 100,
            pageIndex
          })
          if (!commonUtil.hasError(resp)) {
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
    },

    async fetchShopifyShopLocations() {
      let shopifyShopLocations: any = {}, pageIndex = 0, resp: any
      try {
        do {
          resp = await ShopifyService.fetchShopifyShopLocations({ pageSize: 100, pageIndex })
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
    },

    async fetchShopifyTypeMappings(mappedTypeId: string) {
      let shopifyTypeMappings: any = {}, pageIndex = 0, resp: any
      try {
        do {
          resp = await ShopifyService.fetchShopifyTypeMappings({ mappedTypeId, pageSize: 100, pageIndex })
          if (!commonUtil.hasError(resp) && resp.data) {
            const newMappings = resp.data.reduce((acc: any, item: any) => {
              const typeId = item.mappedTypeId
              if (!acc[typeId]) acc[typeId] = []
              acc[typeId].push(item)
              return acc
            }, {})
            shopifyTypeMappings = { ...shopifyTypeMappings, ...newMappings }
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (error) {
        logger.error(error)
      }
      this.shopifyTypeMappings = { ...this.shopifyTypeMappings, ...shopifyTypeMappings }
    },

    clearShopifyState() {
      this.$reset()
    }
  },

  persist: true
})
