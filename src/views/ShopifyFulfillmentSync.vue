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
        <!-- Latency leads because the complaint is lateness. "Unconfirmed" only alarms once you know
             how long it has been unconfirmed for. -->
        <div class="kpi-grid">
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Oldest unconfirmed") }}</ion-card-subtitle>
              <ion-card-title>{{ oldestUnconfirmed }}</ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Median ship to confirmed") }}</ion-card-subtitle>
              <ion-card-title>{{ medianLatency }}</ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Unconfirmed now") }}</ion-card-subtitle>
              <ion-card-title><AnimatedNumber :value="unconfirmed.length" /></ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Needs a human") }}</ion-card-subtitle>
              <ion-card-title><AnimatedNumber :value="needsHumanCount" /></ion-card-title>
            </ion-card-header>
          </ion-card>
        </div>

        <!-- The tiles still have to say what the median counted. -->
        <ion-note color="medium" class="stats-scope">
          {{ translate("Median measured over 212 shipments in the last 24 hours.") }}
        </ion-note>

        <!-- One card per shipment waiting on Shopify, newest problem first. The scannable row carries
             only what identifies and dates the shipment; the payload and the attempt history stay folded
             away, because a reader scanning ten of these is looking for which one to open, not reading
             all ten. POS stays a filter rather than its own page: same service, same guards. What
             differs is the expectation, because the customer is standing at the counter. -->
        <ion-card v-for="row in unconfirmed" :key="row.shipmentId">
          <!-- Identity, then facts, then disclosures — the shape the job run history card uses. The
               state badge rides the identity item's end slot rather than competing for a grid column. -->
          <ion-item lines="none">
            <ion-icon slot="start" :icon="attemptState(row).icon" :color="attemptState(row).color" />
            <ion-label class="ion-text-wrap">
              <p>{{ row.shipmentId }}</p>
              <h2>{{ row.orderName }}</h2>
              <p>{{ row.facility }}</p>
            </ion-label>
            <ion-badge slot="end" :color="attemptState(row).color">{{ attemptState(row).label }}</ion-badge>
          </ion-item>

          <ion-card-content>
            <div class="shipment-facts">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="cartOutline" color="medium" />
                <ion-label>
                  <p>{{ translate("Order placed") }}</p>
                  {{ row.orderDate }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-icon slot="start" :icon="sendOutline" color="medium" />
                <ion-label>
                  <p>{{ translate("Shipment shipped") }}</p>
                  {{ row.shippedDate }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-icon slot="start" :icon="timeOutline" color="medium" />
                <ion-label>
                  <p>{{ translate("Waiting") }}</p>
                  {{ row.age }}
                </ion-label>
              </ion-item>
            </div>

            <!-- The items themselves, scrolled rather than summarised: which product is stuck matters
                 to whoever has to explain it, and a count never answers that. -->
            <div class="item-strip">
              <ion-item v-for="item in row.items" :key="item.orderItemSeqId" lines="none">
                <ion-thumbnail slot="start">
                  <Image :src="item.imageUrl" />
                </ion-thumbnail>
                <ion-label class="ion-text-wrap">
                  {{ item.primary }}
                  <p>{{ item.secondary }}</p>
                </ion-label>
              </ion-item>
            </div>

            <!-- The failure reason belongs on the surface, not behind a disclosure: it is the one
                 thing that decides whether this row is a retry or a person's problem. -->
            <ion-item v-if="attemptState(row).detail" lines="none">
              <ion-label class="ion-text-wrap">
                <p>{{ attemptState(row).detail }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" size="small" @click="noop">
                {{ attemptState(row).action }}
              </ion-button>
            </ion-item>

            <ion-accordion-group>
              <ion-accordion value="payload">
                <ion-item slot="header" lines="full">
                  <ion-label>{{ translate("Request payload") }}</ion-label>
                  <ion-note slot="end">{{ translate("CreateShopifyFulfillment") }}</ion-note>
                </ion-item>
                <div slot="content" class="accordion-content">
                  <pre><code>{{ row.messageText }}</code></pre>
                </div>
              </ion-accordion>

              <ion-accordion value="history">
                <ion-item slot="header" lines="full">
                  <ion-label>{{ translate("Sync history") }}</ion-label>
                  <ion-note slot="end">
                    {{ translate("{count} attempt(s)", { count: row.attempts.length }) }}
                  </ion-note>
                </ion-item>
                <div slot="content" class="accordion-content">
                  <div class="history-table">
                    <div class="history-row history-header">
                      <ion-label>{{ translate("Attempted") }}</ion-label>
                      <ion-label>{{ translate("Status") }}</ion-label>
                      <ion-label>{{ translate("Result") }}</ion-label>
                    </div>
                    <div v-for="attempt in row.attempts" :key="attempt.attemptedAt" class="history-row">
                      <ion-label>{{ attempt.attemptedAt }}</ion-label>
                      <ion-badge :color="messageStatusColor(attempt.statusId)">
                        {{ messageStatusLabel(attempt.statusId) }}
                      </ion-badge>
                      <ion-label class="ion-text-wrap">{{ attempt.result }}</ion-label>
                    </div>
                  </div>

                  <!-- Shopify's own answer, which is the difference between "retry this" and "stop":
                       a fulfillment already recorded against the order means a retry duplicates it. -->
                  <ion-item lines="none">
                    <ion-label class="ion-text-wrap">
                      {{ translate("On the Shopify side") }}
                      <p>{{ row.shopifyState }}</p>
                    </ion-label>
                  </ion-item>
                </div>
              </ion-accordion>
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="!unconfirmed.length">
          <ion-card-content>
            {{ translate("Nothing is waiting to sync.") }}
          </ion-card-content>
        </ion-card>

      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonNote, IonPage, IonThumbnail, IonTitle, IonToolbar,
} from "@ionic/vue";
import {
  alertCircleOutline, cartOutline, refreshOutline, sendOutline, timeOutline,
} from "ionicons/icons";
import { computed, ref } from "vue";
import AnimatedNumber from "@/components/common/AnimatedNumber.vue";
import Image from "@/components/common/Image.vue";

const props = defineProps<{ id: string }>();

const connectionDetailsHref = computed(() => `/shopify-connection-details/${props.id}`);


type Channel = "pos" | "warehouse";
type DiagnosisId =
  "ALREADY_FULFILLED" |
  "ORDER_NOT_MAPPED" |
  "NO_WRITE_ACCESS" |
  "NOT_ELIGIBLE" |
  "NO_SHIPMENT_DETAIL" |
  "UNDIAGNOSED";

interface OrderItem {
  orderItemSeqId: string;
  /** Whatever the shop's primary product identifier resolves to — the name, here. */
  primary: string;
  /** And its secondary, conventionally the SKU. */
  secondary: string;
  /** Empty when the product has no image; Image falls back to the bundled placeholder. */
  imageUrl: string;
}

interface SyncAttempt {
  attemptedAt: string;
  statusId: string;
  result: string;
}

interface WaitingRow {
  shipmentId: string;
  orderName: string;
  facility: string;
  channel: Channel;
  items: OrderItem[];
  orderDate: string;
  shippedDate: string;
  age: string;
  diagnosis: DiagnosisId;
  /** SystemMessage.messageText — the shipment detail the send service turns into the Shopify body. */
  messageText: string;
  attempts: SyncAttempt[];
  /** What ShopifyFulfillmentHistory and the order's Shopify status say, which decides retry vs stop. */
  shopifyState: string;
}

/**
 * Fixture rows, oldest first, one per diagnosis. A real row is a CreateShopifyFulfillment
 * SystemMessage that has not reached SmsgSent, joined to its shipment — the payload, the status and
 * the attempt dates all come off that message, and the Shopify side comes off
 * ShopifyFulfillmentHistory.
 */
function payloadFor(orderName: string, shipmentId: string, items: { id: string; qty: number }[]) {
  return JSON.stringify({
    shipmentId,
    orderId: orderName,
    shopifyOrderId: `5${shipmentId.replace(/\D/g, "")}`,
    trackingNumber: "1Z999AA10123456784",
    carrierPartyId: "UPS",
    notifyCustomer: false,
    actualShopifyLocationId: "gid://shopify/Location/70000000001",
    shipmentItems: items.map((item) => ({ shopifyOrderLineItemId: item.id, quantity: item.qty })),
  }, null, 2);
}

const unconfirmed = ref<WaitingRow[]>([
  {
    shipmentId: "SHP-88214", orderName: "RAI-100461", facility: "Store 118 Newbury St",
    channel: "pos",
    items: [
      { orderItemSeqId: "00001", primary: "Matador Hoodie", secondary: "MTD-HD-BLK-M", imageUrl: "" },
    ],
    orderDate: "Aug 18, 1:42 PM", shippedDate: "Aug 19, 9:03 AM", age: "3d 4h",
    diagnosis: "ALREADY_FULFILLED",
    messageText: payloadFor("RAI-100461", "SHP-88214", [{ id: "14882301", qty: 1 }]),
    attempts: [
      { attemptedAt: "Aug 19, 9:03 AM", statusId: "SmsgError", result: "422 Unprocessable Entity: fulfillment already exists for this fulfillment order" },
      { attemptedAt: "Aug 19, 9:31 AM", statusId: "SmsgError", result: "422 Unprocessable Entity: fulfillment already exists for this fulfillment order" },
    ],
    shopifyState: "Fulfillment 4471222891 recorded Aug 19, 8:58 AM, before the OMS posted. Order is open, fully fulfilled.",
  },
  {
    shipmentId: "SHP-88407", orderName: "RAI-100477", facility: "Central DC",
    channel: "warehouse",
    items: [
      { orderItemSeqId: "00001", primary: "Trail Pant", secondary: "TRL-PT-OLV-32", imageUrl: "" },
      { orderItemSeqId: "00002", primary: "Trail Belt", secondary: "TRL-BLT-BRN-L", imageUrl: "" },
    ],
    orderDate: "Aug 19, 8:07 AM", shippedDate: "Aug 19, 6:11 PM", age: "2d 19h",
    diagnosis: "ORDER_NOT_MAPPED",
    messageText: payloadFor("RAI-100477", "SHP-88407", [{ id: "14882455", qty: 1 }, { id: "14882456", qty: 1 }]),
    attempts: [
      { attemptedAt: "Aug 19, 6:11 PM", statusId: "SmsgError", result: "No Shopify Shop record found for order RAI-100477 for shipment SHP-88407" },
    ],
    shopifyState: "No fulfillment recorded. The order could not be matched to a shop, so its Shopify state was never read.",
  },
  {
    shipmentId: "SHP-88512", orderName: "RAI-100479", facility: "Store 302 Cambridge",
    channel: "pos",
    items: [
      { orderItemSeqId: "00001", primary: "Alpine Vest", secondary: "ALP-VST-NVY-S", imageUrl: "" },
      { orderItemSeqId: "00002", primary: "Alpine Beanie", secondary: "ALP-BN-NVY-OS", imageUrl: "" },
    ],
    orderDate: "Aug 20, 11:20 AM", shippedDate: "Aug 21, 10:48 AM", age: "1d 2h",
    diagnosis: "NO_WRITE_ACCESS",
    messageText: payloadFor("RAI-100479", "SHP-88512", [{ id: "14883001", qty: 1 }, { id: "14883002", qty: 1 }]),
    attempts: [
      { attemptedAt: "Aug 21, 10:48 AM", statusId: "SmsgError", result: "No Shopify SystemMessageRemote found for shop 100002, not fulfilling shipment SHP-88512" },
    ],
    shopifyState: "Not read. Without a write credential the connector never reached the shop.",
  },
  {
    shipmentId: "SHP-88604", orderName: "RAI-100480", facility: "Reno DC",
    channel: "warehouse",
    items: [
      { orderItemSeqId: "00001", primary: "Summit Parka", secondary: "SMT-PK-RED-L", imageUrl: "" },
      { orderItemSeqId: "00002", primary: "Summit Shell", secondary: "SMT-SH-RED-L", imageUrl: "" },
      { orderItemSeqId: "00003", primary: "Summit Glove", secondary: "SMT-GLV-BLK-M", imageUrl: "" },
      { orderItemSeqId: "00004", primary: "Summit Liner", secondary: "SMT-LN-BLK-L", imageUrl: "" },
    ],
    orderDate: "Aug 21, 9:15 AM", shippedDate: "Aug 22, 6:24 AM", age: "6h 11m",
    diagnosis: "NO_SHIPMENT_DETAIL",
    messageText: "",
    attempts: [
      { attemptedAt: "Aug 22, 6:24 AM", statusId: "SmsgProduced", result: "No Shipment Details found for shipment SHP-88604 of shop 100002" },
    ],
    shopifyState: "No fulfillment recorded. Order is open and unfulfilled.",
  },
  {
    shipmentId: "SHP-88655", orderName: "RAI-100481", facility: "Store 214 Boston",
    channel: "pos",
    items: [
      { orderItemSeqId: "00001", primary: "Return Label", secondary: "RTN-LBL-STD", imageUrl: "" },
    ],
    orderDate: "Aug 22, 10:02 AM", shippedDate: "Aug 22, 11:43 AM", age: "52m",
    diagnosis: "NOT_ELIGIBLE",
    messageText: "",
    attempts: [],
    shopifyState: "Not applicable. This is not a sales shipment, so no fulfillment is expected.",
  },
  {
    shipmentId: "SHP-88702", orderName: "RAI-100482", facility: "Store 214 Boston",
    channel: "pos",
    items: [
      { orderItemSeqId: "00001", primary: "Geneva Cardigan", secondary: "GNV-CD-CRM-M", imageUrl: "" },
    ],
    orderDate: "Aug 22, 11:58 AM", shippedDate: "Aug 22, 12:29 PM", age: "6m",
    diagnosis: "UNDIAGNOSED",
    messageText: payloadFor("RAI-100482", "SHP-88702", [{ id: "14884110", qty: 1 }]),
    attempts: [
      { attemptedAt: "Aug 22, 12:29 PM", statusId: "SmsgSending", result: "In flight" },
    ],
    shopifyState: "No fulfillment recorded yet. Order is open and unfulfilled.",
  },
  {
    shipmentId: "SHP-88710", orderName: "RAI-100484", facility: "Central DC",
    channel: "warehouse",
    items: [
      { orderItemSeqId: "00001", primary: "Coastal Tee", secondary: "CST-TEE-WHT-L", imageUrl: "" },
    ],
    orderDate: "Aug 22, 12:04 PM", shippedDate: "Aug 22, 12:31 PM", age: "4m",
    diagnosis: "UNDIAGNOSED",
    messageText: payloadFor("RAI-100484", "SHP-88710", [{ id: "14884210", qty: 1 }]),
    attempts: [
      { attemptedAt: "Aug 22, 12:31 PM", statusId: "SmsgProduced", result: "Queued" },
    ],
    shopifyState: "No fulfillment recorded yet. Order is open and unfulfilled.",
  },
]);

/** Separate fixture: a latency distribution cannot be derived from the rows that never confirmed. */
const medianLatency = "8 sec";

const oldestUnconfirmed = computed(() => unconfirmed.value[0]?.age ?? translate("None"));

/**
 * A row's disposition, not just its label: whether a retry can help is the only thing the reader is
 * actually deciding, so it drives the badge colour and the button text together.
 */
const diagnoses: Record<DiagnosisId, {
  label: string; color: string; action: string; retryHelps: boolean;
}> = {
  ALREADY_FULFILLED: {
    label: translate("Already fulfilled in Shopify"), color: "warning",
    action: translate("Reconcile"), retryHelps: false,
  },
  ORDER_NOT_MAPPED: {
    label: translate("Order not mapped to a shop"), color: "danger",
    action: translate("Open order"), retryHelps: false,
  },
  NO_WRITE_ACCESS: {
    label: translate("Shop has no write access"), color: "danger",
    action: translate("Open connection"), retryHelps: false,
  },
  NOT_ELIGIBLE: {
    label: translate("Not eligible"), color: "medium",
    action: translate("Dismiss"), retryHelps: false,
  },
  NO_SHIPMENT_DETAIL: {
    label: translate("No shipment detail"), color: "warning",
    action: translate("Investigate"), retryHelps: false,
  },
  UNDIAGNOSED: {
    label: translate("Not diagnosed yet"), color: "primary",
    action: translate("Retry"), retryHelps: true,
  },
};

/**
 * What one card shows on its surface: the diagnosis drives the badge and the button, and the last
 * attempt's own result is the detail line — the error text is the single thing that decides whether
 * this row is a retry or a person's problem, so it does not go behind a disclosure.
 */
function attemptState(row: WaitingRow) {
  const diagnosis = diagnoses[row.diagnosis];
  const last = row.attempts[row.attempts.length - 1];
  const inFlight = last?.statusId === "SmsgProduced" || last?.statusId === "SmsgSending";

  return {
    label: diagnosis.label,
    color: diagnosis.color,
    action: diagnosis.action,
    icon: diagnosis.retryHelps ? (inFlight ? timeOutline : refreshOutline) : alertCircleOutline,
    // An in-flight row's "result" is just its own state, which the badge and the age already say.
    detail: last && !inFlight ? last.result : "",
  };
}

const messageStatuses: Record<string, { label: string; color: string }> = {
  SmsgProduced: { label: translate("Queued"), color: "medium" },
  SmsgSending: { label: translate("Sending"), color: "primary" },
  SmsgSent: { label: translate("Sent"), color: "success" },
  SmsgError: { label: translate("Error"), color: "danger" },
};

function messageStatusLabel(statusId: string) {
  return messageStatuses[statusId]?.label ?? statusId;
}

function messageStatusColor(statusId: string) {
  return messageStatuses[statusId]?.color ?? "medium";
}

const needsHumanCount = computed(() =>
  unconfirmed.value.filter((row) => !diagnoses[row.diagnosis].retryHelps).length);

function noop() {
  // Static layout. The retry, reconcile, and navigation actions are wired in a follow-up.
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

.stats-scope {
  display: block;
  padding-inline: var(--spacer-2xs);
}

/* One fact per cell, each an ion-item so the icon, the label and the value get ion-item's own
   left-aligned layout instead of a bare grid cell inheriting .list-item's centering. Same track
   sizing as the run card's metrics, so it reflows to two-up and then one-up on its own. */
.shipment-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacer-sm);
}

.shipment-facts ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}

/* Items scroll sideways in their own track rather than wrapping the card taller. Each row keeps a
   readable width (the 240px this app already uses for its widest list column) and does not shrink,
   which is what makes the overflow scroll instead of squashing. */
.item-strip {
  display: flex;
  gap: var(--spacer-sm);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-block-start: var(--spacer-sm);
}

.item-strip ion-item {
  flex: 0 0 auto;
  inline-size: 240px;
  --padding-start: 0;
  --inner-padding-end: 0;
}

.accordion-content {
  padding: var(--spacer-sm);
}

.accordion-content pre {
  overflow: auto;
  white-space: pre-wrap;
  margin: 0;
}

/* Attempt, status, result. Not the .list-item grid: every column here has to survive on a phone,
   because an attempt with its date but no result is not worth reading. */
.history-table {
  display: flex;
  flex-direction: column;
}

.history-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) max-content minmax(160px, 2fr);
  align-items: start;
  gap: var(--spacer-xs);
  padding-block: var(--spacer-xs);
  border-block-end: var(--border-medium);
}

.history-row:last-child {
  border-block-end: 0;
}

</style>
