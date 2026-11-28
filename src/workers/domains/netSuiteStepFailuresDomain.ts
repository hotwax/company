import { companyDb } from "@/db/companyDb";
import { NETSUITE_STEP_FAILURES_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteStepFailuresEntity = companyDb.entity(companyDb.tables.netSuiteStepFailures);

export interface NetSuiteStepFailuresArgs {
  productStoreId?: string;
  step?: string;
  selectedErrorMessage?: string;
  limit?: number;
}

export const netSuiteStepFailuresDomain = defineSyncDomain({
  name: NETSUITE_STEP_FAILURES_DOMAIN,
  table: companyDb.tables.netSuiteStepFailures,
  label: "NetSuite step failures",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx, args: NetSuiteStepFailuresArgs = {}) {
    const productStoreId = String(args.productStoreId ?? "").trim();
    const orderStep = NETSUITE_ORDER_STEPS[String(args.step ?? "")];
    if (!productStoreId || !orderStep) return 0;
    const selectedErrorMessage = args.selectedErrorMessage ?? "";

    const params: Record<string, unknown> = { ...orderStep.stepParams, productStoreId, pageSize: args.limit ?? NETSUITE_STEP_LIST_PAGE };
    if (selectedErrorMessage) params.errorMessage = selectedErrorMessage;

    const url = `${orderStep.urlBase}/failures`;
    const response = await workerGet(ctx, url, params);
    if (!Array.isArray(response?.failures) || !Array.isArray(response?.errorGroups)) {
      throw new Error(`${url} gave no failures list for product store ${productStoreId}`);
    }

    return netSuiteStepFailuresEntity.upsertMany([{
      productStoreId,
      step: orderStep.step,
      selectedErrorMessage,
      failureCount: response.failureCount,
      failures: response.failures.map(orderStep.toRecord),
      errorGroups: response.errorGroups.map((group: any) => ({
        errorMessage: group.errorMessage,
        recordCount: group[orderStep.recordCountKey],
      })),
    }]);
  },
});
