import { describe, expect, it } from "vitest";

import {
  BULK_OPERATION_STATUS_IDS,
  bulkOperationState,
  expectsBulkOperation,
  type BulkOperationState,
} from "@/utils/shopifyBulkOperation";
import type { SystemMessage } from "@/utils/systemMessage";

/** L1 pure behaviors for the Shopify BulkOperation entity — no mocks, no DOM. */

const message = (over: Partial<SystemMessage>): SystemMessage => ({
  systemMessageId: "M1",
  systemMessageTypeId: "ShopifyProduct",
  systemMessageRemoteId: "SHOPIFY_10010",
  statusId: "SmsgConsumed",
  ...over,
});

describe("bulkOperationState — real Shopify BulkOperationStatus enum", () => {
  it.each<[status: string, expected: BulkOperationState]>([
    ["CREATED", "pending"],
    ["RUNNING", "active"],
    ["CANCELING", "active"],
    ["COMPLETED", "completed"],
    ["CANCELED", "failed"],
    ["EXPIRED", "failed"],
    ["FAILED", "failed"],
  ])("%s → %s", (status, expected) => {
    expect(bulkOperationState(status)).toBe(expected);
  });

  it("covers exactly the 7 Shopify statuses; unknown/absent default to pending", () => {
    expect(BULK_OPERATION_STATUS_IDS).toHaveLength(7);
    expect(bulkOperationState("SOMETHING_NEW")).toBe("pending");
    expect(bulkOperationState(null)).toBe("pending");
  });
});

describe("expectsBulkOperation — presence-driven detection", () => {
  it("is true only when the message resolves to a bulk-operation id", () => {
    expect(expectsBulkOperation(message({ remoteMessageId: "gid://shopify/BulkOperation/123" }))).toBe(true);
    expect(expectsBulkOperation(message({ remoteMessageId: "123" }))).toBe(true); // bare numeric normalizes to a GID
  });

  it("is false for a message with no bulk-op reference (e.g. Order Sync)", () => {
    expect(expectsBulkOperation(message({ remoteMessageId: undefined }))).toBe(false);
  });

  it("is false when remoteMessageId is a sibling SystemMessage id, not a bulk op", () => {
    expect(expectsBulkOperation(message({ remoteMessageId: "M456" }))).toBe(false);
  });
});
