import { describe, expect, it } from "vitest";
import type { RecentOrderError } from "@/utils/shopifyOrderSync";
import {
  SHOPIFY_ORDER_SYNC_ERROR_CSV_FIELDS,
  buildShopifyOrderSyncErrorCsv,
  shopifyOrderSyncErrorCsvFileName,
} from "./shopifyOrderSyncErrorCsv";

function errorRow(overrides: Partial<RecentOrderError> = {}): RecentOrderError {
  return {
    id: "10010|SYNC_SHOPIFY_ORDER|log-1|run-1|message-1|log-1%3A0",
    shopId: "10010",
    shopifyOrderId: "123456",
    orderName: "#1001",
    errorText: "Immutable staging failure",
    occurredAt: "2026-07-22T12:00:00Z",
    occurredAtMillis: Date.parse("2026-07-22T12:00:00Z"),
    configId: "SYNC_SHOPIFY_ORDER",
    logId: "log-1",
    systemMessageId: "message-1",
    batchId: "run-1",
    retryable: true,
    ...overrides,
  };
}

describe("safe Order Sync error CSV", () => {
  it("exports only the exact safe projection fields with RFC4180 quoting and CRLF rows", () => {
    const csv = buildShopifyOrderSyncErrorCsv([errorRow({ errorText: 'Rejected, because "value"\nwas invalid' })]);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(SHOPIFY_ORDER_SYNC_ERROR_CSV_FIELDS.join(","));
    expect(csv).toContain('"Rejected, because ""value""\nwas invalid"');
    expect(csv).not.toContain("occurredAtMillis");
    expect(csv).not.toContain("payload");
    expect(csv).not.toContain("contentLocation");
  });

  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "  =HYPERLINK(\"https://invalid\")"])(
    "neutralizes spreadsheet formula input %s",
    (formula) => {
      const csv = buildShopifyOrderSyncErrorCsv([errorRow({ orderName: formula })]);
      expect(csv).toContain(`"'${formula.replace(/"/g, '""')}"`);
      expect(csv).not.toContain(`,"${formula.replace(/"/g, '""')}",`);
    }
  );

  it("uses a fixed CSV filename with a bounded sanitized shop suffix", () => {
    expect(shopifyOrderSyncErrorCsvFileName("shop/100?private")).toBe("shopify-order-sync-errors-shop-100-private.csv");
    expect(shopifyOrderSyncErrorCsvFileName("/".repeat(200))).toBe("shopify-order-sync-errors-shop.csv");
  });
});
