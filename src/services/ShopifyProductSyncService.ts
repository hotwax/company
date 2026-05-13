import api from "@/api";
import logger from "@/logger";
import { parseDateTimeValue } from "@/utils";

export interface ShopifyProductSyncSetupState {
  hasLinkedOmsProducts: boolean;
  productStoreLocked: boolean;
  identifierLocked: boolean;
  selectedProductStoreId: string;
  selectedIdentifierEnumId: string;
  shopifyAccessState?: ShopifyProductSyncAccessState;
  syncJobId?: string;
  completed?: boolean;
}

export interface ShopifyProductSyncAccessState {
  systemMessageRemoteId: string;
  accessScopeEnumId: string;
  hasWriteAccess: boolean;
  status: "write" | "read-only" | "unavailable" | "update-required";
  label: string;
}

export interface ShopifyProductSyncReviewStats {
  shopifyProductCount: number;
  shopifyVariantCount: number;
  omsProductCount?: number;
  omsVariantCount?: number;
  linkedShopCount: number;
  loaded: boolean;
}

export interface ShopifyProductSyncPreflightResult {
  matched: number;
  sampled: number;
  status: "matched" | "warning" | "conflict";
  items: any[];
}

export interface ShopifyProductSyncProgressState {
  syncJobId: string;
  status: "queued" | "sent" | "running" | "waiting" | "completed" | "cancelled" | "error";
  systemMessageState: string;
  completed: boolean;
  bulkOperationId?: string;
  bulkOperationStatus?: string;
  objectCount?: number;
  rootObjectCount?: number;
  queuedJobsAhead?: number;
}

export interface ShopifyShopProductCount {
  count: number;
  lastSyncedAt?: string;
}

export interface ShopifyProductUpdateSyncRunState {
  latestSystemMessage?: any;
  latestConfirmedSystemMessage?: any;
  latestConsumedSystemMessage?: any;
  lastSyncedAt?: string;
  systemMessageRemoteId: string;
  systemMessages?: any[];
}

export interface ShopifyPendingProductUpdateRequestsState {
  count: number;
  latestSystemMessage?: any;
}

export interface ShopifyProductSyncDashboardSummary {
  syncRunState: ShopifyProductUpdateSyncRunState;
  pendingRequests: ShopifyPendingProductUpdateRequestsState;
  runningOperation: ShopifyRunningBulkOperation | null;
  unsyncedUpdates: ShopifyShopProductCount;
  updateFilesToProcess: number;
}

export interface ShopifyRunningBulkOperation {
  id: string;
  status: string;
  type: string;
  createdAt: string;
  objectCount: number;
}

export interface ShopifyUnsyncedProductUpdate {
  id: string;
  legacyResourceId?: string;
  title: string;
  handle: string;
  updatedAt: string;
  vendor: string;
  productType: string;
  status: string;
  totalInventory?: number;
  imageUrl?: string;
  imageAltText?: string;
  variantsCount: number;
}

export interface ShopifyProductSyncProductSearchResult {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  updatedAt: string;
  vendor: string;
  productType: string;
  status: string;
  totalInventory?: number;
  imageUrl?: string;
  imageAltText?: string;
  variantsCount: number;
  cursor: string;
}

export interface ShopifyProductSyncProductSearchState {
  products: ShopifyProductSyncProductSearchResult[];
  hasNextPage: boolean;
  endCursor: string;
}

export interface ShopifyProductSyncOnDemandResult {
  systemMessageId?: string;
  syncedProductId?: string[];
  missingProductId?: string[];
  failedProductId?: string[];
  rejectedProductId?: string[];
  acceptedCount?: number;
  syncedCount?: number;
  failedCount?: number;
  rejectedCount?: number;
}

export interface ShopifyProductSyncActionResult {
  jobOutput?: string;
  message?: string;
  systemMessageId?: string;
}

interface ShopifyGraphqlResponse {
  response?: any;
  data?: any;
  errors?: any[];
}

interface SystemMessagesResponse {
  systemMessages?: any[];
  systemMessagesCount?: number;
}

interface SystemMessageRemotesResponse {
  systemMessageRemoteList?: any[];
}

const PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID = "BulkQueryShopifyProductUpdates";
const SHOPIFY_NO_ACCESS_SCOPE_ENUM_ID = "SHOP_NO_ACCESS";
const SHOPIFY_LEGACY_READ_WRITE_ACCESS_SCOPE_ENUM_ID = "SHOP_RW_ACCESS";
const SHOPIFY_READ_WRITE_ACCESS_SCOPE_ENUM_ID = "SHOP_READ_WRITE_ACCESS";
const LIVE_CATALOG_COUNTS_QUERY = `
query WizardLiveCatalogCounts {
  productsCount {
    count
    precision
  }
  productVariantsCount {
    count
    precision
  }
}
`;

const RUNNING_BULK_OPERATIONS_QUERY = `
query RunningBulkOperations {
  bulkOperations(first: 1, query: "status:running operation_type:query", sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      status
      type
      createdAt
      objectCount
    }
  }
}
`;

function buildProductUpdatesCountQuery(fromDate?: string) {
  const filterQuery = fromDate ? `(query: "updated_at:>'${escapeGraphqlString(fromDate)}'")` : "";
  return `
query UnsyncedProductUpdatesCount {
  productsCount${filterQuery} {
    count
    precision
  }
}
`;
}

function buildProductUpdatesListQuery(fromDate?: string, first = 100) {
  const pageSize = Math.min(Math.max(Number(first) || 100, 1), 100);
  const filterQuery = fromDate ? `, query: "updated_at:>'${escapeGraphqlString(fromDate)}'"` : "";
  return `
query UnsyncedProductUpdates {
  products(first: ${pageSize}${filterQuery}, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id
      legacyResourceId
      title
      handle
      updatedAt
      vendor
      productType
      status
      totalInventory
      variantsCount {
        count
      }
      featuredMedia {
        ... on MediaImage {
          image {
            url
            altText
          }
        }
      }
    }
  }
}
`;
}

function buildProductSearchQuery(queryString: string, first = 20, after?: string) {
  const pageSize = Math.min(Math.max(Number(first) || 20, 1), 50);
  const afterQuery = after ? `, after: "${escapeGraphqlString(after)}"` : "";
  return `
query ProductSyncProductSearch {
  products(first: ${pageSize}, query: "${escapeGraphqlString(queryString)}", sortKey: TITLE${afterQuery}) {
    edges {
      cursor
      node {
        id
        legacyResourceId
        title
        handle
        updatedAt
        vendor
        productType
        status
        totalInventory
        variantsCount {
          count
        }
        featuredMedia {
          ... on MediaImage {
            image {
              url
              altText
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;
}

function buildProductByIdQuery(productGid: string) {
  return `
query ProductSyncProductById {
  product(id: "${escapeGraphqlString(productGid)}") {
    id
    legacyResourceId
    title
    handle
    updatedAt
    vendor
    productType
    status
    totalInventory
    variantsCount {
      count
    }
    featuredMedia {
      ... on MediaImage {
        image {
          url
          altText
        }
      }
    }
  }
}
`;
}

function getExactShopifyProductGid(queryString: string) {
  const normalizedQuery = queryString.trim();
  if (/^gid:\/\/shopify\/Product\/\d+$/.test(normalizedQuery)) {
    return normalizedQuery;
  }
  if (/^\d{8,}$/.test(normalizedQuery)) {
    return `gid://shopify/Product/${normalizedQuery}`;
  }
  return "";
}

function getShopifyProductLegacyId(productGid: string) {
  return productGid.split("/").pop() || "";
}

function mapShopifyProductNode(product: any, cursor = ""): ShopifyProductSyncProductSearchResult {
  return {
    id: product.id,
    legacyResourceId: String(product.legacyResourceId || ""),
    title: product.title,
    handle: product.handle,
    updatedAt: product.updatedAt,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    totalInventory: product.totalInventory,
    imageUrl: product.featuredMedia?.image?.url,
    imageAltText: product.featuredMedia?.image?.altText,
    variantsCount: Number(product.variantsCount?.count || 0),
    cursor
  };
}

export interface ShopifyProductSyncHistoryOperation {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  metricValue?: number | string;
  metricLabel?: string;
  actionLabel?: string;
  detailType: string;
}

export interface ShopifyProductSyncHistoryRun {
  id: string;
  systemMessageId: string;
  createdTime: string;
  bulkOperationStatus: string;
  bulkOperationStatusLabel: string;
  mdmStatus: string;
  mdmStatusLabel: string;
  bulkOperationId: string;
  objectCount: number;
  mdmImportId: string;
  totalRecordCount: number;
  failedRecordCount: number;
  operations: ShopifyProductSyncHistoryOperation[];
}

export interface ShopifyProductSyncRun {
  systemMessageId: string;
  systemMessage: {
    id?: string;
    statusId?: string;
    statusLabel?: string;
    statusColor?: string;
    errorText?: string;
    messageText?: string;
  };
  bulkOperation: {
    id?: string;
    status?: string;
    statusLabel?: string;
    statusColor?: string;
    objectCount?: number;
    rootObjectCount?: number;
    createdAt?: string;
    completedAt?: string;
    isStatusUnavailable?: boolean;
    query?: string;
  };
  mdmLog: {
    id?: string;
    statusId?: string;
    statusLabel?: string;
    statusColor?: string;
    startDate?: string;
    endDate?: string;
    finishDateTime?: string;
    createdDate?: string;
    createdStamp?: string;
    completedDate?: string;
    completedAt?: string;
    lastUpdatedStamp?: string;
    totalRecordCount?: number;
    failedRecordCount?: number;
    successRecordCount?: number;
    configId?: string;
    logContentId?: string;
    fileName?: string;
  };
  status: string;
  statusColor: string;
  completed: boolean;
}

export interface ShopifyProductSyncHistoryState {
  runs: ShopifyProductSyncHistoryRun[];
}

async function requestBackend<T>(request: any, context = "Shopify product sync backend request"): Promise<T> {
  try {
    const resp = await api(request) as any;
    if (typeof resp?.data === "undefined" || resp.data === null) {
      throw new Error(`${context} returned no response data.`);
    }
    return resp.data as T;
  } catch (error) {
    const details = getApiErrorDetails(error);
    throw new Error(`${context} failed${details ? ` (${details})` : ""}.`);
  }
}

function getApiErrorDetails(error: any): string {
  const status = error?.response?.status;
  const responseMessage = error?.response?.data?.message || error?.response?.data?.error;
  const message = responseMessage || error?.message || "";
  return [status ? `status ${status}` : "", message].filter(Boolean).join(": ");
}

function assertPlainObject(value: any, context: string): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} returned an invalid response shape.`);
  }
}

function assertBooleanField(value: any, fieldName: string, context: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${context} response must include boolean ${fieldName}.`);
  }
}

function assertStringField(value: any, fieldName: string, context: string) {
  if (typeof value !== "string") {
    throw new Error(`${context} response must include string ${fieldName}.`);
  }
}

function assertArrayField(value: any, fieldName: string, context: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${context} response must include array ${fieldName}.`);
  }
}

function validateSetupState(response: any): ShopifyProductSyncSetupState {
  const context = "Product sync setup state";
  assertPlainObject(response, context);
  assertBooleanField(response.hasLinkedOmsProducts, "hasLinkedOmsProducts", context);
  assertBooleanField(response.productStoreLocked, "productStoreLocked", context);
  assertBooleanField(response.identifierLocked, "identifierLocked", context);
  assertStringField(response.selectedProductStoreId, "selectedProductStoreId", context);
  assertStringField(response.selectedIdentifierEnumId, "selectedIdentifierEnumId", context);
  if (typeof response.syncJobId !== "undefined") assertStringField(response.syncJobId, "syncJobId", context);
  if (typeof response.completed !== "undefined") assertBooleanField(response.completed, "completed", context);
  return response as ShopifyProductSyncSetupState;
}

function validateProductStoreContext(response: any): any {
  const context = "Product sync product store context";
  assertPlainObject(response, context);
  assertArrayField(response.relatedShops, "relatedShops", context);
  return response;
}

function buildProductStoreContext(payload: any): any {
  const context = "Product sync product store context";
  assertStringField(payload?.productStoreId, "productStoreId", context);
  assertArrayField(payload?.shops, "shops", context);

  return validateProductStoreContext({
    relatedShops: payload.shops.filter((shop: any) => shop?.productStoreId === payload.productStoreId)
  });
}


function getRequiredCount(payload: any, key: string, context: string): number {
  const value = payload?.[key]?.count ?? payload?.response?.[key]?.count ?? payload?.data?.[key]?.count;
  if (typeof value === "undefined" || value === null || Number.isNaN(Number(value))) {
    throw new Error(`${context} response is missing ${key}.count.`);
  }
  return Number(value);
}

function escapeGraphqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getTimestampValue(value: any): number {
  return parseDateTimeValue(value)?.toMillis() || 0;
}

function getTimestampDate(value: any): string | undefined {
  return parseDateTimeValue(value)?.toISO() || undefined;
}

function getEntityValueList(response: any, context: string): any[] {
  if (Array.isArray(response?.entityValueList)) return response.entityValueList;
  if (Number(response?.entityValueListCount || 0) === 0) return [];
  throw new Error(`${context} response must include array entityValueList.`);
}

function resolveSystemMessageRemoteId(payload: any): string {
  if (typeof payload === "string") return payload;
  return payload.systemMessageRemoteId ||
    payload.shop?.systemMessageRemoteId ||
    payload.shopId ||
    "";
}

function getShopRemoteCandidates(systemMessageRemoteList: any[], payload: any) {
  const shopifyShopId = String(payload.shopifyShopId || payload.shop?.shopifyShopId || "");
  const shopId = String(payload.shopId || payload.shop?.shopId || "");

  return (systemMessageRemoteList || []).filter((remote: any) => {
    const remoteMatchesShopifyShop = shopifyShopId && String(remote.remoteId) === shopifyShopId;
    const internalMatchesShop = shopId && String(remote.internalId) === shopId;
    return remoteMatchesShopifyShop && (!shopId || !remote.internalId || internalMatchesShop);
  });
}

function sortShopRemoteCandidates(candidates: any[]) {
  return [...candidates].sort((first: any, second: any) => {
    const firstReadWrite = String(first.accessScopeEnumId || "").includes("READ_WRITE") ? 1 : 0;
    const secondReadWrite = String(second.accessScopeEnumId || "").includes("READ_WRITE") ? 1 : 0;
    return secondReadWrite - firstReadWrite;
  });
}

function hasShopifyWriteAccess(accessScopeEnumId: string) {
  const normalizedScope = String(accessScopeEnumId || "").trim().toUpperCase();
  return normalizedScope === SHOPIFY_READ_WRITE_ACCESS_SCOPE_ENUM_ID;
}

function getShopifyAccessStateFromCandidate(candidate: any): ShopifyProductSyncAccessState {
  const accessScopeEnumId = String(candidate?.accessScopeEnumId || "").trim();
  const hasWriteAccess = hasShopifyWriteAccess(accessScopeEnumId);

  if (!candidate?.systemMessageRemoteId) {
    return {
      systemMessageRemoteId: "",
      accessScopeEnumId: "",
      hasWriteAccess: false,
      status: "unavailable",
      label: "Unavailable"
    };
  }

  return {
    systemMessageRemoteId: String(candidate.systemMessageRemoteId || "").trim(),
    accessScopeEnumId,
    hasWriteAccess,
    status: hasWriteAccess ? "write" : (
      accessScopeEnumId === SHOPIFY_LEGACY_READ_WRITE_ACCESS_SCOPE_ENUM_ID ? "update-required" :
        accessScopeEnumId === SHOPIFY_NO_ACCESS_SCOPE_ENUM_ID ? "unavailable" : "read-only"
    ),
    label: hasWriteAccess ? "Write access" : (
      accessScopeEnumId === SHOPIFY_LEGACY_READ_WRITE_ACCESS_SCOPE_ENUM_ID ? "Update required" :
        accessScopeEnumId === SHOPIFY_NO_ACCESS_SCOPE_ENUM_ID ? "Unavailable" : "Read only"
    )
  };
}

async function fetchShopRemoteCandidates(payload: any) {
  const response = await requestBackend<SystemMessageRemotesResponse>({
    url: "oms/systemMessageRemotes",
    method: "get"
  });

  return sortShopRemoteCandidates(getShopRemoteCandidates(response?.systemMessageRemoteList || [], payload));
}

const fetchShopSystemMessageRemoteId = async (payload: any): Promise<any> => {
  const shopifyShopId = payload.shopifyShopId || payload.shop?.shopifyShopId;
  if (!shopifyShopId) {
    throw new Error("Shopify shop id is required to resolve SystemMessageRemote.remoteId.");
  }

  const candidates = await fetchShopRemoteCandidates(payload);
  if (!candidates.length) {
    throw new Error(`No SystemMessageRemote found with remoteId ${shopifyShopId}.`);
  }

  if (payload.returnAllSystemMessageRemoteIds) {
    return candidates
      .map((candidate: any) => String(candidate.systemMessageRemoteId || "").trim())
      .filter((systemMessageRemoteId: string, index: number, list: string[]) => {
        return systemMessageRemoteId && list.indexOf(systemMessageRemoteId) === index;
      });
  }

  // Extract unique remote IDs from candidates
  const remoteIds = candidates
    .map((candidate: any) => candidate.systemMessageRemoteId)
    .filter((id: string, index: number, self: any[]) => id && self.indexOf(id) === index);

  if (!remoteIds.length) return candidates[0]?.systemMessageRemoteId;

  try {
    const response = await requestBackend<SystemMessagesResponse>({
      url: "admin/systemMessages",
      method: "get",
      params: {
        systemMessageTypeId: PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID,
        systemMessageRemoteId: remoteIds,
        systemMessageRemoteId_op: "in",
        pageSize: remoteIds.length
      }
    });

    const validRemoteIds = new Set(response?.systemMessages?.map((msg: any) => msg.systemMessageRemoteId));
    // Pick the first remoteId from the original candidates list that is valid
    const firstValid = remoteIds.find(id => validRemoteIds.has(id));

    if (firstValid) {
      return firstValid;
    }
  } catch (e) {
    logger.error("Failed to resolve system message remote IDs in bulk", e);
  }

  return candidates[0].systemMessageRemoteId;
};

const fetchShopifyAccessState = async (payload: any): Promise<ShopifyProductSyncAccessState> => {
  const shopifyShopId = payload.shopifyShopId || payload.shop?.shopifyShopId;
  if (!shopifyShopId) {
    throw new Error("Shopify shop id is required to resolve Shopify access scope.");
  }

  const candidates = await fetchShopRemoteCandidates(payload);
  if (!candidates.length) {
    return {
      systemMessageRemoteId: "",
      accessScopeEnumId: "",
      hasWriteAccess: false,
      status: "unavailable",
      label: "Unavailable"
    };
  }

  return getShopifyAccessStateFromCandidate(candidates[0]);
};


const getSystemMessageRank = (systemMessage: any) => {
  const statusId = String(systemMessage?.statusId || "").toLowerCase();
  const logStatusId = String(systemMessage?.logStatusId || "").toLowerCase();
  const logId = systemMessage?.logId;

  // Terminal status: 
  // 1. mdm logId is present AND its statusId is DmlsFinished or DmlsError
  // 2. mdm logId is NOT present AND statusId is SmsgConsumed (handles empty Shopify runs)
  const isTerminal = (logId && (logStatusId === "dmlsfinished" || logStatusId === "dmlserror")) ||
                     (!logId && (statusId === "smsgconsumed" || statusId === "consumed"));

  if (isTerminal) {
    return 1;
  }

  // Any other case is considered "In Progress" and gets a higher rank (>= 2)
  if (logStatusId === "dmlsrunning") return 5;
  if (logStatusId === "dmlspending" || statusId === "smsgconsumed" || statusId === "consumed") return 4.5;
  if (statusId === "smsgreceived") return 3.5;
  if (statusId === "msgsent" || statusId === "smsgsent" || statusId === "sent") return 3;
  if (statusId === "msgproduced" || statusId === "smsgproduced" || statusId === "produced") return 2.5;

  // Default for any unknown in-progress status
  return 0;
};

function getLatestSystemMessage(systemMessages: any[]) {
  return systemMessages.reduce((latest: any, current: any) => {
    if (!latest) return current;

    const latestRank = getSystemMessageRank(latest);
    const currentRank = getSystemMessageRank(current);

    if (currentRank > latestRank) {
      return current;
    }
    if (currentRank < latestRank) {
      return latest;
    }

    const currentTimestamp = getTimestampValue(current.lastUpdatedStamp);
    const latestTimestamp = getTimestampValue(latest.lastUpdatedStamp);

    if (currentTimestamp > latestTimestamp) {
      return current;
    }
    return latest;
  }, undefined);
}

const fetchProductUpdateSyncRunState = async (payload: any): Promise<ShopifyProductUpdateSyncRunState> => {
  const systemMessageRemoteId = typeof payload === "string" ? payload : resolveSystemMessageRemoteId(payload);
  const shopId = payload.shopId || payload.shop?.shopId;
  if (!shopId) {
    throw new Error("Shop ID is required to find product update sync system messages.");
  }

  const systemMessageId = payload.systemMessageId;
  const pageSize = systemMessageId ? 1 : 100;
  
  const response = await requestBackend<any>({
    url: "oms/dataDocumentView",
    method: "post",
    data: {
      dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
      customParametersMap: {
        systemMessageId,
        systemMessageTypeId: "BulkQueryShopifyProductUpdates",
        remoteInternalId: shopId,
        remoteInternalIdType: "HOTWAX_SHOP_ID",
        orderByField: "-lastUpdatedStamp"
      },
      pageSize,
      pageIndex: 0
    }
  });

  const systemMessages = getEntityValueList(response, "Product sync system message history");

  const confirmedMessages = systemMessages.filter((systemMessage: any) => systemMessage.statusId === "SmsgConfirmed" || systemMessage.statusId === "SmsgConsumed");
  const consumedMessages = systemMessages.filter((systemMessage: any) => {
    const statusId = String(systemMessage.statusId || "").toLowerCase();
    const isConsumed = statusId === "smsgconsumed" || statusId === "consumed" || statusId === "smsgconfirmed" || statusId === "confirmed";
    return isConsumed && systemMessage.logId;
  });
  const latestConfirmedSystemMessage = getLatestSystemMessage(confirmedMessages);
  const latestConsumedSystemMessage = getLatestSystemMessage(consumedMessages);
  const latestSystemMessage = getLatestSystemMessage(systemMessages);
  

  return {
    latestSystemMessage,
    latestConfirmedSystemMessage,
    latestConsumedSystemMessage,
    lastSyncedAt: getTimestampDate(latestConsumedSystemMessage?.initDate),
    systemMessageRemoteId,
    systemMessages
  };
};

const fetchPendingProductUpdateRequests = async (payload: any): Promise<ShopifyPendingProductUpdateRequestsState> => {
  const shopId = payload.shopId || payload.shop?.shopId;
  if (!shopId) {
    throw new Error("Shop ID is required to count pending product update requests.");
  }

  const response = await requestBackend<any>({
    url: "oms/dataDocumentView",
    method: "post",
    data: {
      dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
      customParametersMap: {
        systemMessageTypeId: "BulkQueryShopifyProductUpdates",
        remoteInternalId: shopId,
        remoteInternalIdType: "HOTWAX_SHOP_ID",
        statusId: "SmsgProduced"
      },
      pageSize: payload.pageSize || 1,
      pageIndex: 0,
      orderByField: "-initDate"
    }
  }, "Pending product update requests");

  return {
    count: Number(response?.entityValueListCount || 0),
    latestSystemMessage: response?.entityValueList?.[0]
  };
};

const fetchLiveCatalogCounts = async (payload: any): Promise<ShopifyProductSyncReviewStats> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch live catalog counts.");
  }

  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: LIVE_CATALOG_COUNTS_QUERY
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify live catalog count query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }

  return {
    shopifyProductCount: getRequiredCount(graphQlPayload, "productsCount", "Shopify live catalog count query"),
    shopifyVariantCount: getRequiredCount(graphQlPayload, "productVariantsCount", "Shopify live catalog count query"),
    linkedShopCount: payload.linkedShopCount || 0,
    loaded: true
  };
};

const fetchRunningBulkOperation = async (payload: any): Promise<ShopifyRunningBulkOperation | null> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch running bulk operations.");
  }

  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: RUNNING_BULK_OPERATIONS_QUERY
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify running bulk operation query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }

  const runningOperation = graphQlPayload?.bulkOperations?.nodes?.[0];
  if (!runningOperation) return null;

  return {
    id: runningOperation.id,
    status: runningOperation.status,
    type: runningOperation.type,
    createdAt: runningOperation.createdAt,
    objectCount: Number(runningOperation.objectCount || 0)
  }
}

const fetchSetupState = async (payload: any): Promise<ShopifyProductSyncSetupState> => {
  const [syncRunState, shopifyAccessState] = await Promise.all([
    fetchProductUpdateSyncRunState(payload),
    fetchShopifyAccessState(payload).catch(() => ({
      systemMessageRemoteId: "",
      accessScopeEnumId: "",
      hasWriteAccess: false,
      status: "unavailable",
      label: "Unavailable"
    } as ShopifyProductSyncAccessState))
  ]);

  const hasLinkedOmsProducts = !!syncRunState.latestSystemMessage;

  return validateSetupState({
    hasLinkedOmsProducts,
    shopifyAccessState,
    productStoreLocked: hasLinkedOmsProducts,
    identifierLocked: hasLinkedOmsProducts,
    selectedProductStoreId: payload.shop?.productStoreId || payload.productStore?.productStoreId || "",
    selectedIdentifierEnumId: payload.productStore?.productIdentifierEnumId || ""
  });
};

const fetchShopifyShopProductCount = async (payload: any): Promise<ShopifyShopProductCount> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch unsynced product update counts.");
  }

  const lastSyncedAt = payload.lastSyncedAt || payload.syncRunState?.lastSyncedAt ||
    (await fetchProductUpdateSyncRunState(payload)).lastSyncedAt;
  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductUpdatesCountQuery(lastSyncedAt)
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify unsynced product update count query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }

  return {
    count: getRequiredCount(graphQlPayload, "productsCount", "Shopify unsynced product update count query"),
    lastSyncedAt
  };
}

const fetchUnsyncedProductUpdates = async (payload: any): Promise<ShopifyUnsyncedProductUpdate[]> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch unsynced product updates.");
  }

  const lastSyncedAt = payload.lastSyncedAt || payload.syncRunState?.lastSyncedAt ||
    (await fetchProductUpdateSyncRunState(payload)).lastSyncedAt;
  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductUpdatesListQuery(lastSyncedAt, payload.pageSize || 100)
    }
  });

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify unsynced product update list query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }
  if (!Array.isArray(graphQlPayload?.products?.nodes)) {
    throw new Error("Shopify unsynced product update list query response is missing products.nodes.");
  }

  return graphQlPayload.products.nodes.map((product: any) => ({
    id: product.id,
    legacyResourceId: String(product.legacyResourceId || ""),
    title: product.title,
    handle: product.handle,
    updatedAt: product.updatedAt,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    totalInventory: product.totalInventory,
    imageUrl: product.featuredMedia?.image?.url,
    imageAltText: product.featuredMedia?.image?.altText,
    variantsCount: Number(product.variantsCount?.count || 0)
  }));
};

const fetchRecentlyUpdatedShopifyProducts = async (payload: any): Promise<ShopifyProductSyncProductSearchState> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch recently updated products.");
  }

  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductUpdatesListQuery(undefined, payload.pageSize || 15)
    }
  }, "Shopify recently updated products query");

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify recently updated products query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }
  if (!Array.isArray(graphQlPayload?.products?.nodes)) {
    throw new Error("Shopify recently updated products query response is missing products.nodes.");
  }

  return {
    products: graphQlPayload.products.nodes.map((product: any) => mapShopifyProductNode(product)),
    hasNextPage: false,
    endCursor: ""
  };
};

const searchShopifyProducts = async (payload: any): Promise<ShopifyProductSyncProductSearchState> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to search products.");
  }

  const queryString = String(payload.queryString || "").trim();
  if (!queryString) {
    return {
      products: [],
      hasNextPage: false,
      endCursor: ""
    };
  }

  const exactProductGid = !payload.after ? getExactShopifyProductGid(queryString) : "";
  if (exactProductGid) {
    const response = await requestBackend<ShopifyGraphqlResponse>({
      url: "shopify/graphql",
      method: "post",
      data: {
        systemMessageRemoteId,
        queryText: buildProductByIdQuery(exactProductGid)
      }
    }, "Shopify product ID lookup query");

    const graphQlPayload = response?.response || response?.data || response;
    if (response?.errors?.length || graphQlPayload?.errors?.length) {
      throw new Error(`Shopify product ID lookup query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
    }
    const productNode = graphQlPayload?.product || graphQlPayload?.data?.product || graphQlPayload?.response?.product || graphQlPayload?.response?.data?.product;
    if (productNode) {
      return {
        products: [mapShopifyProductNode(productNode)],
        hasNextPage: false,
        endCursor: ""
      };
    }
  }

  const searchQueryString = exactProductGid ? `id:${getShopifyProductLegacyId(exactProductGid)}` : queryString;
  const response = await requestBackend<ShopifyGraphqlResponse>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText: buildProductSearchQuery(searchQueryString, payload.pageSize || 20, payload.after)
    }
  }, "Shopify product search query");

  const graphQlPayload = response?.response || response?.data || response;
  if (response?.errors?.length || graphQlPayload?.errors?.length) {
    throw new Error(`Shopify product search query returned errors: ${JSON.stringify(response?.errors || graphQlPayload.errors)}`);
  }
  if (!Array.isArray(graphQlPayload?.products?.edges)) {
    throw new Error("Shopify product search query response is missing products.edges.");
  }

  return {
    products: graphQlPayload.products.edges.map((edge: any) => {
      return mapShopifyProductNode(edge.node || {}, edge.cursor);
    }),
    hasNextPage: !!graphQlPayload.products.pageInfo?.hasNextPage,
    endCursor: graphQlPayload.products.pageInfo?.endCursor || ""
  };
};

const syncShopifyProductsOnDemand = async (payload: any): Promise<ShopifyProductSyncOnDemandResult> => {
  if (!payload.shopId) {
    throw new Error("Shopify shop id is required to sync products on demand.");
  }
  if (!payload.shopifyProductId) {
    throw new Error("Shopify product id is required to sync products on demand.");
  }

  const data: any = {
    shopId: payload.shopId,
    shopifyProductId: payload.shopifyProductId
  };
  if (payload.namespace) data.namespace = payload.namespace;
  if (payload.additionalParameters) data.additionalParameters = payload.additionalParameters;

  return requestBackend<ShopifyProductSyncOnDemandResult>({
    url: "sob/shopify/syncShopifyProductsOnDemand",
    method: "post",
    data
  }, "Shopify product sync on demand endpoint");
};

const syncShopifyProducts = async (payload: any): Promise<ShopifyProductSyncOnDemandResult> => {
  if (!payload.shopId) {
    throw new Error("Shopify shop id is required to sync products.");
  }

  const data: any = {
    shopId: payload.shopId,
    includeAll: payload.includeAll || false
  };

  if (payload.fromDate) data.fromDate = payload.fromDate;
  if (payload.thruDate) data.thruDate = payload.thruDate;
  if (payload.namespace) data.namespace = payload.namespace;
  if (payload.filterQuery) data.filterQuery = payload.filterQuery;

  return requestBackend<ShopifyProductSyncOnDemandResult>({
    url: "shopify/products/sync",
    method: "post",
    data
  }, "Shopify product sync endpoint");
};

const sendShopifyBulkQueryMessage = async (payload: any): Promise<ShopifyProductSyncActionResult> => {
  const systemMessageRemoteId = String(payload?.systemMessageRemoteId || "").trim();
  const queryText = String(payload?.queryText || "").trim();

  if (!systemMessageRemoteId) {
    throw new Error("System message remote id is required to send a Shopify bulk query message.");
  }
  if (!queryText) {
    throw new Error("Query text is required to send a Shopify bulk query message.");
  }

  return requestBackend<ShopifyProductSyncActionResult>({
    url: "shopify/graphql",
    method: "post",
    data: {
      systemMessageRemoteId,
      queryText
    }
  }, "Shopify GraphQL send endpoint");
};

const pollBulkOperationResult = async (payload: any): Promise<ShopifyProductSyncActionResult> => {
  const parentSystemMessageTypeId = String(payload?.parentSystemMessageTypeId || "").trim();
  if (!parentSystemMessageTypeId) {
    throw new Error("Parent system message type id is required to poll a Shopify bulk operation result.");
  }

  return requestBackend<ShopifyProductSyncActionResult>({
    url: "shopify/bulk/result/poll",
    method: "post",
    data: {
      parentSystemMessageTypeId
    }
  }, "Shopify bulk result poll endpoint");
};

const cancelSystemMessage = async (systemMessageId: string): Promise<ShopifyProductSyncActionResult> => {
  if (!String(systemMessageId || "").trim()) {
    throw new Error("System message id is required to cancel a Shopify product sync message.");
  }

  return requestBackend<ShopifyProductSyncActionResult>({
    url: `admin/systemMessages/${encodeURIComponent(systemMessageId)}`,
    method: "put",
    data: {
      systemMessageId,
      statusId: "SmsgCancelled"
    }
  }, "System message status update endpoint");
};

const fetchProductStoreContext = async (payload: any): Promise<any> => {
  return buildProductStoreContext(payload);
};

const fetchReviewStats = async (payload: any): Promise<ShopifyProductSyncReviewStats> => {
  const stats = await fetchLiveCatalogCounts(payload);

  try {
    const omsProductResp = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "PRODUCT_STORE_PRODUCT",
        pageIndex: 0,
        pageSize: 1,
        customParametersMap: {
          productStoreId: payload.productStoreId,
          isVirtual: "Y"
        },
        fieldsToSelect: "productCount,productStoreId"
      }
    });

    const omsVariantResp = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "PRODUCT_STORE_PRODUCT",
        pageIndex: 0,
        pageSize: 1,
        customParametersMap: {
          productStoreId: payload.productStoreId,
          isVariant: "Y"
        },
        fieldsToSelect: "productCount,productStoreId"
      }
    });

    logger.info("Oms product and variant counts", { omsProductResp, omsVariantResp });

    stats.omsProductCount = omsProductResp?.entityValueList?.[0]?.productCount || 0;
    stats.omsVariantCount = omsVariantResp?.entityValueList?.[0]?.productCount || 0;
  } catch (error) {
    logger.warn("Failed to fetch OMS counts using dataDocumentView", error);
  }

  return stats;
};

const fetchPreflight = async (payload: any): Promise<any[]> => {
  const { systemMessageRemoteId, productStoreId, productIdentifierEnumId } = payload;
  
  try {
    const shopifyResp = await api({
      url: "shopify/graphql",
      method: "post",
      data: {
        systemMessageRemoteId,
        queryText: `
          query WizardVariantSample($first: Int!) {
            productVariants(first: $first) {
              nodes {
                id
                sku
                barcode
                legacyResourceId
              }
            }
          }
        `,
        variables: { first: 10 }
      }
    }) as any;

    const graphQlPayload = shopifyResp?.data;
    const shopifyVariants = graphQlPayload?.response?.productVariants?.nodes || [];
    if (shopifyVariants.length === 0) return [];

    const shopifyVariantIds = shopifyVariants.map((v: any) => v.legacyResourceId);

    const omsResp = await api({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "PRODUCT_STORE_PRODUCT",
        customParametersMap: {
          productStoreId,
          shopifyProductId: shopifyVariantIds
        },
        fieldsToSelect: "shopifyProductId,internalName"
      }
    }) as any;

    const omsProducts = omsResp?.data?.entityValueList || [];

    return shopifyVariants.map((v: any) => {
      const omsProduct = omsProducts.find((p: any) => p.shopifyProductId === v.legacyResourceId);
      
      let shopifyValue = "";
      switch (productIdentifierEnumId) {
        case "SHOPIFY_PRODUCT_SKU":
          shopifyValue = v.sku;
          break;
        case "SHOPIFY_BARCODE":
          shopifyValue = v.barcode;
          break;
        case "SHOPIFY_PRODUCT_ID":
          shopifyValue = v.legacyResourceId;
          break;
      }

      return {
        shopifyVariantId: v.id,
        shopifyProductId: v.legacyResourceId,
        shopifyValue,
        omsValue: omsProduct ? omsProduct.internalName : null,
        isMatched: omsProduct ? (omsProduct.internalName === shopifyValue) : false
      };
    });
  } catch (error) {
    logger.error("Failed to fetch preflight data", error);
    throw error;
  }
};


const fetchSyncJobConfig = async (payload: any): Promise<{ isConfigured: boolean; jobName: string }> => {
  const shopId = payload.shopId;
  
  try {
    const resp = await api({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "SERVICE_JOB_PARAMETER",
        pageIndex: 0,
        pageSize: 1,
        customParametersMap: {
          parameterName: "shopId",
          parameterValue: shopId,
          parentJobName: "sync_ShopifyProductUpdates"
        }
      }
    }) as any;

    const entityValueList = resp?.data?.entityValueList || [];
    if (entityValueList.length > 0) {
      return { isConfigured: true, jobName: entityValueList[0].jobName };
    }
  } catch (error) {
    logger.warn("Failed to fetch sync job config using dataDocumentView", error);
  }
  
  return { isConfigured: false, jobName: "" };
};

const configureSyncJob = async (payload: any): Promise<any> => {
  const { shopId, productStoreId, productIdentifierEnumId } = payload;
  const newJobName = `sync_ShopifyProductUpdates_${shopId}`;
  
  await api({
    url: "admin/serviceJobs/sync_ShopifyProductUpdates/clone",
    method: "POST",
    data: { newJobName }
  });

  const serviceJobParameters = [{
    parameterName: "shopId",
    parameterValue: shopId
  }];

  if (productStoreId) {
    serviceJobParameters.push({
      parameterName: "productStoreIds",
      parameterValue: productStoreId
    });
  }

  if (productIdentifierEnumId) {
    serviceJobParameters.push({
      parameterName: "shopifyProductIdentifier",
      parameterValue: productIdentifierEnumId
    });
  }

  return await api({
    url: `admin/serviceJobs/${newJobName}`,
    method: "PUT",
    data: {
      jobName: newJobName,
      paused: "Y",
      serviceJobParameters
    }
  });
};

const fetchErrorRecordCount = async (payload: any): Promise<number> => {
  const { shopId, configId } = payload;
  const finishDateTimeFrom = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago in ms

  try {
    const response = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "DATA_MANAGER_LOG_AND_PARAMETER",
        customParametersMap: {
          configId: configId || "SYNC_SHOPIFY_PRODUCT",
          parameterName: "shopId",
          parameterValue: shopId,
          failedRecordCount: 0,
          failedRecordCount_op: "equals",
          failedRecordCount_not: "true",
          finishDateTime_from: finishDateTimeFrom.toString()
        },
        fieldsToSelect: "failedRecordCount"
      }
    });

    return Number(response?.entityValueList?.[0]?.failedRecordCount || 0);
  } catch (error) {
    logger.warn("Failed to fetch error record count using dataDocumentView", error);
    return 0;
  }
};

const fetchUpdateFilesToProcessCount = async (payload: any): Promise<number> => {
  const { shopId, configId } = payload;
  try {
    const response = await requestBackend<any>({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "DATA_MANAGER_LOG_AND_PARAMETER",
        pageSize: 1,
        pageIndex: 0,
        customParametersMap: {
          configId: configId || "SYNC_SHOPIFY_PRODUCT",
          parameterName: "shopId",
          parameterValue: shopId,
          statusId: ["DmlSuccess", "DmlError", "DmlCancelled"],
          statusId_op: "not_in"
        }
      }
    });

    return Number(response?.entityValueListCount || 0);
  } catch (error: any) {
    logger.warn("Failed to fetch update files to process count using dataDocumentView", error);
    return 0;
  }
};

const fetchDashboardSummary = async (payload: any): Promise<ShopifyProductSyncDashboardSummary> => {
  const { systemMessageRemoteId } = payload;
  
  const [syncRunState, pendingRequests, runningOperation, updateFilesToProcess] = await Promise.all([
    fetchProductUpdateSyncRunState(payload).catch(e => { logger.error("Failed to fetch product update sync run state", e); return { systemMessages: [], lastSyncedAt: "" } as any }),
    fetchPendingProductUpdateRequests(payload).catch(e => { logger.error("Failed to fetch pending product update requests", e); return { count: 0 } as any }),
    fetchRunningBulkOperation(payload).catch(e => { logger.warn("Failed to fetch running bulk operation (likely GraphQL error)", e); return null }),
    fetchUpdateFilesToProcessCount(payload).catch(e => { logger.error("Failed to fetch update files to process count", e); return 0 })
  ]);

  let unsyncedUpdates = { count: 0, products: [] } as any;
  try {
    unsyncedUpdates = await fetchShopifyShopProductCount({
      ...payload,
      systemMessageRemoteId,
      syncRunState
    });
  } catch (error) {
    logger.warn("Failed to fetch unsynced product updates (likely GraphQL error)", error);
  }

  return {
    syncRunState,
    pendingRequests,
    runningOperation,
    unsyncedUpdates,
    updateFilesToProcess
  };
};

const fetchWebhookSubscriptions = async (payload: any): Promise<any> => {
  const response = await requestBackend<any>({
    url: "shopify/webhook-subscription",
    method: "get",
    params: {
      systemMessageRemoteId: payload.systemMessageRemoteId,
      queryParams: {
        topics: payload.topic
      }
    }
  });

  return response?.webhookList || [];
}

const subscribeWebhook = async (payload: any): Promise<any> => {
  return await requestBackend<any>({
    url: "shopify/webhook-subscription",
    method: "post",
    data: {
      systemMessageRemoteId: payload.systemMessageRemoteId,
      topic: payload.topic
    }
  });
};

const unsubscribeWebhook = async (payload: any): Promise<any> => {
  return await requestBackend<any>({
    url: "shopify/webhook-subscription",
    method: "delete",
    data: {
      systemMessageRemoteId: payload.systemMessageRemoteId,
      webhookSubscriptionId: payload.webhookSubscriptionId
    }
  });
};

export const ShopifyProductSyncService = {
  fetchShopifyAccessState,
  fetchDashboardSummary,
  fetchShopSystemMessageRemoteId,
  fetchProductUpdateSyncRunState,
  fetchPendingProductUpdateRequests,
  fetchRunningBulkOperation,
  fetchShopifyShopProductCount,
  fetchRecentlyUpdatedShopifyProducts,
  fetchUnsyncedProductUpdates,
  searchShopifyProducts,
  syncShopifyProductsOnDemand,
  syncShopifyProducts,
  sendShopifyBulkQueryMessage,
  pollBulkOperationResult,
  cancelSystemMessage,
  fetchSetupState,
  fetchProductStoreContext,
  fetchReviewStats,
  fetchPreflight,
  fetchSyncJobConfig,
  configureSyncJob,
  fetchErrorRecordCount,
  fetchUpdateFilesToProcessCount,
  fetchWebhookSubscriptions,
  subscribeWebhook,
  unsubscribeWebhook
};
