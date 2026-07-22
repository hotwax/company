import { defineStore } from "pinia"
import { api, commonUtil, logger, translate } from "@common"

let inflightMaargFetch: Promise<any> | null = null

const DEFAULT_COMPANY_ROLE_TYPE_IDS = [
  "BILL_FROM_VENDOR",
  "SHIP_FROM_VENDOR",
  "BILL_TO_CUSTOMER",
  "INTERNAL_ORGANIZATIO",
  "SUPPLIER",
  "VENDOR",
  "CONTACT",
  "_NA_"
]

export const useUtilStore = defineStore("util", {
  state: () => ({
    facilityGroups: [] as any[],
    facilities: [] as any[],
    operatingCountries: [] as any[],
    dbicCountries: { list: [] as any[], total: 0 },
    productIdentifiers: [] as any[],
    productTypes: [] as any[],
    shipmentMethodTypes: [] as any[],
    emailTypes: [] as any[],
    userGroups: [] as any[],
    shopifyShops: [] as any[],
    roles: [] as any[],
    productStores: [] as any[],
    organizationPartyId: "" as string,
    statusItems: {} as any,
    maargInfo: null as any,
    currencies: [] as any[],
    fetchStatus: {
      facilities: "none",
      statuses: "none",
      organizationPartyId: "none",
      facilityGroups: "none",
      dbicCountries: "none",
      operatingCountries: "none",
      productIdentifiers: "none",
      productTypes: "none",
      shipmentMethodTypes: "none",
      emailTypes: "none",
      maargInfo: "none",
      currencies: "none",
      lastFetched: 0
    }
  }),

  getters: {
    getFacilityGroups: (state) => state.facilityGroups,
    getFacilities: (state) => state.facilities,
    getOperatingCountries: (state) => state.operatingCountries,
    getDBICCountriesCount: (state) => state.dbicCountries.total,
    getProductIdentifiers: (state) => state.productIdentifiers,
    getProductTypes: (state) => state.productTypes,
    getShipmentMethodTypes: (state) => state.shipmentMethodTypes,
    getEmailTypes: (state) => state.emailTypes,
    getUserGroups: (state): any[] => state.userGroups,
    getShopifyShops: (state): any[] => state.shopifyShops,
    getRoles: (state): any[] => state.roles,
    getProductStores: (state): any[] => state.productStores,
    getRoleTypeDesc: (state) => (roleTypeId: string): string | undefined => {
      return state.roles.find((role: any) => role.roleTypeId === roleTypeId)?.description
    },
    getOrganizationPartyId: (state) => state.organizationPartyId,
    getStatusItems: (state) => state.statusItems,
    getMaargInfo: (state) => state.maargInfo,
    getCurrencies: (state) => state.currencies,
    getFetchStatus: (state) => state.fetchStatus
  },

  actions: {
    async fetchFacilityGroups() {
      this.fetchStatus = { ...this.fetchStatus, facilityGroups: "pending" }
      let facilityGroups: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await api({ url: "admin/facilityGroups", method: "get", params: { pageSize: 100, pageIndex } })
          if(!commonUtil.hasError(resp)) {
            facilityGroups = facilityGroups.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while(resp.data.length >= 100)
        this.fetchStatus = { ...this.fetchStatus, facilityGroups: "success", lastFetched: Date.now() }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, facilityGroups: "error" }
      }
      this.facilityGroups = facilityGroups
    },

    async fetchFacilities() {
      this.fetchStatus = { ...this.fetchStatus, facilities: "pending" }
      let facilities: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await api({
            url: "admin/facilities",
            method: "get",
            params: {
              facilityTypeId: "VIRTUAL_FACILITY",
              facilityTypeId_not: "Y",
              parentTypeId: "VIRTUAL_FACILITY",
              parentTypeId_not: "Y",
              pageSize: 100,
              pageIndex
            }
          })
          if(!commonUtil.hasError(resp) && resp.data) {
            facilities = facilities.concat(resp.data.filter((f: any) => f.externalId))
          } else {
            throw resp.data
          }
          pageIndex++
        } while(resp.data.length >= 100)
        this.fetchStatus = { ...this.fetchStatus, facilities: "success", lastFetched: Date.now() }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, facilities: "error" }
      }
      this.facilities = facilities
    },

    async createFacility(payload: {
      facilityId: string
      facilityName: string
      externalId?: string
      facilityTypeId: string
      defaultInventoryItemTypeId?: string
    }) {
      return api({
        url: "admin/facilities",
        method: "post",
        data: payload
      })
    },

    async fetchDBICCountries() {
      this.fetchStatus = { ...this.fetchStatus, dbicCountries: "pending" }
      let countries: any[] = []

      try {
        const resp = await api({ url: "admin/geos/assocs", method: "get", params: { toGeoId: "DBIC", pageSize: 200 } })
        if(!commonUtil.hasError(resp)) {
          countries = resp.data
          this.fetchStatus = { ...this.fetchStatus, dbicCountries: "success", lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, dbicCountries: "error" }
      }
      this.dbicCountries = { list: countries, total: countries.length }
    },

    async fetchOperatingCountries() {
      if(this.operatingCountries.length) {return}
      this.fetchStatus = { ...this.fetchStatus, operatingCountries: "pending" }
      let operatingCountries: any[] = []

      try {
        const resp = await api({ url: "admin/geos", method: "get", params: { pageSize: 300, geoTypeEnumId: "GEOT_COUNTRY" } })
        if(!commonUtil.hasError(resp)) {
          operatingCountries = resp.data
          this.fetchStatus = { ...this.fetchStatus, operatingCountries: "success", lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, operatingCountries: "error" }
      }
      this.operatingCountries = operatingCountries
    },

    async fetchProductIdentifiers() {
      if(this.productIdentifiers.length) {return}
      this.fetchStatus = { ...this.fetchStatus, productIdentifiers: "pending" }
      let productIdentifiers: any[] = []

      try {
        const resp = await api({ url: "admin/enums", method: "get", params: { enumTypeId: "SHOP_PROD_IDENTITY", pageSize: 100 } })
        if(!commonUtil.hasError(resp)) {
          productIdentifiers = resp.data
          this.fetchStatus = { ...this.fetchStatus, productIdentifiers: "success", lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, productIdentifiers: "error" }
      }
      this.productIdentifiers = productIdentifiers
    },

    async fetchEmailTypes() {
      if(this.emailTypes.length) {return}
      this.fetchStatus = { ...this.fetchStatus, emailTypes: "pending" }
      let emailTypes: any[] = []

      try {
        const resp = await api({ url: "admin/enums", method: "get", params: { enumTypeId: "PRDS_EMAIL", pageSize: 100 } })
        if(!commonUtil.hasError(resp)) {
          emailTypes = resp.data
          this.fetchStatus = { ...this.fetchStatus, emailTypes: "success", lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, emailTypes: "error" }
      }
      this.emailTypes = emailTypes
    },

    async fetchShipmentMethodTypes() {
      if(this.shipmentMethodTypes.length) {return}
      this.fetchStatus = { ...this.fetchStatus, shipmentMethodTypes: "pending" }
      let shipmentMethodTypes: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await api({ url: "oms/shippingGateways/shipmentMethodTypes", method: "get", params: { pageSize: 100, pageIndex } })
          if(!commonUtil.hasError(resp)) {
            shipmentMethodTypes = shipmentMethodTypes.concat(resp.data)
          } else {
            throw resp.data
          }
          pageIndex++
        } while(resp.data.length >= 100)
        this.fetchStatus = { ...this.fetchStatus, shipmentMethodTypes: "success", lastFetched: Date.now() }
      } catch (error: any) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, shipmentMethodTypes: "error" }
      }
      this.shipmentMethodTypes = shipmentMethodTypes
    },

    async fetchOrganizationPartyId() {
      this.fetchStatus = { ...this.fetchStatus, organizationPartyId: "pending" }
      let partyId = ""

      try {
        const resp = await api({ url: "admin/organizations", method: "get", params: { roleTypeId: "INTERNAL_ORGANIZATIO", pageSize: 1 } })
        if(!commonUtil.hasError(resp)) {
          partyId = resp.data[0]?.partyId
          this.fetchStatus = { ...this.fetchStatus, organizationPartyId: "success", lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, organizationPartyId: "error" }
      }
      this.organizationPartyId = partyId

      return partyId
    },

    async bootstrapOrganization(payload: { partyId?: string, groupName?: string } = {}) {
      this.fetchStatus = { ...this.fetchStatus, organizationPartyId: "pending" }

      try {
        const partyId = payload.partyId?.trim() || "COMPANY"
        const groupName = payload.groupName?.trim() || "Default Company"

        const existingOrganizationResp = await api({
          url: `admin/organizations/${partyId}`,
          method: "get",
          params: { partyId }
        })

        if(commonUtil.hasError(existingOrganizationResp)) {
          const partyResp = await api({
            url: "admin/organizations",
            method: "post",
            data: { partyId, partyTypeId: "PARTY_GROUP" }
          })
          if(commonUtil.hasError(partyResp)) {throw partyResp.data}
        }

        const partyGroupResp = await api({
          url: `admin/organizations/${partyId}`,
          method: "post",
          data: { partyId, groupName }
        })
        if(commonUtil.hasError(partyGroupResp)) {throw partyGroupResp.data}

        for(const roleTypeId of DEFAULT_COMPANY_ROLE_TYPE_IDS) {
          const roleResp = await api({
            url: `admin/organizations/${partyId}/roles`,
            method: "put",
            data: { partyId, roleTypeId }
          })
          if(commonUtil.hasError(roleResp)) {throw roleResp.data}
        }

        const systemPropertyResp = await api({
          url: "admin/systemProperties",
          method: "put",
          data: {
            systemResourceId: "general",
            systemPropertyId: "ORGANIZATION_PARTY",
            systemPropertyValue: partyId,
            description: "The default organizationPartyId for setup, dropdowns, and reports"
          }
        })
        if(commonUtil.hasError(systemPropertyResp)) {throw systemPropertyResp.data}

        this.organizationPartyId = partyId
        this.fetchStatus = { ...this.fetchStatus, organizationPartyId: "success", lastFetched: Date.now() }

        return { partyId, groupName, roleTypeIds: DEFAULT_COMPANY_ROLE_TYPE_IDS }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, organizationPartyId: "error" }
      }

      return null
    },

    async fetchStatusItems() {
      this.fetchStatus = { ...this.fetchStatus, statuses: "pending" }
      let statusItems: any = {}

      try {
        const resp = await api({ url: "oms/statuses", method: "get", params: { pageSize: 1000 } })
        if(!commonUtil.hasError(resp) && resp.data) {
          statusItems = resp.data.reduce((items: any, item: any) => {
            items[item.statusId] = item

            return items
          }, {})
          this.fetchStatus = { ...this.fetchStatus, statuses: "success", lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, statuses: "error" }
      }
      this.statusItems = statusItems
    },

    async fetchMaargInfo() {
      if(this.maargInfo) {return this.maargInfo}
      if(inflightMaargFetch) {return inflightMaargFetch}

      this.fetchStatus = { ...this.fetchStatus, maargInfo: "pending" }
      inflightMaargFetch = (async () => {
        try {
          const resp: any = await api({ url: "admin/maarg", method: "get" })
          if(!resp?.data || typeof resp.data !== "object" || commonUtil.hasError(resp)) {
            throw new Error("Maarg version response is unavailable.")
          }
          this.maargInfo = resp.data
          this.fetchStatus = { ...this.fetchStatus, maargInfo: "success", lastFetched: Date.now() }

          return resp.data
        } catch (error) {
          logger.warn("Failed to fetch maarg info", error)
          this.fetchStatus = { ...this.fetchStatus, maargInfo: "error" }
          throw error
        } finally {
          inflightMaargFetch = null
        }
      })()

      return inflightMaargFetch
    },

    async addEnumToEnumGroup(payload: any) {
      try {
        const resp = await api({
          url: `admin/enumGroups/${payload.enumerationGroupId}/members`,
          method: "post",
          data: payload
        })

        return resp
      } catch (error: any) {
        logger.error("addEnumToEnumGroup", error)

        return Promise.reject(error)
      }
    },

    async fetchProductTypes() {
      this.fetchStatus = { ...this.fetchStatus, productTypes: "pending" }
      let productTypes: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await api({ url: "oms/productTypes", method: "get", params: { pageSize: 200, pageIndex } })
          if(!commonUtil.hasError(resp) && resp.data?.length) {
            productTypes = productTypes.concat(resp.data)
            pageIndex++
          } else {
            resp = null
          }
        } while(resp)
        this.fetchStatus = { ...this.fetchStatus, productTypes: "success", lastFetched: Date.now() }
      } catch (error: any) {
        logger.error("fetchProductTypes", error)
        this.fetchStatus = { ...this.fetchStatus, productTypes: "error" }
      }
      this.productTypes = productTypes
    },

    async fetchCurrencies(payload: any) {
      this.fetchStatus = { ...this.fetchStatus, currencies: "pending" }
      try {
        const resp = await api({ url: "admin/uoms", method: "get", params: payload })
        if(!commonUtil.hasError(resp) && resp.data?.length) {
          this.currencies = resp.data
          this.fetchStatus = { ...this.fetchStatus, currencies: "success", lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error: any) {
        logger.error("fetchCurrencies", error)
        this.fetchStatus = { ...this.fetchStatus, currencies: "error" }
      }
    },

    // This app only ever manages login-capable groups, so this is scoped to groupTypeEnumId=UgtUserAccess
    // (excludes framework/system groups like UgtMoquiAdmin, UgtRemoteSystems).
    async fetchUserGroups() {
      if(this.userGroups.length) {
        return
      }

      let userGroups = []
      try {
        const resp = await api({
          url: "admin/userGroups",
          method: "get",
          params: { groupTypeEnumId: "UgtUserAccess", pageSize: 100 },
          cache: true
        }) as any
        if(!commonUtil.hasError(resp)) {
          userGroups = resp.data
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
      }
      this.userGroups = userGroups
    },

    updateUserGroup(payload: { userGroupId: string; description: string }): Promise<any> {
      return api({
        url: `admin/userGroups/${payload.userGroupId}`,
        method: "put",
        data: payload
      })
    },

    updateUserGroupInState(updatedGroup: { userGroupId: string; description: string }) {
      this.userGroups = this.userGroups.map((group: any) => group.userGroupId === updatedGroup.userGroupId ? { ...group, ...updatedGroup } : group)
    },

    async fetchRoles() {
      if(this.roles.length) {
        return
      }

      let roles: any[] = [], pageIndex = 0, resp: any

      try {
        do {
          resp = await api({ url: "oms/roleTypes", method: "get", params: { pageSize: 200, pageIndex }, cache: true })
          if(!commonUtil.hasError(resp) && resp.data?.length) {
            roles = roles.concat(resp.data)
            pageIndex++
          } else {
            resp = null
          }
        } while(resp)

        roles.push({
          roleTypeId: "none",
          parentTypeId: "none",
          description: "None"
        })
      } catch (error) {
        commonUtil.showToast(translate("Something went wrong."))
        logger.error(error)
        roles = []
      }
      this.roles = roles
    },

    async fetchProductStores() {
      let stores = []
      try {
        const resp = await api({
          url: "admin/productStores",
          method: "GET",
          params: { pageSize: 500 },
          cache: true
        })
        if(!commonUtil.hasError(resp)) {
          stores = resp.data
        } else {
          throw resp.data
        }
      } catch (err) {
        logger.error("Failed to fetch product stores", err)
      }
      this.productStores = stores
    },

    async fetchShopifyShopConfigs() {
      let shopifyShops = []
      const params = {
        fieldList: ["shopifyConfigId", "name", "shopId", "productStoreId"],
        pageSize: 250
      }

      try {
        const resp = await api({
          url: "admin/shopifyShops",
          method: "get",
          params,
          cache: true
        })
        if(!commonUtil.hasError(resp)) {
          shopifyShops = resp.data
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
      }
      this.shopifyShops = shopifyShops
    },

    clearUtilState() {
      this.$reset()
      this.organizationPartyId = ""
      this.maargInfo = null
    }
  },

  persist: true
})
