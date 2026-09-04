import { type MaybeRefOrGetter, computed, ref, toValue, watch } from "vue"
import type {
  OnboardingSyncDiagnostic,
  OnboardingSyncRun,
  OnboardingSyncRunStatus,
  OnboardingSyncStage
} from "@/components/product-store-onboarding/OnboardingSyncStatus.types"
import { formatDateTime } from "@/utils"
import { DATA_MANAGER_LOG_STATUS_IDS, logOutcome } from "@/utils/dataManagerLog"
import type { ActiveDomain } from "@/workers/syncRegistry"
import { useCacheSync } from "./useCacheSync"
import type { ProductStoreOnboardingRunRequest } from "./useProductStoreOnboardingWizard"
import { useServiceJobRunsByJob } from "./useServiceJobs"
import {
  PRODUCT_SYNC_FEATURE,
  PRODUCT_SYNC_REQUEST_MESSAGE_TYPE,
  PRODUCT_SYNC_RUN_WINDOW,
  syncFeatureDomains,
  useShopifyProductSyncRun,
  useShopifyProductSyncRunState,
  useShopifySyncContext,
  useShopifySyncRuns
} from "./useShopify"

export type OnboardingInitialLoadKind = "products" | "inventory" | "orders"

export const ONBOARDING_INITIAL_LOAD_CONTRACTS = {
  products: {
    systemMessageTypeId: PRODUCT_SYNC_REQUEST_MESSAGE_TYPE,
    configId: "SYNC_SHOPIFY_PRODUCT",
    detailsRoute: "product-sync"
  },
  inventory: {
    systemMessageTypeId: "BulkQueryShopifyInventoryReset",
    configId: "RESET_SHOPIFY_INVENTORY",
    detailsRoute: null
  },
  orders: {
    systemMessageTypeId: "BulkOrderHistoryQuery",
    configId: "BULK_ORDER_HISTORY",
    detailsRoute: "order-sync/history"
  }
} as const

export interface OnboardingInitialLoadDetails {
  route: string | null
  systemMessageId: string
  bulkOperationId: string
  logId: string
  configId: string
  jobRunId: string
}

export interface OnboardingInitialLoadSnapshot {
  kind: OnboardingInitialLoadKind
  hydrated: boolean
  run: OnboardingSyncRun
  details: OnboardingInitialLoadDetails
}

export interface OnboardingInitialLoadInput {
  kind: OnboardingInitialLoadKind
  shopId: string
  hydrated: boolean
  run?: Record<string, any> | null
  productRun?: Record<string, any> | null
  request?: ProductStoreOnboardingRunRequest | null
  jobRun?: Record<string, any> | null
  jobRunHydrated?: boolean
  correlatedSystemMessageId?: string
  /** The surfaced run is the shop's, still unfinished, and not started by this setup. */
  unattributed?: boolean
}

export type OnboardingInitialLoadRequestSource = MaybeRefOrGetter<
  Partial<Record<OnboardingInitialLoadKind, ProductStoreOnboardingRunRequest | null>> | undefined
>

export interface OnboardingInitialLoadRunSelection {
  run: Record<string, any> | null
  jobRun: Record<string, any> | null
  systemMessageId: string
  /** The run belongs to the shop and is still unfinished, but THIS setup did not start it. */
  unattributed?: boolean
}

const FAILURE_TOKENS = ["fail", "error", "reject", "crash"]
const ACTIVE_TOKENS = ["active", "running", "inprogress", "started", "processing"]
const MAX_DIAGNOSTIC_LENGTH = 600
const SENSITIVE_DIAGNOSTIC_KEY = /pass(word)?|token|secret|authorization|cookie|credential|api.?key|access.?key|private.?key|session/i

function token(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function includesAny(value: string, fragments: readonly string[]) {
  return fragments.some((fragment) => value.includes(fragment))
}

function redactInlineSecrets(value: string) {
  return value
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^:/\s]+:[^@\s]+@/gi, "$1[redacted]@")
    .replace(
      /\b(password|token|secret|authorization|cookie|credential|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret)\s*[:=]\s*("[^"]*"|'[^']*'|[^,\s}]+)/gi,
      "$1: [redacted]"
    )
}

/**
 * Convert unknown backend diagnostic fields to bounded escaped text for the status card.
 * Vue performs the HTML escaping; this helper redacts common credential shapes and prevents a
 * large/circular response object from taking over the onboarding page.
 */
// eslint-disable-next-line no-restricted-syntax -- pure diagnostic projection, not a Vue composable
export function sanitizeOnboardingSyncDiagnostic(value: unknown) {
  if(value === undefined || value === null || value === "") {return ""}

  let text: string
  if(typeof value === "string") {
    text = value
  } else if(value instanceof Error) {
    text = value.message
  } else {
    const seen = new WeakSet<object>()
    try {
      text = JSON.stringify(value, (key, nestedValue) => {
        if(key && SENSITIVE_DIAGNOSTIC_KEY.test(key)) {return "[redacted]"}
        if(nestedValue && typeof nestedValue === "object") {
          if(seen.has(nestedValue)) {return "[circular]"}
          seen.add(nestedValue)
        }

        return nestedValue
      })
    } catch {
      text = String(value)
    }
  }

  const compact = redactInlineSecrets(String(text ?? "").replace(/\s+/g, " ").trim())
  if(!compact || compact === "{}" || compact === "[]") {return ""}

  return compact.length > MAX_DIAGNOSTIC_LENGTH
    ? `${compact.slice(0, MAX_DIAGNOSTIC_LENGTH - 1)}…`
    : compact
}

function firstDiagnostic(
  source: Record<string, any> | null | undefined,
  keys: readonly string[]
) {
  for(const key of keys) {
    const detail = sanitizeOnboardingSyncDiagnostic(source?.[key])
    if(detail) {return { key, detail }}
  }

  return null
}

function sourceDiagnostics(
  source: Record<string, any> | null | undefined,
  options: { includeMessageText?: boolean } = {}
): OnboardingSyncDiagnostic[] {
  if(!source) {return []}

  const groups = [
    {
      id: "errors",
      label: "Errors",
      keys: ["errorText", "errorMessage", "errors", "error", "exceptionMessage", "exception", "stackTrace"]
    },
    {
      id: "message",
      label: "Message",
      keys: [
        "outputMessage",
        "responseMessage",
        "resultMessage",
        "runMessage",
        "statusMessage",
        "returnMessage",
        "messages",
        "message",
        "reason",
        ...(options.includeMessageText ? ["messageText"] : [])
      ]
    },
    {
      id: "details",
      label: "Error details",
      keys: ["serviceResult", "result", "response", "results", "details", "raw"]
    }
  ] as const
  const seen = new Set<string>()
  const diagnostics: OnboardingSyncDiagnostic[] = []

  for(const group of groups) {
    const diagnostic = firstDiagnostic(source, group.keys)
    if(!diagnostic || seen.has(diagnostic.detail)) {continue}
    seen.add(diagnostic.detail)
    diagnostics.push({
      id: `${group.id}-${diagnostic.key}`,
      label: group.label,
      detail: diagnostic.detail
    })
  }

  return diagnostics
}

function messageStatus(value: unknown): OnboardingSyncRunStatus {
  const status = token(value)
  if(status.includes("cancel")) {return "cancelled"}
  if(includesAny(status, FAILURE_TOKENS)) {return "error"}
  if(status.includes("produced") || status.includes("triggered") || status.includes("received")) {return "queued"}
  if(status.includes("sent")) {return "sent"}
  if(includesAny(status, ACTIVE_TOKENS) || status.includes("sending") || status.includes("consuming")) {return "running"}
  if(status.includes("confirmed") || status.includes("consumed")) {return "completed"}

  return status ? "unknown" : "pending"
}

function importStatus(log: Record<string, any> | null): OnboardingSyncRunStatus {
  if(!log) {return "unknown"}
  const statusId = String(log.statusId ?? log.logStatusId ?? log.status ?? "")
  const failedRecordCount = recordCount(log.failedRecordCount) ?? 0

  // These two ids are the legacy Product Sync detail model's explicit terminal vocabulary.
  if(statusId === "DmlSuccess") {return failedRecordCount > 0 ? "error" : "completed"}
  if(statusId === "DmlError") {return "error"}
  if(!DATA_MANAGER_LOG_STATUS_IDS.includes(statusId)) {return "unknown"}

  const outcome = logOutcome({
    ...log,
    statusId,
    logId: String(log.logId ?? ""),
    configId: String(log.configId ?? "")
  })
  if(statusId === "DmlsCancelled") {return "cancelled"}
  if(outcome.state === "completed") {return "completed"}
  if(outcome.state === "failed" || outcome.state === "partial") {return "error"}
  if(outcome.state === "active" || outcome.state === "pending") {return "importing"}

  return "unknown"
}

function summaryFor(status: OnboardingSyncRunStatus, kind: OnboardingInitialLoadKind, unattributed = false) {
  if(status === "not-started") {return "No sync request has been produced yet."}
  // Said plainly, because the operator is about to wonder whose run this is. An active one also
  // explains why the load button is disabled: it holds the shop's queue, and the connector sends one
  // bulk query at a time. A finished one must NOT claim to be in progress.
  if(unattributed) {
    return ["queued", "pending", "sent", "running", "importing"].includes(status)
      ? "A sync request for this shop is already in progress. It was not started from this setup."
      : "This is the shop's most recent sync request. It was not started from this setup."
  }
  if(status === "completed" && kind === "products") {return "Product sync request completed."}
  if(status === "cancelled" && kind === "products") {return "Product sync run cancelled."}
  if(status === "unknown" || status === "unavailable") {return "Status unavailable"}
  if(status === "error") {return "Failed"}
  if(status === "completed") {return "Completed"}
  if(status === "queued" || status === "pending") {return "Waiting"}

  return "Processing"
}

function recordCount(value: unknown): number | undefined {
  if(value === undefined || value === null || value === "") {return undefined}
  const count = Number(value)

  return Number.isFinite(count) ? count : undefined
}

function truthyFlag(value: unknown) {
  return value === true || ["y", "yes", "true", "1"].includes(String(value ?? "").toLowerCase())
}

function serviceJobRunCompletedAt(run: Record<string, any> | null | undefined) {
  return run?.endTime ?? run?.endDate ?? run?.finishDateTime ?? run?.finishedAt ??
    run?.completedDate ?? run?.completedAt
}

function serviceJobRunStartedAt(run: Record<string, any> | null | undefined) {
  return run?.startTime ?? run?.runTime ?? run?.runDate ?? run?.startDate ?? run?.startedAt ??
    run?.runStartDate ?? run?.createdDate ?? run?.createdStamp
}

function parseJobRunResults(run: Record<string, any> | null | undefined): Record<string, any> | null {
  const value = run?.results
  if(value && typeof value === "object" && !Array.isArray(value)) {return value}
  if(typeof value !== "string" || !value.trim()) {return null}

  try {
    const parsed = JSON.parse(value)

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** The runNow jobs return different exact result keys for inventory and historic orders. */
// eslint-disable-next-line no-restricted-syntax -- pure correlation helper, not a Vue composable
export function onboardingJobRunSystemMessageId(
  kind: Exclude<OnboardingInitialLoadKind, "products">,
  run: Record<string, any> | null | undefined
) {
  const results = parseJobRunResults(run)
  const key = kind === "inventory" ? "systemMessageId" : "queuedSystemMessageId"

  return String(results?.[key] ?? "")
}

/** Deterministic clone name used by the initial-load runNow endpoints. */
// eslint-disable-next-line no-restricted-syntax -- pure contract helper, not a Vue composable
export function onboardingInitialLoadJobName(
  kind: Exclude<OnboardingInitialLoadKind, "products">,
  shopId: string
) {
  const prefix = kind === "inventory" ? "sync_ShopifyInventoryReset" : "sync_ShopifyOrderHistory"

  return shopId ? `${prefix}_${shopId}` : ""
}

/**
 * Correlate a persisted run request to cache evidence.
 *
 * There is NO fallback to the shop's most recent run, and that is the whole point. Every run visible
 * here is scoped to the SHOP (a SystemMessage against the shop's remote), never to the Product Store,
 * so a shop that was previously connected to another store carries that store's runs. Picking the
 * latest one attributed a three-day-old failed import to a Product Store created minutes earlier, and
 * an operator setting up a fresh store saw "294 failed of 2,131 records processed" for a load nobody
 * had started.
 *
 * Nothing in the data can tell us which Product Store an older shop run belonged to, so the only
 * honest evidence that THIS setup ran an initial load is the request this wizard persisted when it
 * started one. Without that request the answer is "no run", which the step renders as a missing
 * initial import — true, and recoverable by running it.
 */
// eslint-disable-next-line no-restricted-syntax -- pure selection helper, not a Vue composable
export function selectOnboardingInitialLoadRun(input: {
  kind: OnboardingInitialLoadKind
  shopId: string
  runs: readonly Record<string, any>[]
  request?: ProductStoreOnboardingRunRequest | null
  jobRuns?: readonly Record<string, any>[]
  /** Epoch ms the Product Store was created; runs older than this belong to some other store. */
  storeCreatedAt?: number
}): OnboardingInitialLoadRunSelection {
  const request = input.request
  if(request) {
    if(String(request.shopId) !== String(input.shopId)) {
      return { run: null, jobRun: null, systemMessageId: "" }
    }

    // Branch on the identifier the request actually carries, not on the step. A load that came back
    // with a SystemMessage id was produced directly by a connector resource and has no ServiceJobRun
    // to correlate through; one that came back with a job run id has to be resolved through the run's
    // results first. Inventory has been both.
    const requestedSystemMessageId = String(request.systemMessageId ?? "")
    if(requestedSystemMessageId) {
      const run = input.runs.find((candidate) => {
        return String(candidate?.systemMessageId ?? "") === requestedSystemMessageId
      }) ?? null

      return { run, jobRun: null, systemMessageId: requestedSystemMessageId }
    }

    if(input.kind === "products") {
      return { run: null, jobRun: null, systemMessageId: "" }
    }

    const jobRunId = String(request.jobRunId ?? "")
    const jobRun = jobRunId
      ? input.jobRuns?.find((candidate) => String(candidate?.jobRunId ?? "") === jobRunId) ?? null
      : null
    const systemMessageId = onboardingJobRunSystemMessageId(input.kind, jobRun)
    const run = systemMessageId
      ? input.runs.find((candidate) => String(candidate?.systemMessageId ?? "") === systemMessageId) ?? null
      : null

    return { run, jobRun, systemMessageId }
  }

  // No request from THIS setup — the wizard's own record of starting a load lives in browser storage,
  // and it is gone whenever the operator starts another setup, uses another browser, or clears data.
  // Falling back to the shop's latest run is what this selector was rewritten to stop: runs are scoped
  // to the SHOP, so a reconnected shop carries the previous store's history, and a brand-new store was
  // shown a three-day-old failed import as its current run.
  //
  // The bound that separates the two is the Product Store's own creation time, which is durable
  // backend data rather than browser state: a run that began before this store existed cannot be its
  // own. Runs at or after it are surfaced and marked `unattributed`, so the step reports what actually
  // happened without claiming it started it. Nothing older is shown at all.
  const since = Number(input.storeCreatedAt ?? 0)
  const candidate = since
    ? input.runs.find((run) => runStartedAt(run) >= since) ?? null
    : input.runs.find((run) => isUnfinishedRunStatus(run)) ?? null

  return {
    run: candidate,
    jobRun: null,
    systemMessageId: String(candidate?.systemMessageId ?? ""),
    unattributed: Boolean(candidate)
  }
}

/**
 * A run the connector still owns: produced, sending, or sent and awaiting Shopify.
 *
 * Reads the SAME status the snapshot treats as authoritative. A run is assembled by joining the
 * sync-run spine to a separately cached SystemMessage, and the two fetches land on different polls,
 * so the spine can still say produced while the message already says consumed. Reading only the spine
 * called a finished run unfinished and reported it as still in progress.
 */
function isUnfinishedRunStatus(run: Record<string, any> | null | undefined): boolean {
  const statusId = run?.systemMessage?.statusId ?? run?.statusId

  return ["queued", "sent", "running"].includes(messageStatus(statusId))
}

/** A run's start as epoch milliseconds; 0 when it carries no readable date. */
function runStartedAt(run: Record<string, any> | null | undefined): number {
  const value = run?.initDate ?? run?.createdDate ?? run?.createdStamp
  if(value == null || value === "") {return 0}
  const parsed = typeof value === "number" ? value : Date.parse(String(value))

  return Number.isFinite(parsed) ? Number(parsed) : 0
}

function requestJobRunStatus(input: OnboardingInitialLoadInput): OnboardingSyncRunStatus {
  const request = input.request
  if(!request?.jobRunId) {return "pending"}
  if(!input.jobRunHydrated) {return "pending"}
  if(!input.jobRun) {return "pending"}
  if(truthyFlag(input.jobRun.hasError)) {return "error"}
  if(!serviceJobRunCompletedAt(input.jobRun)) {
    return serviceJobRunStartedAt(input.jobRun) ? "running" : "pending"
  }
  if(input.correlatedSystemMessageId) {return "completed"}

  return "unavailable"
}

function exactImportEvidence(run: Record<string, any>, expectedConfigId: string) {
  const log = run.mdmLog ?? null
  const actualConfigId = String(log?.configId ?? run.configId ?? "")
  if(!run.logId && !log?.logId) {return null}
  if(actualConfigId !== expectedConfigId) {return null}

  return {
    ...run,
    ...log,
    logId: String(log?.logId ?? run.logId ?? ""),
    configId: actualConfigId,
    statusId: log?.statusId ?? run.logStatusId,
    totalRecordCount: log?.totalRecordCount ?? run.totalRecordCount,
    failedRecordCount: log?.failedRecordCount ?? run.failedRecordCount
  }
}

function detailsRoute(kind: OnboardingInitialLoadKind, shopId: string) {
  const suffix = ONBOARDING_INITIAL_LOAD_CONTRACTS[kind].detailsRoute

  return suffix && shopId
    ? `/shopify-connection-details/${encodeURIComponent(shopId)}/${suffix}`
    : null
}

function productBulkOperationStatus(operation: Record<string, any> | null | undefined): OnboardingSyncRunStatus {
  if(!operation?.id || operation.isStatusUnavailable) {return "unavailable"}
  const status = token(operation.status)
  if(status.includes("cancel")) {return "cancelled"}
  if(includesAny(status, FAILURE_TOKENS) || status.includes("expired")) {return "error"}
  if(status.includes("complete")) {return "completed"}
  if(status.includes("running")) {return "running"}

  return "pending"
}

/**
 * Turn one shop-scoped run into the concise onboarding contract.
 *
 * Terminal success requires actual import evidence under the exact seeded DataManager config. The
 * only exception is Product Sync's existing detailed run model proving a zero-object Shopify bulk
 * operation was skipped. A trigger response, a configured job, or a consumed message by itself is
 * never enough to report completion.
 */
// eslint-disable-next-line no-restricted-syntax -- pure projection, not a Vue composable
export function deriveOnboardingInitialLoadSnapshot(input: OnboardingInitialLoadInput): OnboardingInitialLoadSnapshot {
  const contract = ONBOARDING_INITIAL_LOAD_CONTRACTS[input.kind]
  const run = input.run ?? null
  const productRun = input.productRun ?? null
  const request = input.request && String(input.request.shopId) === String(input.shopId)
    ? input.request
    : null
  const systemMessage = productRun?.systemMessage ?? run?.systemMessage ?? run
  const detailedProductLog = productRun?.mdmLog?.id && productRun.mdmLog.configId === contract.configId
    ? { ...productRun.mdmLog, logId: productRun.mdmLog.id }
    : null
  const importLog = input.kind === "products"
    ? (detailedProductLog ?? exactImportEvidence(run ?? {}, contract.configId))
    : exactImportEvidence(run ?? {}, contract.configId)

  const evidenceSystemMessageId = String(productRun?.systemMessageId ?? run?.systemMessageId ?? "")
  // Details drive request correlation in the view, so they must describe observed cache evidence
  // only. Persisted request IDs stay visible in pending stage details, but cannot make an unseen run
  // look matched before its SystemMessage/ServiceJobRun actually appears.
  const systemMessageId = evidenceSystemMessageId
  const bulkOperationId = String(productRun?.bulkOperation?.id ?? "")
  const logId = String(importLog?.logId ?? "")
  const jobRunId = String(input.jobRun?.jobRunId ?? systemMessage?.createdByJobRunId ??
    systemMessage?.jobRunId ?? importLog?.createdByJobRunId ?? run?.createdByJobRunId ?? run?.jobRunId ?? "")
  const evidenceConfigId = String(importLog?.configId ?? "")
  const hasSystemMessageEvidence = Boolean(evidenceSystemMessageId)
  const jobStatus = request && input.kind !== "products" ? requestJobRunStatus(input) : null
  const skippedEmptyProductImport = input.kind === "products" && productRun?.completed &&
    token(productRun?.mdmLog?.statusId) === "skipped"
  const bulkStatus = input.kind === "products"
    ? productBulkOperationStatus(productRun?.bulkOperation)
    : "unavailable"

  let overallStatus: OnboardingSyncRunStatus
  if(!input.hydrated) {overallStatus = "unknown"} else if(request && !hasSystemMessageEvidence) {
    if(input.kind === "products") {
      overallStatus = "pending"
    } else {
      // A successful ServiceJobRun only proves that it queued a message. Until that exact message
      // appears in the shop-scoped sync-run cache, the import is still pending rather than complete.
      overallStatus = jobStatus === "completed" ? "pending" : (jobStatus ?? "pending")
    }
  } else if(!hasSystemMessageEvidence) {overallStatus = "not-started"} else if(importLog) {overallStatus = importStatus(importLog)} else if(skippedEmptyProductImport) {overallStatus = "completed"} else {
    const systemStatus = messageStatus(systemMessage?.statusId ?? run?.statusId)
    if(input.kind === "products" && bulkStatus !== "unavailable") {
      overallStatus = bulkStatus === "completed" ? "unknown" : bulkStatus
    } else {
      // A terminal message with no exact import log proves only that Shopify finished its half.
      overallStatus = systemStatus === "completed" ? "unknown" : systemStatus
    }
  }

  const timestamp = systemMessage?.initDate ?? run?.initDate ?? serviceJobRunStartedAt(input.jobRun)
  const lastRunLabel = (hasSystemMessageEvidence || request) && timestamp
    ? formatDateTime(timestamp)
    : undefined
  const stages: OnboardingSyncStage[] = []

  function buildSnapshot(): OnboardingInitialLoadSnapshot {
    return {
      kind: input.kind,
      hydrated: input.hydrated,
      run: {
        status: overallStatus,
        summary: summaryFor(overallStatus, input.kind, Boolean(input.unattributed)),
        lastRunLabel,
        totalRecordCount: recordCount(importLog?.totalRecordCount),
        failedRecordCount: recordCount(importLog?.failedRecordCount),
        stages
      },
      details: {
        route: detailsRoute(input.kind, input.shopId),
        systemMessageId,
        bulkOperationId,
        logId,
        configId: evidenceConfigId || contract.configId,
        jobRunId
      }
    }
  }

  // Only a load that actually runs a service job gets this stage. The inventory load is produced
  // directly by a connector resource, so an unconditional stage sat at "Waiting for job run id" for
  // the life of the run and read as a stuck import while the message was moving normally.
  const requestedJobRunId = String(request?.jobRunId ?? "")
  if(request && input.kind !== "products" && (requestedJobRunId || jobRunId)) {
    stages.push({
      id: "service-job",
      label: "Service job",
      status: jobStatus ?? "pending",
      detail: jobRunId || requestedJobRunId || "Waiting for job run id",
      diagnostics: (jobStatus === "error" || jobStatus === "unavailable")
        ? sourceDiagnostics(input.jobRun)
        : undefined
    })
  }

  if(hasSystemMessageEvidence) {
    const systemStatus = messageStatus(systemMessage?.statusId ?? run?.statusId)
    stages.push({
      id: "system-message",
      label: "System message",
      status: hasSystemMessageEvidence ? systemStatus : "pending",
      detail: systemMessageId,
      diagnostics: (systemStatus === "error" || systemStatus === "cancelled")
        ? sourceDiagnostics(systemMessage, { includeMessageText: true })
        : undefined
    })
  }

  if(input.kind === "products" && productRun && hasSystemMessageEvidence) {
    const operation = productRun.bulkOperation ?? {}
    stages.push({
      id: "shopify-bulk-operation",
      label: "Shopify bulk operation",
      status: bulkStatus,
      detail: bulkOperationId || "Status unavailable",
      totalRecordCount: recordCount(operation.objectCount),
      countUnit: "objects"
    })
  }

  if(hasSystemMessageEvidence) {
    stages.push({
      id: "hotwax-import",
      label: "HotWax bulk import",
      status: importLog ? importStatus(importLog) : skippedEmptyProductImport ? "skipped" : "unavailable",
      detail: logId || (skippedEmptyProductImport ? "No records found" : "No import log details available"),
      totalRecordCount: recordCount(importLog?.totalRecordCount ?? (skippedEmptyProductImport ? 0 : undefined)),
      failedRecordCount: recordCount(importLog?.failedRecordCount),
      diagnostics: importLog && importStatus(importLog) === "error"
        ? sourceDiagnostics(importLog)
        : undefined
    })
  }

  const hasFailureDiagnostics = stages.some((stage) => stage.diagnostics?.length)
  if(input.kind === "inventory" && ["error", "cancelled", "unavailable", "unknown"].includes(overallStatus)) {
    const fallback = sourceDiagnostics(input.jobRun ?? systemMessage ?? importLog ?? run)
    if(fallback.length && !hasFailureDiagnostics) {
      const failureStage = stages.find((stage) =>
        ["error", "cancelled", "unavailable", "unknown"].includes(stage.status))
      if(failureStage) {failureStage.diagnostics = fallback}
    }
  }

  if(input.kind === "inventory" && ["error", "cancelled"].includes(overallStatus)) {
    const snapshot = buildSnapshot()
    snapshot.run.recoveryHint = "Refresh status to check for newer evidence. Retry starts a new inventory load."

    return snapshot
  }

  return buildSnapshot()
}

/**
 * Live, shop-scoped initial-load evidence for the three onboarding imports.
 *
 * Reads are Dexie live queries. `activate` starts one view-scoped worker for the exact message types,
 * DataManager configs, and sync-run scopes below; `refresh` asks that worker to sync now. The caller
 * owns Ionic view enter/leave and should call `activate`/`deactivate` there.
 */
export function useProductStoreOnboardingInitialLoad(
  shopIdSource: MaybeRefOrGetter<string | undefined>,
  requestSource?: OnboardingInitialLoadRequestSource,
  storeCreatedAtSource?: MaybeRefOrGetter<number | undefined>
) {
  const shopId = computed(() => String(toValue(shopIdSource) ?? ""))
  const requests = computed(() => toValue(requestSource) ?? {})
  const storeCreatedAt = computed(() => Number(toValue(storeCreatedAtSource) ?? 0))
  const ctx = useShopifySyncContext(shopId)
  const selectedShopScopeKey = computed(() => {
    if(!shopId.value || !ctx.hydrated.value || !ctx.remoteIds.value.length) {return ""}

    return `${shopId.value}|${ctx.remoteIds.value.map(String).sort().join(",")}`
  })
  const productState = useShopifyProductSyncRunState(shopId)
  const productDetail = useShopifyProductSyncRun()
  const { records: inventoryRuns, hydrated: inventoryHydrated } = useShopifySyncRuns(
    ctx,
    [ONBOARDING_INITIAL_LOAD_CONTRACTS.inventory.systemMessageTypeId],
    { limit: 25 }
  )
  const { records: orderRuns, hydrated: orderHydrated } = useShopifySyncRuns(
    ctx,
    [ONBOARDING_INITIAL_LOAD_CONTRACTS.orders.systemMessageTypeId],
    { limit: 25 }
  )
  const inventoryJobName = computed(() => onboardingInitialLoadJobName("inventory", shopId.value))
  const orderJobName = computed(() => onboardingInitialLoadJobName("orders", shopId.value))
  const watchedJobNames = computed(() => [inventoryJobName.value, orderJobName.value].filter(Boolean))
  const serviceJobRuns = useServiceJobRunsByJob(() => watchedJobNames.value, 25)
  const sync = useCacheSync()
  const active = ref(false)
  const scopeRefreshed = ref(false)

  function requestFor(kind: OnboardingInitialLoadKind) {
    return requests.value[kind] ?? null
  }

  const productSelection = computed(() => selectOnboardingInitialLoadRun({
    kind: "products",
    shopId: shopId.value,
    storeCreatedAt: storeCreatedAt.value,
    runs: productState.runState.value.systemMessages,
    request: requestFor("products")
  }))
  const inventorySelection = computed(() => selectOnboardingInitialLoadRun({
    kind: "inventory",
    shopId: shopId.value,
    storeCreatedAt: storeCreatedAt.value,
    runs: inventoryRuns.value,
    request: requestFor("inventory"),
    jobRuns: serviceJobRuns.runsFor(inventoryJobName.value)
  }))
  const orderSelection = computed(() => selectOnboardingInitialLoadRun({
    kind: "orders",
    shopId: shopId.value,
    storeCreatedAt: storeCreatedAt.value,
    runs: orderRuns.value,
    request: requestFor("orders"),
    jobRuns: serviceJobRuns.runsFor(orderJobName.value)
  }))

  watch(() => {
    const run = productSelection.value.run

    return [
      selectedShopScopeKey.value,
      String(run?.systemMessageId ?? ""),
      String(run?.remoteMessageId ?? run?.shopifyBulkOperationId ?? ""),
      String(run?.systemMessageRemoteId ?? ""),
      String(run?.statusId ?? "")
    ].join("|")
  }, () => {
    const run = productSelection.value.run
    const systemMessageId = run?.systemMessageId
    if(selectedShopScopeKey.value && systemMessageId) {
      void productDetail.fetchSyncRun(String(systemMessageId), run)
    } else {
      productDetail.clearSyncRun()
    }
  }, { immediate: true })

  const products = computed(() => deriveOnboardingInitialLoadSnapshot({
    kind: "products",
    shopId: shopId.value,
    hydrated: Boolean(selectedShopScopeKey.value) && scopeRefreshed.value && productState.hydrated.value,
    unattributed: productSelection.value.unattributed,
    run: productSelection.value.run,
    productRun: productDetail.currentSyncRun.value?.systemMessageId === productSelection.value.systemMessageId
      ? productDetail.currentSyncRun.value
      : null,
    request: requestFor("products")
  }))
  const inventory = computed(() => deriveOnboardingInitialLoadSnapshot({
    kind: "inventory",
    shopId: shopId.value,
    hydrated: Boolean(selectedShopScopeKey.value) && scopeRefreshed.value && inventoryHydrated.value &&
      (!requestFor("inventory") || serviceJobRuns.hydrated.value),
    run: inventorySelection.value.run,
    request: requestFor("inventory"),
    jobRun: inventorySelection.value.jobRun,
    jobRunHydrated: serviceJobRuns.hydrated.value,
    correlatedSystemMessageId: inventorySelection.value.systemMessageId,
    unattributed: inventorySelection.value.unattributed
  }))
  const orders = computed(() => deriveOnboardingInitialLoadSnapshot({
    kind: "orders",
    shopId: shopId.value,
    hydrated: Boolean(selectedShopScopeKey.value) && scopeRefreshed.value && orderHydrated.value &&
      (!requestFor("orders") || serviceJobRuns.hydrated.value),
    run: orderSelection.value.run,
    request: requestFor("orders"),
    jobRun: orderSelection.value.jobRun,
    jobRunHydrated: serviceJobRuns.hydrated.value,
    correlatedSystemMessageId: orderSelection.value.systemMessageId,
    unattributed: orderSelection.value.unattributed
  }))

  const domains = computed<ActiveDomain[]>(() => {
    if(!selectedShopScopeKey.value) {return []}
    const intervalMs = PRODUCT_SYNC_FEATURE.activePollMs
    const systemMessageRemoteIds = [...ctx.remoteIds.value]
    const otherContracts = [
      ONBOARDING_INITIAL_LOAD_CONTRACTS.inventory,
      ONBOARDING_INITIAL_LOAD_CONTRACTS.orders
    ]

    return [
      ...syncFeatureDomains(PRODUCT_SYNC_FEATURE, intervalMs, {
        messageTotal: PRODUCT_SYNC_RUN_WINDOW,
        importTotal: 300
      }).map((domain) => domain.name === "systemMessage"
        ? {
          ...domain,
          args: { ...domain.args, systemMessageRemoteIds }
        }
        : domain),
      {
        name: "systemMessage",
        intervalMs,
        args: {
          systemMessageRemoteIds,
          types: otherContracts.map(({ systemMessageTypeId }) => ({ systemMessageTypeId, total: 25 }))
        }
      },
      ...otherContracts.map(({ configId }) => ({
        name: "dataManagerLog",
        intervalMs,
        args: { configId, total: 100 }
      })),
      {
        name: "syncRun",
        intervalMs,
        args: {
          scopes: [ONBOARDING_INITIAL_LOAD_CONTRACTS.products, ...otherContracts].map(({ systemMessageTypeId }) => ({
            shopId: shopId.value,
            systemMessageTypeId
          })),
          total: PRODUCT_SYNC_RUN_WINDOW
        }
      },
      {
        name: "serviceJobRun",
        intervalMs,
        args: { jobNames: watchedJobNames.value, total: 25 }
      }
    ]
  })

  watch(domains, (nextDomains) => {
    scopeRefreshed.value = false
    if(active.value) {
      void startForScope(nextDomains).catch(() => undefined)
    }
  })

  async function startForScope(nextDomains: ActiveDomain[]) {
    const scopeKey = selectedShopScopeKey.value
    if(!scopeKey || !nextDomains.length) {
      scopeRefreshed.value = false
      sync.stop()

      return
    }

    await sync.start(nextDomains)
    await sync.syncNow()
    if(sync.error.value) {throw new Error(sync.error.value)}
    await refetchPendingJobRuns()
    if(scopeKey === selectedShopScopeKey.value) {scopeRefreshed.value = true}
  }

  async function refetchPendingJobRuns() {
    const candidates = [
      {
        kind: "inventory" as const,
        jobName: inventoryJobName.value,
        selection: inventorySelection.value
      },
      {
        kind: "orders" as const,
        jobName: orderJobName.value,
        selection: orderSelection.value
      }
    ]

    await Promise.all(candidates.map(async ({ kind, jobName, selection }) => {
      const request = requestFor(kind)
      if(!request?.jobRunId || String(request.shopId) !== shopId.value || !jobName) {return}
      const terminal = selection.jobRun && (
        truthyFlag(selection.jobRun.hasError) || !!serviceJobRunCompletedAt(selection.jobRun)
      )
      if(terminal) {return}

      await sync.afterMutation("serviceJobRun", {
        jobName,
        jobRunId: request.jobRunId
      })
    }))
  }

  async function activate() {
    active.value = true
    scopeRefreshed.value = false
    await startForScope(domains.value)
  }

  function deactivate() {
    active.value = false
    sync.stop()
  }

  async function refresh() {
    const scopeKey = selectedShopScopeKey.value
    if(!scopeKey || !domains.value.length) {
      scopeRefreshed.value = false
      sync.stop()

      return
    }

    if(!active.value) {
      await activate()
    } else {
      scopeRefreshed.value = false
      await sync.syncNow()
      if(sync.error.value) {throw new Error(sync.error.value)}
      await refetchPendingJobRuns()
      if(scopeKey === selectedShopScopeKey.value) {scopeRefreshed.value = true}
    }
    if(scopeKey !== selectedShopScopeKey.value) {return}
    const selectedProductRun = productSelection.value.run
    const systemMessageId = selectedProductRun?.systemMessageId
    if(systemMessageId) {
      await productDetail.fetchSyncRun(String(systemMessageId), selectedProductRun)
    }
  }

  return {
    products,
    inventory,
    orders,
    active,
    refreshing: sync.manualRefreshing,
    refreshError: sync.error,
    scopeRefreshed,
    lastRefreshedAt: sync.lastSyncAt,
    activate,
    deactivate,
    refresh
  }
}
