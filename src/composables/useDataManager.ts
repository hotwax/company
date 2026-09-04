import { computed, reactive, toRefs, type Ref } from 'vue';
import { api, logger } from '@common'
import { dataManagerLogCache } from '@/utils/cacheEntities';
import { useCachedList, useCachedRecord } from './useCachedList';
import { clearStorage, getErrorRecords, setErrorRecords } from '@/utils/storage';
import Papa from 'papaparse';

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
export function useRecentDataManagerLogs(configId: string, limit = 10) {
  const { records, hydrated } = useCachedList<any>(dataManagerLogCache, {
    dateField: "createdDate",
    equals: { configId },
    limit,
  });

  const totalFailedRecords = computed(() =>
    records.value.reduce((sum: number, log: any) => sum + Number(log.failedRecordCount || 0), 0));

  return { logs: records, totalFailedRecords, hydrated };
}

export function useDataManager() {
  const state = reactive({
    currentMdmLog: {} as Record<string, any>,
    recentMdmLogs: [] as any[],
    errorLogs: [] as any[],
    errorCsvRecords: null as any,
    loading: false
  });

  const isValidJSON = (data: any) => {
    try {
      JSON.parse(data);
      return true;
    } catch (err) {
      return false;
    }
  };

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
    const cachedData = await getErrorRecords(errorLogContentId);
    if (cachedData && cachedData.length > 0) {
      state.errorLogs = cachedData;
      state.loading = false;
      return;
    }

    try {
      const resp = await downloadDataManagerFile(configId, errorLogContentId);

      state.errorCsvRecords = resp?.data?.csvData || resp?.data;
      if (isValidJSON(state.errorCsvRecords)) {
        state.errorLogs = JSON.parse(state.errorCsvRecords);
        await setErrorRecords(errorLogContentId, state.errorLogs);
      } else {
        state.errorLogs = typeof state.errorCsvRecords === 'string'
          ? (Papa.parse<Record<string, any>>(state.errorCsvRecords, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim()
          }).data || [])
          : [];
      }
      state.loading = false;
    } catch (err) {
      state.loading = false;
      logger.error("Failed to download the error records", err);
      throw err;
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
    state.errorLogs = [];
    state.errorCsvRecords = null;
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
   * One import by `logId`, CACHE-FIRST and WRITE-THROUGH.
   *
   * The counterpart to `ensureSystemMessageById`. A finished import never changes, so once cached this
   * costs nothing — which is what makes per-id enrichment viable where a shop-scoped log feed is not:
   * `admin/dataManager/details` ignores shop filters entirely, but by-id always works.
   */
  const ensureDataManagerLog = async (logId: string) => {
    if (!logId) return null;
    try {
      const cached = (await dataManagerLogCache.all())
        .find((row: any) => String(row.logId) === String(logId));
      if (cached) return cached.raw ?? cached;
    } catch {
      // cache unavailable — fall through to the network
    }

    try {
      const resp = await api({
        url: "admin/dataManager/details",
        method: "GET",
        params: { logId },
      }) as any;
      const row = getFirstMdmLog(resp?.data);
      if (row) {
        await dataManagerLogCache.upsertMany([row]);
        return row;
      }
    } catch (err) {
      logger.error(`Failed to fetch DataManager log ${logId}`, err);
    }
    return null;
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
    state.errorLogs = [];
    state.errorCsvRecords = null;
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

  const fetchAllRecentFailedRecords = async (configId: string, logs: any[]) => {
    state.loading = true;
    const accumulatedLogs: any[] = [];
    
    try {
      for (const log of logs) {
        const errorLogContentId = log.errorLogContentId;
        if (!errorLogContentId) continue;

        let records = await getErrorRecords(errorLogContentId);
        
        if (!records || records.length === 0) {
          const resp = await downloadDataManagerFile(configId, errorLogContentId);
          const data = resp?.data?.csvData || resp?.data;
          if (isValidJSON(data)) {
            records = JSON.parse(data);
            await setErrorRecords(errorLogContentId, records);
          }
        }

        if (records && records.length > 0) {
          // Flatten to include the logId for context if needed
          const logId = log.logId;
          accumulatedLogs.push(...records.map(r => ({ ...r, logId })));
        }

        // Target at least 100 errors total across all processed logs
        if (accumulatedLogs.length >= 100) {
          break;
        }
      }
      state.errorLogs = accumulatedLogs;
    } catch (err) {
      logger.error("Failed to aggregate error records", err);
    } finally {
      state.loading = false;
    }
  };

  return {
    ...toRefs(state),
    downloadDataManagerFile,
    fetchFailedRecords,
    fetchMdmLogBySystemMessageId,
    fetchMdmLogBySystemMessageIds,
    fetchLogDetails,
    ensureDataManagerLog,
    fetchAllRecentFailedRecords,
    fetchRecentLogsByConfigId,
    clearStorage
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
  const { records, hydrated } = useCachedList<any>(dataManagerLogCache, {
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

export const useDataManagerLogRecord = (logId: string | undefined) =>
  useCachedRecord(dataManagerLogCache, 'logId', logId);

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

  const { records, hydrated } = useCachedList<any>(dataManagerLogCache, { dateField: 'createdDate' });

  const log = computed<any>(() => {
    if (!ids.value.length) return undefined;
    const wanted = new Set(ids.value.map(String));
    return records.value.find((row: any) => wanted.has(String(row.systemMessageId)));
  });

  return { log, hydrated };
}
