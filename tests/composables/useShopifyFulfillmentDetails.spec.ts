import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L1 unit — the exact-ID Shopify fulfillment read.
 *
 * Three rules under test:
 *   - the envelope: `shopify/graphql` nests Shopify's body under `response` NEXT TO its own
 *     `statusCode` (the shape that has silently broken order-sync reads before), and anything
 *     other than a clean 200-with-data resolves to `{ unavailable: true }` — the screen renders
 *     "Shopify unreachable", it never renders fabricated detail values;
 *   - item/order connections are fully paginated under that exact fulfillment; events request
 *     all delivery events from Shopify, with defensive client-side ordering;
 *   - a successful read is served from the session cache thereafter (one request per fulfillment
 *     per session), while an unavailable result is NOT remembered, so a blip heals on re-expand.
 */

const harness = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("@common", () => ({
  api: (...args: any[]) => harness.api(...args),
  commonUtil: { hasError: () => false, showToast: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  translate: (value: string) => value,
}));

vi.mock("@/services/appCacheBootstrap", () => ({
  refreshAfterMutation: vi.fn(),
  bootstrapState: { running: false },
}));

import { useShopifyFulfillmentDetails } from "@/composables/useShopifyFulfillment";

function graphqlEnvelope(fulfillment: any, errors?: any[]) {
  return {
    data: {
      statusCode: 200,
      response: {
        ...(errors ? { errors } : {}),
        fulfillment,
      },
    },
  };
}

const FULFILLMENT = {
  name: "#100488.1",
  status: "SUCCESS",
  displayStatus: "DELIVERED",
  totalQuantity: 2,
  location: { name: "HotWax Routing Retail" },
  inTransitAt: "2026-08-22T14:10:00Z",
  estimatedDeliveryAt: "2026-08-24T20:00:00Z",
  deliveredAt: "2026-08-24T15:22:00Z",
  trackingInfo: [{ company: "UPS", number: "1Z999AA10123456784" }],
  fulfillmentLineItems: {
    pageInfo: { hasNextPage: false, endCursor: null },
    edges: [
      { node: { quantity: 1, lineItem: { name: "Harbor Jacket", sku: "HBR-JK-NVY-L" } } },
      { node: { quantity: 1, lineItem: { name: "Harbor Scarf", sku: "HBR-SC-NVY-OS" } } },
    ],
  },
  events: {
    pageInfo: { hasNextPage: false, endCursor: null },
    edges: [
      { node: { happenedAt: "2026-08-22T14:10:00Z", status: "IN_TRANSIT", message: "Departed facility" } },
      { node: { happenedAt: "2026-08-24T15:22:00Z", status: "DELIVERED", message: "Delivered" } },
      { node: { happenedAt: "2026-08-22T08:14:00Z", status: "LABEL_PRINTED", message: "Label created" } },
      { node: { happenedAt: "2026-08-24T08:04:00Z", status: "OUT_FOR_DELIVERY", message: "Out for delivery" } },
      { node: { happenedAt: "2026-08-23T06:31:00Z", status: "IN_TRANSIT", message: "Arrived at facility" } },
      { node: { happenedAt: "2026-08-22T11:47:00Z", status: "IN_TRANSIT", message: "Picked up" } },
    ],
  },
  fulfillmentOrders: {
    pageInfo: { hasNextPage: false, endCursor: null },
    edges: [
      {
        node: {
          status: "ON_HOLD",
          requestStatus: "UNSUBMITTED",
          fulfillmentHolds: [{ reason: "AWAITING_PAYMENT" }, { reason: "HIGH_RISK_OF_FRAUD" }],
          deliveryMethod: { methodType: "SHIPPING" },
          destination: { city: "Boston", province: "MA", countryCode: "US" },
          fulfillBy: "2026-08-26T17:00:00Z",
        },
      },
    ],
  },
};

describe("useShopifyFulfillmentDetails", () => {
  beforeEach(() => {
    harness.api.mockReset();
  });

  it("maps the fulfillment with events sorted newest-first without truncation", async () => {
    harness.api.mockResolvedValue(graphqlEnvelope(FULFILLMENT));

    const { getFulfillmentDetails } = useShopifyFulfillmentDetails();
    const details = await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "4471301884" });

    expect(details).toMatchObject({
      name: "#100488.1",
      status: "SUCCESS",
      displayStatus: "DELIVERED",
      totalQuantity: 2,
      locationName: "HotWax Routing Retail",
      deliveredAt: "2026-08-24T15:22:00Z",
      trackingInfo: [{ company: "UPS", number: "1Z999AA10123456784" }],
      lineItems: [
        { quantity: 1, name: "Harbor Jacket", sku: "HBR-JK-NVY-L" },
        { quantity: 1, name: "Harbor Scarf", sku: "HBR-SC-NVY-OS" },
      ],
    });
    if(details.unavailable) {throw new Error("expected details");}

    // Six events arrived shuffled; all leave, newest first — the wire order is never trusted.
    expect(details.events.map((event) => event.status)).toEqual([
      "DELIVERED", "OUT_FOR_DELIVERY", "IN_TRANSIT", "IN_TRANSIT", "IN_TRANSIT", "LABEL_PRINTED",
    ]);
    expect(details.events).toHaveLength(6);

    expect(details.fulfillmentOrders).toEqual([{
      status: "ON_HOLD",
      requestStatus: "UNSUBMITTED",
      holds: ["AWAITING_PAYMENT", "HIGH_RISK_OF_FRAUD"],
      deliveryMethod: "SHIPPING",
      destination: "Boston, MA, US",
      fulfillBy: "2026-08-26T17:00:00Z",
    }]);

    // The request carried the shop scope and the gid built from the legacy numeric id.
    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      url: "shopify/graphql",
      method: "post",
      data: expect.objectContaining({
        shopId: "10000",
        variables: expect.objectContaining({ id: "gid://shopify/Fulfillment/4471301884" }),
      }),
    }));
  });

  it("continues only unfinished connections on the same exact fulfillment", async () => {
    harness.api.mockResolvedValueOnce(graphqlEnvelope({ ...FULFILLMENT,
      fulfillmentOrders: { ...FULFILLMENT.fulfillmentOrders, pageInfo: { hasNextPage: true, endCursor: "orders-1" } },
    })).mockResolvedValueOnce(graphqlEnvelope({
      fulfillmentOrders: { edges: [{ node: { status: "CLOSED" } }], pageInfo: { hasNextPage: false, endCursor: "orders-2" } },
    }));
    const result = await useShopifyFulfillmentDetails().getFulfillmentDetails({ shopId: "10000", fulfillmentId: "paged-1" });
    if(result.unavailable) throw new Error("expected complete result");
    expect(result.fulfillmentOrders).toHaveLength(2);
    expect(result.lineItems).toHaveLength(2);
    expect(harness.api.mock.calls[1][0].data.variables).toEqual({
      id: "gid://shopify/Fulfillment/paged-1", itemsAfter: null, ordersAfter: "orders-1", eventsAfter: null,
      includeItems: false, includeOrders: true, includeEvents: false,
    });
    expect(harness.api.mock.calls[0][0].data.queryText).toContain("sortKey: HAPPENED_AT, reverse: true");
  });

  it("paginates all Shopify timeline events", async () => {
    harness.api.mockResolvedValueOnce(graphqlEnvelope({ ...FULFILLMENT,
      events: { edges: Array.from({ length: 50 }, (_, i) => ({ node: { status: "IN_TRANSIT", happenedAt: `2026-09-07T10:00:${String(i).padStart(2, "0")}Z` } })), pageInfo: { hasNextPage: true, endCursor: "events-50" } },
    })).mockResolvedValueOnce(graphqlEnvelope({
      events: { edges: [{ node: { status: "LABEL_PRINTED", happenedAt: "2026-09-07T09:00:00Z" } }], pageInfo: { hasNextPage: false, endCursor: "events-51" } },
    }));
    const result = await useShopifyFulfillmentDetails().getFulfillmentDetails({ shopId: "10000", fulfillmentId: "events-paged" });
    if(result.unavailable) throw new Error("expected complete timeline");
    expect(result.events).toHaveLength(51);
    expect(result.rawFulfillment?.events.edges).toHaveLength(51);
    expect(harness.api.mock.calls[1][0].data.variables).toMatchObject({ eventsAfter: "events-50", includeEvents: true, includeItems: false, includeOrders: false });
  });

  it("does not cache an incomplete response when a cursor repeats", async () => {
    harness.api.mockResolvedValue(graphqlEnvelope({ ...FULFILLMENT,
      fulfillmentLineItems: { ...FULFILLMENT.fulfillmentLineItems, pageInfo: { hasNextPage: true, endCursor: "stuck" } },
    }));
    const read = useShopifyFulfillmentDetails().getFulfillmentDetails;
    expect(await read({ shopId: "10000", fulfillmentId: "stuck-1" })).toEqual({ unavailable: true });
    expect(harness.api).toHaveBeenCalledTimes(2);
    harness.api.mockResolvedValue(graphqlEnvelope(FULFILLMENT));
    expect(await read({ shopId: "10000", fulfillmentId: "stuck-1" })).toMatchObject({ name: FULFILLMENT.name });
  });

  it("serves a repeat expand from the session cache — one request per fulfillment", async () => {
    harness.api.mockResolvedValue(graphqlEnvelope(FULFILLMENT));

    const { getFulfillmentDetails } = useShopifyFulfillmentDetails();
    const first = await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "cache-hit-1" });
    const second = await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "cache-hit-1" });

    expect(second).toBe(first);
    expect(harness.api).toHaveBeenCalledTimes(1);
  });

  it("bypasses cached data for a fresh downloadable snapshot", async () => {
    harness.api.mockResolvedValueOnce(graphqlEnvelope(FULFILLMENT)).mockResolvedValueOnce(graphqlEnvelope({ ...FULFILLMENT, status: "CANCELLED", updatedAt: "2026-09-08T01:00:00Z" }));
    const read = useShopifyFulfillmentDetails().getFulfillmentDetails;
    await read({ shopId: "10000", fulfillmentId: "fresh-snapshot" });
    const result = await read({ shopId: "10000", fulfillmentId: "fresh-snapshot", forceRefresh: true });
    expect(harness.api).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ rawFulfillment: { status: "CANCELLED", updatedAt: "2026-09-08T01:00:00Z" } });
  });

  it("keys the session cache per shop, so a shared numeric id cannot cross shops", async () => {
    harness.api.mockResolvedValue(graphqlEnvelope(FULFILLMENT));

    const { getFulfillmentDetails } = useShopifyFulfillmentDetails();
    await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "shared-77" });
    await getFulfillmentDetails({ shopId: "10010", fulfillmentId: "shared-77" });

    expect(harness.api).toHaveBeenCalledTimes(2);
  });

  it("scopes by systemMessageRemoteId when that is all the caller has", async () => {
    harness.api.mockResolvedValue(graphqlEnvelope(FULFILLMENT));

    const { getFulfillmentDetails } = useShopifyFulfillmentDetails();
    await getFulfillmentDetails({ systemMessageRemoteId: "HCDemoShopifyConfig", fulfillmentId: "remote-scope-1" });

    expect(harness.api).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ systemMessageRemoteId: "HCDemoShopifyConfig" }),
    }));
    expect(harness.api.mock.calls[0][0].data).not.toHaveProperty("shopId");
  });

  it("resolves unavailable — and does not cache it — for every non-answer", async () => {
    const { getFulfillmentDetails } = useShopifyFulfillmentDetails();

    // Passthrough reports Shopify unreachable.
    harness.api.mockResolvedValue({ data: { statusCode: 502, response: null } });
    expect(await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "sad-1" }))
      .toEqual({ unavailable: true });

    // GraphQL-level errors, even with a 200 transport.
    harness.api.mockResolvedValue(graphqlEnvelope(null, [{ message: "Throttled" }]));
    expect(await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "sad-2" }))
      .toEqual({ unavailable: true });

    // A clean 200 whose data holds no fulfillment (unknown id).
    harness.api.mockResolvedValue(graphqlEnvelope(null));
    expect(await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "sad-3" }))
      .toEqual({ unavailable: true });

    // The transport itself failing.
    harness.api.mockRejectedValue(new Error("network down"));
    expect(await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "sad-4" }))
      .toEqual({ unavailable: true });

    // No scope / no id — never a blind request.
    expect(await getFulfillmentDetails({ fulfillmentId: "sad-5" })).toEqual({ unavailable: true });
    expect(await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "" })).toEqual({ unavailable: true });

    // The blip heals: the same id asked again after a failure goes back to the wire.
    harness.api.mockResolvedValue(graphqlEnvelope(FULFILLMENT));
    const healed = await getFulfillmentDetails({ shopId: "10000", fulfillmentId: "sad-4" });
    expect(healed).toMatchObject({ name: "#100488.1" });
  });
});
