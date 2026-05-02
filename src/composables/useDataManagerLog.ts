import { reactive, toRefs } from 'vue';
import api from '@/api';
import logger from '@/logger';
import { clearStorage, getErrorRecords, setErrorRecords } from '@/utils/storage';

export function useDataManagerLog() {
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
    console.log("Fetching failed records", configId, errorLogContentId);
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
        // Fallback since PapaParse might not be available in this app
        // Stores raw CSV string as an array of rows
        state.errorLogs = state.errorCsvRecords && typeof state.errorCsvRecords === 'string' 
          ? state.errorCsvRecords.split('\n').filter(Boolean) 
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
    console.log({mdmLog, mdmLogDetails})

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
    fetchAllRecentFailedRecords,
    fetchRecentLogsByConfigId,
    clearStorage
  };
}
