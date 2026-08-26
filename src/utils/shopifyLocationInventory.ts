/** Attach shop identity to the backend-computed location inventory summary before caching. */
export function normalizeLocationInventorySummary(shopId: string, summary: any): any {
  if(!summary) {return undefined;}

  return {
    shopId,
    backlogCount: summary.backlogCount,
    oldestBacklogDate: summary.oldestBacklogDate,
    errorLinkedCount: summary.errorLinkedCount,
    noOpOrQuarantinedCount: summary.noOpOrQuarantinedCount,
  };
}

/** Backend-authoritative count of ledger rows linked to an unresolved delivery error. */
export function locationInventoryDeliveryErrorCount(summary: any): number | undefined {
  if(summary?.errorLinkedCount === undefined || summary?.errorLinkedCount === null) {return undefined;}
  const count = Number(summary.errorLinkedCount);

  return Number.isFinite(count) ? count : undefined;
}
