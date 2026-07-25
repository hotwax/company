<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Clone Settings") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ion-padding">
    <main>
      <ion-card class="clone-card ion-no-margin">
        <ion-card-content>
          <ion-list>
            <!-- Source Shopify Shop Dropdown -->
            <ion-item>
              <ion-select interface="popover" :label="translate('Source Shopify Shop')" :placeholder="translate('Select shop')" v-model="sourceShopId">
                <ion-select-option v-for="shop in sourceShopsList" :key="shop.shopId" :value="shop.shopId">
                  {{ shop.name || shop.shopId }}
                </ion-select-option>
              </ion-select>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-list class="categories-list ion-margin-top">
        <ion-list-header>
          <ion-label>{{ translate("Select settings to clone") }}</ion-label>
        </ion-list-header>
        <ion-item v-for="(cat, key) in categories" :key="key">
          <ion-checkbox slot="start" v-model="cat.selected" />
          <ion-label>{{ cat.label }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-card color="warning" class="warning-card" v-if="sourceShopId">
        <ion-card-content class="ion-text-center warning-content">
          <ion-icon :icon="alertCircleOutline" class="warning-icon" />
          <p>{{ translate("Warning: Existing mappings in the target shop will be overwritten.") }}</p>
        </ion-card-content>
      </ion-card>

      <div class="action-container ion-margin-top">
        <ion-button expand="block" :disabled="!sourceShopId || !hasSelectedCategories" @click="executeClone()">
          {{ translate("Clone") }}
        </ion-button>
      </div>
    </main>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonCard, IonCardContent, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { alertCircleOutline, closeOutline } from "ionicons/icons";
import { api, commonUtil, emitter, logger, translate } from "@common";
import { useShopifyStore } from "@/store/shopify";
import { computed, defineProps, ref } from "vue";

const props = defineProps({
  targetShop: {
    type: Object,
    required: true
  }
});

const shopifyStore = useShopifyStore();
const sourceShopId = ref("");

const categories = ref({
  productTypes: { label: translate("Product types"), selected: true },
  shippingMethods: { label: translate("Shipping methods"), selected: true },
  salesChannels: { label: translate("Sales channels"), selected: true },
  paymentMethods: { label: translate("Payment methods"), selected: true }
}) as any;

const sourceShopsList = computed(() => {
  return shopifyStore.shops.filter((s: any) => s.shopId !== props.targetShop.shopId);
});

const hasSelectedCategories = computed(() => {
  return Object.values(categories.value).some((cat: any) => cat.selected);
});

onIonViewWillEnter(async () => {
  emitter.emit("presentLoader");
  await shopifyStore.fetchShopifyShops();
  emitter.emit("dismissLoader");
});

function closeModal(data: any = null) {
  modalController.dismiss(data);
}

const fetchTypeMappingsForShop = async (shopId: string, mappedTypeId: string) => {
  let mappings: any[] = [];
  let pageIndex = 0;
  let resp: any;
  do {
    resp = await api({
      url: "oms/shopifyShops/typeMappings",
      method: "get",
      params: { shopId, mappedTypeId, pageSize: 100, pageIndex }
    });
    if (!commonUtil.hasError(resp) && resp.data) {
      mappings = [...mappings, ...resp.data];
    } else {
      break;
    }
    pageIndex++;
  } while (resp.data && resp.data.length >= 100);
  return mappings;
};

const fetchCarrierShipmentsForShop = async (shopId: string) => {
  let shipments: any[] = [];
  let pageIndex = 0;
  let resp: any;
  do {
    resp = await api({
      url: "oms/shopifyShops/carrierShipments",
      method: "get",
      params: { shopId, pageSize: 100, pageIndex }
    });
    if (!commonUtil.hasError(resp) && resp.data) {
      shipments = [...shipments, ...resp.data];
    } else {
      break;
    }
    pageIndex++;
  } while (resp.data && resp.data.length >= 100);
  return shipments;
};

async function cloneTypeMappings(mappedTypeId: string) {
  const targetShopId = props.targetShop.shopId;
  // 1. Fetch source and target mappings
  const [sourceMappings, targetMappings] = await Promise.all([
    fetchTypeMappingsForShop(sourceShopId.value, mappedTypeId),
    fetchTypeMappingsForShop(targetShopId, mappedTypeId)
  ]);

  // 2. Delete existing mappings in target
  if (targetMappings.length > 0) {
    const deletePromises = targetMappings.map((mapping: any) => 
      shopifyStore.deleteShopifyShopTypeMapping({
        shopId: targetShopId,
        mappedTypeId,
        mappedKey: mapping.mappedKey
      })
    );
    await Promise.allSettled(deletePromises);
  }

  // 3. Create cloned mappings in target
  if (sourceMappings.length > 0) {
    const createPromises = sourceMappings.map((mapping: any) =>
      shopifyStore.createShopifyShopTypeMapping({
        shopId: targetShopId,
        mappedTypeId,
        mappedKey: mapping.mappedKey,
        mappedValue: mapping.mappedValue
      })
    );
    await Promise.allSettled(createPromises);
  }
}

async function cloneShippingMethods() {
  const targetShopId = props.targetShop.shopId;
  // 1. Fetch source shipments
  const sourceShipments = await fetchCarrierShipmentsForShop(sourceShopId.value);

  // 2. Create cloned shipments in target (upsert handles overwrite)
  if (sourceShipments.length > 0) {
    const createPromises = sourceShipments.map((shipment: any) =>
      shopifyStore.createShopifyShopCarrierShipment({
        shopId: targetShopId,
        shipmentMethodTypeId: shipment.shipmentMethodTypeId,
        shopifyShippingMethod: shipment.shopifyShippingMethod,
        carrierPartyId: shipment.carrierPartyId
      })
    );
    await Promise.allSettled(createPromises);
  }
}

async function executeClone() {
  emitter.emit("presentLoader");
  try {
    const promises: Promise<any>[] = [];

    // Clone Product Types
    if (categories.value.productTypes.selected) {
      promises.push(cloneTypeMappings("SHOPIFY_PRODUCT_TYPE"));
    }

    // Clone Sales Channels
    if (categories.value.salesChannels.selected) {
      promises.push(cloneTypeMappings("SHOPIFY_ORDER_SOURCE"));
    }

    // Clone Payment Methods
    if (categories.value.paymentMethods.selected) {
      promises.push(cloneTypeMappings("SHOPIFY_PAYMENT_TYPE"));
    }

    // Clone Shipping Methods
    if (categories.value.shippingMethods.selected) {
      promises.push(cloneShippingMethods());
    }

    await Promise.all(promises);
    commonUtil.showToast(translate("Settings cloned successfully"));
    closeModal(true);
  } catch (error) {
    logger.error("Cloning failed", error);
    commonUtil.showToast(translate("Failed to clone settings"));
  } finally {
    emitter.emit("dismissLoader");
  }
}
</script>

<style scoped>
main {
  max-width: 600px;
  margin: 0 auto;
}

.categories-list {
  background: transparent;
}

.warning-card {
  margin-top: var(--spacer-md);
}

.warning-icon {
  font-size: 2rem;
  color: var(--ion-color-warning);
  margin-bottom: var(--spacer-xs);
}

.warning-content p {
  margin: 0;
}
</style>
