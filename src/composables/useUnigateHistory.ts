import { api, commonUtil } from "@common";
import { ref } from "vue";

const entityName = "moqui.service.message.SystemMessageRemote";
const recordId = "UNIGATE_CONFIG";
const pageSize = 20;
export type ConnectionAuditRow = { id: string; field: string; changedAt: string | number; changedBy: string; oldValue?: string; newValue?: string };

function safeValue(field: string, value: unknown) {
  const text = String(value ?? "");
  if(field !== "sendUrl" || !text) {return text;}
  try {
    const url = new URL(text);

    return `${url.origin}${url.pathname}`;
  } catch { return ""; }
}

// Never retain credential values or the raw audit record in reactive state.
function projectConnectionAudit(row: any): ConnectionAuditRow {
  const field = String(row.changedFieldName || "");
  const safe = ["internalId", "username", "sendUrl"].includes(field);

  return {
    id: String(row.auditHistorySeqId), field,
    changedAt: row.changedDate || "",
    changedBy: String(row.changedByUserLoginId || row.changedByUserId || ""),
    ...(safe ? { oldValue: safeValue(field, row.oldValueText), newValue: safeValue(field, row.newValueText) } : {}),
  };
}

export function useUnigateHistory() {
  const rows = ref<ConnectionAuditRow[]>([]);
  const loading = ref(false);
  const error = ref(false);
  const hasMore = ref(false);
  let nextPage = 0;
  let generation = 0;

  async function load(reset = true) {
    if(loading.value && !reset) {return;}
    const request = ++generation;
    const page = reset ? 0 : nextPage;
    loading.value = true;
    error.value = false;
    try {
      const response = await api({ url: "admin/entityAuditLogs", method: "get", cache: false, params: { changedEntityName: entityName, pkPrimaryValue: recordId, pageSize, pageIndex: page, orderByField: "-changedDate" } });
      if(commonUtil.hasError(response)) {throw new Error("Audit read failed");}
      const data = response.data;
      const entries = Array.isArray(data) ? data : data?.entityAuditLogs || data?.entityAuditLogList;
      if(!Array.isArray(entries)) {throw new Error("Invalid audit response");}
      const projected = entries.filter((row: any) => row.changedEntityName === entityName && row.pkPrimaryValue === recordId).map(projectConnectionAudit);
      if(request !== generation) {return;}
      rows.value = reset ? projected : [...rows.value, ...projected.filter((row) => !rows.value.some((current) => current.id === row.id))];
      hasMore.value = entries.length === pageSize;
      nextPage = page + 1;
    } catch {
      if(request === generation) {error.value = true;}
    } finally {
      if(request === generation) {loading.value = false;}
    }
  }

  return { rows, loading, error, hasMore, load };
}
