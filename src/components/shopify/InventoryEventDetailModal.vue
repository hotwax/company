<template>
  <ion-modal :is-open="!!event" @will-present="resetScroll" @did-dismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="emit('close')">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Inventory event") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content ref="content">
      <ion-list v-if="event" lines="full">
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Event type") }}
            <p>{{ event.eventTypeLabel }}</p>
          </ion-label>
          <ion-badge slot="end" :color="event.deliveryColor">
            {{ event.deliveryLabel }}
          </ion-badge>
        </ion-item>
        <!-- The reference is the source row's natural key, and for the effective-date families it also
             carries the lifecycle boundary the row crossed. -->
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Source record") }}
            <p>{{ event.sourceLabel }}</p>
            <p v-if="event.source.phase">
              {{ translate("Effective-date boundary this row crossed: {phase}", { phase: event.source.phase }) }}
            </p>
          </ion-label>
        </ion-item>
        <ion-item v-if="artifact">
          <ion-label class="ion-text-wrap">
            {{ translate("Came from") }}
            <p v-if="artifact.label">
              {{ artifact.label }}
            </p>
            <p v-if="artifact.actor">
              {{ translate("Recorded by {actor}", { actor: artifact.actor }) }}
            </p>
            <p v-if="artifact.note">
              {{ artifact.note }}
            </p>
            <p v-if="artifact.unresolved">
              {{ artifact.unresolved }}
            </p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Product") }}
            <p>{{ event.productName || translate("Not resolved") }}</p>
            <p v-if="event.productSku || event.productVariant">
              {{ [event.productSku, event.productVariant].filter(Boolean).join(", ") }}
            </p>
            <p v-if="event.shopifyProductId">
              {{ translate("Shopify product {id}", { id: event.shopifyProductId }) }}
            </p>
            <p v-if="event.shopifyVariantId">
              {{ translate("Shopify variant {id}", { id: event.shopifyVariantId }) }}
            </p>
            <p>{{ translate("Shopify inventory item {id}", { id: event.inventoryItemId }) }}</p>
          </ion-label>
          <ion-note slot="end">
            {{ event.change }}
          </ion-note>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Shopify location") }}
            <p>{{ event.locationLabel }}</p>
            <p>{{ translate("Shopify location {id}", { id: event.locationId }) }}</p>
            <p v-if="event.retarget">
              {{ translate("This delta was calculated against the location the channel has since stopped pointing at, and publishes there rather than to the channel's current one.") }}
            </p>
          </ion-label>
          <ion-badge v-if="event.retarget" slot="end" color="danger">
            {{ translate("Retarget drain") }}
          </ion-badge>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Publishes under") }}
            <p>{{ event.reason }}</p>
          </ion-label>
          <ion-badge v-if="!event.reasonMapped" slot="end" color="warning">
            {{ translate("Unmapped") }}
          </ion-badge>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Recorded") }}
            <p>{{ formatDateTime(event.createdAt) }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Reached Shopify") }}
            <p v-if="event.sentAt">
              {{ translate("{at}, {lag} after it was recorded", { at: formatDateTime(event.sentAt), lag: formatLag(event.sentAt - event.createdAt) }) }}
            </p>
            <p v-else-if="event.awaitingDelivery">
              {{ translate("Not delivered yet") }}
            </p>
            <p v-else>
              {{ translate("Nothing was owed to Shopify for this event") }}
            </p>
          </ion-label>
        </ion-item>
        <ion-item v-if="event.messageId" button detail @click="emit('openBatch', event.messageId)">
          <ion-label>
            {{ translate("Batch") }}
            <p>{{ event.messageId }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-else>
          <ion-label>
            {{ translate("Batch") }}
            <p>{{ translate("Not batched") }}</p>
          </ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            {{ translate("Decision comment") }}
            <p>{{ event.decisionComment || translate("Not available") }}</p>
          </ion-label>
        </ion-item>
        <ShopifyInventorySnapshot
          :key="event.rowKey"
          :remote-id="remoteId"
          :inventory-item-id="event.inventoryItemId"
          :location-id="event.locationId"
        />
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal,
  IonNote, IonTitle, IonToolbar,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import { ref } from "vue";
import ShopifyInventorySnapshot from "@/components/shopify/ShopifyInventorySnapshot.vue";
import type { InventoryEventRow } from "@/composables/useInventoryEvents";
import type { InventoryEventSource } from "@/composables/useShopify";
import { formatDateTime } from "@/utils";
import { formatLag } from "@/utils/inventoryEventTime";

defineProps<{
  event: InventoryEventRow | null;
  artifact?: InventoryEventSource;
  remoteId: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "openBatch", messageId: string): void;
}>();

const content = ref();

/** Every open starts at the top, not wherever the previous event was scrolled to. */
function resetScroll() {
  void content.value?.$el?.scrollToTop?.(0);
}
</script>
