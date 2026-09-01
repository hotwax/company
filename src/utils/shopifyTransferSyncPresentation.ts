export type TransferSyncDirection = "pending" | "synced";

export interface TransferSyncOrderItem {
  orderItemSeqId?: string;
  quantity?: number;
  itemDescription?: string;
}

export interface TransferSyncOrder {
  orderName?: string;
  facilityId?: string;
  orderFacilityId?: string;
  items?: TransferSyncOrderItem[];
}

export interface TransferSyncReceipt {
  orderItemSeqId?: string;
  datetimeReceived?: string;
  receivedByUserLoginId?: string;
  quantityAccepted?: number;
  quantityRejected?: number;
}

export interface TransferSyncEnrichment {
  ordersById: Record<string, TransferSyncOrder | undefined>;
  creationOccurredAtByOrderId: Record<string, string | undefined>;
  facilityNamesById: Record<string, string | undefined>;
  receiptsByOrderId: Record<string, TransferSyncReceipt[] | undefined>;
  receiverNamesById: Record<string, string | undefined>;
  shopifyShipmentIdsByOmsShipmentId: Record<string, string[] | undefined>;
}

export interface TransferSyncPresentationRow {
  key: string;
  orderId: string;
  shopifyTransferId?: string;
  title: string;
  detail: string;
  status: "Outstanding" | "Synced";
  omsShipmentId?: string;
  shopifyShipmentIds?: string[];
  shipmentEventStatus?: string;
  occurredAt?: string;
  syncedAt?: string;
  syncDurationMs?: number;
}

export function formatSyncDuration(durationMs: number | undefined): string {
  if(durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {return "";}
  const seconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  if(hours) {return `${hours}h ${minutes}m`;}
  if(minutes) {return `${minutes}m ${remainingSeconds}s`;}
  return `${remainingSeconds}s`;
}

function timestampMillis(value: string): number | undefined {
  if(!value) {return undefined;}
  const numeric = Number(value);
  if(Number.isFinite(numeric) && numeric > 0) {return numeric;}
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function syncTiming(occurredAt: string, syncedAt: string): Pick<TransferSyncPresentationRow, "occurredAt" | "syncedAt" | "syncDurationMs"> {
  const occurredMillis = timestampMillis(occurredAt);
  const syncedMillis = timestampMillis(syncedAt);
  return {
    ...(occurredAt ? { occurredAt } : {}),
    ...(syncedAt ? { syncedAt } : {}),
    ...(occurredMillis !== undefined && syncedMillis !== undefined && syncedMillis >= occurredMillis
      ? { syncDurationMs: syncedMillis - occurredMillis }
      : {}),
  };
}

function transferName(orderId: string, order: TransferSyncOrder | undefined): string {
  return order?.orderName || `Transfer ${orderId}`;
}

function transferRoute(order: TransferSyncOrder | undefined, facilityNamesById: TransferSyncEnrichment["facilityNamesById"]): string {
  const origin = facilityNamesById[String(order?.facilityId ?? "")];
  const destination = facilityNamesById[String(order?.orderFacilityId ?? "")];
  return origin && destination ? `From ${origin} to ${destination}` : "";
}

function joinDetail(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

function shopifyTransferId(row: Record<string, unknown>): string | undefined {
  const transferId = String(row.shopifyInventoryTransferId ?? "");
  return transferId || undefined;
}

function creationSummary(
  orderId: string,
  rawRows: Record<string, unknown>[],
  direction: TransferSyncDirection,
  enrichment: TransferSyncEnrichment,
): TransferSyncPresentationRow {
  const order = enrichment.ordersById[orderId];
  const items = order?.items?.length
    ? order.items
    : rawRows.map((row) => ({
      orderItemSeqId: String(row.orderItemSeqId ?? ""),
      quantity: Number(row.quantity ?? 0),
    }));
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const latestSyncedAt = rawRows
    .map((row) => String(row.syncedDate ?? ""))
    .filter(Boolean)
    .sort((left, right) => (timestampMillis(right) ?? 0) - (timestampMillis(left) ?? 0))[0] ?? "";
  return {
    key: `create:${orderId}`,
    orderId,
    shopifyTransferId: rawRows.map(shopifyTransferId).find(Boolean),
    title: transferName(orderId, order),
    detail: joinDetail(
      transferRoute(order, enrichment.facilityNamesById),
      `${items.length} item lines · ${totalQuantity} units`,
    ),
    status: direction === "pending" ? "Outstanding" : "Synced",
    ...syncTiming(enrichment.creationOccurredAtByOrderId[orderId] ?? "", latestSyncedAt),
  };
}

function receiptSummary(
  orderId: string,
  shipmentId: string,
  receivedAt: string,
  receiverId: string,
  receipts: TransferSyncReceipt[],
  occurredAt: string,
  syncedAt: string,
  transferId: string | undefined,
  direction: TransferSyncDirection,
  enrichment: TransferSyncEnrichment,
): TransferSyncPresentationRow {
  const accepted = receipts.reduce((sum, receipt) => sum + Number(receipt.quantityAccepted ?? 0), 0);
  const rejected = receipts.reduce((sum, receipt) => sum + Number(receipt.quantityRejected ?? 0), 0);
  const lineCount = new Set(receipts.map((receipt) => String(receipt.orderItemSeqId ?? "")).filter(Boolean)).size;
  const receiverName = enrichment.receiverNamesById[receiverId] || receiverId || "Unknown receiver";
  return {
    key: `receipt:${orderId}:${shipmentId}:${receivedAt}:${receiverId}`,
    orderId,
    shopifyTransferId: transferId,
    title: transferName(orderId, enrichment.ordersById[orderId]),
    detail: joinDetail(
      transferRoute(enrichment.ordersById[orderId], enrichment.facilityNamesById),
      `Received by ${receiverName}`,
      `${accepted} accepted · ${rejected} rejected · ${lineCount} lines`,
    ),
    status: direction === "pending" ? "Outstanding" : "Synced",
    ...syncTiming(occurredAt, syncedAt),
  };
}

function rowTiming(row: Record<string, unknown>): Pick<TransferSyncPresentationRow, "occurredAt" | "syncedAt" | "syncDurationMs"> {
  return syncTiming(
    String(row.happenedAt ?? row.occurredAt ?? row.statusDate ?? row.orderStatusDatetime ?? row.changeDatetime ?? ""),
    String(row.syncedDate ?? ""),
  );
}

function actionSummary(
  row: Record<string, unknown>,
  direction: TransferSyncDirection,
  enrichment: TransferSyncEnrichment,
): TransferSyncPresentationRow | undefined {
  const segment = String(row.segment ?? "");
  const orderId = String(row.orderId ?? "");
  if(!orderId) {return undefined;}
  const order = enrichment.ordersById[orderId];
  const status = direction === "pending" ? "Outstanding" : "Synced";
  const transferId = shopifyTransferId(row);

  if(segment === "shipment") {
    const shipmentId = String(row.shipmentStatusId ?? row.shipmentId ?? "");
    const omsShipmentId = String(row.shipmentId ?? "");
    return {
      key: `shipment:${orderId}:${shipmentId}`,
      orderId,
      shopifyTransferId: transferId,
      title: transferName(orderId, order),
      detail: transferRoute(order, enrichment.facilityNamesById),
      status,
      ...(omsShipmentId ? { omsShipmentId } : {}),
      shipmentEventStatus: "Shipped",
      shopifyShipmentIds: enrichment.shopifyShipmentIdsByOmsShipmentId[omsShipmentId] ?? [],
      ...rowTiming(row),
    };
  }
  if(segment === "cancellation") {
    return {
      key: `cancellation:${orderId}:${String(row.orderStatusId ?? "")}`,
      orderId,
      shopifyTransferId: transferId,
      title: transferName(orderId, order),
      detail: transferRoute(order, enrichment.facilityNamesById),
      status,
      ...rowTiming(row),
    };
  }
  if(segment === "itemChange") {
    const item = order?.items?.find((candidate) => String(candidate.orderItemSeqId ?? "") === String(row.orderItemSeqId ?? ""));
    const cancelled = Number(row.changedCancelQuantity ?? row.cancelQuantity ?? 0);
    return {
      key: `item-change:${orderId}:${String(row.orderItemChangeId ?? row.orderItemSeqId ?? "")}`,
      orderId,
      shopifyTransferId: transferId,
      title: transferName(orderId, order),
      detail: joinDetail(
        transferRoute(order, enrichment.facilityNamesById),
        item?.itemDescription,
        cancelled > 0 ? `${cancelled} units cancelled` : "Quantity updated",
      ),
      status,
      ...rowTiming(row),
    };
  }
  return undefined;
}

/**
 * Converts the raw, artifact-level transfer-sync lists into concise operator rows. The create
 * endpoint deliberately returns one record per line, but creation is one transfer action.
 */
export function buildTransferSyncPresentation(
  rows: Record<string, unknown>[],
  direction: TransferSyncDirection,
  enrichment: TransferSyncEnrichment,
): TransferSyncPresentationRow[] {
  const orderIds = [...new Set(rows
    .filter((row) => String(row.segment ?? "") === "create")
    .map((row) => String(row.orderId ?? "")).filter(Boolean))];
  const creationRows = orderIds.map((orderId) => creationSummary(
    orderId,
    rows.filter((row) => String(row.segment ?? "") === "create" && String(row.orderId ?? "") === orderId),
    direction,
    enrichment,
  ));
  const receiptGroups = new Map<string, {
    orderId: string;
    shipmentId: string;
    receivedAt: string;
    receiverId: string;
    receipts: TransferSyncReceipt[];
    occurredAt: string;
    syncedAt: string;
    shopifyTransferId?: string;
  }>();

  for(const row of rows) {
    if(String(row.segment ?? "") !== "receipt") {continue;}
    const orderId = String(row.orderId ?? "");
    const receivedAt = String(row.datetimeReceived ?? "");
    const shipmentId = String(row.shipmentId ?? "");
    const orderItemSeqId = String(row.orderItemSeqId ?? "");
    if(!orderId || !receivedAt) {continue;}
    const receipt = (enrichment.receiptsByOrderId[orderId] ?? []).find((candidate) =>
      String(candidate.orderItemSeqId ?? "") === orderItemSeqId
      && String(candidate.datetimeReceived ?? "") === receivedAt,
    );
    const receiverId = String(receipt?.receivedByUserLoginId ?? "");
    const key = `${orderId}:${shipmentId}:${receivedAt}:${receiverId}`;
    const group = receiptGroups.get(key) ?? {
      orderId,
      shipmentId,
      receivedAt,
      receiverId,
      receipts: [],
      occurredAt: String(row.happenedAt ?? row.occurredAt ?? receivedAt),
      syncedAt: String(row.syncedDate ?? ""),
      shopifyTransferId: shopifyTransferId(row),
    };
    group.receipts.push(receipt ?? {
      orderItemSeqId,
      datetimeReceived: receivedAt,
      quantityAccepted: Number(row.quantityAccepted ?? 0),
      quantityRejected: Number(row.quantityRejected ?? 0),
    });
    receiptGroups.set(key, group);
  }

  const receiptRows = [...receiptGroups.values()].map((group) => receiptSummary(
    group.orderId,
    group.shipmentId,
    group.receivedAt,
    group.receiverId,
    group.receipts,
    group.occurredAt,
    group.syncedAt,
    group.shopifyTransferId,
    direction,
    enrichment,
  ));
  const actionRows = rows.map((row) => actionSummary(row, direction, enrichment)).filter(Boolean) as TransferSyncPresentationRow[];
  return [...creationRows, ...receiptRows, ...actionRows];
}
