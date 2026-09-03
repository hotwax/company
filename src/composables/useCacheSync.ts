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
  const error = ref("");
  /** Per-domain last result, so a view can show "system message: 3 written, 2s ago". */
  const domainStatus = ref<Record<string, { written: number; at: number }>>({});
  const lastSyncAt = ref<number | null>(null);
  const activeDomains = ref<ActiveDomain[]>([]);
  /** Domains this worker build knows about — diagnostics that the registry loaded. */
  const registeredDomains = ref<string[]>([]);

  let service: SyncService | null = null;
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

  function onStatus(data: Record<string, any>) {
    switch (data.type) {
      case "sync-start":
        busy.value = true;
        break;
      case "sync-end": {
        busy.value = false;
        lastSyncAt.value = data.at ?? Date.now();
        if(data.domain) {
          domainStatus.value = {
            ...domainStatus.value,
            [data.domain]: { written: data.written ?? 0, at: data.at ?? Date.now() },
          };
          clearError(String(data.domain));
        }
        break;
      }
      case "sync-error":
        busy.value = false;
        recordError(
          String(data.domain ?? "sync"),
          `${data.domain ?? "sync"}: ${data.message ?? "failed"}`,
        );
        break;
      default:
        break;
    }
  }

  /** Activate domains and start polling. Safe to call again to change the domain set. */
  async function start(domains: ActiveDomain[], options: { baseTickMs?: number } = {}) {
    activeDomains.value = domains;
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
    } catch (err) {
      recordError("__start", err instanceof Error ? err.message : String(err));
    }
  }

  /** Manual refresh — routed to the worker, never fetched on the main thread. */
  async function syncNow() {
    if(service) {
      await service.syncNow();
    }
  }

  /**
   * Call after a successful mutation. Moqui's auto-entity endpoints return only the PK (create)
   * or effectively nothing (update), so the record must be re-read to refresh the cache.
   */
  async function afterMutation(domain: string, pk: Record<string, unknown>) {
    if(service) {
      await service.refetchOne(domain, pk);
    }
  }

  function stop() {
    if(service) {
      service.stop(); // terminates the worker + its timer
      service = null;
    }
    ready.value = false;
    busy.value = false;
  }

  onUnmounted(stop); // safety net; Ionic views should also call stop() on view-leave

  return {
    ready, busy, error, domainStatus, lastSyncAt, activeDomains, registeredDomains,
    start, syncNow, afterMutation, stop,
  };
}
