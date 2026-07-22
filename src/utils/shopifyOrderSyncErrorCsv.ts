import type { RecentOrderError } from "@/utils/shopifyOrderSync";

export const SHOPIFY_ORDER_SYNC_ERROR_CSV_FIELDS = [
  "errorId",
  "shopId",
  "shopifyOrderId",
  "orderName",
  "errorText",
  "occurredAt",
  "configId",
  "logId",
  "systemMessageId",
  "batchId",
  "retryable",
] as const;

function neutralizeSpreadsheetFormula(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const safeValue = neutralizeSpreadsheetFormula(value == null ? "" : String(value));
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function buildShopifyOrderSyncErrorCsv(rows: readonly RecentOrderError[]): string {
  const header = SHOPIFY_ORDER_SYNC_ERROR_CSV_FIELDS.join(",");
  const records = rows.map((row) => [
    row.id,
    row.shopId,
    row.shopifyOrderId,
    row.orderName,
    row.errorText,
    row.occurredAt,
    row.configId,
    row.logId,
    row.systemMessageId,
    row.batchId,
    row.retryable ? "true" : "false",
  ].map(csvCell).join(","));
  return [header, ...records].join("\r\n");
}

export function shopifyOrderSyncErrorCsvFileName(shopId: string): string {
  const safeShopId = shopId
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "shop";
  return `shopify-order-sync-errors-${safeShopId}.csv`;
}
