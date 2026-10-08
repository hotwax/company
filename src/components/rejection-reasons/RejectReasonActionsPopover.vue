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
import { commonUtil, logger, translate } from "@common";
import { DateTime } from "luxon";
import EditRejectionReasonModal from "@/components/rejection-reasons/EditRejectionReasonModal.vue";
import { useRejectionReasons } from "@/composables/useRejectionReasons";

const props = defineProps<{
  reason: any;
  linkedGroups?: string[];
  groupMembers?: Record<string, any>;
}>();

const { deleteEnumeration, updateEnumerationGroupMember } = useRejectionReasons();

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
  let message = translate("Are you sure you want to remove this rejection reason?");
  if (props.linkedGroups && props.linkedGroups.length > 0) {
    const groupNames = props.linkedGroups.join(", ");
    message = translate("This rejection reason is linked to {groupNames} group(s). Removing it will also unlink it from these groups. Are you sure you want to remove this rejection reason?", { groupNames });
  }

  const alert = await alertController.create({
    header: translate("Remove rejection reason"),
    message,
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Confirm"),
        handler: async () => {
          try {
            if (props.groupMembers) {
              const unlinkPromises: any[] = [];
              for (const [groupId, member] of Object.entries(props.groupMembers)) {
                if (member?.fromDate) {
                  unlinkPromises.push(
                    updateEnumerationGroupMember({
                      enumerationGroupId: groupId,
                      enumerationId: props.reason.enumId,
                      sequenceNum: props.reason.sequenceNum,
                      fromDate: member.fromDate,
                      thruDate: DateTime.now().toMillis()
                    })
                  );
                }
              }
              if (unlinkPromises.length) {
                await Promise.all(unlinkPromises);
              }
            }

            const resp: any = await deleteEnumeration(props.reason.enumId);
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
