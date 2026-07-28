<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate('Shopify location') }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="type && type === 'update' ? updateMapping() : saveMapping()" @submit.prevent>
      <ion-list>
        <ion-list-header>{{ translate("Facility details") }}</ion-list-header>
        <ion-item>
          <ion-label>{{ translate("Facility ID") }}</ion-label>
          <ion-label slot="end">{{ currentFacility.facilityId }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label>{{ translate("Facility name") }}</ion-label>
          <ion-label slot="end">{{ currentFacility.facilityName }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>{{ translate('Shopify location') }}</ion-list-header>
        <ion-item @keyup.enter.stop>
          <ion-label v-if="type && type === 'update'">{{ translate("Shopify store") }}</ion-label>
          <ion-label slot="end" v-if="type && type === 'update'">{{ shopifyFacilityMapping.shopId }}</ion-label>
          <ion-select v-else :label="translate('Shopify store')" interface="popover" :placeholder="translate('Select')" v-model="shopId">
            <ion-select-option v-for="shop in shopifyShops" :key="shop.shopId" :value="shop.shopId">
              {{ shop.name ? shop.name : shop.shopId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-input id="inputElement" :label="translate('Location ID')" :placeholder="translate('Add your location ID from Shopify')" v-model="shopifyLocationId" />
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="type && type === 'update' ? updateMapping() : saveMapping()" @keyup.enter.stop>
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { useFacilityMutations, useFacilityRecord } from "@/composables/useFacilities";
import { useShopifyShops } from "@/composables/useShopify";
import { ref, computed, onMounted, watch } from "vue";

// `facilityId` is a prop now; it used to come from `facilityStore.current`, which is no longer
// populated. Shops come from the login-time cache instead of a per-open fetch.
const props = defineProps(["shopifyFacilityMapping", "type", "facilityId"]);
const mutations = useFacilityMutations(props.facilityId);
const { record } = useFacilityRecord(props.facilityId);
const currentFacility = computed<any>(() => (record.value as any)?.raw ?? record.value ?? {});
const { shops: shopifyShops } = useShopifyShops();

const shopId = ref('');
const shopifyLocationId = ref('');

onMounted(() => {
  shopifyLocationId.value = props.shopifyFacilityMapping?.shopifyLocationId;
  shopId.value = props.shopifyFacilityMapping?.shopId ?? shopifyShops.value[0]?.shopId;
});

// Shops come from the cache asynchronously; default the selection once they land.
watch(shopifyShops, (shops: any[]) => {
  if (!shopId.value) shopId.value = props.shopifyFacilityMapping?.shopId ?? shops[0]?.shopId;
});

function closeModal() {
  modalController.dismiss();
}

async function saveMapping() {
  if (!shopId.value?.trim() || !shopifyLocationId.value) {
    commonUtil.showToast(translate('Please fill all the required fields'));
    return;
  }
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.createShopifyLocation({
      shopId: shopId.value,
      shopifyLocationId: shopifyLocationId.value
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Shopify mapping created successfully'));
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to create shopify mapping'));
    logger.error('Failed to create shopify mapping', err);
  }
  emitter.emit('dismissLoader');
}

async function updateMapping() {
  if (!shopifyLocationId.value) {
    commonUtil.showToast(translate('Please fill all the required fields'));
    return;
  }
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.updateShopifyLocation({
      shopId: props.shopifyFacilityMapping.shopId,
      shopifyLocationId: shopifyLocationId.value
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Shopify mapping updated successfully'));
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to update shopify mapping'));
    logger.error('Failed to update shopify mapping', err);
  }
  emitter.emit('dismissLoader');
}
</script>
