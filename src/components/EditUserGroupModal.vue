<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Update user group") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="updateUserGroup()">
      <ion-item lines="none">
        <ion-textarea v-model="description" :label="translate('Description')" :counter="true" :maxlength="255" :auto-grow="true" />
      </ion-item>
    </form>
  </ion-content>

  <ion-fab slot="fixed" vertical="bottom" horizontal="end">
    <ion-fab-button :disabled="description === (userGroup.description || '')" @click="updateUserGroup()">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { PropType, ref } from "vue";
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonTextarea, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useUtilStore } from "@/store/util";

const props = defineProps({
  userGroup: {
    type: Object as PropType<any>,
    required: true
  }
});

const utilStore = useUtilStore();
const description = ref(props.userGroup.description || "");

const closeModal = () => {
  modalController.dismiss();
};

const updateUserGroup = async () => {
  if(description.value === (props.userGroup.description || "")) {return;}

  try {
    const resp = await utilStore.updateUserGroup({
      userGroupId: props.userGroup.userGroupId,
      description: description.value
    });

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("User group updated successfully."));
      utilStore.updateUserGroupInState({ userGroupId: props.userGroup.userGroupId, description: description.value });
      modalController.dismiss();
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to update user group."));
    logger.error(error);
  }
};
</script>
