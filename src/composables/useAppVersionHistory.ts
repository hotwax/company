import { api, commonUtil, logger } from "@common";
import { onScopeDispose, ref } from "vue";

interface VersionChange {
  auditHistorySeqId: string;
  oldValueText?: string;
  newValueText?: string;
  changedDate: number;
  changedByUserId?: string;
  pkSecondaryValue: string;
}

// Like job audit history, this is a paged server ledger, not a cached reference snapshot.
export function useAppVersionHistory(appId: string) {
  const changes = ref<VersionChange[]>([]);
  const usernames = ref<Record<string, string>>({});
  const loading = ref(false);
  const error = ref(false);
  const hasMore = ref(false);
  const pageSize = 20;
  let pageIndex = 0;
  let disposed = false;
  onScopeDispose(() => {disposed = true;});

  async function loadMore() {
    if(loading.value || disposed) {return;}
    loading.value = true;
    error.value = false;
    try {
      const response = await api({
        url: "admin/entityAuditLogs",
        method: "get",
        params: {
          changedEntityName: "co.hotwax.app.CommerceAppDeployment",
          pkPrimaryValue: appId,
          changedFieldName: "currentVersion",
          pageIndex, pageSize, orderByField: "-changedDate,-auditHistorySeqId"
        }
      }) as any;
      if(commonUtil.hasError(response) || !Array.isArray(response.data?.entityAuditLogs)) {throw response;}
      const rows: VersionChange[] = response.data.entityAuditLogs;
      if(disposed) {return;}
      const existing = new Set(changes.value.map(row => row.auditHistorySeqId));
      changes.value.push(...rows.filter(row => ["AppEnvUAT", "AppEnvProd"].includes(row.pkSecondaryValue) && !existing.has(row.auditHistorySeqId)));
      pageIndex += 1;
      hasMore.value = rows.length === pageSize;
      const userIds = [...new Set(rows.map(row => row.changedByUserId).filter((id): id is string => !!id && !usernames.value[id]))];
      await Promise.all(userIds.map(async userId => {
        try {
          const user = await api({ url: `admin/users/${encodeURIComponent(userId)}`, method: "get" }) as any;
          if(!disposed && !commonUtil.hasError(user)) {usernames.value[userId] = user.data?.username?.trim() || "";}
        } catch(cause) {
          logger.warn(cause);
        }
      }));
    } catch(cause) {
      if(!disposed) {error.value = true;}
      logger.error(cause);
    } finally {
      if(!disposed) {loading.value = false;}
    }
  }

  return { changes, usernames, loading, error, hasMore, loadMore };
}
