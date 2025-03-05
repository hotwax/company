<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Sales Channel") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map sales channel with NetSuite") }}
            <p>{{ translate("Learn more about mapping sales channels with NetSuite to make sure orders are attributed correctly.") }}</p>
          </ion-label>
          <ion-button fill="clear" size="small" color="medium">
            <ion-icon :icon="openOutline" slot="icon-only" />
          </ion-button>
        </ion-item>
      </div>

      <div class="list-item ion-padding-end ion-margin-top" v-for="channel in salesChannel" :key="channel.enumId">
        <ion-item lines="none">
          <ion-label>
            {{ channel.description ? channel.description : channel.enumId }}
            <p>{{ channel.enumId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- TODO: need to make this shopify mapping dynamic -->
        <ion-label>
          {{ getShopifyMappingId(channel.enumId) ? getShopifyMappingId(channel.enumId) : '-' }}
          <p>{{ translate("Shopify") }}</p>
        </ion-label>
        
        <template v-if="channel.enumCode">
          <div class="ion-text-center">
            <ion-chip outline @click="editNetSuiteSalesChannelId(channel)">
              <ion-label>{{ channel.enumCode }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="updateSalesChannelNetSuiteId(channel, '')"/>
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite sales channel") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editNetSuiteSalesChannelId(channel)">
            <ion-icon :icon="addOutline"/>
            <ion-label>{{ translate("NetSuite ID") }}</ion-label>
          </ion-button>
        </template>

        <!-- TODO: need to make this order analytics dynamic -->
        <!-- <ion-label class="ion-margin">
          150
          <p>orders</p>
        </ion-label> -->
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, alertController, onIonViewDidEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { NetSuiteService } from '@/services/NetSuiteService';
import { useStore } from "vuex";
import { computed } from "vue";
import { showToast, hasError } from '@/utils';
import emitter from "@/event-bus";
import logger from '@/logger';


const store = useStore();

const salesChannel = computed(() => store.getters["netSuite/getSalesChannel"])
const shopifyTypeMappings = computed(() => store.getters["netSuite/getShopifyTypeMappings"]("SHOPIFY_ORDER_SOURCE"))

onIonViewDidEnter(async () => {
  await store.dispatch("netSuite/fetchSalesChannel")
  await store.dispatch("netSuite/fetchShopifyTypeMappings", "SHOPIFY_ORDER_SOURCE")
})

function getShopifyMappingId(salesChannelEnumId: any) {
  const shopifyMappingId = shopifyTypeMappings.value.find((mapping: any) => mapping.mappedValue === salesChannelEnumId);
  return shopifyMappingId ? shopifyMappingId.mappedKey : "";
}

async function editNetSuiteSalesChannelId(channel: any) {
  const alert = await alertController.create({
    header: translate("Add Netsuite sales channel Id"),
    inputs: [{
      name: "netSuiteSalesChannelId",
      value: channel.enumCode ? channel.enumCode : "",
    }],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel"
      },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const netSuiteId = data.netSuiteSalesChannelId.trim();
          
          if(!netSuiteId) {
            showToast("Please enter a valid NetSuite ID.");
            return false;
          }

          if(channel.enumCode === netSuiteId) {
            showToast("Please update the NetSuite ID.");
            return false;
          }
          await updateSalesChannelNetSuiteId(channel, netSuiteId);
        }
      }
    ]
  });
  await alert.present();
}

async function updateSalesChannelNetSuiteId(channel: any, netSuiteId: any) {
  emitter.emit("presentLoader");
  let resp;

  try {
    channel.enumCode = netSuiteId;
    resp = await NetSuiteService.updateEnumCode(channel);

    if(!hasError(resp)) {
      showToast("NetSuite Id updated successfully.");
      await store.dispatch("netSuite/fetchSalesChannel");
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
  }
  emitter.emit('dismissLoader');
}

</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>