// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ShopifyOrderSync from "./ShopifyOrderSync.vue";

const shopifyOrderSyncSource = readFileSync(`${process.cwd()}/src/views/ShopifyOrderSync.vue`, "utf8");

const mocks = vi.hoisted(() => ({
  store: undefined as any,
  manualRefresh: vi.fn().mockResolvedValue(undefined),
  downloadTextFile: vi.fn(),
  alertRole: "confirm",
  fetchLogDetails: vi.fn(),
  downloadDataManagerFile: vi.fn(),
  dataManagerErrorLogs: [] as any[],
  showToast: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: {
    showToast: (...args: unknown[]) => mocks.showToast(...args),
  },
  translate: (key: string, values?: Record<string, unknown>) => Object.entries(values || {})
    .reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

vi.mock("@/utils", () => ({
  downloadTextFile: (...args: unknown[]) => mocks.downloadTextFile(...args),
  formatDateTime: (value: unknown) => String(value || ""),
  getDownloadFileContent: (data: any) => {
    const fileContent = data?.csvData ?? data?.fileData ?? data?.data ?? data;
    if (typeof fileContent === "string") return fileContent;
    if (fileContent === undefined || fileContent === null) return "";
    return JSON.stringify(fileContent);
  },
}));

vi.mock("@/composables/useDataManagerLog", async () => {
  const { ref: vueRef } = await vi.importActual<typeof import("vue")>("vue");
  return {
    useDataManagerLog: () => ({
      errorLogs: vueRef(mocks.dataManagerErrorLogs),
      fetchLogDetails: (...args: unknown[]) => mocks.fetchLogDetails(...args),
      downloadDataManagerFile: (...args: unknown[]) => mocks.downloadDataManagerFile(...args),
    }),
  };
});

vi.mock("@/store/shopifyOrderSync", () => ({
  useShopifyOrderSyncStore: () => mocks.store,
}));

vi.mock("@/composables/useShopifyOrderSyncPolling", () => ({
  useShopifyOrderSyncPolling: () => ({
    isRefreshing: ref(false),
    isPageActive: ref(true),
    manualRefresh: mocks.manualRefresh,
  }),
}));

vi.mock("@ionic/vue", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>("vue");
  const container = (tag = "div") => defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });
  const datetime = defineComponent({
    inheritAttrs: false,
    props: { modelValue: String },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
      return () => h("input", {
        ...attrs,
        "data-datetime": "true",
        value: props.modelValue,
        onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
      });
    },
  });
  return {
    IonAccordion: container(),
    IonAccordionGroup: container(),
    IonBackButton: container("a"),
    IonDatetime: datetime,
    IonDatetimeButton: container("button"),
    IonFooter: container("footer"),
    IonPopover: container(),
    IonBadge: container("span"),
    IonButton: container("button"),
    IonButtons: container(),
    IonCard: container("section"),
    IonCardContent: container(),
    IonCardHeader: container("header"),
    IonCardSubtitle: container("p"),
    IonCardTitle: container("h2"),
    IonChip: container(),
    IonContent: container("main"),
    IonFab: container(),
    IonFabButton: container("button"),
    IonHeader: container("header"),
    IonIcon: container("i"),
    IonInput: container("input"),
    IonItem: container("div"),
    IonListHeader: container("div"),
    IonLabel: container("span"),
    IonList: container(),
    IonModal: defineComponent({
      inheritAttrs: false,
      props: { isOpen: Boolean },
      setup(props, { attrs, slots }) {
        return () => props.isOpen ? h("section", attrs, slots.default?.()) : null;
      },
    }),
    IonNote: container("small"),
    IonRadio: container("input"),
    IonRadioGroup: container(),
    IonPage: container(),
    IonProgressBar: container(),
    IonRow: container(),
    IonSearchbar: container("input"),
    IonSkeletonText: container("i"),
    IonSpinner: container("i"),
    IonTitle: container("h1"),
    IonToggle: container("input"),
    IonToolbar: container(),
    alertController: {
      create: vi.fn().mockImplementation(async () => ({
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ role: mocks.alertRole }),
      })),
    },
  };
});

function recentOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "AUDIT_1",
    shopId: "SHOP_1",
    shopifyOrderId: "123455",
    orderName: "#1000",
    orderId: "10000",
    outcome: "Created",
    updatedObjects: [],
    changeDetailsComplete: true,
    processedAt: "2026-07-22T12:05:00Z",
    processedAtMillis: 1,
    systemMessageId: "SM_BATCH",
    configId: "SYNC_SHOPIFY_ORDER",
    logId: "LOG_CREATE",
    shopifyFetchVerified: true,
    ...overrides,
  };
}

function createStore(overrides: Record<string, unknown> = {}) {
  const recentErrors = [{
    id: "ERR_1",
    shopId: "SHOP_1",
    shopifyOrderId: "123456",
    orderName: "#1001",
    errorText: "Shopify order validation failed.",
    occurredAt: "2026-07-22T12:10:00Z",
    occurredAtMillis: 1,
    configId: "UPDATE_SHOPIFY_ORDER",
    logId: "LOG_UPDATE",
    systemMessageId: "SM_BATCH",
    batchId: "SM_BATCH",
    retryable: true,
  }];
  const recentOrders = [recentOrder()];
  return reactive({
    selectedShopId: "SHOP_1",
    shop: {
      shopId: "SHOP_1",
      name: "Test shop",
      shopifyShopId: "98765",
      myshopifyDomain: "test-shop.myshopify.com",
      productStoreId: "STORE_1",
    },
    productStore: { productStoreId: "STORE_1", name: "Test store" },
    job: {
      shopId: "SHOP_1",
      jobName: "queue_ShopifyOrderSync_SHOP_1",
      cronExpression: "0 0/15 * * * ?",
      paused: false,
      lastRunTime: "2026-07-22T12:00:00Z",
      lastRunStatusId: "Finished",
    },
    summary: {
      latestBatch: {
        systemMessageId: "SM_BATCH",
        initDate: "2026-07-22T12:00:00Z",
        createdByJobRunId: "JOB_RUN_1",
      },
      latestCompletedBatch: { systemMessageId: "SM_PREVIOUS" },
      overallStatus: "partial",
      lastCompletedAt: "2026-07-22T11:45:00Z",
      processedOrderCount: 3,
      pendingBatchRequests: 1,
      nextRunTime: "2026-07-22T12:15:00Z",
      batchStatus: "completed",
      progressRows: [
        {
          id: "batch-request",
          state: "completed",
          successfulRecords: 0,
          failedRecords: 0,
          totalRecords: 0,
          logCount: 0,
          configIds: [],
        },
        {
          id: "hotwax-import",
          state: "partial",
          successfulRecords: 3,
          failedRecords: 1,
          totalRecords: 4,
          logCount: 2,
          configIds: ["SYNC_SHOPIFY_ORDER", "UPDATE_SHOPIFY_ORDER"],
        },
      ],
    },
    importsBySystemMessageId: {
      SM_BATCH: [
        {
          logId: "LOG_CREATE",
          configId: "SYNC_SHOPIFY_ORDER",
          statusId: "DmlsComplete",
          totalRecordCount: 2,
          successRecordCount: 2,
          failedRecordCount: 0,
        },
        {
          logId: "LOG_UPDATE",
          configId: "UPDATE_SHOPIFY_ORDER",
          statusId: "DmlsError",
          totalRecordCount: 2,
          successRecordCount: 1,
          failedRecordCount: 1,
        },
      ],
    },
    systemMessages: [{
      systemMessageId: "SM_BATCH",
      systemMessageTypeId: "ShopifyOrderSync",
      systemMessageRemoteId: "REMOTE_SHOP_1",
      statusId: "SmsgSent",
      initDate: "2026-07-22T12:00:00Z",
      processedDate: "2026-07-22T12:05:00Z",
    }],
    recentAudits: recentOrders,
    recentOrders,
    recentErrors,
    recentRequestErrors: [],
    retryByErrorId: {},
    capabilities: { canRetryIndividualOrder: true },
    canRunNow: false,
    runNowDisabledReason: "Run now is unavailable while this shop has active batch work.",
    isBatchActive: true,
    activeMutation: "",
    monitoringLoadedAt: "2026-07-22T12:10:00Z",
    monitoringError: "",
    monitoringRefreshing: false,
    lastRunResult: null,
    filteredRecentOrders: vi.fn(() => recentOrders),
    filteredRecentErrors: vi.fn(() => recentErrors),
    loadMonitoring: vi.fn().mockResolvedValue(undefined),
    resetForShop: vi.fn(),
    runNow: vi.fn(),
    retryIndividualOrder: vi.fn().mockImplementation(async () => {
      mocks.store.retryByErrorId.ERR_1 = {
        pending: false,
        error: null,
        systemMessageId: "SM_RETRY",
      };
      return { systemMessageId: "SM_RETRY", requestId: "REQ_1" };
    }),
    ...overrides,
  });
}

async function mountMonitor(overrides: Record<string, unknown> = {}) {
  mocks.store = createStore(overrides);
  const wrapper = mount(ShopifyOrderSync, { props: { id: "SHOP_1" } });
  await flushPromises();
  return wrapper;
}

describe("ShopifyOrderSync monitoring", () => {
  beforeEach(() => {
    mocks.manualRefresh.mockReset().mockResolvedValue(undefined);
    mocks.downloadTextFile.mockReset();
    mocks.alertRole = "confirm";
  });

  it("renders exactly two progress rows with an explicit partial overall outcome", async () => {
    const wrapper = await mountMonitor();
    const progress = wrapper.get(".progress");

    expect(progress.findAll(".progress-item")).toHaveLength(2);
    expect(progress.text()).toContain("Shopify order batch request");
    expect(progress.text()).toContain("Request completed");
    expect(progress.text()).toContain("HotWax order import");
    expect(progress.text()).toContain("Partially completed · 3 processed · 1 failed");
    expect(wrapper.text()).toContain("Latest batch outcome");
    expect(wrapper.text()).toContain("Partially completed");
    expect(wrapper.text()).not.toMatch(/bulk operation/i);
  });

  it("separates terminal request failures from independently capped import errors", async () => {
    const requestFailure = {
      id: "M221664:system-message",
      shopId: "SHOP_1",
      shopifyOrderId: "",
      orderName: "",
      errorText: "Shopify order request failed before import.",
      occurredAt: "2026-07-22T12:09:00Z",
      occurredAtMillis: 1,
      configId: "",
      logId: "",
      systemMessageId: "M221664",
      batchId: "",
      retryable: false,
    };
    const wrapper = await mountMonitor({ recentRequestErrors: [requestFailure] });

    expect(wrapper.get("#recent-request-errors-heading").text()).toBe("Recent request failures");
    expect(wrapper.get("#recent-errors-heading").text()).toBe("Recent import errors");
    expect(wrapper.text()).toContain("Shopify order request failed before import.");
    expect(wrapper.text()).toContain("Custom request");
    expect(wrapper.text()).not.toContain("Outstanding Shopify orders");

    const requestSection = wrapper.get("[aria-labelledby='recent-request-errors-heading']");
    const requestButtons = requestSection.findAll("button");
    expect(requestButtons).toHaveLength(1);
    const detailsButton = requestButtons
      .find((button) => button.text().includes("View request progress"));
    expect(detailsButton).toBeDefined();
    await detailsButton!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Order sync request details");
    expect(wrapper.text()).toContain("Shopify order request failed before import.");
    expect(wrapper.text()).toContain("HotWax order import");
    expect(wrapper.text()).toContain("Not started");
    expect(wrapper.text()).toContain("Failures");
  });

  it("pairs every error card with a transparent resolution next step", async () => {
    const retryableValidationError = createStore().recentErrors[0];
    const mappingError = {
      ...retryableValidationError,
      id: "ERR_MAPPING",
      errorText: "A required order mapping is unavailable.",
      retryable: false,
    };
    const withheldError = {
      ...retryableValidationError,
      id: "ERR_WITHHELD",
      shopifyOrderId: "",
      orderName: "",
      errorText: "Error details could not be safely read.",
      retryable: false,
    };
    const errors = [retryableValidationError, mappingError, withheldError];
    const requestFailure = {
      id: "M221664:system-message",
      shopId: "SHOP_1",
      shopifyOrderId: "",
      orderName: "",
      errorText: "Shopify order request failed before import.",
      occurredAt: "2026-07-22T12:09:00Z",
      occurredAtMillis: 1,
      configId: "",
      logId: "",
      systemMessageId: "M221664",
      batchId: "",
      retryable: false,
    };
    const wrapper = await mountMonitor({
      recentErrors: errors,
      filteredRecentErrors: vi.fn(() => errors),
      recentRequestErrors: [requestFailure],
    });

    const importSection = wrapper.get("[aria-labelledby='recent-errors-heading']");
    expect(importSection.text()).toContain("Review the failed record in the import and correct the order in Shopify.");
    expect(importSection.text()).toContain("Then use Retry individual order to re-fetch the current Shopify payload.");
    expect(importSection.text()).toContain("Record the missing order mapping in Order Sync setup.");
    expect(importSection.text()).toContain("Company withheld the recorded error text because it could not be displayed safely. Open the DataManager run to review the import context.");

    const setupLinks = importSection.findAll("button").filter((button) => button.text().includes("Review setup"));
    expect(setupLinks).toHaveLength(1);
    expect(setupLinks[0].attributes("router-link")).toBe("/shopify-connection-details/SHOP_1/order-sync/configure");

    const requestSection = wrapper.get("[aria-labelledby='recent-request-errors-heading']");
    expect(requestSection.text()).toContain("Next step");
    expect(requestSection.text()).toContain("Review the request progress. The next scheduled batch will retry this window.");
    expect(requestSection.text()).not.toContain("Then use Retry individual order");
  });

  it("surfaces the failed record's own error, log creation time, Shopify link, and payload downloads", async () => {
    mocks.fetchLogDetails.mockResolvedValue({
      logId: "LOG_UPDATE",
      configId: "UPDATE_SHOPIFY_ORDER",
      createdDate: "2026-07-22T12:08:00Z",
      fileName: "orders-update.json",
      logContentId: "CONTENT_1",
      errorLogContentId: "ERR_CONTENT_1",
    });
    mocks.dataManagerErrorLogs = [{
      payload: "{\"order\":{\"id\":\"gid://shopify/Order/123456\",\"name\":\"#1001\"}}",
      _ERROR_MESSAGE_: "Payment method mapping not found for gift_card",
    }];
    mocks.downloadDataManagerFile.mockResolvedValue({ data: "{\"orders\":[]}" });

    const wrapper = await mountMonitor();
    const importSection = wrapper.get("[aria-labelledby='recent-errors-heading']");

    expect(importSection.text()).toContain("Load the failed records file to see this order's recorded error message.");
    const shopifyAdmin = importSection.findAll("button").find((button) => button.text() === "Shopify Admin");
    expect(shopifyAdmin).toBeDefined();
    expect(shopifyAdmin!.attributes("href")).toBe("https://test-shop.myshopify.com/admin/orders/123456");

    const load = importSection.findAll("button").find((button) => button.text() === "Load details");
    expect(load).toBeDefined();
    await load!.trigger("click");
    await flushPromises();

    expect(mocks.fetchLogDetails).toHaveBeenCalledWith("LOG_UPDATE");
    expect(importSection.text()).toContain("Payment method mapping not found for gift_card");
    expect(importSection.text()).toContain("Created: 2026-07-22T12:08:00Z");

    const downloadRecord = importSection.findAll("button").find((button) => button.text() === "Download record");
    expect(downloadRecord).toBeDefined();
    await downloadRecord!.trigger("click");
    expect(mocks.downloadTextFile).toHaveBeenCalledWith(
      expect.stringContaining("Payment method mapping not found for gift_card"),
      "123456-failed-record.json",
    );

    const downloadFile = importSection.findAll("button").find((button) => button.text() === "Download file");
    expect(downloadFile).toBeDefined();
    await downloadFile!.trigger("click");
    await flushPromises();
    expect(mocks.downloadDataManagerFile).toHaveBeenCalledWith("UPDATE_SHOPIFY_ORDER", "CONTENT_1");
    expect(mocks.downloadTextFile).toHaveBeenCalledWith("{\"orders\":[]}", "orders-update.json");
    expect(mocks.showToast).toHaveBeenCalledWith("File downloaded successfully");
  });

  it("replays orders updated since a chosen time through the bounded fresh-fetch path", async () => {
    const searchShopifyOrders = vi.fn().mockResolvedValue({
      orders: [
        { legacyResourceId: "111", name: "HC#1" },
        { legacyResourceId: "222", name: "HC#2" },
      ],
      hasNextPage: false,
      endCursor: "",
    });
    const requestSelectedOrders = vi.fn().mockResolvedValue({
      queued: [
        { shopifyOrderId: "111", systemMessageId: "M1" },
        { shopifyOrderId: "222", systemMessageId: "M2" },
      ],
      failedOrderIds: [],
    });
    const wrapper = await mountMonitor({
      remote: { systemMessageRemoteId: "REMOTE_SHOP_1" },
      searchShopifyOrders,
      requestSelectedOrders,
    });

    const replayItem = wrapper.findAll("div").find((element) =>
      element.attributes("button") !== undefined && element.text().includes("Replay orders from a time"));
    expect(replayItem).toBeDefined();
    await replayItem!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Replay orders from a certain time");
    await wrapper.get("[data-datetime]").setValue("2026-07-20T10:00:00");

    const start = wrapper.findAll("button").find((button) => button.text() === "Start replay");
    expect(start).toBeDefined();
    await start!.trigger("click");
    await flushPromises();

    expect(searchShopifyOrders).toHaveBeenCalledWith({
      queryString: "updated_at:>='2026-07-20T10:00:00'",
      pageSize: 50,
      shopId: "SHOP_1",
    });
    expect(requestSelectedOrders).toHaveBeenCalledWith({ shopifyOrderIds: ["111", "222"], shopId: "SHOP_1" });
    expect(wrapper.text()).toContain("Queued 2 selected Shopify orders; 0 could not be queued.");
  });

  it("refuses an over-limit replay window without queuing anything", async () => {
    const searchShopifyOrders = vi.fn().mockResolvedValue({
      orders: Array.from({ length: 50 }, (_, index) => ({ legacyResourceId: String(1000 + index) })),
      hasNextPage: true,
      endCursor: "cursor",
    });
    const requestSelectedOrders = vi.fn();
    const wrapper = await mountMonitor({
      remote: { systemMessageRemoteId: "REMOTE_SHOP_1" },
      searchShopifyOrders,
      requestSelectedOrders,
    });

    const replayItem = wrapper.findAll("div").find((element) =>
      element.attributes("button") !== undefined && element.text().includes("Replay orders from a time"));
    await replayItem!.trigger("click");
    await flushPromises();
    await wrapper.get("[data-datetime]").setValue("2026-07-20T10:00:00");
    const start = wrapper.findAll("button").find((button) => button.text() === "Start replay");
    await start!.trigger("click");
    await flushPromises();

    expect(requestSelectedOrders).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("More than 50 orders were updated since the selected time. Choose a later time or use Download specific orders.");
    expect(wrapper.text()).toContain("Replay orders from a certain time");
  });

  it("shows safe standalone SystemMessage facts by correlating its loaded summary and successful audit", async () => {
    const order = recentOrder({
      systemMessageId: "M228520",
      logId: "M101225",
      processedAt: "2026-07-22T12:01:00Z",
    });
    const wrapper = await mountMonitor({
      recentOrders: [order],
      recentAudits: [order],
      filteredRecentOrders: vi.fn(() => [order]),
      lastRunResult: { systemMessageId: "M228520" },
      systemMessages: [{
        systemMessageId: "M228520",
        systemMessageTypeId: "ShopifyOrderSync",
        systemMessageRemoteId: "REMOTE_SHOP_1",
        statusId: "SmsgSent",
        initDate: "2026-07-22T12:00:00Z",
        processedDate: "2026-07-22T12:01:00Z",
      }],
    });
    const queuedMessageButton = wrapper.findAll("button").find((button) => button.text().trim() === "M228520");
    expect(queuedMessageButton).toBeDefined();
    await queuedMessageButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("SystemMessage details");
    expect(wrapper.text()).toContain("M228520");
    expect(wrapper.text()).toContain("ShopifyOrderSync");
    expect(wrapper.text()).toContain("Failures");
    expect(wrapper.text()).toContain("Records");
  });

  it("shows the audit-correlated successful rerun instead of an earlier failed same-config log", async () => {
    const firstOrder = recentOrder({
      id: "AUDIT_RERUN_1",
      systemMessageId: "M228571",
      logId: "M101327",
      processedAt: "2026-07-22T12:04:00Z",
      processedAtMillis: Date.parse("2026-07-22T12:04:00Z"),
    });
    const secondOrder = recentOrder({
      id: "AUDIT_RERUN_2",
      shopifyOrderId: "223456",
      orderId: "10001",
      systemMessageId: "M228571",
      logId: "M101327",
      processedAt: "2026-07-22T12:05:00Z",
      processedAtMillis: Date.parse("2026-07-22T12:05:00Z"),
    });
    const immutableEarlierError = {
      ...createStore().recentErrors[0],
      id: "M101276:0",
      systemMessageId: "M228571",
      logId: "M101276",
    };
    const wrapper = await mountMonitor({
      recentOrders: [secondOrder, firstOrder],
      recentAudits: [secondOrder, firstOrder],
      filteredRecentOrders: vi.fn(() => [secondOrder, firstOrder]),
      lastRunResult: { systemMessageId: "M228571" },
      recentErrors: [immutableEarlierError],
      filteredRecentErrors: vi.fn(() => [immutableEarlierError]),
      systemMessages: [{
        systemMessageId: "M228571",
        systemMessageTypeId: "ShopifyOrderSync",
        systemMessageRemoteId: "REMOTE_SHOP_1",
        statusId: "SmsgSent",
        initDate: "2026-07-22T12:00:00Z",
        processedDate: "2026-07-22T12:05:00Z",
      }],
      importsBySystemMessageId: {
        M228571: [{
          logId: "M101327",
          systemMessageId: "M228571",
          configId: "SYNC_SHOPIFY_ORDER",
          statusId: "DmlsFinished",
          totalRecordCount: 2,
          failedRecordCount: 0,
          successRecordCount: 2,
        }],
      },
    });
    const queuedMessageButton = wrapper.findAll("button").find((button) => button.text().trim() === "M228571");
    await queuedMessageButton!.trigger("click");
    await flushPromises();

    const modalTitle = wrapper.findAll("h1").find((heading) => heading.text() === "SystemMessage details");
    const modalText = modalTitle?.element.closest("section")?.textContent || "";
    expect(modalText).toContain("M228571");
    expect(modalText).toContain("Completed");
    expect(modalText).not.toContain("Failed");
    expect(modalText).toMatch(/Records\s*2/);
    expect(modalText).toMatch(/Failures\s*0/);

    const failedImportButton = wrapper.findAll("button")
      .find((button) => button.text().trim() === "View import");
    expect(failedImportButton).toBeDefined();
    expect(failedImportButton!.attributes("href")).toBeUndefined();
    await failedImportButton!.trigger("click");
    await flushPromises();

    const logModalTitle = wrapper.findAll("h1").find((heading) => heading.text() === "Data Manager Log");
    const logModalText = logModalTitle?.element.closest("section")?.textContent || "";
    expect(logModalText).toContain("M101276");
    expect(logModalText).toContain("Failed");
    expect(logModalText).toMatch(/Failed Records\s*1/);
  });

  it("keeps projected operational facts inside Company while retaining only explicit order links", async () => {
    const updatedOrder = recentOrder({
      outcome: "Updated",
      updatedObjects: [
        { objectType: "Order", count: 1 },
        { objectType: "Fulfillment", count: 2 },
      ],
    });
    const wrapper = await mountMonitor({
      recentOrders: [updatedOrder],
      filteredRecentOrders: vi.fn(() => [updatedOrder]),
    });
    const processedOrderCard = wrapper.get("[aria-labelledby='recent-orders-heading'] section[role='listitem']");
    expect(processedOrderCard.text()).not.toContain("SystemMessage");
    expect(processedOrderCard.text()).not.toContain("DataManager result");
    expect(processedOrderCard.text()).toContain("Updated objects");
    expect(processedOrderCard.text()).toContain("Order · 1");
    expect(processedOrderCard.text()).toContain("Fulfillments · 2");

    const shopifyLink = wrapper.get("[href='https://test-shop.myshopify.com/admin/orders/123455']");
    expect(shopifyLink.attributes("target")).toBe("_blank");
    expect(shopifyLink.attributes("rel")).toBe("noopener noreferrer");
    expect(wrapper.findAll("button").some((button) => button.text().trim() === "HotWax order")).toBe(false);
    expect(wrapper.find("[href='https://order-manager.example/orders/10000']").exists()).toBe(false);
    expect(shopifyOrderSyncSource).not.toMatch(/job-manager|\/file-history\//);
  });

  it("routes the shared editable job viewer through shop-scoped Order Sync actions", () => {
    expect(shopifyOrderSyncSource).toContain(':run-handler="confirmRunNow"');
    expect(shopifyOrderSyncSource).toContain(':save-handler="saveJobFromModal"');
    expect(shopifyOrderSyncSource).toContain("orderSyncStore.updateSchedule(input.cronExpression, shopId)");
    expect(shopifyOrderSyncSource).toContain("orderSyncStore.updateJobStatus(input.paused, shopId)");
    expect(shopifyOrderSyncSource).not.toContain("useServiceJob");
  });

  it("uses a narrow mobile grid override for 375px viewports", () => {
    expect(shopifyOrderSyncSource).toContain("@media screen and (max-width: 430px)");
    expect(shopifyOrderSyncSource).toMatch(/\.sync-summary,\s*\.sync-monitor\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
    expect(shopifyOrderSyncSource).toContain("flex-basis: min(100%, 375px)");
  });

  it("renders the actual audit outcome and a verified Shopify Admin order link", async () => {
    const updatedByCreateConfig = recentOrder({
      outcome: "Updated",
      configId: "SYNC_SHOPIFY_ORDER",
      shopifyFetchVerified: true,
    });
    const wrapper = await mountMonitor({
      recentOrders: [updatedByCreateConfig],
      filteredRecentOrders: vi.fn(() => [updatedByCreateConfig]),
    });

    expect(wrapper.text()).toContain("Updated");
    const link = wrapper.get("[href='https://test-shop.myshopify.com/admin/orders/123455']");
    expect(link.attributes("aria-label")).toBe("Open order in Shopify Admin");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
  });

  it("does not link a synthetic numeric Shopify ID without verified upstream provenance", async () => {
    const syntheticOrder = recentOrder({
      shopifyOrderId: "999000111",
      shopifyFetchVerified: false,
    });
    const wrapper = await mountMonitor({
      recentOrders: [syntheticOrder],
      filteredRecentOrders: vi.fn(() => [syntheticOrder]),
    });

    expect(wrapper.text()).toContain("999000111");
    const ordersSection = wrapper.get("[aria-labelledby='recent-orders-heading']");
    expect(ordersSection.find("[href*='/admin/orders/']").exists()).toBe(false);
  });

  it.each([
    "test-shop.myshopify.com.attacker.test",
    "https://user:password@test-shop.myshopify.com",
    "test-shop.myshopify.com/path",
    "TEST-SHOP.myshopify.com",
  ])("does not render a Shopify Admin link for unsafe domain %s", async (myshopifyDomain) => {
    const order = recentOrder({ shopifyFetchVerified: true });
    const wrapper = await mountMonitor({
      shop: {
        shopId: "SHOP_1",
        name: "Test shop",
        shopifyShopId: "98765",
        myshopifyDomain,
        productStoreId: "STORE_1",
      },
      recentOrders: [order],
      filteredRecentOrders: vi.fn(() => [order]),
    });

    expect(wrapper.find("[href*='/admin/orders/']").exists()).toBe(false);
  });

  it("disables Run now for active batch work while leaving a resolvable retry available", async () => {
    const wrapper = await mountMonitor();
    const buttons = wrapper.findAll("button");
    const runNow = buttons.find((button) => button.text().includes("Run now"));
    const retry = buttons.find((button) => button.text().includes("Retry individual order"));

    expect(runNow?.attributes()).toHaveProperty("disabled");
    expect(wrapper.text()).toContain("Run now is unavailable while this shop has active batch work.");
    expect(retry).toBeDefined();
    expect(retry?.attributes("disabled")).toBeUndefined();

    await retry!.trigger("click");
    await flushPromises();
    expect(mocks.store.retryIndividualOrder).toHaveBeenCalledWith({
      errorId: "ERR_1",
      shopifyOrderId: "123456",
      shopId: "SHOP_1",
    });
    expect(wrapper.text()).toContain("SM_RETRY");
    expect(wrapper.text()).toContain("The original error remains unchanged.");
    expect(wrapper.text()).toContain("#1001");
  });

  it("downloads only the already-loaded safe error projection as CSV", async () => {
    const wrapper = await mountMonitor();
    const download = wrapper.findAll("button")
      .find((button) => button.text().includes("Download CSV"));

    expect(download).toBeDefined();
    const click = download!.trigger("click");

    expect(mocks.downloadTextFile).toHaveBeenCalledTimes(1);
    await click;
    await flushPromises();

    const [csv, fileName] = mocks.downloadTextFile.mock.calls[0];
    expect(fileName).toBe("shopify-order-sync-errors-SHOP_1.csv");
    expect(csv).toContain("Shopify order validation failed.");
    expect(csv).toContain("123456");
    expect(csv).not.toMatch(/customer|address|token|secret/i);
    expect(wrapper.text()).toContain("Safe error CSV download started.");
    expect(mocks.store.loadMonitoring).not.toHaveBeenCalled();
  });

  it("keeps retry actions hidden for a monitor-only user", async () => {
    const wrapper = await mountMonitor({
      capabilities: { canRetryIndividualOrder: false },
    });

    expect(wrapper.text()).not.toContain("Retry individual order");
    expect(wrapper.text()).toContain("Administrator permission is required to retry this order.");
  });
});
