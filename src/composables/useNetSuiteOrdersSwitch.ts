import { computed } from "vue";
import { useLiveEntity } from "@common";
import { companyDb } from "@/db/companyDb";
import { resyncDomain } from "@/db/appDbSync";
import { type FlowJob, useNetSuiteFlowSwitch } from "@/composables/useNetSuiteFlowSwitch";
import { NETSUITE_SENDING_COUNTS_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN } from "@/config/appSyncConfig";
import { NETSUITE_ORDER_STEPS, NETSUITE_ORDERS_SWITCH_ON_ORDER } from "@/config/netSuiteOrderSteps";
import { NETSUITE_SENDING_WAYS } from "@/config/netSuiteSending";
import { useNetSuiteCustomerPolicy } from "@/composables/useNetSuiteOrdersFlow";

export function useNetSuiteOrdersSwitch(productStoreId: () => string) {
  const { records: stepCounts, hydrated: stepCountsHydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteStepCounts,
    () => ({ equals: { productStoreId: productStoreId() } }),
  );
  const { records: sendingCounts, hydrated: sendingCountsHydrated } = useLiveEntity<any>(companyDb.tables.netSuiteSendingCounts);

  const sendingJobs = computed<FlowJob[]>(() => NETSUITE_SENDING_WAYS.flatMap(({ way }) => {
    const counts = sendingCounts.value.find((row) => row.way === way);
    return [
      { jobName: counts?.sendJobName, isOn: counts?.sendIsOn === "Y", isSharedByAllStores: true },
      { jobName: counts?.pollJobName, isOn: counts?.pollIsOn === "Y", isSharedByAllStores: true },
    ].filter((job) => job.jobName);
  }));

  const { usesLocationCustomer } = useNetSuiteCustomerPolicy(productStoreId);

  const stepJobs = computed<FlowJob[]>(() => NETSUITE_ORDERS_SWITCH_ON_ORDER
    .filter((step) => !(step === "customer" && usesLocationCustomer.value))
    .flatMap((step) => {
      const counts = stepCounts.value.find((row) => row.step === step);
      return counts?.jobName
        ? [{ jobName: counts.jobName, isOn: counts.isOn === "Y", isSharedByAllStores: !!NETSUITE_ORDER_STEPS[step].isSharedByAllStores }]
        : [];
    }));

  const switchOnJobs = computed(() => [...new Map([...sendingJobs.value, ...stepJobs.value].map((job) => [job.jobName, job])).values()]);

  const flowSwitch = useNetSuiteFlowSwitch(
    () => switchOnJobs.value,
    () => Promise.all([resyncDomain(NETSUITE_STEP_COUNTS_DOMAIN), resyncDomain(NETSUITE_SENDING_COUNTS_DOMAIN)]),
  );

  return {
    isLoading: computed(() => !stepCountsHydrated.value || !sendingCountsHydrated.value || !stepCounts.value.length),
    ...flowSwitch,
  };
}
