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

/**
 * The Shopify admin link for one inventory transfer.
 *
 * `InventoryTransfer` exposes no admin URL of its own, so the link is built from the shop's domain
 * and the transfer id, matching the `/admin/<resource>/<id>` shape the product sync screen links
 * with. A `gid://shopify/InventoryTransfer/123` is reduced to its numeric tail, because the admin
 * path takes the legacy id and a gid would otherwise render a dead link.
 *
 * Returns "" when either half is missing — the caller renders no link rather than a broken one.
 */
export function shopifyTransferAdminUrl(myshopifyDomain: unknown, transferId: unknown): string {
  const domain = String(myshopifyDomain ?? "").trim();
  const rawId = String(transferId ?? "").trim();
  if(!domain || !rawId) { return ""; }
  const id = rawId.startsWith("gid://") ? rawId.split("/").pop() ?? "" : rawId;
  if(!id) { return ""; }

  return `https://${domain}/admin/transfers/${encodeURIComponent(id)}`;
}
