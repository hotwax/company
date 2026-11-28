import { companyDb } from "@/db/companyDb";
import { NETSUITE_STEP_COUNTS_DOMAIN } from "@/config/appSyncConfig";
import { NETSUITE_ORDER_STEP_ORDER, NETSUITE_ORDER_STEPS, NETSUITE_STEP_OPEN_BATCHES } from "@/config/netSuiteOrderSteps";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteStepCountsEntity = companyDb.entity(companyDb.tables.netSuiteStepCounts);

export interface NetSuiteStepCountsArgs {
  productStoreId?: string;
}

export const netSuiteStepCountsDomain = defineSyncDomain({
  name: NETSUITE_STEP_COUNTS_DOMAIN,
  table: companyDb.tables.netSuiteStepCounts,
  label: "NetSuite step counts",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx, args: NetSuiteStepCountsArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    if (!productStoreId) return 0;

    const openBatchCounts: any[] = (await workerGet(ctx, "netsuite/batchMessages/openCounts", {}))?.openBatchCounts ?? [];

    const stepCounts = await Promise.all(NETSUITE_ORDER_STEP_ORDER.map(async (step) => {
      const url = `${NETSUITE_ORDER_STEPS[step].urlBase}/counts`;
      const counts = await workerGet(ctx, url, { ...NETSUITE_ORDER_STEPS[step].stepParams, productStoreId });
      if (typeof counts?.isOn !== "boolean") {
        throw new Error(`${url} gave no isOn for product store ${productStoreId}`);
      }
      return {
        productStoreId,
        step,
        jobName: counts.jobName,
        isOn: counts.isOn ? "Y" : "N",
        lastRunTime: counts.lastRunTime,
        failedCount: counts.failedCount,
        stuckCount: counts.stuckCount,
        pendingOverOneDayCount: counts.pendingOverOneDayCount,
        notPickedCount: counts.notPickedCount,
        openBatches: openBatchCounts.filter((openBatch) => openBatch.systemMessageTypeId === NETSUITE_STEP_OPEN_BATCHES[step].systemMessageTypeId),
      };
    }));

    return netSuiteStepCountsEntity.upsertMany(stepCounts);
  },
});
