/**
 * Pure helpers for the AWS page: the shape `sob/shopify/sqsQueues` returns and the two conversions the
 * page needs around a queue's delivery delay. No reactivity, no I/O, so they are unit-tested directly.
 */

import { translate } from "@common";

/** The live attributes `GET sob/shopify/sqsQueues/attributes` returns for one queue. */
export type SqsQueueAttributes = {
  queueUrl?: string;
  queueArn?: string;
  fifoQueue?: boolean;
  delaySeconds?: number;
  visibilityTimeout?: number;
  messageRetentionPeriod?: number;
  receiveMessageWaitTimeSeconds?: number;
  approximateNumberOfMessages?: number;
  approximateNumberOfMessagesNotVisible?: number;
  approximateNumberOfMessagesDelayed?: number;
  maxReceiveCount?: number;
  deadLetterTargetArn?: string;
};

/** One SQS consumer job and, when configured and readable, its queue's attributes. */
export type SqsConsumerQueue = SqsQueueAttributes & {
  jobName: string;
  description?: string;
  serviceName: string;
  paused: boolean;
  cronExpression?: string;
  queueName?: string;
  systemMessageRemoteId?: string;
  shopifyShopSystemMessageRemoteId?: string;
  remoteDescription?: string;
  remoteSendUrl?: string;
  /** Both queueName and systemMessageRemoteId are set on the job. */
  configured: boolean;
  /** Server text explaining why the queue could not be read; absent when attributes are present. */
  error?: string;
};

export type SqsQueueTarget = { systemMessageRemoteId: string; queueName: string };

/** SQS caps a queue's delivery delay at 15 minutes. */
export const MAX_DELAY_SECONDS = 900;

/** A whole number of seconds within SQS's 0 to 900 range, or null when the input is not one. */
export const parseDelaySeconds = (input: unknown): number | null => {
  const text = String(input ?? "").trim();
  if(!/^\d+$/.test(text)) {return null;}
  const value = Number(text);

  return value <= MAX_DELAY_SECONDS ? value : null;
};

/** Seconds as the largest exact unit: 345600 reads "4 days", 90 stays "90 seconds". */
export const formatSeconds = (seconds?: number | null): string => {
  if(seconds === undefined || seconds === null || Number.isNaN(seconds)) {return translate("Unknown");}
  const units: Array<[number, string, string]> = [
    [86400, "1 day", "{count} days"],
    [3600, "1 hour", "{count} hours"],
    [60, "1 minute", "{count} minutes"],
  ];
  for(const [size, singular, plural] of units) {
    if(seconds >= size && seconds % size === 0) {
      const count = seconds / size;

      return count === 1 ? translate(singular) : translate(plural, { count });
    }
  }

  return seconds === 1 ? translate("1 second") : translate("{count} seconds", { count: seconds });
};

/** The last ARN segment is the queue name; the account and region are noise on a card. */
export const queueNameFromArn = (arn?: string): string => (arn ? arn.substring(arn.lastIndexOf(":") + 1) : "");
