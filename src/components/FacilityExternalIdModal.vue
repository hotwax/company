<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate('Facility External ID') }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="updateExternalId()" @submit.prevent>
      <ion-list>
        <ion-list-header>{{ translate("Facility details") }}</ion-list-header>
        <ion-item>
          <ion-label>{{ translate("Facility ID") }}</ion-label>
          <ion-label slot="end">{{ currentFacility.facilityId }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label>{{ translate("Facility name") }}</ion-label>
          <ion-label slot="end">{{ currentFacility.facilityName }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>{{ translate('Facility External ID') }}</ion-list-header>
        <ion-item>
          <ion-input id="inputElement" :label="translate('Identification')" v-model="externalId" />
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="updateExternalId()" @keyup.enter.stop>
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { useFacilityStore } from "@/store/facility";
import { ref, computed } from "vue";

const facilityStore = useFacilityStore();
const currentFacility = computed(() => facilityStore.getCurrent);

const externalId = ref(currentFacility.value.externalId || '');

function closeModal() {
  modalController.dismiss();
}

async function updateExternalId() {
  if (!externalId.value?.trim()) {
    commonUtil.showToast(translate('Please enter a valid value'));
    return;
  }
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.updateFacility({
      facilityId: currentFacility.value.facilityId,
      externalId: externalId.value
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Facility external ID updated.'));
      await facilityStore.updateCurrentFacility({ ...currentFacility.value, externalId: externalId.value });
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to update facility external ID'));
    logger.error('Failed to update facility external ID', err);
  }
  emitter.emit('dismissLoader');
}
</script>
