import { computed } from "vue";
import { api, commonUtil, useLiveEntity } from "@common";
import { serviceState } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { resyncDomain } from "@/db/appDbSync";
import { NETSUITE_STEP_FAILURES_DOMAIN, NETSUITE_STEP_LIST_DOMAIN } from "@/config/appSyncConfig";
import { NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";

export function useNetSuiteStepFailures(productStoreId: () => string, step: () => string, selectedErrorMessage: () => string) {
  const { first: failureList, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteStepFailures,
    () => ({ equals: { productStoreId: productStoreId(), step: step() } }),
  );

  const isForSelection = computed(() => (failureList.value?.selectedErrorMessage ?? "") === selectedErrorMessage());
  const loadError = computed(() => serviceState.errors[NETSUITE_STEP_FAILURES_DOMAIN]);

  const sendAgain = async (records: { recordIds?: string[]; errorMessage?: string }): Promise<number> => {
    const orderStep = NETSUITE_ORDER_STEPS[step()];
    const data: Record<string, unknown> = { ...orderStep.stepParams, productStoreId: productStoreId() };
    if (records.recordIds) data[orderStep.releaseIdsKey] = records.recordIds;
    if (records.errorMessage) data.errorMessage = records.errorMessage;
    const response: any = await api({ url: `${orderStep.urlBase}/failures/release`, method: "post", data });
    if (commonUtil.hasError(response)) throw response;
    await resyncDomain(NETSUITE_STEP_FAILURES_DOMAIN);
    return response?.data?.releasedCount ?? 0;
  };

  return {
    loadError,
    sendAgain,
    isLoading: computed(() => !loadError.value && (!hydrated.value || !isForSelection.value)),
    failureCount: computed<number>(() => isForSelection.value ? failureList.value?.failureCount ?? 0 : 0),
    failures: computed<any[]>(() => isForSelection.value ? failureList.value?.failures ?? [] : []),
    errorGroups: computed<any[]>(() => failureList.value?.errorGroups ?? []),
  };
}

export function useNetSuiteStepList(productStoreId: () => string, step: () => string, list: () => string) {
  const { first: storedList, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteStepLists,
    () => ({ equals: { productStoreId: productStoreId(), step: step(), list: list() } }),
  );

  const loadError = computed(() => serviceState.errors[NETSUITE_STEP_LIST_DOMAIN]);

  return {
    loadError,
    isLoading: computed(() => !loadError.value && (!hydrated.value || !storedList.value)),
    recordCount: computed<number | undefined>(() => storedList.value?.recordCount),
    records: computed<any[]>(() => storedList.value?.records ?? []),
  };
}
