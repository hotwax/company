<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
        <ion-title>{{ translate("Shipment methods") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map shipment methods to NetSuite") }}
            <p>{{ translate("For an order to sync with NetSuite, the shipment method on that order must be mapped to a NetSuite shipment method ID.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-icon slot="start" :icon="informationCircleOutline" />
          <ion-label>
            {{ translate("Don't see a shipment method?") }}
            <p>{{ translate("If you don’t see a shipment method on this page that you know you’ve setup in HotWax Commerce, it may not be linked to the Product Store your NetSuite account is linked too.") }}</p>
          </ion-label>
        </ion-item>
      </div>
      
      <div class="ion-margin-top">
        <ion-text>{{ netSuiteProductStore?.storeName || translate("Product Store") }} {{ translate("shipment methods") }}</ion-text>
      </div>
      <ion-button size="small" fill="clear" class="ion-margin-bottom" @click="addMoreShipmentMethods()">
        <ion-label>{{ translate("Add more shipment methods") }}</ion-label>
      </ion-button>
      
      <!-- Cold cache after login: the seed sync is still running, so show placeholders rather
           than an empty list that reads as "there is nothing here". -->
      <template v-if="!hydrated"><div class="list-item ion-padding-end" v-for="n in 4" :key="`sk-${n}`">
        <ion-item lines="none">
          <ion-label><ion-skeleton-text animated style="width: 45%" /></ion-label>
        </ion-item>
      </div></template>

      <div class="list-item ion-padding-end" v-for="shipmentMethod in productStoreShipmentMethods" :key="shipmentMethod.productStoreShipMethId">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>
            {{ getShipmentMethodDesc(shipmentMethod.shipmentMethodTypeId) }}
            <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
          </ion-label>
        </ion-item>
        <ion-label>
          {{ shopifyShopsCarrierShipments[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId]?.carrierPartyId ? shopifyShopsCarrierShipments[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId].carrierPartyId : "-" }}
          <p>{{ shopifyShopsCarrierShipments[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId] ? shopifyShopsCarrierShipments[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId].carrierPartyId : "-" }}</p>
        </ion-label>

        <ion-label>
          {{ shopifyShopsCarrierShipments[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId]?.shopifyShippingMethod ? shopifyShopsCarrierShipments[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId].shopifyShippingMethod : "-" }}
          <p>{{ translate("Shopify Name") }}</p>
        </ion-label>
        
        <template v-if="updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId]">
          <div class="ion-text-center">
            <ion-chip outline @click="editNetSuiteId(shipmentMethod.shipmentMethodTypeId, updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId])">
              <ion-label>{{ updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].mappingValue }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="removeNetSuiteId(updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].integrationMappingId)" />
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite ID") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editNetSuiteId(shipmentMethod.shipmentMethodTypeId, '')">
            <ion-icon :icon="addOutline"/>
            <ion-label>{{ translate("NetSuite ID") }}</ion-label>
          </ion-button>
        </template>

        <ion-label class="ion-margin">
          {{ shipmentMethod.orderCount || 0 }}
          <p>{{ translate("orders") }}</p>
        </ion-label>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonSkeletonText, IonText, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, airplaneOutline, closeCircleOutline, informationCircleOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from '@common'
import { computed } from "vue";
import { useNetSuite } from "@/composables/useNetSuite";
import { useShipmentMethodTypes } from "@/composables/useSeed";
import { useNetSuiteProductStore, useProductStoreShippingMethods } from "@/composables/useProductStores";
import { useShopifyCarrierShipments } from "@/composables/useShopify";

import { useRouter } from "vue-router";

const router = useRouter();
const shipmentMethodTypeId = JSON.parse(import.meta.env.VITE_NETSUITE_INTEGRATION_TYPE_MAPPING)?.SHIPPING_METHOD_TYPE_ID
const { mappings: integrationTypeMappings, editNetSuiteId, removeNetSuiteId } = useNetSuite(shipmentMethodTypeId);

// Every read is cached. Resolve the NetSuite-linked ProductStore reactively: on a cold cache its ID
// lands after setup, and the all-store shipment-method cache must then reveal only that partition.
const { shipmentMethodTypes } = useShipmentMethodTypes();
const {
  netSuiteProductStore,
  hydrated: productStoresHydrated,
} = useNetSuiteProductStore();
const netSuiteProductStoreId = computed<string | undefined>(
  () => netSuiteProductStore.value?.productStoreId,
);
const {
  shippingMethods: productStoreShipmentMethods,
  hydrated: shipmentMethodsHydrated,
} = useProductStoreShippingMethods(netSuiteProductStoreId);
const hydrated = computed(() =>
  productStoresHydrated.value && shipmentMethodsHydrated.value);
const { byCarrierAndMethod: shopifyShopsCarrierShipments } = useShopifyCarrierShipments(undefined);

// The `updatedNetSuiteIds` computed property maps each `mappingKey`(enumId) from `integrationTypeMappings` 
// to an object containing `mappingValue` and `integrationMappingId`(NETSUITE_SHP_MTHD)
const updatedNetSuiteIds = computed(() => {
  return integrationTypeMappings.value.reduce((shipmentMethodNetSuiteId: any, mappingItem: any) => {
    shipmentMethodNetSuiteId[mappingItem.mappingKey] = {
      mappingValue: mappingItem.mappingValue,
      integrationMappingId: mappingItem.integrationMappingId
    };
    return shipmentMethodNetSuiteId;
  }, {} as any);
});

function addMoreShipmentMethods() {
  if (netSuiteProductStore.value?.productStoreId) {
    router.push(`/product-store-details/${netSuiteProductStore.value.productStoreId}`);
  } else {
    router.push("/product-store");
  }
}

function getShipmentMethodDesc(shipmentMethodTypeId: string) {
  const shipmentMethodType = shipmentMethodTypes.value.find((type: any) => type.shipmentMethodTypeId === shipmentMethodTypeId);
  return shipmentMethodType ? shipmentMethodType.description : ""
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
}
</style>
