import { defineStore } from 'pinia'
import { api, commonUtil } from '@common'
import logger from '@/logger'
import { UtilService } from '@/services/UtilService'

let inflightMaargFetch: Promise<any> | null = null

export const useUtilStore = defineStore('util', {
  state: () => ({
    facilityGroups: [] as any[],
    facilities: [] as any[],
    operatingCountries: [] as any[],
    dbicCountries: { list: [] as any[], total: 0 },
    productIdentifiers: [] as any[],
    shipmentMethodTypes: [] as any[],
    emailTypes: [] as any[],
    organizationPartyId: '' as string,
    statusItems: {} as any,
    maargInfo: null as any,
    fetchStatus: {
      facilities: 'none',
      statuses: 'none',
      organizationPartyId: 'none',
      facilityGroups: 'none',
      dbicCountries: 'none',
      operatingCountries: 'none',
      productIdentifiers: 'none',
      shipmentMethodTypes: 'none',
      emailTypes: 'none',
      maargInfo: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getFacilityGroups: (state) => state.facilityGroups,
    getFacilities: (state) => state.facilities,
    getOperatingCountries: (state) => state.operatingCountries,
    getDBICCountriesCount: (state) => state.dbicCountries.total,
    getProductIdentifiers: (state) => state.productIdentifiers,
    getShipmentMethodTypes: (state) => state.shipmentMethodTypes,
    getEmailTypes: (state) => state.emailTypes,
    getOrganizationPartyId: (state) => state.organizationPartyId,
    getStatusItems: (state) => state.statusItems,
    getMaargInfo: (state) => state.maargInfo,
    getFetchStatus: (state) => state.fetchStatus
  },

  actions: {
    async fetchFacilityGroups() {
      this.fetchStatus = { ...this.fetchStatus, facilityGroups: 'pending' }
      let facilityGroups: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await UtilService.fetchFacilityGroups({ pageSize: 100, pageIndex })
          if (!commonUtil.hasError(resp)) {
            facilityGroups = facilityGroups.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
        this.fetchStatus = { ...this.fetchStatus, facilityGroups: 'success', lastFetched: Date.now() }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, facilityGroups: 'error' }
      }
      this.facilityGroups = facilityGroups
    },

    async fetchFacilities() {
      this.fetchStatus = { ...this.fetchStatus, facilities: 'pending' }
      let facilities: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await UtilService.fetchFacilities({
            facilityTypeId: 'VIRTUAL_FACILITY',
            facilityTypeId_not: 'Y',
            parentTypeId: 'VIRTUAL_FACILITY',
            parentTypeId_not: 'Y',
            pageSize: 100,
            pageIndex
          })
          if (!commonUtil.hasError(resp) && resp.data) {
            facilities = facilities.concat(resp.data.filter((f: any) => f.externalId))
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
        this.fetchStatus = { ...this.fetchStatus, facilities: 'success', lastFetched: Date.now() }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, facilities: 'error' }
      }
      this.facilities = facilities
    },

    async fetchDBICCountries() {
      this.fetchStatus = { ...this.fetchStatus, dbicCountries: 'pending' }
      let countries: any[] = []

      try {
        const resp = await UtilService.fetchDBICCountries({ toGeoId: 'DBIC', pageSize: 200 })
        if (!commonUtil.hasError(resp)) {
          countries = resp.data
          this.fetchStatus = { ...this.fetchStatus, dbicCountries: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, dbicCountries: 'error' }
      }
      this.dbicCountries = { list: countries, total: countries.length }
    },

    async fetchOperatingCountries() {
      if (this.operatingCountries.length) return
      this.fetchStatus = { ...this.fetchStatus, operatingCountries: 'pending' }
      let operatingCountries: any[] = []

      try {
        const resp = await UtilService.fetchOperatingCountries({ pageSize: 300, geoTypeEnumId: 'GEOT_COUNTRY' })
        if (!commonUtil.hasError(resp)) {
          operatingCountries = resp.data
          this.fetchStatus = { ...this.fetchStatus, operatingCountries: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, operatingCountries: 'error' }
      }
      this.operatingCountries = operatingCountries
    },

    async fetchProductIdentifiers() {
      if (this.productIdentifiers.length) return
      this.fetchStatus = { ...this.fetchStatus, productIdentifiers: 'pending' }
      let productIdentifiers: any[] = []

      try {
        const resp = await UtilService.fetchEnums({ enumTypeId: 'SHOP_PROD_IDENTITY', pageSize: 100 })
        if (!commonUtil.hasError(resp)) {
          productIdentifiers = resp.data
          this.fetchStatus = { ...this.fetchStatus, productIdentifiers: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, productIdentifiers: 'error' }
      }
      this.productIdentifiers = productIdentifiers
    },

    async fetchEmailTypes() {
      if (this.emailTypes.length) return
      this.fetchStatus = { ...this.fetchStatus, emailTypes: 'pending' }
      let emailTypes: any[] = []

      try {
        const resp = await UtilService.fetchEnums({ enumTypeId: 'PRDS_EMAIL', pageSize: 100 })
        if (!commonUtil.hasError(resp)) {
          emailTypes = resp.data
          this.fetchStatus = { ...this.fetchStatus, emailTypes: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, emailTypes: 'error' }
      }
      this.emailTypes = emailTypes
    },

    async fetchShipmentMethodTypes() {
      if (this.shipmentMethodTypes.length) return
      this.fetchStatus = { ...this.fetchStatus, shipmentMethodTypes: 'pending' }
      let shipmentMethodTypes: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await UtilService.fetchShipmentMethodTypes({ pageSize: 100, pageIndex })
          if (!commonUtil.hasError(resp)) {
            shipmentMethodTypes = shipmentMethodTypes.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while (resp.data.length >= 100)
        this.fetchStatus = { ...this.fetchStatus, shipmentMethodTypes: 'success', lastFetched: Date.now() }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, shipmentMethodTypes: 'error' }
      }
      this.shipmentMethodTypes = shipmentMethodTypes
    },

    async fetchOrganizationPartyId() {
      this.fetchStatus = { ...this.fetchStatus, organizationPartyId: 'pending' }
      let partyId = ''

      try {
        const resp = await UtilService.fetchOrganization({
          roleTypeId: 'INTERNAL_ORGANIZATIO',
          pageSize: 1
        })
        if (!commonUtil.hasError(resp)) {
          partyId = resp.data[0]?.partyId
          this.fetchStatus = { ...this.fetchStatus, organizationPartyId: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, organizationPartyId: 'error' }
      }
      this.organizationPartyId = partyId
    },

    async fetchStatusItems() {
      this.fetchStatus = { ...this.fetchStatus, statuses: 'pending' }
      let statusItems: any = {}

      try {
        const resp = await UtilService.fetchStatusItems({ pageSize: 1000 })
        if (!commonUtil.hasError(resp) && resp.data) {
          statusItems = resp.data.reduce((items: any, item: any) => {
            items[item.statusId] = item
            return items
          }, {})
          this.fetchStatus = { ...this.fetchStatus, statuses: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, statuses: 'error' }
      }
      this.statusItems = statusItems
    },

    async fetchMaargInfo() {
      if (this.maargInfo) return this.maargInfo
      if (inflightMaargFetch) return inflightMaargFetch

      this.fetchStatus = { ...this.fetchStatus, maargInfo: 'pending' }
      inflightMaargFetch = (async () => {
        try {
          const resp: any = await api({ url: 'admin/maarg', method: 'get' })
          if (!resp?.data || typeof resp.data !== 'object' || commonUtil.hasError(resp)) {
            throw new Error('Maarg version response is unavailable.')
          }
          this.maargInfo = resp.data
          this.fetchStatus = { ...this.fetchStatus, maargInfo: 'success', lastFetched: Date.now() }
          return resp.data
        } catch (error) {
          logger.warn('Failed to fetch maarg info', error)
          this.fetchStatus = { ...this.fetchStatus, maargInfo: 'error' }
          throw error
        } finally {
          inflightMaargFetch = null
        }
      })()
      return inflightMaargFetch
    },

    clearUtilState() {
      this.$reset()
      this.organizationPartyId = ''
      this.maargInfo = null
    }
  },

  persist: true
})
