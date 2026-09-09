import { useDbStatus } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { resyncDomain, resyncReferenceData } from "@/services/appCacheBootstrap";
import { CACHE_DOMAIN_CATALOG, type CacheDomainEntry } from "@/utils/db/cacheDomainCatalog";

export type CacheDomainStatus = ReturnType<typeof useDbStatus>["domains"]["value"][number];

/**
 * Refresh routes through Company's OWN sync service, not `@common/db`'s `appDbBootstrap`.
 *
 * Company starts its worker with `createSyncService` rather than `startDbBootstrap`, so the
 * framework bootstrap holds no harness proxy and its fallback resolves domains from the
 * main-thread registry — which is empty, since every domain registers inside the worker module.
 * Left to the default, both Settings controls resolved successfully having synced nothing.
 */
export function useCacheStatus() {
  return useDbStatus(companyDb.raw(), CACHE_DOMAIN_CATALOG as any, {
    resyncDomain,
    resyncAll: resyncReferenceData,
  });
}
