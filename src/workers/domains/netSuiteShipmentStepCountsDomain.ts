import { companyDb } from "@/db/companyDb";
import { NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN } from "@/config/appSyncConfig";
import { NETSUITE_SHIPMENT_STEP_ORDER } from "@/config/netSuiteShipmentSteps";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteShipmentStepCountsEntity = companyDb.entity(companyDb.tables.netSuiteShipmentStepCounts);

export interface NetSuiteShipmentStepCountsArgs {
  productStoreId?: string;
}

export const netSuiteShipmentStepCountsDomain = defineSyncDomain({
  name: NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN,
  table: companyDb.tables.netSuiteShipmentStepCounts,
  label: "NetSuite shipment step counts",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx, args: NetSuiteShipmentStepCountsArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    if (!productStoreId) return 0;

    const steps: any[] = (await workerGet(ctx, "netsuite/shipmentsFromNetSuite/counts", { productStoreId }))?.steps ?? [];
    const unknownSteps = steps.filter((counts) => !NETSUITE_SHIPMENT_STEP_ORDER.includes(counts.step));
    if (unknownSteps.length || steps.length !== NETSUITE_SHIPMENT_STEP_ORDER.length) {
      throw new Error(`netsuite/shipmentsFromNetSuite/counts gave steps ${steps.map((counts) => counts.step).join(", ")} for product store ${productStoreId}`);
    }

    return netSuiteShipmentStepCountsEntity.upsertMany(steps.map((counts) => ({
      productStoreId,
      step: counts.step,
      jobName: counts.jobName,
      isOn: counts.isOn ? "Y" : "N",
      lastRunTime: counts.lastRunTime,
      failedCount: counts.failedCount,
      stuckCount: counts.stuckCount,
      waitingCount: counts.waitingCount,
      readUpTo: counts.readUpTo,
    })));
  },
});
