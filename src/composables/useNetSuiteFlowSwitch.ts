import { computed, ref } from "vue";
import { useServiceJob } from "@/composables/useServiceJobs";

export interface FlowJob {
  jobName: string;
  isOn: boolean;
  isSharedByAllStores: boolean;
}

export function useNetSuiteFlowSwitch(switchOnJobs: () => FlowJob[], resyncJobs: () => Promise<unknown>) {
  const { fetchJobAuditHistory, fetchUsernames, updateJob } = useServiceJob();

  const storeJobs = computed(() => switchOnJobs().filter((job) => !job.isSharedByAllStores));

  const flowState = computed(() => {
    if (!storeJobs.value.length) return "no-jobs";
    const onCount = storeJobs.value.filter((job) => job.isOn).length;
    if (onCount === storeJobs.value.length) return "on";
    return onCount ? "partly-on" : "off";
  });

  const jobsToSwitchOn = computed(() => switchOnJobs().filter((job) => !job.isOn));
  const jobsToPause = computed(() => storeJobs.value.filter((job) => job.isOn).reverse());

  const isChanging = ref(false);
  const lastChange = ref<{ isSwitchOn: boolean; changedDate: number; username: string } | undefined>();

  const loadLastChange = async () => {
    const pausedChanges = await Promise.all(storeJobs.value.map(async (job) => {
      const auditLogs = await fetchJobAuditHistory(job.jobName, { pageSize: 10, pageIndex: 0 });
      return auditLogs.find((auditLog: any) => auditLog.changedFieldName === "paused");
    }));
    const newestChange = pausedChanges
      .filter(Boolean)
      .sort((first: any, second: any) => Number(second.changedDate) - Number(first.changedDate))[0];
    if (!newestChange) {
      lastChange.value = undefined;
      return;
    }
    const usernames = await fetchUsernames([newestChange.changedByUserId]);
    lastChange.value = {
      isSwitchOn: newestChange.newValueText !== "Y",
      changedDate: Number(newestChange.changedDate),
      username: usernames[newestChange.changedByUserId] ?? newestChange.changedByUserId ?? "",
    };
  };

  const setPaused = async (jobs: FlowJob[], paused: "Y" | "N") => {
    isChanging.value = true;
    try {
      for (const job of jobs) {
        await updateJob({ jobName: job.jobName, paused });
      }
    } finally {
      await resyncJobs();
      isChanging.value = false;
    }
  };

  return {
    flowState,
    jobsToSwitchOn,
    jobsToPause,
    isChanging,
    lastChange,
    loadLastChange,
    switchOn: () => setPaused(jobsToSwitchOn.value, "N"),
    pause: () => setPaused(jobsToPause.value, "Y"),
  };
}
