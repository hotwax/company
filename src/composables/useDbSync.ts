import { getCurrentInstance, onUnmounted, ref } from "vue";
import { serviceState, type ActiveDomain } from "@common/db";
import { refreshAfterMutation, syncService } from "@/services/appDbSync";

export interface DbSyncStatus {
  domain?: string;
  type: string;
  written?: number;
  message?: string;
  at?: number;
}

export type CacheSyncStatus = DbSyncStatus;

export function useDbSync() {
  const ready = ref(false);
  const busy = ref(false);
  const error = ref("");
  const domainStatus = ref<Record<string, { written: number; at: number }>>({});
  const lastSyncAt = ref<number | null>(null);
  const activeDomains = ref<ActiveDomain[]>([]);
  const registeredDomains = ref<string[]>([]);

  /** Activate domains for this view via setDomains on the shared worker. */
  async function start(domains: ActiveDomain[], _options: { baseTickMs?: number } = {}) {
    activeDomains.value = domains;
    error.value = "";
    const service = syncService();
    if (service) {
      try {
        await service.setDomains(domains);
        registeredDomains.value = await service.registeredDomains();
        ready.value = true;
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
      }
    } else {
      ready.value = true;
    }
  }

  /** Manual refresh — routed to the shared worker. */
  async function syncNow() {
    const service = syncService();
    if (service) await service.syncNow();
  }

  /** Refetch one record after mutation via the shared service. */
  async function afterMutation(domain: string, pk: Record<string, unknown>) {
    await refreshAfterMutation(domain, pk);
  }

  /** Deactivate view domains when leaving view. */
  function stop() {
    const service = syncService();
    if (service && activeDomains.value.length > 0) {
      service.setDomains([]).catch(() => {});
    }
    activeDomains.value = [];
    ready.value = false;
    busy.value = false;
  }

  if (getCurrentInstance()) onUnmounted(stop);

  return {
    ready,
    busy,
    error,
    domainStatus,
    lastSyncAt,
    activeDomains,
    registeredDomains,
    start,
    syncNow,
    afterMutation,
    stop,
  };
}

export const useCacheSync = useDbSync;
