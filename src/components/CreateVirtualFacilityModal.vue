<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("New parking") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="createVirtualFacility">
      <ion-list>
        <ion-item>
          <ion-input label-placement="floating" @ionBlur="setFacilityId($event)" v-model="formData.facilityName">
            <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
          </ion-input>
        </ion-item>
        <ion-item lines="none">
          <ion-input
            :label="translate('Internal ID')"
            label-placement="floating"
            ref="facilityIdRef"
            v-model="formData.facilityId"
            @ionInput="validateFacilityId"
            @ionBlur="markFacilityIdTouched"
            :error-text="translate('Internal ID cannot be more than 20 characters.')"
          />
        </ion-item>
        <ion-item>
          <ion-input label-placement="floating" :label="translate('Description')" v-model="formData.description" />
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="createVirtualFacility" @keyup.enter.stop>
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
  IonList,
  IonText,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { ref } from "vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useFacilityStore } from "@/store/facility";
import { useUtilStore } from "@/store/util";
import { generateInternalId } from "@/utils";

const facilityStore = useFacilityStore();
const utilStore = useUtilStore();

const facilityIdRef = ref<any>(null);
const isAutoGenerateId = ref(true);
const formData = ref({ facilityName: '', facilityId: '', description: '' });

function closeModal() {
  modalController.dismiss();
}

function setFacilityId(event: any) {
  if (isAutoGenerateId.value) {
    formData.value.facilityId = generateInternalId(event.target.value);
  }
}

function validateFacilityId(event: any) {
  const value = event.target.value;
  const el = facilityIdRef.value?.$el;
  if (!el) return;
  el.classList.remove('ion-valid', 'ion-invalid');
  if (value === '') return;
  formData.value.facilityId.length <= 20
    ? el.classList.add('ion-valid')
    : el.classList.add('ion-invalid');
  isAutoGenerateId.value = false;
}

function markFacilityIdTouched() {
  facilityIdRef.value?.$el.classList.add('ion-touched');
}

async function createVirtualFacility() {
  if (!formData.value.facilityName?.trim()) {
    commonUtil.showToast(translate('Please fill all the required fields'));
    return;
  }
  if (formData.value.facilityId.length > 20) {
    commonUtil.showToast(translate('Internal ID cannot be more than 20 characters.'));
    return;
  }
  if (!formData.value.facilityId) {
    formData.value.facilityId = generateInternalId(formData.value.facilityName);
  }
  try {
    const payload = {
      ...formData.value,
      facilityTypeId: 'VIRTUAL_FACILITY',
      ownerPartyId: utilStore.organizationPartyId
    };
    const resp = await (facilityStore as any).createVirtualFacility(payload);
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("New parking created successfully."));
      const created = { ...formData.value, facilityTypeId: 'VIRTUAL_FACILITY', orderCount: 0 };
      (facilityStore as any).updateVirtualFacilities([...(facilityStore as any).getVirtualFacilities, created]);
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    if (error?.response?.data?.error?.message) {
      commonUtil.showToast(error.response.data.error.message);
    } else {
      commonUtil.showToast(translate('Failed to create parking.'));
    }
  }
  modalController.dismiss();
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
