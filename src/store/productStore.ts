import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'
import { useUtilStore } from './util'

const SHOPIFY_JOB_SPECS = [
  { key: "productSync", label: "Product import", templateJobName: "sync_ShopifyProductUpdates", perShop: true },
  { key: "orderImport", label: "Order import", templateJobName: "queue_ShopifyOrderSync", perShop: true, requiresRemote: true, requiredType: "ShopifyOrderSync" },
  { key: "orderHistory", label: "Historic order import", templateJobName: "sync_ShopifyOrderHistory", perShop: true, requiresRemote: true, requiredType: "BulkOrderHistoryQuery" },
  { key: "realtimeOrderImport", label: "Real-time order SQS", templateJobName: "consume_ShopifyOrders_SQS", perShop: false },
  { key: "inventoryReset", label: "Inventory reset to Shopify", templateJobName: "resetShopifyInventoryQoh", perShop: true, requiresRemote: true, requiredType: "ResetInventoryQoh" }
]

const ORDER_DATA_MANAGER_CONFIG_IDS = ["SYNC_SHOPIFY_ORDER", "BULK_ORDER_HISTORY"]
const SHOPIFY_READ_WRITE_ACCESS_SCOPE_IDS = ["SHOP_READ_WRITE_ACCESS", "SHOP_RW_ACCESS"]

function valueText(value: any) {
  return value == null ? "" : String(value).trim()
}

function splitValues(value: any) {
  return valueText(value).split(",").map((item) => item.trim()).filter(Boolean)
}

function getResponseList(payload: any, keys: string[] = []) {
  if (Array.isArray(payload)) return payload
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  if (Array.isArray(payload?.entityValueList)) return payload.entityValueList
  if (Array.isArray(payload?.docs)) return payload.docs
  return []
}

function getJobParameters(job: any = {}) {
  const parameters = {} as Record<string, any>
  const serviceJobParameters = Array.isArray(job.serviceJobParameters) ? job.serviceJobParameters : []

  serviceJobParameters.forEach((param: any) => {
    parameters[param.parameterName] = param.parameterValue
  })

  return parameters
}

function sanitizeJob(job: any) {
  if (!job?.jobName) return null

  return {
    jobName: job.jobName,
    description: job.description,
    parentJobName: job.parentJobName,
    serviceName: job.serviceName,
    cronExpression: job.cronExpression,
    paused: job.paused,
    isPaused: job.paused === "Y",
    parameters: getJobParameters(job)
  }
}

function buildRequirement(id: string, label: string, complete: boolean, message: string) {
  return {
    id,
    label,
    status: complete ? "complete" : "missing",
    complete,
    message
  }
}

function buildShopifyJobStatusFromRecords(payload: {
  productStoreId: string
  productStore: any
  linkedShops: any[]
  systemMessageRemotes: any[]
  jobs: any[]
  dataManagerConfigs: any[]
}) {
  const linkedShops = payload.linkedShops || []
  const enabledShops = linkedShops.filter((shop: any) => shop.isEnabled !== "N")
  const selectedShop = enabledShops[0] || linkedShops[0] || null
  const shopId = valueText(selectedShop?.shopId)
  const shopifyShopId = valueText(selectedShop?.shopifyShopId)

  const remoteCandidates = (payload.systemMessageRemotes || []).filter((remote: any) => {
    return selectedShop && (
      valueText(remote.internalId) === shopId
      || (shopifyShopId && valueText(remote.remoteId) === shopifyShopId)
      || valueText(remote.systemMessageRemoteId) === shopId
    )
  })
  const remoteById = remoteCandidates.reduce((remotes: Record<string, any>, remote: any) => {
    const remoteId = valueText(remote.systemMessageRemoteId)
    if (remoteId) remotes[remoteId] = remote
    return remotes
  }, {})
  const systemMessageRemotes = Object.values(remoteById).sort((a: any, b: any) => {
    return valueText(a.systemMessageRemoteId).localeCompare(valueText(b.systemMessageRemoteId))
  })
  const shopRemoteIds = systemMessageRemotes.map((remote: any) => valueText(remote.systemMessageRemoteId)).filter(Boolean)
  const readWriteRemoteIds = systemMessageRemotes
    .filter((remote: any) => SHOPIFY_READ_WRITE_ACCESS_SCOPE_IDS.includes(valueText(remote.accessScopeEnumId)))
    .map((remote: any) => valueText(remote.systemMessageRemoteId))
    .filter(Boolean)

  const requirements = [
    buildRequirement(
      "shopifyShop",
      "Shopify shop linked",
      !!selectedShop,
      selectedShop ? `Shopify shop ${shopId} is linked to ${payload.productStoreId}.` : "Link a Shopify shop to this product store before configuring jobs."
    ),
    buildRequirement(
      "shopifyRemote",
      "Shopify read-write remote",
      !!readWriteRemoteIds.length,
      readWriteRemoteIds.length ? `Read-write remote ${readWriteRemoteIds[0]} is available.` : "Create or select a Shopify SystemMessageRemote with read-write access for this shop."
    )
  ]

  const jobsByName = (payload.jobs || []).reduce((jobs: Record<string, any>, job: any) => {
    if (job?.jobName) jobs[job.jobName] = job
    return jobs
  }, {})
  const hasRemoteParam = (params: Record<string, any>) => {
    const remoteId = valueText(params.systemMessageRemoteId)
    return !!remoteId && (shopRemoteIds.includes(remoteId) || readWriteRemoteIds.includes(remoteId))
  }
  const hasProductStoreParam = (params: Record<string, any>) => {
    return splitValues(params.productStoreIds).includes(payload.productStoreId)
  }
  const hasShopParam = (params: Record<string, any>) => {
    return !!shopId && valueText(params.shopId) === shopId
  }

  const jobStatuses = SHOPIFY_JOB_SPECS.map((spec) => {
    const expectedJobName = spec.perShop && shopId ? `${spec.templateJobName}_${shopId}` : spec.templateJobName
    const candidates = Object.values(jobsByName).filter((job: any) => {
      return job.jobName === expectedJobName
        || job.jobName === spec.templateJobName
        || valueText(job.jobName).startsWith(spec.templateJobName)
        || valueText(job.parentJobName) === spec.templateJobName
    }).sort((a: any, b: any) => valueText(a.jobName).localeCompare(valueText(b.jobName)))
    const sanitizedCandidates = candidates.map(sanitizeJob).filter(Boolean) as any[]
    const configuredJobs = sanitizedCandidates.filter((job: any) => {
      const params = job.parameters || {}
      if (spec.key === "productSync") return hasShopParam(params) && hasProductStoreParam(params)
      if (spec.key === "realtimeOrderImport") return !!valueText(params.queueName) && !!valueText(params.systemMessageRemoteId)
      if (spec.requiresRemote) return hasRemoteParam(params) && (!spec.requiredType || valueText(params.systemMessageTypeId) === spec.requiredType)
      return !!job
    })
    const configured = !!configuredJobs.length
    const templateJob = sanitizedCandidates.find((job: any) => job.jobName === spec.templateJobName) || null
    const expectedJob = sanitizedCandidates.find((job: any) => job.jobName === expectedJobName) || null

    return {
      key: spec.key,
      label: spec.label,
      templateJobName: spec.templateJobName,
      expectedJobName,
      configured,
      status: configured ? "configured" : (templateJob ? "template-ready" : "missing-template"),
      selectedJobName: configuredJobs[0]?.jobName || null,
      templateJob,
      expectedJob,
      jobs: sanitizedCandidates
    }
  })

  jobStatuses.forEach((jobStatus) => {
    requirements.push(buildRequirement(
      `job.${jobStatus.key}`,
      `${jobStatus.label} job`,
      jobStatus.configured,
      jobStatus.configured ? `Configured by job ${jobStatus.selectedJobName}.` : `Configure ${jobStatus.expectedJobName || jobStatus.templateJobName}.`
    ))
  })

  const dataManagerConfigs = ORDER_DATA_MANAGER_CONFIG_IDS.map((configId) => {
    const config = (payload.dataManagerConfigs || []).find((item: any) => item?.configId === configId)
    return {
      configId,
      exists: !!config,
      importServiceName: config?.importServiceName,
      description: config?.description
    }
  })
  requirements.push(buildRequirement(
    "dataManager.orderConfigs",
    "Order DataManager configs",
    dataManagerConfigs.every((config) => config.exists),
    "Load SYNC_SHOPIFY_ORDER and BULK_ORDER_HISTORY DataManagerConfig records."
  ))

  return {
    productStoreId: payload.productStoreId,
    productStore: {
      productStoreId: payload.productStore?.productStoreId,
      storeName: payload.productStore?.storeName,
      reserveInventory: payload.productStore?.reserveInventory,
      enableBrokering: payload.productStore?.enableBrokering
    },
    selectedShopId: shopId,
    selectedShopifyShopId: shopifyShopId,
    linkedShops,
    systemMessageRemotes: systemMessageRemotes.map((remote: any) => ({
      systemMessageRemoteId: remote.systemMessageRemoteId,
      description: remote.description,
      sendUrl: remote.sendUrl,
      remoteId: remote.remoteId,
      remoteIdType: remote.remoteIdType,
      internalId: remote.internalId,
      internalIdType: remote.internalIdType,
      accessScopeEnumId: remote.accessScopeEnumId,
      authHeaderName: remote.authHeaderName,
      hasToken: false
    })),
    dataManagerConfigs,
    jobs: jobStatuses,
    requirements,
    ready: requirements.every((requirement) => requirement.complete)
  }
}

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
        const [productStoreResp, shopifyShopsResp, remotesResp, jobsResp, ...dataManagerResponses] = await Promise.all([
          api({ url: `admin/productStores/${productStoreId}`, method: "get" }),
          api({ url: "oms/shopifyShops/shops", method: "get", params: { productStoreId, pageSize: 100 } }),
          api({ url: "oms/systemMessageRemotes", method: "get", params: { pageSize: 500 } }),
          api({ url: "admin/serviceJobs", method: "get", params: { pageSize: 500 } }),
          ...ORDER_DATA_MANAGER_CONFIG_IDS.map((configId) => {
            return api({ url: `admin/dataManager/${configId}`, method: "get" }).catch((error: any) => {
              logger.warn(`Failed to fetch DataManager config ${configId}`, error)
              return null
            })
          })
        ])

        const requiredResponses = [productStoreResp, shopifyShopsResp, remotesResp, jobsResp]
        const failedResponse = requiredResponses.find((resp: any) => commonUtil.hasError(resp))
        if (failedResponse) throw failedResponse.data

        const dataManagerConfigs = dataManagerResponses
          .filter((resp: any) => resp && !commonUtil.hasError(resp))
          .map((resp: any) => resp.data)
          .filter(Boolean)

        shopifyJobStatus = buildShopifyJobStatusFromRecords({
          productStoreId,
          productStore: productStoreResp.data,
          linkedShops: getResponseList(shopifyShopsResp.data).filter((shop: any) => shop.productStoreId === productStoreId),
          systemMessageRemotes: getResponseList(remotesResp.data, ["systemMessageRemoteList"]),
          jobs: getResponseList(jobsResp.data, ["serviceJobs", "serviceJobList", "jobs", "jobList"]),
          dataManagerConfigs
        })
        this.fetchStatus = { ...this.fetchStatus, shopifyJobStatus: 'success', lastFetched: Date.now() }
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
      launchDate: string
      thruDate?: string
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
