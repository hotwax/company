import { computed } from "vue";
import { api, translate, useLiveEntity } from "@common";
import { serviceState } from "@common/db";
import { companyDb } from "@/db/companyDb";
import { NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN, NETSUITE_SHIPMENT_STEP_LIST_DOMAIN } from "@/config/appSyncConfig";
import { NETSUITE_SHIPMENT_STEP_ORDER, NETSUITE_SHIPMENT_STEPS, NETSUITE_SHIPMENT_SWITCH_ON_ORDER } from "@/config/netSuiteShipmentSteps";
import { useNetSuiteOrdersSwitch } from "@/composables/useNetSuiteOrdersSwitch";
import { useNetSuiteFlowSwitch } from "@/composables/useNetSuiteFlowSwitch";
import { resyncDomain } from "@/db/appDbSync";
import { downloadTextFile, getDownloadFileContent } from "@/utils";

const isFirstPassPending = () => !serviceState.syncedAt[NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN]
  && !serviceState.errors[NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN]
  && !serviceState.errors.__start;

export function useNetSuiteShipmentStepCounts(productStoreId: () => string, step: () => string) {
  const { first: counts, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteShipmentStepCounts,
    () => ({ equals: { productStoreId: productStoreId(), step: step() } }),
  );

  return {
    counts,
    isLoading: computed(() => !hydrated.value || (!counts.value && isFirstPassPending())),
    isOn: computed(() => counts.value?.isOn === "Y"),
  };
}

export function useNetSuiteShipmentStepList(productStoreId: () => string, step: () => string, list: () => string) {
  const { first: stepList, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteShipmentStepLists,
    () => ({ equals: { productStoreId: productStoreId(), step: step(), list: list() } }),
  );

  const loadError = computed(() => serviceState.errors[NETSUITE_SHIPMENT_STEP_LIST_DOMAIN]);

  return {
    loadError,
    stepList,
    isLoading: computed(() => !loadError.value && (!hydrated.value || !stepList.value)),
  };
}

export function useNetSuiteShipmentsSummary(productStoreId: () => string | undefined) {
  const { records: stepCounts, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteShipmentStepCounts,
    () => productStoreId() ? { equals: { productStoreId: productStoreId() } } : { filter: () => false },
  );

  const jobs = computed(() => stepCounts.value.filter((counts) => counts.jobName));

  const flowState = computed(() => {
    if (!jobs.value.length) return "no-jobs";
    const onCount = jobs.value.filter((counts) => counts.isOn === "Y").length;
    if (onCount === NETSUITE_SHIPMENT_STEP_ORDER.length) return "on";
    return onCount ? "partly-on" : "off";
  });

  const summaryParts = computed(() => {
    const failedCount = stepCounts.value.reduce((total, counts) => total + (counts.failedCount ?? 0), 0);
    const stuckStepCount = stepCounts.value.filter((counts) => counts.stuckCount).length;
    return [
      failedCount === 1 ? translate("1 shipment failed") : failedCount ? translate("{count} shipments failed", { count: failedCount }) : "",
      stuckStepCount === 1 ? translate("1 step has a stuck file") : stuckStepCount ? translate("{count} steps have a stuck file", { count: stuckStepCount }) : "",
    ].filter(Boolean);
  });

  return {
    isLoading: computed(() => !hydrated.value || !stepCounts.value.length),
    flowState,
    summary: computed(() => summaryParts.value.length ? summaryParts.value.join(" · ") : translate("No failures")),
    needsAttention: computed(() => summaryParts.value.length > 0),
  };
}

export async function downloadFileFailedRecords(file: { logId: string; configId: string }) {
  const response: any = await api({ url: "admin/dataManager/details", method: "GET", params: { logId: file.logId } });
  const errorLogContentId = response?.data?.dataManagerLogs?.[0]?.errorLogContentId;
  if (!errorLogContentId) throw new Error(translate("This file has no failed records file."));
  const errorFile: any = await api({ url: "admin/dataManager/downloadDataManagerFile", method: "GET", params: { configId: file.configId, logContentId: errorLogContentId } });
  const fileContent = getDownloadFileContent(errorFile?.data);
  if (!fileContent) throw new Error(translate("The failed records file is empty."));
  downloadTextFile(fileContent, `${file.logId}-failed-records.csv`);
}

const ORDERS_FLOW_DETAILS: Record<string, string> = {
  off: "The Orders flow is off. Sales orders must reach NetSuite first.",
  "partly-on": "Some steps of the Orders flow are off.",
  "no-jobs": "The store has no Orders flow jobs.",
};

export function useNetSuiteShipmentsSetupItems(productStoreId: () => string) {
  const { first: setup, hydrated } = useLiveEntity<any>(companyDb.tables.netSuiteShipmentsSetup, () => ({ equals: { flow: "shipmentsFromNetSuite" } }));
  const { records: stepCounts } = useLiveEntity<any>(
    companyDb.tables.netSuiteShipmentStepCounts,
    () => ({ equals: { productStoreId: productStoreId() } }),
  );
  const { flowState: ordersFlowState } = useNetSuiteOrdersSwitch(productStoreId);

  const stepsWithoutJob = computed(() => NETSUITE_SHIPMENT_STEP_ORDER
    .filter((step) => stepCounts.value.some((counts) => counts.step === step && !counts.jobName))
    .map((step) => translate(NETSUITE_SHIPMENT_STEPS[step].label)));

  const warehouseItem = computed(() => {
    const warehousesWithoutId: any[] = setup.value?.warehousesWithoutId ?? [];
    if (!setup.value?.warehouseCount) {
      return { state: "missing", detail: translate("No warehouse is in the NetSuite fulfillment facility group.") };
    }
    if (warehousesWithoutId.length) {
      return {
        state: "missing",
        detail: translate("No NetSuite location id: {warehouses}", { warehouses: warehousesWithoutId.map((warehouse) => warehouse.facilityName || warehouse.facilityId).join(", ") }),
      };
    }
    return { state: "done", detail: translate(setup.value.warehouseCount === 1 ? "1 warehouse" : "{count} warehouses", { count: setup.value.warehouseCount }) };
  });

  const carrierItem = computed(() => {
    const unmappedShipMethodIds: string[] = setup.value?.unmappedShipMethodIds ?? [];
    if (!setup.value?.readShipmentCount) return { state: "unknown", detail: translate("Checked once the flow has read shipments.") };
    if (!unmappedShipMethodIds.length) return { state: "done" };
    return {
      state: "missing",
      detail: translate("{count} shipments have no carrier. NetSuite ship methods with no carrier: {shipMethods}", {
        count: setup.value.shipmentsWithoutCarrierCount,
        shipMethods: unmappedShipMethodIds.join(", "),
      }),
    };
  });

  const oldFeedItem = computed(() => {
    const jobsOn: string[] = setup.value?.oldFeedJobNamesOn ?? [];
    if (jobsOn.length) return { state: "missing", detail: translate("Still on: {jobs}", { jobs: jobsOn.join(", ") }) };
    return { state: "done", detail: (setup.value?.oldFeedJobNames ?? []).length ? undefined : translate("No job imports the old file.") };
  });

  const setupItems = computed<any[]>(() => [
    {
      id: "orders-flow",
      label: "The Orders flow is on",
      state: ordersFlowState.value === "on" ? "done" : "missing",
      detail: ORDERS_FLOW_DETAILS[ordersFlowState.value] ? translate(ORDERS_FLOW_DETAILS[ordersFlowState.value]) : undefined,
    },
    { id: "warehouses", label: "Warehouses have NetSuite location ids", ...warehouseItem.value },
    { id: "carriers", label: "Ship methods have a carrier", ...carrierItem.value },
    {
      id: "jobs",
      label: "Each step has a job",
      state: stepCounts.value.length ? (stepsWithoutJob.value.length ? "missing" : "done") : "unknown",
      detail: stepsWithoutJob.value.length ? translate("No job: {steps}", { steps: stepsWithoutJob.value.join(", ") }) : undefined,
    },
    { id: "old-feed", label: "The old file feed is stopped", ...oldFeedItem.value },
  ]);

  return {
    isLoading: computed(() => !hydrated.value || !setup.value),
    setupItems,
  };
}

export function useNetSuiteShipmentsSwitch(productStoreId: () => string) {
  const { records: stepCounts, hydrated } = useLiveEntity<any>(
    companyDb.tables.netSuiteShipmentStepCounts,
    () => ({ equals: { productStoreId: productStoreId() } }),
  );

  const switchOnJobs = computed(() => NETSUITE_SHIPMENT_SWITCH_ON_ORDER.flatMap((step) => {
    const counts = stepCounts.value.find((row) => row.step === step);
    return counts?.jobName ? [{ jobName: counts.jobName, isOn: counts.isOn === "Y", isSharedByAllStores: NETSUITE_SHIPMENT_STEPS[step].isSharedByAllStores }] : [];
  }));

  const flowSwitch = useNetSuiteFlowSwitch(() => switchOnJobs.value, () => resyncDomain(NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN));

  return {
    isLoading: computed(() => !hydrated.value || !stepCounts.value.length),
    ...flowSwitch,
  };
}
