import { setupAppDbSync } from "@common/db/sync/setupAppDbSync";
import { createSyncService } from "@common/db/sync/syncService";
import { companyDb } from "@/db/companyDb";
import appSyncUrl from "../workers/appSync.worker.ts?worker&url";

export const {
  syncService,
  startAppDbSync,
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
} = setupAppDbSync({
  db: companyDb,
  getWorkerUrl: () => new URL(appSyncUrl, import.meta.url),
  createSyncService,
});
