<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="connectionDetailsHref" />
        </ion-buttons>
        <ion-title>{{ translate("Fulfillment sync") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :aria-label="translate('Refresh fulfillment sync health')" @click="noop">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="fulfillment-sync-page">
      <main class="fulfillment-sync-content">
        <ion-card class="static-notice" role="status">
          <ion-card-content>
            <strong>{{ translate("Static layout") }}</strong>
            <p>
              {{ translate("Every number and row below is fixture data. Nothing on this page reads the OMS yet.") }}
            </p>
          </ion-card-content>
        </ion-card>

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

        <!-- The tiles have to say what they counted, and the median needs its reading explained: it is
             seconds because the post has nothing to queue behind, which is what makes it a usable alarm. -->
        <ion-note color="medium" class="stats-scope">
          {{ translate("Median measured over 212 shipments in the last 24 hours. The post to Shopify is real time and has nothing to queue behind, so anything over about a minute means the call did not land rather than a backlog draining.") }}
        </ion-note>

        <!-- POS stays a filter rather than its own page: same service, same guards. What differs is the
             expectation, because the customer is standing at the counter. -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Unconfirmed fulfillments") }}</ion-card-title>
            <ion-card-subtitle>
              {{ translate("Shipped in the OMS, no fulfillment id back from Shopify. Oldest first.") }}
            </ion-card-subtitle>
          </ion-card-header>

          <ion-segment v-model="channelLens" :aria-label="translate('Filter by channel')">
            <ion-segment-button value="all">
              <ion-label>{{ translate("All") }} ({{ unconfirmed.length }})</ion-label>
            </ion-segment-button>
            <ion-segment-button value="pos">
              <ion-label>{{ translate("POS") }} ({{ countFor("pos") }})</ion-label>
            </ion-segment-button>
            <ion-segment-button value="warehouse">
              <ion-label>{{ translate("Warehouse") }} ({{ countFor("warehouse") }})</ion-label>
            </ion-segment-button>
          </ion-segment>

          <ion-item lines="full">
            <ion-select
              v-model="dateBasis"
              interface="popover"
              :label="translate('Age measured from')"
            >
              <ion-select-option value="shipped">{{ translate("Ship date") }}</ion-select-option>
              <ion-select-option value="ordered">{{ translate("Order date") }}</ion-select-option>
            </ion-select>
          </ion-item>

          <div class="worklist">
            <div class="worklist-row worklist-header">
              <ion-label>{{ translate("Shipment") }}</ion-label>
              <ion-label>{{ translate("Order") }}</ion-label>
              <ion-label>{{ translate("Age") }}</ion-label>
              <ion-label>{{ translate("Diagnosis") }}</ion-label>
              <span />
            </div>

            <div v-for="row in visibleRows" :key="row.shipmentId" class="worklist-row">
              <ion-label>
                {{ row.facility }}
                <p>{{ row.channel === "pos" ? translate("POS") : translate("Warehouse") }}, {{ itemSummary(row) }}</p>
              </ion-label>
              <ion-label>
                {{ row.orderName }}
                <p>{{ row.shipmentId }}</p>
              </ion-label>
              <ion-label>{{ row.age }}</ion-label>
              <div class="diagnosis-cell">
                <ion-badge :color="diagnosisOf(row).color">{{ diagnosisOf(row).label }}</ion-badge>
                <ion-note>{{ diagnosisOf(row).instruction }}</ion-note>
              </div>
              <ion-button fill="clear" size="small" @click="noop">
                {{ diagnosisOf(row).action }}
              </ion-button>
            </div>

            <div v-if="!visibleRows.length" class="worklist-empty">
              <ion-note>{{ translate("Nothing unconfirmed on this channel.") }}</ion-note>
            </div>
          </div>

          <ion-card-content>
            <p>
              {{ translate("A diagnosis comes from replaying the post and reading what it returns, because nothing was recorded the first time. Cheap for one row, and the only way to know.") }}
            </p>
          </ion-card-content>
        </ion-card>

        <!-- Not invented categories: these are the exit paths of post#ShopifyFulfillment, in the order
             the service checks them. -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("What a diagnosis means") }}</ion-card-title>
            <ion-card-subtitle>
              {{ translate("Each one is an exit path of post#ShopifyFulfillment, in the order the service checks it.") }}
            </ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item v-for="entry in diagnosisReference" :key="entry.id">
              <ion-label class="reference-label">
                {{ entry.label }}
                <p>{{ entry.meaning }}</p>
                <p class="reference-signal">{{ entry.signal }}</p>
              </ion-label>
              <ion-badge slot="end" :color="entry.color">{{ entry.disposition }}</ion-badge>
            </ion-item>
          </ion-list>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Recovery") }}</ion-card-title>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-label>
                {{ translate("Retry one fulfillment") }}
                <p>{{ translate("Posts the shipment again through the same mounted endpoint the webhook uses.") }}</p>
              </ion-label>
              <ion-badge slot="end" color="success">{{ translate("Available per row") }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Sweep job") }}
                <p>{{ translate("The safety net that would re-post anything the real-time call missed.") }}</p>
                <p>{{ translate("No such job was found in the connector, so this panel has no schedule, window, or last run to show yet.") }}</p>
              </ion-label>
              <ion-badge slot="end" color="warning">{{ translate("Not located") }}</ion-badge>
            </ion-item>
          </ion-list>
        </ion-card>

        <!-- Stated on the page rather than only in the PR, because a reader will otherwise assume the
             blank attempt columns are a loading state. -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("What this page cannot show yet") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>
              {{ translate("The post is asynchronous and records only its successes: a win writes Shopify's fulfillment id to the shipment, and a failure writes nothing at all. There is no attempt row, no error text, and no attempt count anywhere to read.") }}
            </p>
            <p>
              {{ translate("So this page can say a fulfillment is unconfirmed and how long it has been, but never that it was tried four times and refused each time. Everything else here queries data that already exists; the attempt record is the one piece that needs the backend.") }}
            </p>
          </ion-card-content>
        </ion-card>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonNote, IonPage, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonTitle, IonToolbar,
} from "@ionic/vue";
import { refreshOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import AnimatedNumber from "@/components/common/AnimatedNumber.vue";

const props = defineProps<{ id: string }>();

const connectionDetailsHref = computed(() => `/shopify-connection-details/${props.id}`);

const channelLens = ref<"all" | "pos" | "warehouse">("all");
const dateBasis = ref<"shipped" | "ordered">("shipped");

type Channel = "pos" | "warehouse";
type DiagnosisId =
  "ALREADY_FULFILLED" |
  "ORDER_NOT_MAPPED" |
  "NO_WRITE_ACCESS" |
  "NOT_ELIGIBLE" |
  "NO_SHIPMENT_DETAIL" |
  "UNDIAGNOSED";

interface WorklistRow {
  shipmentId: string;
  orderName: string;
  facility: string;
  channel: Channel;
  itemCount: number;
  leadProduct: string;
  age: string;
  diagnosis: DiagnosisId;
}

/**
 * Fixture rows, ordered oldest first, chosen to put one of every diagnosis on screen. Real rows come
 * from shipments that are SHIPMENT_SHIPPED with a null externalId, which is the entire health signal
 * the OMS leaves behind when the async post fails.
 */
const unconfirmed = ref<WorklistRow[]>([
  {
    shipmentId: "SHP-88214", orderName: "RAI-100461", facility: "Store 118 Newbury St",
    channel: "pos", itemCount: 1, leadProduct: "MATADOR HOODIE", age: "3d 4h",
    diagnosis: "ALREADY_FULFILLED",
  },
  {
    shipmentId: "SHP-88407", orderName: "RAI-100477", facility: "Central DC",
    channel: "warehouse", itemCount: 2, leadProduct: "TRAIL PANT", age: "2d 19h",
    diagnosis: "ORDER_NOT_MAPPED",
  },
  {
    shipmentId: "SHP-88512", orderName: "RAI-100479", facility: "Store 302 Cambridge",
    channel: "pos", itemCount: 2, leadProduct: "ALPINE VEST", age: "1d 2h",
    diagnosis: "NO_WRITE_ACCESS",
  },
  {
    shipmentId: "SHP-88604", orderName: "RAI-100480", facility: "Reno DC",
    channel: "warehouse", itemCount: 4, leadProduct: "SUMMIT PARKA", age: "6h 11m",
    diagnosis: "NO_SHIPMENT_DETAIL",
  },
  {
    shipmentId: "SHP-88655", orderName: "RAI-100481", facility: "Store 214 Boston",
    channel: "pos", itemCount: 1, leadProduct: "RETURN LABEL", age: "52m",
    diagnosis: "NOT_ELIGIBLE",
  },
  {
    shipmentId: "SHP-88702", orderName: "RAI-100482", facility: "Store 214 Boston",
    channel: "pos", itemCount: 1, leadProduct: "GENEVA CARDIGAN", age: "6m",
    diagnosis: "UNDIAGNOSED",
  },
  {
    shipmentId: "SHP-88710", orderName: "RAI-100484", facility: "Central DC",
    channel: "warehouse", itemCount: 1, leadProduct: "COASTAL TEE", age: "4m",
    diagnosis: "UNDIAGNOSED",
  },
]);

/** Separate fixture: a latency distribution cannot be derived from the rows that never confirmed. */
const medianLatency = "8 sec";

const oldestUnconfirmed = computed(() => unconfirmed.value[0]?.age ?? translate("None"));

const visibleRows = computed(() => channelLens.value === "all"
  ? unconfirmed.value
  : unconfirmed.value.filter((row) => row.channel === channelLens.value));

function countFor(channel: Channel) {
  return unconfirmed.value.filter((row) => row.channel === channel).length;
}

function itemSummary(row: WorklistRow) {
  return row.itemCount === 1
    ? translate("1 item, {product}", { product: row.leadProduct })
    : translate("{count} items, {product} and more", { count: row.itemCount, product: row.leadProduct });
}

/**
 * A row's disposition, not just its label: whether a retry can help is the only thing the reader is
 * actually deciding, so it drives the badge colour and the button text together.
 */
const diagnoses: Record<DiagnosisId, {
  label: string; color: string; action: string; instruction: string; retryHelps: boolean;
}> = {
  ALREADY_FULFILLED: {
    label: translate("Already fulfilled in Shopify"), color: "warning", action: translate("Reconcile"),
    instruction: translate("Retrying posts a duplicate"), retryHelps: false,
  },
  ORDER_NOT_MAPPED: {
    label: translate("Order not mapped to a shop"), color: "danger", action: translate("Open order"),
    instruction: translate("Connector cannot tell which shop to post to"), retryHelps: false,
  },
  NO_WRITE_ACCESS: {
    label: translate("Shop has no write access"), color: "danger", action: translate("Open connection"),
    instruction: translate("Credentials, not lateness"), retryHelps: false,
  },
  NOT_ELIGIBLE: {
    label: translate("Not eligible"), color: "medium", action: translate("Dismiss"),
    instruction: translate("Excluded by design, not late"), retryHelps: false,
  },
  NO_SHIPMENT_DETAIL: {
    label: translate("No shipment detail"), color: "warning", action: translate("Investigate"),
    instruction: translate("The lookup returned nothing and failed quietly"), retryHelps: false,
  },
  UNDIAGNOSED: {
    label: translate("Not diagnosed yet"), color: "primary", action: translate("Retry"),
    instruction: translate("Replay the post to find out"), retryHelps: true,
  },
};

function diagnosisOf(row: WorklistRow) {
  return diagnoses[row.diagnosis];
}

const needsHumanCount = computed(() =>
  unconfirmed.value.filter((row) => !diagnoses[row.diagnosis].retryHelps).length);

const diagnosisReference = [
  {
    id: "ALREADY_FULFILLED",
    label: translate("Already fulfilled in Shopify"),
    disposition: translate("Reconcile"),
    color: "warning",
    meaning: translate("A store fulfilled the order by hand during an outage. The shipment needs its id reconciled from what Shopify already holds."),
    signal: translate("Shipped, no external id, and a fulfillment history row exists for the Shopify order"),
  },
  {
    id: "ORDER_NOT_MAPPED",
    label: translate("Order not mapped to a shop"),
    disposition: translate("Blocked"),
    color: "danger",
    meaning: translate("Nothing links the order to a Shopify shop, so the connector has no destination for the post."),
    signal: translate("No Shopify shop record found for the order's external id"),
  },
  {
    id: "NO_WRITE_ACCESS",
    label: translate("Shop has no write access"),
    disposition: translate("Blocked"),
    color: "danger",
    meaning: translate("The shop has no write credential registered. Indistinguishable from lateness until someone reads a log."),
    signal: translate("No remote with write access configured for the shop"),
  },
  {
    id: "NOT_ELIGIBLE",
    label: translate("Not eligible"),
    disposition: translate("Excluded"),
    color: "medium",
    meaning: translate("The shipment is not a sales shipment, so the service skips rather than errors. It must read as deliberately excluded or it looks late forever."),
    signal: translate("Shipment type is outside the sync's scope"),
  },
  {
    id: "NO_SHIPMENT_DETAIL",
    label: translate("No shipment detail"),
    disposition: translate("Investigate"),
    color: "warning",
    meaning: translate("The detail lookup came back empty for this shipment and shop, and the service returned a warning instead of an error."),
    signal: translate("No shipment details found for the shipment on that shop"),
  },
];

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

/* Five columns: identity, order, age, diagnosis, action. The action is intrinsic so the diagnosis
   text keeps the slack. */
.worklist {
  display: flex;
  flex-direction: column;
}

.worklist-row {
  display: grid;
  grid-template-columns: minmax(220px, 1.7fr) minmax(130px, 1fr) minmax(90px, 0.5fr) minmax(190px, 1.3fr) max-content;
  align-items: center;
  gap: var(--spacer-xs);
  padding: var(--spacer-sm);
  border-block-end: var(--border-medium);
}

.worklist-row:last-child {
  border-block-end: 0;
}

.worklist-row ion-label p {
  overflow-wrap: anywhere;
}

/* The badge names the state and the note says what to do about it. They are one fact, so they stack
   in one cell rather than competing for two columns that would always move together. */
.diagnosis-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacer-2xs);
  min-width: 0;
}

.diagnosis-cell ion-badge {
  white-space: normal;
}

.worklist-empty {
  padding: var(--spacer-base) var(--spacer-sm);
}

.reference-signal {
  overflow-wrap: anywhere;
}

/* Below the worklist's natural width the columns stop helping: each row becomes a stack, and the
   action drops to the end of it. */
@media (max-width: 900px) {
  .worklist-row {
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: start;
  }

  .worklist-header {
    display: none;
  }

  .diagnosis-cell {
    grid-column: 1 / -1;
  }
}
</style>
