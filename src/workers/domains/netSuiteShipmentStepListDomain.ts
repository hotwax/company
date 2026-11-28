import { companyDb } from "@/db/companyDb";
import { NETSUITE_SHIPMENT_STEP_LIST_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { NETSUITE_SHIPMENT_STEPS } from "@/config/netSuiteShipmentSteps";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteShipmentStepListEntity = companyDb.entity(companyDb.tables.netSuiteShipmentStepLists);

export interface NetSuiteShipmentStepListArgs {
  productStoreId?: string;
  step?: string;
  list?: string;
  limit?: number;
}

export const netSuiteShipmentStepListDomain = defineSyncDomain({
  name: NETSUITE_SHIPMENT_STEP_LIST_DOMAIN,
  table: companyDb.tables.netSuiteShipmentStepLists,
  label: "NetSuite shipment step lists",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx, args: NetSuiteShipmentStepListArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    const step = String(args.step ?? "");
    const list = String(args.list ?? "");
    if (!productStoreId || !NETSUITE_SHIPMENT_STEPS[step]?.lists.includes(list)) return 0;

    const stepList = await workerGet(ctx, "netsuite/shipmentsFromNetSuite/step", { productStoreId, step, list, pageSize: args.limit ?? NETSUITE_STEP_LIST_PAGE });

    return netSuiteShipmentStepListEntity.upsertMany([{
      productStoreId,
      step,
      list,
      jobName: stepList?.jobName,
      minAgeHours: stepList?.jobSettings?.minAgeHours != null ? Number(stepList.jobSettings.minAgeHours) : undefined,
      recordCount: stepList?.recordCount,
      ledgerRowCount: stepList?.ledgerRowCount,
      ledgerRows: stepList?.ledgerRows ?? [],
      fileCount: stepList?.fileCount,
      failedRecordCount: stepList?.failedRecordCount,
      files: stepList?.files ?? [],
      orderCount: stepList?.orderCount,
      orders: stepList?.orders ?? [],
    }]);
  },
});
