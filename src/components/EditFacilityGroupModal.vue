<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Edit group") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <form @keyup.enter="save">
      <ion-list>
        <ion-item>
          <ion-input
            label-placement="floating"
            :label="translate('Name')"
            v-model="formData.facilityGroupName"
          />
        </ion-item>
        <ion-item>
          <ion-input
            label-placement="floating"
            :label="translate('Internal ID')"
            :value="facilityGroup.facilityGroupId"
            readonly
          />
        </ion-item>
        <ion-item lines="none">
          <ion-select
            :label="translate('Group type')"
            interface="popover"
            v-model="formData.facilityGroupTypeId"
          >
            <ion-select-option value="">{{ translate("None") }}</ion-select-option>
            <ion-select-option
              v-for="type in facilityGroupTypes"
              :key="type.facilityGroupTypeId"
              :value="type.facilityGroupTypeId"
            >
              {{ type.description || type.facilityGroupTypeId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item lines="none">
          <ion-textarea
            :label="translate('Description')"
            label-placement="floating"
            :auto-grow="true"
            :counter="true"
            :maxlength="255"
            v-model="formData.description"
          />
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="save" @keyup.enter.stop>
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
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { translate, commonUtil, logger } from "@common";
import { useFacilityStore } from "@/store/facility";
import { computed, ref } from "vue";

const props = defineProps<{ facilityGroup: any }>();

const facilityStore = useFacilityStore();
const facilityGroupTypes = computed(() => facilityStore.getFacilityGroupTypes);

const formData = ref({
  facilityGroupName: props.facilityGroup.facilityGroupName || "",
  facilityGroupTypeId: props.facilityGroup.facilityGroupTypeId || "",
  description: props.facilityGroup.description || ""
});

function closeModal(updated?: any) {
  modalController.dismiss({ updated });
}

async function save() {
  if (!formData.value.facilityGroupName?.trim()) {
    commonUtil.showToast(translate("Please fill all the required fields"));
    return;
  }

  try {
    const resp = await (facilityStore as any).updateFacilityGroup({
      facilityGroupId: props.facilityGroup.facilityGroupId,
      ...formData.value
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Group details updated"));
      closeModal({ ...props.facilityGroup, ...formData.value });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error("Failed to update group details", err);
    commonUtil.showToast(translate("Failed to update group details"));
  }
}
</script>
