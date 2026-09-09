<template>
  <ion-item-divider>
    <ion-label>{{ translate("Current Shopify inventory") }}</ion-label>
    <ion-button slot="end" fill="clear" :disabled="loading || !remoteId || !inventoryItemId || !locationId" @click="check">
      <ion-spinner v-if="loading" name="crescent" />
      <template v-else>{{ translate("Check now") }}</template>
    </ion-button>
  </ion-item-divider>
  <ion-item v-if="error">
    <ion-label class="ion-text-wrap"><ion-text color="danger">{{ error }}</ion-text></ion-label>
  </ion-item>
  <template v-if="snapshot">
    <ion-item>
      <ion-label class="ion-text-wrap">
        {{ snapshot.locationName || locationId }}
        <p>{{ translate("Checked at {time}", {time: formatDateTime(snapshot.checkedAt)}) }}</p>
        <p>{{ translate("Current quantities, not quantities when this event occurred.") }}</p>
      </ion-label>
    </ion-item>
    <ion-item v-if="!snapshot.active">
      <ion-label class="ion-text-wrap">{{ translate("This inventory item is not stocked at this Shopify location.") }}</ion-label>
    </ion-item>
    <template v-else>
      <ion-item v-for="quantity in quantityLabels" :key="quantity.name">
        <ion-label>{{ translate(quantity.label) }}</ion-label>
        <ion-label slot="end">{{ snapshot.quantities[quantity.name] ?? translate("Not available") }}</ion-label>
      </ion-item>
    </template>
  </template>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { IonItemDivider, IonItem, IonLabel, IonButton, IonSpinner, IonText } from "@ionic/vue";
import { translate } from "@common";
import { fetchCurrentShopifyInventory } from "@/composables/useShopify";
import { formatDateTime } from "@/utils";
import type { ShopifyInventorySnapshot } from "@/utils/shopifyInventorySnapshot";
const props = defineProps<{remoteId: string; inventoryItemId: string; locationId: string}>();
const snapshot = ref<ShopifyInventorySnapshot>();
const loading = ref(false);
const error = ref("");
let generation = 0;
const quantityLabels = [
  {name: "available", label: "Available"}, {name: "on_hand", label: "On hand"},
  {name: "incoming", label: "Incoming"}, {name: "committed", label: "Committed"},
];
watch(() => [props.remoteId, props.inventoryItemId, props.locationId], () => {
  generation++; snapshot.value = undefined; error.value = ""; loading.value = false;
});
onBeforeUnmount(() => { generation++; });
async function check() {
  const request = ++generation;
  loading.value = true; error.value = ""; snapshot.value = undefined;
  try {
    const result = await fetchCurrentShopifyInventory({systemMessageRemoteId: props.remoteId, inventoryItemId: props.inventoryItemId, locationId: props.locationId});
    if (request === generation) snapshot.value = result;
  } catch {
    if (request === generation) error.value = translate("Could not read current Shopify inventory. Check connection access and try again.");
  } finally {
    if (request === generation) loading.value = false;
  }
}
</script>
