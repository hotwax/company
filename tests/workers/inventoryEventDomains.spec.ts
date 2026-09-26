/* eslint-disable require-await -- mocked async boundaries intentionally match worker/cache contracts */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The inventory event area's pollers, over in-memory caches. What matters here is what each poller asks
 * the OMS for — the cold first window, then one update cursor per field — and what it writes back.
 */

const state = vi.hoisted(() => ({
  domains: [] as any[],
  tables: {} as Record<string, Map<string, any>>,
  gets: [] as Array<{ url: string; params: Record<string, unknown> }>,
  pages: [] as any[],
  posts: [] as Array<{ url: string; data: any }>,
  responses: {} as Record<string, (params: Record<string, unknown>) => any>,
  writes: {} as Record<string, number>,
}));

function fakeCache(table: string, keyOf: (raw: any) => string | undefined, fields: string[]) {
  state.tables[table] ??= new Map();
  const rows = () => [...state.tables[table].values()];
  const project = (raw: any) => {
    const row: Record<string, any> = { raw, cachedAt: Date.now() };
    for(const field of fields) {if(raw[field] !== undefined) {row[field] = raw[field];}}

    return row;
  };

  return {
    table,
    all: vi.fn(async () => rows()),
    getMany: vi.fn(async (keys: string[]) => keys.map((key) => state.tables[table].get(key))),
    upsertMany: vi.fn(async (raws: any[]) => {
      for(const raw of raws) {state.tables[table].set(keyOf(raw)!, project(raw));}
      state.writes[table] = (state.writes[table] ?? 0) + raws.length;

      return raws.length;
    }),
    removeMany: vi.fn(async (keys: string[]) => { keys.forEach((key) => state.tables[table].delete(key)); }),
    newestCursor: vi.fn(async (field: string, scope?: { field: string; value: unknown }) => {
      let newest: number | undefined;
      for(const row of rows()) {
        if(scope && String(row.raw[scope.field]) !== String(scope.value)) {continue;}
        const value = Number(row.raw[field]);
        if(Number.isFinite(value) && row.raw[field] !== undefined && row.raw[field] !== null && (newest === undefined || value > newest)) {newest = value;}
      }

      return newest;
    }),
  };
}

const channelKey = (raw: any) => [raw.eventTypeId, raw.eventReferenceId, raw.inventoryChannelId, raw.shopifyInventoryItemId].join("|");
const locationKey = (raw: any) => [raw.eventTypeId, raw.eventReferenceId, raw.shopId, raw.shopifyLocationId, raw.shopifyInventoryItemId].join("|");
const itemKey = (raw: any) => `${raw.shopId}|${raw.shopifyInventoryItemId}`;

vi.mock("@/utils/cacheEntities", () => ({
  shopifyInventoryAdjustmentDetailProjection: { buildKey: channelKey },
  locationInventoryAdjustmentKey: locationKey,
  shopifyInventoryItemKey: (shopId: unknown, itemId: unknown) => `${shopId}|${itemId}`,
  shopifyInventoryAdjustmentDetailCache: fakeCache("channel", channelKey, ["shopId"]),
  shopifyLocationInventoryAdjustmentDetailCache: fakeCache("location", locationKey, ["shopId"]),
  systemMessageCache: fakeCache("systemMessages", (raw) => String(raw.systemMessageId), []),
  shopifyInventoryItemCache: fakeCache("shopifyInventoryItems", itemKey, ["shopId"]),
}));

vi.mock("@/workers/domains/workerFetch", () => ({
  workerGet: vi.fn(async (_ctx: any, url: string, params: Record<string, unknown>) => {
    state.gets.push({ url, params });

    return state.responses[url]?.(params) ?? [];
  }),
  workerPost: vi.fn(async (_ctx: any, url: string, data: any) => {
    state.posts.push({ url, data });

    return state.responses[`POST ${url}`]?.(data) ?? null;
  }),
  pageAll: vi.fn(async (options: any) => {
    state.pages.push(options);

    return state.responses[options.url]?.(options.params) ?? [];
  }),
}));

vi.mock("@/workers/syncRegistry", () => ({
  registerSyncDomain: (domain: any) => { state.domains.push(domain); },
}));

const ctx = { maargUrl: "https://example.test", token: "token" } as any;

async function load(name: string) {
  vi.resetModules();
  state.domains = [];
  await import("@/workers/domains/inventoryEventDomains");

  return state.domains.find((domain) => domain.name === name);
}

const locationRow = (over: Record<string, any> = {}) => ({
  eventTypeId: "POS_ISSUANCE", eventReferenceId: "1", shopId: "100002", shopifyLocationId: "LOC", shopifyInventoryItemId: "ITEM_1",
  computedInventoryChange: -1, createdDate: 1_000, detailLastUpdatedStamp: 1_000, ...over,
});

beforeEach(() => {
  for(const table of Object.values(state.tables)) {table.clear();}
  state.gets = [];
  state.pages = [];
  state.posts = [];
  state.responses = {};
  state.writes = {};
});

describe("the rows poller", () => {
  it("reads the shop's newest 500 on a cold cache", async () => {
    const domain = await load("shopifyLocationInventoryAdjustmentDetail");
    state.responses["sob/shopify/locationInventoryAdjustmentDetails"] = () => [locationRow()];

    await domain.sync(ctx, { shopId: "100002" });

    expect(state.gets).toEqual([{
      url: "sob/shopify/locationInventoryAdjustmentDetails",
      params: { shopId: "100002", orderByField: "-createdDate", pageSize: 500, pageIndex: 0 },
    }]);
    expect(state.tables.location.size).toBe(1);
  });

  it("then asks only for rows updated since its cursor, with an overlap", async () => {
    const domain = await load("shopifyInventoryAdjustmentDetail");
    state.tables.channel.set("seed", { raw: { shopId: "100002", detailLastUpdatedStamp: 500_000 }, shopId: "100002" });

    await domain.sync(ctx, { shopId: "100002" });

    expect(state.gets).toEqual([]);
    expect(state.pages[0]).toMatchObject({
      url: "sob/shopify/inventoryAdjustmentDetails",
      strictCollection: true,
      params: { shopId: "100002", detailLastUpdatedStamp_from: 440_000, orderByField: "detailLastUpdatedStamp" },
    });
  });

  it("stores the window from an OMS without update cursors, then rests until a manual refresh", async () => {
    const domain = await load("shopifyLocationInventoryAdjustmentDetail");
    // The older location service wraps its rows in `details`, and carries no update stamps.
    state.responses["sob/shopify/locationInventoryAdjustmentDetails"] = () => ({ details: [locationRow({ detailLastUpdatedStamp: undefined })] });

    expect(await domain.sync(ctx, { shopId: "100002" })).toBe(1);
    expect(state.tables.location.size).toBe(1);

    expect(await domain.sync(ctx, { shopId: "100002" })).toBe(0);
    expect(state.gets).toHaveLength(1);

    await domain.sync(ctx, { shopId: "100002" }, { force: true });
    expect(state.gets).toHaveLength(2);
    expect(state.gets[1].params).toMatchObject({ orderByField: "-createdDate", pageSize: 500 });
  });

  it("still reports a response it cannot read at all", async () => {
    const domain = await load("shopifyInventoryAdjustmentDetail");
    state.responses["sob/shopify/inventoryAdjustmentDetails"] = () => ({ unexpected: true });

    await expect(domain.sync(ctx, { shopId: "100002" })).rejects.toThrow(/unexpected response shape/);
  });

  it("does not rewrite rows a cursor read returns unchanged", async () => {
    const domain = await load("shopifyLocationInventoryAdjustmentDetail");
    const row = locationRow();
    state.tables.location.set(locationKey(row), { raw: row, shopId: "100002" });
    state.responses["sob/shopify/locationInventoryAdjustmentDetails"] = () => [row, locationRow({ eventReferenceId: "2", detailLastUpdatedStamp: 2_000 })];

    const written = await domain.sync(ctx, { shopId: "100002" });

    expect(written).toBe(1);
  });

  it("writes a window read whole, so rows cached in an older shape are re-projected", async () => {
    const domain = await load("shopifyInventoryAdjustmentDetail");
    const row = { ...locationRow(), inventoryChannelId: "IC_1", detailLastUpdatedStamp: undefined };
    // Cached by an older build: no top-level shopId, so this build's shop-scoped cursor cannot see it.
    state.tables.channel.set(channelKey(row), { raw: row });
    state.responses["sob/shopify/inventoryAdjustmentDetails"] = () => [row];

    expect(await domain.sync(ctx, { shopId: "100002" })).toBe(1);
    expect(state.tables.channel.get(channelKey(row)).shopId).toBe("100002");
  });

  it("reads nothing without a shop, rather than every shop", async () => {
    const domain = await load("shopifyInventoryAdjustmentDetail");

    expect(await domain.sync(ctx, {})).toBe(0);
    expect(state.gets).toEqual([]);
    expect(state.pages).toEqual([]);
  });
});

describe("the message poller", () => {
  it("waits until a cached row has been batched", async () => {
    const domain = await load("shopifyLocationInventoryAdjustmentDetailMessage");
    state.tables.location.set("a", { raw: locationRow(), shopId: "100002" });

    expect(await domain.sync(ctx, { shopId: "100002" })).toBe(0);
    expect(state.pages).toEqual([]);
  });

  it("asks for rows whose message changed since the newest message stamp", async () => {
    const domain = await load("shopifyLocationInventoryAdjustmentDetailMessage");
    const row = locationRow({ systemMessageId: "M1", systemMessageStatusId: "SmsgProduced", systemMessageLastUpdatedStamp: 900_000 });
    state.tables.location.set(locationKey(row), { raw: row, shopId: "100002" });
    state.responses["sob/shopify/locationInventoryAdjustmentDetails"] = () => [{ ...row, systemMessageStatusId: "SmsgSent", systemMessageLastUpdatedStamp: 950_000 }];

    const written = await domain.sync(ctx, { shopId: "100002" });

    expect(state.pages[0].params).toEqual({ shopId: "100002", systemMessageLastUpdatedStamp_from: 840_000, orderByField: "systemMessageLastUpdatedStamp" });
    expect(written).toBe(1);
    expect(state.tables.location.get(locationKey(row)).raw.systemMessageStatusId).toBe("SmsgSent");
  });
});

describe("the unsettled message poller", () => {
  it("re-reads only the messages that are still in flight, one by id", async () => {
    const domain = await load("inventoryEventSystemMessage");
    for(const [ref, status] of [["1", "SmsgProduced"], ["2", "SmsgSent"], ["3", "SmsgError"]]) {
      const row = locationRow({ eventReferenceId: ref, systemMessageId: `M${ref}`, systemMessageStatusId: status });
      state.tables.location.set(locationKey(row), { raw: row, shopId: "100002", cachedAt: 1 });
    }
    state.responses["admin/systemMessages"] = (params) => ({ systemMessages: [{ systemMessageId: params.systemMessageId, statusId: "SmsgSent" }] });

    await domain.sync(ctx, { shopId: "100002" });

    expect(state.gets.map((call) => call.params.systemMessageId).sort()).toEqual(["M1", "M3"]);
    expect(state.tables.systemMessages.size).toBe(2);
  });
});

describe("the product resolver", () => {
  const GID = "gid://shopify/InventoryItem/";

  /** A cached ledger row per inventory item, the later ones newer. */
  function cacheItems(itemIds: string[]) {
    itemIds.forEach((itemId, index) => {
      const row = locationRow({ eventReferenceId: String(index), shopifyInventoryItemId: itemId, createdDate: 1_000 + index });
      state.tables.location.set(locationKey(row), { raw: row, shopId: "100002" });
    });
  }

  /** Shopify's node for an inventory item, as `nodes(ids:)` returns it. */
  const itemNode = (itemId: string, variant: Record<string, any> = {}) => ({
    id: `${GID}${itemId}`,
    sku: `SKU-${itemId}`,
    variant: {
      id: `gid://shopify/ProductVariant/7${itemId}`, title: "Large", displayName: "Getty Wide Leg - Large", image: null,
      product: { id: `gid://shopify/Product/9${itemId}`, title: "Getty Wide Leg", featuredMedia: { preview: { image: { url: "https://cdn.test/product.jpg" } } } },
      ...variant,
    },
  });

  /** `shopify/graphql`'s envelope around Shopify's payload. */
  const envelope = (nodes: any[]) => ({ cost: {}, response: { nodes }, statusCode: 200 });
  const askedIds = (call: { data: any }) => call.data.variables.ids.map((id: string) => id.replace(GID, ""));

  it("asks Shopify in batches of 100, at most two per tick, newest rows first", async () => {
    const domain = await load("inventoryEventProduct");
    const itemIds = Array.from({ length: 250 }, (_, index) => String(10_000 + index));
    cacheItems(itemIds);
    state.responses["POST shopify/graphql"] = (data) => envelope(askedIds({ data }).map((id: string) => itemNode(id)));

    expect(await domain.sync(ctx, { shopId: "100002" })).toBe(200);

    expect(state.posts.map((call) => call.url)).toEqual(["shopify/graphql", "shopify/graphql"]);
    expect(state.posts[0].data).toMatchObject({ shopId: "100002", queryText: expect.stringContaining("nodes(ids: $ids)") });
    expect(state.posts[0].data.variables.ids[0]).toBe(`${GID}10249`);
    expect(state.posts.map((call) => call.data.variables.ids.length)).toEqual([100, 100]);

    await domain.sync(ctx, { shopId: "100002" });

    expect(state.posts).toHaveLength(3);
    expect(askedIds(state.posts[2])).toHaveLength(50);
    expect(state.tables.shopifyInventoryItems.size).toBe(250);

    await domain.sync(ctx, { shopId: "100002" });
    expect(state.posts).toHaveLength(3);
  });

  it("caches Shopify's SKU, variant and product, the variant's image before the product's", async () => {
    const domain = await load("inventoryEventProduct");
    cacheItems(["45457490215081", "45457490215082"]);
    state.responses["POST shopify/graphql"] = () => envelope([
      itemNode("45457490215081", { title: "O/S", image: { url: "https://cdn.test/variant.jpg" } }),
      itemNode("45457490215082"),
    ]);

    await domain.sync(ctx, { shopId: "100002" });

    expect(state.tables.shopifyInventoryItems.get("100002|45457490215081").raw).toEqual({
      shopId: "100002",
      shopifyInventoryItemId: "45457490215081",
      sku: "SKU-45457490215081",
      shopifyVariantId: "745457490215081",
      variantTitle: "O/S",
      variantDisplayName: "Getty Wide Leg - Large",
      shopifyProductId: "945457490215081",
      productTitle: "Getty Wide Leg",
      imageUrl: "https://cdn.test/variant.jpg",
    });
    expect(state.tables.shopifyInventoryItems.get("100002|45457490215082").raw.imageUrl).toBe("https://cdn.test/product.jpg");
  });

  it("asks about an item Shopify has no variant for once per worker, not once per tick", async () => {
    const domain = await load("inventoryEventProduct");
    cacheItems(["101", "102"]);
    state.responses["POST shopify/graphql"] = () => envelope([null, { id: `${GID}102`, sku: "", variant: null }]);

    await domain.sync(ctx, { shopId: "100002" });
    await domain.sync(ctx, { shopId: "100002" });

    expect(state.posts).toHaveLength(1);
    expect(state.tables.shopifyInventoryItems.size).toBe(0);
  });

  it("reports a failed lookup and asks for the same items again next tick", async () => {
    const domain = await load("inventoryEventProduct");
    cacheItems(["101"]);
    state.responses["POST shopify/graphql"] = () => ({
      cost: {}, statusCode: 200, response: { errors: [{ message: "Internal error", extensions: { code: "INTERNAL_SERVER_ERROR" } }] },
    });

    await expect(domain.sync(ctx, { shopId: "100002" })).rejects.toThrow(/Internal error/);

    state.responses["POST shopify/graphql"] = () => envelope([itemNode("101")]);
    await domain.sync(ctx, { shopId: "100002" });

    expect(askedIds(state.posts[1])).toEqual(["101"]);
    expect(state.tables.shopifyInventoryItems.size).toBe(1);
  });

  it.each([
    { name: "an OMS without the resource", respond: () => { throw { errorCode: 404, errors: "Resource shopify/graphql not valid" }; } },
    { name: "a shop whose Shopify token is refused", respond: () => ({ cost: {}, statusCode: 401, response: { errors: "[API] Invalid API key or access token" } }) },
  ])("treats $name as Shopify lookup unavailable, not as a failure", async ({ respond }) => {
    const domain = await load("inventoryEventProduct");
    cacheItems(["101"]);
    state.responses["POST shopify/graphql"] = respond;

    await expect(domain.sync(ctx, { shopId: "100002" })).resolves.toBe(0);
    await domain.sync(ctx, { shopId: "100002" });

    expect(state.posts).toHaveLength(1);
  });

  it("leaves an expired OMS session to the harness", async () => {
    const domain = await load("inventoryEventProduct");
    cacheItems(["101"]);
    state.responses["POST shopify/graphql"] = () => { throw { errorCode: 401, errors: "User must be logged in" }; };

    await expect(domain.sync(ctx, { shopId: "100002" })).rejects.toMatchObject({ errorCode: 401 });
  });

  it("stops for the tick when Shopify throttles, and asks again on the next", async () => {
    const domain = await load("inventoryEventProduct");
    cacheItems(Array.from({ length: 150 }, (_, index) => String(500 + index)));
    state.responses["POST shopify/graphql"] = () => ({ cost: {}, statusCode: 200, response: { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] } });

    await expect(domain.sync(ctx, { shopId: "100002" })).resolves.toBe(0);
    expect(state.posts).toHaveLength(1);

    await domain.sync(ctx, { shopId: "100002" });
    expect(state.posts).toHaveLength(2);
  });
});
