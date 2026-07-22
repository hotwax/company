<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/facilities/groups" slot="start" />
        <ion-title>{{ group.facilityGroupName || facilityGroupId }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openEditModal()">
            {{ translate("Edit details") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <section class="group-meta">
        <ion-card>
          <ion-item lines="full">
            <ion-label class="ion-text-wrap">
              <p>{{ facilityGroupId }}</p>
              <p v-if="group.description">{{ group.description }}</p>
            </ion-label>
          </ion-item>
          <ion-item lines="full">
            <ion-label>{{ translate("Group type") }}</ion-label>
            <ion-note slot="end">{{ group.facilityGroupTypeId ? (getFacilityGroupTypeDescription(group.facilityGroupTypeId) || group.facilityGroupTypeId) : "-" }}</ion-note>
          </ion-item>
          <ion-item lines="none" button :detail="false" @click="openProductStoreModal()">
            <ion-label>{{ translate("Product stores") }}</ion-label>
            <ion-note slot="end">{{ productStoreCount ?? "-" }}</ion-note>
          </ion-item>
        </ion-card>
      </section>

      <div class="find">
        <section class="ion-padding-end search">
          <ion-searchbar
            :placeholder="translate('Search facilities')"
            v-model="facilitySearch"
            @ionInput="filterAvailableFacilities()"
          />
          <ion-list>
            <ion-list-header>
              <ion-label>{{ translate("Results") }} : {{ filteredAvailableFacilities.length }}</ion-label>
              <ion-button fill="clear" :disabled="!filteredAvailableFacilities.length" @click="addAll()">
                {{ translate("Include all") }}
                <ion-icon :icon="arrowForwardOutline" />
              </ion-button>
            </ion-list-header>
            <ion-item v-for="facility in filteredAvailableFacilities" :key="facility.facilityId">
              <ion-label>
                <p>{{ facility.facilityId }}</p>
                {{ facility.facilityName }}
              </ion-label>
              <ion-button slot="end" fill="clear" size="default" color="success" @click="addFacility(facility)">
                <ion-icon :icon="addCircleOutline" slot="icon-only" />
              </ion-button>
            </ion-item>
            <ion-item lines="none">
              <ion-label v-if="!filteredAvailableFacilities.length">
                {{ translate("No facilities available to select") }}
              </ion-label>
            </ion-item>
          </ion-list>
        </section>

        <main v-if="selectedFacilities.length">
          <h3 class="ion-margin-start">
            {{ translate("Total facilities selected for group", { total: selectedFacilities.length, facilityGroupName: group.facilityGroupName || facilityGroupId }) }}
          </h3>
          <ion-list>
            <ion-list-header>
              <ion-label>{{ translate("Manage sequence") }}</ion-label>
            </ion-list-header>
            <ion-reorder-group @ionItemReorder="doReorder($event)" :disabled="false">
              <ion-item v-for="facility in selectedFacilities" :key="facility.facilityId">
                <ion-button slot="start" fill="clear" size="default" color="danger" @click="removeFacility(facility)">
                  <ion-icon :icon="removeCircleOutline" slot="icon-only" />
                </ion-button>
                <ion-label>
                  <p>{{ facility.facilityId }}</p>
                  {{ facility.facilityName }}
                </ion-label>
                <ion-reorder slot="end" />
              </ion-item>
            </ion-reorder-group>
          </ion-list>
        </main>
        <main v-else>
          <p class="empty-state">{{ translate("No facilities selected.") }}</p>
        </main>
      </div>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button :disabled="!isFacilitiesModified" @click="saveFacilityMemberships()">
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonReorder,
  IonReorderGroup,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue';
import { computed, ref } from 'vue';
import { commonUtil, logger, translate } from "@common";
import { useFacilityStore } from '@/store/facility';
import { useUtilStore } from '@/store/util';
import { api } from '@common';
import { DateTime } from 'luxon';
import { addCircleOutline, arrowForwardOutline, removeCircleOutline, saveOutline } from 'ionicons/icons';
import EditFacilityGroupModal from '@/components/EditFacilityGroupModal.vue';
import AddProductStoreToGroupModal from '@/components/AddProductStoreToGroupModal.vue';

const props = defineProps<{ facilityGroupId: string }>();

const facilityStore = useFacilityStore();
const utilStore = useUtilStore();

const facilityGroupTypes = computed(() => facilityStore.getFacilityGroupTypes);

const group = ref<any>({});
const productStoreCount = ref<number | null>(null);
const allFacilities = ref<any[]>([]);
const memberFacilities = ref<any[]>([]);
const selectedFacilities = ref<any[]>([]);
const filteredAvailableFacilities = ref<any[]>([]);
const facilitySearch = ref("");
const isFacilitiesModified = ref(false);
const isSaving = ref(false);

onIonViewWillEnter(async () => {
  isSaving.value = false;
  facilitySearch.value = "";
  await Promise.all([
    facilityStore.fetchFacilityGroupTypes(),
    loadGroup(),
    loadAllFacilities(),
    loadProductStoreCount()
  ]);
  await loadMemberFacilities();
  filterAvailableFacilities();
});

function getFacilityGroupTypeDescription(facilityGroupTypeId: string) {
  return facilityGroupTypes.value.find((type: any) => type.facilityGroupTypeId === facilityGroupTypeId)?.description;
}

async function loadProductStoreCount() {
  try {
    const resp = await api({
      url: "oms/groupProductStores",
      method: "get",
      params: { facilityGroupId: props.facilityGroupId, filterByDate: "Y", pageNoLimit: true }
    });
    productStoreCount.value = (!commonUtil.hasError(resp) && resp.data?.length) ? resp.data.length : 0;
  } catch (err) {
    logger.error("Failed to fetch group product stores", err);
  }
}

async function openProductStoreModal() {
  const modal = await modalController.create({
    component: AddProductStoreToGroupModal,
    componentProps: { facilityGroup: group.value }
  });

  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.updatedCount !== undefined) productStoreCount.value = data.updatedCount;
  });

  modal.present();
}

async function openEditModal() {
  const modal = await modalController.create({
    component: EditFacilityGroupModal,
    componentProps: { facilityGroup: group.value }
  });

  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.updated) {
      group.value = { ...group.value, ...data.updated };
      utilStore.patchFacilityGroup(props.facilityGroupId, data.updated);
    }
  });

  modal.present();
}

async function loadGroup() {
  try {
    const resp = await facilityStore.fetchFacilityGroup(props.facilityGroupId);
    if (!commonUtil.hasError(resp)) {
      group.value = resp.data || {};
    }
  } catch (err) {
    logger.error("Failed to fetch facility group", err);
  }
}

async function loadAllFacilities() {
  // Physical facilities come from the shared, login-time cache instead of a
  // paged oms/facilities sweep.
  if (!utilStore.facilities.length) await utilStore.fetchFacilities();
  allFacilities.value = utilStore.getFacilities;
}

async function loadMemberFacilities() {
  try {
    const members = await (facilityStore as any).fetchGroupFacilities(props.facilityGroupId);
    const facilityById = Object.fromEntries(allFacilities.value.map((facility: any) => [facility.facilityId, facility]));
    memberFacilities.value = members.map((member: any) => ({
      ...member,
      facilityName: facilityById[member.facilityId]?.facilityName || member.facilityId
    }));
    selectedFacilities.value = JSON.parse(JSON.stringify(memberFacilities.value));
  } catch (err) {
    logger.error("Failed to load member facilities", err);
  }
}

function filterAvailableFacilities() {
  const selectedIds = new Set(selectedFacilities.value.map((facility: any) => facility.facilityId));
  let available = allFacilities.value.filter((facility: any) => !selectedIds.has(facility.facilityId));
  if (facilitySearch.value) {
    const q = facilitySearch.value.toLowerCase();
    available = available.filter((facility: any) =>
      facility.facilityId?.toLowerCase().includes(q) || facility.facilityName?.toLowerCase().includes(q)
    );
  }
  filteredAvailableFacilities.value = available;
}

function addFacility(facility: any) {
  const lastSeq = selectedFacilities.value.at(-1)?.sequenceNum || 0;
  selectedFacilities.value = [...selectedFacilities.value, { ...facility, sequenceNum: lastSeq + 1 }];
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function addAll() {
  const lastSeq = selectedFacilities.value.at(-1)?.sequenceNum || 0;
  const toAdd = filteredAvailableFacilities.value.map((facility, index) => ({ ...facility, sequenceNum: lastSeq + index + 1 }));
  selectedFacilities.value = [...selectedFacilities.value, ...toAdd];
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function removeFacility(facility: any) {
  selectedFacilities.value = selectedFacilities.value.filter((item: any) => item.facilityId !== facility.facilityId);
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function doReorder(event: CustomEvent) {
  const prev = JSON.parse(JSON.stringify(selectedFacilities.value));
  const updated = event.detail.complete(JSON.parse(JSON.stringify(selectedFacilities.value)));
  const prevSeqNums = prev.map((facility: any) => facility.sequenceNum);
  updated.forEach((facility: any, index: number) => { facility.sequenceNum = prevSeqNums[index]; });
  selectedFacilities.value = updated;
  isFacilitiesModified.value = true;
}

async function saveFacilityMemberships() {
  isSaving.value = true;
  const memberIds = new Set(memberFacilities.value.map((facility: any) => facility.facilityId));
  const selectedIds = new Set(selectedFacilities.value.map((facility: any) => facility.facilityId));
  const memberByFacilityId = Object.fromEntries(memberFacilities.value.map((facility: any) => [facility.facilityId, facility]));

  const now = DateTime.now().toMillis();

  // new members to add
  const toCreate = selectedFacilities.value
    .filter((facility: any) => !memberIds.has(facility.facilityId))
    .map((facility: any) => ({ facilityId: facility.facilityId, fromDate: now, sequenceNum: facility.sequenceNum }));

  // existing members to expire (removed) or resequence (reordered)
  const toStore = [
    ...memberFacilities.value
      .filter((facility: any) => !selectedIds.has(facility.facilityId))
      .map((facility: any) => ({ facilityId: facility.facilityId, fromDate: facility.fromDate, thruDate: now })),
    ...selectedFacilities.value
      .filter((facility: any) => memberIds.has(facility.facilityId) && memberByFacilityId[facility.facilityId]?.sequenceNum !== facility.sequenceNum)
      .map((facility: any) => ({ facilityId: facility.facilityId, fromDate: memberByFacilityId[facility.facilityId].fromDate, sequenceNum: facility.sequenceNum }))
  ];

  const requests: Promise<any>[] = [];
  if (toCreate.length) {
    requests.push(api({ url: `oms/facilityGroups/${props.facilityGroupId}/facilities`, method: "post", data: toCreate }));
  }
  if (toStore.length) {
    requests.push(api({ url: `oms/facilityGroups/${props.facilityGroupId}/facilities`, method: "put", data: toStore }));
  }

  const results = await Promise.allSettled(requests);
  const anyFailed = results.some((result) => result.status === "rejected");

  if (anyFailed) {
    commonUtil.showToast(translate("Failed to update some facilities"));
  } else {
    commonUtil.showToast(translate("Facilities updated"));
    isFacilitiesModified.value = false;
    await loadMemberFacilities();
  }
  isSaving.value = false;
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
