<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ translate("Choose system") }}</ion-list-header>
      <ion-item @click="createShopifyFacilityMappingModal" button>
        {{ translate('Shopify') }}
      </ion-item>
      <ion-item @click="createFacilityExternalId" button>
        {{ translate('External ID') }}
      </ion-item>
      <ion-item v-for="(desc, type) in externalMappingTypes" :key="type" @click="addMappingModal(type)" button>
        {{ desc }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonItem,
  IonList,
  IonListHeader,
  modalController,
  popoverController
} from "@ionic/vue";
import { translate } from "@common";
import FacilityMappingModal from "./FacilityMappingModal.vue";
import FacilityShopifyMappingModal from "./FacilityShopifyMappingModal.vue";
import FacilityExternalIdModal from "./FacilityExternalIdModal.vue";
import { useFacilityIdentificationTypes } from "@/composables/useFacilities";

// FACILITY_IDENTITY enums only, minus Shopify (offered separately above). Template iterates a map.
const props = defineProps(["facilityId"]);
const { selectable: externalMappingTypes } = useFacilityIdentificationTypes();

async function addMappingModal(type: any) {
  const modal = await modalController.create({
    component: FacilityMappingModal,
    componentProps: { mappingId: type, facilityId: props.facilityId }
  });
  await popoverController.dismiss();
  await modal.present();
  setTimeout(() => { (document.querySelector("#inputElement") as any)?.setFocus(); }, 100);
}

async function createShopifyFacilityMappingModal() {
  const modal = await modalController.create({
    component: FacilityShopifyMappingModal,
    componentProps: { facilityId: props.facilityId },
  });
  await popoverController.dismiss();
  await modal.present();
  setTimeout(() => { (document.querySelector("#inputElement") as any)?.setFocus(); }, 100);
}

async function createFacilityExternalId() {
  const modal = await modalController.create({
    component: FacilityExternalIdModal,
    componentProps: { facilityId: props.facilityId },
  });
  await popoverController.dismiss();
  await modal.present();
  setTimeout(() => { (document.querySelector("#inputElement") as any)?.setFocus(); }, 100);
}
</script>
