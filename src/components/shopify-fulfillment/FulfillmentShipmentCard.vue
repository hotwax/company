<template>
  <ion-card>
    <!-- Identity, then facts, then whatever the segment adds — the structure this app's job run
         history card uses. The state badge rides the identity item's end slot. -->
    <ion-item lines="none">
      <ion-label class="ion-text-wrap">
        <p>{{ row.shipmentId }}</p>
        <h2>{{ row.orderName }}</h2>
        <p>{{ row.facility }}</p>
      </ion-label>
      <ion-badge v-if="state" slot="end" :color="state.color">{{ state.label }}</ion-badge>
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
            <p>{{ row.trailing.label }}</p>
            {{ row.trailing.value }}
          </ion-label>
        </ion-item>
      </div>

      <!-- The items themselves, scrolled rather than summarised: which product is stuck matters to
           whoever has to explain it, and a count never answers that. -->
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

      <slot />
    </ion-card-content>
  </ion-card>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonBadge, IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonThumbnail,
} from "@ionic/vue";
import { cartOutline, sendOutline, timeOutline } from "ionicons/icons";
import Image from "@/components/common/Image.vue";
import type {
  FulfillmentShipmentRow, FulfillmentShipmentState,
} from "./FulfillmentShipmentCard.types";

defineProps<{
  row: FulfillmentShipmentRow;
  /** Omitted for a shipment with no SystemMessage behind it — there is no status to show. */
  state?: FulfillmentShipmentState;
}>();
</script>

<style scoped>
/* One fact per cell, each an ion-item so the icon, the label and the value get ion-item's own
   left-aligned layout. Same track sizing as the job run card's metrics, so it reflows on its own. */
.shipment-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacer-sm);
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
