import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'
import { useUtilStore } from './util'

const SHOPIFY_JOB_SPECS = [
  { key: "productSync", label: "Queue product import", templateJobName: "sync_ShopifyProductUpdates", perShop: true, requiresEnabled: true },
  { key: "productBulkSend", label: "Send product bulk operation", templateJobName: "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery", perShop: false, requiresEnabled: true },
  { key: "productBulkPoll", label: "Poll product bulk operation", templateJobName: "poll_ShopifyBulkOperationResult", perShop: false, requiresEnabled: true },
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

function isTruthy(value: any) {
  return value === true || ["true", "y", "yes", "1"].includes(valueText(value).toLowerCase())
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

function buildSuccessResponse(data: any) {
  return {
    status: 200,
    data
  }
}

async function requireApiResponse(config: any) {
  const resp = await api(config)
  if (commonUtil.hasError(resp)) throw resp.data
  return resp
}

async function fetchServiceJob(jobName: string) {
  try {
    const resp = await api({
      url: `admin/serviceJobs/${jobName}`,
      method: "get",
      params: { pageSize: 1000 }
    })
    if (commonUtil.hasError(resp)) return null
    return resp.data?.jobDetail || resp.data || null
  } catch (error: any) {
    logger.warn(`Failed to fetch service job ${jobName}`, error)
    return null
  }
}

async function updateServiceJob(jobName: string, data: Record<string, any>) {
  return requireApiResponse({
    url: `admin/serviceJobs/${jobName}`,
    method: "put",
    data: {
      jobName,
      ...data
    }
  })
}

async function ensureServiceJobFromTemplate(templateJobName: string, newJobName: string, activateJob?: boolean) {
  let serviceJob = await fetchServiceJob(newJobName)
  let created = false

  if (!serviceJob?.jobName) {
    await requireApiResponse({
      url: `admin/serviceJobs/${templateJobName}/clone`,
      method: "post",
      data: {
        newJobName,
        copyParameters: true
      }
    })
    serviceJob = await fetchServiceJob(newJobName)
    created = true
  }

  if (isTruthy(activateJob)) {
    await updateServiceJob(newJobName, { paused: "N" })
  }

  return {
    jobName: newJobName,
    templateJobName,
    created,
    activated: isTruthy(activateJob)
  }
}

async function storeServiceJobParameter(jobName: string, parameterName: string, parameterValue: any) {
  const job = await fetchServiceJob(jobName)
  if (!job?.jobName) throw new Error(`Service job ${jobName} was not found.`)

  const serviceJobParameters = Array.isArray(job.serviceJobParameters)
    ? job.serviceJobParameters.map((parameter: any) => ({ ...parameter, jobName }))
    : []
  const existingParameter = serviceJobParameters.find((parameter: any) => parameter.parameterName === parameterName)
  const parameterText = valueText(parameterValue)

  if (existingParameter) {
    existingParameter.parameterValue = parameterText
  } else {
    serviceJobParameters.push({
      jobName,
      parameterName,
      parameterValue: parameterText
    })
  }

  return updateServiceJob(jobName, {
    serviceJobParameters
  })
}

function selectLinkedShop(linkedShops: any[], productStoreId: string, shopId?: string) {
  const resolvedShopId = valueText(shopId)
  if (resolvedShopId) {
    const shop = linkedShops.find((item: any) => valueText(item.shopId) === resolvedShopId)
    if (!shop) throw new Error(`ShopifyShop [${resolvedShopId}] is not linked to ProductStore [${productStoreId}].`)
    return shop
  }

  const enabledShops = linkedShops.filter((shop: any) => shop.isEnabled !== "N")
  return enabledShops[0] || linkedShops[0] || null
}

function selectShopRemote(systemMessageRemotes: any[], shop: any, systemMessageRemoteId?: string) {
  const requestedRemoteId = valueText(systemMessageRemoteId)
  if (requestedRemoteId) {
    const remote = systemMessageRemotes.find((item: any) => valueText(item.systemMessageRemoteId) === requestedRemoteId)
    if (!remote) throw new Error(`SystemMessageRemote [${requestedRemoteId}] not found.`)
    return remote
  }

  const shopId = valueText(shop?.shopId)
  const shopifyShopId = valueText(shop?.shopifyShopId)
  const remoteById = systemMessageRemotes.reduce((remotes: Record<string, any>, remote: any) => {
    const remoteId = valueText(remote.systemMessageRemoteId)
    if (!remoteId) return remotes

    if (
      valueText(remote.internalId) === shopId
      || (shopifyShopId && valueText(remote.remoteId) === shopifyShopId)
      || remoteId === shopId
    ) {
      remotes[remoteId] = remote
    }
    return remotes
  }, {})

  return Object.values(remoteById).sort((a: any, b: any) => {
    return valueText(a.systemMessageRemoteId).localeCompare(valueText(b.systemMessageRemoteId))
  })[0] || null
}

async function fetchShopifySetupContext(payload: {
  productStoreId: string
  shopId?: string
  systemMessageRemoteId?: string
  requireRemote?: boolean
}) {
  const [productStoreResp, shopifyShopsResp, remotesResp] = await Promise.all([
    requireApiResponse({ url: `admin/productStores/${payload.productStoreId}`, method: "get" }),
    requireApiResponse({ url: "oms/shopifyShops/shops", method: "get", params: { productStoreId: payload.productStoreId, pageSize: 100 } }),
    requireApiResponse({ url: "oms/systemMessageRemotes", method: "get", params: { pageSize: 500 } })
  ])

  const productStore = productStoreResp.data
  if (!productStore?.productStoreId) throw new Error(`ProductStore [${payload.productStoreId}] not found.`)

  const linkedShops = getResponseList(shopifyShopsResp.data).filter((shop: any) => {
    return valueText(shop.productStoreId) === payload.productStoreId
  })
  const shop = selectLinkedShop(linkedShops, payload.productStoreId, payload.shopId)
  if (!shop?.shopId) throw new Error(`No ShopifyShop is linked to ProductStore [${payload.productStoreId}].`)

  const systemMessageRemotes = getResponseList(remotesResp.data, ["systemMessageRemoteList"])
  const remote = selectShopRemote(systemMessageRemotes, shop, payload.systemMessageRemoteId)
  if (payload.requireRemote && !remote?.systemMessageRemoteId) {
    throw new Error(`No Shopify SystemMessageRemote is available for shop [${shop.shopId}].`)
  }

  return {
    productStore,
    shop,
    remote
  }
}

function normalizeJsonObjectText(value: any, fallback: Record<string, any> = {}) {
  if (value == null || valueText(value) === "") return JSON.stringify(fallback)
  if (typeof value === "string") {
    const parsed = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Expected a JSON object.")
    }
    return JSON.stringify(parsed)
  }
  if (typeof value === "object" && !Array.isArray(value)) return JSON.stringify(value)
  throw new Error("Expected a JSON object.")
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
    const enabledJobs = configuredJobs.filter((job: any) => job.paused !== "Y")
    const enabled = !!enabledJobs.length
    const requiresEnabled = spec.requiresEnabled === true
    const ready = requiresEnabled ? enabled : configured
    const templateJob = sanitizedCandidates.find((job: any) => job.jobName === spec.templateJobName) || null
    const expectedJob = sanitizedCandidates.find((job: any) => job.jobName === expectedJobName) || null

    return {
      key: spec.key,
      label: spec.label,
      templateJobName: spec.templateJobName,
      expectedJobName,
      configured,
      enabled,
      ready,
      status: ready ? (requiresEnabled ? "enabled" : "configured") : (configured ? "paused" : (templateJob ? "template-ready" : "missing-template")),
      selectedJobName: enabledJobs[0]?.jobName || configuredJobs[0]?.jobName || null,
      templateJob,
      expectedJob,
      jobs: sanitizedCandidates
    }
  })

  jobStatuses.forEach((jobStatus) => {
    requirements.push(buildRequirement(
      `job.${jobStatus.key}`,
      `${jobStatus.label} job`,
      jobStatus.ready,
      jobStatus.ready ? `Ready through job ${jobStatus.selectedJobName}.` : `Configure ${jobStatus.expectedJobName || jobStatus.templateJobName}.`
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
    productStores: [] as any[],
    company: {} as any,
    netSuiteProductStore: null as any,
    fetchStatus: {
      productStores: 'none',
      shopifyJobStatus: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getCurrent: (state) => state.current ? JSON.parse(JSON.stringify(state.current)) : {},
    getCurrentStoreSettings: (state) => state.currentStoreSettings,
    getCurrentFacilities: (state) => state.currentFacilities,
    getCurrentShopifyJobStatus: (state) => state.currentShopifyJobStatus,
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
      systemMessageRemoteId?: string
      activateJobs?: boolean
      inventoryResetAdditionalParameters?: Record<string, any>
      facilityGroupId?: string
      facilityTypeId?: string
      parentTypeId?: string
      productId?: string
    }) {
      const context = await fetchShopifySetupContext({
        productStoreId: payload.productStoreId,
        shopId: payload.shopId,
        systemMessageRemoteId: payload.systemMessageRemoteId,
        requireRemote: true
      })

      const additionalParameters = JSON.parse(normalizeJsonObjectText(payload.inventoryResetAdditionalParameters, {}))
      ;(["facilityGroupId", "facilityTypeId", "parentTypeId", "productId"] as const).forEach((parameterName) => {
        const parameterValue = valueText(payload[parameterName])
        if (parameterValue) additionalParameters[parameterName] = parameterValue
      })

      const resolvedShopId = valueText(context.shop.shopId)
      const inventoryResetJobName = `resetShopifyInventoryQoh_${resolvedShopId}`
      const configuredJobs = [
        await ensureServiceJobFromTemplate("resetShopifyInventoryQoh", inventoryResetJobName, payload.activateJobs)
      ]

      await storeServiceJobParameter(inventoryResetJobName, "systemMessageTypeId", "ResetInventoryQoh")
      await storeServiceJobParameter(inventoryResetJobName, "systemMessageRemoteId", context.remote.systemMessageRemoteId)
      await storeServiceJobParameter(inventoryResetJobName, "runAsBatch", "true")
      await storeServiceJobParameter(inventoryResetJobName, "additionalParameters", JSON.stringify(additionalParameters))

      const shopifyJobsStatus = await this.fetchProductStoreShopifyJobStatus(payload.productStoreId)
      if (shopifyJobsStatus) {
        this.currentShopifyJobStatus = shopifyJobsStatus
      }
      return buildSuccessResponse({ configuredJobs, shopifyJobsStatus })
    },

    async setupProductStoreShopifyProductImport(payload: {
      productStoreId: string
      shopId?: string
      productIdentifierEnumId?: string
      activateJobs?: boolean
    }) {
      const context = await fetchShopifySetupContext({
        productStoreId: payload.productStoreId,
        shopId: payload.shopId
      })

      const resolvedShopId = valueText(context.shop.shopId)
      const resolvedIdentifier = valueText(payload.productIdentifierEnumId || context.productStore.productIdentifierEnumId)
      if (!resolvedIdentifier) {
        throw new Error(`ProductStore [${payload.productStoreId}] must have productIdentifierEnumId before configuring Shopify product import.`)
      }

      const productImportJobName = `sync_ShopifyProductUpdates_${resolvedShopId}`
      const configuredJobs = [
        await ensureServiceJobFromTemplate("sync_ShopifyProductUpdates", productImportJobName, payload.activateJobs),
        await ensureServiceJobFromTemplate("send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery", "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery", payload.activateJobs),
        await ensureServiceJobFromTemplate("poll_ShopifyBulkOperationResult", "poll_ShopifyBulkOperationResult", payload.activateJobs)
      ]

      await storeServiceJobParameter(productImportJobName, "shopId", resolvedShopId)
      await storeServiceJobParameter(productImportJobName, "productStoreIds", payload.productStoreId)
      await storeServiceJobParameter(productImportJobName, "shopifyProductIdentifier", resolvedIdentifier)

      const shopifyJobsStatus = await this.fetchProductStoreShopifyJobStatus(payload.productStoreId)
      if (shopifyJobsStatus) {
        this.currentShopifyJobStatus = shopifyJobsStatus
      }
      return buildSuccessResponse({ configuredJobs, shopifyJobsStatus })
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
      systemMessageRemoteId?: string
      activateJobs?: boolean
      orderImportAdditionalParameters?: Record<string, any> | string
      windowDays?: number
    }) {
      const context = await fetchShopifySetupContext({
        productStoreId: payload.productStoreId,
        shopId: payload.shopId,
        systemMessageRemoteId: payload.systemMessageRemoteId,
        requireRemote: true
      })

      const resolvedShopId = valueText(context.shop.shopId)
      const orderImportJobName = `queue_ShopifyOrderSync_${resolvedShopId}`
      const orderHistoryJobName = `sync_ShopifyOrderHistory_${resolvedShopId}`
      const additionalParameters = normalizeJsonObjectText(payload.orderImportAdditionalParameters, { thruDateBuffer: 1 })
      const windowDays = payload.windowDays || 7
      const configuredJobs = [
        await ensureServiceJobFromTemplate("queue_ShopifyOrderSync", orderImportJobName, payload.activateJobs),
        await ensureServiceJobFromTemplate("sync_ShopifyOrderHistory", orderHistoryJobName, payload.activateJobs)
      ]

      await storeServiceJobParameter(orderImportJobName, "systemMessageTypeId", "ShopifyOrderSync")
      await storeServiceJobParameter(orderImportJobName, "systemMessageRemoteId", context.remote.systemMessageRemoteId)
      await storeServiceJobParameter(orderImportJobName, "runAsBatch", "true")
      await storeServiceJobParameter(orderImportJobName, "additionalParameters", additionalParameters)

      await storeServiceJobParameter(orderHistoryJobName, "systemMessageTypeId", "BulkOrderHistoryQuery")
      await storeServiceJobParameter(orderHistoryJobName, "systemMessageRemoteId", context.remote.systemMessageRemoteId)
      await storeServiceJobParameter(orderHistoryJobName, "windowDays", windowDays)

      const shopifyJobsStatus = await this.fetchProductStoreShopifyJobStatus(payload.productStoreId)
      if (shopifyJobsStatus) {
        this.currentShopifyJobStatus = shopifyJobsStatus
      }
      return buildSuccessResponse({ configuredJobs, shopifyJobsStatus })
    },

    async setupProductStoreShopifyRealtimeOrderImport(payload: {
      productStoreId: string
      queueName: string
      awsRemoteId?: string
      expireLockTime?: number
      activateJobs?: boolean
    }) {
      const productStoreResp = await requireApiResponse({
        url: `admin/productStores/${payload.productStoreId}`,
        method: "get"
      })
      if (!productStoreResp.data?.productStoreId) {
        throw new Error(`ProductStore [${payload.productStoreId}] not found.`)
      }

      const queueName = valueText(payload.queueName)
      if (!queueName) throw new Error("queueName is required.")

      const awsRemoteId = valueText(payload.awsRemoteId) || "AWS_CONFIG"
      const remotesResp = await requireApiResponse({
        url: "oms/systemMessageRemotes",
        method: "get",
        params: { pageSize: 500 }
      })
      const awsRemote = getResponseList(remotesResp.data, ["systemMessageRemoteList"]).find((remote: any) => {
        return valueText(remote.systemMessageRemoteId) === awsRemoteId
      })
      if (!awsRemote) {
        throw new Error(`SystemMessageRemote [${awsRemoteId}] not found. Configure the AWS SQS remote before enabling realtime order import.`)
      }

      const realtimeJobName = "consume_ShopifyOrders_SQS"
      const realtimeJob = await fetchServiceJob(realtimeJobName)
      if (!realtimeJob?.jobName) throw new Error(`ServiceJob [${realtimeJobName}] not found.`)

      const jobUpdateParameters: Record<string, any> = {
        expireLockTime: payload.expireLockTime || 10
      }
      if (isTruthy(payload.activateJobs)) jobUpdateParameters.paused = "N"
      await updateServiceJob(realtimeJobName, jobUpdateParameters)
      await storeServiceJobParameter(realtimeJobName, "queueName", queueName)
      await storeServiceJobParameter(realtimeJobName, "systemMessageRemoteId", awsRemoteId)

      const configuredJobs = [{
        jobName: realtimeJobName,
        templateJobName: realtimeJobName,
        created: false,
        activated: isTruthy(payload.activateJobs)
      }]
      const shopifyJobsStatus = await this.fetchProductStoreShopifyJobStatus(payload.productStoreId)
      if (shopifyJobsStatus) {
        this.currentShopifyJobStatus = shopifyJobsStatus
      }
      return buildSuccessResponse({ configuredJobs, shopifyJobsStatus })
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
