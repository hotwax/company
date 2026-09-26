import { beforeEach, describe, expect, it, vi } from "vitest";

const translate = vi.hoisted(() =>
  vi.fn((key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      key,
    )));

vi.mock("@common", () => ({ translate }));

import { CacheReconciliationError } from "@/utils/cacheReconciliationError";
import {
  CARRIER_ACCOUNT_VERIFICATION_ERROR_KEY,
  ERROR_WITH_DETAILS_KEY,
  REFERENCE_DATA_ERROR_KEY,
  translateCarrierAccountVerificationError,
  translateMutationError,
  translateReferenceDataError,
} from "@/utils/errorPresentation";

describe("carrier error presentation", () => {
  beforeEach(() => {
    translate.mockClear();
  });

  it("passes runtime mutation diagnostics as values under a stable locale key", () => {
    const error = new Error("Committed IDs: A; failed IDs: B");
    const message = translateMutationError(
      error,
      "Failed to save the carrier shipment method order.",
    );
    const expected = "Failed to save the carrier shipment method order. " +
      "Details: Committed IDs: A; failed IDs: B";

    expect(message).toBe(expected);
    expect(translate).toHaveBeenLastCalledWith(ERROR_WITH_DETAILS_KEY, {
      summary: "Failed to save the carrier shipment method order.",
      details: "Committed IDs: A; failed IDs: B",
    });
    expect(translate).not.toHaveBeenCalledWith("Committed IDs: A; failed IDs: B");
  });

  it("uses the static committed-write warning without exposing cache scope as a key", () => {
    const error = new CacheReconciliationError("carrier", { partyId: "UPS" });
    const message = translateMutationError(
      error,
      "Failed to rename the carrier.",
    );
    const expected = "The server change was saved, but this view could not be refreshed. " +
      "Refresh before retrying.";

    expect(message).toBe(expected);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("wraps reference and account diagnostics with their fixed keys", () => {
    const referenceMessage = translateReferenceDataError("page 4 failed");
    const accountMessage = translateCarrierAccountVerificationError("endpoint unavailable");

    expect(referenceMessage)
      .toBe("Reference data could not be synchronized. Details: page 4 failed");
    expect(accountMessage)
      .toBe("Carrier account verification is unavailable. Details: endpoint unavailable");
    expect(translate).toHaveBeenNthCalledWith(1, REFERENCE_DATA_ERROR_KEY, {
      details: "page 4 failed",
    });
    expect(translate).toHaveBeenNthCalledWith(
      2,
      CARRIER_ACCOUNT_VERIFICATION_ERROR_KEY,
      { details: "endpoint unavailable" },
    );
  });
});
