import { describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("@common", () => ({
  api: (...args: any[]) => api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

import { fetchUnsyncedProductUpdateCount } from "@/composables/useShopify";

/**
 * L1 unit — the Shopify `updated_at` filter must carry an ISO 8601 timestamp.
 *
 * The bug: cache projections coerce every date field to epoch millis, and the unsynced-product count
 * interpolated a cached `initDate` straight into the query. Shopify received
 * `updated_at:>'1784618182975'` and answered 400 `INTERNAL_SERVER_ERROR`, which the function's own
 * catch turned into a count of `0`. The card then displayed "Unsynced events 0" — a plausible number,
 * with a swallowed HTTP error behind it. Both halves are covered here: the format, and the refusal to
 * report a failure as a zero.
 */
const MILLIS = 1784618182975;
const ISO = new Date(MILLIS).toISOString();

const okResponse = { data: { data: { productsCount: { count: 7, precision: "EXACT" } } } };

function queryOf() {
  return api.mock.calls[0][0].data.queryText as string;
}

describe("fetchUnsyncedProductUpdateCount — timestamp format", () => {
  it("converts cached epoch millis to ISO", async () => {
    api.mockReset().mockResolvedValue(okResponse);

    await fetchUnsyncedProductUpdateCount("RemoteB", MILLIS);

    expect(queryOf()).toContain(`updated_at:>'${ISO}'`);
    expect(queryOf()).not.toContain(String(MILLIS));
  });

  it("converts a numeric STRING of millis too — how cached values often arrive", async () => {
    api.mockReset().mockResolvedValue(okResponse);

    await fetchUnsyncedProductUpdateCount("RemoteB", String(MILLIS));

    expect(queryOf()).toContain(`updated_at:>'${ISO}'`);
  });

  it("passes an ISO string through unchanged in meaning", async () => {
    api.mockReset().mockResolvedValue(okResponse);

    await fetchUnsyncedProductUpdateCount("RemoteB", ISO);

    expect(queryOf()).toContain(`updated_at:>'${ISO}'`);
  });

  it("handles the SQL-ish 'yyyy-MM-dd HH:mm:ss' spelling some payloads use", async () => {
    api.mockReset().mockResolvedValue(okResponse);

    await fetchUnsyncedProductUpdateCount("RemoteB", "2026-06-11 01:40:57");

    /**
     * Asserted as "a valid ISO instant", not a specific wall clock: a zoneless timestamp is read as
     * LOCAL time, so the UTC form shifts by the runner's offset (2026-06-11 01:40 local becomes
     * 2026-06-10T20:10Z at UTC-5). Pinning the literal would make this test machine-dependent.
     *
     * This path is defensive rather than live — `lastSyncedAt` reaches this function as cached millis.
     * If a zoneless value ever does become the real input, the offset ambiguity needs deciding against
     * what the server means, not guessing here.
     */
    const match = queryOf().match(/updated_at:>'([^']+)'/);
    expect(match).not.toBeNull();
    expect(Number.isNaN(new Date(match![1]).getTime())).toBe(false);
    expect(match![1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("omits the filter entirely when there is no last-sync date", async () => {
    api.mockReset().mockResolvedValue(okResponse);

    await fetchUnsyncedProductUpdateCount("RemoteB", undefined);

    expect(queryOf()).not.toContain("updated_at");
    expect(queryOf()).toContain("productsCount");
  });

  it("omits the filter rather than sending an unparseable one", async () => {
    api.mockReset().mockResolvedValue(okResponse);

    await fetchUnsyncedProductUpdateCount("RemoteB", "not-a-date");

    expect(queryOf()).not.toContain("updated_at");
  });
});

describe("fetchUnsyncedProductUpdateCount — failure is not a zero", () => {
  it("throws when Shopify returns errors, instead of reporting 0", async () => {
    api.mockReset().mockResolvedValue({
      data: { errors: [{ message: "Internal error.", extensions: { code: "INTERNAL_SERVER_ERROR" } }] },
    });

    await expect(fetchUnsyncedProductUpdateCount("RemoteB", MILLIS)).rejects.toThrow(/unsynced product count/i);
  });

  it("returns the real count on success", async () => {
    api.mockReset().mockResolvedValue(okResponse);

    await expect(fetchUnsyncedProductUpdateCount("RemoteB", MILLIS)).resolves.toBe(7);
  });

  it("makes no request at all without a remote", async () => {
    api.mockReset();

    await expect(fetchUnsyncedProductUpdateCount("", MILLIS)).resolves.toBe(0);
    expect(api).not.toHaveBeenCalled();
  });
});

import { fetchShopifyShopProductCount } from "@/composables/useShopify";

/**
 * Same bug class, second site: the PORTED store functions build their `updated_at` filter through
 * `buildProductUpdatesCountQuery`, a different path from `fetchUnsyncedProductUpdateCount` above.
 * When the product-sync page moved onto the spine, its `lastSyncedAt` became cached epoch millis and
 * flowed into these builders raw — reproducing the Shopify 400 the first fix never covered. The
 * normalisation now lives INSIDE the builders, so every caller is safe; these pin that.
 */
describe("fetchShopifyShopProductCount — timestamp format through the ported builder", () => {
  const countResponse = { data: { data: { productsCount: { count: 3, precision: "EXACT" } } } };

  it("converts spine millis to ISO inside the builder", async () => {
    api.mockReset().mockResolvedValue(countResponse);

    await fetchShopifyShopProductCount({ systemMessageRemoteId: "RemoteB", lastSyncedAt: MILLIS });

    expect(queryOf()).toContain(`updated_at:>'${ISO}'`);
    expect(queryOf()).not.toContain(String(MILLIS));
  });

  it("normalises a millis date arriving via syncRunState — the spine's actual hand-off shape", async () => {
    // An empty explicit `lastSyncedAt` falls back to `syncRunState.lastSyncedAt` (and only derives via
    // a fetch when neither exists — deliberate, and out of unit scope here).
    api.mockReset().mockResolvedValue(countResponse);

    await fetchShopifyShopProductCount({
      systemMessageRemoteId: "RemoteB",
      syncRunState: { lastSyncedAt: MILLIS },
    });

    expect(queryOf()).toContain(`updated_at:>'${ISO}'`);
  });
});
