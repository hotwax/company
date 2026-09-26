import { onUnmounted } from "vue";
import { type CacheSync, createCacheSync } from "@/services/cacheSync";

export type { CacheSync, CacheSyncStatus } from "@/services/cacheSync";

/**
 * Main-thread entry point for cache syncing — the view-scoped lifecycle over `createCacheSync`.
 *
 * A view calls `start(domains)` when it opens; the worker spawns, seeds the cache, and polls the
 * activated class-A domains. On view exit `stop()` terminates the worker, which kills its timer — no
 * zombie polling. **The IndexedDB cache is left behind**, so returning to the view renders instantly
 * from cache while the first fresh poll runs. A lifecycle that outlives one view (the inventory sync
 * area) owns a `createCacheSync()` directly instead.
 */
export function useCacheSync(): CacheSync {
  const sync = createCacheSync();
  onUnmounted(sync.stop); // safety net; Ionic views should also call stop() on view-leave

  return sync;
}
