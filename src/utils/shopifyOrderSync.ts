export const SHOPIFY_ORDER_SYNC_TEMPLATE_JOB = "queue_ShopifyOrderSync";
export const SHOPIFY_ORDER_SYNC_MESSAGE_TYPE = "ShopifyOrderSync";
export const SHOPIFY_ORDER_SYNC_ADMIN_PERMISSION = "COMMON_ADMIN";
export const SHOPIFY_ORDER_SYNC_ACTIVE_POLL_MS = 10_000;
export const SHOPIFY_ORDER_SYNC_IDLE_POLL_MS = 60_000;
export const SHOPIFY_ORDER_SYNC_RESULT_LIMIT = 100;

type UnknownRecord = Record<string, unknown>;
type ValueSource = UnknownRecord | null | undefined;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function firstValue(source: ValueSource, keys: readonly string[]): unknown {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && valueText(value)) return value;
  }
  return undefined;
}

function firstText(source: ValueSource, keys: readonly string[]): string {
  return valueText(firstValue(source, keys));
}

function normalizeToken(value: unknown): string {
  return valueText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isTruthy(value: unknown): boolean {
  if (value === true) return true;
  return ["true", "y", "yes", "1"].includes(valueText(value).toLowerCase());
}

function numberValue(source: ValueSource, keys: readonly string[]): number {
  const value = Number(firstValue(source, keys));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function timestampValue(value: unknown): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 100_000_000_000 ? value * 1000 : value;
  }

  const text = valueText(value);
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return timestampValue(Number(text));
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampFrom(source: ValueSource, keys: readonly string[]): number {
  return timestampValue(firstValue(source, keys));
}

function originalTimestamp(source: ValueSource, keys: readonly string[]): string | number | undefined {
  const value = firstValue(source, keys);
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function boundedLimit(limit: unknown): number {
  const parsed = Math.trunc(Number(limit));
  if (!Number.isFinite(parsed) || parsed < 1) return SHOPIFY_ORDER_SYNC_RESULT_LIMIT;
  return Math.min(parsed, SHOPIFY_ORDER_SYNC_RESULT_LIMIT);
}

export interface ServiceJobParameterLike {
  parameterName?: string;
  name?: string;
  parameterValue?: unknown;
  value?: unknown;
  [key: string]: unknown;
}

export interface ServiceJobLike {
  jobName?: string;
  parentJobName?: string;
  templateJobName?: string;
  sourceJobName?: string;
  clonedFromJobName?: string;
  paused?: unknown;
  isPaused?: unknown;
  isActive?: unknown;
  systemMessageRemoteId?: string;
  remoteId?: string;
  systemMessageTypeId?: string;
  messageTypeId?: string;
  parameters?: UnknownRecord | ServiceJobParameterLike[];
  serviceJobParameters?: ServiceJobParameterLike[];
  [key: string]: unknown;
}

export interface SystemMessageRemoteLike {
  systemMessageRemoteId?: string;
  remoteId?: string;
  shopifyRemoteId?: string;
  id?: string;
  internalId?: string;
  shopId?: string;
  [key: string]: unknown;
}

export function getServiceJobParameterMap(job: ServiceJobLike | null | undefined): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  if (!job) return parameters;

  if (isRecord(job.parameters)) Object.assign(parameters, job.parameters);

  const parameterRows = [
    ...(Array.isArray(job.parameters) ? job.parameters : []),
    ...(Array.isArray(job.serviceJobParameters) ? job.serviceJobParameters : [])
  ];
  parameterRows.forEach((parameter) => {
    const name = firstText(parameter, ["parameterName", "name"]);
    if (name) parameters[name] = firstValue(parameter, ["parameterValue", "value"]);
  });
  return parameters;
}

function parameterText(job: ServiceJobLike, aliases: readonly string[]): string {
  const parameters = getServiceJobParameterMap(job);
  return firstText(parameters, aliases) || firstText(job, aliases);
}

export function getSystemMessageRemoteId(remote: string | SystemMessageRemoteLike | null | undefined): string {
  if (typeof remote === "string") return valueText(remote);
  return firstText(remote, ["systemMessageRemoteId", "remoteId", "shopifyRemoteId", "id"]);
}

function hasOrderSyncTemplateRelation(job: ServiceJobLike): boolean {
  const jobName = valueText(job.jobName);
  if (!jobName || jobName === SHOPIFY_ORDER_SYNC_TEMPLATE_JOB) return false;

  const declaredTemplate = firstText(job, [
    "parentJobName",
    "templateJobName",
    "sourceJobName",
    "clonedFromJobName"
  ]);
  if (declaredTemplate) return declaredTemplate === SHOPIFY_ORDER_SYNC_TEMPLATE_JOB;

  // Current cloned jobs predate persisted clone provenance and use this canonical name.
  return jobName.startsWith(`${SHOPIFY_ORDER_SYNC_TEMPLATE_JOB}_`);
}

export function isSuitableShopifyOrderSyncJob(
  job: ServiceJobLike | null | undefined,
  selectedRemote: string | SystemMessageRemoteLike | null | undefined
): job is ServiceJobLike {
  if (!job || !hasOrderSyncTemplateRelation(job)) return false;
  const remoteId = getSystemMessageRemoteId(selectedRemote);
  if (!remoteId) return false;

  const jobRemoteId = parameterText(job, [
    "systemMessageRemoteId",
    "remoteId",
    "shopifyRemoteId"
  ]);
  const messageTypeId = parameterText(job, ["systemMessageTypeId", "messageTypeId", "typeId"]);
  const runAsBatch = parameterText(job, ["runAsBatch", "batch", "isBatch"]);

  return jobRemoteId === remoteId
    && normalizeToken(messageTypeId) === normalizeToken(SHOPIFY_ORDER_SYNC_MESSAGE_TYPE)
    && isTruthy(runAsBatch);
}

export function findSuitableShopifyOrderSyncJob(
  jobs: readonly ServiceJobLike[],
  selectedRemote: string | SystemMessageRemoteLike | null | undefined
): ServiceJobLike | null {
  return jobs.find((job) => isSuitableShopifyOrderSyncJob(job, selectedRemote)) || null;
}

export type OrderSyncConfigurationStateKind =
  | "loading"
  | "error"
  | "missing"
  | "configured-paused"
  | "configured-active";

export interface OrderSyncConfigurationState {
  kind: OrderSyncConfigurationStateKind;
  configured: boolean;
  paused: boolean | null;
  error: unknown | null;
}

export function isServiceJobPaused(job: ServiceJobLike): boolean {
  if (job.isPaused !== undefined) return isTruthy(job.isPaused);
  if (job.paused !== undefined) return isTruthy(job.paused);
  if (job.isActive !== undefined) return !isTruthy(job.isActive);
  return false;
}

export function deriveOrderSyncConfigurationState(input: {
  loading?: boolean;
  error?: unknown;
  job?: ServiceJobLike | null;
}): OrderSyncConfigurationState {
  // An API failure is never collapsed into the actionable "missing" state.
  if (input.error !== undefined && input.error !== null) {
    return { kind: "error", configured: false, paused: null, error: input.error };
  }
  if (input.loading) return { kind: "loading", configured: false, paused: null, error: null };
  if (!input.job) return { kind: "missing", configured: false, paused: null, error: null };

  const paused = isServiceJobPaused(input.job);
  return {
    kind: paused ? "configured-paused" : "configured-active",
    configured: true,
    paused,
    error: null
  };
}

export type OrderSyncMappingFamilyId = "sales-channel" | "payment-method" | "shipping-method";

export interface OrderSyncMappingFamilyReadiness {
  id: OrderSyncMappingFamilyId;
  mappedTypeId: "SHOPIFY_ORDER_SOURCE" | "SHOPIFY_PAYMENT_TYPE" | null;
  label: string;
  ready: boolean;
  count: number;
  blocking: false;
  warning: string | null;
}

export interface OrderSyncMappingReadiness {
  families: readonly [
    OrderSyncMappingFamilyReadiness,
    OrderSyncMappingFamilyReadiness,
    OrderSyncMappingFamilyReadiness
  ];
  allReady: boolean;
  hasWarnings: boolean;
  blocking: false;
  warnings: string[];
}

export interface OrderSyncMappingInput {
  selectedShopId?: string;
  typeMappings?: readonly UnknownRecord[];
  salesChannelMappings?: readonly unknown[] | number | boolean;
  paymentMethodMappings?: readonly unknown[] | number | boolean;
  shippingMethodMappings?: readonly unknown[] | number | boolean;
  shipmentMethodMappings?: readonly unknown[] | number | boolean;
}

function selectedShopRecords(records: readonly UnknownRecord[], selectedShopId?: string): UnknownRecord[] {
  const shopId = valueText(selectedShopId);
  if (!shopId) return [...records];
  return records.filter((record) => firstText(record, ["shopId", "internalId", "shopifyShopId"]) === shopId);
}

function readinessCount(value: readonly unknown[] | number | boolean | undefined): number {
  if (Array.isArray(value)) return value.length;
  if (value === true) return 1;
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function deriveOrderSyncMappingReadiness(input: OrderSyncMappingInput): OrderSyncMappingReadiness {
  const typeMappings = selectedShopRecords(input.typeMappings || [], input.selectedShopId);
  const salesCount = input.salesChannelMappings === undefined
    ? typeMappings.filter((record) => firstText(record, ["mappedTypeId", "mappingTypeId"]) === "SHOPIFY_ORDER_SOURCE").length
    : readinessCount(input.salesChannelMappings);
  const paymentCount = input.paymentMethodMappings === undefined
    ? typeMappings.filter((record) => firstText(record, ["mappedTypeId", "mappingTypeId"]) === "SHOPIFY_PAYMENT_TYPE").length
    : readinessCount(input.paymentMethodMappings);
  const shippingInput = input.shippingMethodMappings ?? input.shipmentMethodMappings;
  const shippingRecords = Array.isArray(shippingInput)
    ? selectedShopRecords(shippingInput.filter(isRecord), input.selectedShopId)
    : shippingInput;
  const shippingCount = readinessCount(shippingRecords);

  const makeFamily = (
    id: OrderSyncMappingFamilyId,
    label: string,
    count: number,
    mappedTypeId: OrderSyncMappingFamilyReadiness["mappedTypeId"]
  ): OrderSyncMappingFamilyReadiness => ({
    id,
    label,
    mappedTypeId,
    ready: count > 0,
    count,
    blocking: false,
    warning: count > 0 ? null : `${label} mapping is missing.`
  });

  const families = [
    makeFamily("sales-channel", "Sales Channel", salesCount, "SHOPIFY_ORDER_SOURCE"),
    makeFamily("payment-method", "Payment Method", paymentCount, "SHOPIFY_PAYMENT_TYPE"),
    makeFamily("shipping-method", "Shipping Method", shippingCount, null)
  ] as const;
  const warnings = families.flatMap((family) => family.warning ? [family.warning] : []);

  return {
    families,
    allReady: warnings.length === 0,
    hasWarnings: warnings.length > 0,
    blocking: false,
    warnings
  };
}

export interface SystemMessageLike extends UnknownRecord {
  systemMessageId?: string;
  statusId?: string;
}

export interface DataManagerLogLike extends UnknownRecord {
  logId?: string;
  configId?: string;
  statusId?: string;
  totalRecordCount?: number | string;
  failedRecordCount?: number | string;
  successRecordCount?: number | string;
}

export type OrderSyncProgressState = "pending" | "active" | "completed" | "partial" | "failed";

export interface OrderSyncProgressRow {
  id: "batch-request" | "hotwax-import";
  label: string;
  state: OrderSyncProgressState;
  stateLabel: string;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  logCount: number;
  configIds: string[];
}

const SYSTEM_MESSAGE_COMPLETE = new Set(["smsgsent", "sent", "smsgconsumed", "consumed", "smsgconfirmed", "confirmed"]);
const FAILURE_TOKENS = ["fail", "error", "reject", "cancel", "crash"];
const COMPLETE_TOKENS = ["complete", "success", "finish", "processed", "consumed", "confirmed"];
const ACTIVE_TOKENS = ["active", "running", "inprogress", "started", "processing", "received", "sending", "produced"];

function tokenIncludes(token: string, fragments: readonly string[]): boolean {
  return fragments.some((fragment) => token.includes(fragment));
}

function systemMessageProgressState(message: SystemMessageLike | null | undefined): OrderSyncProgressState {
  if (!message) return "pending";
  const status = normalizeToken(firstValue(message, ["statusId", "status", "messageStatusId"]));
  if (tokenIncludes(status, FAILURE_TOKENS)) return "failed";
  if (SYSTEM_MESSAGE_COMPLETE.has(status) || tokenIncludes(status, ["consumed", "confirmed"])) return "completed";
  if (tokenIncludes(status, ACTIVE_TOKENS)) return "active";
  return "pending";
}

interface NormalizedLogOutcome {
  key: string;
  configId: string;
  state: OrderSyncProgressState;
  total: number;
  successful: number;
  failed: number;
}

function normalizeLogOutcome(log: DataManagerLogLike): NormalizedLogOutcome {
  const configId = firstText(log, ["configId", "dataManagerConfigId", "configName"]);
  const logId = firstText(log, ["logId", "dataManagerLogId", "id"]);
  const total = numberValue(log, ["totalRecordCount", "recordCount", "totalRecords"]);
  const failed = numberValue(log, ["failedRecordCount", "errorRecordCount", "failedRecords"]);
  const explicitSuccessful = numberValue(log, ["successRecordCount", "successfulRecordCount", "processedRecordCount"]);
  const successful = explicitSuccessful || Math.max(total - failed, 0);
  const status = normalizeToken(firstValue(log, ["statusId", "status", "runStatusId"]));
  const hasFinish = Boolean(firstValue(log, ["finishDateTime", "finishedDateTime", "completedDate", "processedDate"]));
  let state: OrderSyncProgressState;

  if (tokenIncludes(status, FAILURE_TOKENS)) state = successful > 0 ? "partial" : "failed";
  else if (failed > 0) state = successful > 0 ? "partial" : "failed";
  else if (tokenIncludes(status, COMPLETE_TOKENS) || hasFinish) state = "completed";
  else if (tokenIncludes(status, ACTIVE_TOKENS) || total > 0) state = "active";
  else state = "pending";

  return {
    key: logId || [
      configId || "unknown",
      firstText(log, ["systemMessageId", "createdByJobRunId", "jobRunId"]),
      firstText(log, ["contentId", "logContentId", "errorLogContentId"]),
      status,
      total,
      failed,
      firstText(log, ["finishDateTime", "finishedDateTime", "completedDate", "processedDate"])
    ].join(":"),
    configId,
    state,
    total: Math.max(total, successful + failed),
    successful,
    failed
  };
}

function progressLabel(state: OrderSyncProgressState, successful: number, failed: number): string {
  if (state === "completed") return `Completed · ${successful} ${successful === 1 ? "order" : "orders"}`;
  if (state === "partial") return `Partially completed · ${successful} processed · ${failed} failed`;
  if (state === "failed") return failed ? `Failed · ${failed} ${failed === 1 ? "record" : "records"}` : "Failed";
  if (state === "active") return "In progress";
  return "Waiting";
}

export function deriveShopifyOrderSyncProgress(
  systemMessage: SystemMessageLike | null | undefined,
  logs: readonly DataManagerLogLike[]
): readonly [OrderSyncProgressRow, OrderSyncProgressRow] {
  const batchState = systemMessageProgressState(systemMessage);
  const seenLogs = new Set<string>();
  const normalizedLogs = logs
    .map(normalizeLogOutcome)
    .filter((log) => {
      if (seenLogs.has(log.key)) return false;
      seenLogs.add(log.key);
      return true;
    });

  const totals = normalizedLogs.reduce((result, log) => ({
    total: result.total + log.total,
    successful: result.successful + log.successful,
    failed: result.failed + log.failed
  }), { total: 0, successful: 0, failed: 0 });

  let importState: OrderSyncProgressState;
  if (!normalizedLogs.length) {
    importState = batchState === "completed" ? "completed" : batchState === "failed" ? "failed" : "pending";
  } else {
    const states = normalizedLogs.map((log) => log.state);
    const hasFailed = states.some((state) => state === "failed" || state === "partial");
    const hasActive = states.some((state) => state === "active" || state === "pending");
    const hasCompleted = states.some((state) => state === "completed" || state === "partial");

    if (hasActive) importState = "active";
    else if (hasFailed && (hasCompleted || totals.successful > 0)) importState = "partial";
    else if (hasFailed) importState = "failed";
    else importState = "completed";
  }

  const batchRow: OrderSyncProgressRow = {
    id: "batch-request",
    label: "Shopify order batch request",
    state: batchState,
    stateLabel: progressLabel(batchState, 0, 0),
    totalRecords: 0,
    successfulRecords: 0,
    failedRecords: 0,
    logCount: 0,
    configIds: []
  };
  const importRow: OrderSyncProgressRow = {
    id: "hotwax-import",
    label: "HotWax order import",
    state: importState,
    stateLabel: progressLabel(importState, totals.successful, totals.failed),
    totalRecords: totals.total,
    successfulRecords: totals.successful,
    failedRecords: totals.failed,
    logCount: normalizedLogs.length,
    configIds: [...new Set(normalizedLogs.map((log) => log.configId).filter(Boolean))]
  };

  return [batchRow, importRow];
}

export function deriveShopifyOrderSyncOverallState(
  batchRow: Pick<OrderSyncProgressRow, "state">,
  importRow: Pick<OrderSyncProgressRow, "state">
): OrderSyncProgressState {
  if (batchRow.state === "active" || batchRow.state === "pending") return batchRow.state;
  if (importRow.state === "active" || importRow.state === "pending") return "active";
  if (batchRow.state === "failed") {
    return importRow.state === "completed" || importRow.state === "partial" ? "partial" : "failed";
  }
  return importRow.state;
}

const AUDIT_TIMESTAMPS = ["processedDate", "processedAt", "completedDate", "createdDate", "createdStamp", "lastUpdatedStamp"] as const;

export interface SuccessfulOrderAuditLike extends UnknownRecord {}

export interface RecentProcessedOrder {
  id: string;
  shopId: string;
  shopifyOrderId: string;
  orderName: string;
  orderId: string;
  outcome: "Created" | "Updated";
  processedAt?: string | number;
  processedAtMillis: number;
  systemMessageId: string;
  configId: string;
  logId: string;
  shopifyFetchVerified: boolean;
}

function auditOutcome(row: ValueSource): RecentProcessedOrder["outcome"] | null {
  const configId = valueText(row?.configId);
  if (configId !== "SYNC_SHOPIFY_ORDER" && configId !== "UPDATE_SHOPIFY_ORDER") return null;
  const declaredOutcome = valueText(row?.outcome);
  return declaredOutcome === "Created" || declaredOutcome === "Updated" ? declaredOutcome : null;
}

export function normalizeRecentProcessedOrders(
  rows: readonly SuccessfulOrderAuditLike[],
  options: { limit?: number; shopId?: string } = {}
): RecentProcessedOrder[] {
  const selectedShopId = valueText(options.shopId);
  if (!selectedShopId) return [];

  const normalized = rows.flatMap((row, index): RecentProcessedOrder[] => {
    const shopId = valueText(row.shopId);
    const systemMessageId = valueText(row.systemMessageId);
    const configId = valueText(row.configId);
    const logId = firstText(row, ["logId", "dataManagerLogId"]);
    const outcome = auditOutcome(row);
    const shopifyFetchVerified = row.shopifyFetchVerified;
    if (
      shopId !== selectedShopId
      || !systemMessageId
      || !configId
      || !logId
      || !outcome
      || typeof shopifyFetchVerified !== "boolean"
    ) return [];

    const shopifyOrderId = valueText(row.shopifyOrderId);
    const processedAtMillis = timestampFrom(row, AUDIT_TIMESTAMPS);
    const explicitId = firstText(row, ["auditId", "shopifyOrderSyncAuditId", "id"]);
    const id = explicitId || [systemMessageId, configId, logId, shopifyOrderId, outcome, processedAtMillis || index].join(":");

    return [{
      id,
      shopId,
      shopifyOrderId,
      orderName: firstText(row, ["orderName", "shopifyOrderName", "name"]),
      orderId: firstText(row, ["orderId", "hotWaxOrderId", "internalOrderId"]),
      outcome,
      processedAt: originalTimestamp(row, AUDIT_TIMESTAMPS),
      processedAtMillis,
      systemMessageId,
      configId,
      logId,
      shopifyFetchVerified,
    }];
  });

  normalized.sort((a, b) => b.processedAtMillis - a.processedAtMillis || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return normalized.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).slice(0, boundedLimit(options.limit));
}

const ERROR_TIMESTAMPS = [
  "errorDate",
  "failedDate",
  "processedDate",
  "finishDateTime",
  "finishedDateTime",
  "createdDate",
  "createdStamp",
  "lastUpdatedStamp"
] as const;

export interface OrderErrorSourceLike extends UnknownRecord {
  records?: readonly UnknownRecord[];
  errorRecords?: readonly UnknownRecord[];
  rows?: readonly UnknownRecord[];
}

export interface RecentOrderError {
  id: string;
  shopId: string;
  shopifyOrderId: string;
  orderName: string;
  errorText: string;
  occurredAt?: string | number;
  occurredAtMillis: number;
  configId: string;
  logId: string;
  systemMessageId: string;
  batchId: string;
  retryable: boolean;
}

function errorText(row: ValueSource): string {
  const value = firstValue(row, ["errorText", "errorMessage", "message", "errors", "error"]);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return valueText(value);
    }
  }
  return valueText(value);
}

function childRecords(source: OrderErrorSourceLike): readonly UnknownRecord[] | null {
  if (Array.isArray(source.records)) return source.records;
  if (Array.isArray(source.errorRecords)) return source.errorRecords;
  if (Array.isArray(source.rows)) return source.rows;
  return null;
}

function explicitShopifyOrderId(record: ValueSource): string {
  return firstText(record, [
    "shopifyOrderId",
    "orderShopifyId",
    "Shopify order ID",
    "Shopify Order ID"
  ]);
}

function isResolvableShopifyOrderId(value: string): boolean {
  const match = /^(?:gid:\/\/shopify\/Order\/)?(\d{1,30})$/.exec(value);
  return Boolean(match && !/^0+$/.test(match[1]));
}

function stableErrorId(parts: readonly string[]): string {
  return parts.map((part) => encodeURIComponent(part || "-")).join("|");
}

export function normalizeRecentOrderErrors(
  sources: readonly OrderErrorSourceLike[],
  options: { limit?: number; shopId?: string } = {}
): RecentOrderError[] {
  const selectedShopId = valueText(options.shopId);
  const normalized: RecentOrderError[] = [];

  sources.forEach((source, sourceIndex) => {
    const records = childRecords(source) || [source];
    records.forEach((record, recordIndex) => {
      const shopId = firstText(record, ["shopId", "shopifyShopId", "internalId"]) || firstText(source, ["shopId", "shopifyShopId", "internalId"]);
      if (selectedShopId && shopId !== selectedShopId) return;

      const configId = firstText(record, ["configId", "dataManagerConfigId"]) || firstText(source, ["configId", "dataManagerConfigId"]);
      const logId = firstText(record, ["logId", "dataManagerLogId"]) || firstText(source, ["logId", "dataManagerLogId"]);
      const systemMessageId = firstText(record, ["systemMessageId", "messageId"]) || firstText(source, ["systemMessageId", "messageId"]);
      const batchId = firstText(record, ["batchId", "jobRunId", "createdByJobRunId"]) || firstText(source, ["batchId", "jobRunId", "createdByJobRunId"]);
      const shopifyOrderId = explicitShopifyOrderId(record);
      const message = errorText(record) || errorText(source);
      const occurredAtMillis = timestampFrom(record, ERROR_TIMESTAMPS) || timestampFrom(source, ERROR_TIMESTAMPS);
      const explicitId = firstText(record, ["errorId", "recordId", "id"]);
      const sourceRecordId = explicitId || [
        shopifyOrderId,
        message,
        occurredAtMillis || `${sourceIndex}.${recordIndex}`
      ].join(":");
      const id = stableErrorId([
        shopId,
        configId,
        logId,
        batchId,
        systemMessageId,
        sourceRecordId
      ]);

      normalized.push({
        id,
        shopId,
        shopifyOrderId,
        orderName: firstText(record, ["orderName", "shopifyOrderName", "name"]),
        errorText: message,
        occurredAt: originalTimestamp(record, ERROR_TIMESTAMPS) || originalTimestamp(source, ERROR_TIMESTAMPS),
        occurredAtMillis,
        configId,
        logId,
        systemMessageId,
        batchId,
        retryable: isResolvableShopifyOrderId(shopifyOrderId)
      });
    });
  });

  normalized.sort((a, b) => b.occurredAtMillis - a.occurredAtMillis || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return normalized.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).slice(0, boundedLimit(options.limit));
}

function matchesQuery(values: readonly unknown[], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return values.some((value) => valueText(value).toLocaleLowerCase().includes(needle));
}

export function searchLoadedProcessedOrders(rows: readonly RecentProcessedOrder[], query: string): RecentProcessedOrder[] {
  return rows.filter((row) => matchesQuery([
    row.shopifyOrderId,
    row.orderName
  ], query));
}

export function searchLoadedOrderErrors(rows: readonly RecentOrderError[], query: string): RecentOrderError[] {
  return rows.filter((row) => matchesQuery([
    row.shopifyOrderId,
    row.orderName,
    row.errorText,
    row.systemMessageId,
    row.configId,
    row.logId,
    row.batchId
  ], query));
}

export function getShopifyOrderSyncPollingDelay(input: {
  pageActive: boolean;
  batchActive: boolean;
}): number | null {
  if (!input.pageActive) return null;
  return input.batchActive ? SHOPIFY_ORDER_SYNC_ACTIVE_POLL_MS : SHOPIFY_ORDER_SYNC_IDLE_POLL_MS;
}

export type PermissionInput =
  | readonly string[]
  | ReadonlySet<string>
  | { permissions?: readonly string[] | ReadonlySet<string>; hasPermission?: (permissionId: string) => boolean }
  | null
  | undefined;

function hasPermission(input: PermissionInput, permissionId: string): boolean {
  if (!input) return false;
  if (Array.isArray(input)) return input.some((permission) => permission === permissionId);
  if (input instanceof Set) return input.has(permissionId);
  if (typeof input === "object" && "hasPermission" in input && typeof input.hasPermission === "function") {
    return input.hasPermission(permissionId);
  }
  if (typeof input === "object" && "permissions" in input) return hasPermission(input.permissions, permissionId);
  return false;
}

export interface OrderSyncCapabilities {
  canMonitor: true;
  canConfigure: boolean;
  canActivate: boolean;
  canEditSchedule: boolean;
  canRunNow: boolean;
  canRetryIndividualOrder: boolean;
}

export function getShopifyOrderSyncCapabilities(permissions: PermissionInput): OrderSyncCapabilities {
  const isAdmin = hasPermission(permissions, SHOPIFY_ORDER_SYNC_ADMIN_PERMISSION);
  return {
    canMonitor: true,
    canConfigure: isAdmin,
    canActivate: isAdmin,
    canEditSchedule: isAdmin,
    canRunNow: isAdmin,
    canRetryIndividualOrder: isAdmin
  };
}
