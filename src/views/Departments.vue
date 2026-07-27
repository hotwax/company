<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
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
          <ion-button fill="clear" size="default" color="medium">
            <ion-icon :icon="openOutline" slot="icon-only" />
          </ion-button>
        </ion-item>
      </div>

      <!-- Cold cache after login: the seed sync is still running, so show placeholders rather
           than an empty list that reads as "there is nothing here". -->
      <template v-if="!hydrated"><div class="list-item ion-padding-end" v-for="n in 4" :key="`sk-${n}`">
        <ion-item lines="none">
          <ion-label><ion-skeleton-text animated style="width: 45%" /></ion-label>
        </ion-item>
      </div></template>

      <div class="list-item ion-padding-end" v-for="facility in facilities" :key="facility.facilityId">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="storefrontOutline" />
          <ion-label>
            <p class="overline">{{ facility.facilityTypeId }}</p>
            {{ facility.facilityName }}
            <p>{{ facility.facilityId }}</p>
          </ion-label>
        </ion-item>
        
        <ion-label>
          {{ getShopifyShopLocation(facility.facilityId) ? getShopifyShopLocation(facility.facilityId) : "-" }}
          <p>{{ translate("Shopify") }}</p>
        </ion-label>

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
            <ion-label>{{ translate("NetSuite ID") }}</ion-label>
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
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonTitle, IonToolbar, alertController, onIonViewDidEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { computed } from "vue";
import { useFacilities } from '@/composables/useFacilities';
import { useShopifyLocations } from '@/composables/useShopify';
import { useFacilityIdentifications, useNetSuite } from '@/composables/useNetSuite';
import { DateTime } from "luxon";

// All three reads are cached; writes go through useNetSuite, which resyncs what it changed.
const { facilities, hydrated } = useFacilities();
const { identifications: facilitiesIdentifications } = useFacilityIdentifications();
const { locations: shopifyLocations } = useShopifyLocations(undefined);
const { updateFacilityIdentification } = useNetSuite();

/** facilityId → shopifyLocationId, read from the cached location mappings. */
const getShopifyShopLocation = computed(() => (facilityId: string) =>
  shopifyLocations.value.find((l: any) => l.facilityId === facilityId)?.shopifyLocationId)


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
            commonUtil.showToast(translate("Please enter a valid NetSuite ID"));
            return false;
          }
          
          if(facilityIdentification?.idValue === netSuiteId) {
            commonUtil.showToast(translate("Please update the NetSuite ID"));
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
            
            resp = await updateFacilityIdentification(payload);
            if(!commonUtil.hasError(resp)) {
              commonUtil.showToast(translate("NetSuite department Id updated successfully"))
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

    const resp = await updateFacilityIdentification(payload);
    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("NetSuite department Id removed successfully"));
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

@media (max-width: 700px) {
  .header {
    grid-template-columns: 1fr;
  }
}
</style>