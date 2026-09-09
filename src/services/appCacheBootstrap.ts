import { reactive } from "vue";
import { commonUtil } from "@common";
import { createSyncService, createSyncServiceV2, serviceState, type SyncServiceV2 } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { clearSyncMarkers, ensureCacheIdentity } from "@/utils/db/appCacheDb";
import { CacheReconciliationError } from "@/utils/db/cacheReconciliationError";
import { REFERENCE_DOMAIN_NAMES } from "@/utils/db/cacheDomainCatalog";
import { cacheScopeKey } from "@/utils/db/cacheScopeKey";
import appSyncUrl from "@/workers/appSync.worker.ts?worker&url";

/**
 * Reactive status of reference-data sync (backed by framework `serviceState`).
 */
export const bootstrapState = reactive<{
  running: boolean;
  written: Record<string, number>;
  errors: Record<string, string>;
}>({
  get running() { return serviceState.running; },
  set running(v) { serviceState.running = v; },
  written: serviceState.written,
  errors: serviceState.errors,
});

let service: SyncServiceV2 | null = null;
let starting: Promise<void> | null = null;
let startGeneration = 0;

const domainErrors = new Map<string, string>();
const scopedDomainErrors = new Map<string, Map<string, string>>();

function updateVisibleError(domain: string): void {
  const domainError = domainErrors.get(domain);
  if (domainError !== undefined) {
    bootstrapState.errors[domain] = domainError;
    return;
  }
  const scoped = scopedDomainErrors.get(domain);
  const messages = scoped ? [...scoped.values()] : [];
  if (messages.length) {
    bootstrapState.errors[domain] = messages[messages.length - 1];
  } else {
    delete bootstrapState.errors[domain];
  }
}

function recordSyncError(domain: string, message: string, scope?: string): void {
  if (scope) {
    const scoped = scopedDomainErrors.get(domain) ?? new Map<string, string>();
    if (scoped.get(scope) === message) {
      updateVisibleError(domain);
      return;
    }
    scoped.delete(scope);
    scoped.set(scope, message);
    scopedDomainErrors.set(domain, scoped);
  } else {
    domainErrors.set(domain, message);
  }
  updateVisibleError(domain);
}

function clearDomainErrors(domain: string): void {
  domainErrors.delete(domain);
  scopedDomainErrors.delete(domain);
  updateVisibleError(domain);
}

function clearScopeError(domain: string, scope: string): void {
  const scoped = scopedDomainErrors.get(domain);
  scoped?.delete(scope);
  if (scoped?.size === 0) {
    scopedDomainErrors.delete(domain);
  }
  updateVisibleError(domain);
}

/**
 * Access the single active `SyncServiceV2` instance.
 */
export function syncService(): SyncServiceV2 | null {
  return service;
}

/**
 * Start the reference-data sync. Idempotent.
 */
export function startReferenceSync(): Promise<void> {
  if (starting) return starting;
  const generation = ++startGeneration;

  bootstrapState.running = true;
  const factory = createSyncService || createSyncServiceV2;
  const attemptService = factory({
    workerUrl: new URL(appSyncUrl, import.meta.url),
    onStatus: (status: Record<string, any>) => {
      if (generation !== startGeneration || service !== attemptService) return;
      if (status.type === "sync-end" && status.domain) {
        const domain = String(status.domain);
        bootstrapState.written[domain] = status.written ?? 0;
        clearDomainErrors(domain);
      } else if (status.type === "refetch-end" && status.domain) {
        const domain = String(status.domain);
        bootstrapState.written[domain] = status.written ?? 0;
        if (typeof status.scope === "string" && status.scope) {
          clearScopeError(domain, status.scope);
        }
      } else if (status.type === "sync-error" || status.type === "auth-error") {
        const domain = String(status.domain || "__start");
        const scope = typeof status.scope === "string" && status.scope ? status.scope : undefined;
        recordSyncError(domain, String(status.message ?? "failed"), scope);
      }
    },
  }) as SyncServiceV2;
  service = attemptService;

  let succeeded = false;
  const readiness = cacheIdentityCheck()
    .then(() => attemptService.start())
    .then(() => {
      if (generation !== startGeneration || service !== attemptService) return;
      succeeded = true;
      clearDomainErrors("__start");
    })
    .catch((err) => {
      if (generation !== startGeneration || service !== attemptService) return;
      recordSyncError("__start", err instanceof Error ? err.message : String(err));
      attemptService.stop();
      service = null;
    })
    .finally(() => {
      if (generation !== startGeneration) return;
      bootstrapState.running = false;
      if (!succeeded && starting === readiness) starting = null;
    });

  starting = readiness;
  return readiness;
}

/**
 * Bind cache identity to user + environment.
 */
async function cacheIdentityCheck(): Promise<void> {
  try {
    const { useUserStore } = await import("@/store/user");
    const userId = useUserStore().current?.userId ?? "";
    const identity = `${commonUtil.getMaargURL()}::${userId}`;
    await ensureCacheIdentity(identity);
  } catch {
    // Never block bootstrap on identity check.
  }
}

/**
 * Wait for bootstrap readiness.
 */
async function whenReady(): Promise<void> {
  const readiness = starting ?? startReferenceSync();
  try {
    await readiness;
  } catch {
    // Recorded in bootstrapState.errors
  }
}

/**
 * Refetch one reference record after a successful mutation.
 */
export async function refreshAfterMutation(
  domain: string,
  pk: Record<string, unknown>,
): Promise<number> {
  await whenReady();
  if (bootstrapState.errors.__start) {
    throw new CacheReconciliationError(
      domain,
      pk,
      new Error(bootstrapState.errors.__start),
    );
  }
  if (!service) {
    const cause = new Error("The reference-cache service is unavailable.");
    recordSyncError(domain, cause.message, cacheScopeKey(pk));
    throw new CacheReconciliationError(domain, pk, cause);
  }
  try {
    return await service.refetchOne(domain, pk);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordSyncError(domain, message, cacheScopeKey(pk));
    throw new CacheReconciliationError(domain, pk, error);
  }
}

/**
 * Force every reference domain to re-snapshot.
 */
export async function resyncReferenceData(): Promise<void> {
  await clearSyncMarkers();
  await whenReady();
  if (!service) {
    throw new Error(bootstrapState.errors.__start ?? "The reference-cache service is unavailable.");
  }
  await service.syncNow();
}

/**
 * Force ONE domain to re-sync now.
 */
export async function resyncDomain(domain: string): Promise<void> {
  await companyDb.raw().syncMeta.delete(`loginSync:${domain}`);
  await whenReady();
  if (!service) {
    throw new Error(bootstrapState.errors.__start ?? "The reference-cache service is unavailable.");
  }
  await service.syncDomainNow(domain);
}

/**
 * Tear down sync service on logout.
 */
export function stopReferenceSync(): void {
  startGeneration += 1;
  if (service) {
    service.stop();
    service = null;
  }
  starting = null;
  bootstrapState.running = false;
  domainErrors.clear();
  scopedDomainErrors.clear();
}

export const referenceDomainNames = REFERENCE_DOMAIN_NAMES;
