import { computed, reactive, toRefs } from 'vue';
import { useStore } from 'vuex';
import { useSystemMessage } from './useSystemMessage';
import { useDataManagerLog } from './useDataManagerLog';
import { ShopifyProductSyncRun } from '@/services/ShopifyProductSyncService';
import { translate } from '@/i18n';

export function useShopifyProductSyncRun() {
  const store = useStore();
  const statusItems = computed(() => store.getters['util/getStatusItems']);
  const { fetchShopifyBulkOperationBySystemMessageId } = useSystemMessage();
  const { fetchMdmLogBySystemMessageIds } = useDataManagerLog();

  const state = reactive({
    currentSyncRun: {} as ShopifyProductSyncRun,
    loading: false
  });

  const getStatusColor = (status: string) => {
    if (!status) return "medium";
    const s = status.toLowerCase();
    if (s.includes("success") || s.includes("completed") || s.includes("consumed") || s.includes("confirmed") || s.includes("finished") || s === "dmlsuccess") return "success";
    if (s.includes("error") || s.includes("failed") || s.includes("rejected") || s === "dmlerror") return "danger";
    if (s.includes("running") || s.includes("sent") || s.includes("produced") || s.includes("smsg")) return "primary";
    if (s === "skipped") return "warning";
    return "medium";
  };

  const getStatusLabel = (status: string) => {
    if (!status) return translate("Pending");

    if (statusItems.value[status]) {
      return statusItems.value[status].description || statusItems.value[status].statusId;
    }

    const s = status.toLowerCase();
    if (s === "running") return translate("Running");
    if (s === "completed") return translate("Complete");
    if (s === "failed") return translate("Error");
    if (s === "canceled" || s === "cancelled") return translate("Canceled");
    if (s === "skipped") return translate("Skipped");
    return status;
  };

  const getSystemMessageErrorText = (systemMessageErrors: any[]) => {
    const errors = Array.isArray(systemMessageErrors) ? systemMessageErrors : [];

    for (const error of errors) {
      const errorText = String(error?.errorText || "").trim();
      if (errorText) return errorText;
    }

    return "";
  };

  const fetchSyncRun = async (systemMessageId: string, systemMessageData?: any) => {
    if (!systemMessageId && !systemMessageData) return null;
    
    state.loading = true;
    try {
      // Fetch System Message and related Shopify Bulk Operation
      const {
        systemMessage,
        systemMessageErrors = [],
        shopifyBulkOperation,
        bulkOperationId,
        relatedSystemMessageIds = []
      } = await fetchShopifyBulkOperationBySystemMessageId(systemMessageId, systemMessageData);
      const syncRunSystemMessageId = systemMessageId || systemMessage?.systemMessageId;
      
      // Fetch MDM Log
      const mdmLogSystemMessageIds = relatedSystemMessageIds.length ? relatedSystemMessageIds : [syncRunSystemMessageId];
      const mdmLog = await fetchMdmLogBySystemMessageIds(mdmLogSystemMessageIds) || {};

      // Map to ShopifyProductSyncRun
      const syncRun: ShopifyProductSyncRun = {
        systemMessageId: syncRunSystemMessageId,
        systemMessage: {
          ...systemMessage,
          systemMessageErrors,
          errorText: getSystemMessageErrorText(systemMessageErrors),
          messageText: String(systemMessage?.messageText || "").trim(),
          statusLabel: getStatusLabel(systemMessage?.statusId),
          statusColor: getStatusColor(systemMessage?.statusId)
        },
        bulkOperation: {
          id: shopifyBulkOperation?.id || bulkOperationId,
          status: shopifyBulkOperation?.status || systemMessage?.statusId,
          statusLabel: shopifyBulkOperation?.isStatusUnavailable ? getStatusLabel(systemMessage?.statusId) : getStatusLabel(shopifyBulkOperation?.status),
          statusColor: shopifyBulkOperation?.isStatusUnavailable ? getStatusColor(systemMessage?.statusId) : getStatusColor(shopifyBulkOperation?.status),
          isStatusUnavailable: shopifyBulkOperation?.isStatusUnavailable,
          objectCount: shopifyBulkOperation?.objectCount,
          rootObjectCount: shopifyBulkOperation?.rootObjectCount,
          createdAt: shopifyBulkOperation?.createdAt,
          completedAt: shopifyBulkOperation?.completedAt,
          query: shopifyBulkOperation?.query
        },
        mdmLog: {
          id: mdmLog?.logId,
          statusId: mdmLog?.statusId || (shopifyBulkOperation?.status === 'COMPLETED' && Number(shopifyBulkOperation?.objectCount || 0) === 0 ? 'skipped' : undefined),
          statusLabel: getStatusLabel(mdmLog?.statusId || (shopifyBulkOperation?.status === 'COMPLETED' && Number(shopifyBulkOperation?.objectCount || 0) === 0 ? 'skipped' : undefined)),
          statusColor: getStatusColor(mdmLog?.statusId || (shopifyBulkOperation?.status === 'COMPLETED' && Number(shopifyBulkOperation?.objectCount || 0) === 0 ? 'skipped' : undefined)),
          startDate: mdmLog?.startDate,
          endDate: mdmLog?.endDate,
          finishDateTime: mdmLog?.finishDateTime,
          createdDate: mdmLog?.createdDate,
          createdStamp: mdmLog?.createdStamp,
          completedDate: mdmLog?.completedDate,
          completedAt: mdmLog?.completedAt,
          lastUpdatedStamp: mdmLog?.lastUpdatedStamp,
          totalRecordCount: mdmLog?.totalRecordCount,
          failedRecordCount: mdmLog?.failedRecordCount,
          successRecordCount: mdmLog?.successRecordCount,
          configId: mdmLog?.configId,
          logContentId: mdmLog?.logContentId,
          fileName: mdmLog?.fileName
        },
        status: getStatusLabel(mdmLog?.statusId || (shopifyBulkOperation?.status === 'COMPLETED' && Number(shopifyBulkOperation?.objectCount || 0) === 0 ? 'skipped' : shopifyBulkOperation?.status) || systemMessage?.statusId),
        statusColor: getStatusColor(mdmLog?.statusId || (shopifyBulkOperation?.status === 'COMPLETED' && Number(shopifyBulkOperation?.objectCount || 0) === 0 ? 'skipped' : shopifyBulkOperation?.status) || systemMessage?.statusId),
        completed: mdmLog?.statusId === "DmlSuccess" || mdmLog?.statusId === "DmlError" || (shopifyBulkOperation?.status === 'COMPLETED' && Number(shopifyBulkOperation?.objectCount || 0) === 0)
      };

      state.currentSyncRun = syncRun;
      return syncRun;
    } finally {
      state.loading = false;
    }
  };

  return {
    ...toRefs(state),
    fetchSyncRun
  };
}
