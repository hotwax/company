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
          <ion-button fill="clear" size="small" color="medium">
            <ion-icon :icon="openOutline" slot="icon-only" />
          </ion-button>
        </ion-item>
      </div>

      <div class="list-item ion-padding-end" v-for="facility in facilities" :key="facility.facilityId">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="storefrontOutline" />
          <ion-label>
            <p class="overline">{{ facility.typeDescription }}</p>
            {{ facility.facilityName }}
            <p>{{ facility.facilityId }}</p>
          </ion-label>
        </ion-item>
        
        <ion-label>
          {{ getShopifyShopLocation(facility.facilityId) ? getShopifyShopLocation(facility.facilityId) : "-" }}
          <p>{{ translate("Shopify") }}</p>
        </ion-label>

        <div class="netsuite-id ion-margin-end">
          <template v-if="editingNetSuiteId === facility.facilityId">
            <ion-input v-show="editingNetSuiteId === facility.facilityId" :ref="(el => setNetSuiteInputRef(el, facility.facilityId))" :clear-input="true" v-model="netSuiteInputValue" @keyup.enter="saveNetSuiteId(facility.facilityId)" @ionBlur="netSuiteInputValue ? saveNetSuiteId(facility.facilityId): ''"/>
          </template>
          <template v-else>
            <div class="ion-text-center" v-if="getFacilityInFacilityIdentification(facility.facilityId)">
              <ion-chip outline @click="updateNetSuiteId(facility.facilityId)">
                <ion-label>{{ getFacilityInFacilityIdentification(facility.facilityId)?.idValue }}</ion-label>
                <ion-icon :icon="closeCircleOutline" @click.stop="removeNetSuiteId(facility.facilityId)" />
              </ion-chip>
              <ion-label>
                <p>{{ translate("NetSuite department ID") }}</p>
              </ion-label>
            </div>
            <ion-button v-else size="small" fill="outline" @click="updateNetSuiteId(facility.facilityId)">
              <ion-icon :icon="addOutline"/>
              <ion-label>{{ translate("NetSuite ID") }}</ion-label>
            </ion-button>
          </template>
        </div>
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
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonTitle, IonToolbar, alertController, onIonViewDidEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed, nextTick, ref } from "vue";
import { showToast, hasError } from '@/utils';
import { DateTime } from "luxon";
import emitter from "@/event-bus";
import logger from '@/logger';
import { NetSuiteService } from '@/services/NetSuiteService';

const store = useStore();

let editingNetSuiteId = ref("") as any;
let netSuiteInputValue = ref("") as any;
let netSuiteInputRefs = ref({}) as any;
let isSavingNetSuiteId = ref(false);

const facilities = computed(() => store.getters["util/getFacilities"])
const facilitiesIdentifications = computed(() => store.getters["netSuite/getFacilitiesIdentifications"])
const getShopifyShopLocation = computed(() => store.getters["netSuite/getShopifyShopLocation"])

onIonViewDidEnter(async () => {
  await store.dispatch("util/fetchFacilities")
  await store.dispatch("netSuite/fetchFacilitiesIdentifications")
  await store.dispatch("netSuite/fetchShopifyShopLocation")
})

function getFacilityInFacilityIdentification(facilityId: any) {
  return facilitiesIdentifications.value.find((identification: any) => identification.facilityId === facilityId);
}

function setNetSuiteInputRef(el: any, id: string) {
  if(el) netSuiteInputRefs.value[id] = el;
}

async function updateNetSuiteId(facilityId: string) {
  editingNetSuiteId.value = facilityId;
  netSuiteInputValue.value = getFacilityInFacilityIdentification(facilityId)?.idValue || "";
  // Waiting for DOM updations before focus inside the text-area, as it is conditionally rendered in the DOM
  await nextTick()
  setTimeout(async () => {
    const inputElement = netSuiteInputRefs.value[facilityId];
    if(inputElement && inputElement.$el) {
      await inputElement.$el.setFocus();
    }
  }, 0);
}

async function saveNetSuiteId(facilityId: string) {
  if(isSavingNetSuiteId.value) return;
  isSavingNetSuiteId.value = true;

  const facilityIdentification = getFacilityInFacilityIdentification(facilityId);
  await editNetSuiteId(facilityId, facilityIdentification, netSuiteInputValue.value.trim());
  editingNetSuiteId.value = "";

  isSavingNetSuiteId.value = false;
}

async function editNetSuiteId(facilityId: string, facilityIdentification: any, netSuiteId: string) {
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
      facilityId: facilityId,
      idValue: netSuiteId,
      fromDate: facilityIdentification ? facilityIdentification.fromDate : DateTime.now().toMillis()
    };
    
    const resp = await NetSuiteService.updateFacilityIdentification(payload);
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

async function removeNetSuiteId(facilityId: any) {
  const facilityIdentification = getFacilityInFacilityIdentification(facilityId);

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
  --columns-desktop: 4;
}

@media (max-width: 700px) {
  .header {
    grid-template-columns: 1fr;
  }
}
</style>