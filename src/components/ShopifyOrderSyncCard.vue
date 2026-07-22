<template>
  <ion-card
    :button="snapshot.actionable !== false"
    class="order-sync-card"
    :aria-busy="snapshot.loading ? 'true' : 'false'"
    :aria-disabled="snapshot.actionable === false ? 'true' : undefined"
    :aria-label="cardAriaLabel"
    @click="openCard"
  >
    <ion-card-header>
      <div class="order-sync-card__heading">
        <div>
          <ion-card-title>{{ translate("Order sync") }}</ion-card-title>
          <ion-card-subtitle>{{ cardSubtitle }}</ion-card-subtitle>
        </div>
        <ion-badge :color="configurationBadge.color">
          {{ configurationBadge.label }}
        </ion-badge>
      </div>
      <p v-if="snapshot.error" class="order-sync-card__error" role="status">
        {{ snapshot.error }}
      </p>
    </ion-card-header>

    <div class="order-sync-card__body">
      <section aria-labelledby="order-sync-summary-heading">
        <h3 id="order-sync-summary-heading">{{ translate("Summary") }}</h3>
        <ion-list lines="full">
          <ion-item>
            <ion-label>{{ translate("Orders processed") }}</ion-label>
            <ion-skeleton-text
              v-if="snapshot.loading"
              slot="end"
              animated
              class="order-sync-card__value-skeleton"
            />
            <ion-label v-else slot="end">{{ processedCount }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Pending batch requests") }}</ion-label>
            <ion-skeleton-text
              v-if="snapshot.loading"
              slot="end"
              animated
              class="order-sync-card__value-skeleton"
            />
            <ion-label v-else slot="end">{{ pendingCount }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Last completed batch") }}</ion-label>
            <ion-skeleton-text
              v-if="snapshot.loading"
              slot="end"
              animated
              class="order-sync-card__next-run-skeleton"
            />
            <ion-label v-else slot="end" class="order-sync-card__next-run">
              {{ lastCompletedLabel }}
            </ion-label>
          </ion-item>
        </ion-list>
      </section>

      <section aria-labelledby="order-sync-progress-heading">
        <h3 id="order-sync-progress-heading">{{ translate("Track sync progress") }}</h3>
        <ion-list lines="full" aria-live="polite">
          <ion-item data-progress-row="shopify-order-batch-request">
            <ion-label>
              {{ translate("Shopify order batch request") }}
              <p v-if="snapshot.loading">
                <ion-skeleton-text animated class="order-sync-card__detail-skeleton" />
              </p>
              <p v-else>{{ batchDetail }}</p>
            </ion-label>
            <ion-skeleton-text
              v-if="snapshot.loading"
              slot="end"
              animated
              class="order-sync-card__badge-skeleton"
            />
            <ion-badge v-else slot="end" :color="batchBadge.color">
              {{ batchBadge.label }}
            </ion-badge>
          </ion-item>
          <ion-item lines="none" data-progress-row="hotwax-order-import">
            <ion-label>
              {{ translate("HotWax order import") }}
              <p v-if="snapshot.loading">
                <ion-skeleton-text animated class="order-sync-card__detail-skeleton" />
              </p>
              <p v-else>{{ importDetail }}</p>
            </ion-label>
            <ion-skeleton-text
              v-if="snapshot.loading"
              slot="end"
              animated
              class="order-sync-card__badge-skeleton"
            />
            <ion-badge v-else slot="end" :color="importBadge.color">
              {{ importBadge.label }}
            </ion-badge>
          </ion-item>
        </ion-list>
      </section>
    </div>
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
  IonSkeletonText,
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

<style scoped>
.order-sync-card {
  border-radius: 16px;
  margin-block: var(--spacer-lg);
  margin-inline: 0;
  transition: box-shadow 0.7s ease;
}

.order-sync-card:hover,
.order-sync-card:focus-within {
  box-shadow: 3px 8px 18px -2px rgba(0, 0, 0, 0.2), -2px -2px 13px -6px rgba(0, 0, 0, 0.2);
}

.order-sync-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacer-sm);
}

.order-sync-card__heading ion-badge {
  flex: 0 0 auto;
}

.order-sync-card__error {
  color: var(--ion-color-danger);
  margin-block-end: 0;
}

.order-sync-card__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.order-sync-card__body section {
  min-width: 0;
}

.order-sync-card__body section + section {
  border-inline-start: var(--border-medium);
}

.order-sync-card__body h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  padding: var(--spacer-sm) var(--spacer-md);
}

.order-sync-card ion-item {
  --background: transparent;
}

.order-sync-card ion-label[slot="end"] {
  max-width: 50%;
  text-align: end;
  white-space: normal;
}

.order-sync-card__next-run {
  font-weight: 500;
}

.order-sync-card__value-skeleton,
.order-sync-card__badge-skeleton {
  width: 48px;
}

.order-sync-card__next-run-skeleton {
  width: 96px;
}

.order-sync-card__detail-skeleton {
  width: min(220px, 85%);
}

@media screen and (max-width: 699px) {
  .order-sync-card__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .order-sync-card__body section + section {
    border-block-start: var(--border-medium);
    border-inline-start: 0;
  }

  .order-sync-card__heading {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .order-sync-card {
    transition: none;
  }

  .order-sync-card ion-skeleton-text {
    animation: none !important;
  }
}
</style>
