// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, onMounted, ref } from "vue";

/**
 * L3 — what the AWS page SHOWS for each state of the live queue list, and the intent an edit delegates.
 * The composable is mocked; the values on screen come from the real `@/utils/sqsQueue` formatting over
 * the fixture rows.
 */

// Refs are created in beforeEach: vi.hoisted runs before the vue import is initialised.
const harness = vi.hoisted(() => ({
  queues: undefined as any,
  hasLoaded: undefined as any,
  isLoading: undefined as any,
  loadError: undefined as any,
  fetch: vi.fn(),
  update: vi.fn(),
  alertCreate: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (cb: any) => onMounted(cb),
  alertController: { create: (...args: any[]) => harness.alertCreate(...args) },
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: (...args: any[]) => harness.showToast(...args) },
  logger: { error: vi.fn() },
  translate: (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

vi.mock("@/utils", () => ({
  getResponseErrorMessage: (error: any, fallback: string) => error?.message ?? fallback,
  hasError: () => false,
}));

vi.mock("@/composables/useAws", () => ({
  useAws: () => ({
    queues: computed(() => harness.queues.value),
    isLoading: harness.isLoading,
    hasLoaded: harness.hasLoaded,
    loadError: harness.loadError,
    fetchSqsConsumerQueues: harness.fetch,
    updateSqsQueueDelay: (...args: any[]) => harness.update(...args),
  }),
}));

const ORDER_QUEUE = {
  jobName: "consume_ShopifyOrders_SQS",
  description: "Consume Shopify Orders from SQS",
  serviceName: "co.hotwax.shopify.order.SqsOrderImport.consume#SQSOrderMessages",
  paused: true,
  queueName: "demo-oms-orders-updated.fifo",
  systemMessageRemoteId: "AWS_CONFIG",
  remoteSendUrl: "https://sqs.us-east-1.amazonaws.com/123456789012",
  configured: true,
  fifoQueue: true,
  delaySeconds: 300,
  visibilityTimeout: 30,
  messageRetentionPeriod: 345600,
  approximateNumberOfMessages: 4,
  approximateNumberOfMessagesNotVisible: 1,
  approximateNumberOfMessagesDelayed: 2,
  maxReceiveCount: 5,
  deadLetterTargetArn: "arn:aws:sqs:us-east-1:123456789012:demo-oms-orders-dlq.fifo",
};

async function mountView() {
  const Aws = (await import("@/views/Aws.vue")).default;
  const wrapper = mount(Aws, { global: { stubs: { IonMenuButton: true } } });
  await flushPromises();

  return wrapper;
}

describe("Aws page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.queues = ref<any[]>([]);
    harness.hasLoaded = ref(true);
    harness.isLoading = ref(false);
    harness.loadError = ref("");
    harness.fetch.mockResolvedValue([]);
    harness.update.mockResolvedValue({ delaySeconds: 120 });
    harness.alertCreate.mockResolvedValue({ present: vi.fn() });
  });

  it("fetches the live queue list on entry and shows a skeleton until the first load settles", async () => {
    harness.hasLoaded.value = false;
    const wrapper = await mountView();

    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(wrapper.find("ion-skeleton-text").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("No SQS consumer jobs");
  });

  it("explains the empty state when no consumer job exists", async () => {
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("No SQS consumer jobs");
  });

  it("shows the load error with a retry that refetches", async () => {
    harness.loadError.value = "Artifact group SOB_APP denied";
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("SQS queues could not load");
    expect(wrapper.text()).toContain("Artifact group SOB_APP denied");
    const retry = wrapper.findAll("ion-button").find((button) => button.text().trim() === "Retry")!;
    await retry.trigger("click");
    expect(harness.fetch).toHaveBeenCalledTimes(2);
  });

  it("renders a configured queue's live attributes in operator terms", async () => {
    harness.queues.value = [ORDER_QUEUE];
    const wrapper = await mountView();
    const card = wrapper.find("[data-testid='sqs-queue-consume_ShopifyOrders_SQS']");

    expect(card.text()).toContain("demo-oms-orders-updated.fifo");
    expect(card.text()).toContain("Paused");
    expect(card.text()).toContain("AWS_CONFIG");
    expect(card.text()).toContain("5 minutes");
    expect(card.text()).toContain("30 seconds");
    expect(card.text()).toContain("4 days");
    expect(card.text()).toContain("4 available, 1 in flight, 2 delayed");
    expect(card.text()).toContain("After 5 receives, to demo-oms-orders-dlq.fifo");
    expect(card.text()).toContain("FIFO");
  });

  it("shows the per-queue read error instead of attributes, and the setup hint for an unconfigured job", async () => {
    harness.queues.value = [
      { ...ORDER_QUEUE, error: "AWS remote AWS_CONFIG cannot be used: missing sendUrl" },
      { jobName: "consume_ShopifyProductDelete_SQS", serviceName: "x", paused: true, configured: false },
    ];
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("AWS remote AWS_CONFIG cannot be used: missing sendUrl");
    expect(wrapper.text()).not.toContain("Visibility timeout");
    expect(wrapper.text()).toContain("Queue not configured");
    expect(wrapper.text()).toContain("Set the queueName and systemMessageRemoteId parameters on this job to read its queue.");
  });

  it("opens the delay editor seeded with the current value and saves a valid whole number", async () => {
    harness.queues.value = [ORDER_QUEUE];
    const wrapper = await mountView();

    await wrapper.find("[data-testid='edit-delay-consume_ShopifyOrders_SQS']").trigger("click");
    await flushPromises();

    expect(harness.alertCreate).toHaveBeenCalledTimes(1);
    const options = harness.alertCreate.mock.calls[0][0];
    expect(options.inputs[0]).toMatchObject({ name: "delaySeconds", type: "number", min: 0, max: 900, value: "300" });

    const save = options.buttons.find((button: any) => button.text === "Save");
    expect(save.handler({ delaySeconds: "12.5" })).toBe(false);
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.showToast).toHaveBeenCalledWith("Enter a whole number of seconds from 0 to 900.");

    expect(save.handler({ delaySeconds: "120" })).toBe(true);
    await flushPromises();
    expect(harness.update).toHaveBeenCalledWith(
      { systemMessageRemoteId: "AWS_CONFIG", queueName: "demo-oms-orders-updated.fifo" },
      120,
    );
    expect(harness.showToast).toHaveBeenCalledWith("Delivery delay set to 120 seconds.");
  });

  it("surfaces the server's message when the write fails", async () => {
    harness.queues.value = [ORDER_QUEUE];
    harness.update.mockRejectedValue(new Error("SQS queue demo-oms-orders-updated.fifo could not be updated: AccessDenied"));
    const wrapper = await mountView();

    await wrapper.find("[data-testid='edit-delay-consume_ShopifyOrders_SQS']").trigger("click");
    await flushPromises();
    const save = harness.alertCreate.mock.calls[0][0].buttons.find((button: any) => button.text === "Save");
    save.handler({ delaySeconds: "60" });
    await flushPromises();
    await flushPromises();

    expect(harness.showToast).toHaveBeenCalledWith("SQS queue demo-oms-orders-updated.fifo could not be updated: AccessDenied");
  });
});
