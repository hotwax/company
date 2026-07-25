<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Security group history") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list v-if="userGroupAssocHistories.length">
      <ion-item v-for="assocHistory in userGroupAssocHistories" :key="assocHistory.userGroupId">
        <ion-label>
          {{ assocHistory.description ? assocHistory.description : assocHistory.userGroupId }}
          <p>{{ assocHistory.userGroupId }}</p>
        </ion-label>
        <ion-note slot="end">
          {{ commonUtil.getDateWithOrdinalSuffix(assocHistory.fromDate) }} - {{ assocHistory.thruDate ? commonUtil.getDateWithOrdinalSuffix(assocHistory.thruDate) : translate('Current') }}
        </ion-note>
      </ion-item>
    </ion-list>
    <div v-else class="empty-state">
      <p>{{ translate("No history found.") }}</p>
    </div>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import { closeOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { useUserStore } from "@/store/user";

const userStore = useUserStore();

const selectedUser = computed(() => userStore.getSelectedUser);

const userGroupAssocHistories = ref<any[]>([]);

const closeModal = () => {
  modalController.dismiss({ dismissed: true });
};

const fetchUserSecurityGroupAssoHistory = async () => {
  if(!selectedUser.value.userId) {return;}

  let histories = [] as any;
  try {
    histories = await userStore.getUserGroups(selectedUser.value.userId);
    const currentSecurityGroups = histories.filter((history: any) => !history.thruDate);
    const expiredSecurityGroups = histories.filter((history: any) => history.thruDate);
    histories = currentSecurityGroups.concat(expiredSecurityGroups);
  } catch (error: any) {
    console.error(error);
  }
  userGroupAssocHistories.value = histories;
};

onMounted(() => {
  fetchUserSecurityGroupAssoHistory();
});
</script>
