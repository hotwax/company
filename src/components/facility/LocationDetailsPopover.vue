<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ translate("Location details") }}</ion-list-header>
      <ion-item button @click="addLocationModal">
        {{ translate("Edit location") }}
      </ion-item>
      <ion-item button lines="none" @click="removeLocation">
        {{ translate("Remove location") }}
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
import { commonUtil, emitter, logger, translate } from "@common";
import AddLocationModal from "./AddLocationModal.vue";
import { useFacilityMutations } from "@/composables/useFacilities";

const props = defineProps(["location"]);

// The location row carries its own facilityId, so this popover never needed the store's `current`
// — which the detail page no longer populates anyway.
const mutations = useFacilityMutations(props.location.facilityId);

async function addLocationModal() {
  const modal = await modalController.create({
    component: AddLocationModal,
    componentProps: { location: props.location, facilityId: props.location.facilityId }
  });
  await popoverController.dismiss();
  modal.present();
}

async function removeLocation() {
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.deleteLocation({ locationSeqId: props.location.locationSeqId });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Facility location removed successfully'));
      // Locations are live-fetched, not cached — the opener reloads them on dismiss.
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to remove facility location'));
    logger.error('Failed to remove facility location', err);
  }
  popoverController.dismiss();
  emitter.emit('dismissLoader');
}
</script>
