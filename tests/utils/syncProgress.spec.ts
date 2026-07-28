import { describe, expect, it } from "vitest";

import type { DataManagerLog } from "@/utils/dataManagerLog";
import type { ShopifyBulkOperation } from "@/utils/shopifyBulkOperation";
import type { SystemMessage } from "@/utils/systemMessage";
import { composeProgress, overallState, type SyncProgressState } from "@/utils/syncProgress";

/**
 * L1b composition — SystemMessage (batch request) ⋈ its DataManagerLogs (imports),
 * plus the Shopify bulk operation in between when the message ran one. Pure; joins
 * the messageState + logOutcome + bulkOperationState entity behaviors. Data only.
 *
 * Acceptance rows: M2 (no bulk-op stage unless one exists), M3 (0/1/2 imports, detail
 * preserved), M5 (zero-change Completed/0 distinct from failed), M6 (counts from logs).
 */

const message = (statusId: string): SystemMessage => ({
  systemMessageId: "SM1",
  systemMessageTypeId: "ShopifyOrderSync",
  systemMessageRemoteId: "SHOPIFY_10010",
  statusId,
});

const SYNC = "SYNC_SHOPIFY_ORDER";
const UPDATE = "UPDATE_SHOPIFY_ORDER";

const importLog = (over: Partial<DataManagerLog>): DataManagerLog => ({
  logId: "L1",
  configId: SYNC,
  statusId: "DmlsFinished",
  systemMessageId: "SM1",
  totalRecordCount: 1,
  successRecordCount: 1,
  failedRecordCount: 0,
  ...over,
});

const bulkOp = (over: Partial<ShopifyBulkOperation>): ShopifyBulkOperation => ({
  id: "gid://shopify/BulkOperation/123",
  status: "COMPLETED",
  objectCount: 10,
  ...over,
});

describe("composeProgress — the two-sided join", () => {
  it("exposes exactly request + import + overall — there is no bulk-operation concept (M2)", () => {
    expect(Object.keys(composeProgress(message("SmsgConsumed"), [])).sort()).toEqual(["import", "overall", "request"]);
  });

  it("derives the request side from the message status (delegates to messageState)", () => {
    expect(composeProgress(message("SmsgConsuming"), []).request).toBe("active");
    expect(composeProgress(message("SmsgError"), []).request).toBe("failed");
  });

  it("a completed request with no imports is Completed with zero processed (M5)", () => {
    const progress = composeProgress(message("SmsgConsumed"), []);
    expect(progress.import.state).toBe("completed");
    expect(progress.import.total).toBe(0);
    expect(progress.import.imports).toHaveLength(0);
    expect(progress.overall).toBe("completed");
  });

  it("a failed request with no imports stays failed — distinct from a zero-change success (M5)", () => {
    const progress = composeProgress(message("SmsgError"), []);
    expect(progress.import.state).toBe("failed");
    expect(progress.overall).toBe("failed");
  });

  it("surfaces a single import's outcome and counts (M3)", () => {
    const progress = composeProgress(message("SmsgConsumed"), [importLog({ totalRecordCount: 3, successRecordCount: 3 })]);
    expect(progress.import.state).toBe("completed");
    expect(progress.import.success).toBe(3);
    expect(progress.import.imports).toHaveLength(1);
    expect(progress.overall).toBe("completed");
  });

  it("aggregates create + update imports while preserving each in the detail (M3)", () => {
    const progress = composeProgress(message("SmsgConsumed"), [
      importLog({ logId: "new", configId: SYNC, totalRecordCount: 3, successRecordCount: 3 }),
      importLog({ logId: "upd", configId: UPDATE, totalRecordCount: 2, successRecordCount: 2 }),
    ]);
    expect(progress.import.success).toBe(5);
    expect(progress.import.imports).toHaveLength(2);
    expect(progress.import.imports.map((entry) => entry.configId)).toEqual([SYNC, UPDATE]);
    expect(progress.import.imports.every((entry) => entry.state === "completed")).toBe(true);
  });

  it("marks a mixed create/update outcome partial, keeping both per-import states and counts (M3/M5)", () => {
    const progress = composeProgress(message("SmsgConsumed"), [
      importLog({ logId: "new", configId: SYNC, statusId: "DmlsFinished", totalRecordCount: 3, successRecordCount: 3, failedRecordCount: 0 }),
      importLog({ logId: "upd", configId: UPDATE, statusId: "DmlsFailed", totalRecordCount: 2, successRecordCount: 0, failedRecordCount: 2 }),
    ]);
    expect(progress.import.state).toBe("partial");
    expect(progress.import.success).toBe(3);
    expect(progress.import.failed).toBe(2);
    expect(progress.import.imports.map((entry) => entry.state)).toEqual(["completed", "failed"]);
    expect(progress.overall).toBe("partial");
  });

  it("derives the processed count from the import logs, never the message (M6)", () => {
    const progress = composeProgress(message("SmsgConsumed"), [importLog({ totalRecordCount: 4, successRecordCount: 4 })]);
    expect(progress.import.success).toBe(4);
  });

  it("deduplicates a repeated log response by logId", () => {
    const one = importLog({ logId: "dupe", totalRecordCount: 2, successRecordCount: 2 });
    const progress = composeProgress(message("SmsgConsumed"), [one, { ...one }]);
    expect(progress.import.imports).toHaveLength(1);
    expect(progress.import.success).toBe(2);
  });
});

describe("composeProgress — presence-driven bulk-operation stage", () => {
  it("omits the bulk-operation stage entirely when none is supplied (Order Sync, M2)", () => {
    const progress = composeProgress(message("SmsgConsumed"), [importLog({})]);
    expect(progress.bulkOperation).toBeUndefined();
    expect("bulkOperation" in progress).toBe(false);
  });

  it("includes the bulk-operation stage when one is supplied (Product Sync)", () => {
    const progress = composeProgress(message("SmsgConsumed"), [importLog({})], bulkOp({ status: "COMPLETED", objectCount: 10 }));
    expect(progress.bulkOperation).toEqual({ id: "gid://shopify/BulkOperation/123", state: "completed", objectCount: 10 });
  });

  it("keeps the run active while the bulk operation is still running", () => {
    expect(composeProgress(message("SmsgConsumed"), [], bulkOp({ status: "RUNNING" })).overall).toBe("active");
  });

  it("fails the run when the bulk operation failed, even before any import ran (upstream failure)", () => {
    expect(composeProgress(message("SmsgConsumed"), [], bulkOp({ status: "FAILED" })).overall).toBe("failed");
  });

  it("completes the run only when request, bulk operation, and import all completed", () => {
    const progress = composeProgress(
      message("SmsgConsumed"),
      [importLog({ totalRecordCount: 5, successRecordCount: 5 })],
      bulkOp({ status: "COMPLETED" }),
    );
    expect(progress.overall).toBe("completed");
  });
});

describe("overallState — request → [bulkOperation] → import → the run's one status", () => {
  it.each<[SyncProgressState, SyncProgressState, SyncProgressState]>([
    ["pending", "failed", "pending"],
    ["active", "completed", "active"],
    ["completed", "active", "active"],
    ["completed", "completed", "completed"],
    ["completed", "partial", "partial"],
    ["completed", "failed", "failed"],
    ["failed", "completed", "partial"],
    ["failed", "failed", "failed"],
  ])("request=%s import=%s → %s (no bulk op)", (request, importState, expected) => {
    expect(overallState(request, importState)).toBe(expected);
  });

  it.each<[SyncProgressState, SyncProgressState, SyncProgressState, SyncProgressState]>([
    ["completed", "pending", "active", "active"], // bulk op running blocks the run
    ["completed", "pending", "failed", "failed"], // bulk op failed → run fails before import
    ["completed", "completed", "completed", "completed"],
    ["completed", "partial", "completed", "partial"],
  ])("request=%s import=%s bulkOp=%s → %s", (request, importState, bulkOperation, expected) => {
    expect(overallState(request, importState, bulkOperation)).toBe(expected);
  });
});
