import { describe, expect, it } from "vitest";

import { normalizeProductSyncStatus } from "@/utils/shopifyProductSyncWizard";

describe("normalizeProductSyncStatus", () => {
  it("recognizes every canonical terminal DataManager outcome", () => {
    expect(normalizeProductSyncStatus({
      logId: "L1",
      logStatusId: "DmlsFinished",
      systemMessageState: "SmsgConsumed",
    })).toBe("completed");

    for(const logStatusId of ["DmlsFailed", "DmlsCrashed"]) {
      expect(normalizeProductSyncStatus({
        logId: "L1",
        logStatusId,
        systemMessageState: "SmsgConsumed",
      })).toBe("error");
    }

    expect(normalizeProductSyncStatus({
      logId: "L1",
      logStatusId: "DmlsCancelled",
      systemMessageState: "SmsgConsumed",
    })).toBe("cancelled");
  });

  it("keeps canonical pending and active imports in progress", () => {
    for(const logStatusId of ["DmlsPending", "DmlsQueued", "DmlsRunning"]) {
      expect(normalizeProductSyncStatus({
        logId: "L1",
        logStatusId,
        systemMessageState: "SmsgConsumed",
      })).toBe("importing");
    }
  });

  it("does not treat the non-existent DmlsError status as terminal", () => {
    expect(normalizeProductSyncStatus({
      logId: "L1",
      logStatusId: "DmlsError",
      systemMessageState: "SmsgConsumed",
    })).toBe("importing");
  });
});
