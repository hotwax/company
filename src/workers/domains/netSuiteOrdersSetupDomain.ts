import { companyDb } from "@/db/companyDb";
import { NETSUITE_ORDERS_SETUP_DOMAIN } from "@/config/appSyncConfig";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteOrdersSetupEntity = companyDb.entity(companyDb.tables.netSuiteOrdersSetup);

export interface NetSuiteOrdersSetupArgs {
  productStoreId?: string;
}

export const netSuiteOrdersSetupDomain = defineSyncDomain({
  name: NETSUITE_ORDERS_SETUP_DOMAIN,
  table: companyDb.tables.netSuiteOrdersSetup,
  label: "NetSuite orders setup",
  syncClass: "A",
  intervalMs: 300_000,
  async sync(ctx, args: NetSuiteOrdersSetupArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    if (!productStoreId) return 0;

    const url = "netsuite/ordersSetup";
    const setup = await workerGet(ctx, url, { productStoreId });
    if (!setup || typeof setup !== "object") {
      throw new Error(`${url} gave no setup for product store ${productStoreId}`);
    }

    return netSuiteOrdersSetupEntity.upsertMany([{
      productStoreId,
      goLiveDate: setup.goLiveDate,
      productCount: setup.productCount,
      facilityCount: setup.facilityCount,
      customerServiceName: setup.customerServiceName,
      locationCustomerCount: setup.locationCustomerCount,
    }]);
  },
});
