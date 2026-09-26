import { ref } from "vue";
import { type SyncService, createSyncService } from "@/services/pollingService";
import type { ActiveDomain } from "@/workers/syncRegistry";

/**
 * The cache-sync lifecycle: spawn the sync worker, activate domains, track per-domain status, stop.
 *
 * Nothing here fetches on the main thread: every request — the interval and any manual `syncNow()` /
 * `refetchOne()` — is routed down to the worker, which is the single fetch executor. Read the data
 * itself through a domain's `live()` observable, not from here. `useCacheSync` binds one of these to a
 * view; the inventory sync area owns one for as long as the user is in its pages.
 */
export interface CacheSyncStatus {
  domain?: string;
  type: string;
  written?: number;
  message?: string;
  at?: number;
}

/**
 * The sync lifecycle without a component attached. `useCacheSync` binds it to a view; a service that
 * outlives any one view (the inventory sync area) owns one directly and stops it itself.
 */
export function createCacheSync() {
  const ready = ref(false);
  const busy = ref(false);
  /** Explicit user-triggered refresh state; background polling must never drive UI spinners. */
  const manualRefreshing = ref(false);
  const error = ref("");
  /** Per-domain last result, so a view can show "system message: 3 written, 2s ago". */
  const domainStatus = ref<Record<string, { written: number; at: number }>>({});
  const lastSyncAt = ref<number | null>(null);
  const activeDomains = ref<ActiveDomain[]>([]);
  /** Domains this worker build knows about — diagnostics that the registry loaded. */
  const registeredDomains = ref<string[]>([]);

  let service: SyncService | null = null;
  let activeCycles = 0;
  let pendingManualRefreshes = 0;
  let activeCycleFailed = false;

  /**
   * Errors are held per domain so one failing domain cannot mask another, and a domain that
   * recovers clears only its own failure. `error` is always a projection of this map, so every
   * clear below goes through `clearErrors`/`clearError` rather than assigning `error` directly.
   */
  const errorsByDomain = new Map<string, string>();

  function refreshError() {
    error.value = [...errorsByDomain.values()].pop() ?? "";
  }

  function recordError(domain: string, message: string) {
    // Reinsert so the most recently failing domain remains the visible error.
    errorsByDomain.delete(domain);
    errorsByDomain.set(domain, message);
    refreshError();
  }

  function clearError(domain: string) {
    errorsByDomain.delete(domain);
    refreshError();
  }

  function clearErrors() {
    errorsByDomain.clear();
    refreshError();
  }

  /**
   * Each domain's LATEST outcome: its message while its most recent run failed, gone once it next
   * succeeds. Unlike `error`, nothing clears this at a cycle boundary, so a display built on it does not
   * blink out at the start of every tick and back in when the same domain fails again — which, for a
   * banner inserted above the content, was a layout jump every ten seconds.
   */
  const failingDomains = ref<Record<string, string>>({});

  function setFailing(domain: string, message: string) {
    if(failingDomains.value[domain] !== message) {failingDomains.value = { ...failingDomains.value, [domain]: message };}
  }

  function clearFailing(domain: string) {
    if(!(domain in failingDomains.value)) {return;}
    const next = { ...failingDomains.value };
    delete next[domain];
    failingDomains.value = next;
  }

  function updateBusy() {
    manualRefreshing.value = pendingManualRefreshes > 0;
    busy.value = activeCycles > 0 || pendingManualRefreshes > 0;
  }

  function onStatus(data: Record<string, any>) {
    switch (data.type) {
      case "sync-cycle-start":
        // A failure describes the most recently completed/active attempt, not the lifetime of this
        // composable. Retire it only when genuinely newer worker work begins. The harness serializes
        // cycles, while the counter still keeps the UI correct if status delivery briefly overlaps.
        if(activeCycles === 0) {
          clearErrors();
          activeCycleFailed = false;
        }
        activeCycles += 1;
        updateBusy();
        break;
      case "sync-end": {
        lastSyncAt.value = data.at ?? Date.now();
        if(data.domain) {
          domainStatus.value = {
            ...domainStatus.value,
            [data.domain]: { written: data.written ?? 0, at: data.at ?? Date.now() },
          };
          clearError(String(data.domain));
          clearFailing(String(data.domain));
        }
        break;
      }
      case "sync-cycle-end":
        activeCycles = Math.max(0, activeCycles - 1);
        lastSyncAt.value = data.at ?? Date.now();
        // Keep a failure raised by this cycle visible. A clean cycle leaves no stale failure behind,
        // including errors emitted outside a prior cycle (for example, for an old shop scope).
        if(activeCycles === 0) {
          if(!activeCycleFailed) {clearErrors();}
          activeCycleFailed = false;
        }
        updateBusy();
        break;
      case "sync-error":
        recordError(
          String(data.domain ?? "sync"),
          `${data.domain ?? "sync"}: ${data.message ?? "failed"}`,
        );
        setFailing(String(data.domain ?? "sync"), String(data.message ?? "failed"));
        if(activeCycles > 0) {activeCycleFailed = true;}
        break;
      case "auth-error":
        // `pollingService` also invokes the auth callback, but the status event is what lets this
        // lifecycle attribute the failure to the active cycle and avoid clearing it at cycle end.
        recordError("auth", `auth: ${data.message ?? "failed"}`);
        setFailing("auth", String(data.message ?? "failed"));
        if(activeCycles > 0) {activeCycleFailed = true;}
        break;
      default:
        break;
    }
  }

  /** Activate domains and start polling. Safe to call again to change the domain set. */
  async function start(domains: ActiveDomain[], options: { baseTickMs?: number } = {}) {
    activeDomains.value = domains;
    // Domain changes can represent a different shop. Do not carry the previous scope's failure into
    // the new one while its first cycle is being scheduled.
    clearErrors();
    failingDomains.value = {};
    if(service) {
      // Already running — just swap the domain set, no respawn.
      await service.setDomains(domains);

      return;
    }
    clearErrors();
    service = createSyncService({
      domains,
      baseTickMs: options.baseTickMs,
      onStatus,
      onAuthError: (message) => { recordError("auth", `auth: ${message}`); },
    });
    try {
      await service.start();
      registeredDomains.value = await service.registeredDomains();
      ready.value = true;
      clearFailing("__start");
    } catch (err) {
      recordError("__start", err instanceof Error ? err.message : String(err));
      setFailing("__start", err instanceof Error ? err.message : String(err));
    }
  }

  /** Manual refresh — routed to the worker, never fetched on the main thread. */
  async function syncNow() {
    if(!service) {return;}
    // If a scheduled cycle is already running, its error is current evidence. The worker queues a
    // forced cycle behind it; `sync-cycle-start` clears the failure when that newer attempt begins.
    if(activeCycles === 0) {clearErrors();}
    pendingManualRefreshes += 1;
    updateBusy();
    try {
      await service.syncNow();
    } finally {
      pendingManualRefreshes = Math.max(0, pendingManualRefreshes - 1);
      updateBusy();
    }
  }

  /**
   * Call after a successful mutation. Moqui's auto-entity endpoints return only the PK (create)
   * or effectively nothing (update), so the record must be re-read to refresh the cache.
   */
  async function afterMutation(domain: string, pk: Record<string, unknown>) {
    if(service) {await service.refetchOne(domain, pk);}
  }

  function stop() {
    if(service) { service.stop(); service = null; } // terminates the worker + its timer
    activeCycles = 0;
    pendingManualRefreshes = 0;
    activeCycleFailed = false;
    ready.value = false;
    clearErrors();
    failingDomains.value = {};
    updateBusy();
  }

  return {
    ready, busy, manualRefreshing, error, failingDomains, domainStatus, lastSyncAt, activeDomains, registeredDomains,
    start, syncNow, afterMutation, stop,
  };
}

export type CacheSync = ReturnType<typeof createCacheSync>;
