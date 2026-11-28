import { companyDb } from "@/db/companyDb";
import { NETSUITE_STEP_LIST_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { NETSUITE_ORDER_STEPS, NETSUITE_STEP_LIST_PATHS } from "@/config/netSuiteOrderSteps";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteStepListEntity = companyDb.entity(companyDb.tables.netSuiteStepLists);

export interface NetSuiteStepListArgs {
  productStoreId?: string;
  step?: string;
  list?: string;
  limit?: number;
}

export const netSuiteStepListDomain = defineSyncDomain({
  name: NETSUITE_STEP_LIST_DOMAIN,
  table: companyDb.tables.netSuiteStepLists,
  label: "NetSuite step lists",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx, args: NetSuiteStepListArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    const orderStep = NETSUITE_ORDER_STEPS[String(args.step ?? "")];
    const list = String(args.list ?? "");
    const listPath = NETSUITE_STEP_LIST_PATHS[list];
    if (!productStoreId || !orderStep || !listPath) return 0;

    const url = `${orderStep.urlBase}/${listPath}`;
    const response = await workerGet(ctx, url, { ...orderStep.stepParams, productStoreId, pageSize: args.limit ?? NETSUITE_STEP_LIST_PAGE });
    const rows = response?.[orderStep.recordsKey];
    if (!Array.isArray(rows)) {
      throw new Error(`${url} gave no ${orderStep.recordsKey} list for product store ${productStoreId}`);
    }

    return netSuiteStepListEntity.upsertMany([{
      productStoreId,
      step: orderStep.step,
      list,
      recordCount: response[orderStep.recordCountKey],
      records: rows.map(orderStep.toRecord),
    }]);
  },
});
