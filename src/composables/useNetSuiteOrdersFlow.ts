import { computed } from "vue";
import { api, translate, useLiveEntity } from "@common";
import { serviceState } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { NETSUITE_ORDERS_KEY_DATES_DOMAIN, NETSUITE_ORDERS_SETUP_DOMAIN, NETSUITE_ORDERS_SETUP_LIST_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN } from "@/config/appSyncConfig";
import { resyncDomain } from "@/db/appDbSync";
import { NETSUITE_ORDER_STEP_ORDER, NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";
import { CUSTOMER_POLICIES, NETSUITE_ORDERS_SETUP_LISTS, usesLocationCustomer } from "@/config/netSuiteOrdersSetup";
import type { NetSuiteRuleFilter } from "@/config/netSuiteRules";
import type { NetSuiteOrdersSetupList } from "@/config/netSuiteOrdersSetup";

export function useNetSuiteStepCounts(productStoreId: () => string | undefined, step: () => string) {
  const { first: counts, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteStepCounts,
    () => productStoreId() ? { equals: { productStoreId: productStoreId(), step: step() } } : { filter: () => false },
  );

  const isFirstPassPending = computed(() =>
    !serviceState.syncedAt[NETSUITE_STEP_COUNTS_DOMAIN]
    && !serviceState.errors[NETSUITE_STEP_COUNTS_DOMAIN]
    && !serviceState.errors.__start);

  return {
    counts,
    isLoading: computed(() => !hydrated.value || (!counts.value && isFirstPassPending.value)),
    isOn: computed(() => counts.value?.isOn === "Y"),
  };
}

export function useNetSuiteOrdersSummary(productStoreId: () => string | undefined) {
  const storeFilter = () => productStoreId() ? { equals: { productStoreId: productStoreId() } } : { filter: () => false };

  const { records: stepCounts, hydrated: stepCountsHydrated } = useLiveEntity<any>(companyDb.tables.netSuiteStepCounts, storeFilter);
  const { records: sendingCounts, hydrated: sendingCountsHydrated } = useLiveEntity<any>(companyDb.tables.netSuiteSendingCounts);
  const { first: setup, hydrated: setupHydrated } = useLiveEntity<any>(companyDb.tables.netSuiteOrdersSetup, storeFilter);

  const isLoading = computed(() => !stepCountsHydrated.value || !sendingCountsHydrated.value || !setupHydrated.value || !stepCounts.value.length);

  const summaryParts = computed(() => {
    const failedStepCount = NETSUITE_ORDER_STEP_ORDER
      .filter((step) => stepCounts.value.some((counts) => counts.step === step && counts.failedCount)).length;
    const batchErrorCount = sendingCounts.value.reduce((total, counts) => total + (counts.errorCount ?? 0), 0);
    const missingProductCount = setup.value?.productCount ?? 0;

    return [
      failedStepCount ? translate("{count} of {total} steps have failures", { count: failedStepCount, total: NETSUITE_ORDER_STEP_ORDER.length }) : "",
      batchErrorCount === 1 ? translate("1 batch in error") : batchErrorCount ? translate("{count} batches in error", { count: batchErrorCount }) : "",
      missingProductCount === 1 ? translate("1 product has no NetSuite id") : missingProductCount ? translate("{count} products have no NetSuite id", { count: missingProductCount }) : "",
    ].filter(Boolean);
  });

  return {
    isLoading,
    summary: computed(() => summaryParts.value.length ? summaryParts.value.join(" · ") : translate("No failures")),
    needsAttention: computed(() => summaryParts.value.length > 0),
  };
}

export function useNetSuiteOrdersSetupItems(productStoreId: () => string) {
  const { first: setup, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteOrdersSetup,
    () => ({ equals: { productStoreId: productStoreId() } }),
  );

  const { records: stepCounts } = useLiveEntity<any>(
    companyDb.tables.netSuiteStepCounts,
    () => ({ equals: { productStoreId: productStoreId() } }),
  );

  const countItem = (list: string) => {
    const setupList = NETSUITE_ORDERS_SETUP_LISTS[list];
    const missingCount = setup.value?.[setupList.countField] as number | undefined;
    if (!setup.value?.goLiveDate || missingCount == null) {
      return { id: list, label: setupList.label, state: "unknown", detail: translate("Needs the go-live date.") };
    }
    return {
      id: list,
      label: setupList.label,
      state: missingCount ? "missing" : "done",
      missingCount,
      listPath: `/netsuite/stores/${productStoreId()}/orders/setup/${list}`,
    };
  };

  const isLocationCustomer = computed(() => usesLocationCustomer(setup.value));

  const stepsWithoutJob = computed(() => NETSUITE_ORDER_STEP_ORDER
    .filter((step) => !(step === "customer" && isLocationCustomer.value))
    .filter((step) => stepCounts.value.some((counts) => counts.step === step && !counts.jobName))
    .map((step) => translate(NETSUITE_ORDER_STEPS[step].label)));

  const setupItems = computed<any[]>(() => [
    countItem("products"),
    countItem("facilities"),
    isLocationCustomer.value ? countItem("location-customers") : {
      id: "location-customers",
      label: NETSUITE_ORDERS_SETUP_LISTS["location-customers"].label,
      state: "not-used",
      detail: translate("Used only when each selling location has a common NetSuite customer."),
    },
    {
      id: "go-live",
      label: "The go-live date is set",
      state: setup.value?.goLiveDate ? "done" : "missing",
    },
    {
      id: "jobs",
      label: "The store has a job for each step",
      state: stepCounts.value.length ? (stepsWithoutJob.value.length ? "missing" : "done") : "unknown",
      detail: stepsWithoutJob.value.length ? translate("No job: {steps}", { steps: stepsWithoutJob.value.join(", ") }) : undefined,
    },
  ]);

  return {
    isLoading: computed(() => !hydrated.value || !setup.value),
    setupItems,
    missingItems: computed(() => setupItems.value.filter((item) => item.state === "missing" || item.state === "unknown")),
  };
}

export function useNetSuiteCustomerPolicy(productStoreId: () => string | undefined) {
  const { first: setup } = useLiveEntity<any>(
    companyDb.tables.netSuiteOrdersSetup,
    () => productStoreId() ? { equals: { productStoreId: productStoreId() } } : { filter: () => false },
  );
  const policy = computed(() => CUSTOMER_POLICIES.find((policy) => policy.customerServiceName === setup.value?.customerServiceName));

  async function savePolicy(customerServiceName: string) {
    await api({ url: "netsuite/customerPolicy", method: "put", data: { productStoreId: productStoreId(), customerServiceName } });
    await Promise.all([NETSUITE_ORDERS_SETUP_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN, NETSUITE_ORDERS_KEY_DATES_DOMAIN].map((domain) => resyncDomain(domain)));
  }

  return {
    usesLocationCustomer: computed(() => usesLocationCustomer(setup.value)),
    customerServiceName: computed(() => setup.value?.customerServiceName as string | undefined),
    policyLabel: computed(() => policy.value?.label ?? setup.value?.customerServiceName),
    savePolicy,
  };
}

export async function moveFlowGoLiveDate(ruleGroupId: string, dateFieldName: string, goLiveDate: string, changeReason: string) {
  const moved: any = (await api({ url: "netsuite/flowGoLive", method: "put", data: { ruleGroupId, dateFieldName, goLiveDate, changeReason } }) as any).data;
  await Promise.all([NETSUITE_ORDERS_KEY_DATES_DOMAIN, NETSUITE_ORDERS_SETUP_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN].map((domain) => resyncDomain(domain)));
  return moved;
}

export async function getRuleGroupFields(ruleGroupId: string) {
  const fields: any = (await api({ url: "netsuite/rules/fields", method: "get", params: { ruleGroupId } }) as any).data;
  return (fields?.fields ?? []) as { fieldName: string; fieldType: string }[];
}

export async function saveNetSuiteRule(rule: { ruleId: string; isActive: boolean; filters: NetSuiteRuleFilter[]; goLiveDateFieldName: string; changeReason: string }) {
  await api({ url: "netsuite/rules", method: "put", data: rule });
  await Promise.all([NETSUITE_ORDERS_KEY_DATES_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN, NETSUITE_ORDERS_SETUP_DOMAIN].map((domain) => resyncDomain(domain)));
}

export async function askNetSuiteBySku(productIds: string[]) {
  const asked: any = (await api({ url: "netsuite/ordersSetup/products/netSuiteLookup", method: "post", data: { productIds } }) as any).data;
  return (asked?.productLookups ?? []) as { productId: string; sku: string; netsuiteProductIds: string[] }[];
}

export async function refreshSetupLists() {
  await Promise.all([resyncDomain(NETSUITE_ORDERS_SETUP_LIST_DOMAIN), resyncDomain(NETSUITE_ORDERS_SETUP_DOMAIN)]);
}

export async function saveSetupListNetSuiteId(addNetSuiteId: NonNullable<NetSuiteOrdersSetupList["addNetSuiteId"]>, recordId: string, netSuiteId: string) {
  const saved: any = (await api({
    url: addNetSuiteId.urlPath,
    method: "put",
    data: { [addNetSuiteId.recordIdField]: recordId, [addNetSuiteId.netSuiteIdField]: netSuiteId },
  }) as any).data;
  await Promise.all([resyncDomain(NETSUITE_ORDERS_SETUP_LIST_DOMAIN), resyncDomain(NETSUITE_ORDERS_SETUP_DOMAIN)]);
  return saved;
}
