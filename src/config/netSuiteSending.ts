export interface NetSuiteSendingWay {
  way: string;
  label: string;
  sendJobLabel: string;
  pollJobLabel: string;
  parentSystemMessageTypeId: string;
}

export interface NetSuiteSendingList {
  list: string;
  label: string;
  countField: string;
  color: string;
  title: string;
  titleOne: string;
  meaning: string;
}

export const NETSUITE_SENDING_WAYS: NetSuiteSendingWay[] = [
  { way: "rest-batch", label: "REST batch", sendJobLabel: "Send REST batch", pollJobLabel: "Poll REST batch", parentSystemMessageTypeId: "NetSuiteAsyncBatch" },
  { way: "script-task", label: "Script task", sendJobLabel: "Send RESTlet batch", pollJobLabel: "Poll RESTlet batch", parentSystemMessageTypeId: "NetSuiteScriptTask" },
];

export const NETSUITE_SENDING_LISTS: NetSuiteSendingList[] = [
  {
    list: "waiting-to-send",
    label: "Waiting to send",
    countField: "waitingToSendCount",
    color: "warning",
    title: "{count} batches waiting to send",
    titleOne: "1 batch waiting to send",
    meaning: "Made by a step, not yet given to NetSuite. The send job sends them on its next run. Oldest first.",
  },
  {
    list: "waiting-for-answer",
    label: "No answer >1 day",
    countField: "waitingForAnswerCount",
    color: "warning",
    title: "{count} batches with no answer for over a day",
    titleOne: "1 batch with no answer for over a day",
    meaning: "Sent to NetSuite more than one day ago, and NetSuite's answer is not read yet. The poll job asks again on every run. Oldest first.",
  },
  {
    list: "error",
    label: "Error",
    countField: "errorCount",
    color: "danger",
    title: "{count} batches in error",
    titleOne: "1 batch in error",
    meaning: "The send gave up after its tries, or NetSuite failed the task. Nothing sends these again on its own, so their records stay stuck. Newest first.",
  },
];

export const findNetSuiteSendingWay = (way: string) => NETSUITE_SENDING_WAYS.find((sendingWay) => sendingWay.way === way);
export const findNetSuiteSendingList = (list: string) => NETSUITE_SENDING_LISTS.find((sendingList) => sendingList.list === list);
