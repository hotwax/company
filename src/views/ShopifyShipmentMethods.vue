<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="'/shopify-connection-details/' + id" />
        <ion-title>{{ translate("Shipment methods") }}</ion-title>
        <ion-buttons slot="primary">
          <ion-button :disabled="!isDirty" @click="saveAllDirtyMappings()">
            {{ translate("Save all") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map shipment methods") }}
            <p>{{ translate("For synchronization to work correctly, shipment methods from Shopify must be mapped to Hotwax shipment method types.") }}</p>
          </ion-label>
        </ion-item>
      </div>

      <ion-segment v-if="carriers.length" v-model="selectedCarrierPartyId" scrollable>
        <ion-segment-button v-for="carrier in carriers" :key="carrier.partyId" :value="carrier.partyId">
          <ion-label>{{ carrier.groupName || carrier.partyId }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      <div v-if="isLoading">
        <div class="list-item ion-padding-end" v-for="i in 5" :key="i">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="airplaneOutline" />
            <ion-label>
              <ion-skeleton-text animated style="width: 60%" />
              <p><ion-skeleton-text animated style="width: 40%" /></p>
            </ion-label>
          </ion-item>
          <div class="ion-text-center">
            <ion-skeleton-text animated style="width: 80px; height: 32px; border-radius: 16px;" />
          </div>
        </div>
      </div>

      <div v-else class="list-item ion-padding-end" v-for="shipmentMethod in filteredShipmentMethods" :key="shipmentMethod.productStoreShipMethId">
        <ion-item lines="none" button @click="editItem(shipmentMethod.partyId, shipmentMethod.shipmentMethodTypeId)">
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>
            {{ getShipmentMethodDesc(shipmentMethod.shipmentMethodTypeId) }}
            <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
          </ion-label>
        </ion-item>

        <!-- Shopify Mapping (Inline Edit) -->
        <div class="ion-text-end mapping-container">
          <div v-if="editingItemKey === (shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId) || isItemDirty(shipmentMethod.shipmentMethodTypeId)" class="edit-controls">
            <ion-input :autofocus="editingItemKey === (shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId)" :placeholder="translate('Shopify Name')" v-model="localMappings[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId].shopifyShippingMethod" class="inline-input" />
            <ion-button fill="clear" @click.stop="saveMapping(shipmentMethod.shipmentMethodTypeId)">
              <ion-icon slot="icon-only" :icon="saveOutline" />
            </ion-button>
          </div>
          <div v-else @click="editItem(shipmentMethod.partyId, shipmentMethod.shipmentMethodTypeId)">
            <template v-if="getShopifyMapping(shipmentMethod.shipmentMethodTypeId)">
                <ion-chip outline class="ion-no-margin">
                    <ion-label>{{ getShopifyMapping(shipmentMethod.shipmentMethodTypeId).shopifyShippingMethod }}</ion-label>
                </ion-chip>
            </template>
            <ion-button v-else size="small" fill="outline">
                <ion-icon :icon="addOutline" slot="start"/>
                <ion-label>{{ translate("Shopify name") }}</ion-label>
            </ion-button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { alertController, IonButton, IonButtons, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSegment, IonSegmentButton, IonSkeletonText, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, airplaneOutline, saveOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { ShopifyService } from "@/services/ShopifyService";
import { hasError, showToast } from "@/utils";
import emitter from "@/event-bus";
import logger from "@/logger";
import { onBeforeRouteLeave } from "vue-router";

const props = defineProps(['id']);
const store = useStore();
const isLoading = ref(true);
const editingItemKey = ref("");
const localMappings = ref<any>({});
const shop = computed(() => store.getters["shopify/getShopById"](props.id) || {});
const selectedCarrierPartyId = ref("");

const shipmentMethodTypes = computed(() => store.getters["util/getShipmentMethodTypes"])
const productStoreShipmentMethods = computed(() => store.getters["netSuite/getProductStoreShipmentMehtods"])
const shopifyShopsCarrierShipments = computed(() => store.getters["shopify/getShopifyShopsCarrierShipments"])

const carriers = computed(() => {
  const carrierMap: any = {};
  (productStoreShipmentMethods.value || []).forEach((sm: any) => {
    if (sm.partyId) {
      carrierMap[sm.partyId] = sm.groupName || sm.partyId;
    }
  });
  return Object.entries(carrierMap).map(([partyId, groupName]) => ({ partyId, groupName }));
});

const filteredShipmentMethods = computed(() => {
  const now = Date.now();
  return (productStoreShipmentMethods.value || []).filter((sm: any) => 
    sm.partyId === selectedCarrierPartyId.value &&
    (!sm.fromDate || sm.fromDate <= now) &&
    (!sm.thruDate || sm.thruDate > now)
  );
});

const isDirty = computed(() => {
  return Object.keys(localMappings.value).some(key => {
    const local = localMappings.value[key];
    const original = shopifyShopsCarrierShipments.value[key];
    const originalShopifyName = original ? original.shopifyShippingMethod : "";
    return local.shopifyShippingMethod !== originalShopifyName;
  });
});

onIonViewWillEnter(async () => {
  isLoading.value = true;
  await Promise.all([
    store.dispatch("util/fetchShipmentMethodTypes"),
    store.dispatch("netSuite/fetchProductStoreShipmentMethods", { productStoreId: shop.value.productStoreId }),
    store.dispatch("shopify/fetchShopifyShopsCarrierShipments", { shopId: props.id })
  ]);
  
  if (carriers.value.length && !selectedCarrierPartyId.value) {
    selectedCarrierPartyId.value = carriers.value[0].partyId;
  }
  
  initializeLocalMappings();
  isLoading.value = false;
})

watch(carriers, (newCarriers) => {
  if (newCarriers.length && !selectedCarrierPartyId.value) {
    selectedCarrierPartyId.value = newCarriers[0].partyId;
  }
})

function initializeLocalMappings() {
  const now = Date.now();
  (productStoreShipmentMethods.value || []).forEach((sm: any) => {
    // Only initialize for active methods
    if ((!sm.fromDate || sm.fromDate <= now) && (!sm.thruDate || sm.thruDate > now)) {
      const key = `${sm.partyId}_${sm.shipmentMethodTypeId}`;
      const original = shopifyShopsCarrierShipments.value[key];
      // Only initialize if we don't have a local mapping yet or if the item is not dirty
      if (!localMappings.value[key] || !isItemDirtyByCarrier(sm.partyId, sm.shipmentMethodTypeId)) {
        localMappings.value[key] = {
          shopifyShippingMethod: original ? original.shopifyShippingMethod : ""
        };
      }
    }
  });
}

function getShipmentMethodDesc(shipmentMethodTypeId: string) {
  const shipmentMethodType = shipmentMethodTypes.value.find((type: any) => type.shipmentMethodTypeId === shipmentMethodTypeId);
  return shipmentMethodType ? shipmentMethodType.description : shipmentMethodTypeId;
}

function isItemDirtyByCarrier(carrierPartyId: string, shipmentMethodTypeId: string) {
  const key = `${carrierPartyId}_${shipmentMethodTypeId}`;
  const local = localMappings.value[key];
  const original = shopifyShopsCarrierShipments.value[key];
  const originalShopifyName = original ? original.shopifyShippingMethod : "";
  return local && local.shopifyShippingMethod !== originalShopifyName;
}

function isItemDirty(shipmentMethodTypeId: string) {
  return isItemDirtyByCarrier(selectedCarrierPartyId.value, shipmentMethodTypeId);
}

function getShopifyMapping(shipmentMethodTypeId: string) {
    const key = `${selectedCarrierPartyId.value}_${shipmentMethodTypeId}`;
    const mapping = shopifyShopsCarrierShipments.value[key];
    return mapping && mapping.shopifyShippingMethod ? mapping : null;
}

async function editItem(carrierPartyId: string, shipmentMethodTypeId: string) {
  editingItemKey.value = `${carrierPartyId}_${shipmentMethodTypeId}`;
  await nextTick();
  const input = document.querySelector('ion-input[autofocus]') as any;
  if (input) {
    input.setFocus();
    const nativeInput = await input.getInputElement();
    nativeInput.select();
  }
}

async function saveMapping(shipmentMethodTypeId: string) {
  const key = `${selectedCarrierPartyId.value}_${shipmentMethodTypeId}`;
  const mapping = localMappings.value[key];
  if (!mapping.shopifyShippingMethod) {
    showToast(translate("Please provide Shopify name"));
    return;
  }

  emitter.emit("presentLoader");
  try {
    const resp = await ShopifyService.createShopifyShopCarrierShipment({
      shopId: props.id,
      shipmentMethodTypeId,
      shopifyShippingMethod: mapping.shopifyShippingMethod,
      carrierPartyId: selectedCarrierPartyId.value
    });

    if (!hasError(resp)) {
      showToast(translate("Mapping updated successfully"));
      await store.dispatch("shopify/fetchShopifyShopsCarrierShipments");
      editingItemKey.value = "";
    } else {
      throw resp.data;
    }
  } catch (error) {
    logger.error(error);
    showToast(translate("Failed to update mapping"));
  }
  emitter.emit("dismissLoader");
}

async function saveAllDirtyMappings() {
  emitter.emit("presentLoader");
  const dirtyKeys = Object.keys(localMappings.value).filter(key => {
    const local = localMappings.value[key];
    const original = shopifyShopsCarrierShipments.value[key];
    const originalShopifyName = original ? original.shopifyShippingMethod : "";
    return local.shopifyShippingMethod !== originalShopifyName;
  });

  try {
    for (const key of dirtyKeys) {
      const [carrierPartyId, shipmentMethodTypeId] = key.split('_');
      const mapping = localMappings.value[key];
      await ShopifyService.createShopifyShopCarrierShipment({
        shopId: props.id,
        shipmentMethodTypeId,
        shopifyShippingMethod: mapping.shopifyShippingMethod,
        carrierPartyId: carrierPartyId
      });
    }
    await store.dispatch("shopify/fetchShopifyShopsCarrierShipments");
    showToast(translate("All mappings saved successfully"));
  } catch (error) {
    logger.error(error);
    showToast(translate("Failed to save some mappings"));
  }
  emitter.emit("dismissLoader");
}

onBeforeRouteLeave(async () => {
  if (!isDirty.value) {
    return true;
  }

  return new Promise((resolve) => {
    alertController.create({
      header: translate("Unsaved changes"),
      message: translate("You have unsaved changes. Would you like to save them before leaving?"),
      buttons: [
        {
          text: translate("Discard"),
          role: "destructive",
          handler: () => {
            resolve(true);
          }
        },
        {
          text: translate("Cancel"),
          role: "cancel",
          handler: () => {
            resolve(false);
          }
        },
        {
          text: translate("Save"),
          handler: async () => {
            await saveAllDirtyMappings();
            resolve(true);
          }
        }
      ]
    }).then(alert => alert.present());
  });
});
</script>

<style scoped>
.list-item {
  --columns-desktop: 3;
  border-bottom: var(--border-medium);
}

.mapping-container {
  min-width: 150px;
}

.edit-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.inline-input {
  --padding-start: 0;
  --padding-end: 0;
  text-align: right;
}

.carrier-label {
  margin: 0;
  font-size: 0.8em;
}
</style>
