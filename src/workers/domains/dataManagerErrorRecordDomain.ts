import Papa from "papaparse";
import { companyDb } from "@/db/companyDb";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";
import { ERROR_RECORD_TTL_MS } from "@/config/appSyncConfig";

const errorRecordEntity = companyDb.entity(companyDb.tables.dataManagerErrorRecords);

/**
 * The records of an error file: a JSON array, or CSV with a header row. Anything else has no records.
 */
export function parseErrorFile(data: unknown): Record<string, any>[] {
  if (Array.isArray(data)) return data;
  if (typeof data !== "string") return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return Papa.parse<Record<string, any>>(data, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    }).data || [];
  }
}

/** One stored row per record, with the fields screens search on lifted out of the product payload. */
export function toErrorRecordRows(logContentId: string, records: Record<string, any>[], fetchedAt: number) {
  return records.map((record, seqId) => {
    const product = record.virtualProduct || {};
    return {
      logContentId,
      seqId,
      numericId: record.numericId || (product.id ? String(product.id).split("/").pop() : ""),
      title: record.title || product.title || "",
      handle: record.handle || product.handle || "",
      sku: record.sku || product.variants?.[0]?.sku || "",
      error: record.error || record._ERROR_MESSAGE_ || record.message || record.errorMessage || "",
      fetchedAt,
      raw: record.raw || record,
    };
  });
}

/**
 * DataManager error records — class C: one import's error file, downloaded when a screen asks for it
 * (`refreshAfterMutation("dataManagerErrorRecord", { configId, logContentId })`), never polled.
 *
 * A log whose rows are younger than two hours is answered from the table without a download, unless
 * `force` is set (the screen's Refresh). Every write also prunes the rows of any log past two hours,
 * which is what keeps the table to recent files. Resolves with that log's row count, fresh or written.
 */
export const dataManagerErrorRecordDomain = defineSyncDomain({
  name: "dataManagerErrorRecord",
  table: "dataManagerErrorRecords",
  label: "Data Manager error records",
  syncClass: "C",
  async sync() {
    return 0;
  },
  async refetchOne(ctx, pk) {
    const configId = String(pk?.configId ?? "");
    const logContentId = String(pk?.logContentId ?? "");
    if (!configId || !logContentId) return 0;

    // ctx.now is the login time; expiry needs the current one.
    const now = Date.now();
    const expiredBefore = now - ERROR_RECORD_TTL_MS;

    if (!pk?.force) {
      const stored = await errorRecordEntity.query({ equals: { logContentId } });
      const fresh = stored.filter((row: any) => Number(row.fetchedAt) > expiredBefore);
      if (fresh.length) return fresh.length;
    }

    const file = await workerGet(ctx, "admin/dataManager/downloadDataManagerFile", { configId, logContentId });
    const rows = toErrorRecordRows(logContentId, parseErrorFile(file?.csvData || file), now);
    const { written } = await errorRecordEntity.snapshotReplace(rows, { field: "logContentId", value: logContentId });

    const expired = await errorRecordEntity.query({ dateField: "fetchedAt", until: expiredBefore });
    if (expired.length) await errorRecordEntity.bulkRemove(expired.map((row: any) => [row.logContentId, row.seqId]));

    return written;
  },
});
