<template>
  <ion-card>
    <!-- Identity, then facts, then whatever the segment adds — the structure this app's job run
         history card uses. The state badge rides the identity item's end slot. -->
    <ion-item lines="none">
      <ion-label class="ion-text-wrap">
        <p v-if="row.shipmentId">{{ row.shipmentId }}</p>
        <h2>{{ row.orderName }}</h2>
        <p v-if="row.facility">{{ row.facility }}</p>
      </ion-label>
      <ion-badge v-if="state" slot="end" :color="state.color">{{ state.label }}</ion-badge>
    </ion-item>

    <ion-card-content>
      <div v-if="facts.length" class="shipment-facts">
        <ion-item v-for="fact in facts" :key="fact.label" lines="none">
          <ion-icon v-if="fact.icon" slot="start" :icon="fact.icon" color="medium" />
          <ion-label>
            <p>{{ fact.label }}</p>
            {{ fact.value }}
          </ion-label>
        </ion-item>
      </div>

      <slot name="attention" />

      <!-- Render every item; the list grows vertically as rows wrap. -->
      <ion-list v-if="showItems !== false && row.items?.length" class="item-strip" lines="none">
        <ion-item v-for="item in row.items" :key="item.orderItemSeqId" lines="none">
          <ion-thumbnail slot="start">
            <Image :src="item.imageUrl" />
          </ion-thumbnail>
          <ion-label class="ion-text-wrap">
            {{ item.primary }}
            <p v-if="item.secondary && item.secondary !== item.primary">{{ item.secondary }}</p>
            <p v-if="item.features">{{ item.features }}</p>
            <p v-if="item.orderedQuantity != null">{{ translate("Ordered quantity") }}: {{ item.orderedQuantity }}</p>
            <p v-if="item.quantity != null">{{ translate("Shipped quantity") }}: {{ item.quantity }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <slot />
    </ion-card-content>
  </ion-card>
</template>

<script setup lang="ts">
import {
  IonBadge, IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonList, IonThumbnail,
} from "@ionic/vue";
import { translate } from "@common";
import { computed } from "vue";
import { cartOutline, sendOutline } from "ionicons/icons";
import { formatDateTime } from "@/utils";
import Image from "@/components/common/Image.vue";
import type {
  FulfillmentShipmentRow, FulfillmentShipmentState,
} from "./FulfillmentShipmentCard.types";

const props = withDefaults(defineProps<{
  row: FulfillmentShipmentRow;
  showItems?: boolean;
  /** Omitted for a shipment with no status behind it — a badge must never be invented. */
  state?: FulfillmentShipmentState;
}>(), { showItems: true });
// The shared card owns these labels, icons and ordering so segments only supply data.
const facts = computed(() => [
  ...(props.row.orderDate != null ? [{
    icon: cartOutline, label: translate("Order placed"), value: formatDateTime(props.row.orderDate),
  }] : []),
  ...(props.row.shippedDate != null ? [{
    icon: sendOutline, label: translate("Shipment shipped"), value: formatDateTime(props.row.shippedDate),
  }] : []),
  ...props.row.facts,
]);
</script>

<style scoped>
/* Facts share a horizontal row and wrap naturally when the card narrows. */
.shipment-facts {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--spacer-lg);
  row-gap: var(--spacer-xs);
}

.shipment-facts ion-item {
  flex: 0 1 240px;
  max-inline-size: 100%;
}

.shipment-facts ion-item,
.item-strip ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}

/* Reuse the existing item width, wrapping without limiting the number of items. */
.item-strip {
  display: flex;
  gap: var(--spacer-sm);
  flex-wrap: wrap;
  padding-block-start: var(--spacer-sm);
}

.item-strip ion-item {
  flex: 0 1 240px;
  max-inline-size: 100%;
}
</style>
