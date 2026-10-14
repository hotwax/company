// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, onMounted, ref } from "vue";

const OPERATION_ID = "gid://shopify/BulkOperation/77";

const harness = vi.hoisted(() => ({
  historyPage: vi.fn(),
  requestShopifyBulkOperation: vi.fn(),
  requestSystemMessageErrors: vi.fn(),
  showToast: vi.fn(),
}));
/** What each live read holds: the rows the sync worker has stored, and whether its first read landed. */
const live = vi.hoisted(() => ({ tables: {} as Record<string, { records: any; hydrated: any }> }));

vi.mock("@ionic/vue", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  onIonViewWillEnter: (cb: any) => onMounted(cb),
}));
vi.mock("@common", () => ({
  commonUtil: { showToast: (...args: any[]) => harness.showToast(...args) },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (key: string) => key,
  useLiveEntity: (table: string) => live.tables[table],
}));
vi.mock("@/db/companyDb", () => ({ companyDb: { tables: new Proxy({}, { get: (_target, table) => table }) } }));
vi.mock("@/services/appDbSync", () => ({ refreshAfterMutation: vi.fn() }));
vi.mock("@/composables/useSystemMessage", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useSystemMessage: () => ({
    fetchSystemMessageLogDetailsPage: harness.historyPage,
    requestShopifyBulkOperation: harness.requestShopifyBulkOperation,
    requestSystemMessageErrors: harness.requestSystemMessageErrors,
  }),
}));
vi.mock("@/composables/useShopify", () => ({
  useShopifyShop: () => ({ record: ref({ shopId: "SHOP" }) }),
  useShopifySyncContext: () => ({ remoteIds: ref(["REMOTE"]), hydrated: ref(true) }),
}));
vi.mock("@/composables/useSeed", () => ({ useStatuses: () => ({ statusItems: ref({}) }) }));
vi.mock("@/composables/useDataManager", () => ({
  useDataManager: () => ({ downloadDataManagerFile: vi.fn(), fetchLogDetails: vi.fn() }),
}));

/** Captures the runs the page hands its list. */
const HistoryList = defineComponent({ props: { runs: { type: Array, default: () => [] } }, template: "<div />" });

const serverMessage = (overrides: Record<string, any> = {}) => ({
  systemMessageId: "M1",
  systemMessageRemoteId: "REMOTE",
  remoteMessageId: OPERATION_ID,
  statusId: "SmsgConsumed",
  initDate: 1_000,
  ...overrides,
});

function table(records: any[] = [], hydrated = true) {
  return { records: ref(records), hydrated: ref(hydrated) };
}

async function mountView() {
  const { default: View } = await import("@/views/ShopifyProductSyncHistory.vue");
  const wrapper = mount(View, {
    props: { id: "SHOP" },
    global: { stubs: { ShopifyProductSyncHistoryView: HistoryList, IonBackButton: true, IonInfiniteScroll: true, IonInfiniteScrollContent: true } },
  });
  await flushPromises();

  return wrapper;
}

const runsOf = (wrapper: any) => wrapper.findComponent(HistoryList).props("runs") as any[];

beforeEach(() => {
  vi.resetModules();
  for (const mock of Object.values(harness)) mock.mockReset();
  live.tables = {
    systemMessages: table(),
    systemMessageErrors: table(),
    shopifyBulkOperations: table(),
  };
  harness.historyPage.mockResolvedValue({ systemMessageLogDetails: [serverMessage()], systemMessageLogDetailsCount: 1 });
  harness.requestShopifyBulkOperation.mockResolvedValue(undefined);
  harness.requestSystemMessageErrors.mockResolvedValue(undefined);
});

describe("ShopifyProductSyncHistory - run detail read live", () => {
  it("shows a stored finished operation without asking Shopify", async () => {
    live.tables.shopifyBulkOperations = table([{ id: OPERATION_ID, status: "COMPLETED", objectCount: 4, rootObjectCount: 2 }]);
    const wrapper = await mountView();

    expect(harness.requestShopifyBulkOperation).not.toHaveBeenCalled();
    expect(runsOf(wrapper)[0]).toMatchObject({ bulkOperationStatus: "COMPLETED", objectCount: 4, rootObjectCount: 2, loading: false });
  });

  it("asks nothing before the tables have loaded, then only for the operation they lack", async () => {
    live.tables.shopifyBulkOperations = table([], false);
    const wrapper = await mountView();

    expect(harness.requestShopifyBulkOperation).not.toHaveBeenCalled();
    expect(runsOf(wrapper)[0].loading).toBe(true);

    live.tables.shopifyBulkOperations.hydrated.value = true;
    await flushPromises();

    expect(harness.requestShopifyBulkOperation).toHaveBeenCalledTimes(1);
    expect(harness.requestShopifyBulkOperation).toHaveBeenCalledWith(OPERATION_ID, "REMOTE");
    // A consumed message cannot carry errors, so none are asked for.
    expect(harness.requestSystemMessageErrors).not.toHaveBeenCalled();
  });

  it("asks again for an operation stored before it finished", async () => {
    live.tables.shopifyBulkOperations = table([{ id: OPERATION_ID, status: "RUNNING" }]);
    await mountView();

    expect(harness.requestShopifyBulkOperation).toHaveBeenCalledWith(OPERATION_ID, "REMOTE");
  });

  it("shows the result once the worker stores it, with no reload", async () => {
    harness.requestShopifyBulkOperation.mockImplementation(async () => {
      live.tables.shopifyBulkOperations.records.value = [{ id: OPERATION_ID, status: "COMPLETED", objectCount: 0 }];
    });
    const wrapper = await mountView();

    // Completed with nothing to import: reported as skipped rather than pending forever.
    expect(runsOf(wrapper)[0]).toMatchObject({ bulkOperationStatus: "COMPLETED", mdmStatus: "skipped", loading: false });
  });

  it("follows the stored message's status over the page's copy, and shows its errors", async () => {
    live.tables.systemMessages = table([serverMessage({ statusId: "SmsgError" })]);
    live.tables.systemMessageErrors = table([{ systemMessageId: "M1", errorDate: 5, errorText: "Throttled by Shopify" }]);
    const wrapper = await mountView();

    expect(runsOf(wrapper)[0]).toMatchObject({ systemMessageStatusId: "SmsgError", systemMessageErrorText: "Throttled by Shopify" });
    // Its errors are stored, so they are not asked for again.
    expect(harness.requestSystemMessageErrors).not.toHaveBeenCalled();
  });

  it("asks for a failed message's errors when none are stored", async () => {
    harness.historyPage.mockResolvedValue({ systemMessageLogDetails: [serverMessage({ statusId: "SmsgError" })], systemMessageLogDetailsCount: 1 });
    await mountView();

    expect(harness.requestSystemMessageErrors).toHaveBeenCalledWith("M1");
  });

  it("stops the spinner and keeps the run pending when Shopify cannot be asked", async () => {
    harness.requestShopifyBulkOperation.mockRejectedValue(new Error("Shopify unavailable"));
    const wrapper = await mountView();

    expect(runsOf(wrapper)[0]).toMatchObject({ bulkOperationStatus: "pending", loading: false });
  });

  it("asks nothing for a run with no bulk operation", async () => {
    harness.historyPage.mockResolvedValue({
      systemMessageLogDetails: [serverMessage({ remoteMessageId: undefined, statusId: "SmsgError" })],
      systemMessageLogDetailsCount: 1,
    });
    const wrapper = await mountView();

    expect(harness.requestShopifyBulkOperation).not.toHaveBeenCalled();
    expect(harness.requestSystemMessageErrors).not.toHaveBeenCalled();
    expect(runsOf(wrapper)[0].loading).toBeFalsy();
  });
});
