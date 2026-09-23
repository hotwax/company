import { describe, expect, it } from "vitest";

import { hostOf, reconcileWebhookTopics, topicToSubscriptionTopic } from "@/utils/shopifyWebhookReconciliation";

/**
 * L1 unit — the transfer sync page's webhook reconciliation.
 *
 * Subscription health is derived here, not read from a health endpoint: the OMS's own consumable
 * vocabulary (Enumeration rows of type ShopifyMessageTypeEnum) IS the required set, so required vs
 * subscribed is answerable from data the page already holds.
 *
 * Two states carry the weight. `noConsumer` — Shopify sends a topic with no Enumeration row, which
 * `receive#WebhookPayload` ACKs and drops without an error, so it is silent data loss. `elsewhere`
 * — the subscription exists but its callback points at another host, which is the difference
 * between "subscribed" and "arriving here".
 */

const enumRows = [
  { enumId: "InventoryTransfersCreate", enumCode: "inventory_transfers/create", description: "Create" },
  { enumId: "InventoryTransfersCancel", enumCode: "inventory_transfers/cancel", description: "Cancel" },
  { enumId: "InventoryShipmentsCreate", enumCode: "inventory_shipments/create", description: "Ship create" },
  { enumId: "OrdersUpdated", enumCode: "orders/updated", description: "Orders" },
];
const PREFIXES = ["INVENTORY_TRANSFERS_", "INVENTORY_SHIPMENTS_"];
const OMS = "https://oms.example/rest/s1/";
const HERE = "https://oms.example/rest/s1/shopify/webhook/payload";
const THERE = "https://test-maarg.hotwax.io/rest/s1/shopify/webhook/payload";

const sub = (topic: string, uri = HERE) => ({ node: { id: `gid://x/${topic}`, topic, uri } });
const rowFor = (result: any, topic: string) => result.rows.find((r: any) => r.topic === topic);

describe("helpers", () => {
  it("converts an enumCode to the subscription topic form", () => {
    expect(topicToSubscriptionTopic("inventory_transfers/add_items")).toBe("INVENTORY_TRANSFERS_ADD_ITEMS");
  });

  it("extracts a host and tolerates junk", () => {
    expect(hostOf(THERE)).toBe("test-maarg.hotwax.io");
    expect(hostOf("not a url")).toBeUndefined();
    expect(hostOf(undefined)).toBeUndefined();
  });
});

describe("reconcileWebhookTopics", () => {
  it("derives required from the OMS vocabulary and counts what is subscribed", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_CREATE")],
      enumRows,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    // Three in-scope enum topics; orders/updated is out of scope.
    expect(result.summary.requiredCount).toBe(3);
    expect(result.summary.subscribedCount).toBe(1);
    expect(result.summary.missingCount).toBe(2);
    expect(rowFor(result, "INVENTORY_TRANSFERS_CREATE").status).toBe("subscribed");
  });

  it("flags a subscription whose callback points at another host", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_CREATE", THERE)],
      enumRows,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    const row = rowFor(result, "INVENTORY_TRANSFERS_CREATE");
    expect(row.status).toBe("elsewhere");
    expect(row.uriHost).toBe("test-maarg.hotwax.io");
    expect(result.summary.elsewhereCount).toBe(1);
  });

  it("does NOT claim the callback is wrong when no OMS base url is supplied", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_CREATE", THERE)],
      enumRows,
      topicPrefixes: PREFIXES,
    });
    expect(rowFor(result, "INVENTORY_TRANSFERS_CREATE").status).toBe("subscribed");
    expect(result.summary.elsewhereCount).toBe(0);
    // The card must be able to say the check did not run rather than imply a clean result.
    expect(result.summary.endpointAsserted).toBe(false);
  });

  it("flags a subscribed topic with NO enumeration row as noConsumer — the payload is dropped", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_UNMAPPED")],
      enumRows,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    expect(rowFor(result, "INVENTORY_TRANSFERS_UNMAPPED").status).toBe("noConsumer");
    expect(result.summary.noConsumerCount).toBe(1);
  });

  it("collapses a duplicated topic to one row and flags it", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_CREATE"), sub("INVENTORY_TRANSFERS_CREATE")],
      enumRows,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    expect(result.rows.filter((r: any) => r.topic === "INVENTORY_TRANSFERS_CREATE")).toHaveLength(1);
    expect(rowFor(result, "INVENTORY_TRANSFERS_CREATE").status).toBe("duplicate");
    expect(result.summary.duplicateCount).toBe(1);
    // A duplicate is still subscribed, so it must not also be counted missing.
    expect(result.summary.missingCount).toBe(2);
  });

  it("counts received messages per message type, not per topic string", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_CREATE"), sub("INVENTORY_TRANSFERS_CANCEL")],
      enumRows,
      receivedRows: [
        { systemMessageTypeId: "InventoryTransfersCreate" },
        { systemMessageTypeId: "InventoryTransfersCreate" },
        { systemMessageTypeId: "OrdersUpdated" },
      ],
      receivedTotal: 3,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    expect(rowFor(result, "INVENTORY_TRANSFERS_CREATE").receivedCount).toBe(2);
    expect(rowFor(result, "INVENTORY_TRANSFERS_CANCEL").receivedCount).toBe(0);
    expect(result.receivedTruncated).toBe(false);
  });

  it("reports truncation when the backlog is deeper than the fetched page", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_CREATE")],
      enumRows,
      receivedRows: [{ systemMessageTypeId: "InventoryTransfersCreate" }],
      receivedTotal: 940,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    expect(result.receivedTruncated).toBe(true);
    expect(result.receivedTotal).toBe(940);
  });

  it("keeps out-of-scope topics off the table but still counts them", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [sub("INVENTORY_TRANSFERS_CREATE"), sub("ORDERS_UPDATED"), sub("PRODUCTS_UPDATE")],
      enumRows,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    expect(result.rows.some((r: any) => r.topic === "ORDERS_UPDATED")).toBe(false);
    expect(result.otherSubscriptionCount).toBe(2);
  });

  it("accepts bare nodes as well as edges", () => {
    const result = reconcileWebhookTopics({
      subscriptions: [{ id: "gid://x/1", topic: "INVENTORY_TRANSFERS_CREATE", uri: HERE }],
      enumRows,
      topicPrefixes: PREFIXES,
      omsBaseUrl: OMS,
    });
    expect(rowFor(result, "INVENTORY_TRANSFERS_CREATE").uri).toBe(HERE);
  });
});
