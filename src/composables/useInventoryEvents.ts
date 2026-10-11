import { translate, useDb } from "@common";
import { toMillis } from "@common/db";
import { type MaybeRefOrGetter, computed, toValue } from "vue";
import { companyDb } from "@/db/companyDb";
import { useStatuses } from "@/composables/useSeed";
import { type InventoryEventSourceLookup, useInventoryEventSources } from "@/composables/useShopify";
import { isShopifyLocationMapping } from "@/utils/shopifyShop";
import {
  type DeliveryStateId,
  type InventoryEvent,
  type InventoryEventKind,
  type InventoryEventMessage,
  effectiveMessageOf,
  ledgerRetentionOf,
  toInventoryEvent,
} from "@/utils/inventoryEvents";
import { type InventoryEventSourceRoot, canonicalEventTypeId } from "@/utils/inventoryEventSourceRoots";

/**
 * Both Shopify inventory ledgers, read from IndexedDB into one row shape. Nothing here fetches: the
 * inventory sync area's domains keep the tables current, and every label comes from a cached table.
 * Location is the facilities mapped to it (never `_NA_`, which is named "Brokering Queue"), else the
 * channel mapped to it; product is Shopify's own inventory item read.
 */
export interface InventoryEventRow extends InventoryEvent {
  locationLabel: string;
  /** The Shopify product fields are empty until the item is read from Shopify. */
  shopifyProductId: string;
  shopifyVariantId: string;
  productName: string;
  productSku: string;
  /** Only when it says something the product title does not ("S"). */
  productVariant: string;
  productImageUrl: string;
  change: string;
  deliveryLabel: string;
  deliveryColor: string;
  /** e.g. "Shipment receipt 107319". */
  sourceLabel: string;
}

const DELIVERY_STATE_COLORS: Record<DeliveryStateId, string> = {
  waiting: "warning",
  noChange: "medium",
  inFlight: "primary",
  error: "danger",
  sent: "success",
  cancelled: "medium",
};

/** An event type no fetch path claims shows its bare reference rather than a wrong record name. */
const SOURCE_RECORD_LABELS: Record<InventoryEventSourceRoot, string> = {
  shipmentReceipts: "Shipment receipt",
  itemIssuances: "Item issuance",
  varianceDecisions: "Physical inventory",
  externalInventoryResets: "External inventory reset",
  // Spelled out as "Inventory item X, detail Y", which already names the record.
  inventoryItemDetails: "",
};

const LEDGER_TABLES = {
  channel: "shopifyInventoryAdjustmentDetails",
  location: "shopifyLocationInventoryAdjustmentDetails",
} as const;

/** A ledger row's identity: its primary-key values in declared order, the shape the old synthetic key had. */
function ledgerRowKeyOf(kind: InventoryEventKind, row: Record<string, unknown>): string {
  return JSON.stringify(companyDb.entities[LEDGER_TABLES[kind]].primaryKeyFields.map((field) => String(row[field] ?? "")));
}

function inventoryItemKey(shopId: unknown, shopifyInventoryItemId: unknown): string {
  return `${String(shopId ?? "")}|${String(shopifyInventoryItemId ?? "")}`;
}

/** "Default Title" is what Shopify names the only variant of a product with no options. */
function variantLabelOf(variantTitle: string, productTitle: string): string {
  return variantTitle && variantTitle !== "Default Title" && variantTitle !== productTitle ? variantTitle : "";
}

function deliveryLabelOf(event: Pick<InventoryEvent, "delivery">, statusLabel: (statusId?: string) => string): string {
  if(event.delivery.id === "waiting") {return translate("Waiting");}
  if(event.delivery.id === "noChange") {return translate("No change");}

  return statusLabel(event.delivery.statusId) || translate("Batched");
}

/** `shopId` is reactive so a reused view follows its route from one shop to another. */
export function useInventoryEvents(shopId: MaybeRefOrGetter<string>, kind: InventoryEventKind) {
  const scoped = () => ({ scope: { field: "shopId", value: String(toValue(shopId) ?? "") } });
  const { records: scopedLedgerRows, hydrated } = useDb<any>(LEDGER_TABLES[kind], scoped);
  // Newest first. A scoped read comes back in key order, so the order is set here.
  const ledgerRows = computed(() => [...scopedLedgerRows.value]
    .sort((a, b) => (toMillis(b.createdDate) ?? 0) - (toMillis(a.createdDate) ?? 0)));
  const { records: messageRows } = useDb<any>("systemMessages");
  const { records: shopLocations } = useDb<any>("shopifyLocations", () => ({ ...scoped(), filter: isShopifyLocationMapping }));
  const { records: facilities } = useDb<any>("facilities");
  const { records: channels } = useDb<any>("inventoryChannels", scoped);
  const { records: inventoryItemRows } = useDb<any>("shopifyInventoryItems", scoped);
  const { records: serviceJobs } = useDb<any>("serviceJobs");
  const { records: bounds } = useDb<any>("inventoryLedgerBounds", scoped);
  const { labelFor: statusLabel } = useStatuses();
  const { sources, resolve: resolveSourceArtifacts, sourceKeyOf } = useInventoryEventSources();

  const messagesById = computed(() => {
    const map = new Map<string, InventoryEventMessage>();
    for(const row of messageRows.value) {
      map.set(String(row.systemMessageId), {
        statusId: row.statusId, processedDate: row.processedDate, initDate: row.initDate, syncedAt: row.syncedAt,
      });
    }

    return map;
  });

  const facilityNames = computed(() => new Map(facilities.value
    .map((facility: any) => [String(facility.facilityId), String(facility.facilityName || facility.facilityId)])));

  const locationLabels = computed(() => {
    const facilityIdsByLocation = new Map<string, string[]>();
    for(const mapping of shopLocations.value) {
      const facilityId = String(mapping.facilityId ?? "");
      if(!facilityId || facilityId === "_NA_") {continue;}
      const locationId = String(mapping.shopifyLocationId ?? "");
      facilityIdsByLocation.set(locationId, [...(facilityIdsByLocation.get(locationId) ?? []), facilityId]);
    }
    const labels = new Map<string, string>();
    for(const [locationId, facilityIds] of facilityIdsByLocation) {
      labels.set(locationId, facilityIds.map((facilityId) => facilityNames.value.get(facilityId) ?? facilityId).sort().join(", "));
    }
    for(const channel of channels.value) {
      const locationId = String(channel.shopifyLocationId ?? "");
      const name = String(channel.description || channel.facilityGroupName || "").trim();
      if(locationId && name && !labels.has(locationId)) {labels.set(locationId, name);}
    }

    return labels;
  });

  function locationLabelFor(locationId: string): string {
    if(!locationId) {return translate("Shopify location");}

    return locationLabels.value.get(locationId) ?? translate("Location {id}", { id: locationId });
  }

  const inventoryItemsByKey = computed(() => new Map(inventoryItemRows.value
    .map((row) => [inventoryItemKey(row.shopId, row.shopifyInventoryItemId), row as Record<string, any>])));

  function sourceLabelOf(event: InventoryEvent): string {
    const recordLabel = event.source.root ? SOURCE_RECORD_LABELS[event.source.root] : "";
    const reference = event.source.reservation
      ? translate("Inventory item {id}, detail {seq}", { id: event.source.reservation.inventoryItemId, seq: event.source.reservation.detailSeqId })
      : event.source.reference;

    return [recordLabel ? translate(recordLabel) : "", reference].filter(Boolean).join(" ");
  }

  const events = computed<InventoryEventRow[]>(() => ledgerRows.value.map((row) => {
    const message = effectiveMessageOf(row, row.syncedAt, messagesById.value.get(String(row.systemMessageId ?? "")));
    const event = toInventoryEvent(kind, ledgerRowKeyOf(kind, row), row, message);
    const item = inventoryItemsByKey.value.get(inventoryItemKey(event.shopId, event.inventoryItemId));
    const productName = String(item?.productTitle ?? "");

    return {
      ...event,
      locationLabel: locationLabelFor(event.locationId),
      shopifyProductId: String(item?.shopifyProductId ?? ""),
      shopifyVariantId: String(item?.shopifyVariantId ?? ""),
      productName,
      productSku: String(item?.sku ?? ""),
      productVariant: variantLabelOf(String(item?.variantTitle ?? ""), productName),
      productImageUrl: String(item?.imageUrl ?? ""),
      change: `${event.delta > 0 ? "+" : ""}${event.delta}`,
      deliveryLabel: deliveryLabelOf(event, statusLabel),
      deliveryColor: DELIVERY_STATE_COLORS[event.delivery.id],
      sourceLabel: sourceLabelOf(event),
    };
  }));

  const locationOptions = computed(() => {
    const ids = [...new Set(events.value.map((event) => event.locationId).filter(Boolean))];

    return ids.map((id) => ({ id, label: locationLabelFor(id) })).sort((a, b) => a.label.localeCompare(b.label));
  });

  /** One option per event family, whichever spelling of its id the rows carry. */
  const eventTypeOptions = computed(() => {
    const labels = new Map<string, string>();
    for(const event of events.value) {
      const family = canonicalEventTypeId(event.eventTypeId);
      if(!labels.has(family)) {labels.set(family, event.eventTypeLabel);}
    }

    return [...labels].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  });

  /** A ledger view without an update cursor still stores the recent window, but nothing after it arrives. */
  const liveUpdates = computed(() => !ledgerRows.value.length ||
    ledgerRows.value.some((row) => row.detailLastUpdatedStamp != null));

  /**
   * The cache holds a window of the ledger, not all of it. `oldestEventAt` is where the window starts
   * (the index-ordered read is newest first, so it is the last row); `serverOldestAt` is where the
   * server's copy starts. A date filter between the two needs `loadEventsFrom` first.
   */
  const oldestEventAt = computed(() => events.value[events.value.length - 1]?.createdAt || undefined);
  const serverOldestAt = computed(() => toMillis(bounds.value.find((bound: any) => bound.kind === kind)?.oldestCreatedDate));

  const retention = computed(() => ledgerRetentionOf(kind, serviceJobs.value));

  const loadedAt = computed(() => ledgerRows.value.reduce((newest, row) => Math.max(newest, Number(row.syncedAt) || 0), 0) || undefined);

  function sourceArtifactFor(event: InventoryEvent) {
    return sources.value.get(sourceKeyOf(event.eventTypeId, event.eventReferenceId));
  }

  /** Name the source documents of the rows on screen. Safe per render: resolved keys are skipped. */
  function resolveSources(visible: readonly InventoryEvent[]) {
    if(visible.length) {
      void resolveSourceArtifacts(visible.map(({ eventTypeId, eventReferenceId }): InventoryEventSourceLookup => ({ eventTypeId, eventReferenceId })));
    }
  }

  return {
    events,
    hydrated,
    liveUpdates,
    loadedAt,
    oldestEventAt,
    serverOldestAt,
    retention,
    locationOptions,
    eventTypeOptions,
    locationLabelFor,
    sourceArtifactFor,
    resolveSources,
  };
}
