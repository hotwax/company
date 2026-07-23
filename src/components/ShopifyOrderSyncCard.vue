<template>
  <ion-card
    :button="snapshot.actionable !== false"
    class="widget"
    :aria-busy="snapshot.loading ? 'true' : 'false'"
    :aria-disabled="snapshot.actionable === false ? 'true' : undefined"
    :aria-label="cardAriaLabel"
    @click="openCard"
  >
    <ion-card-header>
      <ion-card-title>{{ translate("Order sync") }}</ion-card-title>
      <ion-card-subtitle>{{ cardSubtitle }}</ion-card-subtitle>
      <ion-badge :color="configurationBadge.color">
        {{ configurationBadge.label }}
      </ion-badge>
      <p v-if="snapshot.error" role="status">{{ snapshot.error }}</p>
    </ion-card-header>

    <ion-list lines="full" aria-live="polite">
      <ion-item>
        <ion-label>{{ translate("Orders processed") }}</ion-label>
        <ion-label slot="end">{{ processedCount }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label>{{ translate("Pending batch requests") }}</ion-label>
        <ion-label slot="end">{{ pendingCount }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label>{{ translate("Last completed batch") }}</ion-label>
        <ion-label slot="end">{{ lastCompletedLabel }}</ion-label>
      </ion-item>
      <ion-item data-progress-row="shopify-order-batch-request">
        <ion-label>
          {{ translate("Shopify order batch request") }}
          <p>{{ batchDetail }}</p>
        </ion-label>
        <ion-badge slot="end" :color="batchBadge.color">
          {{ batchBadge.label }}
        </ion-badge>
      </ion-item>
      <ion-item lines="none" data-progress-row="hotwax-order-import">
        <ion-label>
          {{ translate("HotWax order import") }}
          <p>{{ importDetail }}</p>
        </ion-label>
        <ion-badge slot="end" :color="importBadge.color">
          {{ importBadge.label }}
        </ion-badge>
      </ion-item>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import {
  IonBadge,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonItem,
  IonLabel,
  IonList,
} from "@ionic/vue";
import { translate } from "@common";
import { computed } from "vue";
import { formatDateTime } from "@/utils";

type ShopifyOrderSyncConfigurationState =
  | "missing"
  | "configured-paused"
  | "configured-active";

interface ShopifyOrderSyncCardSnapshot {
  configurationState: ShopifyOrderSyncConfigurationState;
  subtitle?: string;
  processedCount?: number | string;
  pendingCount?: number | string;
  nextRunLabel?: string;
  lastCompletedLabel?: string;
  batchStatus?: string;
  batchDetail?: string;
  importStatus?: string;
  importDetail?: string;
  loading?: boolean;
  error?: string | null;
  actionable?: boolean;
}

const props = defineProps<{
  snapshot: ShopifyOrderSyncCardSnapshot;
}>();

const emit = defineEmits<{
  (event: "open"): void;
}>();

const configurationBadge = computed(() => {
  if (props.snapshot.loading) {
    return { color: "medium", label: translate("Loading") };
  }

  if (props.snapshot.error) {
    return { color: "danger", label: translate("Status unavailable") };
  }

  if (props.snapshot.configurationState === "configured-active") {
    return { color: "success", label: translate("Active") };
  }

  if (props.snapshot.configurationState === "configured-paused") {
    return { color: "warning", label: translate("Paused") };
  }

  return { color: "primary", label: translate("Setup required") };
});

const cardSubtitle = computed(() => {
  if (props.snapshot.subtitle) return translate(props.snapshot.subtitle);

  if (props.snapshot.loading) {
    return translate("Loading the latest order sync status");
  }

  if (props.snapshot.error) {
    return translate("Open order sync to inspect the latest status");
  }

  if (props.snapshot.configurationState === "configured-active") {
    return translate("Shopify orders are scheduled to sync with HotWax");
  }

  if (props.snapshot.configurationState === "configured-paused") {
    return translate("Order sync is configured and paused");
  }

  return translate("Configure scheduled Shopify order imports");
});

const processedCount = computed(() => props.snapshot.processedCount ?? 0);
const pendingCount = computed(() => props.snapshot.pendingCount ?? 0);

const lastCompletedLabel = computed(() => {
  if (props.snapshot.lastCompletedLabel) {
    return formatDateTime(props.snapshot.lastCompletedLabel) || props.snapshot.lastCompletedLabel;
  }
  return translate("No completed batch");
});

const cardAriaLabel = computed(() => [
  translate("Order sync"),
  configurationBadge.value.label,
  translate("Last completed batch"),
  lastCompletedLabel.value,
  translate("Orders processed"),
  processedCount.value,
  translate("Pending batch requests"),
  pendingCount.value,
].join(" · "));

const batchDetail = computed(() => getProgressDetail(
  props.snapshot.batchDetail,
  translate("No batch request has been produced yet"),
));

const importDetail = computed(() => getProgressDetail(
  props.snapshot.importDetail,
  translate("No HotWax import has been produced yet"),
));

const batchBadge = computed(() => getProgressBadge(props.snapshot.batchStatus));
const importBadge = computed(() => getProgressBadge(props.snapshot.importStatus));

function getProgressDetail(detail: string | undefined, emptyLabel: string) {
  if (props.snapshot.error) return translate("Latest status could not be loaded");
  if (detail === "No batch request yet") return translate("No batch request has been produced yet");
  if (detail === "No import yet") return translate("No HotWax import has been produced yet");
  const importCount = /^(\d+) imports?$/.exec(detail || "");
  if (importCount) {
    const count = Number(importCount[1]);
    return count === 1
      ? translate("{count} import", { count })
      : translate("{count} imports", { count });
  }
  if (detail) return translate(detail);
  if (props.snapshot.configurationState === "missing") return translate("Order sync is not configured");
  return emptyLabel;
}

function openCard() {
  if (props.snapshot.actionable === false) return;
  emit("open");
}

function getProgressBadge(status: string | undefined) {
  if (props.snapshot.error) {
    return { color: "danger", label: translate("Unavailable") };
  }

  const label = status ? translate(status) : (
    props.snapshot.configurationState === "missing"
      ? translate("Not configured")
      : translate("Not started")
  );
  const normalizedStatus = label.toLocaleLowerCase();

  if (/(failed|failure|error)/.test(normalizedStatus)) {
    return { color: "danger", label };
  }

  if (/(paused|partial|warning)/.test(normalizedStatus)) {
    return { color: "warning", label };
  }

  if (/(completed|complete|succeeded|success)/.test(normalizedStatus)) {
    return { color: "success", label };
  }

  if (/(active|processing|running|queued|importing)/.test(normalizedStatus)) {
    return { color: "primary", label };
  }

  return { color: "medium", label };
}
</script>
