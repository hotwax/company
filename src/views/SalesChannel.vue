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
        <ion-icon :icon="openOutline" slot="end" />
      </ion-item>
    </div>

    <div class="list-item ion-margin-top" v-for="channel in salesChannel" :key="channel.enumId">
      <ion-item lines="none">
        <ion-label>
          {{ channel.enumName ? channel.enumName : channel.enumId }}
          <p>{{ channel.enumId }}</p>
        </ion-label>
      </ion-item>
      
      <!-- TODO: need to make this shopify mapping dynamic -->
      <ion-label>
        Shopify Mapping ID
        <p>Shopify</p>
      </ion-label>
      
      <template v-if="channel.netSuiteSalesChannelId">
        <div class="ion-text-center">
          <ion-chip :outline="true" @click="editNetSuiteSalesChannelId(channel)">
            <ion-label>{{ channel.netSuiteSalesChannelId }}</ion-label>
            <ion-icon fill="" :icon="closeCircleOutline" />
          </ion-chip>
          <ion-label>
            <p>{{ translate("NetSuite sales channel") }}</p>
          </ion-label>
        </div>
      </template>
      <template v-else>
        <ion-button size="small" fill="outline" @click="editNetSuiteSalesChannelId(channel)">
          <ion-icon :icon="addOutline"/>
          <ion-label>{{ translate("NetSuite id") }}</ion-label>
        </ion-button>
      </template>
        
      <ion-label class="ion-margin">
        150
        <p>orders</p>
      </ion-label>
    </div>

  </ion-content>
</ion-page>
</template>
<script setup lang="ts">
import { IonBackButton, onIonViewDidEnter } from '@ionic/vue'
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, alertController } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
import { useStore } from "vuex";
import { computed } from "vue";
import { showToast } from '@/utils';


const store = useStore();


const salesChannel = computed(() => store.getters["netSuite/getSalesChannel"])

onIonViewDidEnter(async () => {
  await store.dispatch("netSuite/fetchSalesChannel")
})

const editNetSuiteSalesChannelId = async (channel: any) => {
  const alert = await alertController.create({
    header: translate("Add Netsuite sales channel Id"),
    inputs: [{
      name: "netSuiteSalesChannelId",
      value: channel.netSuiteSalesChannelId || '',
    }],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel"
      },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const currentNetsuiteId = channel.netSuiteSalesChannelId || "";
          if (data.netSuiteSalesChannelId.trim() !== currentNetsuiteId) {
            const updatedData = {
              "fieldName": "netSuiteSalesChannelId",
              "fieldValue": data.netSuiteSalesChannelId.trim()
            };
            showToast(translate("NetSuite sales channel Id updated successfully."))
            // await store.dispatch('util/updateSalesChannel', { channel, updatedData });
            channel.netSuiteSalesChannelId = data.netSuiteSalesChannelId.trim();
          }
        }
      }
    ]
  });
  await alert.present();
}
</script>
<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>