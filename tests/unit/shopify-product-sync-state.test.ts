import assert from "assert";
import {
  getProductSyncDecision,
  getProductSyncJobName,
  getProductSyncRunStatus,
  isProductSyncRunActive,
  PRODUCT_SYNC_IDS
} from "../../src/utils/shopifyProductSyncState";

describe("shopify product sync shared state", () => {
  test("normalizes terminal system message and data manager statuses consistently", () => {
    assert.equal(getProductSyncRunStatus({ systemMessageState: "SmsgProduced" }), "queued");
    assert.equal(getProductSyncRunStatus({ systemMessageState: "SmsgSent" }), "running");
    assert.equal(getProductSyncRunStatus({ systemMessageState: "SmsgConsumed" }), "completed");
    assert.equal(getProductSyncRunStatus({ systemMessageState: "SmsgCancelled" }), "cancelled");
    assert.equal(getProductSyncRunStatus({ systemMessageState: "SmsgConsumed", logId: "LOG_1", logStatusId: "DmlsFinished" }), "completed");
    assert.equal(getProductSyncRunStatus({ systemMessageState: "SmsgConsumed", logId: "LOG_1", logStatusId: "DmlSuccess" }), "completed");
    assert.equal(getProductSyncRunStatus({ systemMessageState: "SmsgConsumed", logId: "LOG_1", logStatusId: "DmlError" }), "error");
    assert.equal(getProductSyncRunStatus({ status: "running" }), "running");
    assert.equal(getProductSyncRunStatus({ status: "importing" }), "importing");
    assert.equal(isProductSyncRunActive(undefined), false);
  });

  test("returns a blocked decision before attempting sync when access is unavailable", () => {
    const decision = getProductSyncDecision({
      hasWriteAccess: false,
      lastSyncedAt: "2026-05-02T10:00:00Z",
      unsyncedUpdateCount: 12
    });

    assert.equal(decision.shouldSync, false);
    assert.equal(decision.primaryReason, "blocked-by-access");
    assert.equal(decision.reasons.includes("has-unsynced-updates"), true);
  });

  test("returns reason-coded decisions for initial import, pending requests, active runs, and deltas", () => {
    assert.deepEqual(getProductSyncDecision({
      hasWriteAccess: true,
      lastSyncedAt: "",
      unsyncedUpdateCount: 0
    }).reasons, ["needs-initial-import"]);

    assert.equal(getProductSyncDecision({
      hasWriteAccess: true,
      lastSyncedAt: "2026-05-02T10:00:00Z",
      unsyncedUpdateCount: 3
    }).primaryReason, "has-unsynced-updates");

    assert.equal(getProductSyncDecision({
      hasWriteAccess: true,
      pendingRequestCount: 2,
      latestRunStatus: "queued"
    }).primaryReason, "pending-request-exists");

    assert.equal(getProductSyncDecision({
      hasWriteAccess: true,
      latestRunStatus: "running"
    }).primaryReason, "run-in-progress");
  });

  test("centralizes product sync backend identifiers and per-shop job naming", () => {
    assert.equal(PRODUCT_SYNC_IDS.systemMessageType.productUpdates, "BulkQueryShopifyProductUpdates");
    assert.equal(PRODUCT_SYNC_IDS.dataManagerConfig.productSync, "SYNC_SHOPIFY_PRODUCT");
    assert.equal(getProductSyncJobName("SHOP_10000"), "sync_ShopifyProductUpdates_SHOP_10000");
  });
});
