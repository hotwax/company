<template>
  <ion-menu type="overlay" side="end">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ translate("Filters") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-item lines="none">
          <ion-icon slot="start" :icon="idCardOutline" />
          <ion-select v-model="query.userGroupId" :label="translate('Clearance')" interface="popover" @ion-change="closeMenu">
            <ion-select-option value="">
              {{ translate("All") }}
            </ion-select-option>
            <ion-select-option v-for="(userGroup, index) in userGroups" :key="index" :value="userGroup.userGroupId">
              {{ userGroup.description || userGroup.userGroupId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item lines="none">
          <ion-icon slot="start" :icon="toggleOutline" />
          <ion-select v-model="query.status" :label="translate('Status')" interface="popover" @ion-change="closeMenu">
            <ion-select-option value="">
              {{ translate("All") }}
            </ion-select-option>
            <ion-select-option value="Y">
              {{ translate("Active") }}
            </ion-select-option>
            <ion-select-option value="N">
              {{ translate("Inactive") }}
            </ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-menu>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonContent, IonHeader, IonIcon, IonItem, IonList, IonMenu, IonSelect, IonSelectOption, IonTitle, IonToolbar, menuController } from "@ionic/vue"
import { idCardOutline, toggleOutline } from "ionicons/icons"
import { translate } from "@common";
import { useUserStore } from "@/store/user";
import { useUserGroups } from "@/composables/useSecurity";

const userStore = useUserStore();
const { userGroups: cachedUserGroups } = useUserGroups();

const query = computed(() => userStore.getQuery);
const userGroups = computed(() => cachedUserGroups.value);

const closeMenu = () => {
  // Query updation and fetchUsers action automatically gets handled by the event handlers on Users page.
  menuController.close();
};
</script>
