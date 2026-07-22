<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Select security groups") }}</ion-title>
    </ion-toolbar>
    <ion-toolbar>
      <ion-searchbar v-model="queryString" :placeholder="translate('Search security groups')" />
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <template v-if="filteredSecurityGroups.length">
      <ion-list>
        <ion-item v-for="securityGroup in filteredSecurityGroups" :key="securityGroup.userGroupId">
          <ion-checkbox :checked="isSelected(securityGroup.userGroupId)" @ion-change="toggleSecurityGroupSelection(securityGroup)">
            <ion-label>
              {{ securityGroup.description || securityGroup.userGroupId }}
              <p>{{ securityGroup.userGroupId }}</p>
            </ion-label>
          </ion-checkbox>
        </ion-item>
      </ion-list>
    </template>
    <div v-else class="empty-state">
      <p>{{ translate("No security groups found") }}</p>
    </div>

    <ion-fab slot="fixed" vertical="bottom" horizontal="end" @click="saveSecurityGroups()">
      <ion-fab-button>
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { translate } from "@common";
import { useUtilStore } from "@/store/util";

const props = defineProps<{
  selectedSecurityGroups: any[]
}>();

const utilStore = useUtilStore();

const queryString = ref("");
const securityGroups = computed(() => utilStore.getUserGroups);
const selectedSecurityGroupValues = ref<any[]>(JSON.parse(JSON.stringify(props.selectedSecurityGroups || [])));
const filteredSecurityGroups = computed(() => {
  const query = queryString.value.toLowerCase();
  if(!query) {return securityGroups.value;}

  return securityGroups.value.filter((securityGroup: any) => {
    return securityGroup.userGroupId.toLowerCase().includes(query) ||
        (securityGroup.description && securityGroup.description.toLowerCase().includes(query));
  });
});

const closeModal = () => {
  modalController.dismiss({ dismissed: true });
};

const saveSecurityGroups = () => {
  const securityGroupsToCreate = selectedSecurityGroupValues.value.filter((selectedGroup: any) => !props.selectedSecurityGroups.some((group: any) => group.userGroupId === selectedGroup.userGroupId));
  const securityGroupsToRemove = props.selectedSecurityGroups.filter((group: any) => !selectedSecurityGroupValues.value.some((selectedGroup: any) => group.userGroupId === selectedGroup.userGroupId));

  modalController.dismiss({
    dismissed: true,
    value: {
      selectedSecurityGroups: selectedSecurityGroupValues.value,
      securityGroupsToCreate,
      securityGroupsToRemove
    }
  });
};

const toggleSecurityGroupSelection = (updatedSecurityGroup: any) => {
  const selectedGroup = selectedSecurityGroupValues.value.some((group :any) => group.userGroupId === updatedSecurityGroup.userGroupId);
  if(selectedGroup) {
    selectedSecurityGroupValues.value = selectedSecurityGroupValues.value.filter((group :any) => group.userGroupId !== updatedSecurityGroup.userGroupId);
  } else {
    selectedSecurityGroupValues.value.push(updatedSecurityGroup);
  }
};

const isSelected = (securityGroupId: any) => {
  return selectedSecurityGroupValues.value.some((securityGroup :any) => securityGroup.userGroupId === securityGroupId);
};
</script>
<style scoped>
  ion-content {
    --padding-bottom: 80px;
  }
</style>
