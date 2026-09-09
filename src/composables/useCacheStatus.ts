import { useDbStatus } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { resyncDomain, resyncReferenceData, syncService } from "@/services/appCacheBootstrap";

export type CacheDomainStatus = ReturnType<typeof useDbStatus>["domains"]["value"][number];

/**
 * Status of all cached domains for the Settings page.
 * Derives domain catalog dynamically from worker harness's catalog().
 */
export function useCacheStatus() {
  return useDbStatus(
    companyDb.raw(),
    async () => (await syncService()?.catalog()) ?? [],
    {
      resyncDomain,
      resyncAll: resyncReferenceData,
    },
  );
}
