<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Groups") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <SearchFilterCard
        v-model="searchText"
        :placeholder="translate('Search groups')"
        :show-clear="false"
        @search="updateQuery()"
        @clear="clearFilters()"
      >
        <UniformFilterLayout @clear="clearFilters()">
          <ion-select :label="translate('Type')" label-placement="stacked" fill="outline" interface="popover" v-model="selectedGroupTypeId">
            <ion-select-option value="">{{ translate("All") }}</ion-select-option>
            <ion-select-option :value="groupType.facilityGroupTypeId" :key="groupType.facilityGroupTypeId" v-for="groupType in facilityGroupTypes">{{ groupType.description || groupType.facilityGroupTypeId }}</ion-select-option>
          </ion-select>
        </UniformFilterLayout>
      </SearchFilterCard>

      <main v-if="!hydrated">
        <ion-card v-for="n in 3" :key="`sk-${n}`">
          <ion-item lines="none"><ion-label><ion-skeleton-text animated style="width: 60%" /></ion-label></ion-item>
        </ion-card>
      </main>
      <main v-else-if="displayedGroups.length">
        <ion-card v-for="group in displayedGroups" :key="group.facilityGroupId">
          <ion-item lines="full">
            <ion-label class="ion-text-wrap">
              <p>{{ group.facilityGroupId }}</p>
              <h1>{{ group.facilityGroupName }}</h1>
              <p>{{ group.description }}</p>
            </ion-label>
          </ion-item>
          <ion-item lines="full">
            <ion-label>{{ translate("Group type") }}</ion-label>
            <ion-note slot="end">{{ group.facilityGroupTypeId ? (getFacilityGroupTypeDescription(group.facilityGroupTypeId) || group.facilityGroupTypeId) : "-" }}</ion-note>
          </ion-item>
          <ion-item lines="full">
            <ion-label>{{ translate("Product stores") }}</ion-label>
            <ion-note slot="end">{{ group.productStoreCount ?? "-" }}</ion-note>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Facilities") }}</ion-label>
            <ion-note slot="end">{{ group.facilityCount ?? "-" }}</ion-note>
          </ion-item>
          <ion-button fill="clear" @click="viewGroupDetail(group)">
            {{ translate("Edit group") }}
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
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue';
import { computed, ref } from 'vue';
import { translate } from "@common";
import { useFacilityGroups, useFacilityGroupTypes } from '@/composables/useFacilities';
import { resyncDomain } from '@/services/appCacheBootstrap';
import CreateFacilityGroupModal from '@/components/facility/CreateFacilityGroupModal.vue';
import SearchFilterCard from '@/components/common/SearchFilterCard.vue';
import UniformFilterLayout from '@/components/common/UniformFilterLayout.vue';
import router from '@/router';
import { customSort } from '@/utils';
import { addOutline } from 'ionicons/icons';

// No store: groups (with member counts folded in) and group types both come from the cache,
// so search and type filtering happen locally over the complete set.
const { facilityGroups: groups, hydrated } = useFacilityGroups();
const { facilityGroupTypes } = useFacilityGroupTypes();

const searchText = ref("");
const selectedGroupTypeId = ref("");

const displayedGroups = computed(() => {
  const term = searchText.value.trim().toLowerCase();
  const filtered = groups.value.filter((group: any) => {
    if (selectedGroupTypeId.value && group.facilityGroupTypeId !== selectedGroupTypeId.value) return false;
    if (!term) return true;
    return `${group.facilityGroupId ?? ""} ${group.facilityGroupName ?? ""}`.toLowerCase().includes(term);
  });
  return customSort(filtered, ['OMS_FULFILLMENT', 'PICKUP'], 'facilityGroupId');
});

// Nothing to fetch on entry: the cache is already populated and `displayedGroups` filters it
// reactively, so typing in the search box needs no handler either.
function updateQuery() {
  // no-op: `searchText` feeds `displayedGroups` directly
}

async function clearFilters() {
  searchText.value = "";
  selectedGroupTypeId.value = "";
}

function getFacilityGroupTypeDescription(facilityGroupTypeId: string) {
  return facilityGroupTypes.value.find((t: any) => t.facilityGroupTypeId === facilityGroupTypeId)?.description;
}

function viewGroupDetail(group: any) {
  router.push({ path: `/facility-group-detail/${group.facilityGroupId}` });
}

async function createFacilityGroup() {
  const modal = await modalController.create({
    component: CreateFacilityGroupModal
  });

  // A newly created group isn't in the login-time cache yet, so resync that domain — the cached
  // list (and every page reading it) then picks the new group up via liveQuery.
  modal.onDidDismiss().then(async ({ data }) => {
    if (data) await resyncDomain("facilityGroup");
  });
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
