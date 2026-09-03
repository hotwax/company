/** Shopify transfer sync helpers.
 *
 * The stage colour/label maps that used to live here are gone with the sync-stage badge: the list
 * page is now segments of outstanding and synced work, which carry no derived status to present.
 */

/**
 * A warm cache is immediately usable, but a cold empty cache is not authoritative until this
 * view-scoped domain has completed its first live pass.
 */
export function isTransferSyncMonitoringLoaded(options: {
  cacheHydrated: boolean;
  cachedRowCount: number;
  liveSyncAt: number;
  viewSyncBaselineAt: number;
}): boolean {
  const liveSyncCompleted = options.liveSyncAt > options.viewSyncBaselineAt;

  return options.cacheHydrated && (options.cachedRowCount > 0 || liveSyncCompleted);
}
