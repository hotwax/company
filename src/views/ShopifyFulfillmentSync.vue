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
        <div class="kpi-grid">
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Pending") }}</ion-card-subtitle>
              <ion-card-title><AnimatedNumber :value="pending.length" /></ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Oldest pending") }}</ion-card-subtitle>
              <ion-card-title>{{ oldestPending }}</ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Queued") }}</ion-card-subtitle>
              <ion-card-title><AnimatedNumber :value="queued.length" /></ion-card-title>
            </ion-card-header>
          </ion-card>
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("SmsgError") }}</ion-card-subtitle>
              <ion-card-title><AnimatedNumber :value="gaveUpCount" /></ion-card-title>
            </ion-card-header>
          </ion-card>
        </div>

        <ion-segment v-model="segment">
          <ion-segment-button value="pending">
            <ion-label>{{ translate("Pending") }} ({{ pending.length }})</ion-label>
          </ion-segment-button>
          <ion-segment-button value="queued">
            <ion-label>{{ translate("Queued") }} ({{ queued.length }})</ion-label>
          </ion-segment-button>
          <ion-segment-button value="synced">
            <ion-label>{{ translate("Synced") }} ({{ synced.length }})</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Pending is the work remaining: qualified to send, no fulfillment recorded against the
             order yet. There is no message and no attempt, so the card carries only the shipment. -->
        <template v-if="segment === 'pending'">
          <ion-note color="medium" class="segment-scope">
            {{ translate("Shipped and eligible, with no Shopify fulfillment recorded against the order yet.") }}
          </ion-note>
          <FulfillmentShipmentCard
            v-for="row in pending"
            :key="row.shipmentId"
            :row="row"
          />
          <ion-card v-if="!pending.length">
            <ion-card-content>{{ translate("Nothing is pending.") }}</ion-card-content>
          </ion-card>
        </template>

        <!-- Queued is the message view: a CreateShopifyFulfillment message on this shop's remotes
             that has not reached SmsgSent. Its stored text and its error rows are the whole point. -->
        <template v-else-if="segment === 'queued'">
          <ion-note color="medium" class="segment-scope">
            {{ translate("Fulfillment messages on this shop's remotes that have not reached SmsgSent.") }}
          </ion-note>
          <FulfillmentShipmentCard
            v-for="row in queued"
            :key="row.shipmentId"
            :row="row"
            :state="{ label: row.statusId, color: messageStatusColor(row.statusId) }"
          >
            <ion-item v-if="retryNote(row)" lines="none">
              <ion-label class="ion-text-wrap">
                <p>{{ retryNote(row) }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" size="small" @click="noop">
                {{ translate("Retry") }}
              </ion-button>
            </ion-item>

            <ion-accordion-group>
              <ion-accordion value="messageText">
                <ion-item slot="header" lines="full">
                  <ion-label>{{ translate("Message text") }}</ion-label>
                  <ion-note slot="end">{{ row.systemMessageTypeId }}</ion-note>
                </ion-item>
                <div slot="content" class="accordion-content">
                  <pre><code>{{ row.messageText }}</code></pre>
                </div>
              </ion-accordion>

              <!-- One ion-item per SystemMessageError row: its date, its text, and the status the
                   attempt was reaching for. A message still in flight has none. -->
              <ion-accordion value="errors">
                <ion-item slot="header" lines="full">
                  <ion-label>{{ translate("System message errors") }}</ion-label>
                  <ion-note slot="end">{{ row.errors.length }}</ion-note>
                </ion-item>
                <div slot="content">
                  <ion-item v-for="error in row.errors" :key="error.errorDate" lines="full">
                    <ion-label class="ion-text-wrap">
                      <p>{{ error.errorDate }}</p>
                      {{ error.errorText }}
                    </ion-label>
                    <ion-note slot="end">{{ error.attemptedStatusId }}</ion-note>
                  </ion-item>
                  <ion-item v-if="!row.errors.length" lines="none">
                    <ion-label>{{ translate("No errors recorded for this message.") }}</ion-label>
                  </ion-item>
                </div>
              </ion-accordion>
            </ion-accordion-group>
          </FulfillmentShipmentCard>
          <ion-card v-if="!queued.length">
            <ion-card-content>{{ translate("Nothing is queued.") }}</ion-card-content>
          </ion-card>
        </template>

        <!-- Synced is fulfillment history grouped by order. It holds no systemMessageId, so there
             is no message text or error list to show; what confirms the push is Shopify's own record
             of the fulfillment beside ours. -->
        <template v-else>
          <ion-note color="medium" class="segment-scope">
            {{ translate("Fulfillments recorded against this shop, newest first, checked against Shopify.") }}
          </ion-note>
          <FulfillmentShipmentCard
            v-for="row in synced"
            :key="row.shipmentId"
            :row="row"
            :state="{ label: row.shopifyStatus, color: row.agrees ? 'success' : 'warning' }"
          >
            <div class="comparison">
              <div class="comparison-row comparison-header">
                <ion-label>{{ translate("Field") }}</ion-label>
                <ion-label>{{ translate("HotWax") }}</ion-label>
                <ion-label>{{ translate("Shopify") }}</ion-label>
              </div>
              <div v-for="field in row.comparison" :key="field.label" class="comparison-row">
                <ion-label>{{ field.label }}</ion-label>
                <ion-label class="ion-text-wrap">{{ field.hotwax }}</ion-label>
                <ion-label class="ion-text-wrap">{{ field.shopify }}</ion-label>
              </div>
            </div>
          </FulfillmentShipmentCard>
          <ion-card v-if="!synced.length">
            <ion-card-content>{{ translate("Nothing has synced yet.") }}</ion-card-content>
          </ion-card>
        </template>

      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem,
  IonLabel, IonNote, IonPage, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
} from "@ionic/vue";
import { computed, ref } from "vue";
import AnimatedNumber from "@/components/common/AnimatedNumber.vue";
import type {
  FulfillmentOrderItem, FulfillmentShipmentRow,
} from "@/components/shopify-fulfillment/FulfillmentShipmentCard.types";
import FulfillmentShipmentCard from "@/components/shopify-fulfillment/FulfillmentShipmentCard.vue";

const props = defineProps<{ id: string }>();

const connectionDetailsHref = computed(() => `/shopify-connection-details/${props.id}`);

const segment = ref<"pending" | "queued" | "synced">("pending");

/** A moqui.service.message.SystemMessageError row, field for field. */
interface SystemMessageError {
  errorDate: string;
  attemptedStatusId: string;
  errorText: string;
}

/** A message-backed row: every field below is one the SystemMessage actually stores. */
interface QueuedRow extends FulfillmentShipmentRow {
  systemMessageTypeId: string;
  /** The shipment detail the send service turns into the Shopify body. */
  messageText: string;
  statusId: string;
  failCount: number;
  errors: SystemMessageError[];
}

interface ComparisonField {
  label: string;
  hotwax: string;
  shopify: string;
}

/** A history-backed row: one Shopify fulfillment, ours beside theirs. */
interface SyncedRow extends FulfillmentShipmentRow {
  fulfillmentId: string;
  /** Shopify's own FulfillmentStatus, shown verbatim. */
  shopifyStatus: string;
  agrees: boolean;
  comparison: ComparisonField[];
}

function items(...rows: [string, string, string][]): FulfillmentOrderItem[] {
  return rows.map(([orderItemSeqId, primary, secondary]) =>
    ({ orderItemSeqId, primary, secondary, imageUrl: "" }));
}

function payloadFor(orderName: string, shipmentId: string, lines: { id: string; qty: number }[]) {
  return JSON.stringify({
    shipmentId,
    orderId: orderName,
    shopifyOrderId: `5${shipmentId.replace(/\D/g, "")}`,
    trackingNumber: "1Z999AA10123456784",
    carrierPartyId: "UPS",
    notifyCustomer: false,
    actualShopifyLocationId: "gid://shopify/Location/70000000001",
    shipmentItems: lines.map((line) => ({ shopifyOrderLineItemId: line.id, quantity: line.qty })),
  }, null, 2);
}

/**
 * Work remaining: shipped, eligible, and no fulfillment recorded against the order. These never
 * reached queue#SystemMessage — the service returns at one of its five guards before creating a
 * message — so there is nothing to show but the shipment itself.
 */
const pending = ref<FulfillmentShipmentRow[]>([
  {
    shipmentId: "SHP-88407", orderName: "RAI-100477", facility: "Central DC",
    orderDate: "Aug 19, 8:07 AM", shippedDate: "Aug 19, 6:11 PM",
    trailing: { label: translate("Waiting"), value: "2d 19h" },
    items: items(["00001", "Trail Pant", "TRL-PT-OLV-32"], ["00002", "Trail Belt", "TRL-BLT-BRN-L"]),
  },
  {
    shipmentId: "SHP-88512", orderName: "RAI-100479", facility: "Store 302 Cambridge",
    orderDate: "Aug 20, 11:20 AM", shippedDate: "Aug 21, 10:48 AM",
    trailing: { label: translate("Waiting"), value: "1d 2h" },
    items: items(["00001", "Alpine Vest", "ALP-VST-NVY-S"], ["00002", "Alpine Beanie", "ALP-BN-NVY-OS"]),
  },
  {
    shipmentId: "SHP-88710", orderName: "RAI-100484", facility: "Central DC",
    orderDate: "Aug 22, 12:04 PM", shippedDate: "Aug 22, 12:31 PM",
    trailing: { label: translate("Waiting"), value: "4m" },
    items: items(["00001", "Coastal Tee", "CST-TEE-WHT-L"]),
  },
]);

/**
 * Messages on this shop's remotes that have not reached SmsgSent. A failed send does not land on
 * SmsgError — send#ProducedSystemMessage puts the status back where it started and increments
 * failCount — so a retrying row reads SmsgProduced with failCount above zero.
 */
const queued = ref<QueuedRow[]>([
  {
    shipmentId: "SHP-88214", orderName: "RAI-100461", facility: "Store 118 Newbury St",
    orderDate: "Aug 18, 1:42 PM", shippedDate: "Aug 19, 9:03 AM",
    trailing: { label: translate("Waiting"), value: "3d 4h" },
    items: items(["00001", "Matador Hoodie", "MTD-HD-BLK-M"]),
    systemMessageTypeId: "CreateShopifyFulfillment",
    messageText: payloadFor("RAI-100461", "SHP-88214", [{ id: "14882301", qty: 1 }]),
    statusId: "SmsgError", failCount: 24,
    errors: [
      { errorDate: "Aug 19, 9:03 AM", attemptedStatusId: "SmsgSent", errorText: "422 Unprocessable Entity: fulfillment already exists for this fulfillment order" },
      { errorDate: "Aug 19, 10:03 AM", attemptedStatusId: "SmsgSent", errorText: "422 Unprocessable Entity: fulfillment already exists for this fulfillment order" },
      { errorDate: "Aug 20, 8:03 AM", attemptedStatusId: "SmsgSent", errorText: "422 Unprocessable Entity: fulfillment already exists for this fulfillment order" },
    ],
  },
  {
    shipmentId: "SHP-88604", orderName: "RAI-100480", facility: "Reno DC",
    orderDate: "Aug 21, 9:15 AM", shippedDate: "Aug 22, 6:24 AM",
    trailing: { label: translate("Waiting"), value: "6h 11m" },
    items: items(
      ["00001", "Summit Parka", "SMT-PK-RED-L"],
      ["00002", "Summit Shell", "SMT-SH-RED-L"],
      ["00003", "Summit Glove", "SMT-GLV-BLK-M"],
      ["00004", "Summit Liner", "SMT-LN-BLK-L"],
    ),
    systemMessageTypeId: "CreateShopifyFulfillment",
    messageText: payloadFor("RAI-100480", "SHP-88604", [{ id: "14883501", qty: 2 }]),
    statusId: "SmsgProduced", failCount: 3,
    errors: [
      { errorDate: "Aug 22, 6:24 AM", attemptedStatusId: "SmsgSent", errorText: "503 Service Unavailable from Shopify" },
      { errorDate: "Aug 22, 7:24 AM", attemptedStatusId: "SmsgSent", errorText: "503 Service Unavailable from Shopify" },
      { errorDate: "Aug 22, 8:24 AM", attemptedStatusId: "SmsgSent", errorText: "503 Service Unavailable from Shopify" },
    ],
  },
  {
    shipmentId: "SHP-88702", orderName: "RAI-100482", facility: "Store 214 Boston",
    orderDate: "Aug 22, 11:58 AM", shippedDate: "Aug 22, 12:29 PM",
    trailing: { label: translate("Waiting"), value: "6m" },
    items: items(["00001", "Geneva Cardigan", "GNV-CD-CRM-M"]),
    systemMessageTypeId: "CreateShopifyFulfillment",
    messageText: payloadFor("RAI-100482", "SHP-88702", [{ id: "14884110", qty: 1 }]),
    statusId: "SmsgSending", failCount: 0,
    errors: [],
  },
]);

/**
 * Fulfillment history grouped by order. The Shopify column needs a fulfillment-by-id GraphQL query
 * that the connector does not have yet — its only fulfillment templates are FulfillmentOrder
 * mutations — so these values stand in for that call's response.
 */
const synced = ref<SyncedRow[]>([
  {
    shipmentId: "SHP-88801", orderName: "RAI-100488", facility: "Store 118 Newbury St",
    orderDate: "Aug 21, 3:12 PM", shippedDate: "Aug 22, 7:41 AM",
    trailing: { label: translate("Recorded"), value: "Aug 22, 7:41 AM" },
    items: items(["00001", "Harbor Jacket", "HBR-JK-NVY-L"]),
    fulfillmentId: "4471301884", shopifyStatus: "SUCCESS", agrees: true,
    comparison: [
      { label: translate("Fulfillment"), hotwax: "4471301884", shopify: "4471301884" },
      { label: translate("Status"), hotwax: translate("Not stored"), shopify: "SUCCESS" },
      { label: translate("Recorded"), hotwax: translate("Not stored"), shopify: "Aug 22, 7:41 AM" },
      { label: translate("Tracking"), hotwax: "1Z999AA10123456784 (UPS)", shopify: "1Z999AA10123456784 (UPS)" },
      { label: translate("Quantity"), hotwax: "1", shopify: "1" },
    ],
  },
  {
    shipmentId: "SHP-88815", orderName: "RAI-100491", facility: "Reno DC",
    orderDate: "Aug 21, 5:48 PM", shippedDate: "Aug 22, 8:02 AM",
    trailing: { label: translate("Recorded"), value: "Aug 22, 8:02 AM" },
    items: items(["00001", "Cedar Flannel", "CDR-FL-GRN-M"], ["00002", "Cedar Scarf", "CDR-SC-GRN-OS"]),
    fulfillmentId: "4471302915", shopifyStatus: "CANCELLED", agrees: false,
    comparison: [
      { label: translate("Fulfillment"), hotwax: "4471302915", shopify: "4471302915" },
      { label: translate("Status"), hotwax: translate("Not stored"), shopify: "CANCELLED" },
      { label: translate("Recorded"), hotwax: translate("Not stored"), shopify: "Aug 22, 8:02 AM" },
      { label: translate("Tracking"), hotwax: "1Z999AA10123456791 (UPS)", shopify: translate("None") },
      { label: translate("Quantity"), hotwax: "2", shopify: "2" },
    ],
  },
]);

const oldestPending = computed(() => pending.value[0]?.trailing.value ?? translate("None"));

const gaveUpCount = computed(() =>
  queued.value.filter((row) => row.statusId === "SmsgError").length);

/**
 * Prose about real fields, not a status. SmsgError is terminal and only the sweep sets it, once
 * failCount reaches retryLimit. A message stranded in SmsgSending cannot self-heal, because
 * send#ProducedSystemMessage refuses anything that is not SmsgProduced or SmsgError.
 */
function retryNote(row: QueuedRow) {
  if(row.statusId === "SmsgError") {
    return translate("failCount reached {count} and the sweep stopped retrying. Set the status back to SmsgProduced to try again.", { count: row.failCount });
  }
  if(row.statusId === "SmsgSending") {
    return translate("Left in SmsgSending. The sweep only picks up SmsgProduced or SmsgError, so this one needs its status reset.");
  }
  if(row.failCount > 0) {
    return translate("failCount is {count}. The sweep retries once lastAttemptDate is older than its retry interval.", { count: row.failCount });
  }

  return "";
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

function noop() {
  // Static layout. The retry, reconcile and reset actions are wired in a follow-up.
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

/* Side by side, as asked: field, ours, theirs. The value tracks are equal so the two columns line
   up for scanning, and the field column stays narrow. */
.comparison {
  display: flex;
  flex-direction: column;
  padding-block-start: var(--spacer-sm);
}

.comparison-row {
  display: grid;
  grid-template-columns: minmax(90px, 0.6fr) minmax(120px, 1fr) minmax(120px, 1fr);
  align-items: start;
  gap: var(--spacer-xs);
  padding-block: var(--spacer-xs);
  border-block-end: var(--border-medium);
}

.comparison-row:last-child {
  border-block-end: 0;
}


</style>
