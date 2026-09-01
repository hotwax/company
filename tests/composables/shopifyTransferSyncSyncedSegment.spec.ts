import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@common", () => ({
  api,
  commonUtil: { hasError: () => false },
}));

vi.mock("@/services/appCacheBootstrap", () => ({ refreshAfterMutation: vi.fn() }));
vi.mock("@/utils/cacheEntities", () => ({ shopifyTransferPendingCache: {} }));
vi.mock("@/composables/useCachedList", () => ({ useCachedList: vi.fn() }));
vi.mock("@/utils/shopifyWebhookReconciliation", () => ({ reconcileWebhookTopics: vi.fn() }));
vi.mock("@/workers/domains/shopifyTransferSyncDomain", () => ({
  PENDING_SEGMENT_ENDPOINTS: {},
  SYNCED_SEGMENT_ENDPOINTS: {
    shipment: "sob/shopify/transferSync/syncedShipment",
  },
}));

import { useShopifySyncedSegment } from "@/composables/useShopifyTransferSync";

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
