import { describe, expect, it } from "vitest";

import {
  buildTransferSyncPresentation,
  formatSyncDuration,
  type TransferSyncEnrichment,
} from "@/utils/shopifyTransferSyncPresentation";

describe("buildTransferSyncPresentation", () => {
  it("collapses a multi-line transfer creation into one human-readable transfer row", () => {
    const enrichment: TransferSyncEnrichment = {
      ordersById: {
        M200103: {
          orderName: "Downtown replenishment",
          facilityId: "DOWNTOWN",
          orderFacilityId: "SOHO",
          items: Array.from({ length: 248 }, (_, index) => ({
            orderItemSeqId: String(index + 1).padStart(5, "0"),
            quantity: index === 0 ? 365 : 1,
          })),
        },
      },
      creationOccurredAtByOrderId: {},
      facilityNamesById: {
        DOWNTOWN: "Downtown",
        SOHO: "SoHo",
      },
      receiptsByOrderId: {},
      receiverNamesById: {},
      shopifyShipmentIdsByOmsShipmentId: {},
    };

    const rows = buildTransferSyncPresentation([
      { segment: "create", orderId: "M200103", orderItemSeqId: "00001" },
      { segment: "create", orderId: "M200103", orderItemSeqId: "00002" },
      { segment: "create", orderId: "M200103", orderItemSeqId: "00003" },
    ], "pending", enrichment);

    expect(rows).toEqual([
      expect.objectContaining({
        key: "create:M200103",
        orderId: "M200103",
        title: "Downtown replenishment",
        detail: "From Downtown to SoHo · 248 item lines · 612 units",
        status: "Outstanding",
      }),
    ]);
    expect(rows[0]).not.toHaveProperty("action");
  });

  it("groups receipt lines by receiving action and names the receiver", () => {
    const enrichment: TransferSyncEnrichment = {
      ordersById: {
        M200103: {
          orderName: "Downtown replenishment",
          facilityId: "DOWNTOWN",
          orderFacilityId: "SOHO",
        },
      },
      creationOccurredAtByOrderId: {},
      facilityNamesById: { DOWNTOWN: "Downtown", SOHO: "SoHo" },
      receiptsByOrderId: {
        M200103: [
          {
            orderItemSeqId: "00001",
            datetimeReceived: "2026-08-31T13:42:00Z",
            receivedByUserLoginId: "JANE",
            quantityAccepted: 80,
            quantityRejected: 2,
          },
          {
            orderItemSeqId: "00002",
            datetimeReceived: "2026-08-31T13:42:00Z",
            receivedByUserLoginId: "JANE",
            quantityAccepted: 4,
            quantityRejected: 0,
          },
        ],
      },
      receiverNamesById: { JANE: "Jane Doe" },
      shopifyShipmentIdsByOmsShipmentId: {},
    };

    const rows = buildTransferSyncPresentation([
      {
        segment: "receipt",
        orderId: "M200103",
        shipmentId: "S100",
        orderItemSeqId: "00001",
        datetimeReceived: "2026-08-31T13:42:00Z",
      },
      {
        segment: "receipt",
        orderId: "M200103",
        shipmentId: "S100",
        orderItemSeqId: "00002",
        datetimeReceived: "2026-08-31T13:42:00Z",
      },
    ], "pending", enrichment);

    expect(rows).toEqual([
      expect.objectContaining({
        key: "receipt:M200103:S100:2026-08-31T13:42:00Z:JANE",
        title: "Downtown replenishment",
        detail: "From Downtown to SoHo · Received by Jane Doe · 84 accepted · 2 rejected · 2 lines",
        status: "Outstanding",
      }),
    ]);
  });

  it("keeps the OMS event time and verified Shopify completion time on synced rows", () => {
    const rows = buildTransferSyncPresentation([
      {
        segment: "receipt",
        orderId: "M200103",
        shipmentId: "S100",
        orderItemSeqId: "00001",
        datetimeReceived: "2026-08-31T13:42:00Z",
        happenedAt: "2026-08-31T13:42:00Z",
        syncedDate: "2026-08-31T13:44:13Z",
      },
    ], "synced", {
      ordersById: {},
      creationOccurredAtByOrderId: {},
      facilityNamesById: {},
      receiptsByOrderId: {
        M200103: [{
          orderItemSeqId: "00001",
          datetimeReceived: "2026-08-31T13:42:00Z",
          receivedByUserLoginId: "JANE",
          quantityAccepted: 84,
          quantityRejected: 0,
        }],
      },
      receiverNamesById: { JANE: "Jane Doe" },
      shopifyShipmentIdsByOmsShipmentId: {},
    });

    expect(rows[0]).toMatchObject({
      occurredAt: "2026-08-31T13:42:00Z",
      syncedAt: "2026-08-31T13:44:13Z",
      syncDurationMs: 133_000,
    });
  });

  it("keeps the transfer name primary and uses an English route instead of an event label", () => {
    const rows = buildTransferSyncPresentation([
      { segment: "shipment", orderId: "M200103", shipmentId: "S100" },
      { segment: "cancellation", orderId: "M200103", orderStatusId: "OS100" },
      {
        segment: "itemChange",
        orderId: "M200103",
        orderItemSeqId: "00001",
        changedCancelQuantity: 2,
      },
    ], "pending", {
      ordersById: {
        M200103: {
          orderName: "Downtown replenishment",
          facilityId: "DOWNTOWN",
          orderFacilityId: "SOHO",
          items: [{ orderItemSeqId: "00001", itemDescription: "Blue crewneck" }],
        },
      },
      creationOccurredAtByOrderId: {},
      facilityNamesById: { DOWNTOWN: "Downtown", SOHO: "SoHo" },
      receiptsByOrderId: {},
      receiverNamesById: {},
      shopifyShipmentIdsByOmsShipmentId: {},
    });

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Downtown replenishment", detail: "From Downtown to SoHo" }),
      expect.objectContaining({ title: "Downtown replenishment", detail: "From Downtown to SoHo" }),
      expect.objectContaining({ title: "Downtown replenishment", detail: "From Downtown to SoHo · Blue crewneck · 2 units cancelled" }),
    ]));
    expect(rows.every((row) => !("action" in row))).toBe(true);
  });

  it("uses the ledger rows as a non-zero creation fallback while transfer detail loads", () => {
    const rows = buildTransferSyncPresentation([
      { segment: "create", orderId: "M200103", orderItemSeqId: "00001", quantity: 3 },
      { segment: "create", orderId: "M200103", orderItemSeqId: "00002", quantity: 4 },
    ], "pending", emptyEnrichment());

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Transfer M200103",
        detail: "2 item lines · 7 units",
      }),
    ]);
  });

  it("calculates a creation row's OMS-to-Shopify delay from its creation time", () => {
    const rows = buildTransferSyncPresentation([
      { segment: "create", orderId: "M200103", orderItemSeqId: "00001", syncedDate: "2026-08-31T10:04:00Z" },
      { segment: "create", orderId: "M200103", orderItemSeqId: "00002", syncedDate: "2026-08-31T10:04:13Z" },
    ], "synced", {
      ...emptyEnrichment(),
      creationOccurredAtByOrderId: { M200103: "2026-08-31T10:00:00Z" },
    });

    expect(rows[0]).toMatchObject({
      occurredAt: "2026-08-31T10:00:00Z",
      syncedAt: "2026-08-31T10:04:13Z",
      syncDurationMs: 253_000,
    });
  });

  it("keeps the Shopify transfer ID on every expanded row that has one", () => {
    const rows = buildTransferSyncPresentation([
      {
        segment: "create",
        orderId: "M200103",
        orderItemSeqId: "00001",
        shopifyInventoryTransferId: "88442211",
      },
      {
        segment: "receipt",
        orderId: "M200104",
        shipmentId: "S100",
        orderItemSeqId: "00001",
        datetimeReceived: "2026-08-31T13:42:00Z",
        shopifyInventoryTransferId: "88442212",
      },
      {
        segment: "shipment",
        orderId: "M200105",
        shipmentId: "S101",
        shopifyInventoryTransferId: "88442213",
      },
    ], "synced", {
      ...emptyEnrichment(),
      receiptsByOrderId: {
        M200104: [{
          orderItemSeqId: "00001",
          datetimeReceived: "2026-08-31T13:42:00Z",
        }],
      },
    });

    expect(rows.map((row) => row.shopifyTransferId)).toEqual([
      "88442211",
      "88442212",
      "88442213",
    ]);
  });

  it("keeps the shipment event and both OMS and Shopify shipment identifiers together", () => {
    const rows = buildTransferSyncPresentation([{
      segment: "shipment",
      orderId: "M200103",
      shipmentId: "OMS-SHIPMENT-100",
    }], "synced", {
      ...emptyEnrichment(),
      shopifyShipmentIdsByOmsShipmentId: {
        "OMS-SHIPMENT-100": ["SHOPIFY-SHIPMENT-201", "SHOPIFY-SHIPMENT-202"],
      },
    } as TransferSyncEnrichment);

    expect(rows).toEqual([expect.objectContaining({
      omsShipmentId: "OMS-SHIPMENT-100",
      shipmentEventStatus: "Shipped",
      shopifyShipmentIds: ["SHOPIFY-SHIPMENT-201", "SHOPIFY-SHIPMENT-202"],
    })]);
  });
});

describe("formatSyncDuration", () => {
  it("renders a concise OMS-to-Shopify elapsed time", () => {
    expect(formatSyncDuration(133_000)).toBe("2m 13s");
  });
});

function emptyEnrichment(): TransferSyncEnrichment {
  return {
    ordersById: {},
    creationOccurredAtByOrderId: {},
    facilityNamesById: {},
    receiptsByOrderId: {},
    receiverNamesById: {},
    shopifyShipmentIdsByOmsShipmentId: {},
  };
}
