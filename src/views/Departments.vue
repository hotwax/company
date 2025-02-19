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

      <div class="list-item ion-padding-end" v-for="facility in facilities" :key="facility.facilityId">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="storefrontOutline" />
          <ion-label>
            <p class="overline">{{ facility.facilityTypeId }}</p>
            {{ facility.facilityName }}
            <p>{{ facility.facilityId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- TODO: need to make this shopify mapping dynamic -->
        <!-- <ion-label>
          Shopify Mapping ID
          <p>{{ translate("Shopify") }}</p>
        </ion-label> -->

        <template v-if="getFacilityInFacilityIdentification(facility)">
          <div class="ion-text-center">
            <ion-chip outline @click="editNetSuiteId(facility)">
              <ion-label>{{ getFacilityInFacilityIdentification(facility)?.idValue }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="removeNetSuiteId(facility)" />
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite department ID") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editNetSuiteId(facility)">
            <ion-icon :icon="addOutline"/>
            <ion-label>{{ translate("NetSuite id") }}</ion-label>
          </ion-button>
        </template>
        
        <!-- TODO: need to make this order analytics dynamic -->
        <!-- <ion-label class="ion-margin-end">
          150
          <p>orders</p>
        </ion-label> -->
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, alertController, onIonViewDidEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed } from "vue";
import { showToast, hasError } from '@/utils';
import { DateTime } from "luxon";
import emitter from "@/event-bus";
import logger from '@/logger';
import { NetSuiteService } from '@/services/NetSuiteService';

const store = useStore();

const facilities = computed(() => store.getters["util/getFacilities"])
const facilitiesIdentifications = computed(() => store.getters["netSuite/getFacilitiesIdentifications"])

onIonViewDidEnter(async () => {
  await store.dispatch("util/fetchFacilities")
  await store.dispatch("netSuite/fetchFacilitiesIdentifications")
})

function getFacilityInFacilityIdentification(facility: any) {
  return facilitiesIdentifications.value.find((identification: any) => identification.facilityId === facility.facilityId);
}

async function editNetSuiteId(facility: any) {
  const facilityIdentification = getFacilityInFacilityIdentification(facility);

  const alert = await alertController.create({
    header: translate("Add Netsuite department Id"),
    inputs: [{
      name: "netSuiteId",
      value: facilityIdentification ? facilityIdentification.idValue : ""
    }],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel"
      },
      {
        text: translate("Apply"),
        handler: async (data) => {
          let resp;
          const netSuiteId = data.netSuiteId.trim();
          
          if(!netSuiteId) {
            showToast(translate("Please enter a valid NetSuite ID"));
            return false;
          }
          
          if(facilityIdentification?.idValue === netSuiteId) {
            showToast(translate("Please update the NetSuite ID"));
            return false;
          }
          
          emitter.emit("presentLoader");
          try {

            const payload = {
              facilityIdenTypeId: "ORDR_ORGN_DPT",
              facilityId: facility.facilityId,
              idValue: netSuiteId,
              fromDate: facilityIdentification ? facilityIdentification.fromDate : DateTime.now().toMillis()
            };
            
            resp = await NetSuiteService.updateFacilityIdentification(payload);
            if(!hasError(resp)) {
              showToast(translate("NetSuite department Id updated successfully"))
              await store.dispatch("netSuite/fetchFacilitiesIdentifications")
            } else {
              throw resp.data;
            }
          } catch(err) {
            logger.error(err)
          }
          emitter.emit('dismissLoader')
        }
      }
    ]
  });
  await alert.present();
}

async function removeNetSuiteId(facility: any) {
  const facilityIdentification = getFacilityInFacilityIdentification(facility);

  emitter.emit("presentLoader");

  try {
    const payload = {
      ...facilityIdentification,
      thruDate: DateTime.now().toMillis()
    };

    const resp = await NetSuiteService.updateFacilityIdentification(payload);
    if(!hasError(resp)) {
      showToast(translate("NetSuite department Id removed successfully"));
      await store.dispatch("netSuite/fetchFacilitiesIdentifications");
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
  --columns-desktop: 2;;
}
</style>