import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L1 unit — what the AWS composable RESOLVES TO and SENDS.
 *
 * `api()` returns the axios envelope, so the queue list lives at `.data.queues` and the attributes a
 * write returns at `.data`. These tests pin the URLs and verbs the connector exposes
 * (`sob/shopify/sqsQueues`, `PUT sob/shopify/sqsQueues/attributes`), that a successful write is folded
 * into the matching row (so the page reflects AWS without a refetch). The pure helpers the page leans on
 * are covered in tests/utils/sqsQueue.spec.ts.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

const ORDER_QUEUE = {
  jobName: "consume_ShopifyOrders_SQS",
  description: "Consume Shopify Orders from SQS",
  serviceName: "co.hotwax.shopify.order.SqsOrderImport.consume#SQSOrderMessages",
  paused: false,
  cronExpression: "0 * * * * ?",
  queueName: "demo-oms-orders-updated.fifo",
  systemMessageRemoteId: "AWS_CONFIG",
  remoteSendUrl: "https://sqs.us-east-1.amazonaws.com/123456789012",
  configured: true,
  fifoQueue: true,
  delaySeconds: 0,
  visibilityTimeout: 30,
  messageRetentionPeriod: 345600,
  approximateNumberOfMessages: 4,
  approximateNumberOfMessagesNotVisible: 1,
  approximateNumberOfMessagesDelayed: 0,
};

const UNCONFIGURED_QUEUE = {
  jobName: "consume_ShopifyProductDelete_SQS",
  serviceName: "co.hotwax.shopify.product.SqsProductImport.consume#ShopifyProductDeleteSQS",
  paused: true,
  configured: false,
};

function loadComposable() {
  return import("@/composables/useAws");
}

describe("fetchSqsConsumerQueues", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.api.mockReset();
  });

  it("reads the queue list out of the axios envelope and marks the first load done", async () => {
    harness.api.mockResolvedValue({ data: { queues: [ORDER_QUEUE, UNCONFIGURED_QUEUE] } });
    const aws = await loadComposable();
    const { queues, hasLoaded, loadError } = aws.useAws();

    expect(hasLoaded.value).toBe(false);
    const result = await aws.useAws().fetchSqsConsumerQueues();

    expect(harness.api).toHaveBeenCalledWith({ url: "sob/shopify/sqsQueues", method: "get" });
    expect(result.map((queue) => queue.jobName)).toEqual([ORDER_QUEUE.jobName, UNCONFIGURED_QUEUE.jobName]);
    expect(queues.value).toHaveLength(2);
    expect(hasLoaded.value).toBe(true);
    expect(loadError.value).toBe("");
  });

  it("keeps the server's error text and an empty list when the request fails", async () => {
    harness.api.mockRejectedValue({ response: { data: { errors: "Artifact group SOB_APP denied" } } });
    const aws = await loadComposable();
    const { queues, hasLoaded, loadError } = aws.useAws();

    await aws.useAws().fetchSqsConsumerQueues();

    expect(queues.value).toEqual([]);
    expect(hasLoaded.value).toBe(true);
    expect(loadError.value).toBe("Artifact group SOB_APP denied");
  });
});

describe("updateSqsQueueDelay", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.api.mockReset();
  });

  it("PUTs the target queue and delay, then folds the returned attributes into that row", async () => {
    harness.api
      .mockResolvedValueOnce({ data: { queues: [{ ...ORDER_QUEUE, error: "stale" }, UNCONFIGURED_QUEUE] } })
      .mockResolvedValueOnce({ data: { delaySeconds: 300, visibilityTimeout: 30, approximateNumberOfMessagesDelayed: 2 } });
    const aws = await loadComposable();
    await aws.useAws().fetchSqsConsumerQueues();

    const attributes = await aws.useAws().updateSqsQueueDelay(
      { systemMessageRemoteId: "AWS_CONFIG", queueName: "demo-oms-orders-updated.fifo" },
      300,
    );

    expect(harness.api).toHaveBeenLastCalledWith({
      url: "sob/shopify/sqsQueues/attributes",
      method: "put",
      data: { systemMessageRemoteId: "AWS_CONFIG", queueName: "demo-oms-orders-updated.fifo", delaySeconds: 300 },
    });
    expect(attributes.delaySeconds).toBe(300);
    const row = aws.useAws().queues.value.find((queue) => queue.jobName === ORDER_QUEUE.jobName)!;
    expect(row.delaySeconds).toBe(300);
    expect(row.approximateNumberOfMessagesDelayed).toBe(2);
    expect(row.error).toBeUndefined();
    expect(aws.useAws().queues.value[1]).toEqual(UNCONFIGURED_QUEUE);
  });

  it("throws the payload-level error a 200 can still carry", async () => {
    harness.api.mockResolvedValue({ data: { _ERROR_MESSAGE_: "Queue does not exist", errors: "Queue does not exist" } });
    const aws = await loadComposable();

    await expect(aws.useAws().updateSqsQueueDelay({ systemMessageRemoteId: "AWS_CONFIG", queueName: "missing" }, 10))
      .rejects.toThrow("Queue does not exist");
  });
});
