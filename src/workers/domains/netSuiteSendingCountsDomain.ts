import { companyDb } from "@/db/companyDb";
import { NETSUITE_SENDING_COUNTS_DOMAIN } from "@/config/appSyncConfig";
import { NETSUITE_SENDING_WAYS } from "@/config/netSuiteSending";
import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerGet } from "@common/core/workerRemoteApi";

const netSuiteSendingCountsEntity = companyDb.entity(companyDb.tables.netSuiteSendingCounts);

export const netSuiteSendingCountsDomain = defineSyncDomain({
  name: NETSUITE_SENDING_COUNTS_DOMAIN,
  table: companyDb.tables.netSuiteSendingCounts,
  label: "NetSuite sending counts",
  syncClass: "A",
  intervalMs: 60_000,
  async sync(ctx) {
    const url = "netsuite/batchMessages/counts";
    const wayCounts = await Promise.all(NETSUITE_SENDING_WAYS.map(async ({ way, parentSystemMessageTypeId }) => {
      const counts = await workerGet(ctx, url, { parentSystemMessageTypeId });
      if (typeof counts?.sendIsOn !== "boolean" || typeof counts?.pollIsOn !== "boolean") {
        throw new Error(`${url} gave no job state for ${parentSystemMessageTypeId}`);
      }
      return {
        way,
        sendJobName: counts.sendJobName,
        sendIsOn: counts.sendIsOn ? "Y" : "N",
        sendLastRunTime: counts.sendLastRunTime,
        pollJobName: counts.pollJobName,
        pollIsOn: counts.pollIsOn ? "Y" : "N",
        pollLastRunTime: counts.pollLastRunTime,
        waitingToSendCount: counts.waitingToSendCount,
        waitingForAnswerCount: counts.waitingForAnswerCount,
        errorCount: counts.errorCount,
      };
    }));

    return netSuiteSendingCountsEntity.upsertMany(wayCounts);
  },
});
