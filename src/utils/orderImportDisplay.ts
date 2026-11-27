import { translate } from "@common";
import { logState, type DataManagerLog } from "@/utils/dataManagerLog";
import type { ShopifyOrderSyncImport, SyncProgressState } from "@/composables/useShopify";

type ImportLog = Partial<DataManagerLog>;
type Count = "successRecordCount" | "failedRecordCount" | "totalRecordCount";

function reported(log: ImportLog, field: Count) {
  const value = log[field];
  if (value != null && Number.isSafeInteger(Number(value)) && Number(value) >= 0) return Number(value);
  if (field === "successRecordCount" && log.statusId === "DmlsFinished" && log.totalRecordCount != null && log.failedRecordCount != null) {
    const difference = log.totalRecordCount - log.failedRecordCount;
    if (Number.isSafeInteger(difference) && difference >= 0) return difference;
  }
}

export function sumReported(logs: ImportLog[], field: Count) {
  if (!logs.length) return;
  let sum = 0;
  for (const log of logs) {
    const value = reported(log, field);
    if (value == null) return;
    sum += value;
  }
  return sum;
}

export function importCountsLabel(logs: ImportLog[]) {
  const succeeded = sumReported(logs, "successRecordCount");
  const failed = sumReported(logs, "failedRecordCount");
  if (succeeded != null && failed != null) return translate("{succeeded} succeeded · {failed} failed", { succeeded, failed });
  if (succeeded != null) return translate("{count} succeeded", { count: succeeded });
  if (failed != null) return translate("{failed} failed", { failed });
  return translate("Counts unavailable");
}

export function orderImportState(log: ImportLog) {
  if (log.statusId === "DmlsRunning") return "active";
  return logState(log.statusId, { total: log.totalRecordCount ?? 0, success: reported(log, "successRecordCount") ?? 0, failed: log.failedRecordCount ?? 0 });
}

export function progressStateLabel(state: SyncProgressState): string {
  if (state === "completed") return translate("Completed");
  if (state === "partial") return translate("Partially completed");
  if (state === "failed") return translate("Failed");
  if (state === "active") return translate("In progress");
  return translate("Waiting");
}

export function progressColor(state: SyncProgressState): string {
  if (state === "completed") return "success";
  if (state === "partial") return "warning";
  if (state === "failed") return "danger";
  if (state === "active") return "primary";
  return "medium";
}

export function orderImportGroups(logs: ShopifyOrderSyncImport[], configIds: string[]) {
  const [created, updated] = configIds;
  const labels = new Map<string | undefined, string>([
    [created, translate("New orders")], [updated, translate("Order updates")],
  ]);
  if (created === updated) labels.set(created, translate("New orders and updates"));
  for (const log of logs) {
    if (!labels.has(log.configId)) labels.set(log.configId, log.configId === "BULK_ORDER_HISTORY"
      ? translate("Historic order import") : log.configId || translate("Import log"));
  }
  return [...labels].map(([configId, label]) => ({ configId, label, logs: logs.filter(log => log.configId === configId) }));
}

export function emptyImportLabel(batch: SyncProgressState) {
  return ["completed", "failed"].includes(batch) ? translate("No import recorded") : translate("Waiting");
}
