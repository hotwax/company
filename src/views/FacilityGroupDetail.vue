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
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonReorder,
  IonReorderGroup,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue';
import { ref } from 'vue';
import { commonUtil, logger, translate } from "@common";
import { useFacilityStore } from '@/store/facility';
import { api } from '@common';
import { DateTime } from 'luxon';
import { addCircleOutline, arrowForwardOutline, removeCircleOutline, saveOutline } from 'ionicons/icons';
import EditFacilityGroupModal from '@/components/EditFacilityGroupModal.vue';

const props = defineProps<{ facilityGroupId: string }>();

const facilityStore = useFacilityStore();

const group = ref<any>({});
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
    loadAllFacilities()
  ]);
  await loadMemberFacilities();
  filterAvailableFacilities();
});

async function openEditModal() {
  const modal = await modalController.create({
    component: EditFacilityGroupModal,
    componentProps: { facilityGroup: group.value }
  });

  modal.onDidDismiss().then(({ data }: any) => {
    if (data?.updated) {
      group.value = { ...group.value, ...data.updated };
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
  let facilities: any[] = [];
  let pageIndex = 0, resp: any;
  try {
    do {
      resp = await api({ url: "oms/facilities", method: "get", params: { fieldsToSelect: "facilityId,facilityName", pageSize: 200, pageIndex } });
      if (!commonUtil.hasError(resp) && resp.data?.length) {
        facilities = facilities.concat(resp.data);
        pageIndex++;
      } else {
        break;
      }
    } while (resp.data?.length >= 200);
  } catch (err) {
    logger.error("Failed to load all facilities", err);
  }
  allFacilities.value = facilities;
}

async function loadMemberFacilities() {
  try {
    const members = await (facilityStore as any).fetchGroupFacilities(props.facilityGroupId);
    const facilityById = Object.fromEntries(allFacilities.value.map((f: any) => [f.facilityId, f]));
    memberFacilities.value = members.map((m: any) => ({
      ...m,
      facilityName: facilityById[m.facilityId]?.facilityName || m.facilityId
    }));
    selectedFacilities.value = JSON.parse(JSON.stringify(memberFacilities.value));
  } catch (err) {
    logger.error("Failed to load member facilities", err);
  }
}

function filterAvailableFacilities() {
  const selectedIds = new Set(selectedFacilities.value.map((f: any) => f.facilityId));
  let available = allFacilities.value.filter((f: any) => !selectedIds.has(f.facilityId));
  if (facilitySearch.value) {
    const q = facilitySearch.value.toLowerCase();
    available = available.filter((f: any) =>
      f.facilityId?.toLowerCase().includes(q) || f.facilityName?.toLowerCase().includes(q)
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
  const toAdd = filteredAvailableFacilities.value.map((f, i) => ({ ...f, sequenceNum: lastSeq + i + 1 }));
  selectedFacilities.value = [...selectedFacilities.value, ...toAdd];
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function removeFacility(facility: any) {
  selectedFacilities.value = selectedFacilities.value.filter((f: any) => f.facilityId !== facility.facilityId);
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function doReorder(event: CustomEvent) {
  const prev = JSON.parse(JSON.stringify(selectedFacilities.value));
  const updated = event.detail.complete(JSON.parse(JSON.stringify(selectedFacilities.value)));
  const prevSeqNums = prev.map((f: any) => f.sequenceNum);
  updated.forEach((f: any, i: number) => { f.sequenceNum = prevSeqNums[i]; });
  selectedFacilities.value = updated;
  isFacilitiesModified.value = true;
}

async function saveFacilityMemberships() {
  isSaving.value = true;
  const memberIds = new Set(memberFacilities.value.map((f: any) => f.facilityId));
  const selectedIds = new Set(selectedFacilities.value.map((f: any) => f.facilityId));
  const memberByFacilityId = Object.fromEntries(memberFacilities.value.map((f: any) => [f.facilityId, f]));

  const now = DateTime.now().toMillis();

  // new members to add
  const toCreate = selectedFacilities.value
    .filter((f: any) => !memberIds.has(f.facilityId))
    .map((f: any) => ({ facilityId: f.facilityId, fromDate: now, sequenceNum: f.sequenceNum }));

  // existing members to expire (removed) or resequence (reordered)
  const toStore = [
    ...memberFacilities.value
      .filter((f: any) => !selectedIds.has(f.facilityId))
      .map((f: any) => ({ facilityId: f.facilityId, fromDate: f.fromDate, thruDate: now })),
    ...selectedFacilities.value
      .filter((f: any) => memberIds.has(f.facilityId) && memberByFacilityId[f.facilityId]?.sequenceNum !== f.sequenceNum)
      .map((f: any) => ({ facilityId: f.facilityId, fromDate: memberByFacilityId[f.facilityId].fromDate, sequenceNum: f.sequenceNum }))
  ];

  const requests: Promise<any>[] = [];
  if (toCreate.length) {
    requests.push(api({ url: `oms/facilityGroups/${props.facilityGroupId}/facilities`, method: "post", data: toCreate }));
  }
  if (toStore.length) {
    requests.push(api({ url: `oms/facilityGroups/${props.facilityGroupId}/facilities`, method: "put", data: toStore }));
  }

  const results = await Promise.allSettled(requests);
  const anyFailed = results.some((r) => r.status === "rejected");

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
