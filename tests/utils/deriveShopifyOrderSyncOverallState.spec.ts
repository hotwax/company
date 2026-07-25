import { describe, expect, it } from "vitest";

import {
  deriveShopifyOrderSyncOverallState,
  type OrderSyncProgressState,
} from "@/utils/shopifyOrderSync";

/**
 * L1 unit — pure derivation, no mocks, no DOM.
 *
 * `deriveShopifyOrderSyncOverallState` collapses the two monitoring rows the
 * operator watches — the Shopify order *batch request* and the HotWax
 * *DataManager import* — into the single status shown for the run. It is the
 * truth behind these acceptance rows:
 *
 *   M4  a mixed-outcome batch is "Partially completed", never silently a success.
 *   M5  once the request has finished, the run mirrors the terminal import outcome.
 *
 * Scope note (honesty about what this unit owns): the processed *count* and the
 * zero-change "Completed / 0 ≠ failed" distinction are produced upstream in
 * `deriveShopifyOrderSyncProgress`. This function only combines two
 * already-derived states, so combination is all we assert here.
 */
const overall = (batch: OrderSyncProgressState, importRow: OrderSyncProgressState) =>
  deriveShopifyOrderSyncOverallState({ state: batch }, { state: importRow });

describe("deriveShopifyOrderSyncOverallState", () => {
  it.each<[label: string, batch: OrderSyncProgressState, importRow: OrderSyncProgressState, expected: OrderSyncProgressState]>([
    // The batch request is not terminal yet → its own state wins; the import is ignored.
    ["request still pending → the run is pending", "pending", "failed", "pending"],
    ["request still active → the run is active", "active", "completed", "active"],

    // Request finished, but the import has not → the run is still active, not done.
    ["request done, import still active → active", "completed", "active", "active"],
    ["request done, import still pending → active", "completed", "pending", "active"],

    // Request completed → overall status mirrors the terminal import outcome (M5).
    ["clean success → completed", "completed", "completed", "completed"],
    ["mixed import outcome → partial, never a silent success (M4)", "completed", "partial", "partial"],
    ["import fully failed → failed", "completed", "failed", "failed"],

    // The request itself failed, but records still landed downstream → partial, not failed.
    ["failed request, import completed → partial", "failed", "completed", "partial"],
    ["failed request, import partial → partial", "failed", "partial", "partial"],
    ["failed request, nothing landed → failed", "failed", "failed", "failed"],

    // A non-terminal import takes precedence even when the request failed.
    ["failed request, import still pending → active", "failed", "pending", "active"],
  ])("%s", (_label, batch, importRow, expected) => {
    expect(overall(batch, importRow)).toBe(expected);
  });
});
