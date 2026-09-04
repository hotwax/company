<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ productStore.storeName || productStore.productStoreId }}</ion-list-header>
      <ion-item button @click="redirectToStore()">
        <ion-label>
          {{ translate("View product store") }}
        </ion-label>
      </ion-item>
      <ion-item button lines="none" @click="confirmRemove()">
        {{ translate("Remove") }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonContent, IonItem, IonLabel, IonList, IonListHeader, alertController, popoverController } from "@ionic/vue";
import { commonUtil, logger, translate } from "@common";
import { useUserStore } from "@/store/user";
import { DateTime } from "luxon";

const props = defineProps({
  productStore: {
    type: Object,
    required: true
  }
});

const userStore = useUserStore();

const selectedUser = computed(() => userStore.selectedUser);
const userProductStores = computed(() => userStore.getSelectedUserProductStores);

const closePopover = () => {
  popoverController.dismiss();
};

const removeProductStoreRole = async () => {
  try {
    const resp = await userStore.updateProductStoreRole({
      partyId: selectedUser.value.partyId,
      productStoreId: props.productStore.productStoreId,
      roleTypeId: props.productStore.roleTypeId,
      fromDate: userProductStores.value.find((store: any) => props.productStore.productStoreId === store.productStoreId).fromDate,
      thruDate: DateTime.now().toMillis()
    });
    if(commonUtil.hasError(resp)) {throw resp.data;}
    commonUtil.showToast(translate("Role removed successfully."));
  } catch (error) {
    commonUtil.showToast(translate("Something went wrong."));
    logger.error(error);
  }

  const updatedUserProductStores = await userStore.getUserProductStores(selectedUser.value.partyId);
  userStore.updateSelectedUser({ ...selectedUser.value, productStores: updatedUserProductStores });
  closePopover();
};

const confirmRemove = async () => {
  const message = "Are you sure you want to perform this action?";
  const alert = await alertController.create({
    header: translate("Remove product store"),
    message: translate(message),
    buttons: [
      {
        text: translate("No"),
      },
      {
        text: translate("Yes"),
        handler: async () => {
          await removeProductStoreRole();
        }
      }
    ],
  });

  return alert.present();
};

const redirectToStore = () => {
  const companyDetailUrl = `${import.meta.env.VITE_COMPANY_LOGIN_URL}?productStoreId=${props.productStore.productStoreId}`;
  window.open(companyDetailUrl, "_blank");
};
</script>
