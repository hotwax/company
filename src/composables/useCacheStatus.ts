import { computed } from "vue";
import { DateTime } from "luxon";
import { translate } from "@common";
import { catalogFrom, useDbStatus } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { resyncDomain, resyncReferenceData } from "@/db/appDbSync";

export function useCacheStatus() {
  // Live IndexedDB state: per-domain row counts + last sync, and the force-refresh actions.
  const {
    domains, refreshing, totalRows, oldestSyncedAt, lastSyncedAt, refreshDomain, refreshAll,
  } = useDbStatus(
    companyDb.client(),
    // The domains the worker registers, read from the same list rather than asked of the worker: on a
    // reload here, or after sync failed to start, there is no worker to answer, and this card's
    // per-domain Refresh is the way back. Imported on demand to keep the domain code out of startup.
    async () => catalogFrom((await import("@/workers/appSyncDomains")).appSyncDomains),
    {
      resyncDomain,
      resyncAll: resyncReferenceData,
    },
  );

  const formatSyncTime = (millis: number) =>
    DateTime.fromMillis(millis).toLocaleString(DateTime.DATETIME_MED);

  const cacheSubtitle = computed(() => {
    if (!lastSyncedAt.value) return translate("Cache not synced yet");
    const parts = [`${translate("Last sync:")} ${formatSyncTime(lastSyncedAt.value)}`];
    // Reference data syncs once per login, so the oldest snapshot bounds how stale the cache can be.
    if (oldestSyncedAt.value && oldestSyncedAt.value !== lastSyncedAt.value) {
      parts.push(`${translate("oldest:")} ${formatSyncTime(oldestSyncedAt.value)}`);
    }
    return parts.join(", ");
  });

  return {
    domains,
    refreshing,
    totalRows,
    oldestSyncedAt,
    lastSyncedAt,
    refreshDomain,
    refreshAll,
    cacheSubtitle,
    formatSyncTime
  };
}
