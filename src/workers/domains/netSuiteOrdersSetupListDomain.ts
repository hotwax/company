import { companyDb } from "@/db/companyDb";
import { NETSUITE_ORDERS_SETUP_LIST_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { NETSUITE_ORDERS_SETUP_LISTS } from "@/config/netSuiteOrdersSetup";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteOrdersSetupListEntity = companyDb.entity(companyDb.tables.netSuiteOrdersSetupLists);

export interface NetSuiteOrdersSetupListArgs {
  productStoreId?: string;
  list?: string;
  limit?: number;
}

export const netSuiteOrdersSetupListDomain = defineSyncDomain({
  name: NETSUITE_ORDERS_SETUP_LIST_DOMAIN,
  table: companyDb.tables.netSuiteOrdersSetupLists,
  label: "NetSuite orders setup list",
  syncClass: "A",
  intervalMs: 300_000,
  async sync(ctx, args: NetSuiteOrdersSetupListArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    const setupList = NETSUITE_ORDERS_SETUP_LISTS[String(args.list ?? "")];
    if (!productStoreId || !setupList) return 0;

    const response = await workerGet(ctx, setupList.urlPath, { productStoreId, pageSize: args.limit ?? NETSUITE_STEP_LIST_PAGE });
    const rows = response?.[setupList.recordsKey];
    if (!Array.isArray(rows)) {
      throw new Error(`${setupList.urlPath} gave no ${setupList.recordsKey} list for product store ${productStoreId}`);
    }

    return netSuiteOrdersSetupListEntity.upsertMany([{
      productStoreId,
      list: setupList.list,
      recordCount: response[setupList.recordCountKey],
      records: rows.map(setupList.toRecord),
    }]);
  },
});
