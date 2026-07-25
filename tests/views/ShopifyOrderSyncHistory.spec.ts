// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ShopifyOrderSyncHistory from "@/views/ShopifyOrderSyncHistory.vue";

const mocks = vi.hoisted(() => ({
  store: undefined as any,
}));

vi.mock("@common", () => ({
  translate: (key: string, values?: Record<string, unknown>) => Object.entries(values || {})
    .reduce((message, [name, value]) => message.replace(`{${name}}`, String(value)), key),
}));

vi.mock("@/utils", () => ({
  formatDateTime: (value: unknown) => String(value || ""),
  parseDateTimeValue: (value: string) => {
    const millis = Date.parse(/[zZ+]/.test(value) ? value : `${value}:00Z`);
    return Number.isFinite(millis) ? { toMillis: () => millis } : null;
  },
}));

vi.mock("@/store/shopifyOrderSync", () => ({
  useShopifyOrderSyncStore: () => mocks.store,
}));

vi.mock("@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>("vue");
  return {
    default: defineComponent({
      inheritAttrs: false,
      props: { isOpen: Boolean, logId: String, details: Object },
      setup(props) {
        return () => props.isOpen ? h("section", { "data-mdm-log-modal": props.logId }) : null;
      },
    }),
  };
});

vi.mock("@ionic/vue", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>("vue");
  const container = (tag = "div") => defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });
  const select = defineComponent({
    inheritAttrs: false,
    props: { value: String },
    emits: ["ionChange"],
    setup(props, { attrs, emit, slots }) {
      return () => h("select", {
        ...attrs,
        value: props.value,
        onChange: (event: Event) => emit("ionChange", {
          detail: { value: (event.target as HTMLSelectElement).value },
        }),
      }, slots.default?.());
    },
  });
  const input = defineComponent({
    inheritAttrs: false,
    props: { value: String },
    emits: ["ionChange"],
    setup(props, { attrs, emit }) {
      const emitChange = (event: Event) => emit("ionChange", {
        detail: { value: (event.target as HTMLInputElement).value },
      });
      return () => h("input", {
        ...attrs,
        value: props.value,
        onInput: emitChange,
        onChange: emitChange,
      });
    },
  });
  return {
    IonAccordion: container("article"),
    IonAccordionGroup: container(),
    IonBackButton: container("a"),
    IonBadge: container("span"),
    IonButton: container("button"),
    IonButtons: container(),
    IonCard: container("section"),
    IonCardContent: container(),
    IonCardHeader: container("header"),
    IonCardTitle: container("h2"),
    IonChip: container("span"),
    IonContent: container("main"),
    IonHeader: container("header"),
    IonIcon: container("i"),
    IonInput: input,
    IonItem: container("div"),
    IonLabel: container("span"),
    IonList: container(),
    IonListHeader: container("h3"),
    IonPage: container(),
    IonSelect: select,
    IonSelectOption: container("option"),
    IonSpinner: container("i"),
    IonTitle: container("h1"),
    IonToolbar: container(),
    onIonViewWillEnter: (callback: () => void) => callback(),
  };
});

function batch(overrides: Record<string, unknown> = {}) {
  return {
    systemMessageId: "M1",
    messageId: "",
    messageDate: "2026-07-20T09:00:00Z",
    systemMessageTypeId: "ShopifyOrderSync",
    systemMessageRemoteId: "REMOTE_1",
    statusId: "SmsgSent",
    initDate: "2026-07-20T10:00:00Z",
    processedDate: "2026-07-20T10:01:00Z",
    createdByJobRunId: "JOB_RUN_1",
    ...overrides,
  };
}

function importLog(overrides: Record<string, unknown> = {}) {
  return {
    logId: "LOG_1",
    systemMessageId: "M1",
    configId: "SYNC_SHOPIFY_ORDER",
    statusId: "DmlsFinished",
    totalRecordCount: 3,
    failedRecordCount: 0,
    successRecordCount: 3,
    finishDateTime: "2026-07-20T10:02:00Z",
    createdByJobRunId: "JOB_RUN_1",
    ...overrides,
  };
}

const HISTORY_FIXTURE = {
  batches: [
    batch({ systemMessageId: "M3", initDate: "2026-07-22T10:00:00Z", statusId: "SmsgError", processedDate: undefined }),
    batch({ systemMessageId: "M2", initDate: "2026-07-21T10:00:00Z" }),
    batch({ systemMessageId: "M1", initDate: "2026-07-20T10:00:00Z" }),
  ],
  importsBySystemMessageId: {
    M3: [],
    M2: [
      importLog({ logId: "LOG_2A", systemMessageId: "M2", totalRecordCount: 2, successRecordCount: 1, failedRecordCount: 1, statusId: "DmlsFinished" }),
    ],
    M1: [importLog()],
  },
};

async function mountHistory(history: unknown = HISTORY_FIXTURE) {
  mocks.store = {
    shop: { name: "hotwax-demo" },
    loadHistory: vi.fn().mockResolvedValue(history),
  };
  const wrapper = mount(ShopifyOrderSyncHistory, { props: { id: "10010" } });
  await flushPromises();
  return wrapper;
}

function accordionIds(wrapper: Awaited<ReturnType<typeof mountHistory>>) {
  return wrapper.findAll("article").map((accordion) => accordion.attributes("value"));
}

describe("ShopifyOrderSyncHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives one run per batch, newest first, with request and import outcome chips", async () => {
    const wrapper = await mountHistory();

    expect(mocks.store.loadHistory).toHaveBeenCalledWith("10010");
    expect(accordionIds(wrapper)).toEqual(["M3", "M2", "M1"]);

    const [failedRun, partialRun, completedRun] = wrapper.findAll("article");
    expect(failedRun.text()).toContain("Failed");
    expect(partialRun.text()).toContain("Partially completed");
    expect(partialRun.text()).toContain("1 processed, 1 failed");
    expect(completedRun.text()).toContain("3 processed");
    expect(completedRun.text()).toContain("Completed");
  });

  it("shows batch details and per-import records inside the run", async () => {
    const wrapper = await mountHistory();
    const completedRun = wrapper.findAll("article")[2];

    expect(completedRun.text()).toContain("Sent");
    expect(completedRun.text()).toContain("JOB_RUN_1");
    expect(completedRun.text()).toContain("New order import");
    expect(completedRun.text()).toContain("LOG_1");
    expect(completedRun.text()).toContain("3 records");
    expect(completedRun.text()).toContain("3 successful");
    expect(completedRun.text()).toContain("0 failed");

    const failedRun = wrapper.findAll("article")[0];
    expect(failedRun.text()).toContain("No MDM import was required for this batch");
  });

  it("opens MDM log details in-app from an import row", async () => {
    const wrapper = await mountHistory();
    const buttons = wrapper.findAll("button").filter((button) => button.text() === "View MDM log");

    expect(buttons).toHaveLength(2);
    expect(wrapper.find("[data-mdm-log-modal]").exists()).toBe(false);

    await buttons[0].trigger("click");
    expect(wrapper.get("[data-mdm-log-modal]").attributes("data-mdm-log-modal")).toBe("LOG_2A");
  });

  it("keeps DataManager history details inside Company at the safe projected modal boundary", () => {
    const source = readFileSync(`${process.cwd()}/src/views/ShopifyOrderSyncHistory.vue`, "utf8");

    expect(source).toContain("ShopifyOrderSyncMdmLogModal");
    expect(source).toContain("@click=\"openMdmLogDetails(log)\"");
    expect(source).not.toContain("buildAppUrl");
    expect(source).not.toContain("job-manager");
    expect(source).not.toContain("file-history");
    expect(source).not.toMatch(/target=["']_blank["']/);
    expect(source).not.toMatch(/useDataManagerLog|fetchLogDetails|downloadDataManagerFile/);
  });

  it("filters runs by derived outcome", async () => {
    const wrapper = await mountHistory();

    await wrapper.findAll("select")[0].setValue("failed");
    expect(accordionIds(wrapper)).toEqual(["M3"]);

    await wrapper.findAll("select")[0].setValue("partial");
    expect(accordionIds(wrapper)).toEqual(["M2"]);

    await wrapper.findAll("select")[0].setValue("");
    expect(accordionIds(wrapper)).toEqual(["M3", "M2", "M1"]);
  });

  it("sorts loaded runs oldest first without refetching", async () => {
    const wrapper = await mountHistory();

    await wrapper.findAll("select")[1].setValue("oldest");
    expect(accordionIds(wrapper)).toEqual(["M1", "M2", "M3"]);
    expect(mocks.store.loadHistory).toHaveBeenCalledTimes(1);
  });

  it("filters runs by the requested date range", async () => {
    const wrapper = await mountHistory();
    const [afterInput, beforeInput] = wrapper.findAll("input");

    await afterInput.setValue("2026-07-21T00:00");
    expect(accordionIds(wrapper)).toEqual(["M3", "M2"]);

    await beforeInput.setValue("2026-07-21T23:00");
    expect(accordionIds(wrapper)).toEqual(["M2"]);
  });

  it("explains when filters exclude every loaded run", async () => {
    const wrapper = await mountHistory();

    await wrapper.findAll("select")[0].setValue("pending");
    expect(accordionIds(wrapper)).toEqual([]);
    expect(wrapper.text()).toContain("No runs match the current filters");
    expect(wrapper.text()).not.toContain("No order sync history found");
  });

  it("keeps the empty-history message when the shop has no runs", async () => {
    const wrapper = await mountHistory({ batches: [], importsBySystemMessageId: {} });

    expect(wrapper.text()).toContain("No order sync history found");
  });

  it("surfaces the load error with a retry action", async () => {
    mocks.store = {
      shop: { name: "hotwax-demo" },
      loadHistory: vi.fn().mockRejectedValue(new Error("History request failed.")),
    };
    const wrapper = mount(ShopifyOrderSyncHistory, { props: { id: "10010" } });
    await flushPromises();

    expect(wrapper.text()).toContain("Order import history could not load");
    expect(wrapper.text()).toContain("History request failed.");

    mocks.store.loadHistory.mockResolvedValue(HISTORY_FIXTURE);
    const retry = wrapper.findAll("button").find((button) => button.text() === "Retry");
    await retry!.trigger("click");
    await flushPromises();

    expect(accordionIds(wrapper)).toEqual(["M3", "M2", "M1"]);
  });
});
