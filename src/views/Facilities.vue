<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
        <ion-title>{{ translate("Facilities") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map facilities to NetSuite") }}
            <p>{{ translate("For orders and inventory to sync with NetSuite, the facilities in NetSuite must be mapped to facilities in HotWax Commerce") }}</p>
          </ion-label>
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
            <ion-input v-show="editingNetSuiteId === facility.facilityId" :ref="(el => setNetSuiteInputRef(el, facility.facilityId))" :clear-input="true" v-model="netSuiteInputValue" @keyup.enter="saveNetSuiteId(facility)" @ionBlur="netSuiteInputValue ? saveNetSuiteId(facility): ''"/>
          </template>
          <template v-else>
            <div class="ion-text-center" v-if="facility.externalId">
              <ion-chip outline @click="updateNetSuiteId(facility)">
                <ion-label>{{ facility.externalId }}</ion-label>
                <ion-icon :icon="closeCircleOutline" @click.stop="removeNetSuiteId(facility, '')" />
              </ion-chip>
              <ion-label>
                <p>{{ translate("NetSuite department ID") }}</p>
              </ion-label>
            </div>
            <ion-button v-else size="small" fill="outline" @click="updateNetSuiteId(facility)">
              <ion-icon :icon="addOutline"/>
              <ion-label>{{ translate("NetSuite ID") }}</ion-label>
            </ion-button>
          </template>
        </div>

        <!-- TODO: need to make this overflow options dynamic -->
        <!-- <ion-button fill="clear" color="medium">
          <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
        </ion-button> -->
      </div>
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { translate } from "@/i18n"
import { IonBackButton, IonButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonTitle, IonToolbar, onIonViewDidEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { useStore } from "vuex";
import { computed, nextTick, ref } from "vue";
import { showToast, hasError } from '@/utils';
import { DateTime } from "luxon";
import emitter from "@/event-bus";
import logger from '@/logger';
import { UtilService } from '@/services/UtilService';

const store = useStore();

let editingNetSuiteId = ref("") as any;
let netSuiteInputValue = ref("") as any;
let netSuiteInputRefs = ref({}) as any;
let isSavingNetSuiteId = ref(false);

const facilities = computed(() => store.getters["util/getFacilities"])
const getShopifyShopLocation = computed(() => store.getters["netSuite/getShopifyShopLocation"])

onIonViewDidEnter(async () => {
  await store.dispatch("util/fetchFacilities")
  await store.dispatch("netSuite/fetchShopifyShopLocation")
})

function setNetSuiteInputRef(el: any, id: string) {
  if(el) netSuiteInputRefs.value[id] = el;
}

async function updateNetSuiteId(facility: any) {
  editingNetSuiteId.value = facility.facilityId;
  netSuiteInputValue.value = facility?.externalId || "";
  // Waiting for DOM updations before focus inside the text-area, as it is conditionally rendered in the DOM
  await nextTick()
  setTimeout(async () => {
    const inputElement = netSuiteInputRefs.value[facility.facilityId];
    if(inputElement && inputElement.$el) {
      await inputElement.$el.setFocus();
    }
  }, 0);
}

async function saveNetSuiteId(facility: any) {
  if(isSavingNetSuiteId.value) return;
  isSavingNetSuiteId.value = true;

  await editNetSuiteId(facility, netSuiteInputValue.value.trim());
  editingNetSuiteId.value = "";

  isSavingNetSuiteId.value = false;
}

async function editNetSuiteId(facility: any, netSuiteId: string) {
  if(!netSuiteId) {
    showToast(translate("Please enter a valid NetSuite ID"));
    return false;
  }
  
  if(facility.externalId === netSuiteId) {
    showToast(translate("Please update the NetSuite ID"));
    return false;
  }
  
  emitter.emit("presentLoader");
  try {
    const payload = {
      facilityId: facility.facilityId,
      externalId: netSuiteId,
    };
    
    const resp = await UtilService.updateFacility(payload);
    if(!hasError(resp)) {
      showToast(translate("NetSuite Id updated successfully"))
      await store.dispatch("util/fetchFacility", facility.facilityId);
    } else {
      throw resp.data;
    }
  } catch(err) {
    logger.error(err)
  }
  emitter.emit('dismissLoader')
}

async function removeNetSuiteId(facility: any, netSuiteId: string) {
  emitter.emit("presentLoader");

  try {
    const payload = {
      facilityId: facility.facilityId,
      externalId: netSuiteId,
    };

    const resp = await UtilService.updateFacility(payload);
    if(!hasError(resp)) {
      showToast(translate("NetSuite Id updated successfully"))
      await store.dispatch("util/fetchFacility", facility.facilityId);
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
  --columns-desktop: 4;
}
</style>