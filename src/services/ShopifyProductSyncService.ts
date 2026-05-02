import api from "@/api";
import logger from "@/logger";

export interface ShopifyProductSyncSetupState {
  productUpdateHistory?: any[];
  hasLinkedOmsProducts: boolean;
  productStoreLocked: boolean;
  identifierLocked: boolean;
  selectedProductStoreId: string;
  selectedIdentifierEnumId: string;
  syncJobId?: string;
  completed?: boolean;
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
  syncedProductId?: string[];
  missingProductId?: string[];
  failedProductId?: string[];
  rejectedProductId?: string[];
  acceptedCount?: number;
  syncedCount?: number;
  failedCount?: number;
  rejectedCount?: number;
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

interface ProductUpdateHistoryResponse {
  productUpdateHistory?: any[];
  productUpdateHistories?: any[];
}

const PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID = "BulkQueryShopifyProductUpdates";
const PRODUCT_SYNC_PROGRESS_STATUSES = ["queued", "sent", "running", "waiting", "completed", "cancelled", "error"];

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
  };
  bulkOperation: {
    id?: string;
    status?: string;
    statusLabel?: string;
    statusColor?: string;
    objectCount?: number;
    rootObjectCount?: number;
    query?: string;
  };
  mdmLog: {
    id?: string;
    statusId?: string;
    statusLabel?: string;
    statusColor?: string;
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

function getProductUpdateHistoryRecords(response: any): any[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.productUpdateHistory)) return response.productUpdateHistory;
  if (Array.isArray(response?.productUpdateHistories)) return response.productUpdateHistories;
  throw new Error("Product update history response must include productUpdateHistory records.");
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

function validateProgress(response: any, requestedSyncJobId?: string): ShopifyProductSyncProgressState {
  const context = "Product sync progress";
  assertPlainObject(response, context);
  assertStringField(response.syncJobId, "syncJobId", context);
  assertStringField(response.status, "status", context);
  if (!PRODUCT_SYNC_PROGRESS_STATUSES.includes(response.status)) {
    throw new Error(`${context} response returned unsupported status ${response.status}.`);
  }
  assertStringField(response.systemMessageState, "systemMessageState", context);
  assertBooleanField(response.completed, "completed", context);
  if (requestedSyncJobId && response.syncJobId !== requestedSyncJobId) {
    throw new Error(`${context} response returned syncJobId ${response.syncJobId} for requested syncJobId ${requestedSyncJobId}.`);
  }
  return response as ShopifyProductSyncProgressState;
}

function validateInitialImport(response: any): any {
  const context = "Product sync initial import";
  assertPlainObject(response, context);
  const syncJobId = response.syncJobId || response.progress?.syncJobId;
  assertStringField(syncJobId, "syncJobId", context);
  if (typeof response.success !== "undefined" && response.success !== true) {
    throw new Error(`${context} response did not confirm success.`);
  }
  if (typeof response.progress !== "undefined") {
    validateProgress(response.progress, syncJobId);
  }
  return {
    ...response,
    syncJobId
  };
}

function validateReconcile(response: any): any {
  const context = "Product sync reconcile";
  assertPlainObject(response, context);
  assertBooleanField(response.completed, "completed", context);
  return response;
}

function validateHistory(response: any): ShopifyProductSyncHistoryState {
  const context = "Product sync history";
  assertPlainObject(response, context);
  assertArrayField(response.runs, "runs", context);
  return response as ShopifyProductSyncHistoryState;
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
  if (!value) return 0;
  if (typeof value === "number") return value;
  const timestamp = Number(value);
  if (!Number.isNaN(timestamp)) return timestamp;
  const parsedDate = new Date(value).getTime();
  return Number.isNaN(parsedDate) ? 0 : parsedDate;
}

function getTimestampDate(value: any): string | undefined {
  const timestamp = getTimestampValue(value);
  if (!timestamp) return undefined;
  if (typeof value === "number") return new Date(value).toISOString();
  if (!Number.isNaN(Number(value))) return new Date(timestamp).toISOString();
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString();
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

const fetchShopSystemMessageRemoteId = async (payload: any): Promise<any> => {
  const shopifyShopId = payload.shopifyShopId || payload.shop?.shopifyShopId;
  if (!shopifyShopId) {
    throw new Error("Shopify shop id is required to resolve SystemMessageRemote.remoteId.");
  }

  const response = await requestBackend<SystemMessageRemotesResponse>({
    url: "oms/systemMessageRemotes",
    method: "get"
  });

  const candidates = sortShopRemoteCandidates(getShopRemoteCandidates(response?.systemMessageRemoteList || [], payload));
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

  // Check candidates in parallel, pick first valid one, otherwise fallback to first
  const validRemoteIdPromises = candidates.map(async (candidate: any) => {
    try {
      const systemMessagesResponse = await requestBackend<SystemMessagesResponse>({
        url: "admin/systemMessages",
        method: "get",
        params: {
          systemMessageTypeId: PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID,
          systemMessageRemoteId: candidate.systemMessageRemoteId,
          pageSize: 1,
          pageIndex: 0
        }
      });
      if (Number(systemMessagesResponse?.systemMessagesCount || 0) > 0) {
        return candidate.systemMessageRemoteId;
      }
    } catch (e) {
      // Ignore errors for this check and continue
    }
    return null;
  });

  const results = await Promise.all(validRemoteIdPromises);
  const firstValid = results.find(id => id !== null);

  if (firstValid) {
    return firstValid;
  }

  return candidates[0].systemMessageRemoteId;
};

function getLatestSystemMessage(systemMessages: any[], dateFields: string[]) {
  return systemMessages.reduce((latest: any, systemMessage: any) => {
    const systemMessageTimestamp = dateFields.reduce((timestamp, field) => {
      return timestamp || getTimestampValue(systemMessage?.[field]);
    }, 0);
    const latestTimestamp = dateFields.reduce((timestamp, field) => {
      return timestamp || getTimestampValue(latest?.[field]);
    }, 0);

    return systemMessageTimestamp > latestTimestamp ? systemMessage : latest;
  }, undefined);
}

const fetchProductUpdateSyncRunState = async (payload: any): Promise<ShopifyProductUpdateSyncRunState> => {
  const systemMessageRemoteId = typeof payload === "string" ? payload : resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to find product update sync system messages.");
  }

  const pageSize = 1000;
  let pageIndex = 0;
  let systemMessages: any[] = [];
  let totalCount = pageSize;

  while (systemMessages.length < totalCount) {
    const response = await requestBackend<SystemMessagesResponse>({
      url: "admin/systemMessages",
      method: "get",
      params: {
        systemMessageTypeId: PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID,
        systemMessageRemoteId,
        pageSize,
        pageIndex
      }
    });
    const page = response?.systemMessages || [];
    systemMessages = systemMessages.concat(page);
    totalCount = Number(response?.systemMessagesCount || systemMessages.length);
    if (!page.length) break;
    pageIndex += 1;
  }

  const confirmedMessages = systemMessages.filter((systemMessage: any) => systemMessage.statusId === "SmsgConfirmed");
  const consumedMessages = systemMessages.filter((systemMessage: any) => {
    const statusId = String(systemMessage.statusId || "").toLowerCase();
    return statusId === "smsgconsumed" || statusId === "consumed" || statusId === "smsgconfirmed" || statusId === "confirmed";
  });
  const latestConfirmedSystemMessage = getLatestSystemMessage(confirmedMessages, ["processedDate", "lastUpdatedStamp", "initDate"]);
  const latestConsumedSystemMessage = getLatestSystemMessage(consumedMessages, ["initDate", "lastUpdatedStamp", "processedDate"]);
  const latestSystemMessage = getLatestSystemMessage(systemMessages, ["initDate", "lastUpdatedStamp", "processedDate"]);

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
  const systemMessageRemoteId = typeof payload === "string" ? payload : resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to count pending product update requests.");
  }

  const response = await requestBackend<SystemMessagesResponse>({
    url: "admin/systemMessages",
    method: "get",
    params: {
      systemMessageTypeId: PRODUCT_UPDATE_SYNC_MESSAGE_TYPE_ID,
      systemMessageRemoteId,
      statusId: "SmsgProduced",
      pageSize: payload.pageSize || 1,
      pageIndex: 0,
      orderBy: "-initDate"
    }
  }, "Pending product update requests");

  return {
    count: Number(response?.systemMessagesCount || 0),
    latestSystemMessage: response?.systemMessages?.[0]
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
  };
};

const fetchSetupState = async (payload: any): Promise<ShopifyProductSyncSetupState> => {
  const pageSize = payload.historyPageSize || 1;
  const productUpdateHistory = getProductUpdateHistoryRecords(await requestBackend<ProductUpdateHistoryResponse | any[]>({
    url: "oms/productUpdateHistory",
    method: "get",
    params: {
      shopId: payload.shopId,
      pageSize,
      orderByField: "-lastUpdatedStamp"
    }
  }, "Shopify product update history endpoint"));
  const hasLinkedOmsProducts = productUpdateHistory.length > 0;

  return validateSetupState({
    productUpdateHistory,
    hasLinkedOmsProducts,
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

  const lastSyncedAt = payload.lastSyncedAt || (await fetchProductUpdateSyncRunState(systemMessageRemoteId)).lastSyncedAt;
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
};

const fetchUnsyncedProductUpdates = async (payload: any): Promise<ShopifyUnsyncedProductUpdate[]> => {
  const systemMessageRemoteId = resolveSystemMessageRemoteId(payload);
  if (!systemMessageRemoteId) {
    throw new Error("Shopify systemMessageRemoteId is required to fetch unsynced product updates.");
  }

  const lastSyncedAt = payload.lastSyncedAt || (await fetchProductUpdateSyncRunState(systemMessageRemoteId)).lastSyncedAt;
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
  const shopifyProductIds = (payload.shopifyProductIds || [])
    .map((shopifyProductId: any) => String(shopifyProductId || "").trim())
    .filter((shopifyProductId: string, index: number, list: string[]) => shopifyProductId && list.indexOf(shopifyProductId) === index);

  if (!payload.shopId) {
    throw new Error("Shopify shop id is required to sync selected products.");
  }
  if (!shopifyProductIds.length) {
    throw new Error("Select at least one Shopify product to sync.");
  }

  const data: any = {
    shopId: payload.shopId,
    shopifyProductId: shopifyProductIds
  };
  if (payload.namespace) data.namespace = payload.namespace;
  if (payload.additionalParameters) data.additionalParameters = payload.additionalParameters;

  return requestBackend<ShopifyProductSyncOnDemandResult>({
    url: "sob/shopify/syncShopifyProductsOnDemand",
    method: "post",
    data
  }, "Shopify selected products sync endpoint");
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
        dataDocumentId: "PROD_STORE_PRODUCTS_COUNT",
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
        dataDocumentId: "PROD_STORE_PRODUCTS_COUNT",
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
        dataDocumentId: "PROD_STORE_PRODUCTS_COUNT",
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

const startInitialImport = async (payload: any): Promise<any> => {
  const { shopId, productStoreId, productIdentifierEnumId, systemMessageRemoteId } = payload;
  if (!systemMessageRemoteId) {
    throw new Error("Shopify product sync import requires systemMessageRemoteId.");
  }

  const response = await requestBackend<any>({
    url: `oms/shopifyShops/${shopId}/productSync/imports`,
    method: "post",
    data: {
      productStoreId,
      productIdentifierEnumId,
      systemMessageRemoteId
    }
  }, "Shopify product sync import endpoint");
  return validateInitialImport(response);
};

const fetchProgress = async (payload: any): Promise<ShopifyProductSyncProgressState> => {
  if (!payload.syncJobId) {
    throw new Error("Shopify product sync progress requires syncJobId.");
  }

  const response = await requestBackend<ShopifyProductSyncProgressState>({
    url: `oms/shopifyShops/${payload.shopId}/productSync/imports/${payload.syncJobId}`,
    method: "get"
  }, "Shopify product sync progress endpoint");
  return validateProgress(response, payload.syncJobId);
};

const fetchReconcile = async (payload: any): Promise<any> => {
  const response = await requestBackend<any>({
    url: `oms/shopifyShops/${payload.shopId}/productSync/reconcile`,
    method: "get",
    params: {
      productStoreId: payload.productStoreId,
      syncJobId: payload.syncJobId
    }
  }, "Shopify product sync reconcile endpoint");
  return validateReconcile(response);
};

const fetchHistory = async (payload: any): Promise<ShopifyProductSyncHistoryState> => {
  const history = validateHistory(await requestBackend<ShopifyProductSyncHistoryState>({
    url: `oms/shopifyShops/${payload.shopId}/productSync/history`,
    method: "get",
    params: {
      limit: 20
    }
  }, "Shopify product sync history endpoint"));

  return {
    ...history,
    runs: history.runs.slice(0, 20)
  };
};

const fetchSyncJobConfig = async (payload: any): Promise<{ isConfigured: boolean; jobName: string }> => {
  const shopifyShopId = payload.shopifyShopId;
  
  try {
    const resp = await api({
      url: "oms/dataDocumentView",
      method: "post",
      data: {
        dataDocumentId: "SERVICE_JOB_PARAMETER",
        pageIndex: 0,
        pageSize: 1,
        customParametersMap: {
          parameterName: "shopifyShopId",
          parameterValue: shopifyShopId,
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
  const shopifyShopId = payload.shopifyShopId;
  const newJobName = `sync_ShopifyProductUpdates_${shopifyShopId}`;
  
  await api({
    url: "admin/serviceJobs/sync_ShopifyProductUpdates/clone",
    method: "POST",
    data: { newJobName }
  });

  return await api({
    url: `admin/serviceJobs/${newJobName}`,
    method: "PUT",
    data: {
      jobName: newJobName,
      paused: "Y",
      serviceJobParameters: [{
        parameterName: "shopifyShopId",
        parameterValue: shopifyShopId
      }]
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

const fetchDashboardSummary = async (payload: any): Promise<any> => {
  const { shopId, systemMessageRemoteId, shop } = payload;
  
  const [syncRunState, pendingRequests, runningOperation] = await Promise.all([
    fetchProductUpdateSyncRunState(systemMessageRemoteId),
    fetchPendingProductUpdateRequests(systemMessageRemoteId),
    fetchRunningBulkOperation({ shopId, systemMessageRemoteId, shop })
  ]);

  return {
    syncRunState,
    pendingRequests,
    runningOperation
  };
};

export const ShopifyProductSyncService = {
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
  fetchSetupState,
  fetchProductStoreContext,
  fetchReviewStats,
  fetchPreflight,
  startInitialImport,
  fetchProgress,
  fetchReconcile,
  fetchHistory,
  fetchSyncJobConfig,
  configureSyncJob,
  fetchErrorRecordCount
};
