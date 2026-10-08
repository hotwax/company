<template>
  <ion-content>
    <ion-list>
      <ion-list-header>
        {{ translate("Variance type") }}
      </ion-list-header>
      <ion-item lines="none" button @click="updateVarianceType(type)" v-for="type in rejectReasonEnumTypes" :key="type.enumTypeId">
        {{ type.enumTypeId }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonListHeader, popoverController } from "@ionic/vue";
import { commonUtil, logger, translate } from "@common";
import { useRejectionReasons } from "@/composables/useRejectionReasons";

const props = defineProps<{
  reason: any;
  rejectReasonEnumTypes: any[];
}>();

const { updateEnumeration } = useRejectionReasons();

const updateVarianceType = async (selectedType: any) => {
  if (props.reason.enumTypeId === selectedType.enumTypeId) {
    popoverController.dismiss();
    return;
  }

  try {
    const resp: any = await updateEnumeration({
      enumId: props.reason.enumId,
      enumTypeId: selectedType.enumTypeId,
      description: props.reason.description,
      enumName: props.reason.enumName,
      enumCode: props.reason.enumCode,
      sequenceNum: props.reason.sequenceNum
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Variance type updated successfully."));
      popoverController.dismiss({ isUpdated: true, newEnumTypeId: selectedType.enumTypeId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to update variance type."));
    logger.error(err);
    popoverController.dismiss();
  }
};
</script>
