import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOrderArrivals, summarizeArrivals } from "@/composables/useOrderArrivalMetrics";

const mocks = vi.hoisted(() => ({ api: vi.fn(), search: vi.fn() }));
vi.mock("@common", () => ({ api: mocks.api, useSolrSearch: () => ({ runSolrQuery: mocks.search }) }));

const now = Date.UTC(2026, 10, 27, 22);
function order(id: number, age: number, delay = 15_000) {
  return { orderId: String(id), entryDate: new Date(now - age).toISOString(),
    orderDate: new Date(now - age - delay).toISOString() };
}
function page(docs: ReturnType<typeof order>[]) {
  return { data: { grouped: { orderId: { groups: docs.map(doc => ({ doclist: { docs: [doc] } })) } } } };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.mockImplementation(({ data }) => {
    const ids: string[] = JSON.parse("[" + data.variables.orders.slice("orderId:".length) + "]");
    return { data: { data: {
      orders: { edges: ids.map(orderId => ({ node: { orderId,
        shopifyOrder: { shopId: orderId === "foreign" ? "other" : "shop", shopifyOrderId: orderId } } })) },
      orderItemAssocs: { edges: ids.includes("exchange") ? [{ node: { orderId: "exchange" } }] : [], pageInfo: { hasNextPage: false } },
    } } };
  });
});

describe("order arrival metrics", () => {
  it("pages beyond 100, excludes other shops and exchanges, and counts a late first import by entry date", async () => {
    const recent = Array.from({ length: 100 }, (_, i) => order(i, i * 1000));
    const late = order(100, 3_600_000, 86_400_000);
    mocks.search.mockResolvedValueOnce(page(recent)).mockResolvedValueOnce(page([
      { ...late, orderId: "foreign" }, { ...late, orderId: "exchange" }, late,
    ]));
    const result = await readOrderArrivals("shop", "store", now, () => true);
    expect(summarizeArrivals(result, now)).toMatchObject({ count: 101, medianMs: 15_000, latest: { orderId: "0" } });
    expect(summarizeArrivals(result, now + 1000).count).toBe(100);
    expect(mocks.search.mock.calls[1][0].json.params.start).toBe(100);
  });

  it("keeps the last order visible through a quiet hour and reuses the previous lookup", async () => {
    const old = order(42, 7_200_000);
    mocks.search.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([old])).mockResolvedValueOnce(page([]));
    const first = await readOrderArrivals("shop", "store", now, () => true);
    const next = await readOrderArrivals("shop", "store", now + 60_000, () => true, first);
    expect(summarizeArrivals(next, next.asOf)).toMatchObject({ count: 0, medianMs: undefined, latest: { orderId: "42" } });
    expect(mocks.search).toHaveBeenCalledTimes(3);
  });

  it("rejects an incomplete read instead of publishing a partial count", async () => {
    mocks.search.mockResolvedValueOnce(page([order(1, 0)]));
    mocks.api.mockResolvedValueOnce({ data: { errors: [{ message: "lookup failed" }] } });
    await expect(readOrderArrivals("shop", "store", now, () => true)).rejects.toThrow();
  });
});
