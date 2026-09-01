import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api,
  commonUtil: { hasError: () => false },
}));

import { createTransferSyncEnrichmentClient } from "@/composables/useShopifyTransferSyncEnrichment";

describe("createTransferSyncEnrichmentClient", () => {
  beforeEach(() => {
    api.mockReset();
  });

  it("adapts the existing transfer, receipt, and user APIs without widening the sync list API", async () => {
    api
      .mockResolvedValueOnce({ data: { order: { orderName: "Downtown replenishment", items: [] } } })
      .mockResolvedValueOnce({ data: [{ orderItemSeqId: "00001", receivedByUserLoginId: "JANE" }] })
      .mockResolvedValueOnce({ data: [{ userLoginId: "JANE", firstName: "Jane", lastName: "Doe" }] });
    const client = createTransferSyncEnrichmentClient();

    await expect(client.fetchOrder("M200103")).resolves.toEqual({ orderName: "Downtown replenishment", items: [] });
    await expect(client.fetchReceipts("M200103")).resolves.toEqual([{ orderItemSeqId: "00001", receivedByUserLoginId: "JANE" }]);
    await expect(client.fetchReceiverNames(["JANE"])).resolves.toEqual({ JANE: "Jane Doe" });

    expect(api).toHaveBeenNthCalledWith(1, {
      url: "oms/transferOrders/M200103",
      method: "GET",
    });
    expect(api).toHaveBeenNthCalledWith(2, {
      url: "poorti/transferOrders/M200103/receipts",
      method: "GET",
      params: { pageIndex: 0, pageSize: 100 },
    });
    expect(api).toHaveBeenNthCalledWith(3, {
      url: "oms/users",
      method: "GET",
      params: {
        userLoginId: ["JANE"],
        userLoginId_op: "in",
        fieldsToSelect: ["userLoginId", "firstName", "middleName", "lastName", "groupName"],
        pageSize: 1,
      },
    });
  });

  it("loads every receipt page so a large transfer is summarized rather than truncated", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ orderItemSeqId: String(index + 1) }));
    const secondPage = Array.from({ length: 100 }, (_, index) => ({ orderItemSeqId: String(index + 101) }));
    const finalPage = Array.from({ length: 48 }, (_, index) => ({ orderItemSeqId: String(index + 201) }));
    api
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage })
      .mockResolvedValueOnce({ data: finalPage });
    const client = createTransferSyncEnrichmentClient();

    await expect(client.fetchReceipts("M200103")).resolves.toHaveLength(248);

    expect(api).toHaveBeenNthCalledWith(1, {
      url: "poorti/transferOrders/M200103/receipts",
      method: "GET",
      params: { pageIndex: 0, pageSize: 100 },
    });
    expect(api).toHaveBeenNthCalledWith(2, {
      url: "poorti/transferOrders/M200103/receipts",
      method: "GET",
      params: { pageIndex: 1, pageSize: 100 },
    });
    expect(api).toHaveBeenNthCalledWith(3, {
      url: "poorti/transferOrders/M200103/receipts",
      method: "GET",
      params: { pageIndex: 2, pageSize: 100 },
    });
  });

  it("reuses the OMS order document to find when a transfer was recorded", async () => {
    api.mockResolvedValueOnce({
      data: {
        orderDetail: {
          entryDate: "2026-08-31T10:00:00Z",
        },
      },
    });
    const client = createTransferSyncEnrichmentClient();

    await expect((client as any).fetchCreationTime("M200103")).resolves.toBe("2026-08-31T10:00:00Z");
    expect(api).toHaveBeenCalledWith({
      url: "oms/orders/M200103",
      method: "GET",
    });
  });

  it("reads Shopify shipment mappings without widening the transfer-sync segment API", async () => {
    api.mockResolvedValueOnce({ data: [
      { shipmentId: "OMS-SHIPMENT-100", shopifyInventoryShipmentId: "SHOPIFY-SHIPMENT-201" },
      { shipmentId: "OMS-SHIPMENT-100", shopifyInventoryShipmentId: "SHOPIFY-SHIPMENT-202" },
    ] });
    const client = createTransferSyncEnrichmentClient();

    const mappings = await (client as any).fetchShopifyShipmentIds?.("10000", ["OMS-SHIPMENT-100"]);

    expect(mappings).toEqual({
      "OMS-SHIPMENT-100": ["SHOPIFY-SHIPMENT-201", "SHOPIFY-SHIPMENT-202"],
    });
    expect(api).toHaveBeenCalledWith({
      url: "sob/shopify/transferShipmentMappings",
      method: "GET",
      params: {
        shopId: "10000",
        shipmentId: ["OMS-SHIPMENT-100"],
        shipmentId_op: "in",
        pageIndex: 0,
        pageSize: 100,
      },
    });
  });

  it("loads every mapping page when one OMS shipment spans many Shopify batches", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      shipmentId: "OMS-SHIPMENT-100",
      shopifyInventoryShipmentId: `SHOPIFY-SHIPMENT-${index + 1}`,
    }));
    api
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: [{
        shipmentId: "OMS-SHIPMENT-100",
        shopifyInventoryShipmentId: "SHOPIFY-SHIPMENT-101",
      }] });
    const client = createTransferSyncEnrichmentClient();

    await expect((client as any).fetchShopifyShipmentIds("10000", ["OMS-SHIPMENT-100"])).resolves.toEqual({
      "OMS-SHIPMENT-100": Array.from({ length: 101 }, (_, index) => `SHOPIFY-SHIPMENT-${index + 1}`),
    });
    expect(api).toHaveBeenNthCalledWith(1, {
      url: "sob/shopify/transferShipmentMappings",
      method: "GET",
      params: {
        shopId: "10000",
        shipmentId: ["OMS-SHIPMENT-100"],
        shipmentId_op: "in",
        pageIndex: 0,
        pageSize: 100,
      },
    });
    expect(api).toHaveBeenNthCalledWith(2, {
      url: "sob/shopify/transferShipmentMappings",
      method: "GET",
      params: {
        shopId: "10000",
        shipmentId: ["OMS-SHIPMENT-100"],
        shipmentId_op: "in",
        pageIndex: 1,
        pageSize: 100,
      },
    });
  });
});
