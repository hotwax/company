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

      it("returns error when logStatusId is DmlsError", () => {
        expect(normalizeProductSyncStatus({ logId: "123", logStatusId: "DmlsError" })).toBe("error");
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

    it("returns cancelled when systemMessageState is SmsgCancelled with logId present", () => {
      expect(normalizeProductSyncStatus({ logId: "123", systemMessageState: "SmsgCancelled" })).toBe("cancelled");
    });

    it("returns error when systemMessageState is SmsgError with logId present", () => {
      expect(normalizeProductSyncStatus({ logId: "123", systemMessageState: "SmsgError" })).toBe("error");
    });

    it("returns queued by default", () => {
      expect(normalizeProductSyncStatus({})).toBe("queued");
      expect(normalizeProductSyncStatus({ systemMessageState: "UnknownState" })).toBe("queued");
    });
  });
});
