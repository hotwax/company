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
    IonInput: defineComponent({
      inheritAttrs: false,
      props: { value: String },
      emits: ["ionInput"],
      setup(props, { attrs, emit, slots }) {
        return () => h("input", {
          ...attrs,
          value: props.value,
          onInput: (event: Event) => emit("ionInput", { detail: { value: (event.target as HTMLInputElement).value } }),
        }, slots.default?.());
      },
    }),
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
          systemMessageId: "SM_BATCH",
          configId: "SYNC_SHOPIFY_ORDER",
          statusId: "DmlsComplete",
          totalRecordCount: 2,
          successRecordCount: 2,
          failedRecordCount: 0,
          startDateTime: "2026-07-22T12:06:00Z",
          finishDateTime: "2026-07-22T12:07:00Z",
        },
        {
          logId: "LOG_UPDATE",
          systemMessageId: "SM_BATCH",
          configId: "UPDATE_SHOPIFY_ORDER",
          statusId: "DmlsError",
          totalRecordCount: 2,
          successRecordCount: 1,
          failedRecordCount: 1,
          startDateTime: "2026-07-22T12:08:00Z",
          finishDateTime: "2026-07-22T12:10:00Z",
        },
      ],
    },
    failedDataManagerLogs: [{
      logId: "LOG_UPDATE",
      systemMessageId: "SM_BATCH",
      configId: "UPDATE_SHOPIFY_ORDER",
      statusId: "DmlsFinished",
      totalRecordCount: 2,
      successRecordCount: 1,
      failedRecordCount: 1,
      createdDate: "2026-07-22T12:07:00Z",
      startDateTime: "2026-07-22T12:08:00Z",
      finishDateTime: "2026-07-22T12:10:00Z",
    }],
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
    landmarkDates: {
      status: "ready",
      launchDate: "2026-06-19 00:00:00",
      historyLastSyncDate: "2026-07-22 03:00:00",
      error: null,
    },
    retryByErrorId: {},
    capabilities: { canRetryIndividualOrder: true },
    canRunNow: false,
    runNowDisabledReason: "Run now is unavailable while this shop has active batch work.",
    isBatchActive: true,
    activeMutation: "",
    runtimeTimeZone: "Asia/Kolkata",
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
    const memoryStorage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memoryStorage.get(key) || null,
        setItem: (key: string, value: string) => memoryStorage.set(key, value),
        removeItem: (key: string) => memoryStorage.delete(key),
      },
    });
  });

  it("filters loaded history inclusively by From and Thru dates, validates reversal, and clears", async () => {
    const orders = [
      recentOrder({ id: "ORDER_22", shopifyOrderId: "ORDER_22", orderName: "#22", processedAt: "2026-07-22T18:00:00Z", processedAtMillis: Date.parse("2026-07-22T18:00:00Z") }),
      recentOrder({ id: "ORDER_21", shopifyOrderId: "ORDER_21", orderName: "#21", processedAt: "2026-07-21T18:00:00Z", processedAtMillis: Date.parse("2026-07-21T18:00:00Z") }),
    ];
    const wrapper = await mountMonitor({
      recentOrders: orders,
      recentAudits: orders,
      filteredRecentOrders: vi.fn(() => orders),
    });
    const dateInputs = wrapper.findAll("input[type='date']");
    expect(dateInputs).toHaveLength(2);
    expect(wrapper.get("[aria-labelledby='recent-orders-heading']").text()).toContain("ORDER_21");

    await dateInputs[0].setValue("2026-07-22");
    expect(wrapper.get("[aria-labelledby='recent-orders-heading']").text()).toContain("ORDER_22");
    expect(wrapper.get("[aria-labelledby='recent-orders-heading']").text()).not.toContain("ORDER_21");

    await dateInputs[1].setValue("2026-07-21");
    expect(wrapper.text()).toContain("From date must be on or before Thru date.");
    expect(wrapper.get("[aria-labelledby='recent-orders-heading']").text()).not.toContain("ORDER_22");

    await wrapper.get("[aria-label='Clear order history date range']").trigger("click");
    expect(wrapper.text()).not.toContain("From date must be on or before Thru date.");
    expect(wrapper.get("[aria-labelledby='recent-orders-heading']").text()).toContain("ORDER_21");
  });

  it("persists the selected range across a monitoring refresh", async () => {
    const wrapper = await mountMonitor();
    const dateInputs = wrapper.findAll("input[type='date']");
    await dateInputs[0].setValue("2026-07-22");
    await dateInputs[1].setValue("2026-07-22");
    expect(JSON.parse(window.localStorage.getItem("shopify-order-sync-date-range:SHOP_1") || "null"))
      .toEqual({ fromDate: "2026-07-22", thruDate: "2026-07-22" });

    await wrapper.unmount();
    const refreshed = await mountMonitor();
    expect(refreshed.findAll("input[type='date']").map((input) => input.element.getAttribute("value")))
      .toEqual(["2026-07-22", "2026-07-22"]);
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

  it("shows only DataManager logs with error records and keeps the card to the requested facts", async () => {
    const wrapper = await mountMonitor();
    const failedRuns = wrapper.get("[aria-labelledby='failed-import-logs-heading']");

    expect(failedRuns.findAll("[role='listitem']")).toHaveLength(1);
    expect(failedRuns.text()).not.toContain("LOG_CREATE");
    expect(failedRuns.text()).toContain("Log IDLOG_UPDATE");
    expect(failedRuns.text()).toContain("Created2026-07-22T12:07:00Z");
    expect(failedRuns.text()).toContain("Start time2026-07-22T12:08:00Z");
    expect(failedRuns.text()).toContain("End time2026-07-22T12:10:00Z");
    expect(failedRuns.text()).toContain("2 records · 1 error record");
    const jobManagerLink = failedRuns.get("[href='https://job-manager.hotwax.io/file-history/LOG_UPDATE']");
    expect(jobManagerLink.attributes("target")).toBe("_blank");
    expect(jobManagerLink.attributes("rel")).toBe("noopener noreferrer");
    expect(wrapper.text()).not.toContain("Recent request failures");
    expect(wrapper.text()).not.toContain("Recent import errors");
    expect(wrapper.text()).not.toContain("Download CSV");
  });

  it("surfaces the shop's landmark dates in the sync monitor", async () => {
    const wrapper = await mountMonitor();
    const monitorSection = wrapper.get("[aria-labelledby='sync-monitor-heading']");

    expect(monitorSection.text()).toContain("Key dates");
    expect(monitorSection.text()).toContain("New order sync launch date");
    expect(monitorSection.text()).toContain("2026-06-19 00:00:00");
    expect(monitorSection.text()).toContain("Order history synced through");
    expect(monitorSection.text()).toContain("2026-07-22 03:00:00");
  });

  it("shows Not set for a landmark date the shop has not configured", async () => {
    const wrapper = await mountMonitor({
      landmarkDates: { status: "ready", launchDate: "", historyLastSyncDate: "", error: null },
    });
    const monitorSection = wrapper.get("[aria-labelledby='sync-monitor-heading']");

    expect(monitorSection.text()).toContain("New order sync launch date");
    expect(monitorSection.text()).toContain("Not set");
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
      failedDataManagerLogs: [],
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

    const failedRuns = wrapper.get("[aria-labelledby='failed-import-logs-heading']");
    expect(failedRuns.text()).not.toContain("M101276");
    expect(failedRuns.text()).toContain("No DataManager runs with error records were found for this Shopify instance.");
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

  it("disables Run now for active batch work without rendering record-level retry actions", async () => {
    const wrapper = await mountMonitor();
    const buttons = wrapper.findAll("button");
    const runNow = buttons.find((button) => button.text().includes("Run now"));
    const retry = buttons.find((button) => button.text().includes("Retry individual order"));

    expect(runNow?.attributes()).toHaveProperty("disabled");
    expect(wrapper.text()).toContain("Run now is unavailable while this shop has active batch work.");
    expect(retry).toBeUndefined();
  });

  it("does not render the deferred record-level error and CSV controls", async () => {
    const wrapper = await mountMonitor();
    expect(wrapper.text()).not.toContain("Download CSV");
    expect(wrapper.text()).not.toContain("Load details");
    expect(wrapper.text()).not.toContain("Retry individual order");
    expect(mocks.downloadTextFile).not.toHaveBeenCalled();
  });

  it("keeps retry actions hidden for a monitor-only user", async () => {
    const wrapper = await mountMonitor({
      capabilities: { canRetryIndividualOrder: false },
    });

    expect(wrapper.text()).not.toContain("Retry individual order");
    expect(wrapper.text()).not.toContain("Administrator permission is required to retry this order.");
  });
});
