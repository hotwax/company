import { describe, expect, it } from "vitest";
import { groupTransferStagingIssues, latestCompletedStagingRun, transferStagingIssues } from "@/utils/shopifyTransferStagingErrors";

const creationResult = {
  blockedOrderCount: 1,
  blockedOrderList: [{ shopId: "100051", orderId: "128255", errors: [
    "Order item [128255:04] product [100198] has 2 distinct ShopifyShopProduct mappings for shop [100051]: [[shopifyProductId:41507189915785], [shopifyProductId:39808434045065]].",
  ] }],
};
const updateResult = {
  diagnostics: [
    { shopId: "100051", orderId: "128758", code: "unmapped-shipped-item", message: "Shipment [117814] item [02] has no unambiguous Shopify inventory item or whole positive quantity." },
    { shopId: "100051", orderId: "128758", code: "ambiguous-remote-shipment", message: "Receipt [122587] shipment [117814] has no Shopify shipment mapping; receipt push deferred.", detail: { receiptId: "122587" } },
  ],
};

describe("transfer staging blockers", () => {
  it("reads record-level creation blockers on a successful job and identifies the product/item", () => {
    const rows = transferStagingIssues({ jobRunId: "637464", hasError: "N", results: JSON.stringify(creationResult) }, "100051", "create");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "multiple-product-mappings", orderId: "128255", orderItemSeqId: "04", productId: "100198", waiting: false, title: "Multiple Shopify variants mapped to one product" });
    expect(rows[0].action).toContain("correct Shopify variant mapping");
  });

  it("distinguishes the shipment blocker from dependent receipts", () => {
    const rows = transferStagingIssues({ jobRunId: "637469", hasError: "N", results: updateResult }, "100051", "update");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ shipmentId: "117814", orderItemSeqId: "02", waiting: false });
    expect(rows[0].action).toContain("added after the transfer synced");
    expect(rows[1]).toMatchObject({ shipmentId: "117814", receiptId: "122587", waiting: true });
    expect(rows[1].action).toContain("Resolve the shipment blocker");
  });

  it("does not expose another shop's diagnostics", () => {
    expect(transferStagingIssues({ results: updateResult }, "OTHER", "update")).toEqual([]);
  });

  it("uses the latest completed run, including a successful empty result that clears old blockers", () => {
    const runs = [
      { jobRunId: "running", startTime: 300 },
      { jobRunId: "blocked", startTime: 100, endTime: 110, results: creationResult },
      { jobRunId: "cleared", startTime: 200, endTime: 210, results: { blockedOrderCount: 0 } },
    ];
    const latest = latestCompletedStagingRun(runs);
    expect(latest.jobRunId).toBe("cleared");
    expect(transferStagingIssues(latest, "100051", "create")).toEqual([]);
  });

  it.each(["{broken", null, [], {}, { blockedOrderCount: 1 }])("never reports an unreadable result as healthy: %j", (results) => {
    expect(transferStagingIssues({ results, hasError: "N" }, "100051", "create")[0].code).toBe("unreadable-results");
  });

  it("preserves unknown errors without guessing their cause", () => {
    const rows = transferStagingIssues({ results: { diagnostics: [{ shopId: "100051", orderId: "O1", code: "future-code", message: "New validation message" }] } }, "100051", "update");
    expect(rows[0]).toMatchObject({ code: "future-code", message: "New validation message", title: "Transfer could not be staged" });
  });

  it("shows job-level failures when no record-level result is available", () => {
    const rows = transferStagingIssues({ hasError: "Y", errors: "Unable to execute service" }, "100051", "create");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "job-failed", message: "Unable to execute service" });
  });
});


it("groups shipment and receipt blockers into one transfer destination", () => {
  const rows = transferStagingIssues({ jobRunId: "run", results: updateResult }, "100051", "update");
  const groups = groupTransferStagingIssues(rows);
  expect(groups).toHaveLength(1);
  expect(groups[0].orderId).toBe("128758");
  expect(groups[0].issues).toHaveLength(2);
});
