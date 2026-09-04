import { describe, expect, it } from "vitest";

import {
  DATA_MANAGER_LOG_STATUS_IDS,
  aggregateCounts,
  correlateByMessage,
  isTerminal,
  logOutcome,
  logState,
  type DataManagerLog,
  type DataManagerLogState,
} from "@/utils/dataManagerLog";

/**
 * L1 pure behaviors for the DataManagerLog entity — no mocks, no DOM.
 * Status vocabulary verified against the maarg-oms StatusItem seed (7 Dmls* statuses).
 */

const makeLog = (over: Partial<DataManagerLog>): DataManagerLog => ({
  logId: "M101",
  configId: "SYNC_SHOPIFY_ORDER",
  statusId: "DmlsFinished",
  systemMessageId: "SM1",
  totalRecordCount: 1,
  failedRecordCount: 0,
  successRecordCount: 1,
  ...over,
});

const noCounts = { total: 0, success: 0, failed: 0 };

describe("logState — real Dmls status ids, no records", () => {
  it.each<[statusId: string, expected: DataManagerLogState]>([
    ["DmlsPending", "pending"],
    ["DmlsQueued", "pending"],
    ["DmlsRunning", "active"],
    ["DmlsFinished", "completed"],
    ["DmlsFailed", "failed"],
    ["DmlsCrashed", "failed"],
    ["DmlsCancelled", "failed"],
  ])("%s → %s", (statusId, expected) => {
    expect(logState(statusId, noCounts)).toBe(expected);
  });

  it("covers exactly the 7 seeded statuses (no phantom DmlsError)", () => {
    expect(DATA_MANAGER_LOG_STATUS_IDS).toHaveLength(7);
    expect(DATA_MANAGER_LOG_STATUS_IDS).not.toContain("DmlsError");
  });

  it("defaults an unrecognized status to pending — a record count alone never implies active", () => {
    expect(logState("DmlsSomethingNew", { total: 3, success: 0, failed: 0 })).toBe("pending");
    expect(logState("DmlsSomethingNew", noCounts)).toBe("pending");
  });
});

describe("logState — counts refine the base status", () => {
  it("is partial when a finished run both landed and failed records", () => {
    expect(logState("DmlsFinished", { total: 5, success: 3, failed: 2 })).toBe("partial");
  });

  it("is failed when a finished run's records all failed", () => {
    expect(logState("DmlsFinished", { total: 2, success: 0, failed: 2 })).toBe("failed");
  });

  it("is partial when a failed run still landed some records", () => {
    expect(logState("DmlsFailed", { total: 5, success: 3, failed: 2 })).toBe("partial");
  });

  it("keeps a queued run pending even with a planned record count — only a running status is active", () => {
    expect(logState("DmlsQueued", { total: 5, success: 0, failed: 0 })).toBe("pending");
  });
});

describe("logOutcome — reads the exact DataManagerLog record", () => {
  it("reconciles state and counts from the record fields", () => {
    expect(logOutcome(makeLog({ statusId: "DmlsFinished", totalRecordCount: 5, successRecordCount: 5, failedRecordCount: 0 })))
      .toEqual({ state: "completed", total: 5, success: 5, failed: 0 });
  });

  it("derives success from total minus failed when successRecordCount is absent", () => {
    const outcome = logOutcome(makeLog({ statusId: "DmlsFinished", totalRecordCount: 4, failedRecordCount: 1, successRecordCount: undefined }));
    expect(outcome).toEqual({ state: "partial", total: 4, success: 3, failed: 1 });
  });

  it("treats an absent log as an empty pending outcome", () => {
    expect(logOutcome(null)).toEqual({ state: "pending", total: 0, success: 0, failed: 0 });
  });
});

describe("isTerminal", () => {
  it("marks finished/failed/partial runs terminal and in-flight runs not", () => {
    expect(isTerminal(makeLog({ statusId: "DmlsFinished" }))).toBe(true);
    expect(isTerminal(makeLog({ statusId: "DmlsFailed", successRecordCount: 0, failedRecordCount: 2, totalRecordCount: 2 }))).toBe(true);
    expect(isTerminal(makeLog({ statusId: "DmlsRunning", successRecordCount: 0, totalRecordCount: 0, failedRecordCount: 0 }))).toBe(false);
    expect(isTerminal(makeLog({ statusId: "DmlsPending", successRecordCount: 0, totalRecordCount: 0, failedRecordCount: 0 }))).toBe(false);
  });
});

describe("aggregateCounts + correlateByMessage", () => {
  it("sums reconciled counts across logs", () => {
    const logs = [
      makeLog({ totalRecordCount: 3, successRecordCount: 3, failedRecordCount: 0 }),
      makeLog({ totalRecordCount: 2, successRecordCount: 1, failedRecordCount: 1 }),
    ];
    expect(aggregateCounts(logs)).toEqual({ total: 5, success: 4, failed: 1 });
  });

  it("returns only the logs for a given batch, and none for an empty id", () => {
    const logs = [makeLog({ systemMessageId: "SM_A" }), makeLog({ systemMessageId: "SM_B" })];
    expect(correlateByMessage(logs, "SM_A")).toHaveLength(1);
    expect(correlateByMessage(logs, "SM_A")[0].systemMessageId).toBe("SM_A");
    expect(correlateByMessage(logs, "")).toEqual([]);
  });
});
