/** Shopify transfer sync helpers.
 *
 * The stage colour/label maps that used to live here are gone with the sync-stage badge: the list
 * page is now segments of outstanding and synced work, which carry no derived status to present.
 */

import { buildAppUrl } from "@common";

import { isShopifyObjectId, shopifyAdminHostname } from "@/utils/shopifyAdminUrl";

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
 * Both halves are validated - see shopifyAdminHostname for why the host cannot be trusted as
 * stored. Anything that fails returns "", so the caller renders no link rather than a bad one.
 */
export function shopifyTransferAdminUrl(myshopifyDomain: unknown, transferId: unknown): string {
  const hostname = shopifyAdminHostname(myshopifyDomain);
  const rawId = String(transferId ?? "").trim();
  if(!hostname || !rawId) { return ""; }
  const id = rawId.startsWith("gid://") ? rawId.split("/").pop() ?? "" : rawId;
  if(!isShopifyObjectId(id)) { return ""; }

  return `https://${hostname}/admin/transfers/${id}`;
}

/**
 * The Transfers app link for one OMS transfer order.
 *
 * Goes through the Fast Travel registry rather than a hardcoded host, so a deployment that sets
 * VITE_TRANSFERS_URL is honoured and one with no Transfers app configured renders no link at all
 * (buildAppUrl returns null there).
 *
 * The route is `/order-detail/:orderId`, confirmed against hotwax/transfers `main`. The
 * inventory-history deep link in order-routing uses `/transfer-order-details/` — that path is
 * stale and does not exist in the app; do not copy it.
 */
export function transfersAppOrderUrl(orderId: unknown): string {
  const id = String(orderId ?? "").trim();
  if(!id) { return ""; }

  return buildAppUrl("transfers", `/order-detail/${encodeURIComponent(id)}`) ?? "";
}
