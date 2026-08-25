<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="connectionDetailsHref" />
        </ion-buttons>
        <ion-title>{{ translate("Fulfillment sync") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fulfillment-sync-page">
      <main class="fulfillment-sync-content">
        <!-- The Pending pair shows an em dash rather than a number: the OMS has no API yet for the
             shipments that never reached Shopify, and a 0 here would read as "none", which is a
             claim this page cannot make. -->
        <div class="kpi-grid">
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Pending") }}</ion-card-subtitle>
              <ion-card-title>
                <ion-skeleton-text v-if="!queuedHydrated" animated style="width: 40%" />
                <template v-else>&mdash;</template>
              </ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Oldest pending") }}</ion-card-subtitle>
              <ion-card-title>
                <ion-skeleton-text v-if="!queuedHydrated" animated style="width: 40%" />
                <template v-else>&mdash;</template>
              </ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Queued") }}</ion-card-subtitle>
              <ion-card-title>
                <ion-skeleton-text v-if="!queuedHydrated" animated style="width: 40%" />
                <AnimatedNumber v-else :value="queuedRows.length" />
              </ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("SmsgError") }}</ion-card-subtitle>
              <ion-card-title>
                <ion-skeleton-text v-if="!queuedHydrated" animated style="width: 40%" />
                <AnimatedNumber v-else :value="gaveUpCount" />
              </ion-card-title>
            </ion-card-header>
          </ion-card>
        </div>

        <ion-segment v-model="segment">
          <ion-segment-button value="pending">
            <ion-label>{{ translate("Pending") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="queued">
            <ion-label>{{ queuedSegmentLabel }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="synced">
            <ion-label>{{ syncedSegmentLabel }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Pending is the work remaining: shipped, eligible, no fulfillment recorded against the
             order. No OMS API lists those shipments yet, so this segment states that plainly
             instead of faking rows or a spinner it could never resolve. -->
        <template v-if="segment === 'pending'">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Pending is not readable yet") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              {{ translate("The OMS has no API yet that lists shipped shipments that never reached Shopify.") }}
              {{ translate("When it is built, this segment will read shipped shipments with an empty Shipment.externalId.") }}
            </ion-card-content>
          </ion-card>
        </template>

        <!-- Queued is the message view: a CreateShopifyFulfillment message on this shop's remotes
             that has not reached SmsgSent. Its stored text and its error rows are the whole point. -->
        <template v-else-if="segment === 'queued'">
          <ion-note color="medium" class="segment-scope">
            {{ translate("Fulfillment messages on this shop's remotes that have not reached SmsgSent.") }}
          </ion-note>
          <ion-card v-if="!queuedHydrated">
            <ion-item lines="none">
              <ion-label>
                <p><ion-skeleton-text animated style="width: 30%" /></p>
                <ion-skeleton-text animated style="width: 45%" />
              </ion-label>
            </ion-item>
            <ion-card-content>
              <ion-skeleton-text animated style="width: 70%" />
            </ion-card-content>
          </ion-card>
          <template v-else>
            <FulfillmentShipmentCard
              v-for="card in queuedCards"
              :key="card.key"
              :row="card.row"
              :state="card.state"
            >
              <ion-item v-if="retryNote(card.message)" lines="none">
                <ion-label class="ion-text-wrap">
                  <p>{{ retryNote(card.message) }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  size="small"
                  :disabled="retryingId === card.message.systemMessageId"
                  @click="requestQueuedRecovery(card.message)"
                >
                  {{ translate("Retry") }}
                </ion-button>
              </ion-item>

              <ion-accordion-group @ionChange="onQueuedAccordionChange(card.message, $event)">
                <ion-accordion value="messageText">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("Message text") }}</ion-label>
                    <ion-note slot="end">{{ card.message.systemMessageTypeId }}</ion-note>
                  </ion-item>
                  <div slot="content" class="accordion-content">
                    <pre><code>{{ prettyMessageText(card.message.messageText) }}</code></pre>
                  </div>
                </ion-accordion>

                <!-- One ion-item per SystemMessageError row: its date, its text, and the status the
                     attempt was reaching for. Fetched when first opened — only failed messages have
                     any, so polling every message's errors would be almost entirely wasted requests. -->
                <ion-accordion value="errors">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("System message errors") }}</ion-label>
                    <ion-note v-if="errorsFor(card.message.systemMessageId).length" slot="end">
                      {{ errorsFor(card.message.systemMessageId).length }}
                    </ion-note>
                  </ion-item>
                  <div slot="content">
                    <ion-item
                      v-for="(error, index) in errorsFor(card.message.systemMessageId)"
                      :key="index"
                      lines="full"
                    >
                      <ion-label class="ion-text-wrap">
                        <p>{{ formatDateTime(error.errorDate) }}</p>
                        {{ error.errorText }}
                      </ion-label>
                      <ion-note slot="end">{{ error.attemptedStatusId }}</ion-note>
                    </ion-item>
                    <ion-item v-if="loadingErrorIds.includes(card.message.systemMessageId)" lines="none">
                      <ion-label><ion-skeleton-text animated style="width: 60%" /></ion-label>
                    </ion-item>
                    <ion-item v-else-if="!errorsFor(card.message.systemMessageId).length" lines="none">
                      <ion-label>{{ translate("No errors recorded for this message.") }}</ion-label>
                    </ion-item>
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            </FulfillmentShipmentCard>
            <ion-card v-if="!queuedCards.length">
              <ion-card-content>{{ translate("Nothing is queued.") }}</ion-card-content>
            </ion-card>
          </template>
        </template>

        <!-- Synced is the fulfillment history feed. A history row holds no systemMessageId, so there
             is no message text or error list; what confirms a push is Shopify's own record of the
             fulfillment, fetched when a card is opened. displayStatus carries the lifecycle stage and
             status carries whether it still counts, so the badge shows the first coloured by the
             second — and no badge at all until Shopify has actually answered. -->
        <template v-else>
          <ion-note color="medium" class="segment-scope">
            {{ translate("Fulfillments recorded against this shop, newest first, read back from Shopify.") }}
          </ion-note>
          <ion-card v-if="!syncedHydrated">
            <ion-item lines="none">
              <ion-label>
                <p><ion-skeleton-text animated style="width: 30%" /></p>
                <ion-skeleton-text animated style="width: 45%" />
              </ion-label>
            </ion-item>
            <ion-card-content>
              <ion-skeleton-text animated style="width: 70%" />
            </ion-card-content>
          </ion-card>
          <!-- 404 from the probe, remembered by the worker: the OMS cannot answer, which must not
               render as "nothing has synced". -->
          <ion-card v-else-if="endpointMissing">
            <ion-card-header>
              <ion-card-title>{{ translate("Fulfillment history is not available on this OMS") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              {{ translate("This OMS does not expose GET sob/shopify/fulfillmentHistories yet.") }}
              {{ translate("The endpoint ships with a pending connector change; this segment fills in once it is deployed.") }}
            </ion-card-content>
          </ion-card>
          <template v-else>
            <FulfillmentShipmentCard
              v-for="card in syncedCards"
              :key="card.key"
              :row="card.row"
              :state="card.state"
            >
              <template v-if="card.details">
                <div class="detail-facts">
                  <ion-item lines="none">
                    <ion-label class="ion-text-wrap">
                      <p>{{ translate("Fulfillment") }}</p>
                      {{ card.details.name }}
                    </ion-label>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-label>
                      <p>{{ translate("status") }}</p>
                      {{ card.details.status }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.locationName" lines="none">
                    <ion-label class="ion-text-wrap">
                      <p>{{ translate("Fulfilled from") }}</p>
                      {{ card.details.locationName }}
                    </ion-label>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-label>
                      <p>{{ translate("totalQuantity") }}</p>
                      {{ card.details.totalQuantity }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.inTransitAt" lines="none">
                    <ion-label>
                      <p>{{ translate("inTransitAt") }}</p>
                      {{ formatDateTime(card.details.inTransitAt) }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.estimatedDeliveryAt" lines="none">
                    <ion-label>
                      <p>{{ translate("estimatedDeliveryAt") }}</p>
                      {{ formatDateTime(card.details.estimatedDeliveryAt) }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="card.details.deliveredAt" lines="none">
                    <ion-label>
                      <p>{{ translate("deliveredAt") }}</p>
                      {{ formatDateTime(card.details.deliveredAt) }}
                    </ion-label>
                  </ion-item>
                </div>

                <!-- The order-level view: whether anything is still owed, and what is blocking it. -->
                <template v-for="(order, index) in card.details.fulfillmentOrders" :key="index">
                  <ion-item-divider>
                    <ion-label>{{ translate("Fulfillment order") }}</ion-label>
                  </ion-item-divider>
                  <div class="detail-facts">
                    <ion-item lines="none">
                      <ion-label>
                        <p>{{ translate("status") }}</p>
                        {{ order.status }}
                      </ion-label>
                    </ion-item>
                    <ion-item lines="none">
                      <ion-label>
                        <p>{{ translate("requestStatus") }}</p>
                        {{ order.requestStatus }}
                      </ion-label>
                    </ion-item>
                    <ion-item v-if="order.fulfillBy" lines="none">
                      <ion-label>
                        <p>{{ translate("fulfillBy") }}</p>
                        {{ formatDateTime(order.fulfillBy) }}
                      </ion-label>
                    </ion-item>
                    <ion-item v-if="order.deliveryMethod" lines="none">
                      <ion-label class="ion-text-wrap">
                        <p>{{ translate("deliveryMethod") }}</p>
                        {{ order.deliveryMethod }}
                      </ion-label>
                    </ion-item>
                    <ion-item v-if="order.destination" lines="none">
                      <ion-label class="ion-text-wrap">
                        <p>{{ translate("destination") }}</p>
                        {{ order.destination }}
                      </ion-label>
                    </ion-item>
                  </div>
                  <ion-item v-if="order.holds.length" lines="none">
                    <ion-label class="ion-text-wrap">
                      <p>{{ translate("fulfillmentHolds") }}</p>
                      {{ order.holds.join(", ") }}
                    </ion-label>
                    <ion-badge slot="end" color="warning">{{ translate("On hold") }}</ion-badge>
                  </ion-item>
                </template>
              </template>
              <ion-item v-else-if="card.detail?.state === 'unavailable'" lines="none">
                <ion-label class="ion-text-wrap">
                  {{ translate("Shopify could not be reached for this fulfillment.") }}
                </ion-label>
              </ion-item>
              <ion-item v-else-if="card.detail?.state === 'loading'" lines="none">
                <ion-label><ion-skeleton-text animated style="width: 60%" /></ion-label>
              </ion-item>

              <ion-accordion-group @ionChange="onSyncedAccordionChange(card.source, $event)">
                <!-- The carrier's own narrative, folded away: this connection grows with every scan,
                     and displayStatus on the badge already says where it got to. -->
                <ion-accordion value="events">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("events") }}</ion-label>
                    <ion-note v-if="card.details" slot="end">{{ card.details.events.length }}</ion-note>
                  </ion-item>
                  <div slot="content">
                    <template v-if="card.details">
                      <ion-item v-for="(event, index) in card.details.events" :key="index" lines="full">
                        <ion-label class="ion-text-wrap">
                          <p>{{ formatDateTime(event.happenedAt) }}</p>
                          {{ event.message }}
                        </ion-label>
                        <ion-note slot="end">{{ event.status }}</ion-note>
                      </ion-item>
                      <ion-item v-if="!card.details.events.length" lines="none">
                        <ion-label>{{ translate("Shopify has recorded no delivery events yet.") }}</ion-label>
                      </ion-item>
                    </template>
                  </div>
                </ion-accordion>

                <ion-accordion value="tracking">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("trackingInfo") }}</ion-label>
                    <ion-note v-if="card.details" slot="end">{{ card.details.trackingInfo.length }}</ion-note>
                  </ion-item>
                  <div slot="content">
                    <template v-if="card.details">
                      <ion-item v-for="(tracking, index) in card.details.trackingInfo" :key="index" lines="full">
                        <ion-label class="ion-text-wrap">
                          <p>{{ tracking.company }}</p>
                          {{ tracking.number }}
                        </ion-label>
                      </ion-item>
                      <ion-item v-if="!card.details.trackingInfo.length" lines="none">
                        <ion-label>{{ translate("Shopify holds no tracking for this fulfillment.") }}</ion-label>
                      </ion-item>
                    </template>
                  </div>
                </ion-accordion>

                <ion-accordion value="lineItems">
                  <ion-item slot="header" lines="full">
                    <ion-label>{{ translate("fulfillmentLineItems") }}</ion-label>
                    <ion-note v-if="card.details" slot="end">{{ card.details.lineItems.length }}</ion-note>
                  </ion-item>
                  <div slot="content">
                    <template v-if="card.details">
                      <ion-item v-for="(line, index) in card.details.lineItems" :key="index" lines="full">
                        <ion-label class="ion-text-wrap">
                          <p>{{ line.sku }}</p>
                          {{ line.name }}
                        </ion-label>
                        <ion-note slot="end">{{ line.quantity }}</ion-note>
                      </ion-item>
                    </template>
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            </FulfillmentShipmentCard>
            <ion-card v-if="!syncedCards.length">
              <ion-card-content>{{ translate("Nothing has synced yet.") }}</ion-card-content>
            </ion-card>
          </template>
        </template>

      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem,
  IonItemDivider, IonLabel, IonNote, IonPage, IonSegment, IonSegmentButton, IonSkeletonText,
  IonTitle, IonToolbar, alertController, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { calendarOutline, cartOutline, refreshOutline, sendOutline, timeOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import AnimatedNumber from "@/components/common/AnimatedNumber.vue";
import type {
  FulfillmentOrderItem, FulfillmentShipmentRow, FulfillmentShipmentState,
} from "@/components/shopify-fulfillment/FulfillmentShipmentCard.types";
import FulfillmentShipmentCard from "@/components/shopify-fulfillment/FulfillmentShipmentCard.vue";
import { useCacheSync } from "@/composables/useCacheSync";
import { useFacilities } from "@/composables/useFacilities";
import { useProductNames } from "@/composables/useProductNames";
import { useShopifySyncContext } from "@/composables/useShopify";
import {
  type OmsShipmentContext, type QueuedFulfillmentRow, type SyncedFulfillmentRow,
  useOmsShipmentContext, useQueuedFulfillments, useShopifyFulfillmentDetails,
  useSyncedFulfillments,
} from "@/composables/useShopifyFulfillment";
import { useSystemMessage, useSystemMessageErrors } from "@/composables/useSystemMessage";
import { formatDateTime } from "@/utils";
import {
  type ShopifyFulfillmentDetails, fulfillmentSyncDomains,
} from "@/utils/shopifyFulfillment";

const props = defineProps<{ id: string }>();

const connectionDetailsHref = computed(() => `/shopify-connection-details/${props.id}`);

const segment = ref<"pending" | "queued" | "synced">("pending");

const syncContext = useShopifySyncContext(() => props.id);
const { rows: queuedRows, hydrated: queuedHydrated } = useQueuedFulfillments(() => props.id);
const { getShipmentContext } = useOmsShipmentContext();
const { rows: syncedRows, hydrated: syncedHydrated, endpointMissing } = useSyncedFulfillments(() => props.id);
const { getFulfillmentDetails } = useShopifyFulfillmentDetails();
const { products: resolvedProducts, resolve: resolveProductNames } = useProductNames();
const {
  ensureSystemMessageErrors, forceSystemMessageStatus, resendSystemMessage, resetSystemMessageError,
} = useSystemMessage();
// Unscoped on purpose: the cache only ever holds errors a card asked for (class C, on demand), and
// one subscription serves every card where a per-row scope cannot be created inside v-for.
const { errors: cachedMessageErrors } = useSystemMessageErrors();
const { records: cachedFacilities } = useFacilities();
const { start: startSyncDomains, stop: stopSyncDomains, afterMutation } = useCacheSync();

// ---------------------------------------------------------------------------------------------
// Worker lifecycle — the same start/stop shape the inventory sync page uses.
// ---------------------------------------------------------------------------------------------

const isViewActive = ref(false);

function activeSyncDomains() {
  return fulfillmentSyncDomains({
    shopId: String(props.id ?? ""),
    // With the shop's exact remotes the message domain skips every other shop's remotes; until they
    // resolve, the factory's config-scope fallback keeps the first paint correct.
    ...(syncContext.remoteIds.value.length
      ? { systemMessageRemoteIds: syncContext.remoteIds.value }
      : {}),
  });
}

// Remotes are cached asynchronously, so the first start usually runs on the fallback scope and this
// narrows it once they land. Immediate so a deep link that changes only props.id is also covered.
watch(() => `${props.id ?? ""}|${syncContext.remoteIds.value.join(",")}`, () => {
  if(isViewActive.value) {void startSyncDomains(activeSyncDomains());}
}, { immediate: true });

onIonViewWillEnter(() => {
  isViewActive.value = true;
  void startSyncDomains(activeSyncDomains());
});

onIonViewDidLeave(() => {
  isViewActive.value = false;
  stopSyncDomains();
});

// ---------------------------------------------------------------------------------------------
// KPIs and segment labels.
// ---------------------------------------------------------------------------------------------

const gaveUpCount = computed(() =>
  queuedRows.value.filter((row) => row.statusId === "SmsgError").length);

const queuedSegmentLabel = computed(() =>
  queuedHydrated.value ? `${translate("Queued")} (${queuedRows.value.length})` : translate("Queued"));

// No count while the endpoint is missing: 0 would claim "nothing synced", which the OMS cannot say.
const syncedSegmentLabel = computed(() =>
  syncedHydrated.value && !endpointMissing.value
    ? `${translate("Synced")} (${syncedRows.value.length})`
    : translate("Synced"));

// ---------------------------------------------------------------------------------------------
// Queued — CreateShopifyFulfillment messages, straight off the cache.
// ---------------------------------------------------------------------------------------------

type ShipmentContextState =
  { state: "loading" } |
  { state: "loaded"; context?: OmsShipmentContext };

/** Per-queued-message order context, fetched once per message and held for the session. */
const shipmentContexts = ref(new Map<string, ShipmentContextState>());

async function loadShipmentContext(message: QueuedFulfillmentRow) {
  const key = message.systemMessageId;
  if(shipmentContexts.value.has(key)) {return;}
  const loading = new Map(shipmentContexts.value);
  loading.set(key, { state: "loading" });
  shipmentContexts.value = loading;

  // A payload naming neither settles immediately with no context: the card keeps its message facts
  // only, and no spinner that will not end.
  const context = await getShipmentContext({
    shipmentId: message.parsed.shipmentId,
    orderId: message.parsed.orderId || message.orderId,
  });
  const settled = new Map(shipmentContexts.value);
  settled.set(key, { state: "loaded", context });
  shipmentContexts.value = settled;
}

/**
 * Eager, not lazy: the two dates are what an operator opens this page for, so hiding them behind a
 * disclosure would defeat the point. But eager over the whole list is a request burst — this shop
 * carries 54 queued messages — so the reads run a few at a time instead of all at once. Each is a
 * read-only PK query, cached for the session, so the queue drains once and never re-runs.
 */
const SHIPMENT_CONTEXT_CONCURRENCY = 6;

async function loadShipmentContexts(rows: QueuedFulfillmentRow[]) {
  const pending = rows.filter((row) => !shipmentContexts.value.has(row.systemMessageId));
  for(let start = 0; start < pending.length; start += SHIPMENT_CONTEXT_CONCURRENCY) {
    const batch = pending.slice(start, start + SHIPMENT_CONTEXT_CONCURRENCY);
    await Promise.all(batch.map((row) => loadShipmentContext(row)));
  }
}

watch(queuedRows, (rows) => {
  void loadShipmentContexts(rows);
}, { immediate: true });

interface QueuedCardView {
  key: string;
  message: QueuedFulfillmentRow;
  row: FulfillmentShipmentRow;
  state: FulfillmentShipmentState;
}

/** Colour only. The label is always the statusId itself. */
const messageStatusColors: Record<string, string> = {
  SmsgProduced: "warning",
  SmsgSending: "primary",
  SmsgSent: "success",
  SmsgError: "danger",
};

function messageStatusColor(statusId: string) {
  return messageStatusColors[statusId] ?? "medium";
}

/** An age ("3d 4h", "52m") rather than a stamp the operator has to subtract from now themselves. */
function formatWaiting(initDate: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - initDate) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if(days) {return hours ? `${days}d ${hours}h` : `${days}d`;}
  if(hours) {return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;}

  return `${minutes}m`;
}

function queuedItems(message: QueuedFulfillmentRow): FulfillmentOrderItem[] {
  return message.parsed.items.map((item, index) => {
    const product = resolvedProducts.value.get(item.productId);

    return {
      orderItemSeqId: item.orderItemSeqId || item.shopifyLineItemId || String(index),
      // parentProductName is the name a merchandiser recognises; productName alone is a bare
      // variant size on this OMS. The raw id stays as the last resort so a row never goes blank.
      primary: product?.parentProductName || product?.productName || item.productId,
      secondary: product?.sku || item.productId,
      imageUrl: product?.mainImageUrl || "",
    };
  });
}

const queuedCards = computed<QueuedCardView[]>(() => queuedRows.value.map((message) => {
  const ctxState = shipmentContexts.value.get(message.systemMessageId);
  const ctx = ctxState?.state === "loaded" ? ctxState.context : undefined;

  return {
    key: message.systemMessageId,
    message,
    state: { label: message.statusId, color: messageStatusColor(message.statusId) },
    row: {
      shipmentId: message.parsed.shipmentId,
      // The human-facing name from OrderHeader when enrichment found it; ids only as a fallback.
      orderName: ctx?.orderName || message.orderId || message.parsed.orderId,
      facility: ctx?.facilityName,
      facts: [
        ...(ctx?.orderDate ? [
          { icon: cartOutline, label: translate("Order placed"), value: formatDateTime(ctx.orderDate) },
        ] : []),
        ...(ctx?.shippedDate ? [
          { icon: sendOutline, label: translate("Shipment shipped"), value: formatDateTime(ctx.shippedDate) },
        ] : []),
        ...(message.initDate ? [
          { icon: calendarOutline, label: translate("Queued at"), value: formatDateTime(message.initDate) },
        ] : []),
        ...(message.lastAttemptDate ? [
          { icon: refreshOutline, label: translate("Last attempt"), value: formatDateTime(message.lastAttemptDate) },
        ] : []),
        ...(message.initDate ? [
          { icon: timeOutline, label: translate("Waiting"), value: formatWaiting(message.initDate) },
        ] : []),
      ],
      items: queuedItems(message),
    },
  };
}));

// Solr is asked once per new product id; `resolve` filters ids already requested.
watch(queuedRows, (rows) => {
  const productIds = rows.flatMap((row) => row.parsed.items.map((item) => item.productId)).filter(Boolean);
  if(productIds.length) {void resolveProductNames(productIds);}
}, { immediate: true });

/**
 * Prose about real fields, not a status. SmsgError is terminal and only the sweep sets it, once
 * failCount reaches retryLimit. A message stranded in SmsgSending cannot self-heal, because
 * send#ProducedSystemMessage refuses anything that is not SmsgProduced or SmsgError.
 */
function retryNote(message: QueuedFulfillmentRow) {
  if(message.statusId === "SmsgError") {
    return translate("failCount reached {count} and the sweep stopped retrying. Set the status back to SmsgProduced to try again.", { count: message.failCount });
  }
  if(message.statusId === "SmsgSending") {
    return translate("Left in SmsgSending. The sweep only picks up SmsgProduced or SmsgError, so this one needs its status reset.");
  }
  if(message.failCount > 0) {
    return translate("failCount is {count}. The sweep retries once lastAttemptDate is older than its retry interval.", { count: message.failCount });
  }

  return "";
}

/** The stored payload pretty-printed when it parses; verbatim when it does not — a malformed
 *  payload is precisely the row an operator most needs to read as stored. */
function prettyMessageText(messageText: string): string {
  try {
    return JSON.stringify(JSON.parse(messageText), null, 2);
  } catch {
    return messageText;
  }
}

// ---------------------------------------------------------------------------------------------
// Queued — delivery errors, fetched when a card's errors accordion first opens.
// ---------------------------------------------------------------------------------------------

const errorsByMessage = computed(() => {
  const byMessage = new Map<string, any[]>();
  for(const error of cachedMessageErrors.value) {
    const systemMessageId = String(error?.systemMessageId ?? "");
    if(!systemMessageId) {continue;}
    byMessage.set(systemMessageId, [...(byMessage.get(systemMessageId) ?? []), error]);
  }

  return byMessage;
});

function errorsFor(systemMessageId: string): any[] {
  return errorsByMessage.value.get(systemMessageId) ?? [];
}

const loadingErrorIds = ref<string[]>([]);

async function loadMessageErrors(systemMessageId: string) {
  if(loadingErrorIds.value.includes(systemMessageId)) {return;}
  loadingErrorIds.value = [...loadingErrorIds.value, systemMessageId];
  try {
    // Write-through: the rows land in systemMessageErrorCache, which `errorsFor` reads reactively.
    await ensureSystemMessageErrors(systemMessageId);
  } finally {
    loadingErrorIds.value = loadingErrorIds.value.filter((id) => id !== systemMessageId);
  }
}

function onQueuedAccordionChange(message: QueuedFulfillmentRow, event: CustomEvent) {
  const value = (event as any)?.detail?.value;
  const opened = Array.isArray(value) ? value : [value];
  if(opened.includes("errors")) {void loadMessageErrors(message.systemMessageId);}
}

// ---------------------------------------------------------------------------------------------
// Queued — recovery actions. Confirmed first because each one issues a real send.
// ---------------------------------------------------------------------------------------------

interface QueuedRecoveryPlan {
  /** What the confirm alert tells the operator will run, naming the endpoints it calls. */
  description: string;
  run: () => Promise<void>;
}

function recoveryPlanFor(message: QueuedFulfillmentRow): QueuedRecoveryPlan | undefined {
  const systemMessageId = message.systemMessageId;
  if(message.statusId === "SmsgError") {
    return {
      description: "Clears the message's error state (resetError), then re-attempts delivery of the same stored message (send).",
      run: async () => {
        await resetSystemMessageError(systemMessageId);
        await resendSystemMessage(systemMessageId);
      },
    };
  }
  if(message.statusId === "SmsgSending") {
    // The one state neither send nor reset can leave: the sweep only picks up SmsgProduced and
    // SmsgError, so a stranded send must be forced back before a resend means anything.
    return {
      description: "Forces the status back to SmsgProduced (update), then re-attempts delivery of the same stored message (send).",
      run: async () => {
        await forceSystemMessageStatus(systemMessageId, "SmsgProduced");
        await resendSystemMessage(systemMessageId);
      },
    };
  }
  if(message.statusId === "SmsgProduced" && message.failCount > 0) {
    return {
      description: "Re-attempts delivery of the same stored message (send) now, instead of waiting for the sweep's retry interval.",
      run: async () => {
        await resendSystemMessage(systemMessageId);
      },
    };
  }

  return undefined;
}

const retryingId = ref("");

/**
 * The confirmed branch, kept apart from the alert so its order of operations is directly
 * assertable — ion-alert cannot be driven from a jsdom test.
 */
async function runQueuedRecovery(message: QueuedFulfillmentRow) {
  const plan = recoveryPlanFor(message);
  if(!plan || retryingId.value) {return;}
  retryingId.value = message.systemMessageId;
  try {
    await plan.run();
    commonUtil.showToast("Fulfillment queued for another delivery attempt.");
    // The status and failCount just changed server-side; re-read the one row so the badge follows.
    await afterMutation("systemMessage", { systemMessageId: message.systemMessageId });
  } catch (error: any) {
    logger.error("Fulfillment message recovery failed", message.systemMessageId, error);
    commonUtil.showToast(error?.message || "The retry could not be requested.");
  } finally {
    retryingId.value = "";
  }
}

async function requestQueuedRecovery(message: QueuedFulfillmentRow) {
  const plan = recoveryPlanFor(message);
  if(!plan) {return;}
  const shipment = message.parsed.shipmentId || message.orderId || message.parsed.orderId ||
    message.systemMessageId;
  const alert = await alertController.create({
    header: `Retry ${shipment}?`,
    message: plan.description,
    buttons: [
      { text: "Cancel", role: "cancel" },
      { text: "Confirm", role: "confirm" },
    ],
  });
  await alert.present();
  if((await alert.onDidDismiss()).role !== "confirm") {return;}
  await runQueuedRecovery(message);
}

// ---------------------------------------------------------------------------------------------
// Synced — history rows immediately, Shopify's own record on first expand.
// ---------------------------------------------------------------------------------------------

type FulfillmentDetailState =
  { state: "loading" } |
  { state: "unavailable" } |
  { state: "loaded"; details: ShopifyFulfillmentDetails };

const fulfillmentDetails = ref(new Map<string, FulfillmentDetailState>());

interface SyncedCardView {
  key: string;
  source: SyncedFulfillmentRow;
  row: FulfillmentShipmentRow;
  state?: FulfillmentShipmentState;
  detail?: FulfillmentDetailState;
  details?: ShopifyFulfillmentDetails;
}

/**
 * FulfillmentStatus decides the colour of a synced card, while displayStatus supplies its words: a
 * CANCELLED fulfillment can still read DELIVERED, and the colour is what says it no longer counts.
 */
function fulfillmentStatusColor(status: string) {
  if(status === "SUCCESS") { return "success"; }
  if(status === "CANCELLED") { return "warning"; }

  return "danger";
}

const facilityNames = computed(() => {
  const names = new Map<string, string>();
  for(const facility of cachedFacilities.value) {
    const facilityId = String(facility?.facilityId ?? "");
    const facilityName = String(facility?.facilityName ?? "").trim();
    if(facilityId && facilityName) {names.set(facilityId, facilityName);}
  }

  return names;
});

const syncedCards = computed<SyncedCardView[]>(() => syncedRows.value.map((source) => {
  const detail = fulfillmentDetails.value.get(source.fulfillmentKey);
  const details = detail?.state === "loaded" ? detail.details : undefined;

  return {
    key: source.fulfillmentKey,
    source,
    detail,
    details,
    state: details
      ? { label: details.displayStatus, color: fulfillmentStatusColor(details.status) }
      : undefined,
    row: {
      shipmentId: source.shipmentId,
      orderName: source.omsOrderId || source.shopifyOrderId,
      facility: source.originFacilityId
        ? facilityNames.value.get(source.originFacilityId) ?? source.originFacilityId
        : undefined,
      facts: [
        ...(source.orderDate ? [
          { icon: cartOutline, label: translate("Order placed"), value: formatDateTime(source.orderDate) },
        ] : []),
        ...(source.shippedDate ? [
          { icon: sendOutline, label: translate("Shipment shipped"), value: formatDateTime(source.shippedDate) },
        ] : []),
        ...(source.lastUpdatedStamp ? [
          { icon: timeOutline, label: translate("Recorded"), value: formatDateTime(source.lastUpdatedStamp) },
        ] : []),
      ],
      // No items: the history row carries none, and the card omits the strip entirely.
    },
  };
}));

async function loadFulfillmentDetails(source: SyncedFulfillmentRow) {
  const current = fulfillmentDetails.value.get(source.fulfillmentKey);
  // "unavailable" deliberately stays retryable — the composable never caches failures, so the next
  // expand heals a Shopify blip instead of pinning the card to "unreachable" all session.
  if(current && current.state !== "unavailable") {return;}
  const loading = new Map(fulfillmentDetails.value);
  loading.set(source.fulfillmentKey, { state: "loading" });
  fulfillmentDetails.value = loading;

  const result = await getFulfillmentDetails({
    shopId: source.shopId,
    fulfillmentId: source.fulfillmentId,
  });

  const settled = new Map(fulfillmentDetails.value);
  settled.set(source.fulfillmentKey, result.unavailable
    ? { state: "unavailable" }
    : { state: "loaded", details: result });
  fulfillmentDetails.value = settled;
}

function onSyncedAccordionChange(source: SyncedFulfillmentRow, event: CustomEvent) {
  const value = (event as any)?.detail?.value;
  const opened = Array.isArray(value) ? value.length > 0 : Boolean(value);
  // Only an expansion fetches; collapsing the last accordion also fires ionChange, with no value.
  if(opened) {void loadFulfillmentDetails(source);}
}
</script>

<style scoped>
/* Matches the inventory job run history's own main padding, so the stat row's internal gap and the
   gap between sections are the same measure. */
.fulfillment-sync-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-base);
  padding: var(--spacer-base);
}

.fulfillment-sync-content > ion-card {
  margin-block: 0;
  margin-inline: 0;
}

/* Same stat cards the inventory job run history and the job manager find pages use, so a number on
   this page reads the way a number reads everywhere else. */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacer-base);
}

.kpi-grid ion-card {
  margin: 0;
}

.segment-scope {
  display: block;
  padding-inline: var(--spacer-2xs);
}

.accordion-content {
  padding: var(--spacer-sm);
}

.accordion-content pre {
  overflow: auto;
  white-space: pre-wrap;
  margin: 0;
}

/* The Shopify record's own facts, laid out like the card's shipment facts so the two halves of a
   synced card read as one thing rather than two conventions. */
.detail-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacer-sm);
  padding-block-start: var(--spacer-sm);
}

.detail-facts ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}
</style>
