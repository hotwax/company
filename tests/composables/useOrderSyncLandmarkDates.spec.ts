import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();

vi.mock("@common", () => ({
  api: (...args: any[]) => api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

/**
 * L1 unit — landmark dates are PER SHOP, and are fetched once per session.
 *
 * `SystemProperty`'s key is (`systemResourceId`, `systemPropertyId`) and for these two properties the
 * resource id is the shop id. The bug these lock down: the reader used
 * `rows.find(r => r.systemPropertyId === id)`, taking the first row regardless of shop, so shop 10010
 * displayed shop 10000's launch date; and the writer omitted `systemResourceId` entirely, so saving
 * from one shop's screen did not address that shop's row. Both are silent — wrong dates render
 * exactly like right ones.
 *
 * The module holds its load-once state at module scope, so each test re-imports it fresh.
 */
const SERVER_ROWS = [
  { systemResourceId: "10000", systemPropertyId: "newOrderSync.launchDate", systemPropertyValue: "2026-06-11 01:40:57.072" },
  { systemResourceId: "10000", systemPropertyId: "orderSyncHistory.lastSyncDate", systemPropertyValue: "2026-04-14 03:12:45.223" },
  // Note: 10010 has NO lastSyncDate row — the "not set for this shop" case.
  { systemResourceId: "10010", systemPropertyId: "newOrderSync.launchDate", systemPropertyValue: "2026-06-11 02:04:04.15" },
];

async function freshModule(rows: any[] = SERVER_ROWS) {
  vi.resetModules();
  api.mockReset();
  api.mockImplementation(async (config: any) =>
    config?.method === "put" ? { data: {} } : { data: rows });
  return import("@/composables/useShopify");
}

describe("useOrderSyncLandmarkDates — per-shop reads", () => {
  beforeEach(() => { api.mockReset(); });

  it("gives each shop its OWN dates, not the first row it finds", async () => {
    const { useOrderSyncLandmarkDates } = await freshModule();
    const shopA = useOrderSyncLandmarkDates("10000");
    const shopB = useOrderSyncLandmarkDates("10010");

    await shopA.load();

    expect(shopA.landmarkDates.value.launchDate).toBe("2026-06-11 01:40:57.072");
    expect(shopB.landmarkDates.value.launchDate).toBe("2026-06-11 02:04:04.15");
  });

  it("reports a date the shop genuinely lacks as empty, not as another shop's value", async () => {
    const { useOrderSyncLandmarkDates } = await freshModule();
    const shopB = useOrderSyncLandmarkDates("10010");

    await shopB.load();

    // 10000 has a lastSyncDate; 10010 does not. The old reader returned 10000's.
    expect(shopB.landmarkDates.value.historyLastSyncDate).toBe("");
  });

  it("reports an unknown shop as empty rather than throwing", async () => {
    const { useOrderSyncLandmarkDates } = await freshModule();
    const unknown = useOrderSyncLandmarkDates("99999");

    await unknown.load();

    expect(unknown.landmarkDates.value.launchDate).toBe("");
    expect(unknown.landmarkDates.value.status).toBe("ready");
  });
});

describe("useOrderSyncLandmarkDates — load once", () => {
  it("fetches once no matter how many shops or callers ask", async () => {
    const { useOrderSyncLandmarkDates } = await freshModule();
    const shopA = useOrderSyncLandmarkDates("10000");
    const shopB = useOrderSyncLandmarkDates("10010");

    await Promise.all([shopA.load(), shopB.load(), shopA.load()]);
    await shopB.load();

    expect(api.mock.calls.filter(([c]: any) => c.method === "get")).toHaveLength(1);
  });

  it("stays retryable after a failure instead of caching the error forever", async () => {
    vi.resetModules();
    api.mockReset();
    api.mockRejectedValueOnce(new Error("boom"));
    const { useOrderSyncLandmarkDates } = await import("@/composables/useShopify");
    const shop = useOrderSyncLandmarkDates("10000");

    await shop.load();
    expect(shop.landmarkDates.value.status).toBe("error");

    api.mockImplementation(async () => ({ data: SERVER_ROWS }));
    await shop.load();

    expect(shop.landmarkDates.value.status).toBe("ready");
    expect(shop.landmarkDates.value.launchDate).toBe("2026-06-11 01:40:57.072");
  });
});

describe("useOrderSyncLandmarkDates — writes", () => {
  it("addresses THIS shop's row and updates local state without re-reading", async () => {
    const { useOrderSyncLandmarkDates } = await freshModule();
    const shopB = useOrderSyncLandmarkDates("10010");
    await shopB.load();

    await shopB.save("historyLastSyncDate", "2026-06-11 02:04:04");

    const put = api.mock.calls.map(([c]: any) => c).find((c: any) => c.method === "put");
    expect(put.data).toEqual({
      systemResourceId: "10010",
      systemPropertyId: "orderSyncHistory.lastSyncDate",
      systemPropertyValue: "2026-06-11 02:04:04",
    });

    // Local state reflects the write...
    expect(shopB.landmarkDates.value.historyLastSyncDate).toBe("2026-06-11 02:04:04");
    // ...and no second GET was issued to learn what we just sent.
    expect(api.mock.calls.filter(([c]: any) => c.method === "get")).toHaveLength(1);
  });

  it("leaves the other shop's value alone", async () => {
    const { useOrderSyncLandmarkDates } = await freshModule();
    const shopA = useOrderSyncLandmarkDates("10000");
    const shopB = useOrderSyncLandmarkDates("10010");
    await shopA.load();

    await shopB.save("historyLastSyncDate", "2026-06-11 02:04:04");

    expect(shopA.landmarkDates.value.historyLastSyncDate).toBe("2026-04-14 03:12:45.223");
  });

  it("refuses to write without a shop, rather than creating an unaddressed row", async () => {
    const { useOrderSyncLandmarkDates } = await freshModule();
    const noShop = useOrderSyncLandmarkDates("");

    await expect(noShop.save("launchDate", "2026-06-11 02:04:04")).rejects.toThrow(/Shopify shop/);
    expect(api.mock.calls.filter(([c]: any) => c.method === "put")).toHaveLength(0);
  });
});
