import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'
import { useUtilStore } from './util'

export const useProductStore = defineStore('productStore', {
  state: () => ({
    current: {} as any,
    currentStoreSettings: {} as any,
    currentFacilities: [] as any[],
    currentShopifyJobStatus: null as any,
    currentAccessPackageStatus: null as any,
    currentJwtTokenSubjects: null as any,
    productStores: [] as any[],
    company: {} as any,
    netSuiteProductStore: null as any,
    fetchStatus: {
      productStores: 'none',
      shopifyJobStatus: 'none',
      accessPackageStatus: 'none',
      jwtTokenSubjects: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getCurrent: (state) => state.current ? JSON.parse(JSON.stringify(state.current)) : {},
    getCurrentStoreSettings: (state) => state.currentStoreSettings,
    getCurrentFacilities: (state) => state.currentFacilities,
    getCurrentShopifyJobStatus: (state) => state.currentShopifyJobStatus,
    getCurrentAccessPackageStatus: (state) => state.currentAccessPackageStatus,
    getCurrentJwtTokenSubjects: (state) => state.currentJwtTokenSubjects,
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
          this.fetchStatus = { ...this.fetchStatus, productStores: 'success', lastFetched: Date.now() }
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

    async fetchProductStoreFacilities(productStoreId: string) {
      let facilities: any[] = []
      try {
        const resp = await api({
          url: `admin/productStores/${productStoreId}/facilities`,
          method: "get",
          params: { pageSize: 200 }
        })
        if (!commonUtil.hasError(resp)) {
          facilities = resp.data || []
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
      }
      this.currentFacilities = facilities
      return facilities
    },

    async associateProductStoreFacility(payload: {
      productStoreId: string
      facilityId: string
      fromDate?: number
    }) {
      return api({
        url: `admin/productStores/${payload.productStoreId}/facilities/${payload.facilityId}/association`,
        method: "post",
        data: {
          productStoreId: payload.productStoreId,
          facilityId: payload.facilityId,
          fromDate: payload.fromDate || Date.now()
        }
      })
    },

    async createProductStoreShipmentMethod(payload: {
      productStoreId: string
      productStoreShipMethId: string
      shipmentMethodTypeId: string
      partyId: string
      roleTypeId?: string
      sequenceNumber?: number
    }) {
      return api({
        url: `oms/productStores/${payload.productStoreId}/shipmentMethods`,
        method: "post",
        data: {
          ...payload,
          roleTypeId: payload.roleTypeId || "CARRIER"
        }
      })
    },

    async fetchProductStoreShopifyJobStatus(productStoreId: string) {
      this.fetchStatus = { ...this.fetchStatus, shopifyJobStatus: 'pending' }
      let shopifyJobStatus = null as any

      try {
        const resp = await api({
          url: `admin/productStores/${productStoreId}/shopifyJobs/status`,
          method: "get"
        })
        if (!commonUtil.hasError(resp)) {
          shopifyJobStatus = resp.data?.shopifyJobsStatus || resp.data
          this.fetchStatus = { ...this.fetchStatus, shopifyJobStatus: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.warn('Failed to fetch product store Shopify job status', error)
        this.fetchStatus = { ...this.fetchStatus, shopifyJobStatus: 'error' }
      }

      this.currentShopifyJobStatus = shopifyJobStatus
      return shopifyJobStatus
    },

    async fetchProductStoreAccessPackageStatus(payload: {
      productStoreId: string
      userLoginId?: string
      partyId?: string
    }) {
      this.fetchStatus = { ...this.fetchStatus, accessPackageStatus: 'pending' }
      let accessPackageStatus = null as any

      try {
        const resp = await api({
          url: `admin/productStores/${payload.productStoreId}/accessPackages/status`,
          method: "get",
          params: {
            userLoginId: payload.userLoginId,
            partyId: payload.partyId
          }
        })
        if (!commonUtil.hasError(resp)) {
          accessPackageStatus = resp.data?.accessPackageStatus || resp.data
          this.fetchStatus = { ...this.fetchStatus, accessPackageStatus: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.warn('Failed to fetch product store access package status', error)
        this.fetchStatus = { ...this.fetchStatus, accessPackageStatus: 'error' }
      }

      this.currentAccessPackageStatus = accessPackageStatus
      return accessPackageStatus
    },

    async fetchJwtTokenSubjects(payload: { category?: string } = { category: "INTEGRATION" }) {
      this.fetchStatus = { ...this.fetchStatus, jwtTokenSubjects: 'pending' }
      let jwtTokenSubjects = null as any

      try {
        const resp = await api({
          url: "admin/jwtTokens/subjects",
          method: "get",
          params: { category: payload.category || "INTEGRATION" }
        })
        if (!commonUtil.hasError(resp)) {
          jwtTokenSubjects = resp.data
          this.fetchStatus = { ...this.fetchStatus, jwtTokenSubjects: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.warn('Failed to fetch JWT token subjects', error)
        this.fetchStatus = { ...this.fetchStatus, jwtTokenSubjects: 'error' }
      }

      this.currentJwtTokenSubjects = jwtTokenSubjects
      return jwtTokenSubjects
    },

    async setupProductStoreAccessPackage(payload: {
      productStoreId: string
      userLoginId: string
      partyId?: string
      packageId?: string
      packageIds?: string[]
      facilityIds?: string[]
    }) {
      const resp = await api({
        url: `admin/productStores/${payload.productStoreId}/accessPackages/assignment`,
        method: "post",
        data: payload
      })
      if (!commonUtil.hasError(resp)) {
        this.currentAccessPackageStatus = resp.data?.accessPackageStatus || this.currentAccessPackageStatus
      }
      return resp
    },

    async createProductStoreAccessPackageUser(payload: {
      productStoreId: string
      userLoginId: string
      partyId?: string
      firstName?: string
      lastName?: string
      emailAddress?: string
      temporaryPassword: string
      temporaryPasswordVerify?: string
      organizationPartyId?: string
      packageId?: string
      packageIds?: string[]
      facilityIds?: string[]
    }) {
      const resp = await api({
        url: `admin/productStores/${payload.productStoreId}/accessPackages/users`,
        method: "post",
        data: payload
      })
      if (!commonUtil.hasError(resp)) {
        this.currentAccessPackageStatus = resp.data?.accessPackageStatus || this.currentAccessPackageStatus
      }
      return resp
    },

    async createJwtToken(payload: {
      subjectUserLoginId: string
      category?: string
      purpose: string
      expireIn?: number
    }) {
      return api({
        url: "admin/jwtTokens",
        method: "post",
        data: payload
      })
    },

    async setupProductStoreShopifyInventoryReset(payload: {
      productStoreId: string
      shopId?: string
      activateJobs?: boolean
      inventoryResetAdditionalParameters?: Record<string, any>
      facilityGroupId?: string
      facilityTypeId?: string
      parentTypeId?: string
      productId?: string
    }) {
      const resp = await api({
        url: `admin/productStores/${payload.productStoreId}/shopifyJobs/inventoryReset`,
        method: "post",
        data: payload
      })
      if (!commonUtil.hasError(resp)) {
        this.currentShopifyJobStatus = resp.data?.shopifyJobsStatus || this.currentShopifyJobStatus
      }
      return resp
    },

    async setupProductStoreShopifyProductImport(payload: {
      productStoreId: string
      shopId?: string
      productIdentifierEnumId?: string
      activateJobs?: boolean
    }) {
      const resp = await api({
        url: `admin/productStores/${payload.productStoreId}/shopifyJobs/productImport`,
        method: "post",
        data: payload
      })
      if (!commonUtil.hasError(resp)) {
        this.currentShopifyJobStatus = resp.data?.shopifyJobsStatus || this.currentShopifyJobStatus
      }
      return resp
    },

    async runProductStoreShopifyProductImport(payload: {
      shopId: string
      includeAll?: boolean
      fromDate?: string
      thruDate?: string
    }) {
      const data: any = {
        shopId: payload.shopId,
        includeAll: payload.includeAll !== false
      }

      if (payload.fromDate) data.fromDate = payload.fromDate
      if (payload.thruDate) data.thruDate = payload.thruDate

      return api({
        url: "shopify/products/sync",
        method: "post",
        data
      })
    },

    async runProductStoreShopifyInventoryReset(payload: {
      shopId: string
    }) {
      return api({
        url: "sob/shopify/inventoryReset",
        method: "post",
        data: payload
      })
    },

    async runProductStoreShopifyOrderHistoryImport(payload: {
      shopId: string
      fromDate: string
      windowDays?: number
    }) {
      return api({
        url: "sob/shopify/orderHistory",
        method: "post",
        data: payload
      })
    },

    async setupProductStoreShopifyOrderImport(payload: {
      productStoreId: string
      shopId?: string
      activateJobs?: boolean
    }) {
      const resp = await api({
        url: `admin/productStores/${payload.productStoreId}/shopifyJobs/orderImport`,
        method: "post",
        data: payload
      })
      if (!commonUtil.hasError(resp)) {
        this.currentShopifyJobStatus = resp.data?.shopifyJobsStatus || this.currentShopifyJobStatus
      }
      return resp
    },

    async setupProductStoreShopifyRealtimeOrderImport(payload: {
      productStoreId: string
      queueName: string
      awsRemoteId?: string
      expireLockTime?: number
      activateJobs?: boolean
    }) {
      const resp = await api({
        url: `admin/productStores/${payload.productStoreId}/shopifyJobs/realtimeOrderImport`,
        method: "post",
        data: payload
      })
      if (!commonUtil.hasError(resp)) {
        this.currentShopifyJobStatus = resp.data?.shopifyJobsStatus || this.currentShopifyJobStatus
      }
      return resp
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
