import { setupAppDbSync } from "@common/db/sync/setupAppDbSync";
import { createSyncService } from "@common/db/sync/syncService";
import emitter from "@common/core/emitter";
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
  // A login in another tab or app moved the shared session to another OMS instance; sync has
  // stopped. App.vue (useOmsInstanceChangeAlert) asks the user to reload.
  onInstanceChanged: (change) => emitter.emit("omsInstanceChanged", change),
});
