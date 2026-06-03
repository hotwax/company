import { defineStore } from 'pinia'
import { commonUtil } from '@common'
import logger from '@/logger'
import { NetSuiteService } from '@/services/NetSuiteService'
import { UtilService } from '@/services/UtilService'
import { useProductStoreStore } from './productStore'

export const useNetSuiteStore = defineStore('netSuite', {
  state: () => ({
    inventoryVariances: [] as any[],
    productStoreShipmentMethods: [] as any[],
    paymentMethods: [] as any[],
    salesChannel: [] as any[],
    integrationTypeMappings: {} as any,
    facilitiesIdentifications: [] as any[],
    enumsInEnumGroup: {} as any
  }),

  getters: {
    getInventoryVariances: (state) => state.inventoryVariances ?? [],
    getProductStoreShipmentMehtods: (state) => state.productStoreShipmentMethods,
    getPaymentMehtods: (state) => state.paymentMethods,
    getSalesChannel: (state) => state.salesChannel,
    getFacilitiesIdentifications: (state) => state.facilitiesIdentifications,
    getEnumGroups: (state) => (enumId: any) => state.enumsInEnumGroup[enumId],
    getIntegrationTypeMappings: (state) => (typeId: any) =>
      state.integrationTypeMappings[typeId] ?? []
  },

  actions: {
    async fetchInventoryVariances() {
      let inventoryVariances: any[] = [], pageIndex = 0, resp: any
      try {
        do {
          resp = await UtilService.fetchEnums({ enumTypeId: 'IID_REASON', pageSize: 100, pageIndex })
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
          resp = await UtilService.fetchEnumGroupMember({
            enumerationGroupId: 'NETSUITE_IIV_REASON',
            pageSize: 100,
            pageIndex
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
          resp = await NetSuiteService.fetchfacilitiesIdentifications({
            facilityIdenTypeId: 'ORDR_ORGN_DPT',
            pageSize: 100,
            pageIndex
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
          resp = await UtilService.fetchEnums({ enumTypeId: 'ORDER_SALES_CHANNEL', pageSize: 100, pageIndex })
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
          resp = await NetSuiteService.fetchPaymentMethods({ pageSize: 100, pageIndex })
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
        const netSuiteProductStore = useProductStoreStore().getNetSuiteProductStore
        const productStoreId = params.productStoreId || netSuiteProductStore?.productStoreId
        do {
          resp = await NetSuiteService.fetchProductStoreShipmentMethods({ productStoreId, pageSize: 100, pageIndex })
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

          resp = await NetSuiteService.fetchIntegrationTypeMappings(payload)
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

    clearNetSuiteState() {
      this.$reset()
    }
  },

  persist: true
})
