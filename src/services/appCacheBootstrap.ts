import { reactive } from "vue";
import { commonUtil } from "@common";
import { appCacheDb, clearSyncMarkers, ensureCacheIdentity } from "@/utils/appCacheDb";
import { REFERENCE_DOMAIN_NAMES } from "@/utils/cacheDomainCatalog";
import { createSyncService, type SyncService } from "./pollingService";
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
  if (starting) return starting;
  bootstrapState.running = true;
  service = createSyncService({
    domains: REFERENCE_DOMAINS,
    // Base tick only decides when DUE domains run; class B is never due after its bootstrap, so
    // this loop costs nothing beyond one wake-up per interval.
    baseTickMs: 30_000,
    onStatus: (status) => {
      if (status.type === "sync-end" && status.domain) {
        bootstrapState.written[status.domain] = status.written ?? 0;
        delete bootstrapState.errors[status.domain];
      } else if ((status.type === "sync-error" || status.type === "auth-error") && status.domain) {
        bootstrapState.errors[status.domain] = String(status.message ?? "failed");
      }
    },
  });
  starting = cacheIdentityCheck()
    .then(() => service!.start())
    .catch((err) => {
      bootstrapState.errors.__start = err instanceof Error ? err.message : String(err);
    })
    .finally(() => { bootstrapState.running = false; });
  return starting;
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
  if (!starting) startReferenceSync();
  try {
    await starting;
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
  return service ? service.refetchOne(domain, pk) : 0;
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
  if (service) await service.syncNow();
}

/** Force ONE domain to re-sync now — the per-row refresh in Settings. */
export async function resyncDomain(domain: string): Promise<void> {
  await appCacheDb.syncMeta.delete(`domain:${domain}`);
  await whenReady();
  if (service) await service.syncDomainNow(domain);
}

/** Tear down on logout. The cache itself is wiped separately by `clearAllCaches()`. */
export function stopReferenceSync(): void {
  if (service) { service.stop(); service = null; }
  starting = null;
  bootstrapState.running = false;
}

export const referenceDomainNames = REFERENCE_DOMAINS.map((domain) => domain.name);
