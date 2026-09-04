/**
 * DataManagerLog — domain model + behaviors (pure, Vue-free).
 *
 * The reusable logic for one Maarg `DataManagerLog` (an import/export run). Kept as
 * plain functions so any composable / store / view can import them; the reactive
 * loader lives in `@/composables/useDataManager`. Leaf module — imports nothing.
 */

/** The states one import run can be in. "partial" = some records landed, some failed. */
export type DataManagerLogState = "pending" | "active" | "completed" | "partial" | "failed";

/**
 * A DataManagerLog exactly as the OMS REST layer serializes it
 * (co.hotwax.datamanager.DataManagerLog). Field set from the maarg-util entity
 * definition. Date-time fields arrive as an ISO string or epoch-millis number.
 */
export interface DataManagerLog {
  logId: string;
  configId: string;
  statusId: string;
  systemMessageId?: string;
  createdByJobRunId?: string;
  parentLogId?: string;
  totalRecordCount?: number;
  failedRecordCount?: number;
  successRecordCount?: number;
  startDateTime?: string | number;
  finishDateTime?: string | number;
  cancelDateTime?: string | number;
  createdDate?: string | number;
  errorRecordContentId?: string;
  logFileContentId?: string;
  productStoreId?: string;
  lastUpdatedStamp?: string | number;
}

/** The reconciled outcome of one import run. */
export interface DataManagerLogOutcome {
  state: DataManagerLogState;
  total: number;
  success: number;
  failed: number;
}

/**
 * Authoritative DataManagerLog status → base disposition. Source of truth: the
 * maarg-oms StatusItem seed, 7 statuses. A direct map of the exact status id — no
 * fuzzy matching, and notably no `DmlsError` (it does not exist; terminal failure
 * is DmlsFailed / DmlsCrashed / DmlsCancelled). The effective state layers record
 * counts on top of this (see logState).
 */
const LOG_STATUS: Record<string, "pending" | "active" | "completed" | "failed"> = {
  DmlsPending: "pending",
  DmlsQueued: "pending",
  DmlsRunning: "active",
  DmlsFinished: "completed",
  DmlsFailed: "failed",
  DmlsCrashed: "failed",
  DmlsCancelled: "failed",
};

/** The status ids this module recognizes — useful for tests and exhaustiveness checks. */
export const DATA_MANAGER_LOG_STATUS_IDS = Object.keys(LOG_STATUS);

/**
 * The effective state of one import from its status id and record counts.
 * Counts refine the base status: a run that both landed and failed records is
 * "partial", and a "finished" run whose records all failed is "failed". A record
 * count alone never implies "active" — only a RUNNING status does.
 */
export function logState(
  statusId: string | null | undefined,
  counts: { total: number; success: number; failed: number },
): DataManagerLogState {
  const { success, failed } = counts;
  const base = statusId ? LOG_STATUS[statusId] : undefined;
  if (base === "failed") return success > 0 ? "partial" : "failed";
  if (failed > 0) return success > 0 ? "partial" : "failed";
  if (base === "completed") return "completed";
  if (base === "active") return "active";
  return "pending";
}

/** The outcome of one DataManagerLog: its state plus record counts as reported. */
export function logOutcome(log: DataManagerLog | null | undefined): DataManagerLogOutcome {
  const total = log?.totalRecordCount ?? 0;
  const failed = log?.failedRecordCount ?? 0;
  const success = log?.successRecordCount ?? total - failed;
  const state = logState(log?.statusId, { total, success, failed });
  return { state, total, success, failed };
}

/** True once the run has finished (completed, partial, or failed) rather than still moving. */
export function isTerminal(log: DataManagerLog | null | undefined): boolean {
  const state = logOutcome(log).state;
  return state === "completed" || state === "partial" || state === "failed";
}

/** Sum reconciled record counts across a set of logs. */
export function aggregateCounts(
  logs: readonly DataManagerLog[],
): { total: number; success: number; failed: number } {
  return logs.reduce(
    (acc, log) => {
      const outcome = logOutcome(log);
      return {
        total: acc.total + outcome.total,
        success: acc.success + outcome.success,
        failed: acc.failed + outcome.failed,
      };
    },
    { total: 0, success: 0, failed: 0 },
  );
}

/** The logs correlated to one batch by systemMessageId. */
export function correlateByMessage(
  logs: readonly DataManagerLog[],
  systemMessageId: string | null | undefined,
): DataManagerLog[] {
  if (!systemMessageId) return [];
  return logs.filter((log) => log.systemMessageId === systemMessageId);
}
