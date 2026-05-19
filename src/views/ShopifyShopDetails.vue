<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="'/shopify-connection-details/' + id" />
        <ion-title>{{ translate("Instance details") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="isLoading" class="ion-padding">
        <ion-item class="ion-margin-bottom" v-for="i in 3" :key="i">
          <ion-label>
            <ion-skeleton-text animated style="width: 40%" />
            <p><ion-skeleton-text animated style="width: 60%" /></p>
          </ion-label>
        </ion-item>
        <ion-item lines="none" class="ion-margin-top">
          <ion-icon :icon="cloudUploadOutline" slot="start" />
          <ion-label>
            <ion-skeleton-text animated style="width: 50%" />
          </ion-label>
        </ion-item>
      </div>

      <div v-else class="ion-padding">
        <ion-item class="ion-margin-bottom">
          <ion-input :label="translate('Shop name')" label-placement="floating" v-model="shopDetails.name" />
        </ion-item>

        <ion-item class="ion-margin-bottom">
          <ion-input :label="translate('Shopify domain')" label-placement="floating" :value="shop.myshopifyDomain" readonly />
        </ion-item>

        <ion-item button @click="openTimezoneModal">
          <ion-label>
            {{ shopDetails.timezone || translate("Select timezone") }}
            <p>{{ translate("Timezone") }}</p>
          </ion-label>
        </ion-item>

        <ion-item lines="none" class="ion-margin-top">
          <ion-icon :icon="cloudUploadOutline" slot="start" />
          <ion-toggle color="danger" :checked="shopDetails.processRefund === 'Y'" @ionChange="updateRefundProcessing($event)">
            {{ translate("Upload refunds to Shopify") }}
          </ion-toggle>
        </ion-item>
      </div>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="saveShopDetails" :disabled="!isDirty">
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSkeletonText, IonTitle, IonToggle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { cloudUploadOutline, saveOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { computed, defineProps, ref, watch } from "vue";
import { useStore } from "vuex";
import { ShopifyService } from "@/services/ShopifyService";
import { hasError, showToast } from "@/utils";
import TimezoneModal from "@/components/TimezoneModal.vue";
import emitter from "@/event-bus";
import logger from "@/logger";

const props = defineProps(['id']);
const store = useStore();
const isLoading = ref(true);

const shop = computed(() => store.getters["shopify/getShopById"](props.id) || {});
const shopDetails = ref({
  name: "",
  timezone: "",
  processRefund: "N"
});

const isDirty = computed(() => {
  return shopDetails.value.name !== (shop.value.name || "") ||
         shopDetails.value.timezone !== (shop.value.timezone || "") ||
         shopDetails.value.processRefund !== (shop.value.processRefund || "N");
});

onIonViewWillEnter(async () => {
  isLoading.value = true;
  if (!shop.value.shopId) {
    await store.dispatch("shopify/fetchShopifyShops")
  }
  setShopDetails();
  isLoading.value = false;
});

watch(shop, () => {
  setShopDetails();
}, { deep: true });

function setShopDetails() {
  shopDetails.value = {
    name: shop.value.name || "",
    timezone: shop.value.timezone || "",
    processRefund: shop.value.processRefund || "N"
  };
}

async function openTimezoneModal() {
  const modal = await modalController.create({
    component: TimezoneModal,
    componentProps: {
      showBrowserTimeZone: false // We want to select a specific timezone for the shop
    }
  });
  modal.present();

  const { data } = await modal.onDidDismiss();
  if (data && data.timeZoneId) {
    shopDetails.value.timezone = data.timeZoneId;
  }
}

function updateRefundProcessing(event: any) {
  shopDetails.value.processRefund = event.detail.checked ? 'Y' : 'N';
}

async function saveShopDetails() {
  emitter.emit("presentLoader");
  try {
    const resp = await ShopifyService.updateShopifyShop({
      shopId: props.id,
      ...shopDetails.value
    });

    if (!hasError(resp)) {
      showToast(translate("Shop details updated successfully"));
      await store.dispatch("shopify/fetchShopifyShops");
    } else {
      throw resp.data;
    }
  } catch (error) {
    logger.error(error);
    showToast(translate("Failed to update shop details"));
  }
  emitter.emit("dismissLoader");
}
</script>

<style scoped>
ion-content {
  --background: var(--ion-background-color, #fff);
}
</style>
