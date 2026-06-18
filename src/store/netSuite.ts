import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'
import { useProductStore } from './productStore'

export const useNetSuiteStore = defineStore('netSuite', {
  state: () => ({
    inventoryVariances: [] as any[],
    productStoreShipmentMethods: [] as any[],
    paymentMethods: [] as any[],
    salesChannel: [] as any[],
    integrationTypeMappings: {} as any,
    facilitiesIdentifications: [] as any[],
    shopifyShopLocations: [] as any[],
    enumsInEnumGroup: {} as any
  }),

  getters: {
    getInventoryVariances: (state) => state.inventoryVariances ?? [],
    getProductStoreShipmentMehtods: (state) => state.productStoreShipmentMethods,
    getPaymentMehtods: (state) => state.paymentMethods,
    getSalesChannel: (state) => state.salesChannel,
    getFacilitiesIdentifications: (state) => state.facilitiesIdentifications,
    getShopifyShopLocation: (state) => (facilityId: string) =>
      state.shopifyShopLocations.find((l: any) => l.facilityId === facilityId)?.shopifyLocationId,
    getEnumGroups: (state) => (enumId: any) => state.enumsInEnumGroup[enumId],
    getIntegrationTypeMappings: (state) => (typeId: any) =>
      state.integrationTypeMappings[typeId] ?? []
  },

  actions: {
    async fetchInventoryVariances() {
      let inventoryVariances: any[] = [], pageIndex = 0, resp: any
      try {
        do {
          resp = await api({ url: "admin/enums", method: "get", params: { enumTypeId: 'IID_REASON', pageSize: 100, pageIndex } })
          if (!commonUtil.hasError(resp)) {
            inventoryVariances = inventoryVariances.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (err) {
        logger.error(err)
      }
      this.inventoryVariances = inventoryVariances
    },

    async fetchEnumGroupMember() {
      let enumsInEnumGroup: any = {}, pageIndex = 0, resp: any
      try {
        do {
          resp = await api({
            url: `admin/enumGroups/NETSUITE_IIV_REASON/members`,
            method: "get",
            params: { enumerationGroupId: 'NETSUITE_IIV_REASON', pageSize: 100, pageIndex }
          })
          if (!commonUtil.hasError(resp) && resp.data) {
            const newEnums = resp.data
              .filter((item: any) => !item.thruDate)
              .reduce((acc: any, item: any) => {
                acc[item.enumId] = { fromDate: item.fromDate, enumerationGroupId: item.enumerationGroupId }
                return acc
              }, {})
            enumsInEnumGroup = { ...enumsInEnumGroup, ...newEnums }
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (err) {
        logger.error(err)
      }
      this.enumsInEnumGroup = enumsInEnumGroup
    },

    async fetchFacilitiesIdentifications() {
      let facilitiesIdentifications: any[] = [], pageIndex = 0, resp: any
      try {
        do {
          resp = await api({
            url: "oms/facilities/identifications",
            method: "get",
            params: { facilityIdenTypeId: 'ORDR_ORGN_DPT', pageSize: 100, pageIndex }
          })
          if (!commonUtil.hasError(resp)) {
            facilitiesIdentifications = facilitiesIdentifications.concat(
              resp.data.filter((item: any) => !item.thruDate)
            )
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (err) {
        logger.error(err)
      }
      this.facilitiesIdentifications = facilitiesIdentifications
    },

    async fetchSalesChannel() {
      let salesChannel: any[] = [], pageIndex = 0, resp: any
      try {
        do {
          resp = await api({ url: "admin/enums", method: "get", params: { enumTypeId: 'ORDER_SALES_CHANNEL', pageSize: 100, pageIndex } })
          if (!commonUtil.hasError(resp)) {
            salesChannel = salesChannel.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (err) {
        logger.error(err)
      }
      this.salesChannel = salesChannel
    },

    async fetchPaymentMethods() {
      let paymentMethods: any[] = [], pageIndex = 0, resp: any
      try {
        do {
          resp = await api({
            url: "admin/paymentMethodTypes",
            method: "get",
            params: { pageSize: 100, pageIndex }
          })
          if (!commonUtil.hasError(resp)) {
            paymentMethods = paymentMethods.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (error) {
        logger.error(error)
      }
      this.paymentMethods = paymentMethods
    },

    async fetchProductStoreShipmentMethods(params: any = {}) {
      let productStoreShipmentMethods: any[] = [], pageIndex = 0, resp: any
      try {
        const netSuiteProductStore = useProductStore().getNetSuiteProductStore
        const productStoreId = params.productStoreId || netSuiteProductStore?.productStoreId
        do {
          resp = await api({
            url: `admin/productStores/${productStoreId}/shippingMethods`,
            method: "get",
            params: { productStoreId, pageSize: 100, pageIndex }
          })
          if (!commonUtil.hasError(resp) && resp.data) {
            productStoreShipmentMethods = productStoreShipmentMethods.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (error) {
        logger.error(error)
      }
      this.productStoreShipmentMethods = productStoreShipmentMethods
    },

    async fetchIntegrationTypeMappings(params: any) {
      let integrationTypeMappings: any = {}, pageIndex = 0, resp: any
      try {
        do {
          const payload: any = {
            integrationTypeId: params.integrationTypeId,
            pageSize: 100,
            pageIndex
          }
          if (params.mappingKey) payload.mappingKey = params.mappingKey

          resp = await api({
            url: "admin/integrationTypeMappings",
            method: "get",
            params: payload
          })
          if (!commonUtil.hasError(resp) && resp.data) {
            const newMappings = resp.data.reduce((acc: any, item: any) => {
              const typeId = item.integrationTypeId
              if (!acc[typeId]) acc[typeId] = []
              acc[typeId].push(item)
              return acc
            }, {})
            integrationTypeMappings = { ...integrationTypeMappings, ...newMappings }
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
      } catch (error) {
        logger.error(error)
      }
      this.integrationTypeMappings = integrationTypeMappings
    },

    async updateFacilityIdentification(payload: any): Promise<any> {
      return api({
        url: `oms/facilities/${payload.facilityId}/identifications`,
        method: "post",
        data: payload
      })
    },

    async addIntegrationTypeMappings(payload: any): Promise<any> {
      return api({
        url: "admin/integrationTypeMappings",
        method: "post",
        data: payload
      })
    },

    async updateIntegrationTypeMappings(payload: any, integrationMappingId: any): Promise<any> {
      return api({
        url: `admin/integrationTypeMappings/${integrationMappingId}`,
        method: "post",
        data: payload
      })
    },

    async removeIntegrationMappingValue(integrationMappingId: any): Promise<any> {
      return api({
        url: `admin/integrationTypeMappings/${integrationMappingId}`,
        method: "delete"
      })
    },

    async updateSftpConfig(payload: any): Promise<any> {
      return api({
        url: "updateSftp",
        method: "post",
        data: payload
      })
    },

    async updateEnumCode(payload: any): Promise<any> {
      return api({
        url: `admin/enums/${payload.enumId}`,
        method: "put",
        data: payload
      })
    },

    async fetchShopifyShopLocation() {
      const productStoreId = useProductStore().current?.productStoreId
      if (!productStoreId) return
      try {
        const resp = await api({ url: 'oms/shopifyShops/locations', method: 'get', params: { pageSize: 200 } })
        if (!commonUtil.hasError(resp) && Array.isArray(resp.data)) {
          this.shopifyShopLocations = resp.data
        }
      } catch (err) {
        logger.error('fetchShopifyShopLocation', err)
      }
    },

    clearNetSuiteState() {
      this.$reset()
    }
  },

  persist: true
})
