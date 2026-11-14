import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api,
  commonUtil: { hasError: () => false },
}));

vi.mock("@/db/appDbSync", () => ({ refreshAfterMutation: vi.fn() }));
vi.mock("@/utils/shopifyWebhookReconciliation", () => ({ reconcileWebhookTopics: vi.fn() }));
vi.mock("@/workers/domains/shopifyTransferSyncDomain", () => ({
  PENDING_SEGMENT_ENDPOINTS: {},
  SYNCED_SEGMENT_ENDPOINTS: {
    shipment: "sob/shopify/transferSync/syncedShipment",
  },
  ON_HOLD_SEGMENT_ENDPOINTS: {
    cancellation: "sob/shopify/transferSync/onHoldCancellation",
    itemChange: "sob/shopify/transferSync/onHoldItemChange",
  },
}));

import { fetchCurrentShopifyTransfer, useShopifyOnHoldSegments, useShopifySyncedSegment } from "@/composables/useShopifyTransferSync";

describe("fetchCurrentShopifyTransfer", () => {
  const id = 'gid://shopify/InventoryTransfer/123';
  const line = (n: number) => ({ id: `line-${n}`, totalQuantity: 2, inventoryItem: {id: `item-${n}`, sku: `sku-${n}`} });
  const page = (nodes: any[], hasNextPage = false, endCursor: string | null = null) => ({data: {response: {node: {id, status: 'DRAFT', lineItems: {nodes, pageInfo: {hasNextPage, endCursor}}}}}});
  beforeEach(() => {
    api.mockReset();
    api.mockResolvedValueOnce({data: {shopRemotes: [{systemMessageRemoteId: 'sandbox-remote'}]}});
  });
  it('fetches every line page for the exact selected transfer', async () => {
    api.mockResolvedValueOnce(page([line(1), line(2)], true, 'next')).mockResolvedValueOnce(page([line(3)]));
    const result = await fetchCurrentShopifyTransfer('sandbox', '123');
    expect(result.lines.map((l: any) => l.inventoryItem.sku)).toEqual(['sku-1','sku-2','sku-3']);
    expect(api.mock.calls[1][0].data.variables).toEqual({id, after: null});
    expect(api.mock.calls[2][0].data.variables).toEqual({id, after: 'next'});
  });
  it('rejects a partial GraphQL result with errors', async () => {
    const response: any = page([line(1)]);
    response.data.response.errors = [{message: 'access denied'}];
    api.mockResolvedValueOnce(response);
    await expect(fetchCurrentShopifyTransfer('sandbox', '123')).rejects.toThrow('lookup failed');
  });
  it('rejects repeated lines rather than inflate totals', async () => {
    api.mockResolvedValueOnce(page([line(1)], true, 'next')).mockResolvedValueOnce(page([line(1)]));
    await expect(fetchCurrentShopifyTransfer('sandbox', '123')).rejects.toThrow('repeated');
  });
  it('rejects a mismatched or absent transfer', async () => {
    api.mockResolvedValueOnce({data: {response: {node: null}}});
    await expect(fetchCurrentShopifyTransfer('sandbox', '123')).rejects.toThrow('not returned completely');
  });
});

describe("useShopifySyncedSegment", () => {
  beforeEach(() => {
    api.mockReset();
  });

  it("tags fetched history with the selected segment so the presenter retains it", async () => {
    api.mockResolvedValue({
      data: [{ shopId: "10000", orderId: "M200103", shipmentId: "S100", syncedDate: "2026-08-31T13:44:13Z" }],
      headers: { "x-total-count": "1" },
    });
    const history = useShopifySyncedSegment();

    await history.load("10000", "shipment");

    expect(history.rows.value).toEqual([{
      shopId: "10000",
      orderId: "M200103",
      shipmentId: "S100",
      syncedDate: "2026-08-31T13:44:13Z",
      segment: "shipment",
    }]);
  });
});

describe("useShopifyOnHoldSegments", () => {
  beforeEach(() => {
    api.mockReset();
  });

  it("reads every segment of a tab and tags each row with its segment", async () => {
    api.mockImplementation(async ({ url }: any) => ({
      data: url.endsWith("onHoldCancellation")
        ? [{ orderId: "M1", orderStatusId: "OS1", holdWorkEffortId: "WE1" }]
        : [{ orderId: "M1", orderItemChangeId: "C1", holdWorkEffortId: "WE2" }],
    }));
    const onHold = useShopifyOnHoldSegments();

    await onHold.load("10000", ["cancellation", "itemChange"]);

    expect(api.mock.calls.map(([request]: any) => request.url)).toEqual([
      "sob/shopify/transferSync/onHoldCancellation",
      "sob/shopify/transferSync/onHoldItemChange",
    ]);
    expect(api.mock.calls[0][0].params).toMatchObject({ shopId: "10000", pageIndex: 0 });
    expect(onHold.rows.value.map((row: any) => [row.segment, row.holdWorkEffortId])).toEqual([
      ["cancellation", "WE1"],
      ["itemChange", "WE2"],
    ]);
  });

  it("reads nothing for a segment that cannot be on hold", async () => {
    const onHold = useShopifyOnHoldSegments();

    await onHold.load("10000", ["create"]);

    expect(api).not.toHaveBeenCalled();
    expect(onHold.rows.value).toEqual([]);
  });

  it("shows a read failure instead of an empty list", async () => {
    api.mockRejectedValue(new Error("boom"));
    const onHold = useShopifyOnHoldSegments();

    await onHold.load("10000", ["cancellation"]);

    expect(onHold.error.value).toBe("boom");
    expect(onHold.rows.value).toEqual([]);
  });
});
