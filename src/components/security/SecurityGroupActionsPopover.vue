<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ securityGroup.description || securityGroup.userGroupId }}</ion-list-header>
      <ion-item>
        <ion-label>
          {{ getDateTime(securityGroup.fromDate) }}
          <p>{{ translate('added to group') }}</p>
        </ion-label>
      </ion-item>
      <ion-item button lines="none" :disabled="!userStore.hasPermission(Actions.APP_SECURITY_GROUP_ASSIGN)" @click="confirmRemove()">
        {{ translate("Remove") }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonLabel, IonList, IonListHeader, alertController, popoverController } from "@ionic/vue";
import { computed } from "vue";
import { commonUtil, logger, translate } from "@common";
import { useUserStore } from "@/store/user";
import { DateTime } from "luxon";
import Actions from "@/authorization/actions";

const props = defineProps({
  securityGroup: {
    type: Object,
    required: true
  }
});

const userStore = useUserStore();

const selectedUser = computed(() => userStore.getSelectedUser);

const closePopover = (userSecurityGroups: any) => {
  popoverController.dismiss(userSecurityGroups);
};

const getDateTime = (time: any) => {
  return DateTime.fromMillis(time).toLocaleString(DateTime.DATETIME_MED);
};

const removeUserSecurityGroup = async () => {
  try {
    const resp = await userStore.removeUserSecurityGroup({
      userGroupId: props.securityGroup.userGroupId,
      userId: selectedUser.value.userId,
      fromDate: props.securityGroup.fromDate,
      thruDate: DateTime.now().toMillis()
    })

    if(commonUtil.hasError(resp)) {throw resp.data}
    commonUtil.showToast(translate("Security group removed successfully."))
  } catch (error) {
    commonUtil.showToast(translate("Something went wrong."));
    logger.error(error)
  }
  // refetching security groups
  const userGroups = await userStore.getUserGroups(selectedUser.value.userId)
  const now = Date.now();
  const userSecurityGroups = userGroups.filter((group: any) => !group.thruDate || group.thruDate > now);
  userStore.updateSelectedUser({ ...selectedUser.value, securityGroups: userSecurityGroups })
  await userStore.indexEmployee(selectedUser.value.partyId)
  closePopover(userSecurityGroups)
};

const confirmRemove = async () => {
  const username = selectedUser.value.groupName ? selectedUser.value.groupName : `${selectedUser.value.firstName} ${selectedUser.value.lastName}`
  const message = "Removing this security group may limit 's access to certain features or data. Are you sure you want to continue?"
  const alert = await alertController.create({
    header: translate("Remove security group"),
    message: translate(message, { username }),
    buttons: [
      {
        text: translate("Keep Group"),
      },
      {
        text: translate("Remove"),
        handler: async () => {
          await removeUserSecurityGroup();
        }
      }
    ],
  });

  return alert.present();
};
</script>
