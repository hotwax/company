import { computed, onUnmounted, ref } from "vue";
import { liveQuery, type Subscription } from "dexie";
import { appCacheDb } from "@/utils/appCacheDb";
import { CACHE_DOMAIN_CATALOG, type CacheDomainEntry } from "@/utils/cacheDomainCatalog";
import { resyncDomain, resyncReferenceData } from "@/services/appCacheBootstrap";

/**
 * Live view of what the local cache actually holds — backs the Settings "Data Fetch Status" card.
 *
 * One `liveQuery` covers every table: Dexie tracks which tables the query read, so the whole card
 * re-renders on any cache write (including writes made by the worker in another thread). Row
 * counts and sync times therefore stay live while a sync is running.
 */
export interface CacheDomainStatus extends CacheDomainEntry {
  /** Rows currently cached for this domain. */
  count: number;
  /** When this domain last completed a snapshot (class B), if ever. */
  syncedAt: number | null;
  /** `success` = synced; `none` = never synced this login; `empty` = synced but the server had none. */
  status: "success" | "empty" | "none";
}

export function useCacheStatus() {
  const domains = ref<CacheDomainStatus[]>([]);
  const loaded = ref(false);
  const refreshing = ref<string | null>(null);

  const subscription: Subscription = liveQuery(async () => {
    const markers = await appCacheDb.syncMeta.toArray();
    const syncedAtByDomain = new Map<string, number>();
    for (const marker of markers) {
      const key = String(marker.key ?? "");
      if (key.startsWith("domain:")) {
        syncedAtByDomain.set(key.slice("domain:".length), Number(marker.syncedAt ?? 0));
      }
    }

    const rows: CacheDomainStatus[] = [];
    for (const entry of CACHE_DOMAIN_CATALOG) {
      const table = appCacheDb.table(entry.table);
      const count = await table.count();
      const syncedAt = syncedAtByDomain.get(entry.name) ?? null;
      rows.push({
        ...entry,
        count,
        syncedAt,
        // Class A has no snapshot marker, so presence of rows is the only signal.
        status: count > 0 ? "success" : (syncedAt || entry.syncClass === "A" ? "empty" : "none"),
      });
    }
    return rows;
  }).subscribe({
    next: (rows) => { domains.value = rows; loaded.value = true; },
    error: () => { loaded.value = true; },
  });

  onUnmounted(() => subscription.unsubscribe());

  const totalRows = computed(() => domains.value.reduce((sum, entry) => sum + entry.count, 0));

  /** Oldest completed snapshot across domains — "how stale could this cache be?". */
  const oldestSyncedAt = computed(() => {
    const times = domains.value.map((entry) => entry.syncedAt).filter((t): t is number => !!t);
    return times.length ? Math.min(...times) : null;
  });

  const lastSyncedAt = computed(() => {
    const times = domains.value.map((entry) => entry.syncedAt).filter((t): t is number => !!t);
    return times.length ? Math.max(...times) : null;
  });

  /** Force one domain to re-fetch from the server. */
  async function refreshDomain(name: string) {
    refreshing.value = name;
    try {
      await resyncDomain(name);
    } finally {
      refreshing.value = null;
    }
  }

  /** Force every reference domain to re-fetch — the escape hatch for out-of-app changes. */
  async function refreshAll() {
    refreshing.value = "*";
    try {
      await resyncReferenceData();
    } finally {
      refreshing.value = null;
    }
  }

  return { domains, loaded, refreshing, totalRows, oldestSyncedAt, lastSyncedAt, refreshDomain, refreshAll };
}
