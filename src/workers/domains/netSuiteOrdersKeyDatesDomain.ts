import { companyDb } from "@/db/companyDb";
import { NETSUITE_ORDERS_KEY_DATES_DOMAIN } from "@/config/appSyncConfig";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteOrdersKeyDatesEntity = companyDb.entity(companyDb.tables.netSuiteOrdersKeyDates);

export interface NetSuiteOrdersKeyDatesArgs {
  productStoreId?: string;
}

export const netSuiteOrdersKeyDatesDomain = defineSyncDomain({
  name: NETSUITE_ORDERS_KEY_DATES_DOMAIN,
  table: companyDb.tables.netSuiteOrdersKeyDates,
  label: "NetSuite orders key dates",
  syncClass: "A",
  intervalMs: 300_000,
  async sync(ctx, args: NetSuiteOrdersKeyDatesArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    if (!productStoreId) return 0;

    const url = "netsuite/ordersKeyDates";
    const keyDates = await workerGet(ctx, url, { productStoreId });
    if (!Array.isArray(keyDates?.orderRules) || !Array.isArray(keyDates?.paymentRules)) {
      throw new Error(`${url} gave no rules for product store ${productStoreId}`);
    }

    return netSuiteOrdersKeyDatesEntity.upsertMany([{ productStoreId, ...keyDates }]);
  },
});
