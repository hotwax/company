import { createAppDbSync, createSyncService } from "@common/db";
import { companyDb } from "@/db/companyDb";
import appSyncUrl from "@/workers/appSync.worker.ts?worker&url";

export const {
  syncService,
  startAppDbSync,
  stopAppDbSync,
  refreshAfterMutation,
  resyncDomain,
  resyncReferenceData,
  bootstrapState,
} = createAppDbSync({
  db: companyDb,
  getWorkerUrl: () => new URL(appSyncUrl, import.meta.url),
  createSyncService,
});

export const startReferenceSync = startAppDbSync;
export const stopReferenceSync = stopAppDbSync;
export const referenceDomainNames: string[] = [];
