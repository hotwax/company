export function retryState(message: { statusId: string; failCount: number }) {
  if(message.statusId === "SmsgError") return { key: "stopped", label: "Retries stopped", color: "danger", rank: 0, detail: "Automatic retries have stopped. Review the cause before restarting sync." };
  if(message.statusId === "SmsgSending") return { key: "sending", label: "Sending", color: "primary", rank: 2, detail: "A send may still be running. If this persists, ask your administrator to check the job and Shopify before resetting it." };
  if(message.statusId === "SmsgProduced" && message.failCount > 0) return { key: "retry", label: "Failed • awaiting retry", color: "warning", rank: 1, detail: "Eligible for another automatic attempt when the retry job runs. The timing depends on your job configuration." };
  if(message.statusId === "SmsgProduced") return { key: "waiting", label: "Awaiting first attempt", color: "medium", rank: 3, detail: "No failed attempts recorded." };
  return { key: "stopped", label: "Needs review", color: "danger", rank: 0, detail: "This status is not picked up by the automatic retry job. Ask your administrator to review it." };
}

/** Interpret only specific evidence; CLOSED alone does not establish that an order was canceled. */
export function fulfillmentRecovery(errorText: string) {
  if(/ON_HOLD/.test(errorText)) return { title: "Shopify is holding these items", action: "Open the order in Shopify and review the hold reason. Resolve that reason, then release only the appropriate hold and retry this sync. Retrying while the hold remains will fail again." };
  if(/No fulfillable quantity left|:CLOSED/.test(errorText)) return { title: "Needs reconciliation: no fulfillable quantity", action: "Check whether these items were already fulfilled or the order was canceled in Shopify. Compare with the shipped items in HotWax. Ask your operations team to reconcile the difference before retrying; retrying alone will not fix it." };
  if(/fulfillment order move (failed|returned)/i.test(errorText)) return { title: "Shopify could not move the fulfillment", action: "Review the assigned Shopify location and fulfillment request status. Confirm the shipping facility maps to the right Shopify location. Resolve the rejected move before retrying." };
  if(/fulfillment order reopen failed/i.test(errorText)) return { title: "Shopify could not reopen the fulfillment order", action: "Review the fulfillment order and any fulfillment service request in Shopify. Ask your operations team to resolve its state before retrying." };
  if(/\b429\b|THROTTLED|Too Many Requests/i.test(errorText)) return { title: "Shopify is limiting requests", action: "Allow the retry job to try again. If retries have stopped, ask your administrator to check API capacity before restarting sync." };
  if(/\b401\b|\b403\b|access denied|unauthorized|invalid.*token/i.test(errorText)) return { title: "Shopify access needs attention", action: "Ask your administrator to check this shop connection and its fulfillment permissions. Retry after access is restored." };
  if(/timeout|timed out|ECONNRESET|\b50[234]\b/i.test(errorText)) return { title: "The Shopify result could not be confirmed", action: "Check Shopify for an existing fulfillment before retrying. A lost response can occur after Shopify accepted the request; retrying without checking could cause a duplicate." };
  return { title: errorText ? "This sync needs investigation" : "The failure details are not available yet", action: "Review the technical details with your administrator and compare the shipment with Shopify. The cause is not confirmed, so check the Shopify result before retrying." };
}
