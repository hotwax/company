import { commonUtil, translate } from "@common";
import type { NetSuiteStepRecord } from "@/config/netSuiteOrderSteps";

export const describeStepTries = (record: NetSuiteStepRecord): string => {
  if (record.attemptCount == null) return "";
  const tries = translate("Try {count} of {limit}", { count: record.attemptCount, limit: record.attemptLimit });
  if (!record.nextTryDate) return `${tries} · ${translate("No more automatic tries")}`;
  const nextTry = Number(record.nextTryDate) <= Date.now()
    ? translate("Due again on the job's next run")
    : translate("Next automatic try after {time}", { time: commonUtil.getDateAndTime(record.nextTryDate) });
  return `${tries} · ${nextTry}`;
};
