<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ externalMappingTypes[mappingId] }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="type && type === 'update' ? updateMapping() : saveMapping()" @submit.prevent>
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
        <ion-list-header>{{ externalMappingTypes[mappingId] }}</ion-list-header>
        <ion-item>
          <ion-input id="inputElement" :label="translate('Identification')" v-model="mappingValue" placeholder="Mapping Value" />
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="type && type === 'update' ? updateMapping() : saveMapping()" @keyup.enter.stop>
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
import { useFacilityIdentificationTypes } from "@/composables/useFacilities";
import { ref, computed, onMounted } from "vue";

// `facilityId` is a prop now — it used to come from `facilityStore.current`, which the detail page
// no longer fills, so both writes below were posting to an undefined facility.
const props = defineProps(["mappingId", "mapping", "type", "facilityId"]);
const mutations = useFacilityMutations(props.facilityId);
const { record } = useFacilityRecord(props.facilityId);
const currentFacility = computed<any>(() => (record.value as any)?.raw ?? record.value ?? {});
const { byId: externalMappingTypes } = useFacilityIdentificationTypes();

const mappingValue = ref('');

onMounted(() => {
  if (props.type) {
    mappingValue.value = props.mapping?.idValue || '';
  }
});

function closeModal() {
  modalController.dismiss();
}

async function saveMapping() {
  if (!mappingValue.value?.trim()) {
    commonUtil.showToast(translate('Please enter a valid value'));
    return;
  }
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.saveIdentification({
      facilityIdenTypeId: props.mappingId,
      idValue: mappingValue.value
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('External mapping created successfully'));
      // saveIdentification re-snapshots the identification cache; the page renders from it.
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to create external mapping'));
    logger.error('Failed to create external mapping', err);
  }
  emitter.emit('dismissLoader');
}

async function updateMapping() {
  if (!mappingValue.value?.trim()) {
    commonUtil.showToast(translate('Please enter a valid value'));
    return;
  }
  emitter.emit('presentLoader');
  try {
    // Same upsert endpoint as create — `fromDate` is what targets the existing row.
    const resp = await mutations.saveIdentification({
      facilityIdenTypeId: props.mappingId,
      fromDate: props.mapping.fromDate,
      idValue: mappingValue.value
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('External mapping updated successfully'));
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to update external mapping'));
    logger.error('Failed to update external mapping', err);
  }
  emitter.emit('dismissLoader');
}
</script>
