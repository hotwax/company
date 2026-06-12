import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'
import { useUtilStore } from './util'

export const useProductStore = defineStore('productStore', {
  state: () => ({
    current: {} as any,
    currentStoreSettings: {} as any,
    productStores: [] as any[],
    company: {} as any,
    netSuiteProductStore: null as any,
    fetchStatus: {
      productStores: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getCurrent: (state) => state.current ? JSON.parse(JSON.stringify(state.current)) : {},
    getCurrentStoreSettings: (state) => state.currentStoreSettings,
    getProductStores: (state) => state.productStores,
    getCompany: (state) => state.company,
    getNetSuiteProductStore: (state) => state.netSuiteProductStore,
    getFetchStatus: (state) => state.fetchStatus
  },

  actions: {
    async fetchProductStores(payload: any = { fetchCounts: false }) {
      this.fetchStatus = { ...this.fetchStatus, productStores: 'pending' }
      let productStores: any[] = []

      try {
        const resp = await api({
          url: "admin/productStores",
          method: "get",
          params: { pageSize: 100 }
        })
        if (!commonUtil.hasError(resp)) {
          productStores = resp.data
          if (payload?.fetchCounts) {
              const shipmentMethodCount = await this.fetchProductStoresShipmentMethodCount()
              productStores = productStores.map((s: any) => ({
                ...s,
                facilityCount: s.facilityCount ?? 0
              }))
              if (Object.keys(shipmentMethodCount).length) {
                productStores = productStores.map((s: any) => ({
                  ...s,
                  shipmentMethodCount: shipmentMethodCount[s.productStoreId] ?? 0
                }))
            }
          }
          this.fetchStatus = { productStores: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, productStores: 'error' }
      }
      this.productStores = productStores
    },

    async fetchProductStoreDetails(productStoreId: string) {
      let current = {} as any
      try {
        const resp = await api({
          url: `admin/productStores/${productStoreId}`,
          method: "get"
        })
        if (!commonUtil.hasError(resp)) {
          current = resp.data
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      }
      this.current = current
    },

    async fetchProductStoresShipmentMethodCount(): Promise<Record<string, number>> {
      const counts: Record<string, number> = {}
      try {
        const resp = await api({
          url: "oms/productStores/shipmentMethods/counts",
          method: "get",
          params: { pageSize: 100 }
        })
        if (!commonUtil.hasError(resp)) {
          resp.data.forEach((r: any) => { counts[r.productStoreId] = r.shipmentMethodCount })
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      }
      return counts
    },

    async fetchCurrentStoreSettings(productStoreId: string) {
      const storeSettings: any = {}
      try {
        const resp = await api({
          url: `admin/productStores/${productStoreId}/settings`,
          method: "get"
        })
        if (!commonUtil.hasError(resp)) {
          resp.data.forEach((setting: any) => {
            if (!setting.thruDate) {
              storeSettings[setting.settingTypeEnumId] = setting
            }
          })
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      }
      this.currentStoreSettings = storeSettings
    },

    async fetchCompany() {
      let company = {}
      try {
        const utilStore = useUtilStore()
        const partyId = utilStore.organizationPartyId
        const resp = await api({
          url: `admin/organizations/${partyId}`,
          method: "get",
          params: { partyId }
        })
        if (!commonUtil.hasError(resp)) {
          company = { ...resp.data, companyName: resp.data.groupName }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      }
      this.company = company
    },

    updateCurrentStoreSettings(payload: any) {
      this.currentStoreSettings = payload
    },

    async createProductStore(payload: any): Promise<any> {
      return api({
        url: "admin/productStores",
        method: "post",
        data: payload
      })
    },

    async updateProductStore(payload: any): Promise<any> {
      return api({
        url: `admin/productStores/${payload.productStoreId}`,
        method: "put",
        data: payload
      })
    },

    async addDBICCountries(payload: any): Promise<any> {
      return api({
        url: "admin/geos/assocs",
        method: "post",
        data: payload
      })
    },

    async updateCompany(payload: any): Promise<any> {
      try {
        const resp = await api({
          url: `admin/organizations/${payload.partyId}`,
          method: "post",
          data: payload
        }) as any
        if (!commonUtil.hasError(resp)) {
          return Promise.resolve(resp.data)
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        return Promise.resolve({})
      }
    },

    async saveCurrentStoreSettings(payload: any): Promise<any> {
      return api({
        url: `admin/productStores/${payload.productStoreId}/settings`,
        method: "post",
        data: payload
      })
    },

    updateCurrent(current: any) {
      this.current = current
    },

    clearProductStoreState() {
      this.$reset()
    },

    updateSelectedProductStore(netSuiteProductStore: any) {
      this.netSuiteProductStore = netSuiteProductStore
    }
  },

  persist: true
})
