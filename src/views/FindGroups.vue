<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Groups") }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar :placeholder="translate('Search groups')" v-model="query.queryString" @keyup.enter="updateQuery()" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main v-if="groups?.length">
        <ion-card v-for="group in groups" :key="group.facilityGroupId">
          <ion-item lines="full">
            <ion-label class="ion-text-wrap">
              <p>{{ group.facilityGroupId }}</p>
              <h1>{{ group.facilityGroupName }}</h1>
              <p>{{ group.description }}</p>
            </ion-label>
          </ion-item>
          <ion-item lines="full">
            <ion-label>{{ translate("Group type") }}</ion-label>
            <ion-chip outline slot="end" @click="openGroupTypeModal(group)">
              {{ group.facilityGroupTypeId ? (getFacilityGroupTypeDescription(group.facilityGroupTypeId) || group.facilityGroupTypeId) : "-" }}
            </ion-chip>
          </ion-item>
          <ion-item lines="full">
            <ion-label>{{ translate("Product stores") }}</ion-label>
            <ion-chip outline slot="end" @click="openProductStoreModal(group)">{{ group.productStoreCount ?? "-" }}</ion-chip>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Facilities") }}</ion-label>
            <ion-chip outline slot="end" @click="viewGroupDetail(group)">{{ group.facilityCount ?? "-" }}</ion-chip>
          </ion-item>
          <ion-button fill="clear" @click="openEditModal(group)">
            {{ translate("Edit details") }}
          </ion-button>
        </ion-card>
      </main>
      <main v-else>
        <p class="empty-state">{{ translate("No groups found") }}</p>
      </main>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="createFacilityGroup()">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonPage,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue';
import { computed } from 'vue';
import { translate } from "@common";
import { useFacilityStore } from '@/store/facility';
import EditFacilityGroupModal from '@/components/EditFacilityGroupModal.vue';
import GroupTypeModal from '@/components/GroupTypeModal.vue';
import AddProductStoreToGroupModal from '@/components/AddProductStoreToGroupModal.vue';
import CreateFacilityGroupModal from '@/components/CreateFacilityGroupModal.vue';
import router from '@/router';
import { addOutline } from 'ionicons/icons';

const facilityStore = useFacilityStore();

const groups = computed(() => facilityStore.getGroups);
const query = computed(() => facilityStore.getGroupQuery);

onIonViewWillEnter(async () => {
  await facilityStore.fetchFacilityGroupTypes();
  await fetchGroups();
});

async function fetchGroups() {
  await (facilityStore as any).fetchFacilityGroupsWithSearch();
}

async function updateQuery() {
  (facilityStore as any).updateGroupQuery(query.value);
  await fetchGroups();
}

function getFacilityGroupTypeDescription(facilityGroupTypeId: string) {
  return facilityStore.getFacilityGroupTypes.find((t: any) => t.facilityGroupTypeId === facilityGroupTypeId)?.description;
}

function viewGroupDetail(group: any) {
  router.push({ path: `/facility-group-detail/${group.facilityGroupId}` });
}

async function openGroupTypeModal(group: any) {
  const modal = await modalController.create({
    component: GroupTypeModal,
    componentProps: { facilityGroup: group }
  });

  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.updated) {
      const idx = facilityStore.groups.findIndex((g: any) => g.facilityGroupId === group.facilityGroupId);
      if (idx !== -1) facilityStore.groups[idx] = { ...facilityStore.groups[idx], ...data.updated };
    }
  });

  modal.present();
}

async function openProductStoreModal(group: any) {
  const modal = await modalController.create({
    component: AddProductStoreToGroupModal,
    componentProps: { facilityGroup: group }
  });

  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.updatedCount !== undefined) {
      const idx = facilityStore.groups.findIndex((g: any) => g.facilityGroupId === group.facilityGroupId);
      if (idx !== -1) facilityStore.groups[idx] = { ...facilityStore.groups[idx], productStoreCount: data.updatedCount };
    }
  });

  modal.present();
}

async function openEditModal(group: any) {
  const modal = await modalController.create({
    component: EditFacilityGroupModal,
    componentProps: { facilityGroup: group }
  });

  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.updated) {
      const idx = facilityStore.groups.findIndex((g: any) => g.facilityGroupId === data.updated.facilityGroupId);
      if (idx !== -1) facilityStore.groups[idx] = { ...facilityStore.groups[idx], ...data.updated };
    }
  });

  modal.present();
}

async function createFacilityGroup() {
  const modal = await modalController.create({
    component: CreateFacilityGroupModal
  });

  modal.onDidDismiss().then(() => fetchGroups());
  modal.present();
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}

main:has(ion-card) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
  align-items: start;
}
</style>
