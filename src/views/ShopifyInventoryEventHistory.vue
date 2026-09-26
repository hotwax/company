<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${props.id}/inventory-sync`" />
        </ion-buttons>
        <ion-title>{{ kind === "channel" ? translate("Channel inventory history") : translate("Location inventory history") }}</ion-title>
        <ion-buttons slot="end">
          <SyncStatusButton :failures="failingDomains" :priority="SYNC_PRIORITY" />
          <ion-button :aria-label="translate('Refresh')" :disabled="manualRefreshing" @click="syncNow()">
            <ion-spinner v-if="manualRefreshing" slot="icon-only" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <main class="history-page">
        <div class="kpi-grid">
          <ion-card v-for="card in kpiCards" :key="card.label" class="kpi-card" :button="!!card.state" @click="card.state && toggleState(card.state)">
            <ion-card-header>
              <ion-card-subtitle>{{ card.label }}</ion-card-subtitle>
              <ion-card-title :color="card.tone">
                {{ card.value }}
              </ion-card-title>
              <ion-note v-if="card.note">
                {{ card.note }}
              </ion-note>
            </ion-card-header>
          </ion-card>
        </div>

        <ion-card class="history-filter-card">
          <ion-card-content>
            <ion-searchbar
              v-model="filters.search"
              class="history-search"
              :debounce="250"
              :placeholder="translate('Search product, SKU, event type, source record, location, inventory item or batch')"
            />

            <div class="filter-grid">
              <div v-for="select in selectFilters" :key="select.key" class="filter-item">
                <ion-select
                  :value="filters[select.key]"
                  :label="select.label"
                  label-placement="stacked"
                  fill="outline"
                  interface="popover"
                  :placeholder="translate('All')"
                  @ion-change="filters[select.key] = $event.detail.value || ''"
                >
                  <ion-select-option value="">
                    {{ translate("All") }}
                  </ion-select-option>
                  <ion-select-option v-for="option in select.options" :key="option.id" :value="option.id">
                    {{ option.label }}
                  </ion-select-option>
                </ion-select>
                <ion-button v-if="filters[select.key]" fill="clear" class="clear-filter-button" :aria-label="select.clearLabel" @click.stop="filters[select.key] = ''">
                  <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                </ion-button>
              </div>

              <!-- An input, not a datetime button, which would print today's date for an unset bound. -->
              <div v-for="bound in dateBounds" :key="bound.key" class="filter-item">
                <ion-input
                  :id="`${pickerId}-${bound.key}`"
                  :value="filters[bound.key] ? formatDate(filters[bound.key]) : ''"
                  :label="bound.label"
                  label-placement="stacked"
                  fill="outline"
                  readonly
                  :placeholder="translate('Any date')"
                />
                <ion-popover :trigger="`${pickerId}-${bound.key}`" :keep-contents-mounted="true">
                  <ion-datetime
                    presentation="date"
                    :value="filters[bound.key] || undefined"
                    :min="bound.key === 'to' ? filters.from || undefined : undefined"
                    :max="bound.key === 'from' ? filters.to || todayIso : todayIso"
                    :show-default-buttons="true"
                    :show-clear-button="true"
                    @ion-change="filters[bound.key] = dateOnly($event.detail.value)"
                  />
                </ion-popover>
                <ion-button v-if="filters[bound.key]" fill="clear" class="clear-filter-button" :aria-label="bound.clearLabel" @click.stop="filters[bound.key] = ''">
                  <ion-icon slot="icon-only" :icon="closeCircleOutline" />
                </ion-button>
              </div>

              <div class="filter-item">
                <ion-select
                  :value="filters.sort"
                  :label="translate('Sort')"
                  label-placement="stacked"
                  fill="outline"
                  interface="popover"
                  @ion-change="filters.sort = $event.detail.value"
                >
                  <ion-select-option value="newest">
                    {{ translate("Newest first") }}
                  </ion-select-option>
                  <ion-select-option value="oldest">
                    {{ translate("Oldest first") }}
                  </ion-select-option>
                </ion-select>
              </div>
            </div>
          </ion-card-content>
        </ion-card>

        <div class="history-results-header">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              {{ kind === "channel" ? translate("Channel inventory events") : translate("Location inventory events") }}
              <p v-if="liveUpdates">
                {{ translate("The newest 500 events for this connection, kept current with every event and batch that has changed since. Settled events are purged after five days, so this is a working window rather than a full history.") }}
              </p>
              <p v-else>
                {{ translate("Live updates are off: this OMS does not report when an inventory event changes. Showing the newest 500 events as read at {at}; refresh to read them again.", { at: formatDateTime(loadedAt) }) }}
              </p>
            </ion-label>
          </ion-item>
          <ion-badge color="medium">
            {{ translate("{count} shown", { count: visibleEvents.length }) }}
          </ion-badge>
        </div>

        <div v-if="visibleEvents.length" ref="eventScrollerRef" class="event-scroller" @scroll.passive="onEventScroll">
          <div class="event-spacer" :style="{ '--event-spacer-size': `${eventTopSpacer}px` }" aria-hidden="true" />

          <div
            v-for="event in virtualEvents"
            :key="event.rowKey"
            data-virtual-row
            class="list-item"
            role="button"
            tabindex="0"
            :aria-label="translate('View details: {event} for {product}', { event: event.eventTypeLabel, product: event.productName || event.inventoryItemId })"
            @click="selectedEvent = event"
            @keydown.enter="selectedEvent = event"
            @keydown.space.prevent="selectedEvent = event"
          >
            <ion-item lines="none">
              <ion-thumbnail slot="start">
                <DxpShopifyImg :src="event.productImageUrl" size="small" />
              </ion-thumbnail>
              <ion-label class="ion-text-wrap">
                <span class="one-line">{{ event.productName || translate("Item {id}", { id: event.inventoryItemId }) }}</span>
                <p>{{ productSecondaryLine(event) }}</p>
                <!-- Below 991px only this cell and the status remain, so this line carries the rest. -->
                <p class="row-summary">
                  {{ translate("{change} at {location}, {source}", { change: event.change, location: event.locationLabel, source: sourceLine(event) }) }}
                </p>
              </ion-label>
            </ion-item>

            <ion-label>
              <ion-text :color="event.delta > 0 ? 'success' : event.delta < 0 ? 'danger' : undefined">
                {{ event.change }}
              </ion-text>
              <p class="one-line">
                {{ event.locationLabel }}
              </p>
            </ion-label>

            <ion-label class="event-cell ion-text-wrap">
              <span class="one-line">{{ event.eventTypeLabel }}</span>
              <p>{{ sourceLine(event) }}</p>
            </ion-label>

            <ion-label class="timing-cell">
              <span class="one-line">{{ formatAge(event.createdAt, now) }}</span>
              <p v-if="event.sentAt" class="one-line">
                {{ translate("sent {lag} later", { lag: formatLag(event.sentAt - event.createdAt) }) }}
              </p>
              <p v-else-if="event.awaitingDelivery" class="one-line">
                {{ translate("not sent yet") }}
              </p>
            </ion-label>

            <ion-label class="status-cell">
              <ion-badge :color="event.deliveryColor">
                {{ event.deliveryLabel }}
              </ion-badge>
              <p class="one-line">
                {{ event.messageId || translate("Not batched") }}
              </p>
            </ion-label>
          </div>

          <div class="event-spacer" :style="{ '--event-spacer-size': `${eventBottomSpacer}px` }" aria-hidden="true" />
        </div>

        <!-- "Nothing here" is only claimed once the cache is readable. -->
        <ion-card v-else-if="hydrated">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="timeOutline" />
            <ion-label class="ion-text-wrap">
              {{ translate("No inventory events match this view") }}
              <p>{{ translate("Clear the filters, or wait for the OMS to record an inventory event for this Shopify connection.") }}</p>
            </ion-label>
          </ion-item>
        </ion-card>

        <ion-card v-else>
          <ion-item lines="none">
            <ion-skeleton-text slot="start" :animated="true" class="row-skeleton" />
            <ion-label class="ion-text-wrap">
              {{ translate("Loading inventory events") }}
              <p>{{ translate("The inventory event cache has not loaded yet. This is not a confirmed empty history.") }}</p>
            </ion-label>
          </ion-item>
        </ion-card>
      </main>
    </ion-content>

    <InventoryEventDetailModal
      :event="selectedEvent"
      :artifact="selectedEvent ? sourceArtifactFor(selectedEvent) : undefined"
      :remote-id="syncContext.remoteId.value || ''"
      @open-batch="openBatch"
      @close="selectedEvent = null"
    />
    <InventoryEventBatchModal :batch="selectedBatch" @open-event="openEventFromBatch" @close="selectedBatchId = ''" />
  </ion-page>
</template>

<script setup lang="ts">
import { DxpShopifyImg, translate } from "@common";
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle,
  IonCardTitle, IonContent, IonDatetime, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonNote, IonPage,
  IonPopover, IonSearchbar, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonText, IonThumbnail, IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { closeCircleOutline, refreshOutline, timeOutline } from "ionicons/icons";
import { DateTime } from "luxon";
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SyncStatusButton from "@/components/common/SyncStatusButton.vue";
import InventoryEventBatchModal from "@/components/shopify/InventoryEventBatchModal.vue";
import InventoryEventDetailModal from "@/components/shopify/InventoryEventDetailModal.vue";
import { type InventoryEventRow, useInventoryEvents } from "@/composables/useInventoryEvents";
import { useShopifySyncContext } from "@/composables/useShopify";
import { useVirtualRows } from "@/composables/useVirtualRows";
import { INVENTORY_EVENT_DOMAINS } from "@/config/appSyncConfig";
import { useInventorySyncArea } from "@/services/inventorySyncArea";
import { formatDateTime } from "@/utils";
import {
  type DeliveryStateId,
  type InventoryEventKind,
  filterInventoryEvents,
  groupInventoryEventBatches,
  summarizeInventoryEvents,
} from "@/utils/inventoryEvents";
import { formatAge, formatLag } from "@/utils/inventoryEventTime";

/** Both ledgers' history: the channel and location routes mount this page with a different `kind`. */
const props = defineProps<{ id: string; kind: InventoryEventKind }>();

const route = useRoute();
const router = useRouter();
const syncContext = useShopifySyncContext(() => props.id);
const { failingDomains, manualRefreshing, syncNow } = useInventorySyncArea();
const {
  events, hydrated, liveUpdates, loadedAt, locationOptions, eventTypeOptions, sourceArtifactFor, resolveSources,
} = useInventoryEvents(() => props.id, props.kind);

/** This page's own ledger first: its failure is the one that explains an empty or stale list. */
const SYNC_PRIORITY = [`${props.kind}Rows`, `${props.kind}Messages`, "systemMessages", "products"]
  .map((key) => INVENTORY_EVENT_DOMAINS[key as keyof typeof INVENTORY_EVENT_DOMAINS]);

const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 30_000);
onBeforeUnmount(() => clearInterval(clock));

// Filters live in the URL, so a filtered history is linkable, survives a reload, and the monitor can
// link here with one chosen.
const FILTER_KEYS = ["search", "state", "eventType", "location", "from", "to", "sort"] as const;
type FilterKey = typeof FILTER_KEYS[number];

function fromQuery(key: FilterKey): string {
  const value = route.query[key];

  return typeof value === "string" && value ? value : key === "sort" ? "newest" : "";
}

const filters = reactive(Object.fromEntries(FILTER_KEYS.map((key) => [key, fromQuery(key)])) as Record<FilterKey, string>);

watch(() => ({ ...filters }), (next) => {
  // The inputs, not the list: the list is rebuilt on every poll, which would lose the reader's place.
  scrollEventsToTop();
  void router.replace({ query: Object.fromEntries(Object.entries(next).filter(([key, value]) => value && !(key === "sort" && value === "newest"))) });
});

watch(() => route.query, () => {
  for(const key of FILTER_KEYS) {
    if(filters[key] !== fromQuery(key)) {filters[key] = fromQuery(key);}
  }
});

function toggleState(state: DeliveryStateId) {
  filters.state = filters.state === state ? "" : state;
}

const selectFilters = computed(() => [
  {
    key: "state" as const, label: translate("Delivery state"), clearLabel: translate("Clear delivery state filter"),
    options: [
      { id: "waiting", label: translate("Waiting") }, { id: "noChange", label: translate("No change") },
      { id: "inFlight", label: translate("In flight") }, { id: "error", label: translate("Delivery error") },
      { id: "sent", label: translate("Sent") }, { id: "cancelled", label: translate("Cancelled") },
    ],
  },
  { key: "eventType" as const, label: translate("Event type"), clearLabel: translate("Clear event type filter"), options: eventTypeOptions.value },
  { key: "location" as const, label: translate("Shopify location"), clearLabel: translate("Clear location filter"), options: locationOptions.value },
]);

const pickerId = `inventory-history-${Math.random().toString(36).slice(2, 8)}`;
const todayIso = DateTime.now().toISODate() ?? undefined;
const dateBounds = [
  { key: "from" as const, label: translate("From"), clearLabel: translate("Clear from date") },
  { key: "to" as const, label: translate("To"), clearLabel: translate("Clear to date") },
];

/** ion-datetime hands back an ISO string, an array for multiple selection, or nothing on clear. */
function dateOnly(value: unknown): string {
  return String((Array.isArray(value) ? value[0] : value) ?? "").slice(0, 10);
}

function formatDate(isoDate: string): string {
  const date = DateTime.fromISO(isoDate);

  return date.isValid ? date.toLocaleString(DateTime.DATE_MED) : isoDate;
}

/** Every piece of text the row renders is matchable: a search that hides a row for text on it is broken. */
function searchTextOf(event: InventoryEventRow): string {
  return [event.productName, event.productSku, event.productVariant, event.shopifyProductId, event.shopifyVariantId, event.inventoryItemId,
    event.eventTypeLabel, event.eventTypeId, event.eventReferenceId, event.sourceLabel, sourceLine(event),
    event.locationLabel, event.locationId, event.messageId, event.deliveryLabel, event.reason].join(" ");
}

const visibleEvents = computed(() => {
  const filtered = filterInventoryEvents(events.value, {
    query: filters.search,
    deliveryState: filters.state as DeliveryStateId | "",
    eventTypeId: filters.eventType,
    locationId: filters.location,
    fromMs: filters.from ? DateTime.fromISO(filters.from).startOf("day").toMillis() : undefined,
    toMs: filters.to ? DateTime.fromISO(filters.to).endOf("day").toMillis() : undefined,
  }, searchTextOf);

  // The cache read is newest first already.
  return filters.sort === "oldest" ? [...filtered].reverse() : filtered;
});

/** Scored over the filtered rows, so narrowing to a slice re-measures for it. */
const kpiCards = computed(() => {
  const { total, waiting, errors, lag, oldestWaitingAt, oldestOwedAt } = summarizeInventoryEvents(visibleEvents.value);

  return [
    { label: translate("Events"), value: total },
    {
      label: translate("Waiting to batch"), value: waiting, tone: waiting ? "warning" : undefined, state: "waiting" as const,
      note: oldestWaitingAt ? translate("Oldest recorded {age}", { age: formatAge(oldestWaitingAt, now.value) }) : "",
    },
    { label: translate("Delivery errors"), value: errors, tone: errors ? "danger" : undefined, state: "error" as const },
    {
      label: translate("Typically reaches Shopify in"), value: lag ? formatLag(lag.median) : translate("No data"),
      note: lag ? translate("Median of {count} delivered, slowest {slowest}", { count: lag.count, slowest: formatLag(lag.slowest) }) : "",
    },
    // How stale Shopify is right now; the lag above describes deliveries that already happened.
    {
      label: translate("Oldest still owed to Shopify"), tone: oldestOwedAt ? "warning" : undefined,
      value: oldestOwedAt ? formatAge(oldestOwedAt, now.value) : translate("Nothing waiting"),
    },
  ];
});


/** The resolved document replaces the bare record; the detail keeps both. */
function sourceLine(event: InventoryEventRow): string {
  return sourceArtifactFor(event)?.label || event.sourceLabel;
}

function productSecondaryLine(event: InventoryEventRow): string {
  return [event.productSku, event.productVariant].filter(Boolean).join(", ") || event.inventoryItemId;
}

/** 67px is a rendered desktop row; every cell is clamped to a fixed line count so all rows land on it. */
const {
  containerRef: eventScrollerRef,
  visibleItems: virtualEvents,
  topSpacer: eventTopSpacer,
  bottomSpacer: eventBottomSpacer,
  onScroll: onEventScroll,
  scrollToTop: scrollEventsToTop,
} = useVirtualRows(visibleEvents, { estimatedRowHeight: 67 });

/**
 * Keyed on WHICH rows are visible, not the row array: every resolved source rebuilds the array, and a
 * watcher on it re-asked for the same rows after each answer, a request loop.
 */
watch(
  () => virtualEvents.value.map((event) => `${event.eventTypeId}|${event.eventReferenceId}`).join(","),
  () => resolveSources(virtualEvents.value), { immediate: true }
);

const selectedEvent = ref<InventoryEventRow | null>(null);
const selectedBatchId = ref("");

watch(selectedEvent, (event) => { if(event) {resolveSources([event]);} });

/** From the live rows, so an open batch follows its delivery as polls land. */
const selectedBatch = computed(() => selectedBatchId.value
  ? groupInventoryEventBatches(events.value.filter((event) => event.messageId === selectedBatchId.value))[0] ?? null
  : null);

function openBatch(messageId: string) {
  selectedEvent.value = null;
  selectedBatchId.value = messageId;
}

function openEventFromBatch(event: InventoryEventRow) {
  selectedBatchId.value = "";
  selectedEvent.value = event;
}
</script>

<style scoped>
.history-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-sm);
  padding-block: var(--spacer-sm) var(--spacer-lg);
}

.history-page > ion-card {
  margin-block: 0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacer-sm);
}

.kpi-card {
  margin: 0;
}

.kpi-card ion-note {
  display: block;
  margin-block-start: var(--spacer-2xs);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacer-lg);
}

.filter-item {
  display: flex;
  align-items: center;
  min-width: 0;
}

.filter-item ion-select,
.filter-item ion-input {
  flex: 1;
  min-width: 0;
}

.clear-filter-button {
  flex: 0 0 auto;
  margin-inline-start: var(--spacer-2xs);
}

.history-search {
  padding-inline: 0;
}

.history-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacer-sm);
  flex-wrap: wrap;
}

.history-results-header ion-item {
  flex: 1 1 min(100%, 520px);
  min-width: 0;
}

.row-skeleton {
  width: var(--spacer-3xl);
}

.event-spacer {
  block-size: var(--event-spacer-size);
}

.event-scroller {
  max-block-size: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

/* Five cells over six tracks: product, change, event (two), timing, status; the grid is the theme's. */
.list-item {
  --columns-desktop: 6;
  padding-inline-end: var(--spacer-sm);
  cursor: pointer;
}

.list-item:hover {
  background: var(--ion-color-light);
}

.list-item:focus-visible {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: -2px;
}

.list-item:last-child {
  border-bottom: none;
}

.list-item ion-item,
.list-item ion-label {
  min-width: 0;
}

/* Stretched onto their tracks so `.one-line` can clip. */
.list-item > ion-label {
  justify-self: stretch;
  width: 100%;
}

.list-item > ion-label.event-cell {
  text-align: start;
}

.list-item ion-thumbnail {
  --size: 48px;
}

/* Fixed line counts keep every row the height useVirtualRows sizes its spacers from. */
.one-line,
.list-item p {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.list-item .row-summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  block-size: 2lh;
}

@media (min-width: 991px) {
  .list-item {
    grid-template-columns:
      minmax(0, 2fr) minmax(0, 0.55fr) minmax(0, 1.35fr) minmax(0, 1.35fr) minmax(0, 0.95fr)
      minmax(0, 1.2fr);
  }

  .list-item > .event-cell {
    grid-column: span 2;
  }

  .timing-cell {
    text-align: start;
  }

  .status-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacer-2xs);
  }

  .list-item .row-summary {
    display: none;
  }
}

@media screen and (max-width: 600px) {
  .filter-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--spacer-base);
  }

  .history-results-header {
    align-items: flex-start;
  }
}
</style>
