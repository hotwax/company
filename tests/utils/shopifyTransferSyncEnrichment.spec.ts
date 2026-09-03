import { describe, expect, it, vi } from "vitest";

import {
  enrichTransferSyncRows,
  emptyTransferSyncEnrichment,
} from "@/utils/shopifyTransferSyncEnrichment";

describe("enrichTransferSyncRows", () => {
  it("deduplicates transfer detail reads and batches receipt receiver names", async () => {
    const fetchOrder = vi.fn(async (orderId: string) => ({ orderName: `Transfer ${orderId}`, items: [] }));
    const fetchCreationTime = vi.fn(async () => undefined);
    const fetchReceipts = vi.fn(async () => [{
      orderItemSeqId: "00001",
      datetimeReceived: "2026-08-31T13:42:00Z",
      receivedByUserLoginId: "JANE",
      quantityAccepted: 3,
      quantityRejected: 0,
    }]);
    const fetchReceiverNames = vi.fn(async (ids: string[]) => ({
      [ids[0]]: "Jane Doe",
    }));

    const enrichment = await enrichTransferSyncRows([
      { orderId: "M200103", segment: "receipt" },
      { orderId: "M200103", segment: "receipt" },
      { orderId: "M200104", segment: "shipment" },
    ], emptyTransferSyncEnrichment(), {
      fetchOrder,
      fetchCreationTime,
      fetchReceipts,
      fetchReceiverNames,
      fetchShopifyShipmentIds: vi.fn(async () => ({})),
    });

    expect(fetchOrder).toHaveBeenCalledTimes(2);
    expect(fetchOrder).toHaveBeenCalledWith("M200103");
    expect(fetchOrder).toHaveBeenCalledWith("M200104");
    expect(fetchReceipts).toHaveBeenCalledTimes(1);
    expect(fetchReceipts).toHaveBeenCalledWith("M200103");
    expect(fetchReceiverNames).toHaveBeenCalledWith(["JANE"]);
    expect(enrichment.receiverNamesById).toEqual({ JANE: "Jane Doe" });
  });

  it("enriches creation rows with their OMS event time for the sync-delay calculation", async () => {
    const fetchCreationTime = vi.fn(async () => "2026-08-31T10:00:00Z");

    const enrichment = await enrichTransferSyncRows([
      { orderId: "M200103", segment: "create" },
      { orderId: "M200103", segment: "create" },
    ], emptyTransferSyncEnrichment(), {
      fetchOrder: vi.fn(async () => ({ orderName: "Downtown replenishment" })),
      fetchCreationTime,
      fetchReceipts: vi.fn(async () => []),
      fetchReceiverNames: vi.fn(async () => ({})),
    } as never);

    expect(fetchCreationTime).toHaveBeenCalledTimes(1);
    expect(fetchCreationTime).toHaveBeenCalledWith("M200103");
    expect((enrichment as any).creationOccurredAtByOrderId).toEqual({ M200103: "2026-08-31T10:00:00Z" });
  });

  it("loads every Shopify shipment mapping for the visible OMS shipment rows", async () => {
    const fetchShopifyShipmentIds = vi.fn(async () => ({
      "OMS-SHIPMENT-100": ["SHOPIFY-SHIPMENT-201", "SHOPIFY-SHIPMENT-202"],
    }));

    const enrichment = await enrichTransferSyncRows([
      { shopId: "10000", orderId: "M200103", segment: "shipment", shipmentId: "OMS-SHIPMENT-100" },
      { shopId: "10000", orderId: "M200103", segment: "shipment", shipmentId: "OMS-SHIPMENT-100" },
    ], emptyTransferSyncEnrichment(), {
      fetchOrder: vi.fn(async () => ({ orderName: "Downtown replenishment" })),
      fetchCreationTime: vi.fn(async () => undefined),
      fetchReceipts: vi.fn(async () => []),
      fetchReceiverNames: vi.fn(async () => ({})),
      fetchShopifyShipmentIds,
    } as never);

    expect(fetchShopifyShipmentIds).toHaveBeenCalledWith("10000", ["OMS-SHIPMENT-100"]);
    expect((enrichment as any).shopifyShipmentIdsByOmsShipmentId).toEqual({
      "OMS-SHIPMENT-100": ["SHOPIFY-SHIPMENT-201", "SHOPIFY-SHIPMENT-202"],
    });
  });
});
