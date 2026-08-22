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

        <!-- Synced is fulfillment history grouped by order. It holds no systemMessageId, so there is
             no message text or error list; what confirms a push is Shopify's own record of the
             fulfillment. displayStatus carries the lifecycle stage and status carries whether it still
             counts, so the badge shows the first coloured by the second. -->
        <template v-else>
          <ion-note color="medium" class="segment-scope">
            {{ translate("Fulfillments recorded against this shop, newest first, read back from Shopify.") }}
          </ion-note>
          <FulfillmentShipmentCard
            v-for="row in synced"
            :key="row.shipmentId"
            :row="row"
            :state="{ label: row.displayStatus, color: fulfillmentStatusColor(row.status) }"
          >
            <div class="detail-facts">
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <p>{{ translate("Fulfillment") }}</p>
                  {{ row.name }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("status") }}</p>
                  {{ row.status }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <p>{{ translate("Fulfilled from") }}</p>
                  {{ row.locationName }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("totalQuantity") }}</p>
                  {{ row.totalQuantity }}
                </ion-label>
              </ion-item>
              <ion-item v-if="row.inTransitAt" lines="none">
                <ion-label>
                  <p>{{ translate("inTransitAt") }}</p>
                  {{ row.inTransitAt }}
                </ion-label>
              </ion-item>
              <ion-item v-if="row.estimatedDeliveryAt" lines="none">
                <ion-label>
                  <p>{{ translate("estimatedDeliveryAt") }}</p>
                  {{ row.estimatedDeliveryAt }}
                </ion-label>
              </ion-item>
              <ion-item v-if="row.deliveredAt" lines="none">
                <ion-label>
                  <p>{{ translate("deliveredAt") }}</p>
                  {{ row.deliveredAt }}
                </ion-label>
              </ion-item>
            </div>

            <!-- The order-level view: whether anything is still owed, and what is blocking it. -->
            <ion-item-divider>
              <ion-label>{{ translate("Fulfillment order") }}</ion-label>
            </ion-item-divider>
            <div class="detail-facts">
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("status") }}</p>
                  {{ row.fulfillmentOrder.status }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("requestStatus") }}</p>
                  {{ row.fulfillmentOrder.requestStatus }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Unfulfilled lines") }}</p>
                  {{ row.fulfillmentOrder.remainingLineItems }}
                </ion-label>
              </ion-item>
              <ion-item v-if="row.fulfillmentOrder.fulfillBy" lines="none">
                <ion-label>
                  <p>{{ translate("fulfillBy") }}</p>
                  {{ row.fulfillmentOrder.fulfillBy }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <p>{{ translate("deliveryMethod") }}</p>
                  {{ row.fulfillmentOrder.deliveryMethod }}
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <p>{{ translate("destination") }}</p>
                  {{ row.fulfillmentOrder.destination }}
                </ion-label>
              </ion-item>
            </div>

            <ion-item v-if="row.fulfillmentOrder.holds.length" lines="none">
              <ion-label class="ion-text-wrap">
                <p>{{ translate("fulfillmentHolds") }}</p>
                {{ row.fulfillmentOrder.holds.join(", ") }}
              </ion-label>
              <ion-badge slot="end" color="warning">{{ translate("On hold") }}</ion-badge>
            </ion-item>

            <ion-accordion-group>
              <!-- The carrier's own narrative, folded away: this connection grows with every scan, and
                   displayStatus on the badge already says where it got to. -->
              <ion-accordion value="events">
                <ion-item slot="header" lines="full">
                  <ion-label>{{ translate("events") }}</ion-label>
                  <ion-note slot="end">{{ row.events.length }}</ion-note>
                </ion-item>
                <div slot="content">
                  <ion-item v-for="event in row.events" :key="event.happenedAt" lines="full">
                    <ion-label class="ion-text-wrap">
                      <p>{{ event.happenedAt }}</p>
                      {{ event.message }}
                    </ion-label>
                    <ion-note slot="end">{{ event.status }}</ion-note>
                  </ion-item>
                  <ion-item v-if="!row.events.length" lines="none">
                    <ion-label>{{ translate("Shopify has recorded no delivery events yet.") }}</ion-label>
                  </ion-item>
                </div>
              </ion-accordion>

              <ion-accordion value="tracking">
                <ion-item slot="header" lines="full">
                  <ion-label>{{ translate("trackingInfo") }}</ion-label>
                  <ion-note slot="end">{{ row.trackingInfo.length }}</ion-note>
                </ion-item>
                <div slot="content">
                  <ion-item v-for="tracking in row.trackingInfo" :key="tracking.number" lines="full">
                    <ion-label class="ion-text-wrap">
                      <p>{{ tracking.company }}</p>
                      {{ tracking.number }}
                    </ion-label>
                  </ion-item>
                  <ion-item v-if="!row.trackingInfo.length" lines="none">
                    <ion-label>{{ translate("Shopify holds no tracking for this fulfillment.") }}</ion-label>
                  </ion-item>
                </div>
              </ion-accordion>

              <ion-accordion value="lineItems">
                <ion-item slot="header" lines="full">
                  <ion-label>{{ translate("fulfillmentLineItems") }}</ion-label>
                  <ion-note slot="end">{{ row.lineItems.length }}</ion-note>
                </ion-item>
                <div slot="content">
                  <ion-item v-for="line in row.lineItems" :key="line.sku" lines="full">
                    <ion-label class="ion-text-wrap">
                      <p>{{ line.sku }}</p>
                      {{ line.name }}
                    </ion-label>
                    <ion-note slot="end">{{ line.quantity }}</ion-note>
                  </ion-item>
                </div>
              </ion-accordion>
            </ion-accordion-group>
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
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard,
  IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem,
  IonItemDivider, IonLabel, IonNote, IonPage, IonSegment, IonSegmentButton, IonTitle,
  IonToolbar,
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

/** A FulfillmentEvent, as the carrier reports it. */
interface ShopifyFulfillmentEvent {
  happenedAt: string;
  /** FulfillmentEventStatus, verbatim. */
  status: string;
  message: string;
}

/** The FulfillmentOrder behind a fulfillment: what is still owed, and what is blocking it. */
interface ShopifyFulfillmentOrder {
  /** FulfillmentOrderStatus: OPEN, IN_PROGRESS, CLOSED, INCOMPLETE, ON_HOLD, SCHEDULED, CANCELLED. */
  status: string;
  requestStatus: string;
  holds: string[];
  remainingLineItems: number;
  destination: string;
  deliveryMethod: string;
  fulfillBy: string;
}

/**
 * A history-backed row, read back from Shopify. Field names match the GraphQL Fulfillment object so
 * a reviewer can map what they see here onto the API.
 *
 * Note on ids: ShopifyFulfillmentHistory.fulfillmentId is `id-long`, a legacy numeric id, while the
 * query needs `gid://shopify/Fulfillment/{id}`. `name` is the reference a merchant sees in the admin.
 */
interface SyncedRow extends FulfillmentShipmentRow {
  fulfillmentId: string;
  name: string;
  /** FulfillmentStatus: SUCCESS, CANCELLED, ERROR, FAILURE. Whether the fulfillment still counts. */
  status: string;
  /** FulfillmentDisplayStatus: where it got to, in Shopify's own vocabulary. */
  displayStatus: string;
  locationName: string;
  totalQuantity: number;
  inTransitAt: string;
  estimatedDeliveryAt: string;
  deliveredAt: string;
  events: ShopifyFulfillmentEvent[];
  trackingInfo: { company: string; number: string }[];
  lineItems: { quantity: number; name: string; sku: string }[];
  fulfillmentOrder: ShopifyFulfillmentOrder;
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
    fulfillmentId: "4471301884", name: "#100488.1",
    status: "SUCCESS", displayStatus: "DELIVERED",
    locationName: "HotWax Routing Retail", totalQuantity: 1,
    inTransitAt: "Aug 22, 2:10 PM", estimatedDeliveryAt: "Aug 24, 8:00 PM",
    deliveredAt: "Aug 24, 3:22 PM",
    events: [
      { happenedAt: "Aug 24, 3:22 PM", status: "DELIVERED", message: "Delivered, left at front door" },
      { happenedAt: "Aug 24, 8:04 AM", status: "OUT_FOR_DELIVERY", message: "Out for delivery, Boston MA" },
      { happenedAt: "Aug 22, 2:10 PM", status: "IN_TRANSIT", message: "Departed carrier facility, Boston MA" },
    ],
    trackingInfo: [{ company: "UPS", number: "1Z999AA10123456784" }],
    lineItems: [{ quantity: 1, name: "Harbor Jacket", sku: "HBR-JK-NVY-L" }],
    fulfillmentOrder: {
      status: "CLOSED", requestStatus: "UNSUBMITTED", holds: [], remainingLineItems: 0,
      destination: "Boston, MA 02116, US", deliveryMethod: "SHIPPING", fulfillBy: "",
    },
  },
  {
    shipmentId: "SHP-88815", orderName: "RAI-100491", facility: "Reno DC",
    orderDate: "Aug 21, 5:48 PM", shippedDate: "Aug 22, 8:02 AM",
    trailing: { label: translate("Recorded"), value: "Aug 22, 8:02 AM" },
    items: items(["00001", "Cedar Flannel", "CDR-FL-GRN-M"], ["00002", "Cedar Scarf", "CDR-SC-GRN-OS"]),
    fulfillmentId: "4471302915", name: "#100491.1",
    status: "SUCCESS", displayStatus: "IN_TRANSIT",
    locationName: "HotWax Routing Web", totalQuantity: 2,
    inTransitAt: "Aug 22, 11:47 AM", estimatedDeliveryAt: "Aug 26, 8:00 PM",
    deliveredAt: "",
    events: [
      { happenedAt: "Aug 23, 6:31 AM", status: "IN_TRANSIT", message: "Arrived at carrier facility, Salt Lake City UT" },
      { happenedAt: "Aug 22, 11:47 AM", status: "IN_TRANSIT", message: "Picked up by carrier, Reno NV" },
      { happenedAt: "Aug 22, 8:14 AM", status: "LABEL_PRINTED", message: "Shipping label created" },
    ],
    trackingInfo: [{ company: "UPS", number: "1Z999AA10123456791" }],
    lineItems: [
      { quantity: 1, name: "Cedar Flannel", sku: "CDR-FL-GRN-M" },
      { quantity: 1, name: "Cedar Scarf", sku: "CDR-SC-GRN-OS" },
    ],
    fulfillmentOrder: {
      status: "IN_PROGRESS", requestStatus: "UNSUBMITTED", holds: [], remainingLineItems: 1,
      destination: "Reno, NV 89501, US", deliveryMethod: "SHIPPING", fulfillBy: "Aug 26, 5:00 PM",
    },
  },
  {
    shipmentId: "SHP-88822", orderName: "RAI-100493", facility: "Store 214 Boston",
    orderDate: "Aug 20, 9:02 AM", shippedDate: "Aug 21, 4:18 PM",
    trailing: { label: translate("Recorded"), value: "Aug 21, 4:18 PM" },
    items: items(["00001", "Bayside Chino", "BAY-CH-KHK-32"]),
    fulfillmentId: "4471299410", name: "#100493.1",
    status: "CANCELLED", displayStatus: "CANCELED",
    locationName: "HotWax Routing Retail", totalQuantity: 1,
    inTransitAt: "", estimatedDeliveryAt: "", deliveredAt: "",
    events: [],
    trackingInfo: [],
    lineItems: [{ quantity: 1, name: "Bayside Chino", sku: "BAY-CH-KHK-32" }],
    fulfillmentOrder: {
      status: "ON_HOLD", requestStatus: "UNSUBMITTED",
      holds: ["AWAITING_PAYMENT", "HIGH_RISK_OF_FRAUD"], remainingLineItems: 1,
      destination: "Cambridge, MA 02139, US", deliveryMethod: "SHIPPING", fulfillBy: "",
    },
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

/**
 * FulfillmentStatus decides the colour of a synced card, while displayStatus supplies its words: a
 * CANCELLED fulfillment can still read DELIVERED, and the colour is what says it no longer counts.
 */
function fulfillmentStatusColor(status: string) {
  if(status === "SUCCESS") { return "success"; }
  if(status === "CANCELLED") { return "warning"; }

  return "danger";
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
