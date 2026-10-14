import { createSyncService, deleteLegacyCaches, setupAppDbSync } from "@common/db";
import { companyDb } from "@/db/companyDb";
import appSyncUrl from "@/workers/appSync.worker.ts?worker&url";

const appDbSync = setupAppDbSync({
  db: companyDb,
  getWorkerUrl: () => new URL(appSyncUrl, import.meta.url),
  createSyncService,
});

export const {
  syncService,
  stopAppDbSync,
  refreshAfterMutation,
  resyncDomain,
  resyncReferenceData,
  bootstrapState,
  activateSyncDomains,
  deactivateSyncDomains,
  createSyncDomainOwner,
  syncNow,
  syncDomainsReady,
  syncDomainsError,
} = appDbSync;

let legacyDeleted = false;

/**
 * Start the app's sync. Also drops, once per page load, the fixed-name databases this one replaced
 * (`CompanyCacheDB`, `DataManagerLogCacheDB`) — nothing else ever deletes them.
 */
export function startAppDbSync(onSynced?: () => void): Promise<void> {
  if (!legacyDeleted) {
    legacyDeleted = true;
    void deleteLegacyCaches().catch(() => { /* best effort */ });
  }
  return appDbSync.startAppDbSync(onSynced);
}

export const startReferenceSync = startAppDbSync;
export const stopReferenceSync = stopAppDbSync;
export const referenceDomainNames: string[] = [];
