<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Location") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="saveFacilityLocation">
      <ion-item @keyup.enter.stop>
        <ion-select label-placement="floating" :label="translate('Type')" interface="popover" :placeholder="translate('Select')" v-model="locationInfo.locationTypeEnumId">
          <ion-select-option v-for="(description, type) in locationTypes" :key="type" :value="type">{{ description }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-input label-placement="floating" v-model="locationInfo.areaId">
          <div slot="label">{{ translate("Area") }} <ion-text color="danger">*</ion-text></div>
        </ion-input>
      </ion-item>
      <ion-item>
        <ion-input label-placement="floating" v-model="locationInfo.aisleId">
          <div slot="label">{{ translate("Aisle") }} <ion-text color="danger">*</ion-text></div>
        </ion-input>
      </ion-item>
      <ion-item>
        <ion-input label-placement="floating" v-model="locationInfo.sectionId">
          <div slot="label">{{ translate("Section") }} <ion-text color="danger">*</ion-text></div>
        </ion-input>
      </ion-item>
      <ion-item>
        <ion-input label-placement="floating" v-model="locationInfo.levelId">
          <div slot="label">{{ translate("Level") }} <ion-text color="danger">*</ion-text></div>
        </ion-input>
      </ion-item>
      <ion-item>
        <ion-input :label="translate('Sequence')" label-placement="floating" v-model="locationInfo.positionId" />
      </ion-item>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="saveFacilityLocation" @keyup.enter.stop>
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
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { useFacilityStore } from "@/store/facility";
import { ref, computed, onBeforeMount } from "vue";

const props = defineProps(["location"]);
const facilityStore = useFacilityStore();

const current = computed(() => facilityStore.getCurrent);
const locationTypes = computed(() => facilityStore.getLocationTypes);

const locationInfo = ref({} as any);

onBeforeMount(() => {
  locationInfo.value = props.location ? JSON.parse(JSON.stringify(props.location)) : {};
});

function closeModal() {
  modalController.dismiss();
}

async function saveFacilityLocation() {
  if (!locationInfo.value.aisleId?.trim() || !locationInfo.value.areaId?.trim() || !locationInfo.value.sectionId?.trim() || !locationInfo.value.levelId?.trim()) {
    commonUtil.showToast(translate('Please fill all the required fields'));
    return;
  }

  if (props.location?.locationSeqId) {
    await updateFacilityLocation();
  } else {
    await addFacilityLocation();
  }

  await facilityStore.fetchFacilityLocations({ facilityId: current.value.facilityId });
}

async function addFacilityLocation() {
  const params = { facilityId: current.value.facilityId, ...locationInfo.value };
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.createFacilityLocation(params);
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Facility location created successfully'));
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to create facility location'));
    logger.error('Failed to create facility location', err);
  }
  emitter.emit('dismissLoader');
}

async function updateFacilityLocation() {
  const params = { facilityId: current.value.facilityId, ...locationInfo.value };
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.updateFacilityLocation(params);
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Facility location updated successfully'));
      closeModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to update facility location'));
    logger.error('Failed to update facility location', err);
  }
  emitter.emit('dismissLoader');
}
</script>
