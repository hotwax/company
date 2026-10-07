<template>
  <ion-content>
    <ion-list>
      <ion-list-header>
        {{ reason.enumName ? reason.enumName : reason.enumId }}
      </ion-list-header>
      <ion-item button @click="openEditRejectionReasonModal()">
        {{ translate("Edit name and description") }}
      </ion-item>
      <ion-item button lines="none" @click="removeRejectionReason()">
        {{ translate("Remove reason") }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonListHeader, alertController, modalController, popoverController } from "@ionic/vue";
import { defineProps } from "vue";
import { commonUtil, logger, translate } from "@common";
import EditRejectionReasonModal from "@/components/rejection-reasons/EditRejectionReasonModal.vue";
import { useRejectionReasons } from "@/composables/useRejectionReasons";
import { DateTime } from "luxon";

const props = defineProps<{
  reason: any;
}>();

const { updateEnumeration } = useRejectionReasons();

const openEditRejectionReasonModal = async () => {
  const editRejectionReasonModal = await modalController.create({
    component: EditRejectionReasonModal,
    componentProps: { reason: props.reason }
  });
  editRejectionReasonModal.onDidDismiss().then((result) => {
    if (result.data?.isUpdated) {
      popoverController.dismiss({ isUpdated: true, updatedReason: result.data.updatedReason });
    } else {
      popoverController.dismiss();
    }
  });
  return editRejectionReasonModal.present();
};

const removeRejectionReason = async () => {
  const alert = await alertController.create({
    header: translate("Remove rejection reason"),
    message: translate("Are you sure you want to remove this rejection reason?"),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Confirm"),
        handler: async () => {
          try {
            const resp: any = await updateEnumeration({
              ...props.reason,
              thruDate: DateTime.now().toMillis()
            });
            if (!commonUtil.hasError(resp)) {
              commonUtil.showToast(translate("Rejection reason removed successfully."));
              popoverController.dismiss({ isRemoved: true, removedEnumId: props.reason.enumId });
            } else {
              throw resp.data;
            }
          } catch (err) {
            commonUtil.showToast(translate("Failed to remove rejection reason."));
            logger.error(err);
            popoverController.dismiss();
          }
        }
      }
    ]
  });

  return alert.present();
};
</script>
