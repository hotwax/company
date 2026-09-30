import type { TransferUpdateCheck } from "@/composables/useShopifyTransferUpdateCheck";
import { toMillis } from "@common/db/storage/projection";

export type TransferStager = "create" | "update";

export interface TransferStagingIssue {
  key: string;
  code: string;
  title: string;
  action: string;
  message: string;
  orderId?: string;
  productId?: string;
  orderItemSeqId?: string;
  shipmentId?: string;
  receiptId?: string;
  waiting: boolean;
}

/** One operator destination per transfer, even when several artifacts are blocked. */
export function groupTransferStagingIssues(issues: TransferStagingIssue[]) {
  const groups = new Map<string, { key: string; orderId?: string; issues: TransferStagingIssue[] }>();
  for(const issue of issues) {
    const key = issue.orderId || issue.key;
    if(!groups.has(key)) {groups.set(key, { key, orderId: issue.orderId, issues: [] });}
    groups.get(key)!.issues.push(issue);
  }

  return [...groups.values()];
}

export function transferSyncIssuePath(shopId: string, orderId: string): string {
  return `/shopify-connection-details/${encodeURIComponent(shopId)}/transfer-sync/${encodeURIComponent(orderId)}`;
}

/** A running attempt cannot clear the previous completed attempt's blockers. */
export function latestCompletedStagingRun(runs: any[]): any | undefined {
  return [...runs]
    .filter((run) => toMillis(run?.endTime) !== undefined)
    .sort((left, right) => (toMillis(right.startTime) ?? 0) - (toMillis(left.startTime) ?? 0))[0];
}

function resultsObject(value: unknown): Record<string, any> | undefined {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function issue(message: string, code: string, key: string, orderId?: string): TransferStagingIssue {
  const row: TransferStagingIssue = {
    key, code, message, orderId, waiting: false,
    title: "Transfer could not be staged",
    action: "Ask your integration administrator to review the job details and resolve this error before running the stager again.",
    productId: message.match(/product \[([^\]]+)\]/i)?.[1],
    orderItemSeqId: message.match(/Order item \[[^:\]]+:([^\]]+)\]/i)?.[1] ??
      message.match(/\bitem \[([^\]]+)\]/i)?.[1],
    shipmentId: message.match(/\bshipment \[([^\]]+)\]/i)?.[1],
    receiptId: message.match(/\breceipt \[([^\]]+)\]/i)?.[1],
  };

  if(Number(message.match(/has (\d+) distinct ShopifyShopProduct mappings/)?.[1]) > 1) {
    row.code = "multiple-product-mappings";
    row.title = "Multiple Shopify variants mapped to one product";
    row.action = "Ask your catalog administrator to keep only the correct Shopify variant mapping for this product in this shop, then run the creation stager again.";
  } else if(code === "unmapped-shipped-item") {
    row.title = "Shipment item cannot be matched to Shopify";
    row.action = "Check that this item exists on the Shopify transfer, has one Shopify inventory item mapping, and has a positive whole-number shipped quantity. If it was added after the transfer synced, ask your integration administrator to reconcile the transfer lines before rerunning the update stager.";
  } else if(code === "ambiguous-remote-shipment" && /has no Shopify shipment mapping/.test(message)) {
    row.title = "Receipt waiting for its shipment to sync";
    row.action = "Resolve the shipment blocker for this transfer first, then run the update stager again to send the shipment and receipts.";
    row.waiting = true;
  }

  return row;
}

/**
 * Stagers deliberately report record-level blockers inside results, including on hasError=N runs.
 * Only this shop's latest completed result is read; historical failures are never carried forward.
 */
export function transferStagingIssues(run: any, shopId: string, stager: TransferStager): TransferStagingIssue[] {
  if(!run) {return [];}
  const rows: TransferStagingIssue[] = [];
  const results = resultsObject(run.results);
  const runId = String(run.jobRunId ?? "");

  if(Array.isArray(results?.blockedOrderList)) {
    for(const blocked of results.blockedOrderList) {
      if(String(blocked?.shopId ?? "") !== shopId) {continue;}
      for(const [index, message] of (Array.isArray(blocked.errors) ? blocked.errors : []).entries()) {
        if(typeof message !== "string" || !message.trim()) {continue;}
        rows.push(issue(message, "blocked-order", `${runId}:order:${blocked.orderId}:${index}`, String(blocked.orderId ?? "")));
      }
    }
  }
  if(Array.isArray(results?.diagnostics)) {
    for(const [index, diagnostic] of results.diagnostics.entries()) {
      if(String(diagnostic?.shopId ?? "") !== shopId || typeof diagnostic.message !== "string") {continue;}
      const row = issue(diagnostic.message, String(diagnostic.code ?? "unknown"), `${runId}:diagnostic:${index}`, String(diagnostic.orderId ?? ""));
      row.receiptId ||= diagnostic.detail?.receiptId ? String(diagnostic.detail.receiptId) : undefined;
      rows.push(row);
    }
  }

  const readable = stager === "create"
    ? Array.isArray(results?.blockedOrderList) || results?.blockedOrderCount === 0
    : Array.isArray(results?.diagnostics);
  const missingBlockers = stager === "create" && Number(results?.blockedOrderCount) > 0 && !rows.length;
  if((!readable || missingBlockers) && run.hasError !== "Y") {
    rows.push(issue("", "unreadable-results", `${runId}:unreadable`));
    rows[rows.length - 1].title = "Staging results could not be read";
    rows[rows.length - 1].action = "Open the job details to review this run. The available result does not confirm whether staging blockers remain.";
  }

  if(run.hasError === "Y") {
    const error = typeof run.errors === "string" ? run.errors.trim() : "";
    if(error || !rows.length) {
      rows.push(issue(error, "job-failed", `${runId}:failed`));
      rows[rows.length - 1].title = "Staging job failed";
    }
  }

  return rows;
}

export function resolveTransferStagingIssue(issue: TransferStagingIssue, result?: TransferUpdateCheck): TransferStagingIssue {
  if(!result) {return issue;}
  if(result.choices.length > 1) {return { ...issue, code: "multiple-product-mappings", title: "Multiple Shopify variants mapped to one product", productId: result.item.productId };}
  if(result.choices.length !== 1 || !result.choices[0].available) {
    return { ...issue, code: "product-mapping", title: "The product mapping needs review", action: "Review the Shopify variant mapping for this OMS product. The comparison cannot identify the transfer line until exactly one valid mapping remains. Recheck after correcting it." };
  }
  if(!Number.isInteger(Number(result.item.quantity)) || Number(result.item.quantity) <= 0) {
    return { ...issue, code: "quantity", title: "The shipped quantity needs review", action: "Shopify requires a whole positive shipped quantity. Review this shipment item in Transfers before retrying the update job." };
  }
  return { ...issue, title: result.matches.length ? "Transfer-line mapping needs repair" : "Item missing from Shopify transfer" };
}
