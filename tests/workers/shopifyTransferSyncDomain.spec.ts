/* eslint-disable require-await -- mocks intentionally model async worker/cache boundaries */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  domains: [] as any[],
  webhookResponse: undefined as any,
  webhookUpserts: [] as any[][],
  webhookRemovals: [] as string[],
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  pageAll: vi.fn(async () => []),
  pageNewestFirst: vi.fn(async () => []),
  workerGet: vi.fn(async () => state.webhookResponse),
}));

vi.mock("@/utils/cacheEntities", () => ({
  shopifyTransferSyncCache: {
    upsertMany: vi.fn(async (rows: any[]) => rows.length),
  },
  shopifyTransferWebhookHealthCache: {
    upsertMany: vi.fn(async (rows: any[]) => {
      state.webhookUpserts.push(rows);

      return rows.length;
    }),
    remove: vi.fn(async (shopId: string) => { state.webhookRemovals.push(shopId); }),
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

describe("Shopify transfer sync worker domain", () => {
  beforeEach(() => {
    state.webhookResponse = undefined;
    state.webhookUpserts = [];
    state.webhookRemovals = [];
  });

  it("removes a previously cached health result when the verifier reports unavailable", async () => {
    state.webhookResponse = { available: false, message: "Verifier unavailable" };
    const domain = await loadDomain();

    await domain.sync({ maargUrl: "https://example.test", token: "token" }, { shopId: "SHOP_A" });

    expect(state.webhookUpserts).toEqual([]);
    expect(state.webhookRemovals).toEqual(["SHOP_A"]);
  });
});
