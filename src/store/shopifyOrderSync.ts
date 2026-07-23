import { defineStore } from "pinia";
import { api, commonUtil, translate } from "@common";
import { useUserStore } from "@/store/user";
import {
  SHOPIFY_ORDER_SYNC_MESSAGE_TYPE,
  SHOPIFY_ORDER_SYNC_RESULT_LIMIT,
  SHOPIFY_ORDER_SYNC_TEMPLATE_JOB,
  deriveOrderSyncConfigurationState,
  deriveOrderSyncMappingReadiness,
  deriveShopifyOrderSyncProgress,
  findSuitableShopifyOrderSyncJob,
  getShopifyOrderSyncCapabilities,
  normalizeRecentOrderErrors,
  normalizeRecentProcessedOrders,
} from "@/utils/shopifyOrderSync";
import type {
  OrderSyncCapabilities,
  OrderSyncConfigurationState,
  OrderSyncMappingReadiness,
  OrderSyncProgressRow,
  OrderSyncProgressState,
  RecentOrderError,
  RecentProcessedOrder,
  ServiceJobLike,
} from "@/utils/shopifyOrderSync";

const ORDER_IMPORT_CONFIG_IDS = ["SYNC_SHOPIFY_ORDER", "UPDATE_SHOPIFY_ORDER"] as const;
const SHOPIFY_ORDER_SYNC_QUEUE_SERVICE = "co.hotwax.shopify.system.ShopifySystemMessageServices.queue#FeedSystemMessage";
const SYSTEM_MESSAGE_PAGE_SIZE = 250;
const ORDER_SYNC_AUDIT_KEYS = [
  "auditId",
  "shopId",
  "systemMessageId",
  "dataManagerLogId",
  "shopifyOrderId",
  "shopifyOrderName",
  "orderId",
  "outcome",
  "configId",
  "processedDate",
  "shopifyFetchVerified",
] as const;
const ORDER_SYNC_ERROR_KEYS = [
  "errorId",
  "shopId",
  "shopifyOrderId",
  "orderName",
  "errorText",
  "occurredAt",
  "configId",
  "logId",
  "systemMessageId",
  "batchId",
  "retryable",
] as const;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,255}$/;
const SAFE_ERROR_ID = /^[A-Za-z0-9._:-]{1,512}$/;
const SAFE_SHOPIFY_ORDER_ID = /^(?!0+$)[0-9]{1,30}$/;
const SAFE_ORDER_NAME = /^#?[A-Za-z0-9][A-Za-z0-9._#-]{0,63}$/;
const SAFE_ERROR_MESSAGES = new Set([
  "Duplicate or conflicting order data prevented import.",
  "Required order data is missing.",
  "A required order mapping is unavailable.",
  "Shopify order validation failed.",
  "The order import service failed.",
  "Shopify order import failed.",
  "Shopify order request failed before import.",
  "Error details could not be safely read.",
]);

type UnknownRecord = Record<string, unknown>;
type RequestStatus = "idle" | "loading" | "ready" | "error";
type MutationName = "configure" | "schedule" | "status" | "run-now" | null;

export interface OrderSyncRequestState {
  status: RequestStatus;
  error: string | null;
}

export interface SafeShopifyOrderSyncShop {
  shopId: string;
  name: string;
  shopifyShopId: string;
  myshopifyDomain: string;
  productStoreId: string;
  productStoreName: string;
  isEnabled: string;
}

export interface SafeShopifyOrderSyncProductStore {
  productStoreId: string;
  name: string;
}

export interface SafeShopifyOrderSyncRemote {
  [key: string]: unknown;
  systemMessageRemoteId: string;
  ownerShopId: string;
  description: string;
  remoteId: string;
  remoteIdType: string;
  internalId: string;
  internalIdType: string;
  accessScopeEnumId: string;
}

export interface SafeShopifyOrderSyncJob extends ServiceJobLike {
  jobName: string;
  parentJobName?: string;
  description: string;
  serviceName: string;
  cronExpression: string;
  paused: boolean;
  nextRunTime?: string | number;
  lastRunTime?: string | number;
  lastRunStatusId: string;
  latestJobRunId: string;
  shopId: string;
  systemMessageRemoteId: string;
  systemMessageTypeId: string;
  runAsBatch: boolean;
  serviceJobParameters: Array<{ parameterName: string; parameterValue: unknown }>;
}

export interface SafeShopifyOrderSyncMapping {
  shopId: string;
  mappedTypeId: string;
  shopifyValue: string;
  mappedValue: string;
}

export interface SafeShopifyCarrierShipmentMapping {
  shopId: string;
  shopifyShippingMethod: string;
  carrierPartyId: string;
  shipmentMethodTypeId: string;
}

export interface ShopifyOrderSyncBatch {
  [key: string]: unknown;
  systemMessageId: string;
  messageId: string;
  messageDate?: string | number;
  systemMessageTypeId: string;
  systemMessageRemoteId: string;
  statusId: string;
  initDate?: string | number;
  processedDate?: string | number;
  lastUpdatedStamp?: string | number;
  createdByJobRunId: string;
}

export interface ShopifyOrderSyncImport {
  [key: string]: unknown;
  logId: string;
  systemMessageId: string;
  configId: typeof ORDER_IMPORT_CONFIG_IDS[number];
  statusId: string;
  totalRecordCount: number;
  failedRecordCount: number;
  successRecordCount: number;
  createdDate?: string | number;
  finishDateTime?: string | number;
  createdByJobRunId: string;
}

export type ShopifyOrderSyncRecentOrder = RecentProcessedOrder;
export type ShopifyOrderSyncRecentError = RecentOrderError;

export interface ShopifyOrderSyncSummary {
  latestBatch: ShopifyOrderSyncBatch | null;
  latestCompletedBatch: ShopifyOrderSyncBatch | null;
  overallStatus: OrderSyncProgressState;
  lastCompletedAt?: string | number;
  processedOrderCount: number;
  pendingBatchRequests: number;
  hasActiveWork: boolean;
  activeWorkSystemMessageId: string;
  activeWorkJobRunId: string;
  batchStatus: OrderSyncProgressRow["state"];
  importStatus: OrderSyncProgressRow["state"];
  progressRows: readonly [OrderSyncProgressRow, OrderSyncProgressRow];
  nextRunTime?: string | number;
  paused: boolean | null;
  productStore: SafeShopifyOrderSyncProductStore | null;
}

export interface ShopifyOrderSyncCardSnapshot {
  shopId: string;
  configurationState: "missing" | "configured-paused" | "configured-active";
  subtitle?: string;
  processedCount: number;
  pendingCount: number;
  nextRunLabel?: string;
  lastCompletedLabel?: string;
  actionable?: boolean;
  batchStatus: string;
  batchDetail: string;
  importStatus: string;
  importDetail: string;
  loading: boolean;
  error: string | null;
}

export interface ShopifyOrderSyncRunResult {
  jobRunId: string;
  systemMessageId: string;
}

export interface ShopifyOrderSyncRetryResult {
  requestId: string;
  systemMessageId: string;
}

export interface ShopifyOrderSyncCustomRequestResult {
  queued: Array<ShopifyOrderSyncRetryResult & { shopifyOrderId: string }>;
  failedOrderIds: string[];
}

export interface ShopifyOrderSyncRetryState {
  pending: boolean;
  error: string | null;
  requestId?: string;
  systemMessageId?: string;
}

export interface ShopifyOrderSyncSearchResult {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  totalAmount?: string;
  currencyCode?: string;
  customerName?: string;
  cursor?: string;
}

export interface ShopifyOrderSyncSearchState {
  orders: ShopifyOrderSyncSearchResult[];
  hasNextPage: boolean;
  endCursor: string;
}

export interface ShopifyOrderSyncOutstandingOrderCount {
  status: "idle" | "loading" | "ready" | "error";
  count: number | null;
  baselineCreatedAt: string | null;
  error: string | null;
}

type ConfigurationResource = "shop" | "remote" | "template" | "job" | "salesChannel" | "paymentMethod" | "shippingMethod";

interface SafeShopifyOrderSyncContext {
  state: "missing" | "configured-paused" | "configured-active";
  runtimeTimeZone: string;
  shop: SafeShopifyOrderSyncShop;
  productStore: SafeShopifyOrderSyncProductStore;
  remote: SafeShopifyOrderSyncRemote;
  templateJob: SafeShopifyOrderSyncJob;
  job: SafeShopifyOrderSyncJob | null;
}

const requestState = (status: RequestStatus = "idle", error: string | null = null): OrderSyncRequestState => ({ status, error });

const configurationResources = (): Record<ConfigurationResource, OrderSyncRequestState> => ({
  shop: requestState(),
  remote: requestState(),
  template: requestState(),
  job: requestState(),
  salesChannel: requestState(),
  paymentMethod: requestState(),
  shippingMethod: requestState(),
});

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstValue(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function textValue(record: UnknownRecord, keys: readonly string[]): string {
  const value = firstValue(record, keys);
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(record: UnknownRecord, keys: readonly string[]): number {
  const value = Number(firstValue(record, keys));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function optionalDate(record: UnknownRecord, keys: readonly string[]): string | number | undefined {
  const value = firstValue(record, keys);
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function truthy(value: unknown): boolean {
  if (value === true) return true;
  return ["y", "yes", "true", "1"].includes(String(value ?? "").trim().toLowerCase());
}

function timestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value < 100_000_000_000 ? value * 1000 : value;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requestBackend(config: UnknownRecord, context: string): Promise<unknown> {
  try {
    const response = await api(config as any) as any;
    if (!response || commonUtil.hasError(response) || response.data === undefined || response.data === null) {
      throw new Error(context);
    }
    return response.data;
  } catch (error: any) {
    const responseData = error?.response?.data;
    const responseMessages = [
      responseData?.message,
      responseData?.error,
      responseData?.errorMessage,
      responseData?._ERROR_MESSAGE_,
      ...(Array.isArray(responseData?.errors) ? responseData.errors : []),
      ...(Array.isArray(responseData?._ERROR_MESSAGE_LIST_) ? responseData._ERROR_MESSAGE_LIST_ : []),
    ];
    const safeMessage = responseMessages
      .map((message) => typeof message === "string" ? message.trim() : "")
      .find((message) => /^Shop [A-Za-z0-9_-]{1,64} already has active Shopify order sync request [A-Za-z0-9_-]{1,64}\.$/.test(message));
    if (safeMessage) throw new Error(safeMessage);
    // Transport failures are not a safe boundary for rendering server text. In
    // particular, connector/library errors can include quoted JSON credential
    // keys, URLs, or request material. Keep the operational error localizable
    // and fail closed for every transport shape.
    throw new Error(translate("Something went wrong."));
  }
}

function listPayload(payload: unknown, keys: readonly string[], context: string): UnknownRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) throw new Error(`${context} returned an invalid response shape.`);
  for (const key of keys) {
    if (Array.isArray(payload[key])) return (payload[key] as unknown[]).filter(isRecord);
  }
  const count = Number(firstValue(payload, ["count", "total", "entityValueListCount", "dataManagerLogsCount"]));
  if (count === 0) return [];
  throw new Error(`${context} did not return a recognized list.`);
}

function normalizeDomain(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.username || url.password ? "" : url.hostname;
  } catch (_error) {
    return "";
  }
}

function projectShop(row: UnknownRecord): SafeShopifyOrderSyncShop {
  const shopId = textValue(row, ["shopId"]);
  if (!shopId) throw new Error("Shopify shop response is missing shopId.");
  const productStoreId = textValue(row, ["productStoreId"]);
  return {
    shopId,
    name: textValue(row, ["name"]) || shopId,
    shopifyShopId: textValue(row, ["shopifyShopId"]),
    myshopifyDomain: normalizeDomain(firstValue(row, ["myshopifyDomain"])),
    productStoreId,
    productStoreName: "",
    isEnabled: textValue(row, ["isEnabled"]),
  };
}

function projectProductStore(row: UnknownRecord): SafeShopifyOrderSyncProductStore {
  const productStoreId = textValue(row, ["productStoreId"]);
  if (!productStoreId) throw new Error("Product Store response is missing productStoreId.");
  return {
    productStoreId,
    name: textValue(row, ["name"]) || productStoreId,
  };
}

function projectRemote(row: UnknownRecord): SafeShopifyOrderSyncRemote {
  const systemMessageRemoteId = textValue(row, ["systemMessageRemoteId"]);
  if (!systemMessageRemoteId) throw new Error("SystemMessageRemote response is missing systemMessageRemoteId.");
  return {
    systemMessageRemoteId,
    ownerShopId: textValue(row, ["ownerShopId"]),
    description: textValue(row, ["description"]),
    remoteId: textValue(row, ["remoteId"]),
    remoteIdType: textValue(row, ["remoteIdType"]),
    internalId: textValue(row, ["internalId"]),
    internalIdType: textValue(row, ["internalIdType"]),
    accessScopeEnumId: textValue(row, ["accessScopeEnumId"]),
  };
}

function jobParameterRows(row: UnknownRecord): Array<{ parameterName: string; parameterValue: unknown }> {
  const rawRows = [
    ...(Array.isArray(row.serviceJobParameters) ? row.serviceJobParameters : []),
    ...(Array.isArray(row.parameters) ? row.parameters : []),
  ].filter(isRecord);
  const allowed = new Set(["shopId", "systemMessageRemoteId", "systemMessageTypeId", "runAsBatch"]);
  return rawRows.flatMap((parameter) => {
    const parameterName = textValue(parameter, ["parameterName", "name"]);
    if (!allowed.has(parameterName)) return [];
    return [{ parameterName, parameterValue: firstValue(parameter, ["parameterValue", "value"]) }];
  });
}

function parameterValue(parameters: Array<{ parameterName: string; parameterValue: unknown }>, name: string): unknown {
  return parameters.find((parameter) => parameter.parameterName === name)?.parameterValue;
}

function isActiveJobRunStatus(statusId: string): boolean {
  return statusId.toLocaleLowerCase() === "pending" || statusId.toLocaleLowerCase() === "running";
}

function projectJob(row: UnknownRecord, context: string, requireState = true): SafeShopifyOrderSyncJob {
  const jobName = textValue(row, ["jobName"]);
  if (!jobName) throw new Error(`${context} is missing jobName.`);
  const parameters = jobParameterRows(row);
  const pausedValue = firstValue(row, ["paused", "isPaused"]);
  const activeValue = firstValue(row, ["isActive", "active"]);
  if (requireState && pausedValue === undefined && activeValue === undefined) {
    throw new Error(`${context} is missing paused/active state.`);
  }
  const paused = pausedValue !== undefined ? truthy(pausedValue) : activeValue !== undefined ? !truthy(activeValue) : false;
  const latestJobRunValue = row.latestJobRun;
  let latestJobRunId = "";
  if (latestJobRunValue !== undefined && latestJobRunValue !== null) {
    const latestJobRunKeys = isRecord(latestJobRunValue) ? Object.keys(latestJobRunValue) : [];
    if (
      !isRecord(latestJobRunValue)
      || !latestJobRunKeys.includes("jobRunId")
      || latestJobRunKeys.some((key) => !["jobRunId", "startTime", "endTime", "hasError"].includes(key))
    ) {
      throw new Error(`${context} returned an invalid latest ServiceJobRun.`);
    }
    const jobRunId = textValue(latestJobRunValue, ["jobRunId"]);
    const startTime = latestJobRunValue.startTime === undefined || latestJobRunValue.startTime === null
      ? undefined
      : safeOccurredAt(latestJobRunValue.startTime);
    const endTime = latestJobRunValue.endTime === undefined || latestJobRunValue.endTime === null
      ? undefined
      : safeOccurredAt(latestJobRunValue.endTime);
    const hasErrorValue = latestJobRunValue.hasError;
    const hasValidErrorFlag = typeof hasErrorValue === "boolean"
      || hasErrorValue === "Y"
      || hasErrorValue === "N"
      || ((hasErrorValue === undefined || hasErrorValue === null) && !endTime);
    if (!jobRunId || !SAFE_CORRELATION_ID.test(jobRunId) || !hasValidErrorFlag) {
      throw new Error(`${context} returned an invalid latest ServiceJobRun.`);
    }
    const hasError = hasErrorValue === true || hasErrorValue === "Y";
    const lastRunStatusId = textValue(row, ["lastRunStatusId"]);
    const statusMatchesRun = endTime
      ? lastRunStatusId === (hasError ? "Failed" : "Completed")
      : startTime
        ? lastRunStatusId.toLocaleLowerCase() === "running"
        : lastRunStatusId.toLocaleLowerCase() === "pending";
    if (!statusMatchesRun) {
      throw new Error(`${context} returned an inconsistent latest ServiceJobRun status.`);
    }
    latestJobRunId = jobRunId;
  }
  const lastRunStatusId = textValue(row, ["lastRunStatusId"]);
  if (!latestJobRunId && lastRunStatusId) {
    throw new Error(`${context} returned a last-run status without a latest ServiceJobRun.`);
  }

  return {
    jobName,
    parentJobName: textValue(row, ["parentJobName", "templateJobName", "sourceJobName"]) || undefined,
    description: textValue(row, ["description"]),
    serviceName: textValue(row, ["serviceName"]),
    cronExpression: textValue(row, ["cronExpression"]),
    paused,
    nextRunTime: optionalDate(row, ["nextRunTime", "nextRunDate", "nextScheduledTime"]),
    lastRunTime: optionalDate(row, ["lastRunTime", "lastRunDate", "lastRunStartTime"]),
    lastRunStatusId,
    latestJobRunId,
    shopId: textValue(row, ["shopId"]) || String(parameterValue(parameters, "shopId") ?? "").trim(),
    systemMessageRemoteId: textValue(row, ["systemMessageRemoteId"]) || String(parameterValue(parameters, "systemMessageRemoteId") ?? "").trim(),
    systemMessageTypeId: textValue(row, ["systemMessageTypeId"]) || String(parameterValue(parameters, "systemMessageTypeId") ?? "").trim(),
    runAsBatch: truthy(firstValue(row, ["runAsBatch"]) ?? parameterValue(parameters, "runAsBatch")),
    serviceJobParameters: parameters,
  };
}

function normalizeOrderSyncContext(payload: unknown, context: string, expectedShopId: string): SafeShopifyOrderSyncContext {
  if (!isRecord(payload) || !isRecord(payload.orderSyncJob)) {
    throw new Error(`${context} returned an invalid response shape.`);
  }
  const envelope = payload.orderSyncJob;
  const envelopeShopId = textValue(envelope, ["shopId"]);
  if (!envelopeShopId || envelopeShopId !== expectedShopId) {
    throw new Error(`${context} crossed the selected Shopify shop scope.`);
  }
  const state = textValue(envelope, ["state"]);
  if (state === "error" || state === "conflict") {
    const safeMessage = textValue(envelope, ["errorMessage"]);
    throw new Error(safeMessage || `${context} could not be resolved safely.`);
  }
  if (!["missing", "configured-paused", "configured-active"].includes(state)) {
    throw new Error(`${context} returned an invalid configuration state.`);
  }
  if (!isRecord(envelope.shop) || !isRecord(envelope.productStore) || !isRecord(envelope.remote) || !isRecord(envelope.template)) {
    throw new Error(`${context} did not return the complete safe shop context.`);
  }

  const productStore = projectProductStore(envelope.productStore);
  const projectedShop = projectShop(envelope.shop);
  const shop = { ...projectedShop, productStoreName: productStore.name };
  if (shop.shopId !== expectedShopId) throw new Error(`${context} crossed the selected Shopify shop scope.`);
  if (!shop.productStoreId || shop.productStoreId !== productStore.productStoreId) {
    throw new Error(`${context} returned a Product Store outside the selected Shopify shop scope.`);
  }

  const remote = projectRemote(envelope.remote);
  if (remote.ownerShopId !== expectedShopId) {
    throw new Error(`${context} returned a remote outside the selected Shopify shop scope.`);
  }

  const templateJob = projectJob(envelope.template, "Order Sync template job", false);
  if (templateJob.jobName !== SHOPIFY_ORDER_SYNC_TEMPLATE_JOB) {
    throw new Error(`${context} returned an unexpected Order Sync template.`);
  }

  let job: SafeShopifyOrderSyncJob | null = null;
  if (state === "missing") {
    if (envelope.job !== null && envelope.job !== undefined) {
      throw new Error(`${context} returned a job for an explicitly missing configuration.`);
    }
  } else {
    if (!isRecord(envelope.job)) throw new Error(`${context} did not return the configured Order Sync job.`);
    job = projectJob(envelope.job, context);
    if (job.shopId !== expectedShopId) throw new Error(`${context} crossed the selected Shopify shop scope.`);
    if (job.systemMessageRemoteId !== remote.systemMessageRemoteId) {
      throw new Error(`${context} returned a job remote outside the selected Shopify shop scope.`);
    }
    if ((state === "configured-paused") !== job.paused) {
      throw new Error(`${context} returned an inconsistent paused state.`);
    }
  }

  return {
    state: state as SafeShopifyOrderSyncContext["state"],
    runtimeTimeZone: textValue(envelope, ["runtimeTimeZone"]),
    shop,
    productStore,
    remote,
    templateJob,
    job,
  };
}

function normalizeJobResponse(payload: unknown, context: string, expectedShopId: string): SafeShopifyOrderSyncJob | null {
  return normalizeOrderSyncContext(payload, context, expectedShopId).job;
}

function projectTypeMapping(row: UnknownRecord, shopId: string): SafeShopifyOrderSyncMapping {
  const recordShopId = textValue(row, ["shopId"]);
  if (recordShopId !== shopId) throw new Error("Mapping response crossed the selected Shopify shop scope.");
  return {
    shopId: recordShopId,
    mappedTypeId: textValue(row, ["mappedTypeId", "mappingTypeId"]),
    shopifyValue: textValue(row, ["shopifyValue", "shopifyType", "shopifyTypeId", "typeId"]),
    mappedValue: textValue(row, ["mappedValue", "mappedTypeValue", "mappedTypeValueId", "mappedId"]),
  };
}

function projectCarrierShipment(row: UnknownRecord, shopId: string): SafeShopifyCarrierShipmentMapping {
  const recordShopId = textValue(row, ["shopId"]);
  if (recordShopId !== shopId) throw new Error("Shipment mapping response crossed the selected Shopify shop scope.");
  return {
    shopId: recordShopId,
    shopifyShippingMethod: textValue(row, ["shopifyShippingMethod"]),
    carrierPartyId: textValue(row, ["carrierPartyId"]),
    shipmentMethodTypeId: textValue(row, ["shipmentMethodTypeId"]),
  };
}

function projectBatch(row: UnknownRecord, shopId: string, expectedSystemMessageRemoteId: string): ShopifyOrderSyncBatch {
  const remoteInternalId = textValue(row, ["remoteInternalId"]);
  if (remoteInternalId && remoteInternalId !== shopId) throw new Error("SystemMessage response crossed the selected Shopify shop scope.");
  const systemMessageTypeId = textValue(row, ["systemMessageTypeId"]);
  if (systemMessageTypeId !== SHOPIFY_ORDER_SYNC_MESSAGE_TYPE) {
    throw new Error("SystemMessage response contained an unexpected message type.");
  }
  const systemMessageRemoteId = textValue(row, ["systemMessageRemoteId"]);
  if (systemMessageRemoteId !== expectedSystemMessageRemoteId) {
    throw new Error("SystemMessage response crossed the selected Shopify remote scope.");
  }
  const systemMessageId = textValue(row, ["systemMessageId"]);
  if (!systemMessageId) throw new Error("SystemMessage response is missing systemMessageId.");
  return {
    systemMessageId,
    messageId: textValue(row, ["messageId"]),
    messageDate: optionalDate(row, ["messageDate"]),
    systemMessageTypeId,
    systemMessageRemoteId,
    statusId: textValue(row, ["statusId"]),
    initDate: optionalDate(row, ["initDate", "createdDate", "createdStamp"]),
    processedDate: optionalDate(row, ["processedDate"]),
    lastUpdatedStamp: optionalDate(row, ["lastUpdatedStamp"]),
    createdByJobRunId: textValue(row, ["jobRunId", "createdByJobRunId"]),
  };
}

function projectImport(row: UnknownRecord, expectedSystemMessageId?: string, expectedConfigId?: string): ShopifyOrderSyncImport {
  const configId = textValue(row, ["configId"]);
  if (!ORDER_IMPORT_CONFIG_IDS.includes(configId as any)) throw new Error("DataManager response contained an unexpected order config.");
  if (expectedConfigId && configId !== expectedConfigId) throw new Error("DataManager response crossed the requested config scope.");
  const systemMessageId = textValue(row, ["systemMessageId"]);
  if (expectedSystemMessageId && systemMessageId && systemMessageId !== expectedSystemMessageId) {
    throw new Error("DataManager response crossed the selected SystemMessage correlation.");
  }
  const totalRecordCount = numberValue(row, ["totalRecordCount"]);
  const failedRecordCount = numberValue(row, ["failedRecordCount"]);
  return {
    logId: textValue(row, ["logId"]),
    systemMessageId: systemMessageId || expectedSystemMessageId || "",
    configId: configId as ShopifyOrderSyncImport["configId"],
    statusId: textValue(row, ["logStatusId", "statusId"]),
    totalRecordCount,
    failedRecordCount,
    successRecordCount: Math.max(numberValue(row, ["successRecordCount"]) || totalRecordCount - failedRecordCount, 0),
    createdDate: optionalDate(row, ["createdDate", "createdStamp"]),
    finishDateTime: optionalDate(row, ["finishDateTime", "completedDate"]),
    createdByJobRunId: textValue(row, ["createdByJobRunId", "jobRunId"]),
  };
}

function batchTime(batch: ShopifyOrderSyncBatch): number {
  return timestamp(batch.lastUpdatedStamp ?? batch.processedDate ?? batch.initDate);
}

function isSuitableJob(job: SafeShopifyOrderSyncJob, remote: SafeShopifyOrderSyncRemote, shopId: string): boolean {
  return Boolean(
    findSuitableShopifyOrderSyncJob([job], remote) &&
    job.shopId === shopId &&
    job.runAsBatch &&
    job.serviceName === SHOPIFY_ORDER_SYNC_QUEUE_SERVICE
  );
}

function validShopifyOrderId(value: string): boolean {
  return /^(?!0+$)\d{1,30}$/.test(value);
}

async function fetchOrderSyncContext(shopId: string): Promise<SafeShopifyOrderSyncContext> {
  const payload = await requestBackend({ url: `shopify/order-sync/${encodeURIComponent(shopId)}/job`, method: "get" }, "Loading the shop Order Sync job");
  return normalizeOrderSyncContext(payload, "Shop Order Sync job", shopId);
}

async function fetchTypeMappings(shopId: string, mappedTypeId: string): Promise<SafeShopifyOrderSyncMapping[]> {
  const payload = await requestBackend({ url: "oms/shopifyShops/typeMappings", method: "get", params: { shopId, mappedTypeId, pageSize: 100, pageIndex: 0 } }, `Loading ${mappedTypeId} mappings`);
  return listPayload(payload, ["typeMappings", "shopifyTypeMappings", "entityValueList", "docs"], `${mappedTypeId} mapping list`)
    .map((row) => projectTypeMapping(row, shopId))
    .filter((mapping) => mapping.mappedTypeId === mappedTypeId);
}

async function fetchShippingMappings(shopId: string): Promise<SafeShopifyCarrierShipmentMapping[]> {
  const payload = await requestBackend({ url: "oms/shopifyShops/carrierShipments", method: "get", params: { shopId, pageSize: 100, pageIndex: 0 } }, "Loading Shipping Method mappings");
  return listPayload(payload, ["carrierShipments", "shopifyShopsCarrierShipments", "entityValueList", "docs"], "Shipping Method mapping list")
    .map((row) => projectCarrierShipment(row, shopId));
}

async function fetchSystemMessages(shopId: string, systemMessageRemoteId: string): Promise<ShopifyOrderSyncBatch[]> {
  if (!systemMessageRemoteId) throw new Error("The selected Shopify shop remote is unavailable.");
  const payload = await requestBackend({
    url: "admin/systemMessages",
    method: "get",
    params: {
      systemMessageTypeId: SHOPIFY_ORDER_SYNC_MESSAGE_TYPE,
      systemMessageRemoteId,
      pageSize: Math.min(SYSTEM_MESSAGE_PAGE_SIZE, SHOPIFY_ORDER_SYNC_RESULT_LIMIT),
      pageIndex: 0,
      orderByField: "-initDate",
    },
  }, "Loading Shopify Order Sync messages");
  const rows = listPayload(payload, ["systemMessages", "entityValueList"], "Order Sync SystemMessage history");
  const seen = new Set<string>();
  return rows.map((row) => projectBatch(row, shopId, systemMessageRemoteId)).filter((message) => {
    if (seen.has(message.systemMessageId)) return false;
    seen.add(message.systemMessageId);
    return true;
  }).sort((first, second) => batchTime(second) - batchTime(first)).slice(0, SHOPIFY_ORDER_SYNC_RESULT_LIMIT);
}

function scheduledBatches(systemMessages: ShopifyOrderSyncBatch[]): ShopifyOrderSyncBatch[] {
  // Scheduled and Run now batches have a source window; standalone requests intentionally do not.
  return systemMessages.filter((message) => message.messageDate !== undefined);
}

async function fetchBatchImports(
  systemMessageRemoteId: string,
  batches: ShopifyOrderSyncBatch[],
): Promise<Record<string, ShopifyOrderSyncImport[]>> {
  if (!systemMessageRemoteId) throw new Error("The selected Shopify shop remote is unavailable.");
  const systemMessageIds = [...new Set(batches.map(({ systemMessageId }) => systemMessageId).filter(Boolean))];
  const importsBySystemMessageId = Object.fromEntries(
    systemMessageIds.map((systemMessageId) => [systemMessageId, [] as ShopifyOrderSyncImport[]])
  );
  if (!systemMessageIds.length) return importsBySystemMessageId;

  // A standard Order Sync batch creates at most one create import and one update import.
  // Request one sentinel row beyond that bounded contract so an anomalous response fails closed.
  const maximumExpectedRows = systemMessageIds.length * ORDER_IMPORT_CONFIG_IDS.length;
  const payload = await requestBackend({
    url: "oms/dataDocumentView",
    method: "post",
    data: {
      dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
      customParametersMap: {
        systemMessageId: systemMessageIds,
        systemMessageTypeId: SHOPIFY_ORDER_SYNC_MESSAGE_TYPE,
        systemMessageRemoteId,
        configId: [...ORDER_IMPORT_CONFIG_IDS],
        orderByField: "-lastUpdatedStamp",
      },
      fieldsToSelect: "systemMessageId,systemMessageTypeId,systemMessageRemoteId,logId,logStatusId,totalRecordCount,failedRecordCount,configId",
      pageSize: maximumExpectedRows + 1,
      pageIndex: 0,
    },
  }, "Loading shop-scoped Order Sync batch imports");
  const rows = listPayload(payload, ["entityValueList", "dataManagerLogs", "logs", "docs"], "Shop-scoped Order Sync batch imports");
  if (rows.length > maximumExpectedRows) {
    throw new Error("Order Sync batch imports exceeded the bounded two-import-per-batch contract.");
  }

  const expectedIds = new Set(systemMessageIds);
  const importByBatchAndConfig = new Map<string, ShopifyOrderSyncImport>();
  for (const row of rows) {
    const systemMessageId = textValue(row, ["systemMessageId"]);
    const systemMessageTypeId = textValue(row, ["systemMessageTypeId"]);
    const rowSystemMessageRemoteId = textValue(row, ["systemMessageRemoteId"]);
    const configId = textValue(row, ["configId"]);
    const logId = textValue(row, ["logId"]);

    if (!expectedIds.has(systemMessageId)) {
      throw new Error("DataManager response crossed the selected SystemMessage correlations.");
    }
    if (systemMessageTypeId !== SHOPIFY_ORDER_SYNC_MESSAGE_TYPE) {
      throw new Error("DataManager response contained an unexpected SystemMessage type.");
    }
    if (rowSystemMessageRemoteId !== systemMessageRemoteId) {
      throw new Error("DataManager response crossed the selected Shopify remote scope.");
    }
    // Some DataDocument implementations retain the outer SystemMessage row when no
    // related DataManagerLog exists. The SystemMessage list is the authority for that
    // valid zero-import batch, so there is no import to project here.
    if (!configId && !logId) continue;
    if (!ORDER_IMPORT_CONFIG_IDS.includes(configId as typeof ORDER_IMPORT_CONFIG_IDS[number]) || !logId) {
      throw new Error("DataManager response contained an invalid Order Sync import reference.");
    }

    const projected = projectImport(row, systemMessageId, configId);
    const correlationKey = `${systemMessageId}:${configId}`;
    const existing = importByBatchAndConfig.get(correlationKey);
    if (existing && existing.logId !== projected.logId) {
      throw new Error(`${configId} returned more than one import for a single Order Sync batch.`);
    }
    importByBatchAndConfig.set(correlationKey, projected);
  }

  for (const log of importByBatchAndConfig.values()) {
    importsBySystemMessageId[log.systemMessageId].push(log);
  }
  for (const logs of Object.values(importsBySystemMessageId)) {
    logs.sort((first, second) => ORDER_IMPORT_CONFIG_IDS.indexOf(first.configId) - ORDER_IMPORT_CONFIG_IDS.indexOf(second.configId));
  }
  return importsBySystemMessageId;
}

async function fetchAuditRows(shopId: string): Promise<UnknownRecord[]> {
  const payload = await requestBackend({
    url: `shopify/order-sync/${encodeURIComponent(shopId)}/audits`,
    method: "get",
    params: { pageSize: SHOPIFY_ORDER_SYNC_RESULT_LIMIT },
  }, "Loading recent successful Order Sync audits");
  if (!isRecord(payload) || !exactKeys(payload, ["orderSyncAudits"]) || !Array.isArray(payload.orderSyncAudits)) {
    throw new Error("Order Sync audit projection returned an invalid response shape.");
  }
  if (payload.orderSyncAudits.length > SHOPIFY_ORDER_SYNC_RESULT_LIMIT) {
    throw new Error("Order Sync audit projection exceeded the 100-row contract.");
  }

  const seenAuditIds = new Set<string>();
  let previousTimestamp = Number.POSITIVE_INFINITY;
  return payload.orderSyncAudits.map((row) => {
    if (!isRecord(row) || !exactKeys(row, ORDER_SYNC_AUDIT_KEYS)) {
      throw new Error("Order Sync audit projection returned fields outside the safe contract.");
    }
    const auditId = requiredSafeId(row, "auditId", 512);
    const rowShopId = requiredSafeId(row, "shopId");
    const systemMessageId = requiredSafeId(row, "systemMessageId");
    const dataManagerLogId = requiredSafeId(row, "dataManagerLogId");
    if (rowShopId !== shopId) throw new Error("Order Sync audit projection crossed the selected Shopify shop scope.");
    if (seenAuditIds.has(auditId)) throw new Error("Order Sync audit projection contained a duplicate audit ID.");
    seenAuditIds.add(auditId);

    const shopifyOrderId = row.shopifyOrderId;
    const shopifyOrderName = row.shopifyOrderName;
    const orderId = row.orderId;
    const configId = row.configId;
    const outcome = row.outcome;
    if (typeof shopifyOrderId !== "string" || !SAFE_SHOPIFY_ORDER_ID.test(shopifyOrderId)) {
      throw new Error("Order Sync audit projection contained an invalid Shopify order ID.");
    }
    if (typeof shopifyOrderName !== "string" || (shopifyOrderName && !SAFE_ORDER_NAME.test(shopifyOrderName))) {
      throw new Error("Order Sync audit projection contained an invalid Shopify order name.");
    }
    if (typeof orderId !== "string" || orderId.length > 255 || /[\u0000-\u001f\u007f]/.test(orderId)) {
      throw new Error("Order Sync audit projection contained an invalid HotWax order ID.");
    }
    if (!ORDER_IMPORT_CONFIG_IDS.includes(configId as typeof ORDER_IMPORT_CONFIG_IDS[number])) {
      throw new Error("Order Sync audit projection contained an unexpected order config.");
    }
    if (outcome !== "Created" && outcome !== "Updated") {
      throw new Error("Order Sync audit projection contained an invalid outcome.");
    }
    if (typeof row.shopifyFetchVerified !== "boolean") {
      throw new Error("Order Sync audit projection contained an invalid Shopify fetch provenance flag.");
    }
    const processedDate = safeOccurredAt(row.processedDate);
    const processedAtMillis = timestamp(processedDate);
    if (processedAtMillis > previousTimestamp) {
      throw new Error("Order Sync audit projection was not sorted newest first.");
    }
    previousTimestamp = processedAtMillis;

    return {
      auditId,
      shopId: rowShopId,
      systemMessageId,
      dataManagerLogId,
      shopifyOrderId,
      shopifyOrderName,
      orderId,
      outcome,
      configId,
      processedDate,
      shopifyFetchVerified: row.shopifyFetchVerified,
    };
  });
}

function exactKeys(record: UnknownRecord, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function requiredSafeId(row: UnknownRecord, key: string, maximum = 255): string {
  const value = row[key];
  const pattern = maximum === 512 ? SAFE_ERROR_ID : SAFE_CORRELATION_ID;
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`Order Sync error projection contained an invalid ${key}.`);
  }
  return value;
}

function optionalSafeId(row: UnknownRecord, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || (value && !SAFE_CORRELATION_ID.test(value))) {
    throw new Error(`Order Sync error projection contained an invalid ${key}.`);
  }
  return value;
}

function safeOccurredAt(value: unknown): string | number {
  const occurredAtMillis = timestamp(value);
  if ((typeof value !== "string" && typeof value !== "number") || !Number.isFinite(occurredAtMillis) || occurredAtMillis <= 0) {
    throw new Error("Order Sync error projection contained an invalid occurredAt.");
  }
  if (typeof value === "string" && (value.length > 64 || /[\u0000-\u001f\u007f]/.test(value))) {
    throw new Error("Order Sync error projection contained an invalid occurredAt.");
  }
  return value;
}

function projectSafeError(row: UnknownRecord, shopId: string, expectedKind: "import" | "request"): UnknownRecord {
  if (!exactKeys(row, ORDER_SYNC_ERROR_KEYS)) {
    throw new Error("Order Sync error projection returned fields outside the safe contract.");
  }

  const errorId = requiredSafeId(row, "errorId", 512);
  const rowShopId = requiredSafeId(row, "shopId");
  const logId = optionalSafeId(row, "logId");
  const systemMessageId = requiredSafeId(row, "systemMessageId");
  const batchId = optionalSafeId(row, "batchId");
  if (rowShopId !== shopId) throw new Error("Order Sync error projection crossed the selected Shopify shop scope.");

  const configId = row.configId;
  if (typeof configId !== "string") {
    throw new Error("Order Sync error projection contained an unexpected order config.");
  }

  const shopifyOrderId = row.shopifyOrderId;
  if (typeof shopifyOrderId !== "string" || (shopifyOrderId && !SAFE_SHOPIFY_ORDER_ID.test(shopifyOrderId))) {
    throw new Error("Order Sync error projection contained an invalid Shopify order ID.");
  }
  const orderName = row.orderName;
  if (typeof orderName !== "string" || (orderName && !SAFE_ORDER_NAME.test(orderName))) {
    throw new Error("Order Sync error projection contained an invalid order name.");
  }
  const errorText = row.errorText;
  if (
    typeof errorText !== "string"
    || !SAFE_ERROR_MESSAGES.has(errorText)
  ) {
    throw new Error("Order Sync error projection contained unsafe error text.");
  }
  if (typeof row.retryable !== "boolean" || (row.retryable && !shopifyOrderId)) {
    throw new Error("Order Sync error projection contained an inconsistent retryable value.");
  }

  const preImportFailure = !logId
    && !configId
    && !shopifyOrderId
    && !orderName
    && errorText === "Shopify order request failed before import."
    && row.retryable === false
    && errorId === `${systemMessageId}:system-message`;
  const dataManagerFailure = Boolean(logId)
    && ORDER_IMPORT_CONFIG_IDS.includes(configId as typeof ORDER_IMPORT_CONFIG_IDS[number])
    && errorId.startsWith(`${logId}:`);
  if (
    (expectedKind === "request" && !preImportFailure)
    || (expectedKind === "import" && !dataManagerFailure)
  ) {
    throw new Error("Order Sync error projection contained an invalid failure correlation.");
  }

  // Construct a fresh allowlisted record. The raw response object is never retained.
  return {
    errorId,
    shopId: rowShopId,
    shopifyOrderId,
    orderName,
    errorText,
    occurredAt: safeOccurredAt(row.occurredAt),
    configId,
    logId,
    systemMessageId,
    batchId,
    retryable: row.retryable,
  };
}

function normalizeErrorRows(
  rows: unknown[],
  shopId: string,
  expectedKind: "import" | "request",
): ShopifyOrderSyncRecentError[] {
  const projectedRows = rows.map((row) => {
    if (!isRecord(row)) throw new Error("Order Sync error projection contained an invalid row.");
    return projectSafeError(row, shopId, expectedKind);
  });
  const seenErrorIds = new Set<string>();
  let previousTimestamp = Number.POSITIVE_INFINITY;
  for (const row of projectedRows) {
    const errorId = String(row.errorId);
    if (seenErrorIds.has(errorId)) throw new Error("Order Sync error projection contained a duplicate error ID.");
    seenErrorIds.add(errorId);
    const currentTimestamp = timestamp(row.occurredAt);
    if (currentTimestamp > previousTimestamp) {
      throw new Error("Order Sync error projection was not sorted newest first.");
    }
    previousTimestamp = currentTimestamp;
  }

  return projectedRows.map((row) => {
    const normalized = normalizeRecentOrderErrors([{ ...row, errorDate: row.occurredAt }], {
      shopId,
      limit: 1,
    })[0];
    if (!normalized) throw new Error("Order Sync error projection could not be normalized safely.");
    return { ...normalized, retryable: row.retryable === true && normalized.retryable };
  }).sort((first, second) => second.occurredAtMillis - first.occurredAtMillis || first.id.localeCompare(second.id));
}

function normalizeErrorProjection(payload: unknown, shopId: string): {
  recentErrors: ShopifyOrderSyncRecentError[];
  recentRequestErrors: ShopifyOrderSyncRecentError[];
} {
  if (
    !isRecord(payload)
    || !exactKeys(payload, ["orderSyncErrors", "orderSyncRequestErrors"])
    || !Array.isArray(payload.orderSyncErrors)
    || !Array.isArray(payload.orderSyncRequestErrors)
  ) {
    throw new Error("Order Sync error projection returned an invalid response shape.");
  }
  if (
    payload.orderSyncErrors.length > SHOPIFY_ORDER_SYNC_RESULT_LIMIT
    || payload.orderSyncRequestErrors.length > SHOPIFY_ORDER_SYNC_RESULT_LIMIT
  ) {
    throw new Error("Order Sync error projection exceeded the 100-row contract.");
  }
  return {
    recentErrors: normalizeErrorRows(payload.orderSyncErrors, shopId, "import"),
    recentRequestErrors: normalizeErrorRows(payload.orderSyncRequestErrors, shopId, "request"),
  };
}

async function fetchRecentErrors(shopId: string): Promise<{
  recentErrors: ShopifyOrderSyncRecentError[];
  recentRequestErrors: ShopifyOrderSyncRecentError[];
}> {
  const payload = await requestBackend({
    url: `shopify/order-sync/${encodeURIComponent(shopId)}/errors`,
    method: "get",
    params: { pageSize: SHOPIFY_ORDER_SYNC_RESULT_LIMIT },
  }, "Loading the safe Order Sync error projection");
  return normalizeErrorProjection(payload, shopId);
}

interface DurableAuditCorrelation {
  systemMessageId: string;
  configId: ShopifyOrderSyncImport["configId"];
  logId: string;
  processedAtMillis: number;
}

function latestDurableAuditCorrelations(
  recentOrders: ShopifyOrderSyncRecentOrder[],
): DurableAuditCorrelation[] {
  const latestByConfig = new Map<string, DurableAuditCorrelation>();
  for (const order of recentOrders) {
    if (!order.systemMessageId || !order.configId || !order.logId) continue;
    const configId = order.configId as ShopifyOrderSyncImport["configId"];
    const key = `${order.systemMessageId}:${configId}`;
    const current = latestByConfig.get(key);
    if (!current || order.processedAtMillis > current.processedAtMillis) {
      latestByConfig.set(key, {
        systemMessageId: order.systemMessageId,
        configId,
        logId: order.logId,
        processedAtMillis: order.processedAtMillis,
      });
    } else if (order.processedAtMillis === current.processedAtMillis && order.logId !== current.logId) {
      throw new Error("Order Sync audits returned ambiguous DataManager correlations.");
    }
  }
  return [...latestByConfig.values()];
}

function requiredImportCount(row: UnknownRecord, field: "totalRecordCount" | "failedRecordCount"): number {
  const raw = row[field];
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`DataManager response contained an invalid ${field}.`);
  }
  return value;
}

async function fetchAuditCorrelatedImports(
  systemMessageRemoteId: string,
  correlations: DurableAuditCorrelation[],
): Promise<Map<string, ShopifyOrderSyncImport>> {
  const importsByLogId = new Map<string, ShopifyOrderSyncImport>();
  if (!correlations.length) return importsByLogId;
  const correlationByLogId = new Map<string, DurableAuditCorrelation>();
  for (const correlation of correlations) {
    const existing = correlationByLogId.get(correlation.logId);
    if (existing && (existing.systemMessageId !== correlation.systemMessageId || existing.configId !== correlation.configId)) {
      throw new Error("Order Sync audits reused a DataManager log across correlations.");
    }
    correlationByLogId.set(correlation.logId, correlation);
  }
  const logIds = [...correlationByLogId.keys()];
  const payload = await requestBackend({
    url: "oms/dataDocumentView",
    method: "post",
    data: {
      dataDocumentId: "SYSTEM_MESSAGE_DATA_MANAGER_LOG",
      customParametersMap: {
        logId: logIds,
        systemMessageTypeId: SHOPIFY_ORDER_SYNC_MESSAGE_TYPE,
        systemMessageRemoteId,
        configId: [...ORDER_IMPORT_CONFIG_IDS],
      },
      fieldsToSelect: "systemMessageId,systemMessageTypeId,systemMessageRemoteId,logId,logStatusId,totalRecordCount,failedRecordCount,configId",
      pageSize: logIds.length + 1,
      pageIndex: 0,
    },
  }, "Loading audit-correlated Order Sync imports");
  const rows = listPayload(payload, ["entityValueList", "dataManagerLogs", "logs", "docs"], "Audit-correlated Order Sync imports");
  if (rows.length > logIds.length) throw new Error("Audit-correlated DataManager response returned duplicate rows.");

  for (const row of rows) {
    const logId = textValue(row, ["logId"]);
    const correlation = correlationByLogId.get(logId);
    if (!correlation) throw new Error("DataManager response crossed the requested audit log scope.");
    if (importsByLogId.has(logId)) throw new Error("Audit-correlated DataManager response returned duplicate rows.");
    if (textValue(row, ["systemMessageTypeId"]) !== SHOPIFY_ORDER_SYNC_MESSAGE_TYPE) {
      throw new Error("DataManager response contained an unexpected SystemMessage type.");
    }
    if (textValue(row, ["systemMessageRemoteId"]) !== systemMessageRemoteId) {
      throw new Error("DataManager response crossed the selected Shopify remote scope.");
    }
    if (textValue(row, ["systemMessageId"]) !== correlation.systemMessageId) {
      throw new Error("DataManager response crossed the audit SystemMessage correlation.");
    }
    if (textValue(row, ["configId"]) !== correlation.configId) {
      throw new Error("DataManager response crossed the audit import configuration.");
    }
    const totalRecordCount = requiredImportCount(row, "totalRecordCount");
    const failedRecordCount = requiredImportCount(row, "failedRecordCount");
    if (failedRecordCount > totalRecordCount) throw new Error("DataManager response contained impossible import counts.");
    const projected = projectImport(row, correlation.systemMessageId, correlation.configId);
    if (!projected.statusId) throw new Error("DataManager response is missing logStatusId.");
    importsByLogId.set(logId, {
      ...projected,
      totalRecordCount,
      failedRecordCount,
      successRecordCount: totalRecordCount - failedRecordCount,
    });
  }
  for (const logId of logIds) {
    if (!importsByLogId.has(logId)) throw new Error("Audit-correlated DataManager log was not returned.");
  }
  return importsByLogId;
}

function reconcileImportsWithSuccessfulAudits(
  importsBySystemMessageId: Record<string, ShopifyOrderSyncImport[]>,
  correlations: DurableAuditCorrelation[],
  authoritativeImportsByLogId: Map<string, ShopifyOrderSyncImport>,
): Record<string, ShopifyOrderSyncImport[]> {
  const reconciled = Object.fromEntries(
    Object.entries(importsBySystemMessageId).map(([systemMessageId, imports]) => [
      systemMessageId,
      imports.map((entry) => ({ ...entry })),
    ]),
  ) as Record<string, ShopifyOrderSyncImport[]>;
  for (const durable of correlations) {
    const { systemMessageId, configId } = durable;
    const existingImports = reconciled[systemMessageId] || [];
    const existingForConfig = existingImports.find((entry) => entry.configId === configId);
    if (existingForConfig?.logId === durable.logId) continue;
    const durableImport = authoritativeImportsByLogId.get(durable.logId);
    if (!durableImport || durableImport.systemMessageId !== systemMessageId || durableImport.configId !== configId) {
      throw new Error("Audit-correlated DataManager import crossed its expected scope.");
    }
    reconciled[systemMessageId] = [
      ...existingImports.filter((entry) => entry.configId !== configId),
      durableImport,
    ].sort((first, second) => ORDER_IMPORT_CONFIG_IDS.indexOf(first.configId) - ORDER_IMPORT_CONFIG_IDS.indexOf(second.configId));
  }

  return reconciled;
}

async function fetchCanonicalOrderSyncEvidence(
  shopId: string,
  systemMessageRemoteId: string,
  batches: ShopifyOrderSyncBatch[],
): Promise<{
  importsBySystemMessageId: Record<string, ShopifyOrderSyncImport[]>;
  recentOrders: ShopifyOrderSyncRecentOrder[];
}> {
  const [fetchedImportsBySystemMessageId, auditRows] = await Promise.all([
    fetchBatchImports(systemMessageRemoteId, batches),
    fetchAuditRows(shopId),
  ]);
  const recentOrders = normalizeRecentProcessedOrders(auditRows, { shopId, limit: SHOPIFY_ORDER_SYNC_RESULT_LIMIT });
  const correlations = latestDurableAuditCorrelations(recentOrders);
  const authoritativeImportsByLogId = await fetchAuditCorrelatedImports(systemMessageRemoteId, correlations);
  return {
    importsBySystemMessageId: reconcileImportsWithSuccessfulAudits(
      fetchedImportsBySystemMessageId,
      correlations,
      authoritativeImportsByLogId,
    ),
    recentOrders,
  };
}

function summaryFor(
  batches: ShopifyOrderSyncBatch[],
  importsBySystemMessageId: Record<string, ShopifyOrderSyncImport[]>,
  job: SafeShopifyOrderSyncJob | null,
  productStore: SafeShopifyOrderSyncProductStore | null,
): ShopifyOrderSyncSummary {
  const latestBatch = batches[0] || null;
  const progressFor = (batch: ShopifyOrderSyncBatch | null) => deriveShopifyOrderSyncProgress(batch, batch ? importsBySystemMessageId[batch.systemMessageId] || [] : []);
  const overallStatusFor = (batch: ShopifyOrderSyncBatch | null): OrderSyncProgressState => {
    const [batchProgress, importProgress] = progressFor(batch);
    if (batchProgress.state === "active" || batchProgress.state === "pending") return batchProgress.state;
    if (importProgress.state === "active" || importProgress.state === "pending") return "active";
    if (batchProgress.state === "failed") {
      return importProgress.state === "completed" || importProgress.state === "partial" ? "partial" : "failed";
    }
    return importProgress.state;
  };
  const activeBatches = batches.filter((batch) => {
    const state = overallStatusFor(batch);
    return state === "active" || state === "pending";
  });
  const latestCompletedBatch = batches.find((batch) => {
    const state = overallStatusFor(batch);
    return state === "completed" || state === "partial";
  }) || null;
  const latestProgress = progressFor(latestBatch);
  const completedProgress = progressFor(latestCompletedBatch);
  const activeJobRunId = activeBatches.length === 0
    && job?.latestJobRunId
    && isActiveJobRunStatus(job.lastRunStatusId)
    ? job.latestJobRunId
    : "";
  return {
    latestBatch,
    latestCompletedBatch,
    overallStatus: overallStatusFor(latestBatch),
    lastCompletedAt: latestCompletedBatch?.processedDate ?? latestCompletedBatch?.lastUpdatedStamp ?? latestCompletedBatch?.initDate,
    processedOrderCount: completedProgress[1].successfulRecords,
    pendingBatchRequests: Math.max(activeBatches.length, activeJobRunId ? 1 : 0),
    hasActiveWork: activeBatches.length > 0 || Boolean(activeJobRunId),
    activeWorkSystemMessageId: activeBatches[0]?.systemMessageId || "",
    activeWorkJobRunId: activeJobRunId,
    batchStatus: latestProgress[0].state,
    importStatus: latestProgress[1].state,
    progressRows: latestProgress,
    nextRunTime: job?.nextRunTime,
    paused: job ? job.paused : null,
    productStore,
  };
}

function emptySummary(): ShopifyOrderSyncSummary {
  return summaryFor([], {}, null, null);
}

function cardFromSummary(shopId: string, job: SafeShopifyOrderSyncJob | null, summary: ShopifyOrderSyncSummary, actionable = false): ShopifyOrderSyncCardSnapshot {
  const configurationState = !job ? "missing" : job.paused ? "configured-paused" : "configured-active";
  return {
    shopId,
    configurationState,
    processedCount: summary.processedOrderCount,
    pendingCount: summary.pendingBatchRequests,
    nextRunLabel: job?.paused ? "Paused" : summary.nextRunTime ? String(summary.nextRunTime) : undefined,
    lastCompletedLabel: summary.lastCompletedAt === undefined ? undefined : String(summary.lastCompletedAt),
    actionable,
    batchStatus: summary.progressRows[0].stateLabel,
    batchDetail: summary.latestBatch?.systemMessageId || "No batch request yet",
    importStatus: summary.progressRows[1].stateLabel,
    importDetail: summary.progressRows[1].logCount ? `${summary.progressRows[1].logCount} import${summary.progressRows[1].logCount === 1 ? "" : "s"}` : "No import yet",
    loading: false,
    error: null,
  };
}

export const useShopifyOrderSyncStore = defineStore("shopifyOrderSync", {
  state: () => ({
    selectedShopId: "",
    runtimeTimeZone: "",
    shop: null as SafeShopifyOrderSyncShop | null,
    productStore: null as SafeShopifyOrderSyncProductStore | null,
    remote: null as SafeShopifyOrderSyncRemote | null,
    templateJob: null as SafeShopifyOrderSyncJob | null,
    job: null as SafeShopifyOrderSyncJob | null,
    salesChannelMappings: [] as SafeShopifyOrderSyncMapping[],
    paymentMethodMappings: [] as SafeShopifyOrderSyncMapping[],
    shippingMethodMappings: [] as SafeShopifyCarrierShipmentMapping[],
    mappingReadiness: deriveOrderSyncMappingReadiness({}) as OrderSyncMappingReadiness,
    configurationState: deriveOrderSyncConfigurationState({}) as OrderSyncConfigurationState,
    configurationResources: configurationResources(),
    configurationError: null as string | null,
    configurationLoadedAt: null as number | null,
    cardSnapshot: null as ShopifyOrderSyncCardSnapshot | null,
    cardLoading: false,
    cardError: null as string | null,
    systemMessages: [] as ShopifyOrderSyncBatch[],
    batches: [] as ShopifyOrderSyncBatch[],
    importsBySystemMessageId: {} as Record<string, ShopifyOrderSyncImport[]>,
    recentOrders: [] as ShopifyOrderSyncRecentOrder[],
    recentErrors: [] as ShopifyOrderSyncRecentError[],
    recentRequestErrors: [] as ShopifyOrderSyncRecentError[],
    shopifyOutstandingOrderCount: {
      status: "idle",
      count: null,
      baselineCreatedAt: null,
      error: null,
    } as ShopifyOrderSyncOutstandingOrderCount,
    summary: emptySummary() as ShopifyOrderSyncSummary,
    monitoringLoading: false,
    monitoringRefreshing: false,
    monitoringError: null as string | null,
    monitoringLoadedAt: null as number | null,
    activeMutation: null as MutationName,
    mutationError: null as string | null,
    retryByErrorId: {} as Record<string, ShopifyOrderSyncRetryState>,
    lastRunResult: null as ShopifyOrderSyncRunResult | null,
    lifecycleGeneration: 0,
    requestToken: 0,
    outstandingOrderCountRequestToken: 0,
  }),

  getters: {
    capabilities(): OrderSyncCapabilities {
      return getShopifyOrderSyncCapabilities(useUserStore());
    },
    isBatchActive: (state): boolean => state.summary.hasActiveWork,
    canRunNow(): boolean {
      return this.capabilities.canRunNow && Boolean(this.job) && !this.job?.paused && !this.summary.hasActiveWork;
    },
    runNowDisabledReason(): string {
      if (!this.capabilities.canRunNow) return "COMMON_ADMIN permission is required to run Order Sync.";
      if (!this.job) return "Configure the selected shop's Order Sync job first.";
      if (this.job.paused) return "Resume Order Sync before running it now.";
      if (this.summary.activeWorkSystemMessageId) return `SystemMessage ${this.summary.activeWorkSystemMessageId} is still active.`;
      if (this.summary.activeWorkJobRunId) return `ServiceJobRun ${this.summary.activeWorkJobRunId} is still active.`;
      if (this.summary.hasActiveWork) return "The selected shop still has active Order Sync work.";
      return "";
    },
    filteredRecentOrders: (state) => (query: string): ShopifyOrderSyncRecentOrder[] => {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return state.recentOrders;
      return state.recentOrders.filter((row) => [row.shopifyOrderId, row.orderName]
        .some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
    },
    filteredRecentErrors: (state) => (query: string): ShopifyOrderSyncRecentError[] => {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return state.recentErrors;
      return state.recentErrors.filter((row) => [row.shopifyOrderId, row.orderName, row.errorText, row.systemMessageId, row.configId, row.logId, row.batchId]
        .some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
    },
    filteredRecentRequestErrors: (state) => (query: string): ShopifyOrderSyncRecentError[] => {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return state.recentRequestErrors;
      return state.recentRequestErrors.filter((row) => [row.errorText, row.systemMessageId, row.batchId]
        .some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
    },
  },

  actions: {
    resetForShop(shopId: string) {
      if (this.selectedShopId === shopId) return;
      this.lifecycleGeneration += 1;
      this.requestToken += 1;
      this.outstandingOrderCountRequestToken += 1;
      this.selectedShopId = shopId;
      this.runtimeTimeZone = "";
      this.shop = null;
      this.productStore = null;
      this.remote = null;
      this.templateJob = null;
      this.job = null;
      this.salesChannelMappings = [];
      this.paymentMethodMappings = [];
      this.shippingMethodMappings = [];
      this.mappingReadiness = deriveOrderSyncMappingReadiness({ selectedShopId: shopId });
      this.configurationState = deriveOrderSyncConfigurationState({});
      this.configurationResources = configurationResources();
      this.configurationError = null;
      this.configurationLoadedAt = null;
      this.cardSnapshot = null;
      this.cardLoading = false;
      this.cardError = null;
      this.systemMessages = [];
      this.batches = [];
      this.importsBySystemMessageId = {};
      this.recentOrders = [];
      this.recentErrors = [];
      this.recentRequestErrors = [];
      this.shopifyOutstandingOrderCount = {
        status: "idle",
        count: null,
        baselineCreatedAt: null,
        error: null,
      };
      this.summary = emptySummary();
      this.monitoringLoading = false;
      this.monitoringRefreshing = false;
      this.monitoringError = null;
      this.monitoringLoadedAt = null;
      this.activeMutation = null;
      this.mutationError = null;
      this.retryByErrorId = {};
      this.lastRunResult = null;
    },

    invalidateRequests() {
      this.lifecycleGeneration += 1;
      this.requestToken += 1;
      this.outstandingOrderCountRequestToken += 1;
      this.cardLoading = false;
      this.monitoringLoading = false;
      this.monitoringRefreshing = false;
      this.activeMutation = null;
    },

    invalidateReadRequests() {
      this.requestToken += 1;
      this.outstandingOrderCountRequestToken += 1;
      this.cardLoading = false;
      this.monitoringLoading = false;
      this.monitoringRefreshing = false;
    },

    async loadConfiguration(shopId: string) {
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      this.resetForShop(shopId);
      const token = ++this.requestToken;
      this.configurationError = null;
      this.configurationResources = Object.fromEntries(Object.keys(this.configurationResources).map((key) => [key, requestState("loading")])) as Record<ConfigurationResource, OrderSyncRequestState>;
      this.configurationState = deriveOrderSyncConfigurationState({ loading: true });
      try {
        const context = await fetchOrderSyncContext(shopId);
        if (token !== this.requestToken) return null;
        (["shop", "remote", "template", "job"] as ConfigurationResource[])
          .forEach((key) => { this.configurationResources[key] = requestState("ready"); });
        const [salesChannelMappings, paymentMethodMappings, shippingMethodMappings] = await Promise.all([
          fetchTypeMappings(shopId, "SHOPIFY_ORDER_SOURCE"),
          fetchTypeMappings(shopId, "SHOPIFY_PAYMENT_TYPE"),
          fetchShippingMappings(shopId),
        ]);
        if (token !== this.requestToken) return null;
        const { runtimeTimeZone, shop, productStore, remote, templateJob, job } = context;
        if (job && !isSuitableJob(job, remote, shopId)) throw new Error("The returned job is not a suitable shop-scoped batch Order Sync job.");
        this.shop = shop;
        this.runtimeTimeZone = runtimeTimeZone;
        this.productStore = productStore;
        this.remote = remote;
        this.templateJob = templateJob;
        this.job = job;
        this.salesChannelMappings = salesChannelMappings;
        this.paymentMethodMappings = paymentMethodMappings;
        this.shippingMethodMappings = shippingMethodMappings;
        this.mappingReadiness = deriveOrderSyncMappingReadiness({
          selectedShopId: shopId,
          salesChannelMappings,
          paymentMethodMappings,
          shippingMethodMappings,
        });
        (Object.keys(this.configurationResources) as ConfigurationResource[]).forEach((key) => { this.configurationResources[key] = requestState("ready"); });
        this.configurationState = deriveOrderSyncConfigurationState({ job });
        this.configurationLoadedAt = Date.now();
        return { runtimeTimeZone, shop, productStore, remote, templateJob, job, mappingReadiness: this.mappingReadiness };
      } catch (error) {
        if (token !== this.requestToken) return null;
        const message = error instanceof Error ? error.message : "Order Sync configuration could not be loaded.";
        this.configurationError = message;
        (Object.keys(this.configurationResources) as ConfigurationResource[]).forEach((key) => {
          if (this.configurationResources[key].status === "loading") this.configurationResources[key] = requestState("error", message);
        });
        this.configurationState = deriveOrderSyncConfigurationState({ error: message });
        throw error;
      }
    },

    async loadCardSnapshot(shopId: string): Promise<ShopifyOrderSyncCardSnapshot> {
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      this.resetForShop(shopId);
      const token = ++this.requestToken;
      this.cardLoading = true;
      this.cardError = null;
      try {
        const { runtimeTimeZone, shop, productStore, remote, templateJob, job } = await fetchOrderSyncContext(shopId);
        if (job && !isSuitableJob(job, remote, shopId)) throw new Error("The returned job is not a suitable shop-scoped batch Order Sync job.");
        const systemMessages = await fetchSystemMessages(shopId, remote.systemMessageRemoteId);
        const batches = scheduledBatches(systemMessages);
        const { importsBySystemMessageId, recentOrders } = await fetchCanonicalOrderSyncEvidence(
          shopId,
          remote.systemMessageRemoteId,
          batches,
        );
        if (token !== this.requestToken) return this.cardSnapshot || cardFromSummary(shopId, null, emptySummary());
        const summary = summaryFor(batches, importsBySystemMessageId, job, productStore);
        this.shop = shop;
        this.runtimeTimeZone = runtimeTimeZone;
        this.productStore = productStore;
        this.remote = remote;
        this.templateJob = templateJob;
        this.job = job;
        this.systemMessages = systemMessages;
        this.batches = batches;
        this.importsBySystemMessageId = importsBySystemMessageId;
        this.recentOrders = recentOrders;
        this.summary = summary;
        this.configurationState = deriveOrderSyncConfigurationState({ job });
        this.cardSnapshot = cardFromSummary(shopId, job, summary, true);
        return this.cardSnapshot;
      } catch (error) {
        if (token !== this.requestToken) {
          return this.cardSnapshot || cardFromSummary(this.selectedShopId || shopId, this.job, this.summary);
        }
        const message = error instanceof Error ? error.message : "Order Sync card status could not be loaded.";
        this.cardError = message;
        this.cardSnapshot = { ...(this.cardSnapshot || cardFromSummary(shopId, null, emptySummary())), loading: false, error: message };
        throw error;
      } finally {
        if (token === this.requestToken) this.cardLoading = false;
      }
    },

    async loadRecentAudits(selectedShopId?: string): Promise<ShopifyOrderSyncRecentOrder[]> {
      const shopId = selectedShopId || this.selectedShopId;
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      const rows = await fetchAuditRows(shopId);
      const recentOrders = normalizeRecentProcessedOrders(rows, { shopId, limit: SHOPIFY_ORDER_SYNC_RESULT_LIMIT });
      if (shopId === this.selectedShopId) this.recentOrders = recentOrders;
      return recentOrders;
    },

    async loadOutstandingOrderCount(
      recentOrders: ShopifyOrderSyncRecentOrder[] = this.recentOrders,
      selectedShopId = this.selectedShopId,
    ): Promise<ShopifyOrderSyncOutstandingOrderCount> {
      const remoteId = String(this.remote?.systemMessageRemoteId || "").trim();
      const latestLocalOrder = recentOrders
        .filter((order) => order.shopId === selectedShopId && order.shopifyFetchVerified && /^(?!0+$)\d{1,30}$/.test(order.shopifyOrderId))
        .sort((first, second) => second.processedAtMillis - first.processedAtMillis)[0];
      const generation = this.lifecycleGeneration;
      const requestToken = ++this.outstandingOrderCountRequestToken;
      const setState = (state: ShopifyOrderSyncOutstandingOrderCount) => {
        if (
          generation === this.lifecycleGeneration
          && requestToken === this.outstandingOrderCountRequestToken
          && this.selectedShopId === selectedShopId
        ) {
          this.shopifyOutstandingOrderCount = state;
        }
        return state;
      };

      if (!remoteId || !latestLocalOrder) {
        return setState({ status: "ready", count: null, baselineCreatedAt: null, error: null });
      }

      setState({ status: "loading", count: null, baselineCreatedAt: null, error: null });
      try {
        const orderGid = `gid://shopify/Order/${latestLocalOrder.shopifyOrderId}`;
        const orderResponse = await api({
          url: "shopify/graphql",
          method: "post",
          data: {
            systemMessageRemoteId: remoteId,
            queryText: `query { order(id: ${JSON.stringify(orderGid)}) { createdAt } }`,
          },
        }) as any;
        const orderPayload = orderResponse?.data?.response || orderResponse?.data || orderResponse;
        if (orderResponse?.data?.errors?.length || orderPayload?.errors?.length) {
          throw new Error("Shopify order baseline returned GraphQL errors.");
        }
        const baselineCreatedAt = String(orderPayload?.order?.createdAt || "");
        if (!baselineCreatedAt || !Number.isFinite(Date.parse(baselineCreatedAt))) {
          return setState({ status: "ready", count: null, baselineCreatedAt: null, error: null });
        }

        const countResponse = await api({
          url: "shopify/graphql",
          method: "post",
          data: {
            systemMessageRemoteId: remoteId,
            queryText: `query { ordersCount(query: ${JSON.stringify(`created_at:>${baselineCreatedAt}`)}) { count } }`,
          },
        }) as any;
        const countPayload = countResponse?.data?.response || countResponse?.data || countResponse;
        if (countResponse?.data?.errors?.length || countPayload?.errors?.length) {
          throw new Error("Shopify outstanding order count returned GraphQL errors.");
        }
        const count = Number(countPayload?.ordersCount?.count);
        if (!Number.isInteger(count) || count < 0) throw new Error("Shopify outstanding order count returned an invalid count.");
        return setState({ status: "ready", count, baselineCreatedAt, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Shopify outstanding order count could not load.";
        return setState({ status: "error", count: null, baselineCreatedAt: null, error: message });
      }
    },

    async loadHistory(shopId: string) {
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      this.resetForShop(shopId);
      const token = ++this.requestToken;
      try {
        const { runtimeTimeZone, shop, productStore, remote, templateJob, job } = await fetchOrderSyncContext(shopId);
        if (job && !isSuitableJob(job, remote, shopId)) throw new Error("The returned job is not a suitable shop-scoped batch Order Sync job.");
        const systemMessages = await fetchSystemMessages(shopId, remote.systemMessageRemoteId);
        const batches = scheduledBatches(systemMessages);
        const { importsBySystemMessageId, recentOrders } = await fetchCanonicalOrderSyncEvidence(
          shopId,
          remote.systemMessageRemoteId,
          batches,
        );
        if (token !== this.requestToken) return null;
        const summary = summaryFor(batches, importsBySystemMessageId, job, productStore);
        this.runtimeTimeZone = runtimeTimeZone;
        this.shop = shop;
        this.productStore = productStore;
        this.remote = remote;
        this.templateJob = templateJob;
        this.job = job;
        this.systemMessages = systemMessages;
        this.batches = batches;
        this.importsBySystemMessageId = importsBySystemMessageId;
        this.recentOrders = recentOrders;
        this.summary = summary;
        this.configurationState = deriveOrderSyncConfigurationState({ job });
        this.cardSnapshot = cardFromSummary(shopId, job, summary, true);
        return { runtimeTimeZone, shop, productStore, remote, job, systemMessages, batches, importsBySystemMessageId, recentOrders, summary };
      } catch (error) {
        if (token !== this.requestToken) return null;
        throw error;
      }
    },

    async loadMonitoring(shopId: string) {
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      this.resetForShop(shopId);
      const token = ++this.requestToken;
      const hasStaleData = Boolean(this.monitoringLoadedAt);
      this.monitoringLoading = !hasStaleData;
      this.monitoringRefreshing = hasStaleData;
      this.monitoringError = null;
      try {
        const { runtimeTimeZone, shop, productStore, remote, templateJob, job } = await fetchOrderSyncContext(shopId);
        if (job && !isSuitableJob(job, remote, shopId)) throw new Error("The returned job is not a suitable shop-scoped batch Order Sync job.");
        const [systemMessages, errorProjection] = await Promise.all([
          fetchSystemMessages(shopId, remote.systemMessageRemoteId),
          fetchRecentErrors(shopId),
        ]);
        const batches = scheduledBatches(systemMessages);
        const { importsBySystemMessageId, recentOrders } = await fetchCanonicalOrderSyncEvidence(
          shopId,
          remote.systemMessageRemoteId,
          batches,
        );
        const { recentErrors, recentRequestErrors } = errorProjection;
        if (token !== this.requestToken) return null;
        const summary = summaryFor(batches, importsBySystemMessageId, job, productStore);
        this.shop = shop;
        this.runtimeTimeZone = runtimeTimeZone;
        this.productStore = productStore;
        this.remote = remote;
        this.templateJob = templateJob;
        this.job = job;
        this.systemMessages = systemMessages;
        this.batches = batches;
        this.importsBySystemMessageId = importsBySystemMessageId;
        this.recentOrders = recentOrders;
        this.recentErrors = recentErrors;
        this.recentRequestErrors = recentRequestErrors;
        this.summary = summary;
        this.configurationState = deriveOrderSyncConfigurationState({ job });
        this.cardSnapshot = cardFromSummary(shopId, job, summary, true);
        this.monitoringLoadedAt = Date.now();
        return { runtimeTimeZone, shop, productStore, remote, job, systemMessages, batches, importsBySystemMessageId, recentOrders, recentErrors, recentRequestErrors, summary };
      } catch (error) {
        if (token !== this.requestToken) return null;
        this.monitoringError = error instanceof Error ? error.message : "Order Sync monitoring could not be loaded.";
        throw error;
      } finally {
        if (token === this.requestToken) {
          this.monitoringLoading = false;
          this.monitoringRefreshing = false;
        }
      }
    },

    async refresh() {
      if (!this.selectedShopId) throw new Error("A Shopify shop ID is required.");
      return this.loadMonitoring(this.selectedShopId);
    },

    requireAdmin(action: keyof Omit<OrderSyncCapabilities, "canMonitor">) {
      if (!this.capabilities[action]) throw new Error("COMMON_ADMIN permission is required for this Order Sync action.");
      // This is an interface guard only. Every connector mutation remains server-authoritative.
    },

    async configure(input: { shopId?: string } = {}): Promise<SafeShopifyOrderSyncJob> {
      this.requireAdmin("canConfigure");
      const shopId = input.shopId || this.selectedShopId;
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      if (this.selectedShopId !== shopId || !this.configurationLoadedAt) await this.loadConfiguration(shopId);
      if (this.job) throw new Error("A suitable Order Sync job already exists for this Shopify shop.");
      if (!this.remote || !this.templateJob) throw new Error("The selected shop remote and standard job must be verified before configuration.");
      if (this.activeMutation) throw new Error("Another Order Sync change is already in progress.");
      this.activeMutation = "configure";
      this.mutationError = null;
      const lifecycleGeneration = this.lifecycleGeneration;
      try {
        const payload = await requestBackend({
          url: `shopify/order-sync/${encodeURIComponent(shopId)}/job`,
          method: "post",
          data: {},
        }, "Configuring Shopify Order Sync");
        if (lifecycleGeneration !== this.lifecycleGeneration || this.selectedShopId !== shopId) {
          throw new Error("The selected Shopify shop changed before configuration completed.");
        }
        const context = normalizeOrderSyncContext(payload, "Configure Order Sync response", shopId);
        const job = context.job;
        if (!job || !job.paused || !isSuitableJob(job, context.remote, shopId)) throw new Error("Configured Order Sync job did not satisfy the paused, shop, remote, type, and batch contract.");
        if (!context.templateJob.cronExpression || job.cronExpression !== context.templateJob.cronExpression) {
          throw new Error("Configured Order Sync job did not inherit the standard schedule.");
        }
        this.invalidateReadRequests();
        this.runtimeTimeZone = context.runtimeTimeZone;
        this.shop = context.shop;
        this.productStore = context.productStore;
        this.remote = context.remote;
        this.templateJob = context.templateJob;
        this.job = job;
        this.configurationState = deriveOrderSyncConfigurationState({ job });
        return job;
      } catch (error) {
        if (lifecycleGeneration === this.lifecycleGeneration && this.selectedShopId === shopId) {
          this.mutationError = error instanceof Error ? error.message : "Shopify Order Sync could not be configured.";
        }
        throw error;
      } finally {
        if (lifecycleGeneration === this.lifecycleGeneration && this.activeMutation === "configure") this.activeMutation = null;
      }
    },

    async updateSchedule(cronExpression: string, selectedShopId?: string): Promise<SafeShopifyOrderSyncJob> {
      this.requireAdmin("canEditSchedule");
      const shopId = selectedShopId || this.selectedShopId;
      if (!shopId || !cronExpression.trim()) throw new Error("Shop ID and cron expression are required.");
      if (!this.job?.jobName) throw new Error("Configure the selected shop's Order Sync job first.");
      if (this.selectedShopId !== shopId || this.job.shopId !== shopId) throw new Error("The loaded Order Sync job does not belong to the selected Shopify shop.");
      if (this.activeMutation) throw new Error("Another Order Sync change is already in progress.");
      this.activeMutation = "schedule";
      this.mutationError = null;
      const lifecycleGeneration = this.lifecycleGeneration;
      try {
        const payload = await requestBackend({
          url: `shopify/order-sync/${encodeURIComponent(shopId)}/job`,
          method: "put",
          data: { jobName: this.job?.jobName, cronExpression: cronExpression.trim() },
        }, "Updating the Order Sync schedule");
        if (lifecycleGeneration !== this.lifecycleGeneration || this.selectedShopId !== shopId) {
          throw new Error("The selected Shopify shop changed before the schedule update completed.");
        }
        const job = normalizeJobResponse(payload, "Order Sync schedule response", shopId);
        if (!job || job.cronExpression !== cronExpression.trim()) throw new Error("The saved Order Sync schedule could not be verified.");
        this.invalidateReadRequests();
        this.job = job;
        this.configurationState = deriveOrderSyncConfigurationState({ job });
        return job;
      } catch (error) {
        if (lifecycleGeneration === this.lifecycleGeneration && this.selectedShopId === shopId) {
          this.mutationError = error instanceof Error ? error.message : "The Order Sync schedule could not be updated.";
        }
        throw error;
      } finally {
        if (lifecycleGeneration === this.lifecycleGeneration && this.activeMutation === "schedule") this.activeMutation = null;
      }
    },

    async updateJobStatus(paused: boolean, selectedShopId?: string): Promise<SafeShopifyOrderSyncJob> {
      this.requireAdmin("canActivate");
      const shopId = selectedShopId || this.selectedShopId;
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      if (!this.job?.jobName) throw new Error("Configure the selected shop's Order Sync job first.");
      if (this.selectedShopId !== shopId || this.job.shopId !== shopId) throw new Error("The loaded Order Sync job does not belong to the selected Shopify shop.");
      if (this.activeMutation) throw new Error("Another Order Sync change is already in progress.");
      this.activeMutation = "status";
      this.mutationError = null;
      const lifecycleGeneration = this.lifecycleGeneration;
      try {
        const payload = await requestBackend({
          url: `shopify/order-sync/${encodeURIComponent(shopId)}/job`,
          method: "put",
          data: { jobName: this.job?.jobName, paused },
        }, paused ? "Pausing Order Sync" : "Activating Order Sync");
        if (lifecycleGeneration !== this.lifecycleGeneration || this.selectedShopId !== shopId) {
          throw new Error("The selected Shopify shop changed before the status update completed.");
        }
        const job = normalizeJobResponse(payload, "Order Sync status response", shopId);
        if (!job || job.paused !== paused) throw new Error("The saved Order Sync status could not be verified.");
        this.invalidateReadRequests();
        this.job = job;
        this.configurationState = deriveOrderSyncConfigurationState({ job });
        return job;
      } catch (error) {
        if (lifecycleGeneration === this.lifecycleGeneration && this.selectedShopId === shopId) {
          this.mutationError = error instanceof Error ? error.message : "The Order Sync status could not be updated.";
        }
        throw error;
      } finally {
        if (lifecycleGeneration === this.lifecycleGeneration && this.activeMutation === "status") this.activeMutation = null;
      }
    },

    async runNow(input: { shopId?: string } = {}): Promise<ShopifyOrderSyncRunResult> {
      this.requireAdmin("canRunNow");
      const shopId = input.shopId || this.selectedShopId;
      if (!shopId) throw new Error("A Shopify shop ID is required.");
      if (!this.job) throw new Error("Configure the selected shop's Order Sync job first.");
      if (this.selectedShopId !== shopId || this.job.shopId !== shopId) throw new Error("The loaded Order Sync job does not belong to the selected Shopify shop.");
      if (this.job.paused) throw new Error(this.runNowDisabledReason);
      if (this.summary.hasActiveWork) throw new Error(this.runNowDisabledReason);
      if (this.activeMutation) throw new Error("Another Order Sync change is already in progress.");
      this.activeMutation = "run-now";
      this.mutationError = null;
      const lifecycleGeneration = this.lifecycleGeneration;
      const jobName = this.job.jobName;
      try {
        const payload = await requestBackend({
          url: `shopify/order-sync/${encodeURIComponent(shopId)}/run`,
          method: "post",
          data: { jobName },
        }, "Queuing Shopify Order Sync");
        if (lifecycleGeneration !== this.lifecycleGeneration || this.selectedShopId !== shopId) {
          throw new Error("The selected Shopify shop changed before Order Sync was queued.");
        }
        if (!isRecord(payload)) throw new Error("Run now returned an invalid response shape.");
        const result = {
          jobRunId: textValue(payload, ["jobRunId"]),
          systemMessageId: textValue(payload, ["systemMessageId"]),
        };
        if (!result.jobRunId && !result.systemMessageId) throw new Error("Run now did not return a job run or SystemMessage ID.");
        if (result.jobRunId && !SAFE_CORRELATION_ID.test(result.jobRunId)) {
          throw new Error("Run now returned an invalid ServiceJobRun ID.");
        }
        if (result.systemMessageId && !SAFE_CORRELATION_ID.test(result.systemMessageId)) {
          throw new Error("Run now returned an invalid SystemMessage ID.");
        }
        this.invalidateReadRequests();
        if (result.jobRunId && this.job) {
          this.job = {
            ...this.job,
            lastRunStatusId: "Pending",
            latestJobRunId: result.jobRunId,
          };
          this.summary = summaryFor(this.batches, this.importsBySystemMessageId, this.job, this.productStore);
          this.cardSnapshot = cardFromSummary(shopId, this.job, this.summary, true);
        }
        this.lastRunResult = result;
        return result;
      } catch (error) {
        if (lifecycleGeneration === this.lifecycleGeneration && this.selectedShopId === shopId) {
          this.mutationError = error instanceof Error ? error.message : "Shopify Order Sync could not be queued.";
        }
        throw error;
      } finally {
        if (lifecycleGeneration === this.lifecycleGeneration && this.activeMutation === "run-now") this.activeMutation = null;
      }
    },

    async searchShopifyOrders(input: { queryString: string; after?: string; pageSize?: number; shopId?: string }): Promise<ShopifyOrderSyncSearchState> {
      const systemMessageRemoteId = String(this.remote?.systemMessageRemoteId || "").trim();
      const queryString = String(input.queryString || "").trim();
      if (!systemMessageRemoteId) throw new Error("Shopify order search is unavailable for this shop.");
      const pageSize = Math.min(Math.max(Number(input.pageSize) || 20, 1), 50);
      const searchQuery = queryString && (/^#?\d+$/.test(queryString)
        ? `name:#${queryString.replace(/^#/, "")}`
        : queryString);
      const after = input.after ? JSON.stringify(input.after) : "null";
      const orderArguments = searchQuery
        ? `first: ${pageSize}, after: ${after}, query: ${JSON.stringify(searchQuery)}`
        : `first: ${pageSize}, after: ${after}, sortKey: CREATED_AT, reverse: true`;
      const queryText = `query { orders(${orderArguments}) { edges { cursor node { id legacyResourceId name createdAt updatedAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } customer { displayName } } } pageInfo { hasNextPage endCursor } } }`;

      const response = await api({
        url: "shopify/graphql",
        method: "post",
        data: { systemMessageRemoteId, queryText }
      }) as any;
      const payload = response?.data?.response || response?.data || response;
      if (response?.data?.errors?.length || payload?.errors?.length) {
        throw new Error("Shopify order search returned GraphQL errors.");
      }
      const connection = payload?.orders;
      if (!Array.isArray(connection?.edges)) throw new Error("Shopify order search returned no orders connection.");

      return {
        orders: connection.edges.map((edge: any) => {
          const order = edge?.node || {};
          return {
            id: String(order.id || ""),
            legacyResourceId: String(order.legacyResourceId || ""),
            name: String(order.name || order.legacyResourceId || ""),
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            displayFinancialStatus: order.displayFinancialStatus,
            displayFulfillmentStatus: order.displayFulfillmentStatus,
            totalAmount: order.totalPriceSet?.shopMoney?.amount,
            currencyCode: order.totalPriceSet?.shopMoney?.currencyCode,
            customerName: order.customer?.displayName,
            cursor: edge?.cursor
          };
        }).filter((order: ShopifyOrderSyncSearchResult) => order.legacyResourceId),
        hasNextPage: Boolean(connection.pageInfo?.hasNextPage),
        endCursor: String(connection.pageInfo?.endCursor || "")
      };
    },

    async requestSelectedOrders(input: { shopifyOrderIds: string[]; shopId?: string }): Promise<ShopifyOrderSyncCustomRequestResult> {
      this.requireAdmin("canRetryIndividualOrder");
      const shopId = this.selectedShopId;
      if (!shopId || (input.shopId && input.shopId !== shopId)) {
        throw new Error("Selected Shopify orders cannot override the active shop.");
      }
      const shopifyOrderIds = [...new Set(input.shopifyOrderIds.map((value) => String(value || "").trim()))];
      if (!shopifyOrderIds.length || shopifyOrderIds.length > 50 || shopifyOrderIds.some((value) => !validShopifyOrderId(value))) {
        throw new Error("Select between 1 and 50 resolvable Shopify order IDs.");
      }

      const lifecycleGeneration = this.lifecycleGeneration;
      const results = await Promise.all(shopifyOrderIds.map(async (shopifyOrderId) => {
        const requestId = globalThis.crypto?.randomUUID?.();
        if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
          return { shopifyOrderId, failed: true as const };
        }
        try {
          const payload = await requestBackend({
            url: `shopify/order-sync/${encodeURIComponent(shopId)}/retry`,
            method: "post",
            data: { shopifyOrderId, requestId },
          }, "Downloading the selected Shopify order");
          const systemMessageId = isRecord(payload) ? textValue(payload, ["systemMessageId"]) : "";
          if (!systemMessageId) return { shopifyOrderId, failed: true as const };
          return { shopifyOrderId, requestId, systemMessageId, failed: false as const };
        } catch (_error) {
          return { shopifyOrderId, failed: true as const };
        }
      }));

      if (lifecycleGeneration !== this.lifecycleGeneration || this.selectedShopId !== shopId) {
        throw new Error("The selected Shopify shop changed before the custom request completed.");
      }
      return {
        queued: results.filter((result) => !result.failed).map(({ shopifyOrderId, requestId, systemMessageId }) => ({
          shopifyOrderId,
          requestId: requestId!,
          systemMessageId: systemMessageId!,
        })),
        failedOrderIds: results.filter((result) => result.failed).map(({ shopifyOrderId }) => shopifyOrderId),
      };
    },

    async retryIndividualOrder(input: { errorId: string; shopifyOrderId: string; shopId?: string }): Promise<ShopifyOrderSyncRetryResult> {
      this.requireAdmin("canRetryIndividualOrder");
      const shopId = this.selectedShopId;
      if (!shopId || !input.errorId || !validShopifyOrderId(input.shopifyOrderId)) {
        throw new Error("A selected shop, error record, and resolvable Shopify order ID are required.");
      }
      if (input.shopId && input.shopId !== shopId) {
        throw new Error("A retry cannot override the selected Shopify shop.");
      }
      const existingError = this.recentErrors.find((error) => error.id === input.errorId);
      if (!existingError || existingError.shopId !== shopId || existingError.shopifyOrderId !== input.shopifyOrderId) throw new Error("The retry target is not present in the selected shop's loaded error history.");
      if (this.retryByErrorId[input.errorId]?.pending) throw new Error("This Shopify order retry is already in progress.");
      const lifecycleGeneration = this.lifecycleGeneration;
      const previousRetry = this.retryByErrorId[input.errorId];
      const requestId = previousRetry?.requestId && !previousRetry.systemMessageId
        ? previousRetry.requestId
        : globalThis.crypto?.randomUUID?.();
      if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        throw new Error("A valid UUID retry request ID is required.");
      }
      this.retryByErrorId = { ...this.retryByErrorId, [input.errorId]: { pending: true, error: null, requestId } };
      try {
        const payload = await requestBackend({
          url: `shopify/order-sync/${encodeURIComponent(shopId)}/retry`,
          method: "post",
          data: {
            shopifyOrderId: input.shopifyOrderId,
            requestId,
          },
        }, "Retrying the Shopify order");
        if (lifecycleGeneration !== this.lifecycleGeneration || this.selectedShopId !== shopId) {
          throw new Error("The selected Shopify shop changed before the order retry completed.");
        }
        if (!isRecord(payload)) throw new Error("Order retry returned an invalid response shape.");
        const systemMessageId = textValue(payload, ["systemMessageId"]);
        if (!systemMessageId) throw new Error("Order retry did not return a SystemMessage ID.");
        this.retryByErrorId = { ...this.retryByErrorId, [input.errorId]: { pending: false, error: null, requestId, systemMessageId } };
        // Deliberately do not remove, acknowledge, replace, or mutate the original error row.
        return { requestId, systemMessageId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "The Shopify order could not be retried.";
        if (lifecycleGeneration === this.lifecycleGeneration && this.selectedShopId === shopId) {
          this.retryByErrorId = { ...this.retryByErrorId, [input.errorId]: { pending: false, error: message, requestId } };
        }
        throw error;
      }
    },

    clearShopifyOrderSyncState() {
      const nextLifecycleGeneration = this.lifecycleGeneration + 1;
      const nextRequestToken = this.requestToken + 1;
      this.$reset();
      this.lifecycleGeneration = nextLifecycleGeneration;
      this.requestToken = nextRequestToken;
    },
  },
});
