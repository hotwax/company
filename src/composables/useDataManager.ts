import { computed, reactive, toRefs, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { api, logger, useLiveEntity } from '@common'
import { companyDb } from '@/db/companyDb';
import { refreshAfterMutation } from '@/db/appDbSync';
import { ERROR_RECORD_TTL_MS } from '@/config/appSyncConfig';

/**
 * The newest imports for one DataManager config, LIVE from the cache.
 *
 * `fetchRecentLogsByConfigId` asks `admin/dataManager/details` for exactly what the `dataManagerLog`
 * worker domain already writes to IndexedDB, so a screen that has activated that domain is paying a
 * request for rows it holds. As a cached read the list also stays current on its own — an import
 * finishing shows up without the screen re-fetching to notice.
 *
 * ⚠️ Empty means the `dataManagerLog` domain was never activated for this config, not "no imports".
 */
export function scopeDataManagerLogsToMessages<T extends { systemMessageId?: unknown }>(
  logs: readonly T[],
  systemMessageIds: readonly string[],
  limit: number,
): T[] {
  const wanted = new Set(systemMessageIds.map(String).filter(Boolean));
  if (!wanted.size) return [];
  return logs.filter((log) => wanted.has(String(log.systemMessageId ?? ""))).slice(0, limit);
}

export function useRecentDataManagerLogs(
  configId: string,
  limit = 10,
  systemMessageIds?: MaybeRefOrGetter<readonly string[]>,
) {
  const { records: configLogs, hydrated } = useLiveEntity<any>(companyDb.tables.dataManagerLogs, {
    dateField: "createdDate",
    equals: { configId },
  });

  const records = computed(() => systemMessageIds
    ? scopeDataManagerLogsToMessages(configLogs.value, toValue(systemMessageIds), limit)
    : configLogs.value.slice(0, limit));

  const totalFailedRecords = computed(() =>
    records.value.reduce((sum: number, log: any) => sum + Number(log.failedRecordCount || 0), 0));

  return { logs: records, totalFailedRecords, hydrated };
}

export function useDataManager() {
  const state = reactive({
    currentMdmLog: {} as Record<string, any>,
    recentMdmLogs: [] as any[],
    /** The error files `errorLogs` shows, in order; `logId` is stamped onto their records when set. */
    errorLogSources: [] as Array<{ logContentId: string; logId?: string }>,
    loading: false
  });

  // The error records of the logs in `errorLogSources`, downloaded by the dataManagerErrorRecord
  // domain. Rows past the two-hour expiry are hidden until that domain replaces or prunes them.
  const { records: errorRecordRows } = useLiveEntity<any>(companyDb.tables.dataManagerErrorRecords, () => {
    const logContentIds = new Set(state.errorLogSources.map((source) => source.logContentId));
    if (!logContentIds.size) return { filter: () => false };
    return { filter: (row: any) => logContentIds.has(row.logContentId) && Number(row.fetchedAt) > Date.now() - ERROR_RECORD_TTL_MS };
  });

  const errorLogs = computed(() => {
    const rowsByLog = new Map<string, any[]>();
    for (const row of errorRecordRows.value) {
      const rows = rowsByLog.get(row.logContentId) ?? [];
      rows.push(row);
      rowsByLog.set(row.logContentId, rows);
    }
    return state.errorLogSources.flatMap((source) =>
      (rowsByLog.get(source.logContentId) ?? [])
        .sort((a, b) => a.seqId - b.seqId)
        .map((row) => ({
          ...row.raw,
          numericId: row.numericId,
          title: row.title,
          handle: row.handle,
          sku: row.sku,
          error: row.error,
          ...(source.logId ? { logId: source.logId } : {}),
        })));
  });

  /**
   * Ask the dataManagerErrorRecord domain for one error file. It answers from the table while the
   * file is younger than two hours (unless `force`), and resolves with the file's record count.
   */
  const requestErrorRecords = (configId: string, logContentId: string, force = false) =>
    refreshAfterMutation("dataManagerErrorRecord", { configId, logContentId, force });

  const downloadDataManagerFile = async (configId: string, logContentId: string) => {
    if (!configId || !logContentId) return null;

    return api({
      url: "admin/dataManager/downloadDataManagerFile",
      method: "GET",
      params: {
        configId,
        logContentId
      }
    }) as any;
  };

  const fetchFailedRecords = async (configId: string, errorLogContentId: string) => {
    state.loading = true;
    state.errorLogSources = [{ logContentId: errorLogContentId }];
    try {
      await requestErrorRecords(configId, errorLogContentId);
    } catch (err) {
      logger.error("Failed to download the error records", err);
      throw err;
    } finally {
      state.loading = false;
    }
  };

  const applyMdmLogDetails = async (mdmLog: any) => {
    const mdmLogDetails = {
      ...mdmLog,
      successRecordCount: (Number(mdmLog?.totalRecordCount) || 0) - (Number(mdmLog?.failedRecordCount) || 0)
    };

    state.currentMdmLog = mdmLogDetails;

    if (mdmLogDetails.errorLogContentId) {
      await fetchFailedRecords(mdmLogDetails.configId, mdmLogDetails.errorLogContentId);
    }

    return mdmLogDetails;
  };

  const getFirstMdmLog = (responseData: any) => {
    return responseData?.dataManagerLogs?.length ? responseData.dataManagerLogs[0] : null;
  };

  const fetchMdmLogBySystemMessageId = async (systemMessageId: string) => {
    if (!systemMessageId) return null;

    state.loading = true;
    state.currentMdmLog = {};
    state.errorLogSources = [];
    try {
      const resp = await api({
        url: "admin/dataManager/details",
        method: "GET",
        params: {
          systemMessageId,
          systemMessageId_op: "equals",
          pageSize: 1
        }
      }) as any;

      const mdmLog = getFirstMdmLog(resp?.data);
      if (mdmLog) return applyMdmLogDetails(mdmLog);
    } catch (err) {
      logger.error(`Failed to fetch MDM log for system message ${systemMessageId}`, err);
      throw err;
    } finally {
      state.loading = false;
    }
    return null;
  };

  /**
   * Ask the dataManagerLog domain to fetch one import by `logId`, and return nothing.
   *
   * Screens read imports live, and call this only when their live rows show one missing. A finished
   * import never changes, so once fetched it is never asked for again — which is what makes per-id
   * enrichment viable where a shop-scoped log feed is not: `admin/dataManager/details` ignores shop
   * filters entirely, but by-id always works.
   */
  const requestDataManagerLog = async (logId: string) => {
    if (!logId) return;
    try {
      await refreshAfterMutation("dataManagerLog", { logId: String(logId) });
    } catch (err) {
      logger.error(`Failed to fetch DataManager log ${logId}`, err);
    }
  };

  const fetchMdmLogBySystemMessageIds = async (systemMessageIds: string[]) => {
    const candidateSystemMessageIds = systemMessageIds
      .map((systemMessageId) => String(systemMessageId || "").trim())
      .filter((systemMessageId, index, list) => systemMessageId && list.indexOf(systemMessageId) === index);

    for (const systemMessageId of candidateSystemMessageIds) {
      const mdmLog = await fetchMdmLogBySystemMessageId(systemMessageId);
      if (mdmLog) return mdmLog;
    }

    return null;
  };

  const fetchLogDetails = async (logId: string) => {
    state.loading = true;
    state.currentMdmLog = {};
    state.errorLogSources = [];
    try {
      const resp = await api({
        url: "admin/dataManager/details",
        method: "GET",
        params: {
          logId
        }
      }) as any;

      const mdmLog = getFirstMdmLog(resp?.data);
      if (mdmLog) return applyMdmLogDetails(mdmLog);
    } catch(err) {
      logger.error(`Failed to fetch log with id ${logId}`, err);
      throw err;
    } finally {
      state.loading = false;
    }
    return null;
  };

  const fetchRecentLogsByConfigId = async (configId: string, pageSize = 10) => {
    if (!configId) return [];

    state.loading = true;
    try {
      const resp = await api({
        url: "admin/dataManager/details",
        method: "GET",
        params: {
          configId,
          orderByField: "-finishDateTime",
          pageSize,
          pageIndex: 0
        }
      }) as any;

      state.recentMdmLogs = resp?.data?.dataManagerLogs || [];
      return state.recentMdmLogs;
    } catch (err) {
      logger.error(`Failed to fetch recent MDM logs for config ${configId}`, err);
      state.recentMdmLogs = [];
      throw err;
    } finally {
      state.loading = false;
    }
    return [];
  };

  /**
   * The error records of the given logs, in the order given, until at least 100 are collected.
   * `force` re-downloads every file instead of using one younger than two hours (the Refresh button).
   */
  const fetchAllRecentFailedRecords = async (configId: string, logs: any[], { force = false } = {}) => {
    state.loading = true;
    const sources: Array<{ logContentId: string; logId?: string }> = [];
    let recordCount = 0;

    try {
      for (const log of logs) {
        const errorLogContentId = log.errorLogContentId;
        if (!errorLogContentId) continue;

        recordCount += await requestErrorRecords(configId, errorLogContentId, force);
        sources.push({ logContentId: errorLogContentId, logId: log.logId });

        // Target at least 100 errors total across all processed logs
        if (recordCount >= 100) {
          break;
        }
      }
      state.errorLogSources = sources;
    } catch (err) {
      logger.error("Failed to aggregate error records", err);
    } finally {
      state.loading = false;
    }
  };

  return {
    ...toRefs(state),
    errorLogs,
    downloadDataManagerFile,
    fetchFailedRecords,
    fetchMdmLogBySystemMessageId,
    fetchMdmLogBySystemMessageIds,
    fetchLogDetails,
    requestDataManagerLog,
    fetchAllRecentFailedRecords,
    fetchRecentLogsByConfigId
  };
}


// ---------------------------------------------------------------------------------------------
// Cached reads — the local-first half of the data-manager function.
//
// `useDataManager()` above wraps the live api() operations (log details, failed-record CSVs,
// downloads). The composables below read what the sync worker has already cached, so a view can
// render import history with no request at all.
// ---------------------------------------------------------------------------------------------

/** Cached DataManagerLogs, newest created first. Scope by config to follow one import type. */
export function useDataManagerLogs(configId?: string) {
  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.dataManagerLogs, {
    dateField: 'createdDate',
    ...(configId ? { scope: { field: 'configId', value: configId } } : {}),
  });

  /** Logs with no finish time — imports still running. */
  const running = computed(() => records.value.filter((log: any) => !log.finishDateTime));

  /** Aggregate record counts across the cached logs. */
  const totals = computed(() => records.value.reduce((acc: any, log: any) => ({
    total: acc.total + Number(log.totalRecordCount ?? 0),
    failed: acc.failed + Number(log.failedRecordCount ?? 0),
    success: acc.success + Number(log.successRecordCount ?? 0),
  }), { total: 0, failed: 0, success: 0 }));

  return { logs: records, running, totals, records, hydrated };
}

export function useDataManagerLogRecord(logId: string | undefined) {
  const { first: record, hydrated } = useLiveEntity<any>(companyDb.tables.dataManagerLogs, () => logId ? { equals: { logId } } : { filter: () => false });
  return { record, hydrated };
}

/**
 * The MDM log for one system message — the second half of a sync run.
 *
 * A run's MDM side is reached through `systemMessageId`, which is an indexed field on the log table,
 * so this is an index lookup rather than a scan. Accepts several ids because a bulk-operation run
 * can span a parent message and its children, and the newest matching log wins.
 */
export function useDataManagerLogForMessages(systemMessageIds: Ref<string[]> | (() => string[])) {
  const ids = computed<string[]>(() =>
    (typeof systemMessageIds === 'function' ? systemMessageIds() : systemMessageIds.value) ?? []);

  const { records, hydrated } = useLiveEntity<any>(companyDb.tables.dataManagerLogs, { dateField: 'createdDate' });

  const log = computed<any>(() => {
    if (!ids.value.length) return undefined;
    const wanted = new Set(ids.value.map(String));
    return records.value.find((row: any) => wanted.has(String(row.systemMessageId)));
  });

  return { log, hydrated };
}
