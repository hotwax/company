import { translate } from "@common";

/** Shopify transfer sync presentation and normalization helpers. */

/**
 * `syncStage` → Ionic color. `syncStage` itself is SERVER-COMPUTED (see the domain) — this only
 * maps the value the backend already decided onto a badge color, never re-derives the stage.
 */
export const TRANSFER_SYNC_STAGE_COLORS: Record<string, string> = {
  QUEUED: "medium",
  STAGING_CREATE: "primary",
  CREATE_BLOCKED: "danger",
  SYNCED: "success",
  UPDATING: "primary",
  UPDATE_BLOCKED: "danger",
  CONFLICT: "danger",
  DELETION_ORPHAN: "danger",
  SUPPRESSED_ITEMS: "warning",
  CANCELLED: "medium",
  COMPLETED: "success",
};

export function stageColor(syncStage: unknown): string {
  return TRANSFER_SYNC_STAGE_COLORS[String(syncStage ?? "")] ?? "medium";
}

/** Human label for a `syncStage` id. The stage value itself is server-computed; this only formats it. */
const TRANSFER_SYNC_STAGE_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  STAGING_CREATE: "Staging create",
  CREATE_BLOCKED: "Create blocked",
  SYNCED: "Synced",
  UPDATING: "Updating",
  UPDATE_BLOCKED: "Update blocked",
  CONFLICT: "Conflict",
  DELETION_ORPHAN: "Deletion orphan",
  SUPPRESSED_ITEMS: "Suppressed items",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export function stageLabel(syncStage: unknown): string {
  const key = String(syncStage ?? "");
  const label = TRANSFER_SYNC_STAGE_LABELS[key];

  return label ? translate(label) : (key || translate("Not available"));
}

/** Normalize the exact line aliases returned by ShopifyShopInventoryTransferAndItem. */
export function normalizeTransferSyncLines(rows: any[]): any[] {
  return rows.map((line: any, index: number) => ({
    key: line.orderItemSeqId ? `${line.orderItemSeqId}-${index}` : `line-${index}`,
    orderItemSeqId: line.orderItemSeqId,
    product: line.productName || line.productId,
    lineQuantity: line.lineQuantity,
    shopifyInventoryTransferLineItemId: line.shopifyInventoryTransferLineItemId,
    removed: Number(line.lineQuantity ?? -1) === 0,
  }));
}

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
