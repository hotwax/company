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
      <div v-if="row.facts.length" class="shipment-facts">
        <ion-item v-for="fact in row.facts" :key="fact.label" lines="none">
          <ion-icon v-if="fact.icon" slot="start" :icon="fact.icon" color="medium" />
          <ion-label>
            <p>{{ fact.label }}</p>
            {{ fact.value }}
          </ion-label>
        </ion-item>
      </div>

      <!-- The items themselves, scrolled rather than summarised: which product is stuck matters to
           whoever has to explain it, and a count never answers that. -->
      <div v-if="row.items?.length" class="item-strip">
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

      <slot />
    </ion-card-content>
  </ion-card>
</template>

<script setup lang="ts">
import {
  IonBadge, IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonThumbnail,
} from "@ionic/vue";
import Image from "@/components/common/Image.vue";
import type {
  FulfillmentShipmentRow, FulfillmentShipmentState,
} from "./FulfillmentShipmentCard.types";

defineProps<{
  row: FulfillmentShipmentRow;
  /** Omitted for a shipment with no status behind it — a badge must never be invented. */
  state?: FulfillmentShipmentState;
}>();
</script>

<style scoped>
/* One fact per row: order context reads as a ledger, and a cramped grid hid the two dates this
   page exists to surface. Each row keeps ion-item's icon/label/value layout. */
.shipment-facts {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacer-xs);
}

.shipment-facts ion-item,
.item-strip ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}

/* Items scroll sideways in their own track rather than wrapping the card taller. Each row keeps the
   240px this app already uses for its widest list column and does not shrink, which is what makes
   the overflow scroll instead of squashing. */
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
}
</style>
