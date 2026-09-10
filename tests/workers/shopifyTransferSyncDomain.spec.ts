/* eslint-disable require-await -- mocks intentionally model async worker/cache boundaries */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  domains: [] as any[],
  /** Rows each endpoint should return, keyed by url. */
  pages: {} as Record<string, any[]>,
  fetched: [] as Array<{ url: string; params: any }>,
  snapshots: [] as Array<{ rows: any[]; scope: any }>,
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: vi.fn(async ({ url, params }: any) => {
    state.fetched.push({ url, params });

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
    state.fetched = [];
    state.snapshots = [];
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

    const rows = state.snapshots[0].rows;
    const shipment = rows.find((row: any) => row.shipmentStatusId === "ST-1");
    const receipt = rows.find((row: any) => row.receiptId === "R-1");

    expect(shipment.segment).toBe("shipment");
    expect(shipment.occurredAt).toBe(1000);
    expect(receipt.segment).toBe("receipt");
    // Each segment carries its own date field; the cache sorts on the normalised one.
    expect(receipt.occurredAt).toBe(2000);
  });

  it("snapshots scoped to the shop, so a drained segment stops rendering as outstanding", async () => {
    const domain = await loadDomain();

    await domain.sync(CTX, { shopId: "SHOP_A" });

    expect(state.snapshots).toHaveLength(1);
    // Scoped, not global: pruning must never reach another shop's cached rows.
    expect(state.snapshots[0].scope).toEqual({ field: "shopId", value: "SHOP_A" });
    // Zero rows back from every segment still snapshots, which is what prunes a resolved backlog.
    expect(state.snapshots[0].rows).toEqual([]);
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
