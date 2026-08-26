import { describe, expect, it, vi } from "vitest";

vi.mock("@common", () => ({
  api: vi.fn(),
  commonUtil: { hasError: vi.fn() },
  translate: (value: string) => value,
}));

import * as locationInventory from "@/utils/shopifyLocationInventory";
import * as transferSync from "@/utils/shopifyTransferSync";

describe("Shopify transfer detail lines", () => {
  it("maps the backend line quantity and remote transfer line id", () => {
    const normalize = (transferSync as any).normalizeTransferSyncLines;
    const rows = normalize([{
      orderItemSeqId: "00001",
      productId: "SKU-1",
      lineQuantity: 0,
      shopifyInventoryTransferLineItemId: "987654321",
    }]);

    expect(rows).toEqual([{
      key: "00001-0",
      orderItemSeqId: "00001",
      product: "SKU-1",
      lineQuantity: 0,
      shopifyInventoryTransferLineItemId: "987654321",
      removed: true,
    }]);
  });
});

describe("location inventory summary", () => {
  it("preserves the backend-authoritative no-op/quarantine total", () => {
    expect(locationInventory.normalizeLocationInventorySummary("10000", {
      backlogCount: 4,
      oldestBacklogDate: "1787700000000",
      errorLinkedCount: 2,
      noOpOrQuarantinedCount: 7,
    })).toEqual({
      shopId: "10000",
      backlogCount: 4,
      oldestBacklogDate: "1787700000000",
      errorLinkedCount: 2,
      noOpOrQuarantinedCount: 7,
    });
  });

  it("uses the backend-authoritative linked-error total even when only some detail rows are enriched", () => {
    const deliveryErrorCount = (locationInventory as any).locationInventoryDeliveryErrorCount;

    expect(deliveryErrorCount({ errorLinkedCount: 47 })).toBe(47);
    expect(deliveryErrorCount(undefined)).toBeUndefined();
  });
});

describe("Shopify transfer monitoring readiness", () => {
  it("does not declare a cold empty cache loaded before the view domain completes", () => {
    const isLoaded = (transferSync as any).isTransferSyncMonitoringLoaded;

    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 0, liveSyncAt: 0, viewSyncBaselineAt: 0 })).toBe(false);
    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 0, liveSyncAt: 100, viewSyncBaselineAt: 0 })).toBe(true);
    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 1, liveSyncAt: 0, viewSyncBaselineAt: 0 })).toBe(true);
    expect(isLoaded({ cacheHydrated: false, cachedRowCount: 1, liveSyncAt: 100, viewSyncBaselineAt: 0 })).toBe(false);
    expect(isLoaded({ cacheHydrated: true, cachedRowCount: 0, liveSyncAt: 100, viewSyncBaselineAt: 100 })).toBe(false);
  });
});
