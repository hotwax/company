import { translate } from "@common";
import { computed } from "vue";
import { useCachedList } from "@/composables/useCachedList";
import { useStatuses } from "@/composables/useSeed";
import { type InventoryEventSourceLookup, useInventoryEventSources } from "@/composables/useShopify";
import {
  facilityCache,
  inventoryChannelCache,
  shopifyInventoryAdjustmentDetailCache,
  shopifyInventoryItemCache,
  shopifyInventoryItemKey,
  shopifyLocationCache,
  shopifyLocationInventoryAdjustmentDetailCache,
  systemMessageCache,
} from "@/utils/cacheEntities";
import {
  type DeliveryStateId,
  type InventoryEvent,
  type InventoryEventKind,
  type InventoryEventMessage,
  effectiveMessageOf,
  eventFamilyOf,
  toInventoryEvent,
} from "@/utils/inventoryEvents";
import type { InventoryEventSourceRoot } from "@/utils/inventoryEventSourceRoots";

/**
 * THE VIEW LAYER'S INVENTORY EVENTS — both Shopify inventory ledgers, read from IndexedDB and mapped
 * into one row shape, so one history screen and one monitor serve channel and location events alike.
 *
 * Nothing here fetches. The inventory sync area's worker keeps both ledgers, their batches' messages
 * and, read from Shopify, the variant and product behind each inventory item current
 * (`src/workers/domains/inventoryEventDomains.ts`); this reads those tables through `useCachedList`, so
 * every open list re-renders the moment a poll lands.
 * Every label is derived from a cached table too:
 *
 *   location   the facilities mapped to that Shopify location (`shopifyLocations` ⋈ `facilities`), or,
 *              for an aggregate location that no facility stands behind, the channel mapped to it. An
 *              aggregate location is recorded against the `_NA_` facility, which is named "Brokering
 *              Queue" and would be a confident, wrong label.
 *   product    the `shopifyInventoryItems` row for this shop's inventory item: Shopify's own SKU, variant
 *              and product title, never the OMS's product record.
 *   delivery   the System Message status's own description.
 */

export interface InventoryEventRow extends InventoryEvent {
  locationLabel: string;
  /** Shopify's numeric product and variant ids; empty until the item is read from Shopify. */
  shopifyProductId: string;
  shopifyVariantId: string;
  /** The Shopify product title; empty until the item is read from Shopify. */
  productName: string;
  productSku: string;
  /** The variant's own title, kept only when it says something the product title does not ("S"). */
  productVariant: string;
  productImageUrl: string;
  /** "+3" / "-1" / "0". */
  change: string;
  deliveryLabel: string;
  deliveryColor: string;
  /** The OMS record the reference names, spelled out, e.g. "Shipment receipt 107319". */
  sourceLabel: string;
}

export interface InventoryEventOption { id: string; label: string }

/** A delivery state's colour. The labels are StatusItem descriptions wherever a message is involved. */
export const DELIVERY_STATE_COLORS: Record<DeliveryStateId, string> = {
  waiting: "warning",
  noChange: "medium",
  inFlight: "primary",
  error: "danger",
  sent: "success",
  cancelled: "medium",
};

/**
 * The record type a reference names, per app fetch path. Display only: an event type no path claims
 * shows its bare reference instead of a confident, wrong record name.
 */
const SOURCE_RECORD_LABELS: Record<InventoryEventSourceRoot, string> = {
  shipmentReceipts: "Shipment receipt",
  itemIssuances: "Item issuance",
  varianceDecisions: "Physical inventory",
  externalInventoryResets: "External inventory reset",
  // The reservation reference is spelled out as "Inventory item X, detail Y", which already names the
  // record; prefixing it would repeat the words.
  inventoryItemDetails: "",
};

const LEDGER_CACHES = {
  channel: shopifyInventoryAdjustmentDetailCache,
  location: shopifyLocationInventoryAdjustmentDetailCache,
} as const;

function formatChange(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}`;
}

/** What Shopify titles the only variant of a product that has no options. */
const SHOPIFY_DEFAULT_VARIANT_TITLE = "Default Title";

/** The variant title, unless it is Shopify's placeholder or just repeats the product title. */
function variantLabelOf(variantTitle: string, productTitle: string): string {
  return variantTitle && variantTitle !== SHOPIFY_DEFAULT_VARIANT_TITLE && variantTitle !== productTitle ? variantTitle : "";
}

/** The unbatched states have their own words; a batched one is its message status, described. */
function deliveryLabelOf(event: Pick<InventoryEvent, "delivery">, statusLabel: (statusId?: string) => string): string {
  if(event.delivery.id === "waiting") {return translate("Waiting");}
  if(event.delivery.id === "noChange") {return translate("No change");}

  return statusLabel(event.delivery.statusId) || translate("Batched");
}

export function useInventoryEvents(shopId: string, kind: InventoryEventKind) {
  const scope = { field: "shopId", value: String(shopId ?? "") };
  const { rows: ledgerRows, hydrated } = useCachedList(LEDGER_CACHES[kind], { scope, dateField: "createdDate" });
  const { rows: messageRows } = useCachedList(systemMessageCache);
  const { records: shopLocations } = useCachedList<any>(shopifyLocationCache, { scope });
  const { records: facilities } = useCachedList<any>(facilityCache);
  const { records: channels } = useCachedList<any>(inventoryChannelCache, { scope });
  const { rows: inventoryItemRows } = useCachedList(shopifyInventoryItemCache, { scope });
  const { labelFor: statusLabel } = useStatuses();
  const { sources, resolve: resolveSourceArtifacts, sourceKeyOf } = useInventoryEventSources();

  const messagesById = computed(() => {
    const map = new Map<string, InventoryEventMessage>();
    for(const row of messageRows.value) {
      const raw = row.raw as Record<string, any>;
      map.set(String(raw.systemMessageId), {
        statusId: raw.statusId, processedDate: raw.processedDate, initDate: raw.initDate, cachedAt: row.cachedAt,
      });
    }

    return map;
  });

  const facilityNames = computed(() => new Map(facilities.value
    .map((facility: any) => [String(facility.facilityId), String(facility.facilityName || facility.facilityId)])));

  /** shopifyLocationId → its label, built once per cache change rather than once per row. */
  const locationLabels = computed(() => {
    const facilityIdsByLocation = new Map<string, string[]>();
    for(const mapping of shopLocations.value) {
      const facilityId = String(mapping.facilityId ?? "");
      // `_NA_` is the sentinel an aggregate location is recorded against, not a facility.
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

  /** `shopId|shopifyInventoryItemId` → the item as Shopify describes it. */
  const inventoryItemsByKey = computed(() => new Map(inventoryItemRows.value
    .map((row) => [String(row.itemKey ?? ""), row.raw as Record<string, any>])));

  function sourceLabelOf(event: InventoryEvent): string {
    const recordLabel = event.source.root ? SOURCE_RECORD_LABELS[event.source.root] : "";
    const reference = event.source.reservation
      ? translate("Inventory item {id}, detail {seq}", { id: event.source.reservation.inventoryItemId, seq: event.source.reservation.detailSeqId })
      : event.source.reference;

    return [recordLabel ? translate(recordLabel) : "", reference].filter(Boolean).join(" ");
  }

  const events = computed<InventoryEventRow[]>(() => ledgerRows.value.map((row) => {
    const raw = row.raw as Record<string, any>;
    const cacheKey = String(row[kind === "channel" ? "adjustmentKey" : "locationAdjustmentKey"] ?? "");
    const message = effectiveMessageOf(raw, row.cachedAt, messagesById.value.get(String(raw.systemMessageId ?? "")));
    const event = toInventoryEvent(kind, cacheKey, raw, message);
    const item = inventoryItemsByKey.value.get(shopifyInventoryItemKey(event.shopId, event.inventoryItemId));
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
      change: formatChange(event.delta),
      deliveryLabel: deliveryLabelOf(event, statusLabel),
      deliveryColor: DELIVERY_STATE_COLORS[event.delivery.id],
      sourceLabel: sourceLabelOf(event),
    };
  }));

  /** Only the Shopify locations the rows actually target, labelled as the rows are. */
  const locationOptions = computed<InventoryEventOption[]>(() => {
    const ids = [...new Set(events.value.map((event) => event.locationId).filter(Boolean))];

    return ids.map((id) => ({ id, label: locationLabelFor(id) })).sort((a, b) => a.label.localeCompare(b.label));
  });

  /** One option per event family, whichever spelling of its id the rows carry. */
  const eventTypeOptions = computed<InventoryEventOption[]>(() => {
    const labels = new Map<string, string>();
    for(const event of events.value) {
      const family = eventFamilyOf(event);
      if(!labels.has(family)) {labels.set(family, event.eventTypeLabel);}
    }

    return [...labels].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  });

  /**
   * Whether this ledger is being kept current. An OMS whose ledger view has no update cursor still
   * delivers the recent window, which is stored and shown, but nothing after it arrives on its own: the
   * rows say so by carrying no `detailLastUpdatedStamp` at all.
   */
  const liveUpdates = computed(() => !ledgerRows.value.length ||
    ledgerRows.value.some((row) => (row.raw as Record<string, any>)?.detailLastUpdatedStamp !== undefined &&
      (row.raw as Record<string, any>)?.detailLastUpdatedStamp !== null));

  /** When the rows on screen were last read from the OMS. */
  const loadedAt = computed(() => ledgerRows.value.reduce((newest, row) => Math.max(newest, Number(row.cachedAt) || 0), 0) || undefined);

  function lookupFor(event: InventoryEvent): InventoryEventSourceLookup {
    return { eventTypeId: event.eventTypeId, eventReferenceId: event.eventReferenceId };
  }

  /** The source document behind a row, once `resolveSources` has named it. */
  function sourceArtifactFor(event: InventoryEvent) {
    return sources.value.get(sourceKeyOf(event.eventTypeId, event.eventReferenceId));
  }

  /** Name the source documents of the rows on screen. Safe per render: resolved keys are skipped. */
  function resolveSources(visible: readonly InventoryEvent[]) {
    if(visible.length) {void resolveSourceArtifacts(visible.map(lookupFor));}
  }

  return {
    events,
    hydrated,
    liveUpdates,
    loadedAt,
    locationOptions,
    eventTypeOptions,
    locationLabelFor,
    sourceArtifactFor,
    resolveSources,
  };
}
