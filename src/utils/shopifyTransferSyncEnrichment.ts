import type {
  TransferSyncEnrichment,
  TransferSyncOrder,
  TransferSyncReceipt,
} from "./shopifyTransferSyncPresentation";

export interface TransferSyncEnrichmentClient {
  fetchOrder(orderId: string): Promise<TransferSyncOrder | undefined>;
  fetchCreationTime(orderId: string): Promise<string | undefined>;
  fetchReceipts(orderId: string): Promise<TransferSyncReceipt[]>;
  fetchReceiverNames(userLoginIds: string[]): Promise<Record<string, string>>;
  fetchShopifyShipmentIds(shopId: string, shipmentIds: string[]): Promise<Record<string, string[]>>;
}

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

async function mapWithConcurrency<T>(values: T[], limit: number, work: (value: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const worker = async () => {
    while(nextIndex < values.length) {
      const value = values[nextIndex++];
      await work(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
}

export function emptyTransferSyncEnrichment(): TransferSyncEnrichment {
  return {
    ordersById: {},
    creationOccurredAtByOrderId: {},
    facilityNamesById: {},
    receiptsByOrderId: {},
    receiverNamesById: {},
    shopifyShipmentIdsByOmsShipmentId: {},
  };
}

/**
 * Reuses transfer-order and receipt reads to enrich the sync ledger without widening its list API.
 * Fetches are per distinct transfer, while user names are one request for all new receiver ids.
 */
export async function enrichTransferSyncRows(
  rows: Record<string, unknown>[],
  current: TransferSyncEnrichment,
  client: TransferSyncEnrichmentClient,
): Promise<TransferSyncEnrichment> {
  const next: TransferSyncEnrichment = {
    ...current,
    ordersById: { ...current.ordersById },
    creationOccurredAtByOrderId: { ...current.creationOccurredAtByOrderId },
    receiptsByOrderId: { ...current.receiptsByOrderId },
    receiverNamesById: { ...current.receiverNamesById },
    shopifyShipmentIdsByOmsShipmentId: { ...current.shopifyShipmentIdsByOmsShipmentId },
  };
  const orderIds = [...new Set(rows.map((row) => String(row.orderId ?? "")).filter(Boolean))];
  const missingOrderIds = orderIds.filter((orderId) => !hasOwn(next.ordersById, orderId));

  await mapWithConcurrency(missingOrderIds, 4, async (orderId) => {
    try {
      next.ordersById[orderId] = await client.fetchOrder(orderId);
    } catch {
      // The base ledger row is still usable when an enrichment read is unavailable.
    }
  });

  // Creation rows have their Shopify completion time in the ledger but not their OMS event time.
  // Reuse the existing order document only for the creation segment to calculate its real delay.
  const creationOrderIds = [...new Set(rows
    .filter((row) => String(row.segment ?? "") === "create")
    .map((row) => String(row.orderId ?? "")).filter(Boolean))];
  const missingCreationOrderIds = creationOrderIds.filter((orderId) => !hasOwn(next.creationOccurredAtByOrderId, orderId));

  await mapWithConcurrency(missingCreationOrderIds, 4, async (orderId) => {
    try {
      next.creationOccurredAtByOrderId[orderId] = await client.fetchCreationTime(orderId);
    } catch {
      // A creation row remains usable when the order document cannot be read.
      next.creationOccurredAtByOrderId[orderId] = undefined;
    }
  });

  const receiptOrderIds = [...new Set(rows
    .filter((row) => String(row.segment ?? "") === "receipt")
    .map((row) => String(row.orderId ?? "")).filter(Boolean))];
  const missingReceiptOrderIds = receiptOrderIds.filter((orderId) => !hasOwn(next.receiptsByOrderId, orderId));

  await mapWithConcurrency(missingReceiptOrderIds, 4, async (orderId) => {
    try {
      next.receiptsByOrderId[orderId] = await client.fetchReceipts(orderId);
    } catch {
      // A receipt row falls back to ledger quantities and an unnamed receiver until the next read.
    }
  });

  const receiverIds = [...new Set(Object.values(next.receiptsByOrderId)
    .flatMap((receipts) => receipts ?? [])
    .map((receipt) => String(receipt.receivedByUserLoginId ?? "")).filter(Boolean))];
  const missingReceiverIds = receiverIds.filter((userLoginId) => !hasOwn(next.receiverNamesById, userLoginId));
  if(missingReceiverIds.length) {
    try {
      Object.assign(next.receiverNamesById, await client.fetchReceiverNames(missingReceiverIds));
    } catch {
      // Receiver ids are never promoted as display names; the presenter says receiver unavailable.
    }
  }

  const shipmentIdsByShopId = new Map<string, Set<string>>();
  for(const row of rows) {
    if(String(row.segment ?? "") !== "shipment") {continue;}
    const shopId = String(row.shopId ?? "");
    const shipmentId = String(row.shipmentId ?? "");
    if(!shopId || !shipmentId || hasOwn(next.shopifyShipmentIdsByOmsShipmentId, shipmentId)) {continue;}
    const shipmentIds = shipmentIdsByShopId.get(shopId) ?? new Set<string>();
    shipmentIds.add(shipmentId);
    shipmentIdsByShopId.set(shopId, shipmentIds);
  }

  await mapWithConcurrency([...shipmentIdsByShopId.entries()], 4, async ([shopId, shipmentIds]) => {
    try {
      const mappings = await client.fetchShopifyShipmentIds(shopId, [...shipmentIds]);
      for(const shipmentId of shipmentIds) {
        next.shopifyShipmentIdsByOmsShipmentId[shipmentId] = mappings[shipmentId] ?? [];
      }
    } catch {
      // The row still identifies its OMS shipment when the remote mapping is temporarily unavailable.
    }
  });

  return next;
}
