/* eslint-disable require-await -- mocks intentionally model async worker/cache boundaries */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  domains: [] as any[],
  /** Rows each endpoint should return, keyed by url. */
  pages: {} as Record<string, any[]>,
  /** Per url: an error to throw, or "hang" for a request the server never answers. */
  failures: {} as Record<string, any>,
  signals: {} as Record<string, AbortSignal | undefined>,
  fetched: [] as Array<{ url: string; params: any }>,
  snapshots: [] as Array<{ rows: any[]; scope: any }>,
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: vi.fn(async ({ url, params, signal }: any) => {
    state.fetched.push({ url, params });
    state.signals[url] = signal;
    const failure = state.failures[url];
    if(failure === "hang") {return new Promise(() => undefined);}
    if(failure) {throw failure;}

    return state.pages[url] ?? [];
  }),
}));

vi.mock("@/utils/cacheEntities", () => ({
  shopifyTransferPendingCache: {
    snapshotReplace: vi.fn(async (rows: any[], scope: any) => {
      state.snapshots.push({ rows, scope });

      return { written: rows.length, pruned: 0 };
    }),
  },
}));

vi.mock("@/workers/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => { state.domains.push(domain); },
}));

async function loadDomain() {
  vi.resetModules();
  state.domains = [];
  await import("@/workers/domains/shopifyTransferSyncDomain");

  return state.domains.find((domain) => domain.name === "shopifyTransferSync");
}

const CTX = { maargUrl: "https://example.test", token: "token" };

describe("Shopify transfer sync worker domain", () => {
  beforeEach(() => {
    state.pages = {};
    state.failures = {};
    state.fetched = [];
    state.snapshots = [];
    vi.useRealTimers();
  });

  it("reads all five outstanding-work segments, each scoped to the shop", async () => {
    const domain = await loadDomain();

    await domain.sync(CTX, { shopId: "SHOP_A" });

    expect(state.fetched.map((call) => call.url).sort()).toEqual([
      "sob/shopify/transferSync/pendingCancellation",
      "sob/shopify/transferSync/pendingCreate",
      "sob/shopify/transferSync/pendingItemChange",
      "sob/shopify/transferSync/pendingReceipt",
      "sob/shopify/transferSync/pendingShipment",
    ]);
    // Every read is shop-scoped: an unscoped one would cache another shop's work as this shop's.
    expect(state.fetched.every((call) => call.params.shopId === "SHOP_A")).toBe(true);
  });

  it("tags each row with its segment and normalises the segment's own timestamp", async () => {
    state.pages["sob/shopify/transferSync/pendingShipment"] = [
      { shopId: "SHOP_A", orderId: "ORDER-1", shipmentStatusId: "ST-1", statusDate: 1000 },
    ];
    state.pages["sob/shopify/transferSync/pendingReceipt"] = [
      { shopId: "SHOP_A", orderId: "ORDER-1", receiptId: "R-1", datetimeReceived: 2000 },
    ];
    const domain = await loadDomain();

    await domain.sync(CTX, { shopId: "SHOP_A" });

    const rows = state.snapshots.flatMap((snapshot) => snapshot.rows);
    const shipment = rows.find((row: any) => row.shipmentStatusId === "ST-1");
    const receipt = rows.find((row: any) => row.receiptId === "R-1");

    expect(shipment.segment).toBe("shipment");
    expect(shipment.occurredAt).toBe(1000);
    expect(receipt.segment).toBe("receipt");
    // Each segment carries its own date field; the cache sorts on the normalised one.
    expect(receipt.occurredAt).toBe(2000);
  });

  it("snapshots each segment scoped to the shop and segment, so a drained segment stops rendering as outstanding", async () => {
    const domain = await loadDomain();

    await domain.sync(CTX, { shopId: "SHOP_A" });

    expect(state.snapshots).toHaveLength(5);
    // Scoped, not global: pruning must never reach another shop's rows, or a segment not read this pass.
    expect(state.snapshots.map((snapshot) => snapshot.scope.value[1]).sort())
      .toEqual(["cancellation", "create", "itemChange", "receipt", "shipment"]);
    expect(state.snapshots.every((snapshot) => snapshot.scope.field === "[shopId+segment]" &&
      snapshot.scope.value[0] === "SHOP_A")).toBe(true);
    // Zero rows back from a segment still snapshots, which is what prunes a resolved backlog.
    expect(state.snapshots.every((snapshot) => snapshot.rows.length === 0)).toBe(true);
  });

  it("writes the segments that answered and reports the ones that failed, keeping their cached rows", async () => {
    state.pages["sob/shopify/transferSync/pendingCancellation"] = [
      { shopId: "SHOP_A", orderId: "ORDER-9", orderStatusId: "OS-1", orderStatusDatetime: 10 },
    ];
    state.failures["sob/shopify/transferSync/pendingReceipt"] = {
      errorCode: 500,
      errors: "Error finding list of ShopifyPendingTransferReceipt",
    };
    const domain = await loadDomain();

    const error: any = await domain.sync(CTX, { shopId: "SHOP_A" }).catch((err: any) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("receipt");
    expect(Object.keys(error.details.failedSegments)).toEqual(["receipt"]);
    expect(error.details.failedSegments.receipt.message).toBe("Error finding list of ShopifyPendingTransferReceipt");
    expect(error.details.loadedSegments.sort()).toEqual(["cancellation", "create", "itemChange", "shipment"]);
    // The failed segment is never snapshotted, so its cached rows are not pruned to nothing.
    expect(state.snapshots.map((snapshot) => snapshot.scope.value[1])).not.toContain("receipt");
    expect(state.snapshots.find((snapshot) => snapshot.scope.value[1] === "cancellation")!.rows).toHaveLength(1);
  });

  it("backs a failed segment off instead of re-reading it every tick, and a forced sync bypasses it", async () => {
    state.failures["sob/shopify/transferSync/pendingCreate"] = { errorCode: 500, errors: "timed out" };
    const domain = await loadDomain();
    const createReads = () => state.fetched.filter((call) => call.url.endsWith("pendingCreate")).length;

    await domain.sync(CTX, { shopId: "SHOP_A" }).catch(() => undefined);
    expect(createReads()).toBe(1);

    // The next scheduled tick skips it, still reporting it as failed with its next retry time.
    const skipped: any = await domain.sync(CTX, { shopId: "SHOP_A" }).catch((err: any) => err);
    expect(createReads()).toBe(1);
    expect(skipped.details.failedSegments.create.retryAt).toBeGreaterThan(Date.now());
    // Healthy segments keep refreshing meanwhile.
    expect(state.fetched.filter((call) => call.url.endsWith("pendingShipment"))).toHaveLength(2);

    // A manual retry reads it at once, and a success clears the backoff.
    delete state.failures["sob/shopify/transferSync/pendingCreate"];
    await expect(domain.sync(CTX, { shopId: "SHOP_A" }, { force: true })).resolves.toBe(0);
    expect(createReads()).toBe(2);
    await domain.sync(CTX, { shopId: "SHOP_A" });
    expect(createReads()).toBe(3);
  });

  it("doubles the backoff on each consecutive failure, up to the cap", async () => {
    const mod: any = await import("@/workers/domains/shopifyTransferSyncDomain");
    state.failures["sob/shopify/transferSync/pendingShipment"] = { errorCode: 500, errors: "slow" };
    const domain = await loadDomain();
    const retryDelay = async () => {
      const before = Date.now();
      const error: any = await domain.sync(CTX, { shopId: "SHOP_A" }, { force: true }).catch((err: any) => err);

      return error.details.failedSegments.shipment.retryAt - before;
    };

    const first = await retryDelay();
    const second = await retryDelay();
    expect(first).toBeGreaterThanOrEqual(mod.SEGMENT_BACKOFF_BASE_MS);
    expect(first).toBeLessThan(mod.SEGMENT_BACKOFF_BASE_MS + 1_000);
    expect(second).toBeGreaterThanOrEqual(mod.SEGMENT_BACKOFF_BASE_MS * 2);
    for(let attempt = 0; attempt < 8; attempt++) {await retryDelay();}
    expect(await retryDelay()).toBeLessThan(mod.SEGMENT_BACKOFF_MAX_MS + 1_000);
  });

  it("stops waiting on a segment the server never answers, so the pass always settles", async () => {
    vi.useFakeTimers();
    state.failures["sob/shopify/transferSync/pendingShipment"] = "hang";
    const domain = await loadDomain();
    const mod: any = await import("@/workers/domains/shopifyTransferSyncDomain");

    const outcome = domain.sync(CTX, { shopId: "SHOP_A" }).catch((err: any) => err);
    await vi.advanceTimersByTimeAsync(mod.SEGMENT_TIMEOUT_MS);
    const error: any = await outcome;

    expect(error.details.failedSegments.shipment.message).toContain("did not answer within 45 seconds");
    expect(error.details.loadedSegments).toHaveLength(4);
    // The abandoned walk is told to stop, so it requests no further page in the background.
    expect(state.signals["sob/shopify/transferSync/pendingShipment"]!.aborted).toBe(true);
    expect(state.signals["sob/shopify/transferSync/pendingReceipt"]!.aborted).toBe(false);
  });

  it("rethrows an expired session untouched, so the harness re-authenticates instead of backing off", async () => {
    const expired = { errorCode: 401, errors: "Login key not valid" };
    state.failures["sob/shopify/transferSync/pendingReceipt"] = expired;
    const domain = await loadDomain();

    await expect(domain.sync(CTX, { shopId: "SHOP_A" })).rejects.toBe(expired);
    delete state.failures["sob/shopify/transferSync/pendingReceipt"];
    // No backoff was recorded: the next tick reads it again.
    await expect(domain.sync(CTX, { shopId: "SHOP_A" })).resolves.toBe(0);
    expect(state.fetched.filter((call) => call.url.endsWith("pendingReceipt"))).toHaveLength(2);
  });

  it("maps every segment to a distinct pending and synced resource", async () => {
    const mod: any = await import("@/workers/domains/shopifyTransferSyncDomain");
    const segments = mod.PENDING_SEGMENTS as string[];

    const urls = segments.flatMap((segment) => [
      mod.segmentEndpoint(segment, "pending"),
      mod.segmentEndpoint(segment, "synced"),
    ]);

    // Ten resources, no collisions: a direction is chosen by picking a resource, so a pending
    // list can never be turned into a synced one by dropping a query parameter.
    expect(urls).toHaveLength(10);
    expect(new Set(urls).size).toBe(10);
    expect(mod.segmentEndpoint("receipt", "pending")).toBe("sob/shopify/transferSync/pendingReceipt");
    expect(mod.segmentEndpoint("receipt", "synced")).toBe("sob/shopify/transferSync/syncedReceipt");
  });

  it("does nothing without a shop, rather than pruning on an unscoped read", async () => {
    const domain = await loadDomain();

    const written = await domain.sync(CTX, {});

    expect(written).toBe(0);
    expect(state.fetched).toEqual([]);
    expect(state.snapshots).toEqual([]);
  });
});
