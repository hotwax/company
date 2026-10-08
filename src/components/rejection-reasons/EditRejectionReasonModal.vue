<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Edit name and description") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="updateRejectionReason()">
      <ion-item>
        <ion-input v-model="rejectionReason.enumName">
          <div slot="label">{{ translate('Name') }} <ion-text color="danger">*</ion-text></div>
        </ion-input>
      </ion-item>
      <ion-item>
        <ion-textarea :label="translate('Description')" v-model="rejectionReason.description" />
      </ion-item>
    </form>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button @click="updateRejectionReason()" :disabled="!isReasonUpdated()">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonText, IonTextarea, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { onBeforeMount, ref } from "vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useRejectionReasons } from "@/composables/useRejectionReasons";

const props = defineProps<{
  reason: any;
}>();

const { updateEnumeration } = useRejectionReasons();
const rejectionReason = ref<any>({});

onBeforeMount(() => {
  rejectionReason.value = JSON.parse(JSON.stringify(props.reason || {}));
});

const closeModal = () => {
  modalController.dismiss();
};

const isReasonUpdated = () => {
  return JSON.stringify(props.reason) !== JSON.stringify(rejectionReason.value);
};

const updateRejectionReason = async () => {
  if (!rejectionReason.value.enumName?.trim()) {
    commonUtil.showToast(translate("Rejection reason name is required."));
    return;
  }

  try {
    const resp: any = await updateEnumeration(rejectionReason.value);
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Rejection reason updated successfully."));
      modalController.dismiss({ isUpdated: true, updatedReason: rejectionReason.value });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
    commonUtil.showToast(translate("Failed to update rejection reason."));
  }
};
</script>
