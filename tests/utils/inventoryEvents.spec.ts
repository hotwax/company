import { describe, expect, it } from "vitest";
import {
  changeEntriesOf,
  deliveryStateOf,
  deltaOutcome,
  effectiveMessageOf,
  filterInventoryEvents,
  groupInventoryEventBatches,
  isUnsettledMessage,
  ledgerRetentionOf,
  roundDelta,
  sourceOf,
  sumDelta,
  summarizeInventoryEvents,
  toInventoryEvent,
  toMetafieldInventoryEvent,
} from "@/utils/inventoryEvents";
import { canonicalEventTypeId, isReservationEventType, sourceRootFor } from "@/utils/inventoryEventSourceRoots";
import { SYSTEM_MESSAGE_STATUS_IDS } from "@/utils/systemMessage";

const DELIVERY_STATES = ["waiting", "noChange", "inFlight", "error", "sent", "cancelled"];

const channelRow = (overrides: Record<string, any> = {}) => ({
  eventTypeId: "SIE_RECEIPT", eventReferenceId: "R1", eventTypeDescription: "Inbound shipment receipt",
  inventoryChannelId: "IC_1", shopId: "100002", shopifyLocationId: "LOC_AGG", shopifyInventoryItemId: "ITEM_1",
  computedInventoryChange: 1, createdDate: 1_000, shopifyReason: "received", ...overrides,
});

const locationRow = (overrides: Record<string, any> = {}) => ({
  eventTypeId: "POS_ISSUANCE", eventReferenceId: "201843", eventTypeDescription: "POS sale issuance",
  shopId: "100002", shopifyLocationId: "LOC_STORE", shopifyInventoryItemId: "ITEM_2",
  computedInventoryChange: -1, createdDate: 2_000, ...overrides,
});

describe("deliveryStateOf — one rule for both ledgers, no status column", () => {
  it("classifies every message status, known or not, into a state", () => {
    for(const statusId of [...SYSTEM_MESSAGE_STATUS_IDS, "SmsgSomethingNew", ""]) {
      for(const messageId of ["BATCH_1", undefined]) {
        for(const delta of [0, 1, -3]) {
          expect(DELIVERY_STATES).toContain(deliveryStateOf(messageId, delta, statusId).id);
        }
      }
    }
  });

  it("reads an unbatched row from its delta alone", () => {
    expect(deliveryStateOf(undefined, 2).id).toBe("waiting");
    expect(deliveryStateOf(undefined, 0).id).toBe("noChange");
    // Float noise is a zero, the way the OMS's BigDecimal settles it.
    expect(deliveryStateOf(undefined, 0.1 + 0.2 - 0.3).id).toBe("noChange");
  });

  it.each([
    ["SmsgSent", "sent", false], ["SmsgConsumed", "sent", false], ["SmsgConfirmed", "sent", false],
    ["SmsgError", "error", true], ["SmsgCancelled", "cancelled", false], ["SmsgRejected", "cancelled", false],
    ["SmsgProduced", "inFlight", true], ["SmsgSending", "inFlight", true], ["SmsgSomethingNew", "inFlight", true],
  ])("reads a batched row's %s as %s, and keeps polling it: %s", (statusId, state, unsettled) => {
    expect(deliveryStateOf("B", 1, statusId as string).id).toBe(state);
    expect(isUnsettledMessage(statusId as string)).toBe(unsettled);
  });
});

describe("effectiveMessageOf — the fresher of the two cached reads wins", () => {
  const raw = { systemMessageId: "B", systemMessageStatusId: "SmsgProduced", systemMessageProcessedDate: 5 };

  it("uses whichever read landed later", () => {
    expect(effectiveMessageOf(raw, 200, { statusId: "SmsgError", syncedAt: 100 })?.statusId).toBe("SmsgProduced");
    expect(effectiveMessageOf(raw, 100, { statusId: "SmsgSent", syncedAt: 200 })?.statusId).toBe("SmsgSent");
  });

  it("has no message for an unbatched row", () => {
    expect(effectiveMessageOf({ systemMessageId: "" }, 1, { statusId: "SmsgSent", syncedAt: 2 })).toBeUndefined();
  });
});

describe("toInventoryEvent — both ledgers become one row", () => {
  it("targets a channel row's retarget location rather than the channel's current one", () => {
    const event = toInventoryEvent("channel", "K", channelRow({ publishShopifyLocationId: "LOC_OLD" }), undefined);

    expect(event.locationId).toBe("LOC_OLD");
    expect(event.retarget).toBe(true);
    expect(event.channelId).toBe("IC_1");
  });

  it("reads a location row's own target and never claims a retarget", () => {
    const event = toInventoryEvent("location", "K", locationRow({ publishShopifyLocationId: "IGNORED" }), undefined);

    expect(event.locationId).toBe("LOC_STORE");
    expect(event.retarget).toBe(false);
    expect(event.channelId).toBeUndefined();
  });

  it("ignores detailStatusId entirely", () => {
    const quarantinedOnPaper = toInventoryEvent("channel", "K", channelRow({ detailStatusId: "DETAIL_ERROR" }), undefined);

    expect(quarantinedOnPaper.delivery.id).toBe("waiting");
  });

  it("dates a delivery only when the send succeeded", () => {
    const row = channelRow({ systemMessageId: "B" });
    const failed = toInventoryEvent("channel", "K", row, { statusId: "SmsgError", processedDate: 9_000 });
    const sent = toInventoryEvent("channel", "K", row, { statusId: "SmsgSent", processedDate: 9_000 });

    expect(failed.sentAt).toBeUndefined();
    expect(failed.awaitingDelivery).toBe(true);
    expect(sent.sentAt).toBe(9_000);
    expect(sent.awaitingDelivery).toBe(false);
  });

  it("publishes an unmapped type under correction and says so", () => {
    const event = toInventoryEvent("location", "K", locationRow(), undefined);

    expect(event.reason).toBe("correction");
    expect(event.reasonMapped).toBe(false);
  });
});

describe("source lookup across the SIE_ enumeration change", () => {
  it("resolves the prefixed and the unprefixed spelling of a family alike", () => {
    expect(canonicalEventTypeId("POS_ISSUANCE")).toBe("SIE_POS_ISSUANCE");
    expect(canonicalEventTypeId("SIE_POS_ISSUANCE")).toBe("SIE_POS_ISSUANCE");
    expect(sourceRootFor("POS_ISSUANCE")).toBe("itemIssuances");
    expect(sourceRootFor("SIE_POS_ISSUANCE")).toBe("itemIssuances");
    expect(sourceRootFor("TRANSFER_RECEIPT")).toBe("shipmentReceipts");
  });

  it("splits an unprefixed reservation reference into its two ids", () => {
    expect(isReservationEventType("RESERVATION_CREATE")).toBe(true);
    expect(sourceOf("RESERVATION_CREATE", "107588:435038")).toMatchObject({
      root: "inventoryItemDetails",
      reservation: { inventoryItemId: "107588", detailSeqId: "435038" },
    });
  });

  it("strips an effective-date phase off the reference", () => {
    expect(sourceOf("SIE_INVENTORY_CHANNEL", "IC_1:2026:NEW")).toMatchObject({ reference: "IC_1:2026", phase: "NEW" });
  });
});

describe("figures, batches and filters", () => {
  const events = [
    toInventoryEvent("channel", "A", channelRow({ eventReferenceId: "A", createdDate: 1_000 }), undefined),
    toInventoryEvent(
      "channel", "B", channelRow({ eventReferenceId: "B", systemMessageId: "M1", createdDate: 2_000 }),
      { statusId: "SmsgSent", processedDate: 2_000 + 4 * 60_000, initDate: 2_500 }
    ),
    toInventoryEvent(
      "channel", "C", channelRow({ eventReferenceId: "C", systemMessageId: "M1", createdDate: 2_100, shopifyInventoryItemId: "ITEM_1", computedInventoryChange: 2 }),
      { statusId: "SmsgSent", processedDate: 2_100 + 10 * 60_000, initDate: 2_500 }
    ),
    toInventoryEvent("channel", "D", channelRow({ eventReferenceId: "D", systemMessageId: "M2", createdDate: 3_000 }), { statusId: "SmsgError" }),
    toInventoryEvent("channel", "E", channelRow({ eventReferenceId: "E", computedInventoryChange: 0, createdDate: 500 }), undefined),
  ];

  it("counts waiting and errors, and takes the median lag over delivered rows only", () => {
    const summary = summarizeInventoryEvents(events);

    expect(summary).toMatchObject({ total: 5, waiting: 1, errors: 1, oldestWaitingAt: 1_000, oldestOwedAt: 1_000 });
    expect(summary.lag).toEqual({ median: 10 * 60_000, slowest: 10 * 60_000, count: 2 });
  });

  it("groups a batch's rows and sums them per inventory item and location", () => {
    const [newest, older] = groupInventoryEventBatches(events);

    expect(newest.id).toBe("M2");
    expect(older.id).toBe("M1");
    expect(older.events).toHaveLength(2);
    expect(older.entries).toHaveLength(1);
    expect(older.entries[0]).toMatchObject({ delta: 3, eventCount: 2, outcome: "publish" });
    expect(older.reason).toBe("received");
  });

  it("publishes a mixed batch under correction", () => {
    const mixed = groupInventoryEventBatches([
      toInventoryEvent("location", "X", locationRow({ systemMessageId: "M", shopifyReason: "correction" }), { statusId: "SmsgSent" }),
      toInventoryEvent("location", "Y", locationRow({ systemMessageId: "M", eventTypeId: "RETURN_RESTOCK", shopifyReason: "restock" }), { statusId: "SmsgSent" }),
    ])[0];

    expect(mixed.mixedEventTypes).toBe(true);
    expect(mixed.reason).toBe("correction");
    expect(mixed.reasonMapped).toBe(false);
  });

  it("filters by state, family, location, date range and text in one pass", () => {
    const text = (event: any) => event.eventReferenceId;

    expect(filterInventoryEvents(events, { deliveryState: "error" }, text).map((e) => e.eventReferenceId)).toEqual(["D"]);
    expect(filterInventoryEvents(events, { eventTypeId: "RECEIPT" }, text)).toHaveLength(5);
    expect(filterInventoryEvents(events, { fromMs: 2_000, toMs: 2_100 }, text).map((e) => e.eventReferenceId)).toEqual(["B", "C"]);
    expect(filterInventoryEvents(events, { query: "d" }, text).map((e) => e.eventReferenceId)).toEqual(["D"]);
    expect(filterInventoryEvents(events, { locationId: "ELSEWHERE" }, text)).toEqual([]);
  });
});

describe("ledgerRetentionOf — the purge job's window per ledger", () => {
  const job = (serviceName: string, daysToKeep?: string, paused = "N") => ({
    jobName: "purge", serviceName, paused, serviceJobParameters: daysToKeep ? [{ parameterName: "daysToKeep", parameterValue: daysToKeep }] : [],
  });
  const LOCATION = "co.hotwax.sob.product.InventoryServices.purge#OldShopifyLocationInventoryAdjustmentDetails";

  it("reads the ledger's own job, its days, and whether it is paused", () => {
    expect(ledgerRetentionOf("location", [job(LOCATION, "3")])).toEqual({ days: 3, paused: false });
    expect(ledgerRetentionOf("location", [job(LOCATION, "3", "Y")])).toEqual({ days: 3, paused: true });
    expect(ledgerRetentionOf("channel", [job(LOCATION, "3")])).toBeUndefined();
  });

  it("prefers the combined purge for both ledgers, and ignores the paused per-ledger jobs next to it", () => {
    const COMBINED = "co.hotwax.sob.product.InventoryServices.purge#OldShopifyInventoryAdjustments";
    const jobs = [job(LOCATION, "9", "Y"), job(COMBINED, "2")];
    expect(ledgerRetentionOf("channel", jobs)).toEqual({ days: 2, paused: false });
    expect(ledgerRetentionOf("location", jobs)).toEqual({ days: 2, paused: false });
  });

  it("falls back to the service's own default of 5 when the parameter is absent or invalid", () => {
    expect(ledgerRetentionOf("location", [job(LOCATION)])?.days).toBe(5);
    expect(ledgerRetentionOf("location", [job(LOCATION, "0")])?.days).toBe(5);
  });
});

describe("delta arithmetic", () => {
  it("settles float noise as no change, quarantines a real fraction, and never yields -0", () => {
    expect(sumDelta([0.1, 0.2, -0.3])).toBe(0);
    expect(deltaOutcome(0.1 + 0.2 - 0.3)).toBe("noChange");
    expect(deltaOutcome(1.5)).toBe("quarantine");
    expect(Object.is(roundDelta(-0), 0)).toBe(true);
  });

  it("sums change entries the way the batcher does", () => {
    const rows = [
      toInventoryEvent("location", "1", locationRow({ computedInventoryChange: 2 }), undefined),
      toInventoryEvent("location", "2", locationRow({ eventReferenceId: "2", computedInventoryChange: -2 }), undefined),
    ];

    expect(changeEntriesOf(rows)[0]).toMatchObject({ delta: 0, outcome: "noChange", eventCount: 2 });
  });
});

describe("absolute rows (resetInventoryLevel = Y)", () => {
  it("reads the flag, and treats an unbatched absolute zero as waiting rather than no change", () => {
    const event = toInventoryEvent("channel", "1", channelRow({ eventTypeId: "SIE_FUTURE_RESET", computedInventoryChange: 0, resetInventoryLevel: "Y" }), undefined);

    expect(event.absolute).toBe(true);
    expect(event.delivery.id).toBe("waiting");
    expect(deliveryStateOf(undefined, 0, undefined, true).id).toBe("waiting");
    expect(toInventoryEvent("channel", "2", channelRow({ computedInventoryChange: 0 }), undefined).absolute).toBe(false);
  });

  it("enters the latest absolute quantity plus the deltas after it, as what Shopify ends up holding", () => {
    const rows = [
      toInventoryEvent("channel", "1", channelRow({ eventReferenceId: "A", computedInventoryChange: 5, createdDate: 1 }), undefined),
      toInventoryEvent("channel", "2", channelRow({ eventReferenceId: "B", computedInventoryChange: 9, resetInventoryLevel: "Y", createdDate: 2 }), undefined),
      toInventoryEvent("channel", "3", channelRow({ eventReferenceId: "C", computedInventoryChange: -1, createdDate: 3 }), undefined),
    ];

    expect(changeEntriesOf(rows)[0]).toMatchObject({ delta: 8, absolute: true, outcome: "publish", eventCount: 3 });
  });
});

describe("metafield-only events (a promise date change moves no quantity)", () => {
  const revision = (overrides: Record<string, any> = {}) => ({
    eventTypeId: "SIE_FI_SUPPLY_UPDATE", eventReferenceId: "M100306:06", eventTypeDescription: "Future inventory quantity or date changed",
    shopId: "10000", shopifyInventoryItemId: "ITEM_1", metafieldNamespace: "hotwax", metafieldKey: "preorder_batches",
    createdDate: 1_000, failed: "N", ...overrides,
  });

  it("waits until a publish job batches its header, then follows the message", () => {
    expect(toMetafieldInventoryEvent("A", revision(), undefined).delivery.id).toBe("waiting");

    const batched = toMetafieldInventoryEvent("A", revision({ systemMessageId: "M1" }), { statusId: "SmsgProduced" });
    expect(batched.delivery.id).toBe("inFlight");

    const sent = toMetafieldInventoryEvent("A", revision({ systemMessageId: "M1" }), { statusId: "SmsgSent", processedDate: 5_000, initDate: 2_000 });
    expect(sent).toMatchObject({ delivery: { id: "sent" }, sentAt: 5_000, batchedAt: 2_000, awaitingDelivery: false });
  });

  it("reads Shopify's rejection of the revision as an error even when the message was sent", () => {
    const event = toMetafieldInventoryEvent("A", revision({ systemMessageId: "M1", failed: "Y" }), { statusId: "SmsgSent" });

    expect(event.delivery.id).toBe("error");
    expect(event.awaitingDelivery).toBe(true);
  });

  it("names the metafield and carries no quantity, item entry or location", () => {
    const event = toMetafieldInventoryEvent("A", revision(), undefined);

    expect(event).toMatchObject({ kind: "channel", metafieldOnly: true, metafieldName: "hotwax.preorder_batches", delta: 0, absolute: false, locationId: "" });
    expect(event.rowKey).toBe("channel:metafield:A");
  });

  it("counts as a waiting event in the figures, but adds nothing to a batch's change entries", () => {
    const waiting = toMetafieldInventoryEvent("A", revision({ createdDate: 3_000 }), undefined);
    const batched = toMetafieldInventoryEvent("B", revision({ systemMessageId: "M1", createdDate: 2_000 }), { statusId: "SmsgSent", processedDate: 9_000, initDate: 4_000 });
    const quantity = toInventoryEvent("channel", "C", channelRow({ systemMessageId: "M1", createdDate: 2_100 }), { statusId: "SmsgSent" });

    expect(summarizeInventoryEvents([waiting, batched])).toMatchObject({ total: 2, waiting: 1, oldestWaitingAt: 3_000 });
    expect(changeEntriesOf([batched])).toEqual([]);
    const batch = groupInventoryEventBatches([batched, quantity])[0];
    expect(batch.events).toHaveLength(2);
    expect(batch.entries).toHaveLength(1);
    expect(groupInventoryEventBatches([batched])[0].entries).toEqual([]);
  });
});
