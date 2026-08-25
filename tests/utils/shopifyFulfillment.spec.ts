import { describe, expect, it } from "vitest";
import {
  QUEUED_FULFILLMENT_MESSAGE_TYPE_ID,
  QUEUED_FULFILLMENT_STATUS_IDS,
  fulfillmentSyncDomains,
  parseFulfillmentMessageText,
} from "@/utils/shopifyFulfillment";

/**
 * L1 unit — the pure half of the fulfillment sync data layer.
 *
 * `parseFulfillmentMessageText` is the piece that must never throw: `messageText` is a stored
 * payload produced by a connector service, and a malformed one is exactly the row an operator is
 * on the page to inspect. `fulfillmentSyncDomains` is the screen's activation contract — the
 * message domain syncs only DECLARED types, so this list existing (and refusing an unscoped pull)
 * is what makes CreateShopifyFulfillment messages fresh at all.
 */

describe("parseFulfillmentMessageText", () => {
  it("recovers the shipment detail from a well-formed payload", () => {
    const parsed = parseFulfillmentMessageText(JSON.stringify({
      shipmentId: "SHP-88214",
      orderId: "RAI-100461",
      shopifyOrderId: "5734893781",
      trackingNumber: "1Z999AA10123456784",
      carrierPartyId: "UPS",
      shipmentItems: [
        { orderItemSeqId: "00001", productId: "P100", quantity: 2, shopifyLineItemId: "14882301" },
        { orderItemSeqId: "00002", productId: "P200", quantity: "1", shopifyLineItemId: "14882302" },
      ],
    }));

    expect(parsed).toEqual({
      shipmentId: "SHP-88214",
      orderId: "RAI-100461",
      shopifyOrderId: "5734893781",
      trackingNumber: "1Z999AA10123456784",
      items: [
        { orderItemSeqId: "00001", productId: "P100", quantity: 2, shopifyLineItemId: "14882301" },
        { orderItemSeqId: "00002", productId: "P200", quantity: 1, shopifyLineItemId: "14882302" },
      ],
    });
  });

  it("accepts the lineItems alias the live connector actually stores", () => {
    // rails-oms payloads name the list `lineItems` (older send path uses `shipmentItems`); which
    // key a message carries depends on which service generation queued it.
    const parsed = parseFulfillmentMessageText(JSON.stringify({
      shipmentId: "SHP-88604",
      orderId: "RAI-100480",
      lineItems: [{ orderItemSeqId: "01", productId: "P2", quantity: 2, shopifyLineItemId: "L2" }],
    }));

    expect(parsed.items).toEqual([
      { orderItemSeqId: "01", productId: "P2", quantity: 2, shopifyLineItemId: "L2" },
    ]);
  });

  it("degrades missing fields to empty values instead of undefined holes", () => {
    const parsed = parseFulfillmentMessageText(JSON.stringify({
      shipmentId: "SHP-88604",
      shipmentItems: [{ shopifyLineItemId: "14883501" }, "not-an-object", null],
    }));

    expect(parsed.shipmentId).toBe("SHP-88604");
    expect(parsed.orderId).toBe("");
    expect(parsed.shopifyOrderId).toBe("");
    expect(parsed.trackingNumber).toBe("");
    expect(parsed.items).toEqual([
      { orderItemSeqId: "", productId: "", shopifyLineItemId: "14883501" },
    ]);
    expect(parsed.items[0]).not.toHaveProperty("quantity");
  });

  it("never throws on malformed input — the broken row is the one the operator needs to see", () => {
    const empty = { shipmentId: "", orderId: "", shopifyOrderId: "", trackingNumber: "", items: [] };

    expect(parseFulfillmentMessageText("{ not json")).toEqual(empty);
    expect(parseFulfillmentMessageText("[1,2,3]")).toEqual(empty);
    expect(parseFulfillmentMessageText("\"just a string\"")).toEqual(empty);
    expect(parseFulfillmentMessageText("")).toEqual(empty);
    expect(parseFulfillmentMessageText(undefined)).toEqual(empty);
    expect(parseFulfillmentMessageText(42)).toEqual(empty);
  });
});

describe("fulfillmentSyncDomains", () => {
  it("declares the screen's own message type and the shop-scoped history feed", () => {
    const domains = fulfillmentSyncDomains({
      shopId: "10000",
      systemMessageRemoteIds: ["HCDemoShopifyConfig"],
      intervalMs: 10_000,
    });

    expect(domains).toEqual([
      {
        name: "systemMessage",
        intervalMs: 10_000,
        args: {
          types: [{ systemMessageTypeId: QUEUED_FULFILLMENT_MESSAGE_TYPE_ID, total: 50 }],
          systemMessageRemoteIds: ["HCDemoShopifyConfig"],
        },
      },
      {
        name: "shopifyFulfillmentHistory",
        intervalMs: 10_000,
        args: { shopId: "10000" },
      },
    ]);
  });

  it("falls back to the config scope when the screen has not resolved exact remotes", () => {
    const domains = fulfillmentSyncDomains({ shopId: "10000", historyTotal: 300 });

    expect(domains[0].args).not.toHaveProperty("systemMessageRemoteIds");
    expect(domains[1].args).toEqual({ shopId: "10000", total: 300 });
  });

  it("activates nothing for an unresolved shop — never an unscoped pull", () => {
    expect(fulfillmentSyncDomains({ shopId: "" })).toEqual([]);
    expect(fulfillmentSyncDomains({ shopId: "   " })).toEqual([]);
  });

  it("covers exactly the statuses the queue renders", () => {
    // A contract guard for the page-wiring side: the queue's definition of "not landed yet".
    expect([...QUEUED_FULFILLMENT_STATUS_IDS]).toEqual(["SmsgProduced", "SmsgSending", "SmsgError"]);
  });
});
