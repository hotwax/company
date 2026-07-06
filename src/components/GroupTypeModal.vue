<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Group type") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <div class="empty-state" v-if="!facilityGroupTypes.length">
      <p>{{ translate("No group types found") }}</p>
    </div>

    <ion-radio-group v-else v-model="selectedTypeId">
      <ion-item :key="type.facilityGroupTypeId" v-for="type in facilityGroupTypes">
        <ion-radio :value="type.facilityGroupTypeId">
          <ion-label>
            {{ type.description || type.facilityGroupTypeId }}
            <p>{{ type.facilityGroupTypeId }}</p>
          </ion-label>
        </ion-radio>
      </ion-item>
    </ion-radio-group>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="selectedTypeId === originalTypeId" @click="save()">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
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
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
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

const originalTypeId = props.facilityGroup.facilityGroupTypeId || "";
const selectedTypeId = ref(originalTypeId);

function closeModal(updated?: any) {
  modalController.dismiss({ updated });
}

async function save() {
  try {
    const resp = await (facilityStore as any).updateFacilityGroup({
      facilityGroupId: props.facilityGroup.facilityGroupId,
      facilityGroupTypeId: selectedTypeId.value
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Group type updated"));
      closeModal({ facilityGroupTypeId: selectedTypeId.value });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error("Failed to update group type", err);
    commonUtil.showToast(translate("Failed to update group type"));
  }
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
