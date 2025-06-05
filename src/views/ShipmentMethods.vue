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
      
      <!-- TODO: need to make this dynamic -->
      <!-- <div class="ion-margin-top">
        <ion-text>Product store name shipment methods</ion-text>
      </div> -->
      <!-- <ion-button size="small" fill="clear" class="ion-margin-bottom">
        <ion-label>{{ translate("Add more shipment methods") }}</ion-label>
      </ion-button> -->
      
      <div class="list-item ion-padding-end" v-for="shipmentMethod in productStoreShipmentMethods" :key="shipmentMethod.productStoreShipMethId">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>
            {{ getShipmentMethodDesc(shipmentMethod.shipmentMethodTypeId) }}
            <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
          </ion-label>
        </ion-item>
        <ion-label>
          {{ shopifyShopsCarrierShipments(shipmentMethod.shipmentMethodTypeId)?.carrierPartyId ? shopifyShopsCarrierShipments(shipmentMethod.shipmentMethodTypeId).carrierPartyId : "-" }}
          <p>{{ shopifyShopsCarrierShipments(shipmentMethod.shipmentMethodTypeId) ? shopifyShopsCarrierShipments(shipmentMethod.shipmentMethodTypeId).carrierPartyId : "-" }}</p>
        </ion-label>

        <ion-label>
          {{ shopifyShopsCarrierShipments(shipmentMethod.shipmentMethodTypeId)?.shopifyShippingMethod ? shopifyShopsCarrierShipments(shipmentMethod.shipmentMethodTypeId).shopifyShippingMethod : "-" }}
          <p>{{ translate("Shopify name") }}</p>
        </ion-label>
        
        <template v-if="updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId] && editingNetSuiteId !== shipmentMethod.shipmentMethodTypeId">
          <div class="ion-text-center">
            <ion-chip outline @click="startNetSuiteIdEdit(shipmentMethod.shipmentMethodTypeId)">
              <ion-label>{{ updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].mappingValue }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="removeNetSuiteId(updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].integrationMappingId)" />
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite ID") }}</p>
            </ion-label>
          </div>
        </template>

        <template v-else-if="editingNetSuiteId !== shipmentMethod.shipmentMethodTypeId">
          <ion-button size="small" fill="outline" @click="startNetSuiteIdEdit(shipmentMethod.shipmentMethodTypeId)">
            <ion-icon :icon="addOutline"/>
            <ion-label>{{ translate("NetSuite ID") }}</ion-label>
          </ion-button>
        </template>

        <template>
          <ion-input v-show="editingNetSuiteId === shipmentMethod.shipmentMethodTypeId" :ref="(el => setNetSuiteInputRef(el, shipmentMethod.shipmentMethodTypeId))" :clear-input="true" v-model="netSuiteInputValue" @keyup.enter="saveNetSuiteId(shipmentMethod.shipmentMethodTypeId)" @ionBlur="saveNetSuiteId(shipmentMethod.shipmentMethodTypeId)"/>
        </template>

        <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
        <!-- <ion-label class="ion-margin">
          150
          <p>{{ translate("orders") }}</p>
        </ion-label> -->
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, airplaneOutline, closeCircleOutline, informationCircleOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed, nextTick, ref } from "vue";
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";

const store = useStore();
const shipmentMethodTypeId = JSON.parse(process.env.VUE_APP_NETSUITE_INTEGRATION_TYPE_MAPPING)?.SHIPPING_METHOD_TYPE_ID
const { editNetSuiteId, removeNetSuiteId } = useNetSuiteComposables(shipmentMethodTypeId);

let editingNetSuiteId = ref("") as any;
let netSuiteInputValue = ref("") as any;
let netSuiteInputRefs = ref({}) as any;

const shipmentMethodTypes = computed(() => store.getters["util/getShipmentMethodTypes"])
const productStoreShipmentMethods = computed(() => store.getters["netSuite/getProductStoreShipmentMehtods"])
const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"](shipmentMethodTypeId))
const shopifyShopsCarrierShipments = computed(() => store.getters["netSuite/getShopifyShopsCarrierShipments"])

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
  await store.dispatch("netSuite/fetchShopifyShopsCarrierShipments")
})

function getShipmentMethodDesc(shipmentMethodTypeId: string) {
  const shipmentMethodType = shipmentMethodTypes.value.find((type: any) => type.shipmentMethodTypeId === shipmentMethodTypeId);
  return shipmentMethodType ? shipmentMethodType.description : ""
}

// Needed because we have multiple input fields in a loop, but only one is visible at a time
function setNetSuiteInputRef(el: any, id: string) {
  if(el) netSuiteInputRefs.value[id] = el;
}

async function startNetSuiteIdEdit(mappingKey: string) {
  editingNetSuiteId.value = mappingKey;
  netSuiteInputValue.value = updatedNetSuiteIds.value[mappingKey]?.mappingValue || "";
  // Waiting for DOM updations before focus inside the text-area, as it is conditionally rendered in the DOM
  await nextTick()
  const inputElement = netSuiteInputRefs.value[mappingKey];
  if(inputElement && inputElement.$el) inputElement.$el.setFocus();
}

async function saveNetSuiteId(mappingKey: string) {
  const integrationMapping = updatedNetSuiteIds.value[mappingKey] || '';
  await editNetSuiteId(mappingKey, integrationMapping, netSuiteInputValue.value.trim());
  editingNetSuiteId.value = "";
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
}
</style>