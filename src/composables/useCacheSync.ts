import { onUnmounted, ref } from "vue";
import { type SyncService, createSyncService } from "@/services/pollingService";
import type { ActiveDomain } from "@/workers/syncRegistry";

/**
 * Main-thread entry point for cache syncing — the view-scoped lifecycle.
 *
 * A view calls `start(domains)` when it opens; the worker spawns, seeds the cache, and polls the
 * activated class-A domains every 10s. On view exit `stop()` terminates the worker, which kills
 * its timer — no zombie polling, no wasted requests or battery. **The IndexedDB cache is left
 * behind**, so returning to the view renders instantly from cache while the first fresh poll runs.
 *
 * This composable never fetches on the main thread: every request — the interval and any manual
 * `syncNow()` / `refetchOne()` — is routed down to the worker, which is the single fetch executor.
 * Read the data itself through a domain's `live()` observable, not from here.
 */
export interface CacheSyncStatus {
  domain?: string;
  type: string;
  written?: number;
  message?: string;
  at?: number;
}

export function useCacheSync() {
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
          error.value = "";
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
        }
        break;
      }
      case "sync-cycle-end":
        activeCycles = Math.max(0, activeCycles - 1);
        lastSyncAt.value = data.at ?? Date.now();
        // Keep a failure raised by this cycle visible. A clean cycle leaves no stale failure behind,
        // including errors emitted outside a prior cycle (for example, for an old shop scope).
        if(activeCycles === 0) {
          if(!activeCycleFailed) {error.value = "";}
          activeCycleFailed = false;
        }
        updateBusy();
        break;
      case "sync-error":
        error.value = `${data.domain ?? "sync"}: ${data.message ?? "failed"}`;
        if(activeCycles > 0) {activeCycleFailed = true;}
        break;
      case "auth-error":
        // `pollingService` also invokes the auth callback, but the status event is what lets this
        // lifecycle attribute the failure to the active cycle and avoid clearing it at cycle end.
        error.value = `auth: ${data.message ?? "failed"}`;
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
    error.value = "";
    if(service) {
      // Already running — just swap the domain set, no respawn.
      await service.setDomains(domains);

      return;
    }
    error.value = "";
    service = createSyncService({
      domains,
      baseTickMs: options.baseTickMs,
      onStatus,
      onAuthError: (message) => { error.value = `auth: ${message}`; },
    });
    try {
      await service.start();
      registeredDomains.value = await service.registeredDomains();
      ready.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** Manual refresh — routed to the worker, never fetched on the main thread. */
  async function syncNow() {
    if(!service) {return;}
    // If a scheduled cycle is already running, its error is current evidence. The worker queues a
    // forced cycle behind it; `sync-cycle-start` clears the failure when that newer attempt begins.
    if(activeCycles === 0) {error.value = "";}
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
    error.value = "";
    updateBusy();
  }

  onUnmounted(stop); // safety net; Ionic views should also call stop() on view-leave

  return {
    ready, busy, manualRefreshing, error, domainStatus, lastSyncAt, activeDomains, registeredDomains,
    start, syncNow, afterMutation, stop,
  };
}
