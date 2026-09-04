/**
 * Sync progress — the composition that joins a SystemMessage (the batch request)
 * with its DataManagerLogs (the imports), and, when the message ran one, the Shopify
 * bulk operation in between. Pure and Vue-free; builds on the SystemMessage +
 * DataManagerLog + ShopifyBulkOperation entity behaviors.
 *
 * Presence-driven, not feature-keyed: a stage appears iff its data is present. Order
 * Sync (no bulk op) yields request → import; Product Sync (bulk op supplied) yields
 * request → bulkOperation → import — the same function, no feature lookup. The
 * decision of *whether* to fetch a bulk op lives one layer up (the store), using
 * shopifyBulkOperation.expectsBulkOperation; this pure layer only joins what it is
 * handed.
 *
 * `logs` are assumed already correlated to `message` by systemMessageId, and
 * `bulkOperation` (if any) is the one the message resolves to.
 */
import { logOutcome, type DataManagerLog } from "@/utils/dataManagerLog";
import { bulkOperationState, type ShopifyBulkOperation } from "@/utils/shopifyBulkOperation";
import { messageState, type SystemMessage } from "@/utils/systemMessage";

export type SyncProgressState = "pending" | "active" | "completed" | "partial" | "failed";

/** One import run's outcome, kept in the detail so a mixed batch stays legible. */
export interface SyncImport {
  configId: string;
  state: SyncProgressState;
  total: number;
  success: number;
  failed: number;
}

/** The Shopify bulk-operation stage — present only when the message ran one. */
export interface SyncBulkOperation {
  id: string;
  state: SyncProgressState;
  objectCount: number;
}

export interface SyncProgress {
  /** The Shopify order batch request (from the SystemMessage). */
  request: SyncProgressState;
  /** The Shopify bulk operation, when the message ran one. Absent otherwise (e.g. Order Sync). */
  bulkOperation?: SyncBulkOperation;
  /** The HotWax import (aggregate across the DataManagerLogs, with per-import detail). */
  import: {
    state: SyncProgressState;
    total: number;
    success: number;
    failed: number;
    imports: SyncImport[];
  };
  /** The single status shown for the run overall. */
  overall: SyncProgressState;
}

/**
 * Collapse the pipeline stages — request → [bulkOperation] → import — into the one
 * status shown for the run. An upstream stage still in flight keeps the run active;
 * an upstream failure fails the run (partial only if records still landed downstream).
 */
export function overallState(
  request: SyncProgressState,
  importState: SyncProgressState,
  bulkOperation?: SyncProgressState,
): SyncProgressState {
  if (request === "pending" || request === "active") return request;
  if (bulkOperation === "pending" || bulkOperation === "active") return "active";
  if (request === "failed" || bulkOperation === "failed") {
    return importState === "completed" || importState === "partial" ? "partial" : "failed";
  }
  if (importState === "pending" || importState === "active") return "active";
  return importState;
}

function dedupeById(logs: readonly DataManagerLog[]): DataManagerLog[] {
  const seen = new Set<string>();
  const unique: DataManagerLog[] = [];
  for (const log of logs) {
    if (seen.has(log.logId)) continue;
    seen.add(log.logId);
    unique.push(log);
  }
  return unique;
}

function collapseImports(imports: readonly SyncImport[], upstream: SyncProgressState): SyncProgressState {
  // No import ran: mirror the immediate upstream stage's terminal disposition. A
  // completed upstream with zero import logs is Completed/0 (distinct from a failed
  // one); a failed upstream means the import never happens.
  if (!imports.length) {
    return upstream === "completed" ? "completed" : upstream === "failed" ? "failed" : "pending";
  }
  const states = imports.map((entry) => entry.state);
  const active = states.some((state) => state === "active" || state === "pending");
  const failed = states.some((state) => state === "failed" || state === "partial");
  const completed = states.some((state) => state === "completed" || state === "partial");
  const landed = imports.some((entry) => entry.success > 0);
  if (active) return "active";
  if (failed && (completed || landed)) return "partial";
  if (failed) return "failed";
  return "completed";
}

/**
 * Join a SystemMessage batch request with its (already-correlated) DataManagerLogs,
 * and the Shopify bulk operation it ran (when supplied). The bulk-operation stage is
 * included iff `bulkOperation` is given — presence-driven, so a flow with none stays
 * structurally bulk-op-free.
 */
export function composeProgress(
  message: SystemMessage | null | undefined,
  logs: readonly DataManagerLog[],
  bulkOperation?: ShopifyBulkOperation | null,
): SyncProgress {
  const request = messageState(message?.statusId);

  const bulkOperationStage: SyncBulkOperation | undefined = bulkOperation
    ? { id: bulkOperation.id, state: bulkOperationState(bulkOperation.status), objectCount: bulkOperation.objectCount ?? 0 }
    : undefined;

  const imports: SyncImport[] = dedupeById(logs).map((log) => {
    const { state, total, success, failed } = logOutcome(log);
    return { configId: log.configId, state, total, success, failed };
  });

  const total = imports.reduce((sum, entry) => sum + entry.total, 0);
  const success = imports.reduce((sum, entry) => sum + entry.success, 0);
  const failed = imports.reduce((sum, entry) => sum + entry.failed, 0);
  // The import's "no logs" fallback mirrors the immediate upstream: the bulk op if
  // there is one, otherwise the request.
  const state = collapseImports(imports, bulkOperationStage?.state ?? request);

  return {
    request,
    ...(bulkOperationStage ? { bulkOperation: bulkOperationStage } : {}),
    import: { state, total, success, failed, imports },
    overall: overallState(request, state, bulkOperationStage?.state),
  };
}
