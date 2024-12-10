<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
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
      
      <!-- TODO: need to make this dynamic -->
      <!-- <div class="ion-margin-top">
        <ion-text>Product store name shipment methods</ion-text>
      </div> -->
      <!-- <ion-button size="small" fill="clear" class="ion-margin-bottom">
        <ion-label>{{ translate("Add more shipment methods") }}</ion-label>
      </ion-button> -->
      
      <div class="list-item" v-for="shipmentMethod in productStoreShipmentMethods" :key="shipmentMethod.productStoreShipMethId">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>
            {{ getShipmentMethodDesc(shipmentMethod.shipmentMethodTypeId) }}
            <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
          </ion-label>
        </ion-item>

        <ion-label>
          carrier party name
          <p>{{ shipmentMethod.partyId }}</p>
        </ion-label>

        <!-- TODO: need to make this shopify mapping dynamic -->
        <ion-label>
          shopify mapping name
          <p>Shopify name</p>
        </ion-label>
        
        <template v-if="updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId]">
          <div class="ion-text-center">
            <ion-chip :outline="true" @click="editNetSuiteId(shipmentMethod.shipmentMethodTypeId, updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId])">
              <ion-label>{{ updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].mappingValue }}</ion-label>
              <ion-icon fill="" :icon="closeCircleOutline" @click.stop="removeNetSuiteId(updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].integrationMappingId)" />
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite ID") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editNetSuiteId(shipmentMethod.shipmentMethodTypeId, '')">
            <ion-icon :icon="addOutline"/>
            <ion-label>{{ translate("NetSuite id") }}</ion-label>
          </ion-button>
        </template>

        <!-- TODO: need to make this order analytics dynamic -->
        <ion-label class="ion-margin">
          150
          <p>{{ translate("orders") }}</p>
        </ion-label>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton } from '@ionic/vue'
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, airplaneOutline, closeCircleOutline, informationCircleOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed } from "vue";
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";

const store = useStore();

const { editNetSuiteId, removeNetSuiteId } = useNetSuiteComposables("NETSUITE_SHP_MTHD");

const shipmentMethodTypes = computed(() => store.getters["util/getShipmentMethodTypes"])
const productStoreShipmentMethods = computed(() => store.getters["netSuite/getProductStoreShipmentMehtods"])
const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"]("NETSUITE_SHP_MTHD"))

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

onIonViewWillEnter(async () => {
  await store.dispatch("util/fetchShipmentMethodTypes");
  await store.dispatch("netSuite/fetchProductStoreShipmentMethods")
  await store.dispatch("netSuite/fetchIntegrationTypeMappings", { integrationTypeId: "NETSUITE_SHP_MTHD" })
})

function getShipmentMethodDesc(shipmentMethodTypeId: string) {
  const shipmentMethodType = shipmentMethodTypes.value.find((type: any) => type.shipmentMethodTypeId === shipmentMethodTypeId);
  return shipmentMethodType ? shipmentMethodType.description : ""
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
  border-bottom : 1px solid var(--ion-color-medium);
}
</style>