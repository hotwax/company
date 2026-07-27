<template>
  <ion-card
    :button="snapshot.actionable !== false"
    class="widget order-sync"
    :aria-busy="snapshot.loading ? 'true' : 'false'"
    :aria-disabled="snapshot.actionable === false ? 'true' : undefined"
    :aria-label="cardAriaLabel"
    @click="openCard"
  >
    <div class="order-sync-grid">
      <ion-card-header>
        <ion-card-title>{{ translate("Order sync") }}</ion-card-title>
        <ion-card-subtitle>{{ cardSubtitle }}</ion-card-subtitle>
        <p v-if="snapshot.error" role="status" class="error-message">{{ snapshot.error }}</p>
      </ion-card-header>

      <div class="order-sync-badge-container">
        <ion-badge :color="configurationBadge.color">
          {{ configurationBadge.label }}
        </ion-badge>
      </div>

      <div class="history">
        <ion-list lines="full" aria-live="polite">
          <ion-item lines="full">
            <ion-label>{{ translate("Orders processed") }}</ion-label>
            <ion-label slot="end">{{ processedCount }}</ion-label>
          </ion-item>
          <ion-item lines="full">
            <ion-label>{{ translate("Pending batch requests") }}</ion-label>
            <ion-label slot="end">{{ pendingCount }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Last completed batch") }}</ion-label>
            <ion-label slot="end">{{ lastCompletedLabel }}</ion-label>
          </ion-item>
        </ion-list>
      </div>

      <div class="current">
        <ion-list lines="full" aria-live="polite">
          <ion-item lines="full" data-progress-row="shopify-order-batch-request">
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
      </div>
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
} from "@ionic/vue";
import { translate } from "@common";
import { computed } from "vue";
import { formatDateTime } from "@/utils";
import type { ShopifyOrderSyncCardSnapshot } from "@/composables/useShopify";

/**
 * The snapshot type is OWNED BY THE COMPOSABLE, not redeclared here.
 *
 * It used to be a local copy, which is how the card kept rendering while its producer was deleted —
 * a structural match to a hand-written stub type-checks exactly as well as the real thing. Importing
 * it makes a drift in either direction a compile error.
 */
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
  /**
   * Anything else is OPAQUE DATA, not copy — the batch row's detail is a SystemMessage id
   * (`M228571`). It used to go through `translate()`, which asked i18n for a key that can never
   * exist and logged three misses per render per row; the id only reached the screen at all because
   * intlify falls back to echoing the key. Identifiers are rendered verbatim.
   */
  if (detail) return detail;
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
ion-card.widget {
  border-radius: 16px;
  margin-block: var(--spacer-lg);
  margin-inline: 0;
  will-change: box-shadow, height;
  transition: box-shadow 0.7s ease;
}

ion-card.widget:hover {
  box-shadow: 3px 8px 18px -2px rgba(0,0,0, .2), -2px -2px 13px -6px rgba(0,0,0, .2);
}

.order-sync-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

ion-card-header {
  grid-column: 1;
  grid-row: 1;
}

.order-sync-badge-container {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  align-self: start;
  padding: var(--spacer-md);
}

.history {
  grid-column: 1;
}

.current {
  grid-column: 2;
}

.error-message {
  color: var(--ion-color-danger);
  margin-block-start: var(--spacer-xs);
  margin-block-end: 0;
}

@media screen and (max-width: 699px) {
  .order-sync-grid {
    grid-template-columns: 1fr;
  }

  .order-sync-badge-container {
    grid-column: 1;
    grid-row: auto;
    justify-self: start;
    padding-top: 0;
    padding-bottom: var(--spacer-xs);
    padding-left: var(--spacer-md);
  }

  .history {
    grid-column: 1;
  }

  .current {
    grid-column: 1;
  }
}
</style>
