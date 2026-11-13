// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchSampleLabelOrders: vi.fn(),
  fetchOrdersWithoutShipment: vi.fn(),
}));

vi.mock("@common", () => ({
  commonUtil: { showToast: vi.fn() },
  logger: { error: vi.fn() },
  translate: (key: string) => key,
}));
vi.mock("@/composables/useFedexSetup", () => ({
  useFedexSetup: () => ({
    fetchSampleLabelOrders: h.fetchSampleLabelOrders,
    fetchOrdersWithoutShipment: h.fetchOrdersWithoutShipment,
    generateLabel: vi.fn(),
  }),
}));

const empty = { orders: [], hasMore: true };
const order = (id: string) => ({ shipmentId: id, orderId: id, itemCount: 1, hasShipment: true });

describe("SampleLabelOrdersModal paging", () => {
  beforeEach(() => {
    h.fetchSampleLabelOrders.mockReset();
    h.fetchOrdersWithoutShipment.mockReset().mockResolvedValue([]);
  });

  it("continues from the last page fetched after a run of empty pages", async () => {
    const Modal = (await import("@/components/fedex/SampleLabelOrdersModal.vue")).default;
    h.fetchSampleLabelOrders.mockResolvedValue(empty);
    const wrapper = mount(Modal, { props: { productStoreId: "STORE" } });
    await flushPromises();

    const first = h.fetchSampleLabelOrders.mock.calls.map((call) => call[0].pageIndex);
    expect(first).toEqual([0, 1, 2, 3, 4]);

    h.fetchSampleLabelOrders.mockReset().mockResolvedValue({ orders: [order("S1")], hasMore: false });
    await (wrapper.vm as any).loadMore({ target: { complete: vi.fn() } });
    expect(h.fetchSampleLabelOrders.mock.calls[0][0].pageIndex).toBe(5);
  });
});
