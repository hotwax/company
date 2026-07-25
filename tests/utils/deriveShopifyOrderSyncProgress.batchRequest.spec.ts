import { describe, expect, it } from "vitest";

import {
  deriveShopifyOrderSyncProgress,
  type OrderSyncProgressState,
} from "@/utils/shopifyOrderSync";

/**
 * L1 unit — the raw→UI-vocabulary boundary. No mocks, no DOM.
 *
 * The backend never sends the app's internal states ("pending"/"active"/…).
 * It sends real Moqui SystemMessage status IDs. The full authoritative set for
 * statusTypeId="SystemMessage" — verified against the maarg-oms seed data — is:
 *
 *   SmsgTriggered  SmsgProduced  SmsgSending   SmsgSent      SmsgReceived
 *   SmsgConsuming  SmsgConsumed  SmsgConfirmed SmsgRejected  SmsgCancelled  SmsgError
 *
 * This feeds each REAL status ID through deriveShopifyOrderSyncProgress and pins
 * the "Shopify order batch request" row's derived state. With no import logs,
 * that row's state is a pure function of the SystemMessage status alone.
 *
 * The expected values encode the LIFECYCLE INTENT (waiting → in-flight → done/failed),
 * not whatever the code currently happens to return — that is exactly what lets
 * this test catch a status that slips into the wrong bucket.
 */
const batchState = (statusId: string | null): OrderSyncProgressState =>
  deriveShopifyOrderSyncProgress(statusId ? { statusId } : null, [])[0].state;

describe("Shopify batch-request state from real SystemMessage status IDs", () => {
  it.each<[statusId: string | null, expected: OrderSyncProgressState]>([
    // No message produced yet → nothing has run.
    [null, "pending"],
    ["SmsgTriggered", "pending"], // fired, but nothing produced yet → still waiting
    ["SmsgProduced", "pending"],
    ["SmsgReceived", "pending"],

    // In flight — the batch is actively moving through the pipeline.
    ["SmsgSending", "active"],
    ["SmsgConsuming", "active"], // mid-consume — same in-flight class as Received/Sending

    // Terminal success — the request reached HotWax.
    ["SmsgSent", "completed"],
    ["SmsgConsumed", "completed"],
    ["SmsgConfirmed", "completed"],

    // Terminal failure — must never read as a silent success.
    ["SmsgRejected", "failed"],
    ["SmsgCancelled", "failed"],
    ["SmsgError", "failed"],
  ])("%s → %s", (statusId, expected) => {
    expect(batchState(statusId)).toBe(expected);
  });
});
