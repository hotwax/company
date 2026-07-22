<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="close()">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Select security groups") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="query" :placeholder="translate('Search security groups')" />

      <ion-list v-if="filteredSecurityGroups.length">
        <ion-item v-for="securityGroup in filteredSecurityGroups" :key="securityGroup.groupId">
          <ion-checkbox
            :checked="isSelected(securityGroup.groupId)"
            :disabled="isChangeDisabled(securityGroup.groupId)"
            @ion-change="toggleSecurityGroup(securityGroup)"
          >
            <ion-label>
              {{ securityGroup.groupName || securityGroup.groupId }}
              <p>{{ securityGroup.groupId }}</p>
            </ion-label>
          </ion-checkbox>
        </ion-item>
      </ion-list>

      <div v-else class="empty-state">
        <p>{{ translate("No security groups found") }}</p>
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button @click="save()">
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { PropType, computed, onMounted, ref } from "vue";
import { AppPermissionDefinition } from "@/config/app-permissions";

const props = defineProps({
  permission: {
    type: Object as PropType<AppPermissionDefinition>,
    required: true
  },
  securityGroups: {
    type: Array as PropType<any[]>,
    default: () => []
  },
  activeGroups: {
    type: Array as PropType<any[]>,
    default: () => []
  },
  canCreate: {
    type: Boolean,
    default: false
  },
  canUpdate: {
    type: Boolean,
    default: false
  }
});

const query = ref("");
const selectedGroups = ref<any[]>([]);

const filteredSecurityGroups = computed(() => {
  const queryString = query.value.trim().toLowerCase();
  if(!queryString) {return props.securityGroups;}

  return props.securityGroups.filter((securityGroup: any) => {
    return securityGroup.groupId.toLowerCase().includes(queryString) ||
      (securityGroup.groupName && securityGroup.groupName.toLowerCase().includes(queryString));
  });
});

onMounted(() => {
  selectedGroups.value = props.activeGroups.map((group: any) => ({
    groupId: group.groupId,
    groupName: group.groupName,
    fromDate: group.fromDate
  }));
});

const close = () => {
  modalController.dismiss(null, "cancel");
};

const isSelected = (groupId: string) => {
  return selectedGroups.value.some((group: any) => group.groupId === groupId);
};

const wasOriginallySelected = (groupId: string) => {
  return props.activeGroups.some((group: any) => group.groupId === groupId);
};

const isChangeDisabled = (groupId: string) => {
  return wasOriginallySelected(groupId) ? !props.canUpdate : !props.canCreate;
};

const save = () => {
  modalController.dismiss({
    permission: props.permission,
    originalGroups: props.activeGroups,
    selectedGroups: selectedGroups.value
  }, "save");
};

const toggleSecurityGroup = (securityGroup: any) => {
  if(isChangeDisabled(securityGroup.groupId)) {return;}

  if(isSelected(securityGroup.groupId)) {
    selectedGroups.value = selectedGroups.value.filter((group: any) => group.groupId !== securityGroup.groupId);

    return;
  }

  selectedGroups.value.push({
    groupId: securityGroup.groupId,
    groupName: securityGroup.groupName
  });
};
</script>

<style scoped>
.empty-state {
  padding: 16px;
  text-align: center;
}
</style>
