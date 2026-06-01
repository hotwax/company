<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Product Store") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Link this Shopify connection to a Hotwax Product Store.") }}
      </ion-label>
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-select v-model="selectedProductStoreId" interface="popover" :label="translate('Product Store')" :placeholder="translate('Select')">
        <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">
          {{ store.storeName ? store.storeName : store.productStoreId }}
        </ion-select-option>
      </ion-select>
    </ion-item>

    <ion-button
      class="ion-margin"
      expand="block"
      @click="updateProductStoreMapping"
      :disabled="!selectedProductStoreId || selectedProductStoreId === currentProductStoreId"
    >
      {{ translate("Save Product Store link") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline } from 'ionicons/icons'
import { translate } from '@common'
import { useProductStoreStore } from '@/store/productStore';
import { useShopifyStore } from '@/store/shopify';
import { computed, defineProps, onMounted, ref } from "vue";
import { commonUtil, hasError } from '@common'
import { getResponseErrorMessage } from '@/utils';
import { emitter } from '@common';
import { logger } from '@common';

const props = defineProps(['shop']);
const productStoreStore = useProductStoreStore();
const shopifyStore = useShopifyStore();

const productStores = computed(() => productStoreStore.productStores)
const selectedProductStoreId = ref("");
const currentProductStoreId = computed(() => props.shop?.productStoreId || "");

onMounted(async () => {
  await productStoreStore.fetchProductStores();
  selectedProductStoreId.value = currentProductStoreId.value;
})

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

async function updateProductStoreMapping() {
  emitter.emit("presentLoader");
  try {
    const resp = await shopifyStore.updateShopifyShop({
      shopId: props.shop.shopId,
      productStoreId: selectedProductStoreId.value
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Product store linked successfully"));
      await shopifyStore.fetchShopifyShops(); // Refresh state
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to link product store")));
  }
  emitter.emit("dismissLoader");
}
</script>
