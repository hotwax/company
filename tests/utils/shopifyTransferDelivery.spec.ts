import { describe, expect, it } from "vitest";
import { transferDeliveryLogs, transferDeliveryState, transferOrdersInFile } from "@/utils/shopifyTransferDelivery";

describe("transfer delivery evidence", () => {
  it("keeps staging success distinct from Shopify processing and confirmed delivery", () => {
    expect(transferDeliveryState({ statusId: "DmlsPending" }).label).toBe("Queued for Shopify");
    expect(transferDeliveryState({ statusId: "DmlsRunning", startDateTime: 100 }).label).toBe("Processing in Shopify");
    expect(transferDeliveryState({ statusId: "DmlsFinished", startDateTime: 100, finishDateTime: 200, failedRecordCount: 0 }).label).toBe("Delivered to Shopify");
  });
  it.each(["DmlsFailed", "DmlsCrashed"])("does not mistake %s for an active processor", statusId => {
    expect(transferDeliveryState({ statusId, startDateTime: 100 }).label).toBe("Delivery needs attention");
  });
  it("recognizes the processor queue and cancellation", () => {
    expect(transferDeliveryState({ statusId: "DmlsQueued" }).label).toBe("Queued for Shopify");
    expect(transferDeliveryState({ statusId: "DmlsCancelled" }).label).toBe("Delivery cancelled");
  });
  it("does not call mixed-success or unverified finished files delivered", () => {
    expect(transferDeliveryState({ statusId: "DmlsFinished", finishDateTime: 200, failedRecordCount: 1 }).label).toBe("Delivery needs attention");
    expect(transferDeliveryState({ statusId: "DmlsFinished", finishDateTime: 200, failedRecordCount: null }).label).toBe("Delivery not confirmed");
    expect(transferDeliveryState({ statusId: "DmlsFinished", failedRecordCount: 0 }).label).toBe("Delivery not confirmed");
  });
  it("never assumes a successful shop batch contains a particular TO", () => {
    const logs = [
      { logId: "one", configId: "POST_SHOPIFY_TRANSFER_ORDER", transferShopId: "UK", transferOrderIds: ["TO1"], createdDate: 100 },
      { logId: "other-shop", configId: "POST_SHOPIFY_TRANSFER_ORDER", transferShopId: "US", transferOrderIds: ["TO1"], createdDate: 300 },
      { logId: "update", configId: "UPDATE_SHOPIFY_INVENTORY_TRANSFER", transferShopId: "UK", transferOrderIds: ["TO1"], createdDate: 400 },
      { logId: "unverified", configId: "POST_SHOPIFY_TRANSFER_ORDER", transferShopId: "UK", createdDate: 500 },
    ];
    expect(transferDeliveryLogs(logs, "UK", "create", "TO1").map(log => log.logId)).toEqual(["one"]);
    expect(transferDeliveryLogs(logs, "UK", "create", "TO2")).toEqual([]);
  });
  it("verifies membership from shop-scoped source records, including batched updates", () => {
    expect(transferOrdersInFile(JSON.stringify([{ shopId: "UK", orderId: "TO1" }, { shopId: "UK", orderId: "TO2", payload: {} }]), "UK")).toEqual(["TO1", "TO2"]);
    expect(() => transferOrdersInFile([{ shopId: "US", orderId: "TO1" }], "UK")).toThrow();
    expect(() => transferOrdersInFile([{ shopId: "UK" }], "UK")).toThrow();
  });
});
