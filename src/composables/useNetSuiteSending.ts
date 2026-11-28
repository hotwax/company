import { computed } from "vue";
import { useLiveEntity } from "@common";
import { serviceState } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { NETSUITE_SENDING_COUNTS_DOMAIN, NETSUITE_SENDING_LIST_DOMAIN } from "@/config/appSyncConfig";

export function useNetSuiteSendingCounts(way: () => string) {
  const { first: counts, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteSendingCounts,
    () => ({ equals: { way: way() } }),
  );

  const isFirstPassPending = computed(() =>
    !serviceState.syncedAt[NETSUITE_SENDING_COUNTS_DOMAIN]
    && !serviceState.errors[NETSUITE_SENDING_COUNTS_DOMAIN]
    && !serviceState.errors.__start);

  return {
    counts,
    isLoading: computed(() => !hydrated.value || (!counts.value && isFirstPassPending.value)),
  };
}

export function useNetSuiteSendingList(way: () => string, list: () => string) {
  const { first: storedList, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteSendingLists,
    () => ({ equals: { way: way(), list: list() } }),
  );

  const loadError = computed(() => serviceState.errors[NETSUITE_SENDING_LIST_DOMAIN]);

  return {
    loadError,
    isLoading: computed(() => !loadError.value && (!hydrated.value || !storedList.value)),
    messageCount: computed<number | undefined>(() => storedList.value?.messageCount),
    messages: computed<any[]>(() => storedList.value?.messages ?? []),
  };
}
