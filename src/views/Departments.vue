<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Departments") }}</ion-title>
      </ion-toolbar>
    </ion-header>

  <ion-content>
    <div class="header ion-margin-top">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
        <ion-label>
          {{ translate("Map departments with NetSuite") }}
          <p>{{ translate("Learn more about mapping departments with NetSuite to make sure orders are attributed correctly.") }}</p>
        </ion-label>
        <ion-icon :icon="openOutline" slot="end" />
      </ion-item>
    </div>

    <div class="list-item" v-for="facility in facilities" :key="facility.facilityId">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="storefrontOutline" />
        <ion-label>
          <p class="overline">{{ facility.facilityTypeId }}</p>
          {{ facility.facilityName }}
          <p>{{ facility.facilityId }}</p>
        </ion-label>
      </ion-item>
      
      <!-- TODO: need to make this shopify mapping dynamic -->
      <ion-label>
        Shopify Mapping ID
        <p>Shopify</p>
      </ion-label>
      
      <template v-if="facility.netSuiteDepartmentId">
        <div class="ion-text-center">
          <ion-chip :outline="true" @click="editNetSuiteDeparmentId(facility)">
            <ion-label>{{ facility.netSuiteDepartmentId }}</ion-label>
            <ion-icon fill="" :icon="closeCircleOutline" />
          </ion-chip>
          <ion-label>
            <p>{{ translate("NetSuite department ID") }}</p>
          </ion-label>
        </div>
      </template>
      <template v-else>
        <ion-button size="small" fill="outline" @click="editNetSuiteDeparmentId(facility)">
          <ion-icon :icon="addOutline"/>
          <ion-label>{{ translate("NetSuite id") }}</ion-label>
        </ion-button>
      </template>
        
      <ion-label class="ion-margin-end">
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
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
import { useStore } from "vuex";
import { computed } from "vue";
import { showToast } from '@/utils';


const store = useStore();

const facilities = computed(() => store.getters["util/getFacilities"])


onIonViewDidEnter(async () => {
  await store.dispatch("util/fetchFacilities")
})

const editNetSuiteDeparmentId = async (facility: any) => {
  const alert = await alertController.create({
    header: translate("Add Netsuite department Id"),
    inputs: [{
      name: "netSuiteDepartmentId",
      value: facility.netSuiteDepartmentId || '',
    }],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel"
      },
      {
        text: translate("Apply"),
        handler: async (data) => {
          const currentNetsuiteId = facility.netSuiteDepartmentId || "";
          if (data.netSuiteDepartmentId.trim() !== currentNetsuiteId) {
            const updatedData = {
              "fieldName": "netSuiteDepartmentId",
              "fieldValue": data.netSuiteDepartmentId.trim()
            };
            showToast(translate("NetSuite department Id updated successfully."))
            facility.netSuiteDepartmentId = data.netSuiteDepartmentId.trim();
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