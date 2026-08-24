<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/facilities/groups" slot="start" />
        <ion-title>{{ translate("Group details") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <section class="group-meta">
        <ion-card>
          <ion-card-header>
            <div class="card-header-row">
              <div>
                <ion-card-title>{{ group.facilityGroupName || facilityGroupId }}</ion-card-title>
                <ion-card-subtitle>{{ facilityGroupId }}</ion-card-subtitle>
              </div>
              <ion-button fill="clear" @click="openEditModal()">
                {{ translate("Edit details") }}
              </ion-button>
            </div>
          </ion-card-header>
          <ion-item v-if="group.description" lines="full">
            <ion-label class="ion-text-wrap">{{ group.description }}</ion-label>
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
        <ion-fab-button :disabled="!isFacilitiesModified || isSaving" @click="saveFacilityMemberships()">
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>

      <ion-modal :is-open="showEditModal" @didDismiss="closeEditModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeEditModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Edit group") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <form @keyup.enter="saveEditGroup">
            <ion-list>
              <ion-item>
                <ion-input
                  label-placement="floating"
                  :label="translate('Name')"
                  v-model="formData.facilityGroupName"
                />
              </ion-item>
              <ion-item>
                <ion-input
                  label-placement="floating"
                  :label="translate('Internal ID')"
                  :value="group.facilityGroupId"
                  readonly
                />
              </ion-item>
              <ion-item lines="none">
                <ion-select
                  :label="translate('Group type')"
                  interface="popover"
                  v-model="formData.facilityGroupTypeId"
                >
                  <ion-select-option value="">{{ translate("None") }}</ion-select-option>
                  <ion-select-option
                    v-for="type in facilityGroupTypeOptions"
                    :key="type.facilityGroupTypeId"
                    :value="type.facilityGroupTypeId"
                  >
                    {{ type.description || type.facilityGroupTypeId }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none">
                <ion-textarea
                  :label="translate('Description')"
                  label-placement="floating"
                  :auto-grow="true"
                  :counter="true"
                  :maxlength="255"
                  v-model="formData.description"
                />
              </ion-item>
            </ion-list>

            <ion-fab vertical="bottom" horizontal="end" slot="fixed">
              <ion-fab-button @click="saveEditGroup" @keyup.enter.stop>
                <ion-icon :icon="saveOutline" />
              </ion-fab-button>
            </ion-fab>
          </form>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showProductStoreModal" @didDismiss="closeProductStoreModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeProductStoreModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Product stores") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list>
            <ion-item
              v-for="productStore in productStores"
              :key="productStore.productStoreId"
              @click="toggleSelection(productStore)"
            >
              <ion-checkbox :checked="isSelected(productStore.productStoreId)">
                <ion-label>
                  {{ productStore.storeName || productStore.productStoreId }}
                  <p>{{ productStore.productStoreId }}</p>
                </ion-label>
              </ion-checkbox>
            </ion-item>
            <ion-item v-if="!productStoresHydrated" lines="none">
              <ion-label><ion-skeleton-text animated style="width: 45%" /></ion-label>
            </ion-item>
            <!-- Only assert "none" once the seed sync has finished. -->
            <ion-item v-else-if="!productStores.length" lines="none">
              <ion-label>{{ translate("No product stores found") }}</ion-label>
            </ion-item>
          </ion-list>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button :disabled="!isModified" @click="saveProductStores()">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonPage,
  IonReorder,
  IonReorderGroup,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
  IonSkeletonText,
} from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { commonUtil, logger, translate } from "@common";
import { useFacilities, useFacilityGroupMutations, useFacilityGroupProductStores, useFacilityGroupRecord, useFacilityGroupTypeOptions, useFacilityGroupTypes, useGroupFacilities } from '@/composables/useFacilities';
import { useProductStores } from '@/composables/useProductStores';
import { renumberSequence, sortMembersBySequence } from '@/utils/facilityGroupSequence';
import { api } from '@common';
import { DateTime } from 'luxon';
import { addCircleOutline, arrowForwardOutline, closeOutline, removeCircleOutline, saveOutline } from 'ionicons/icons';

const props = defineProps<{ facilityGroupId: string }>();

const groupMutations = useFacilityGroupMutations(props.facilityGroupId);

// All three lists come from the login-time cache — nothing to fetch on entry.
// `facilityGroupTypes` describes what the instance has, so it answers "what is this group's type?";
// the edit picker needs `facilityGroupTypeOptions`, which also offers types no group carries yet.
const { facilityGroupTypes } = useFacilityGroupTypes();
const { facilityGroupTypeOptions } = useFacilityGroupTypeOptions();
const { productStores, hydrated: productStoresHydrated } = useProductStores();
// The group, its members and its product-store links are ALL cached domains — this screen makes no
// requests. Mutations refresh those domains, so the cache is the current state, not a stale copy.
const { record: cachedGroup } = useFacilityGroupRecord(props.facilityGroupId);
const { members: cachedMembers, hydrated: membersHydrated } = useGroupFacilities(props.facilityGroupId);
const { associations: cachedGroupProductStores } = useFacilityGroupProductStores(props.facilityGroupId);
const { facilities: cachedFacilities } = useFacilities();

// Derived, not copied: the cache emits asynchronously, so a one-shot read on view-enter sees an
// empty table and never updates. These recompute on every cache write.
const group = computed<any>(() => (cachedGroup.value as any)?.raw ?? cachedGroup.value ?? {});
const productStoreCount = computed(() => cachedGroupProductStores.value.length);
const allFacilities = computed<any[]>(() => cachedFacilities.value ?? []);
// Sorted, not merely joined: the cache hands these back in primary-key order (alphabetical by
// facilityId), which is unrelated to the sequence the group actually applies. Rendering that raw
// order is what made "Manage sequence" show — and then save — the wrong order.
const memberFacilities = computed<any[]>(() => {
  const byId = Object.fromEntries(allFacilities.value.map((f: any) => [f.facilityId, f]));
  return sortMembersBySequence((cachedMembers.value ?? []).map((m: any) => ({
    ...m,
    facilityName: byId[m.facilityId]?.facilityName || m.facilityId,
  })));
});
const selectedFacilities = ref<any[]>([]);
const filteredAvailableFacilities = ref<any[]>([]);
const facilitySearch = ref("");
const isFacilitiesModified = ref(false);
const isSaving = ref(false);

// Edit facility group modal
const showEditModal = ref(false);
const formData = ref({
  facilityGroupName: "",
  facilityGroupTypeId: "",
  description: ""
});

// Add product stores to group modal
const showProductStoreModal = ref(false);
const currentAssociations = ref<any[]>([]);
const selectedProductStoreIds = ref<Set<string>>(new Set());
const isModified = computed(() => {
  const currentIds = new Set(currentAssociations.value.map((a: any) => a.productStoreId));
  if (currentIds.size !== selectedProductStoreIds.value.size) return true;
  for (const id of selectedProductStoreIds.value) if (!currentIds.has(id)) return true;
  return false;
});

onIonViewWillEnter(async () => {
  isSaving.value = false;
  facilitySearch.value = "";
  seedSelection();
  filterAvailableFacilities();
});

function getFacilityGroupTypeDescription(facilityGroupTypeId: string) {
  return facilityGroupTypes.value.find((type: any) => type.facilityGroupTypeId === facilityGroupTypeId)?.description;
}



async function openProductStoreModal() {
  currentAssociations.value = [];
  selectedProductStoreIds.value = new Set();
  showProductStoreModal.value = true;
  fetchCurrentAssociations();
}

function fetchCurrentAssociations() {
  try {
    const rows = cachedGroupProductStores.value ?? [];
    if (rows.length) {
      currentAssociations.value = rows;
      selectedProductStoreIds.value = new Set(rows.map((a: any) => a.productStoreId));
    } else {
      currentAssociations.value = [];
      selectedProductStoreIds.value = new Set();
    }
  } catch (err) {
    logger.error("Failed to fetch group product stores", err);
  }
}

function isSelected(productStoreId: string) {
  return selectedProductStoreIds.value.has(productStoreId);
}

function toggleSelection(store: any) {
  const next = new Set(selectedProductStoreIds.value);
  if (next.has(store.productStoreId)) {
    next.delete(store.productStoreId);
  } else {
    next.add(store.productStoreId);
  }
  selectedProductStoreIds.value = next;
}

function closeProductStoreModal() {
  showProductStoreModal.value = false;
}

async function saveProductStores() {
  const currentIds = new Set(currentAssociations.value.map((a: any) => a.productStoreId));
  const associationByStoreId = Object.fromEntries(currentAssociations.value.map((a: any) => [a.productStoreId, a]));

  const toAdd = [...selectedProductStoreIds.value].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !selectedProductStoreIds.value.has(id));

  // The composable owns both directions (a removal is a POST closing the row with a thruDate) and
  // refreshes the cached associations afterwards.
  const { failed: anyFailed } = await groupMutations.saveProductStores(
    toAdd,
    toRemove.map((productStoreId) => ({ productStoreId, fromDate: associationByStoreId[productStoreId].fromDate })),
  );

  if (anyFailed) {
    commonUtil.showToast(translate("Failed to update some product store associations"));
  } else {
    commonUtil.showToast(translate("Product stores updated"));
  }

  // No optimistic patch: `saveProductStores` refreshes the cached domain and the count is derived.
  closeProductStoreModal();
}

function openEditModal() {
  formData.value = {
    facilityGroupName: group.value.facilityGroupName || "",
    facilityGroupTypeId: group.value.facilityGroupTypeId || "",
    description: group.value.description || ""
  };
  showEditModal.value = true;
}

function closeEditModal() {
  showEditModal.value = false;
}

async function saveEditGroup() {
  if (!formData.value.facilityGroupName?.trim()) {
    commonUtil.showToast(translate("Please fill all the required fields"));
    return;
  }

  try {
    const resp = await groupMutations.updateGroup({ ...formData.value });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Group details updated"));
      // The cache refresh inside the composable is what updates the group lists. The local `group`
      // No optimistic patch: `updateGroup` re-snapshots the facilityGroup domain and `group` is
      // derived from that cache, so the edit shows up on its own.
      closeEditModal();
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error("Failed to update group details", err);
    commonUtil.showToast(translate("Failed to update group details"));
  }
}





/** Reset the edit selection to what is currently stored. */
function seedSelection() {
  selectedFacilities.value = JSON.parse(JSON.stringify(memberFacilities.value));
  filterAvailableFacilities();
}

// Members arrive asynchronously and change after every save, so reseed on each emit — but NOT over
// edits that have not been saved yet. A background sync landing mid-edit would otherwise discard
// the user's staged adds, removals and drag order with no warning. `saveFacilityMemberships`
// clears the flag before its refresh emits, so the post-save reseed still runs.
watch(memberFacilities, () => {
  if (!isFacilitiesModified.value) seedSelection();
}, { immediate: true });

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

// Additions land at the end of the arranged list and take their number from that position when the
// save renumbers. They must NOT pick a number here: over a group with unsequenced members, any
// number sorts the new facility ABOVE them (unsequenced ranks last), so a facility added at the
// bottom of the list reappeared at the top after saving.
function addFacility(facility: any) {
  selectedFacilities.value = [...selectedFacilities.value, { ...facility }];
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function addAll() {
  selectedFacilities.value = [...selectedFacilities.value, ...filteredAvailableFacilities.value.map((facility) => ({ ...facility }))];
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function removeFacility(facility: any) {
  selectedFacilities.value = selectedFacilities.value.filter((item: any) => item.facilityId !== facility.facilityId);
  filterAvailableFacilities();
  isFacilitiesModified.value = true;
}

function doReorder(event: CustomEvent) {
  selectedFacilities.value = event.detail.complete(JSON.parse(JSON.stringify(selectedFacilities.value)));
  isFacilitiesModified.value = true;
}

async function saveFacilityMemberships() {
  // Everything below is a DIFF against the cached membership, so saving before that cache has
  // hydrated reads "this group has no members" and turns every existing member into an addition —
  // a second active row for each, which is the duplicate-members bug. An unhydrated cache is not
  // an empty group, so refuse rather than guess.
  if (!membersHydrated.value) {
    commonUtil.showToast(translate("Facilities are still loading, please try again"));
    return;
  }
  if (isSaving.value) return; // a second click before the first save lands re-posts every addition
  isSaving.value = true;
  const memberIds = new Set(memberFacilities.value.map((facility: any) => facility.facilityId));
  const selectedIds = new Set(selectedFacilities.value.map((facility: any) => facility.facilityId));
  const memberByFacilityId = Object.fromEntries(memberFacilities.value.map((facility: any) => [facility.facilityId, facility]));

  const now = DateTime.now().toMillis();

  // Number the arranged list 1..N and save THAT, so what was on screen is what gets stored.
  //
  // Renumbering here rather than per-gesture is what keeps the two in step. The screen renders the
  // arranged array, but a reload re-derives the order from the stored numbers, and any member left
  // unsequenced ranks last no matter where it was shown. Assigning explicit positions to the whole
  // list closes that gap for every edit — drag, add, remove — and heals the absent and duplicate
  // numbers already in the data. `sortMembersBySequence` then reproduces this exact order.
  const arranged = renumberSequence(selectedFacilities.value);

  // new members to add
  const toCreate = arranged
    .filter((facility: any) => !memberIds.has(facility.facilityId))
    .map((facility: any) => ({ facilityId: facility.facilityId, fromDate: now, sequenceNum: facility.sequenceNum }));

  // existing members to expire (removed) or resequence (reordered)
  const toStore = [
    ...memberFacilities.value
      .filter((facility: any) => !selectedIds.has(facility.facilityId))
      .map((facility: any) => ({ facilityId: facility.facilityId, fromDate: facility.fromDate, thruDate: now })),
    ...arranged
      .filter((facility: any) => memberIds.has(facility.facilityId) && memberByFacilityId[facility.facilityId]?.sequenceNum !== facility.sequenceNum)
      .map((facility: any) => ({ facilityId: facility.facilityId, fromDate: memberByFacilityId[facility.facilityId].fromDate, sequenceNum: facility.sequenceNum }))
  ];

  const { failed: anyFailed } = await groupMutations.saveMembers(toCreate, toStore);

  if (anyFailed) {
    commonUtil.showToast(translate("Failed to update some facilities"));
  } else {
    commonUtil.showToast(translate("Facilities updated"));
    isFacilitiesModified.value = false;
    seedSelection();
  }
  isSaving.value = false;
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
