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
import { useFacilityMutations, useFacilityRecord } from "@/composables/useFacilities";
import { ref, computed, watch } from "vue";

// `facilityId` comes in as a prop. This used to read `facilityStore.current`, which the detail
// page stopped populating when it moved to composables — so every save posted `undefined`.
const props = defineProps(["facilityId"]);
const mutations = useFacilityMutations(props.facilityId);
const { record } = useFacilityRecord(props.facilityId);
const currentFacility = computed<any>(() => (record.value as any)?.raw ?? record.value ?? {});

const externalId = ref(currentFacility.value.externalId || '');

// The cached record arrives asynchronously from IndexedDB, so a value captured at setup is empty
// on a cold read. Seed the field on the first emit that carries one, but never overwrite what the
// user has already typed.
let seeded = !!externalId.value;
watch(currentFacility, (facility: any) => {
  if (!seeded && facility?.externalId) {
    externalId.value = facility.externalId;
    seeded = true;
  }
});

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
    const resp = await mutations.updateFacility({ externalId: externalId.value });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Facility external ID updated.'));
      // No local patch needed: the mutation re-reads the row into the cache and the page renders
      // from that cache, so the new value propagates on its own.
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
