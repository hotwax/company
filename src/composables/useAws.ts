/**
 * AWS — the Amazon SQS queues the real-time Shopify consumers poll, read live from AWS.
 *
 * Deliberately no cached domain: delivery delay, visibility timeout and message counts are AWS-side
 * state that changes outside the OMS, so every read is a live fetch into module-level state (the
 * `useKlaviyo` shape). The backend reads each queue through the consumer job's AWS
 * SystemMessageRemote, so the page shows what the queue really has rather than what the OMS remembers.
 * Types and the pure conversions live in `@/utils/sqsQueue`.
 */

import { api, logger, translate } from "@common";
import { computed, reactive } from "vue";
import { getResponseErrorMessage, hasError } from "@/utils";
import type { SqsConsumerQueue, SqsQueueAttributes, SqsQueueTarget } from "@/utils/sqsQueue";
import { onSessionCleared } from "./sessionScope";

type FetchStatus = "none" | "pending" | "success" | "error";

const state = reactive({
  queues: [] as SqsConsumerQueue[],
  status: "none" as FetchStatus,
  /** False until the first fetch settles; keeps the skeleton to the first visit only. */
  hasLoaded: false,
  loadError: "",
});

// Module state survives an SPA logout; without this user B would see user A's queues.
onSessionCleared(() => {
  state.queues = [];
  state.status = "none";
  state.hasLoaded = false;
  state.loadError = "";
});

async function fetchSqsConsumerQueues(): Promise<SqsConsumerQueue[]> {
  state.status = "pending";
  try {
    const resp: any = await api({ url: "sob/shopify/sqsQueues", method: "get" });
    if(hasError(resp)) {throw new Error(getResponseErrorMessage(resp, translate("Failed to load SQS queues.")));}
    state.queues = Array.isArray(resp?.data?.queues) ? resp.data.queues : [];
    state.loadError = "";
    state.status = "success";
  } catch (error) {
    logger.error(error);
    state.queues = [];
    state.loadError = getResponseErrorMessage(error, translate("Failed to load SQS queues."));
    state.status = "error";
  } finally {
    state.hasLoaded = true;
  }

  return state.queues;
}

/**
 * Sets the queue's delivery delay on AWS and folds the attributes AWS holds afterwards into the
 * matching row, so the page reflects the write without a second round trip.
 */
async function updateSqsQueueDelay(target: SqsQueueTarget, delaySeconds: number): Promise<SqsQueueAttributes> {
  const resp: any = await api({
    url: "sob/shopify/sqsQueues/attributes",
    method: "put",
    data: { ...target, delaySeconds },
  });
  if(hasError(resp)) {throw new Error(getResponseErrorMessage(resp, translate("Failed to update the delivery delay.")));}
  const attributes = (resp?.data ?? {}) as SqsQueueAttributes;
  const row = state.queues.find((queue) => queue.systemMessageRemoteId === target.systemMessageRemoteId && queue.queueName === target.queueName,);
  if(row) {
    Object.assign(row, attributes);
    delete row.error;
  }

  return attributes;
}

export function useAws() {
  return {
    queues: computed(() => state.queues),
    isLoading: computed(() => state.status === "pending"),
    hasLoaded: computed(() => state.hasLoaded),
    loadError: computed(() => state.loadError),
    fetchSqsConsumerQueues,
    updateSqsQueueDelay,
  };
}
