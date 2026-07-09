<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Groups") }}</ion-title>
        <ion-segment slot="end" v-model="segment" @ionChange="resetParentGroupPage()">
          <ion-segment-button value="facility-groups">
            <ion-label>{{ translate("Facility groups") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="facility-group-types">
            <ion-label>{{ translate("Parent group associations") }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="segment === 'facility-groups'" class="find">
        <section class="search">
          <ion-searchbar :placeholder="translate('Search groups')" v-model="query.queryString" @keyup.enter="updateQuery()" />
        </section>
      </div>
      <template v-if="segment === 'facility-groups'">
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
      </template>

      <template v-else>
        <div class="facility-group-types">
          <section>
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Parent groups") }}</ion-card-title>
              </ion-card-header>
              <ion-item
                v-for="groupType in facilityGroupTypes"
                :key="groupType.facilityGroupTypeId"
                button
                detail
                @click="setCurrentFacilityGroupType(groupType.facilityGroupTypeId)"
              >
                <ion-label :color="groupType.facilityGroupTypeId === currentFacilityGroupTypeId ? 'primary' : ''">
                  {{ groupType.description || groupType.facilityGroupTypeId }}
                </ion-label>
                <ion-note slot="end">{{ getAssociatedGroupIds(groupType.facilityGroupTypeId).length }}</ion-note>
              </ion-item>
            </ion-card>
          </section>

          <div class="facility-group-type-details" v-show="currentFacilityGroupTypeId">
            <h3>{{ getFacilityGroupTypeDescription(currentFacilityGroupTypeId) }}</h3>
            <ion-list v-if="groups.length">
              <ion-list-header>
                <ion-label>{{ translate("Selected groups") }} : {{ getAssociatedGroupIds(currentFacilityGroupTypeId).length }}</ion-label>
              </ion-list-header>
              <ion-item
                v-for="group in groups"
                :key="group.facilityGroupId"
                @click.stop="toggleGroupType(group)"
              >
                <ion-checkbox
                  label-placement="end"
                  justify="start"
                  :disabled="!!group.facilityGroupTypeId && group.facilityGroupTypeId !== currentFacilityGroupTypeId"
                  :modelValue="isFacilityGroupLinked(group.facilityGroupTypeId)"
                >
                  <ion-label>
                    {{ group.facilityGroupName }}
                    <p>{{ group.facilityGroupId }}</p>
                  </ion-label>
                </ion-checkbox>
                <ion-note slot="end">{{ group.facilityCount }}</ion-note>
              </ion-item>
            </ion-list>
            <div v-else>
              <p class="empty-state">{{ translate("No groups found") }}</p>
            </div>
          </div>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  createAnimation,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue';
import { computed, ref } from 'vue';
import { commonUtil, logger, translate } from "@common";
import { useFacilityStore } from '@/store/facility';
import EditFacilityGroupModal from '@/components/EditFacilityGroupModal.vue';
import GroupTypeModal from '@/components/GroupTypeModal.vue';
import AddProductStoreToGroupModal from '@/components/AddProductStoreToGroupModal.vue';
import CreateFacilityGroupModal from '@/components/CreateFacilityGroupModal.vue';
import router from '@/router';
import { addOutline } from 'ionicons/icons';

const facilityStore = useFacilityStore();

const groups = computed(() => (facilityStore as any).getGroups);
const query = computed(() => (facilityStore as any).getGroupQuery);
const facilityGroupTypes = computed(() => (facilityStore as any).getFacilityGroupTypes ?? facilityStore.facilityGroupTypes);

const segment = ref("facility-groups");
const currentFacilityGroupTypeId = ref("");
const isParentGroupDetailAnimationCompleted = ref(false);

onIonViewWillEnter(async () => {
  segment.value = "facility-groups";
  currentFacilityGroupTypeId.value = "";
  isParentGroupDetailAnimationCompleted.value = false;
  await (facilityStore as any).fetchFacilityGroupTypes();
  await fetchGroups();
});

async function fetchGroups() {
  await (facilityStore as any).fetchFacilityGroupsWithSearch();
}

async function updateQuery() {
  (facilityStore as any).updateGroupQuery(query.value);
  await fetchGroups();
}

async function resetParentGroupPage() {
  if (segment.value === 'facility-groups') {
    currentFacilityGroupTypeId.value = '';
    isParentGroupDetailAnimationCompleted.value = false;
  } else {
    (facilityStore as any).updateGroupQuery({ queryString: '' });
    await fetchGroups();
  }
}

function setCurrentFacilityGroupType(facilityGroupTypeId: string) {
  currentFacilityGroupTypeId.value = facilityGroupTypeId;
  if (!isParentGroupDetailAnimationCompleted.value) {
    playAnimation();
    isParentGroupDetailAnimationCompleted.value = true;
  }
}

function isFacilityGroupLinked(facilityGroupTypeId: string) {
  return currentFacilityGroupTypeId.value === facilityGroupTypeId;
}

function getAssociatedGroupIds(facilityGroupTypeId: string) {
  return groups.value.filter((g: any) => g.facilityGroupTypeId === facilityGroupTypeId);
}

async function toggleGroupType(group: any) {
  if (group.facilityGroupTypeId && group.facilityGroupTypeId !== currentFacilityGroupTypeId.value) return;
  const isChecked = !isFacilityGroupLinked(group.facilityGroupTypeId);
  try {
    const resp = await (facilityStore as any).updateFacilityGroup({
      facilityGroupId: group.facilityGroupId,
      facilityGroupTypeId: isChecked ? currentFacilityGroupTypeId.value : ''
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate(isChecked ? "Group associated to parent group." : "Group removed from parent group."));
      const idx = facilityStore.groups.findIndex((g: any) => g.facilityGroupId === group.facilityGroupId);
      if (idx !== -1) facilityStore.groups[idx] = { ...facilityStore.groups[idx], facilityGroupTypeId: isChecked ? currentFacilityGroupTypeId.value : '' };
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error("Failed to update group type association", err);
    commonUtil.showToast(translate(isChecked ? "Failed to associate group to parent group." : "Failed to remove group from parent group."));
  }
}

function playAnimation() {
  const typeDetails = document.querySelector('.facility-group-type-details') as Element;
  const groupTypes = document.querySelector('.facility-group-types') as Element;
  if (!typeDetails || !groupTypes) return;

  const revealAnimation = createAnimation()
    .addElement(typeDetails)
    .duration(1500)
    .easing('ease')
    .keyframes([
      { offset: 0, flex: '0', opacity: '0' },
      { offset: 0.5, flex: '1', opacity: '0' },
      { offset: 1, flex: '1', opacity: '1' }
    ]);

  const gapAnimation = createAnimation()
    .addElement(groupTypes)
    .duration(500)
    .fromTo('gap', '0', 'var(--spacer-2xl)');

  createAnimation().addAnimation([gapAnimation, revealAnimation]).play();
}

function getFacilityGroupTypeDescription(facilityGroupTypeId: string) {
  return facilityGroupTypes.value.find((t: any) => t.facilityGroupTypeId === facilityGroupTypeId)?.description;
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

.find {
  max-width: 50%;
}

main:has(ion-card) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
  align-items: start;
}

.facility-group-types {
  display: flex;
  justify-content: center;
  align-items: start;
  max-width: 990px;
  margin: var(--spacer-base) auto 0;
}

.facility-group-types > section {
  display: grid;
  grid-template-columns: minmax(400px, 1fr);
  max-width: 50ch;
}

.facility-group-type-details {
  flex: 1 0 355px;
  position: sticky;
  top: var(--spacer-lg);
}

@media (min-width: 991px) {
  .facility-group-type-details {
    width: 0;
    opacity: 0;
  }
}
</style>
