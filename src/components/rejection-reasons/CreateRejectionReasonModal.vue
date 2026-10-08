<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Create rejection reason") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form>
      <ion-list>
        <ion-item>
          <ion-input label-placement="floating" @ionBlur="formData.enumId ? null : setEnumId(formData.enumName)" v-model="formData.enumName">
            <div slot="label">{{ translate('Name') }} <ion-text color="danger">*</ion-text></div>
          </ion-input>
        </ion-item>
        <ion-item :lines="formData.enumId ? 'none' : 'inset'">
          <ion-input label-placement="floating" :label="translate('ID')" ref="enumIdInput" v-model="formData.enumId" @ionInput="validateEnumId" @ionBlur="markEnumIdTouched" :error-text="translate('ID cannot be more than 20 characters.')" />
        </ion-item>
        <ion-item>
          <ion-input label-placement="floating" :label="translate('Description')" v-model="formData.description" />
        </ion-item>
        <ion-item lines="none">
          <ion-select :label="translate('Variance type')" interface="popover" v-model="formData.enumTypeId" :helper-text="getDescription()">
            <ion-select-option v-for="type in rejectReasonEnumTypes" :key="type.enumTypeId" :value="type.enumTypeId">{{ type.enumTypeId }}</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="createReason()">
          <ion-icon :icon="checkmarkDoneOutline" />
        </ion-fab-button>
      </ion-fab>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonList, IonSelect, IonSelectOption, IonText, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { ref } from "vue";
import { checkmarkDoneOutline, closeOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useRejectionReasons } from "@/composables/useRejectionReasons";

const props = defineProps<{
  rejectReasons: any[];
  rejectReasonEnumTypes: any[];
}>();

const { createEnumeration } = useRejectionReasons();

const enumIdInput = ref<any>(null);

const formData = ref<any>({
  description: "",
  enumId: "",
  enumName: "",
  enumTypeId: ""
});

const closeModal = () => {
  modalController.dismiss();
};

const setEnumId = (enumName: any) => {
  formData.value.enumId = commonUtil.generateInternalId(enumName);
  validateEnumIdDirect(formData.value.enumId);
};

const validateEnumId = (event: any) => {
  validateEnumIdDirect(event.target.value);
};

const validateEnumIdDirect = (value: string) => {
  if (!enumIdInput.value) return;
  const el = enumIdInput.value.$el || enumIdInput.value;
  el.classList.remove("ion-valid");
  el.classList.remove("ion-invalid");

  if (!value) return;

  if (value.length <= 20) {
    el.classList.add("ion-valid");
  } else {
    el.classList.add("ion-invalid");
    el.classList.add("ion-touched");
  }
};

const markEnumIdTouched = () => {
  if (enumIdInput.value) {
    const el = enumIdInput.value.$el || enumIdInput.value;
    el.classList.add("ion-touched");
  }
};

const createReason = async () => {
  if (!formData.value.enumName?.trim()) {
    commonUtil.showToast(translate("Rejection reason name is required."));
    return;
  }

  if (formData.value.enumId.length > 20) {
    commonUtil.showToast(translate("ID cannot be more than 20 characters."));
    return;
  }

  if (!formData.value.enumTypeId) {
    commonUtil.showToast(translate("Variance type is required."));
    return;
  }

  if (!formData.value.enumId) {
    formData.value.enumId = commonUtil.generateInternalId(formData.value.enumName);
  }

  const lastSeq = props.rejectReasons?.length ? props.rejectReasons[props.rejectReasons.length - 1].sequenceNum : 0;
  formData.value.sequenceNum = lastSeq ? Number(lastSeq) + 5 : 5;

  try {
    const resp: any = await createEnumeration(formData.value);
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Rejection reason created successfully."));
      modalController.dismiss({ isUpdated: true, newReason: formData.value });
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to create rejection reason."));
    logger.error(err);
  }
};

const getDescription = () => {
  return props.rejectReasonEnumTypes?.find((type: any) => type.enumTypeId === formData.value.enumTypeId)?.description;
};
</script>
