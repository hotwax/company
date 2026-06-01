import { defineStore } from 'pinia'
import { commonUtil } from '@common'
import { logger } from '@common'
import { ProductStoreService } from '@/services/ProductStoreService'
import { useUtilStore } from './util'

export const useProductStoreStore = defineStore('productStore', {
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
        const resp = await ProductStoreService.fetchProductStores({ pageSize: 100 })
        if (!commonUtil.hasError(resp)) {
          productStores = resp.data
          if (payload?.fetchCounts) {
            const facilityCount = await this.fetchProductStoresFacilityCount()
            const shipmentMethodCount = await this.fetchProductStoresShipmentMethodCount()
            if (Object.keys(facilityCount).length) {
              productStores = productStores.map((s: any) => ({
                ...s,
                facilityCount: facilityCount[s.productStoreId] ?? 0
              }))
            }
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
        const resp = await ProductStoreService.fetchProductStoreDetails(productStoreId)
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

    async fetchProductStoresFacilityCount(): Promise<Record<string, number>> {
      const counts: Record<string, number> = {}
      try {
        const resp = await ProductStoreService.fetchProductStoresFacilityCount({ pageSize: 100 })
        if (!commonUtil.hasError(resp)) {
          resp.data.forEach((r: any) => { counts[r.productStoreId] = r.facilityCount })
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      }
      return counts
    },

    async fetchProductStoresShipmentMethodCount(): Promise<Record<string, number>> {
      const counts: Record<string, number> = {}
      try {
        const resp = await ProductStoreService.fetchProductStoresShipmentMethodCount({ pageSize: 100 })
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
        const resp = await ProductStoreService.fetchCurrentStoreSettings(productStoreId)
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
        const resp = await ProductStoreService.fetchCompany({ partyId: utilStore.organizationPartyId })
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
