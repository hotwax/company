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
      <div class="ion-margin-top">
        <ion-text>Product store name shipment methods</ion-text>
      </div>
      <ion-button size="small" fill="clear" class="ion-margin-bottom">
        <ion-label>{{ translate("Add more shipment methods") }}</ion-label>
      </ion-button>
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
            <ion-chip :outline="true" @click="editNetSuiteId(shipmentMethod, updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId])">
              <ion-label>{{ updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].mappingValue }}</ion-label>
              <ion-icon fill="" :icon="closeCircleOutline" @click.stop="deleteNetSuiteId(updatedNetSuiteIds[shipmentMethod.shipmentMethodTypeId].integrationMappingId)" />
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite ID") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editNetSuiteId(shipmentMethod, '')">
            <ion-icon :icon="addOutline"/>
            <ion-label>{{ translate("NetSuite id") }}</ion-label>
          </ion-button>
        </template>

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
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonText, IonTitle, IonToolbar, onIonViewWillEnter, alertController } from "@ionic/vue";
import { addOutline, airplaneOutline, closeCircleOutline, informationCircleOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
import { useStore } from "vuex";
import { computed } from "vue";
import { showToast, hasError } from '@/utils';
import emitter from "@/event-bus";
import logger from '@/logger';
import { NetSuiteService } from '@/services/NetSuiteService';


const store = useStore();

const shipmentMethodTypes = computed(() => store.getters["util/getShipmentMethodTypes"])
const productStoreShipmentMethods = computed(() => store.getters["netSuite/getProductStoreShipmentMehtods"])
const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"]("NETSUITE_SHP_MTHD"))

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
  await store.dispatch("netSuite/fetchIntegrationTypeMappings", "NETSUITE_SHP_MTHD")
})

function getShipmentMethodDesc(id: string) {
  const shipmentMethodType = shipmentMethodTypes.value.find((type: any) => type.shipmentMethodTypeId === id);
  return shipmentMethodType ? shipmentMethodType.description : ''
}

async function editNetSuiteId(shipmentMethod: any, integrationMapping: any) {
  const alert = await alertController.create({
    header: translate("Add Netsuite Id"),
    inputs: [{
      name: "netSuiteId",
      value: integrationMapping?.integrationMappingId ? integrationMapping.mappingValue : '',
    }],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel"
      },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const netSuiteId = data.netSuiteId.trim();
          if (!netSuiteId) {
            showToast(translate("Please enter a valid NetSuite ID."));
            return false;
          }

          if (integrationMapping?.mappingValue === netSuiteId) {
            showToast(translate("Please update the NetSuite ID."));
            return false;
          }

          const payload = {
            integrationTypeId: "NETSUITE_SHP_MTHD",
            mappingKey: shipmentMethod.shipmentMethodTypeId,
            mappingValue: netSuiteId
          };

          if(integrationMapping?.integrationMappingId) {
            await updateNetSuiteId(payload, integrationMapping.integrationMappingId);
          } else {
            await addNetSuiteId(payload)
          }
        }
      }
    ]
  });
  await alert.present();
}

async function addNetSuiteId(payload: any) {
  emitter.emit("presentLoader")
  let resp;
  
  try {
    resp = await NetSuiteService.addIntegrationTypeMappings(payload)
    if (!hasError(resp)) {
      showToast(translate("NetSuite Id updated successfully."))
      await store.dispatch("netSuite/fetchIntegrationTypeMappings", "NETSUITE_SHP_MTHD")
    } else {
      throw resp.data;
    }
  } catch(err) {
    logger.error(err)
  }
  emitter.emit('dismissLoader')
}

async function updateNetSuiteId(payload: any, integrationMappingId:any) {
  emitter.emit("presentLoader")
  let resp;

  try {
    resp = await NetSuiteService.updateIntegrationTypeMappings(payload, integrationMappingId)
    if (!hasError(resp)) {
      showToast(translate("NetSuite Id updated successfully."))
      await store.dispatch("netSuite/fetchIntegrationTypeMappings", "NETSUITE_SHP_MTHD")
    } else {
      throw resp.data;
    }
  } catch(err) {
    logger.error(err)
  }
  emitter.emit('dismissLoader')
}

async function deleteNetSuiteId(integrationMappingId: any) {
  emitter.emit('presentLoader');
  let resp;

  try {
    resp = await NetSuiteService.deleteNetsuiteId(integrationMappingId)
    if(!hasError(resp)) {
      showToast(translate("NetSuite ID deleted successfully"))
      await store.dispatch("netSuite/fetchIntegrationTypeMappings", "NETSUITE_SHP_MTHD")
    } else {
      throw resp.data;
    }
  } catch(err) {
    logger.error(err)
  }
  emitter.emit('dismissLoader')
}

</script>
<style scoped>
.list-item {
  --columns-desktop: 5;
  border-bottom : 1px solid var(--ion-color-medium);
}
</style>