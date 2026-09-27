import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ api: vi.fn(), choices: vi.fn(), snapshot: vi.fn() }));
vi.mock("@common", () => ({ api: state.api, commonUtil: { hasError: (response: any) => Boolean(response.error) } }));
vi.mock("@/composables/useShopify", () => ({ useTransferMappingResolution: () => ({ fetchChoices: state.choices }) }));
vi.mock("@/composables/useShopifyTransferSync", () => ({ fetchCurrentShopifyTransfer: state.snapshot }));
import { useShopifyTransferUpdateCheck } from "@/composables/useShopifyTransferUpdateCheck";

describe("live update item comparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.api.mockImplementation(({ url }: any) => Promise.resolve({ data: url.includes("syncedCreate")
      ? [{ shopId: "UK", orderId: "TO", shopifyInventoryTransferId: "10" }]
      : { shipments: [{ shipmentId: "S", items: [{ shipmentItemSeqId: "02", orderItemSeqId: "07", orderId: "TO", productId: "P", quantity: 1 }] }] } }));
    state.choices.mockResolvedValue([{ available: true, inventoryItemId: "20" }]);
    state.snapshot.mockResolvedValue({ lines: [{ inventoryItem: { id: "gid://shopify/InventoryItem/99" }, totalQuantity: 1 }] });
  });
  it("uses the shipment's product even when shipment and order item sequences differ", async () => {
    const result = await useShopifyTransferUpdateCheck().check("UK", "TO", "S", "02");
    expect(state.choices).toHaveBeenCalledWith("UK", "P");
    expect(result.item.orderItemSeqId).toBe("07");
    expect(result.matches).toEqual([]);
  });
  it("refuses another shop's transfer or an unverified shipment item", async () => {
    state.api.mockResolvedValue({ data: [{ shopId: "US", orderId: "TO", shopifyInventoryTransferId: "10" }] });
    await expect(useShopifyTransferUpdateCheck().check("UK", "TO", "S", "02")).rejects.toThrow("ownership");
    expect(state.snapshot).not.toHaveBeenCalled();
  });
  it("recognizes remote presence without claiming the connector mapping has been repaired", async () => {
    state.snapshot.mockResolvedValue({ lines: [{ inventoryItem: { id: "gid://shopify/InventoryItem/20" }, totalQuantity: 1 }] });
    const result = await useShopifyTransferUpdateCheck().check("UK", "TO", "S", "02");
    expect(result.matches).toHaveLength(1);
    expect(state.api.mock.calls.every(([request]) => request.method === "GET")).toBe(true);
  });
});
