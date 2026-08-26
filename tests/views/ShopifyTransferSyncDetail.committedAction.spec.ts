// @vitest-environment jsdom
/* eslint-disable require-await -- mocks intentionally model async UI and worker boundaries */
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const harness = vi.hoisted(() => ({
  afterMutation: vi.fn(),
  fetchDetail: vi.fn(),
  retryUpdateLog: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: (...args: any[]) => harness.showToast(...args) },
  logger: { error: vi.fn(), warn: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@ionic/vue", async (importOriginal) => {
  const actual = await importOriginal<any>();

  return {
    ...actual,
    alertController: {
      create: vi.fn(async () => ({
        present: vi.fn(async () => undefined),
        onDidDismiss: vi.fn(async () => ({ role: "confirm" })),
      })),
    },
    onIonViewWillEnter: (callback: () => unknown) => { void callback(); },
    onIonViewDidLeave: vi.fn(),
  };
});

vi.mock("@/composables/useCacheSync", () => ({
  useCacheSync: () => ({
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    afterMutation: (...args: any[]) => harness.afterMutation(...args),
  }),
}));

vi.mock("@/composables/useShopifyTransferSync", () => ({
  SUPPRESSION_PURPOSES: ["SUPRS_TO_SHIPPED", "SUPRS_TO_RECEIPT", "SUPRS_TO_CANCEL", "SUPRS_TO_ITEM_CHG"],
  useShopifyTransferSyncRow: () => ({ row: ref({ orderName: "Transfer 1" }) }),
  useShopifyTransferSyncDetail: () => ({
    fetchTransferSyncDetail: (...args: any[]) => harness.fetchDetail(...args),
  }),
  useShopifyTransferSyncMutations: () => ({
    retryUpdateLog: (...args: any[]) => harness.retryUpdateLog(...args),
    resolveUpdateLog: vi.fn(),
    suppressActivityCandidate: vi.fn(),
    cancelSuppressionTask: vi.fn(),
  }),
}));

vi.mock("@/store/user", () => ({
  useUserStore: () => ({ hasPermission: () => true }),
}));

vi.mock("@/utils", () => ({ formatDateTime: () => "" }));
vi.mock("@/utils/shopifyTransferSync", () => ({
  normalizeTransferSyncLines: () => [],
  stageColor: () => "medium",
  stageLabel: () => "Queued",
}));

vi.mock("@/authorization/actions", () => ({
  default: { APP_SHOPIFY_TRANSFER_SYNC_ADMIN: "APP_SHOPIFY_TRANSFER_SYNC_ADMIN" },
}));

vi.mock("@/components/common/SystemMessageDetailsModal.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/shopify-order-sync/ShopifyOrderSyncMdmLogModal.vue", () => ({ default: { template: "<div />" } }));

const initialDetail = {
  owner: { orderId: "ORDER_1", orderName: "Transfer 1", syncStage: "UPDATE_BLOCKED" },
  updateLogs: [{ logId: "LOG_1", statusId: "DmlsFailed", failedRecordCount: 1 }],
};

describe("Shopify transfer sync committed actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.fetchDetail.mockResolvedValueOnce(initialDetail).mockRejectedValueOnce(new Error("detail unavailable"));
    harness.retryUpdateLog.mockResolvedValue({ available: true });
    harness.afterMutation.mockRejectedValue(new Error("cache unavailable"));
  });

  it("does not present a committed retry as retryable when both refresh paths fail", async () => {
    const ShopifyTransferSyncDetail = (await import("@/views/ShopifyTransferSyncDetail.vue")).default;
    const wrapper = mount(ShopifyTransferSyncDetail, {
      props: { id: "SHOP_A", orderId: "ORDER_1" },
      global: {
        stubs: {
          IonBackButton: true,
          IonModal: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();

    const retryAction = wrapper.findAll("ion-button").find((button) => button.text().trim() === "Retry");
    expect(retryAction).toBeDefined();
    await retryAction!.trigger("click");
    await flushPromises();

    expect(harness.retryUpdateLog).toHaveBeenCalledTimes(1);
    expect(harness.showToast).toHaveBeenCalledWith("Retry started");
    expect(wrapper.text()).toContain("This transfer could not be loaded");
    expect(wrapper.text()).not.toContain("Blocked - retry available");
  });

  it("reports a failed list reconciliation separately when the committed detail reload succeeds", async () => {
    harness.fetchDetail.mockReset();
    harness.fetchDetail.mockResolvedValueOnce(initialDetail).mockResolvedValueOnce({
      owner: { orderId: "ORDER_1", orderName: "Transfer 1", syncStage: "UPDATING" },
      updateLogs: [{ logId: "LOG_1", statusId: "DmlsFinished", failedRecordCount: 0 }],
    });
    const ShopifyTransferSyncDetail = (await import("@/views/ShopifyTransferSyncDetail.vue")).default;
    const wrapper = mount(ShopifyTransferSyncDetail, {
      props: { id: "SHOP_A", orderId: "ORDER_1" },
      global: {
        stubs: {
          IonBackButton: true,
          IonModal: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();

    const retryAction = wrapper.findAll("ion-button").find((button) => button.text().trim() === "Retry");
    await retryAction!.trigger("click");
    await flushPromises();

    expect(harness.retryUpdateLog).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain("Blocked - retry available");
    const reconciliationMessage = "The action completed and this detail was reloaded, but the transfer list could not be refreshed.";
    expect(harness.showToast).toHaveBeenCalledWith(reconciliationMessage);
  });
});
