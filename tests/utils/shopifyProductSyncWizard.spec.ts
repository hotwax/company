import { describe, expect, it } from "vitest";
import { normalizeProductSyncStatus } from "@/utils/shopifyProductSyncWizard";
import type { ProductSyncProgressSnapshot } from "@/utils/shopifyProductSyncWizard";

describe("normalizeProductSyncStatus", () => {
  it("returns error if progress.status is error", () => {
    expect(normalizeProductSyncStatus({ status: "error" })).toBe("error");
  });

  describe("terminal states", () => {
    describe("with logId (MDM log present)", () => {
      it("returns completed when logStatusId is DmlsFinished", () => {
        expect(normalizeProductSyncStatus({ logId: "123", logStatusId: "DmlsFinished" })).toBe("completed");
      });

    });

    describe("without logId (handling empty Shopify runs)", () => {
      it("returns completed when systemMessageState is SmsgConsumed", () => {
        expect(normalizeProductSyncStatus({ systemMessageState: "SmsgConsumed" })).toBe("completed");
      });

      it("returns error when systemMessageState is SmsgError", () => {
        expect(normalizeProductSyncStatus({ systemMessageState: "SmsgError" })).toBe("error");
      });

      it("returns cancelled when systemMessageState is SmsgCancelled", () => {
        expect(normalizeProductSyncStatus({ systemMessageState: "SmsgCancelled" })).toBe("cancelled");
      });
    });
  });

  describe("non-terminal states with logId", () => {
    it("returns importing when logStatusId is DmlsRunning", () => {
      expect(normalizeProductSyncStatus({ logId: "123", logStatusId: "DmlsRunning" })).toBe("importing");
    });

    it("returns importing when logStatusId is DmlsPending", () => {
      expect(normalizeProductSyncStatus({ logId: "123", logStatusId: "DmlsPending" })).toBe("importing");
    });
  });

  describe("systemMessageState fallbacks", () => {
    it("returns queued when systemMessageState is SmsgProduced", () => {
      expect(normalizeProductSyncStatus({ systemMessageState: "SmsgProduced" })).toBe("queued");
    });

    it("returns running when systemMessageState is SmsgSent", () => {
      expect(normalizeProductSyncStatus({ systemMessageState: "SmsgSent" })).toBe("running");
    });

    it("returns importing when systemMessageState is SmsgConfirmed", () => {
      expect(normalizeProductSyncStatus({ systemMessageState: "SmsgConfirmed" })).toBe("importing");
    });

    it("returns importing when systemMessageState is SmsgConsumed with logId present", () => {
      expect(normalizeProductSyncStatus({ logId: "123", systemMessageState: "SmsgConsumed" })).toBe("importing");
    });

    // Once an MDM log exists, the DataManager status owns the outcome and the system message no
    // longer forces a terminal read. With no logStatusId yet the import is still in flight, so both
    // of these stay importing rather than reporting the message's terminal state.
    it("keeps importing when a logId is present and only the message is cancelled", () => {
      expect(normalizeProductSyncStatus({ logId: "123", systemMessageState: "SmsgCancelled" })).toBe("importing");
    });

    it("keeps importing when a logId is present and only the message errored", () => {
      expect(normalizeProductSyncStatus({ logId: "123", systemMessageState: "SmsgError" })).toBe("importing");
    });

    it("reports the DataManager outcome once the log carries one", () => {
      expect(normalizeProductSyncStatus({ logId: "123", logStatusId: "DmlsCancelled" })).toBe("cancelled");
      expect(normalizeProductSyncStatus({ logId: "123", logStatusId: "DmlsFailed" })).toBe("error");
    });

    it("returns queued by default", () => {
      expect(normalizeProductSyncStatus({})).toBe("queued");
      expect(normalizeProductSyncStatus({ systemMessageState: "UnknownState" })).toBe("queued");
    });
  });
  // Canonical DataManager statuses, matching the dataManagerLogState mapping the
  // normalizer now routes through. DmlsError is not a real DataManager status and
  // must never read as terminal.
  describe("canonical DataManager statuses", () => {
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
});
