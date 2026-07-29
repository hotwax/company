import { reactive } from "vue";
import { commonUtil } from "@common";
import { appCacheDb, clearSyncMarkers, ensureCacheIdentity } from "@/utils/appCacheDb";
import { CacheReconciliationError } from "@/utils/cacheReconciliationError";
import { REFERENCE_DOMAIN_NAMES } from "@/utils/cacheDomainCatalog";
import { type SyncService, createSyncService } from "./pollingService";
import type { ActiveDomain } from "@/workers/syncRegistry";

/**
 * App-wide class-B cache bootstrap (decision D2).
 *
 * Reference/config data syncs ONCE PER LOGIN and thereafter only on mutation — never on a cadence
 * and NOT on every page load. A browser refresh keeps the session, so re-snapshotting every
 * reference set on each reload was pure waste (measured: 27 requests per refresh). The
 * once-per-login marker lives in the cache; logout wipes it, so the next login re-syncs.
 *
 * This runs app-wide rather than per view, because having it cached is exactly what makes
 * navigation instant: a page opens against IndexedDB instead of waiting on a 500-row fetch.
 *
 * A single long-lived worker serves all of these (the harness's class-B semantics: no
 * `intervalMs` ⇒ run once on activation, then idle). View-scoped class-A polling is separate and
 * uses its own service via `useCacheSync`.
 */
// Derived from the shared catalog so Settings and the bootstrap can never disagree.
const REFERENCE_DOMAINS: ActiveDomain[] = REFERENCE_DOMAIN_NAMES.map((name) => ({ name }));

let service: SyncService | null = null;
let starting: Promise<void> | null = null;
let startGeneration = 0;

/**
 * A domain can have several independently refetched scopes in flight (for example one carrier
 * party per detail screen). Keep their failures separately even though the public status contract
 * intentionally exposes one message per domain.
 */
const domainErrors = new Map<string, string>();
const scopedDomainErrors = new Map<string, Map<string, string>>();

function updateVisibleError(domain: string): void {
  const domainError = domainErrors.get(domain);
  if(domainError !== undefined) {
    bootstrapState.errors[domain] = domainError;

    return;
  }
  const scoped = scopedDomainErrors.get(domain);
  const messages = scoped ? [...scoped.values()] : [];
  if(messages.length) {
    bootstrapState.errors[domain] = messages[messages.length - 1];
  } else {
    delete bootstrapState.errors[domain];
  }
}

function recordSyncError(domain: string, message: string, scope?: string): void {
  if(scope) {
    const scoped = scopedDomainErrors.get(domain) ?? new Map<string, string>();
    // Move a repeated failure to the end so the public message reflects the newest failure.
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
  if(scoped?.size === 0) {scopedDomainErrors.delete(domain);}
  updateVisibleError(domain);
}

/**
 * Status of the last bootstrap pass.
 *
 * REACTIVE on purpose: `useCachedList` reads `running` to tell "the seed sync has not finished
 * yet" apart from "this table is genuinely empty". `service.start()` awaits the first full pass,
 * so this stays true for the whole seed.
 */
export const bootstrapState = reactive<{
  running: boolean;
  written: Record<string, number>;
  errors: Record<string, string>;
}>({ running: false, written: {}, errors: {} });

/**
 * Start the reference-data sync. Idempotent — safe to call on every app mount; a second call
 * while the first is in flight awaits the same promise.
 */
export function startReferenceSync(): Promise<void> {
  if(starting) {return starting;}
  const generation = ++startGeneration;
  bootstrapState.running = true;
  const attemptService = createSyncService({
    domains: REFERENCE_DOMAINS,
    // Base tick only decides when DUE domains run; class B is never due after its bootstrap, so
    // this loop costs nothing beyond one wake-up per interval.
    baseTickMs: 30_000,
    onStatus: (status) => {
      // Ignore a terminated attempt that reports one last queued worker message after logout or
      // after a failed start has already been replaced.
      if(generation !== startGeneration || service !== attemptService) {return;}
      if(status.type === "sync-end" && status.domain) {
        const domain = String(status.domain);
        bootstrapState.written[domain] = status.written ?? 0;
        // A successful full snapshot verifies the whole domain and therefore every scoped row.
        clearDomainErrors(domain);
      } else if(status.type === "refetch-end" && status.domain) {
        const domain = String(status.domain);
        bootstrapState.written[domain] = status.written ?? 0;
        // A targeted read verifies only its own PK scope. A legacy message without scope cannot
        // safely prove that some other failed scope recovered, so it clears nothing.
        if(typeof status.scope === "string" && status.scope) {
          clearScopeError(domain, status.scope);
        }
      } else if(status.type === "sync-error" || status.type === "auth-error") {
        // Startup errors predate domain activation. Treat a legacy/domainless message as global
        // rather than letting a cold cache masquerade as a trustworthy empty one.
        const domain = String(status.domain || "__start");
        const scope = typeof status.scope === "string" && status.scope
          ? status.scope
          : undefined;
        recordSyncError(domain, String(status.message ?? "failed"), scope);
      }
    },
  });
  service = attemptService;
  let succeeded = false;
  const readiness = cacheIdentityCheck()
    .then(() => attemptService.start())
    .then(() => {
      if(generation !== startGeneration || service !== attemptService) {return;}
      // Keep a previous startup failure visible through the retry. Clear it only once the cache
      // opened and the worker's immediate bootstrap pass genuinely completed.
      succeeded = true;
      clearDomainErrors("__start");
    })
    .catch((err) => {
      if(generation !== startGeneration || service !== attemptService) {return;}
      recordSyncError("__start", err instanceof Error ? err.message : String(err));
      attemptService.stop();
      service = null;
    })
    .finally(() => {
      if(generation !== startGeneration) {return;}
      bootstrapState.running = false;
      // A successful promise stays cached to preserve once-per-login idempotency. A failed
      // attempt must not: the Settings refresh action is the user's visible recovery path.
      if(!succeeded && starting === readiness) {starting = null;}
    });
  starting = readiness;

  return readiness;
}

/**
 * Bind the cache to the current user + backend instance, wiping it if either changed.
 *
 * Necessary because a cache can outlive a login: if the browser closes or the session expires
 * without a logout, `postLogout()` never runs and the cache survives. Without this, the next login
 * would see the once-per-login markers already set and skip syncing — serving the previous
 * session's (possibly another user's) reference data.
 */
async function cacheIdentityCheck(): Promise<void> {
  try {
    const { useUserStore } = await import("@/store/user");
    const userId = useUserStore().current?.userId ?? "";
    const identity = `${commonUtil.getMaargURL()}::${userId}`;
    await ensureCacheIdentity(identity);
  } catch {
    // Never block the bootstrap on the identity check.
  }
}

/**
 * Wait for the bootstrap to be genuinely READY, starting it if nothing has yet.
 *
 * `startReferenceSync()` assigns `service` synchronously and only then begins spawning the worker, and
 * `App.vue` calls it fire-and-forget. So `service` is non-null for the whole bootstrap window while
 * the Comlink handle behind it is still null — and `pollingService` answers every call with 0 until
 * that handle exists.
 *
 * Testing `!service` therefore skipped the wait in exactly the case that needed it: a mutation made
 * during app load had its cache refresh silently dropped (returned 0, no error), leaving the screen
 * showing pre-mutation data until the next login sync. Awaiting `starting` is the fix — it is the
 * only value that actually tracks readiness.
 */
async function whenReady(): Promise<void> {
  const readiness = starting ?? startReferenceSync();
  try {
    await readiness;
  } catch {
    // A failed start is already recorded in `bootstrapState.errors`; callers still get their
    // best-effort attempt below rather than an exception from a cache refresh.
  }
}

/**
 * Refetch one reference record after a successful mutation. Moqui's auto-entity endpoints return
 * only the PK on create and effectively nothing on update, so the record has to be re-read for
 * the cache — and therefore the UI — to reflect the change.
 *
 *   await refreshAfterMutation("integrationTypeMapping", { integrationMappingId });
 */
export async function refreshAfterMutation(
  domain: string,
  pk: Record<string, unknown>,
): Promise<number> {
  await whenReady();
  if(bootstrapState.errors.__start) {
    throw new CacheReconciliationError(
      domain,
      pk,
      new Error(bootstrapState.errors.__start),
    );
  }
  if(!service) {
    throw new CacheReconciliationError(
      domain,
      pk,
      new Error("The reference-cache service is unavailable."),
    );
  }
  try {
    return await service.refetchOne(domain, pk);
  } catch (error) {
    throw new CacheReconciliationError(domain, pk, error);
  }
}

/**
 * Force every reference domain to re-snapshot — the manual "refresh from server" path.
 *
 * Needed because once-per-login syncing means changes made OUTSIDE this app (another admin, OFBiz,
 * a backend job) are not picked up mid-session. Mutations made in this app stay correct on their
 * own via `refreshAfterMutation`.
 */
export async function resyncReferenceData(): Promise<void> {
  await clearSyncMarkers();
  await whenReady();
  if(!service) {
    throw new Error(bootstrapState.errors.__start ?? "The reference-cache service is unavailable.");
  }
  await service.syncNow();
}

/** Force ONE domain to re-sync now — the per-row refresh in Settings. */
export async function resyncDomain(domain: string): Promise<void> {
  await appCacheDb.syncMeta.delete(`domain:${domain}`);
  await whenReady();
  if(!service) {
    throw new Error(bootstrapState.errors.__start ?? "The reference-cache service is unavailable.");
  }
  await service.syncDomainNow(domain);
}

/** Tear down on logout. The cache itself is wiped separately by `clearAllCaches()`. */
export function stopReferenceSync(): void {
  startGeneration += 1;
  if(service) { service.stop(); service = null; }
  starting = null;
  bootstrapState.running = false;
}

export const referenceDomainNames = REFERENCE_DOMAINS.map((domain) => domain.name);
