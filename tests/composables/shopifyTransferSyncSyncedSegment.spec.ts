import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api,
  commonUtil: { hasError: () => false },
}));

vi.mock("@/services/appDbSync", () => ({ refreshAfterMutation: vi.fn() }));
vi.mock("@/utils/cacheEntities", () => ({ shopifyTransferPendingCache: {} }));
vi.mock("@/composables/useCachedList", () => ({ useCachedList: vi.fn() }));
vi.mock("@/utils/shopifyWebhookReconciliation", () => ({ reconcileWebhookTopics: vi.fn() }));
vi.mock("@/workers/domains/shopifyTransferSyncDomain", () => ({
  PENDING_SEGMENT_ENDPOINTS: {},
  SYNCED_SEGMENT_ENDPOINTS: {
    shipment: "sob/shopify/transferSync/syncedShipment",
  },
}));

import { fetchCurrentShopifyTransfer, useShopifySyncedSegment } from "@/composables/useShopifyTransferSync";

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
