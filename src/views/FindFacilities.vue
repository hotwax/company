<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Find Facilities") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <SearchFilterCard
        v-model="searchText"
        :placeholder="translate('Search facilities')"
        :show-clear="false"
        @update:model-value="onSearchInput()"
        @search="flushSearch()"
        @clear="clearFilters()"
      >
        <UniformFilterLayout @clear="clearFilters()">
          <ion-select :label="translate('Product Store')" label-placement="stacked" fill="outline" interface="popover" v-model="query.productStoreId" @ionChange="updateQuery()">
            <ion-select-option value="">{{ translate("All") }}</ion-select-option>
            <ion-select-option :value="productStore.productStoreId" :key="productStore.productStoreId" v-for="productStore in productStores">{{ productStore.storeName ? productStore.storeName : productStore.productStoreId }}</ion-select-option>
          </ion-select>
          <ion-select :label="translate('Type')" label-placement="stacked" fill="outline" interface="popover" v-model="query.facilityTypeId" @ionChange="updateQuery()">
            <ion-select-option value="">{{ translate("All") }}</ion-select-option>
            <ion-select-option :value="facilityType.facilityTypeId" :key="facilityType.facilityTypeId" v-for="facilityType in facilityTypes">{{ facilityType.description ? facilityType.description : facilityType.facilityTypeId }}</ion-select-option>
          </ion-select>
          <ion-select :label="translate('Group')" label-placement="stacked" fill="outline" interface="popover" v-model="query.facilityGroupId" @ionChange="updateQuery()">
            <ion-select-option value="">{{ translate("All") }}</ion-select-option>
            <ion-select-option :value="facilityGroup.facilityGroupId" :key="facilityGroup.facilityGroupId" v-for="facilityGroup in facilityGroups">{{ facilityGroup.facilityGroupName ? facilityGroup.facilityGroupName : facilityGroup.facilityGroupId }}</ion-select-option>
          </ion-select>
        </UniformFilterLayout>
      </SearchFilterCard>
      <ion-list-header v-if="facilities?.length" class="facility-results-header">
        <span class="facility-results-header-start">
          <ion-checkbox
            v-if="selectMode"
            :checked="allVisibleSelected"
            :indeterminate="someVisibleSelected && !allVisibleSelected"
            :aria-label="translate('Select all')"
            @ionChange="toggleVisibleSelection(Boolean($event.detail.checked))"
          />
        </span>
        <ion-label>{{ facilities.length }} / {{ filteredFacilities.length }} {{ translate("facilities") }}</ion-label>
        <ion-button fill="clear" size="small" @click="toggleSelectMode()">
          {{ selectMode ? translate('Done') : translate('Select') }}
        </ion-button>
      </ion-list-header>
      <!-- While the login seed is still running the cache is legitimately empty; showing the
           "No facilities found" branch then would be wrong. -->
      <main v-if="!hydrated">
        <ion-item v-for="n in 6" :key="`sk-${n}`" lines="full">
          <ion-label><ion-skeleton-text animated style="width: 40%" /></ion-label>
        </ion-item>
      </main>
      <main v-else-if="facilities?.length">
        <div class="list-item" v-for="facility in facilities" :key="facility.facilityId" @click="selectMode ? toggleFacilitySelection(facility.facilityId) : viewFacilityDetails(facility.facilityId)">
          <ion-item lines="none">
            <ion-checkbox
              v-if="selectMode"
              slot="start"
              :checked="selectedFacilityIds.includes(facility.facilityId)"
              :aria-label="translate('Select facility')"
              @click.stop="toggleFacilitySelection(facility.facilityId)"
            />
            <ion-icon v-else slot="start" :icon="businessOutline" />
            <ion-label class="ion-text-wrap">
              {{ facility.facilityName }}
              <p>{{ facility.facilityId }}</p>
            </ion-label>
          </ion-item>

          <div class="tablet" @click.stop="">
            <ion-skeleton-text v-if="!facility.isEnriched" animated style="width: 100px; height: 24px;" />
            <template v-else>
              <ion-chip
                outline
                :id="inventoryGroups.length > 1 ? 'sell-online-trigger-' + facility.facilityId : undefined"
                @click="inventoryGroups.length === 1 && toggleSingleInventoryGroup(facility)"
              >
                <ion-label>{{ translate('Sell Online') }}</ion-label>
                <ion-icon :icon="shareOutline" :color="facility.sellOnline ? 'primary' : ''" />
              </ion-chip>
              <ion-popover v-if="inventoryGroups.length > 1" :trigger="'sell-online-trigger-' + facility.facilityId" :dismiss-on-select="false">
                <ion-content>
                  <ion-list>
                    <ion-list-header>{{ translate("Sell Online") }}</ion-list-header>
                    <ion-item v-for="group in getAssociatedInventoryGroups(facility)" :key="group.facilityGroupId">
                      <ion-checkbox label-placement="start" :checked="group.isChecked" @click.prevent="updateSellInventoryOnlineSetting($event, facility, group)">
                        {{ group.facilityGroupName ? group.facilityGroupName : group.facilityGroupId }}
                      </ion-checkbox>
                    </ion-item>
                  </ion-list>
                </ion-content>
              </ion-popover>
            </template>
          </div>

          <div class="tablet" @click.stop="">
            <ion-skeleton-text v-if="facility.orderLimitType === 'custom' && !facility.isEnriched" animated style="width: 100px; height: 24px;" />
            <template v-else>
              <ion-chip outline :id="'order-limit-trigger-' + facility.facilityId">
                <ion-label v-if="facility.orderLimitType === 'custom'">{{ facility.orderCount }} / {{ facility.maximumOrderLimit }}</ion-label>
                <ion-label v-else-if="facility.orderLimitType === 'unlimited'">{{ translate("Unlimited orders") }}</ion-label>
                <ion-label v-else>{{ translate("No capacity") }}</ion-label>
                <ion-icon v-if="facility.orderLimitType === 'unlimited'" :icon="lockOpenOutline" />
                <ion-icon v-else-if="facility.orderLimitType === 'no-capacity'" :icon="lockClosedOutline" />
              </ion-chip>
              <ion-popover :trigger="'order-limit-trigger-' + facility.facilityId" @didDismiss="onOrderLimitPopoverDismiss($event, facility)">
                <ion-content>
                  <ion-list>
                    <ion-list-header>{{ translate("Fulfillment Capacity") }}</ion-list-header>
                    <ion-item button @click="selectOrderLimitType('unlimited', facility)">
                      <ion-icon slot="end" :icon="lockOpenOutline" />
                      {{ translate("Unlimited Capacity") }}
                    </ion-item>
                    <ion-item button @click="selectOrderLimitType('no-capacity', facility)">
                      {{ translate("No Capacity") }}
                      <ion-icon slot="end" :icon="lockClosedOutline" />
                    </ion-item>
                    <ion-item button lines="none" @click="selectOrderLimitType('custom', facility)">
                      {{ translate("Custom") }}
                    </ion-item>
                  </ion-list>
                </ion-content>
              </ion-popover>
            </template>
          </div>
        </div>
      </main>
      <main v-else>
        <p class="ion-text-center">{{ translate("No facilities found") }}</p>
      </main>

      <ion-infinite-scroll
        @ionInfinite="loadMoreFacilities($event)"
        threshold="100px"
        v-if="isScrollable"
      >
        <ion-infinite-scroll-content
          loading-spinner="crescent"
          :loading-text="translate('Loading')"
        />
      </ion-infinite-scroll>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button>
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
        <ion-fab-list side="top">
          <ion-fab-button @click="router.push('/create-facility?type=RETAIL_STORE')">
            <ion-icon :icon="storefrontOutline" />
          </ion-fab-button>
          <ion-fab-button @click="router.push('/create-facility?type=WAREHOUSE')">
            <ion-icon :icon="businessOutline" />
          </ion-fab-button>
        </ion-fab-list>
      </ion-fab>
    </ion-content>

    <ion-footer v-if="selectMode">
      <ion-toolbar>
        <ion-title size="small">{{ selectedFacilityIds.length }} {{ translate('selected') }}</ion-title>
        <ion-buttons slot="end" class="bulk-action-buttons">
          <ion-button :disabled="!selectedFacilityIds.length" @click="openBulkCapacityAlert()">{{ translate('Set fulfillment capacity') }}</ion-button>
          <ion-button :disabled="!selectedFacilityIds.length" @click="openBulkSellOnlineAlert()">{{ translate('Sell online') }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  useFacilities, useFacilityGroups, useFacilityTypes, useGroupMembershipIndex,
  useFacilityMutations, useFacilityOrderCounts, useFacilitySearchQuery, useFacilityGroupMembershipReader,
  useFacilitySellOnline,
} from "@/composables/useFacilities";
import { useProductStores } from "@/composables/useProductStores";
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonFabList,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonPage,
  IonPopover,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
  popoverController
} from '@ionic/vue';
import { addOutline, businessOutline, lockClosedOutline, lockOpenOutline, shareOutline, storefrontOutline } from 'ionicons/icons';
import { DateTime } from 'luxon';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { commonUtil, logger, translate } from "@common"
import SearchFilterCard from '@/components/common/SearchFilterCard.vue';
import UniformFilterLayout from '@/components/common/UniformFilterLayout.vue';
import router from '@/router';


// Physical facilities only. The cache holds parkings too, which this screen never showed —
// its previous fetch excluded the VIRTUAL_FACILITY hierarchy server-side.
const { facilities: allCachedFacilities, hydrated } = useFacilities({ excludeVirtual: true });
// The Type filter offers physical types only — the parking hierarchy is not selectable here.
const { facilityTypes } = useFacilityTypes({ excludeVirtual: true });
const { facilityGroups: allCachedGroups } = useFacilityGroups();
const { productStores } = useProductStores();
const { groupsByFacility, facilityIdsByGroup } = useGroupMembershipIndex();

const { query, setQuery, resetQuery } = useFacilitySearchQuery();
const { fetchOrderCounts } = useFacilityOrderCounts();
const { fetchGroupMemberships } = useFacilityGroupMembershipReader();
const { setGroupMembership } = useFacilitySellOnline();
const facilityGroups = computed(() => allCachedGroups.value);
const inventoryGroups = computed(() => allCachedGroups.value.filter((group: any) => group.facilityGroupTypeId === "CHANNEL_FAC_GROUP"));

// Base list is the shared, already-cached facility list (fetched at login);
// filtering/pagination below happen client-side instead of a dedicated search API call.
const allFacilities = computed(() => allCachedFacilities.value);
// Per-facility group membership for the currently selected group filter, so
// "Group" filtering matches real membership, not just a facility's primary group.
const groupFacilityIds = ref<Set<string> | null>(null);
// Per-facility enrichment (order count / group membership / sell-online), filled in lazily
// as pages of the locally-filtered list become visible, same as the old page-at-a-time enrichment.
const enrichmentById = reactive<Record<string, any>>({});
const visibleCount = ref<number>(Number(import.meta.env.VITE_VIEW_SIZE));
// Live search text, filtered on every keystroke since matching is an in-memory
// array scan; kept separate from query.queryString so typing doesn't have to
// wait on the (debounced) persisted-query write below.
const searchText = ref(query.value.queryString || "");
let searchDebounceHandle: ReturnType<typeof setTimeout> | undefined;

const filteredFacilities = computed(() => {
  const q = query.value;
  const keyword = searchText.value?.trim().toLowerCase();
  return allFacilities.value.filter((facility: any) => {
    if (q.productStoreId && facility.productStoreId !== q.productStoreId) return false;
    if (q.facilityTypeId && facility.facilityTypeId !== q.facilityTypeId) return false;
    if (groupFacilityIds.value && !groupFacilityIds.value.has(facility.facilityId)) return false;
    if (keyword && !facility.facilityName?.toLowerCase().includes(keyword)) return false;
    return true;
  });
});

const facilities = computed(() => filteredFacilities.value.slice(0, visibleCount.value).map((facility: any) => ({
  ...facility,
  orderLimitType: facility.maximumOrderLimit === 0 ? "no-capacity" : (facility.maximumOrderLimit ? "custom" : "unlimited"),
  isEnriched: false,
  ...enrichmentById[facility.facilityId]
})));
const isScrollable = computed(() => visibleCount.value < filteredFacilities.value.length);

// Bulk selection, following the find-page pattern from the Order Manager app.
const selectMode = ref(false);
const selectedFacilityIds = ref<string[]>([]);
const visibleFacilityIds = computed(() => facilities.value.map((facility: any) => facility.facilityId));
const allVisibleSelected = computed(() => visibleFacilityIds.value.length > 0 && visibleFacilityIds.value.every((facilityId: string) => selectedFacilityIds.value.includes(facilityId)));
const someVisibleSelected = computed(() => visibleFacilityIds.value.some((facilityId: string) => selectedFacilityIds.value.includes(facilityId)));

// Drop selections that fall out of the filtered result set.
watch(filteredFacilities, (updatedFacilities: any[]) => {
  const filteredIds = new Set(updatedFacilities.map((facility: any) => facility.facilityId));
  selectedFacilityIds.value = selectedFacilityIds.value.filter((facilityId: string) => filteredIds.has(facilityId));
});

onIonViewWillEnter(async () => {
  if(router.currentRoute.value.query?.productStoreId) {
    setQuery({ productStoreId: router.currentRoute.value.query?.productStoreId as string });
  }
  // Nothing to fetch but the volatile order counts — every list and lookup is already cached.
  await updateGroupFilter();
});

/**
 * Enrich whenever the visible set changes — on first cache emit, on filter change, and on paging.
 *
 * This CANNOT live in `onIonViewWillEnter` alone: the list now arrives asynchronously from
 * IndexedDB, so at view-enter `facilities` is still empty, `pending` is empty, and the enrichment
 * returns without fetching — leaving every row on a skeleton forever.
 */
watch(visibleFacilityIds, (ids: string[]) => {
  if (ids.length) void enrichVisibleFacilities();
}, { immediate: true });

async function updateQuery() {
  visibleCount.value = Number(import.meta.env.VITE_VIEW_SIZE);
  await updateGroupFilter();
  await enrichVisibleFacilities();
}

function onSearchInput() {
  visibleCount.value = Number(import.meta.env.VITE_VIEW_SIZE);
  clearTimeout(searchDebounceHandle);
  searchDebounceHandle = setTimeout(async () => {
    setQuery({ queryString: searchText.value });
    await enrichVisibleFacilities();
  }, 300);
}

function flushSearch() {
  clearTimeout(searchDebounceHandle);
  setQuery({ queryString: searchText.value });
  enrichVisibleFacilities();
}

async function clearFilters() {
  clearTimeout(searchDebounceHandle);
  searchText.value = "";
  selectedFacilityIds.value = [];
  resetQuery();
  groupFacilityIds.value = null;
  visibleCount.value = Number(import.meta.env.VITE_VIEW_SIZE);
  await enrichVisibleFacilities();
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selectedFacilityIds.value = [];
}

function toggleVisibleSelection(checked: boolean) {
  selectedFacilityIds.value = checked ? [...visibleFacilityIds.value] : [];
}

function toggleFacilitySelection(facilityId: string) {
  if (selectedFacilityIds.value.includes(facilityId)) {
    selectedFacilityIds.value = selectedFacilityIds.value.filter((selectedFacilityId: string) => selectedFacilityId !== facilityId);
  } else {
    selectedFacilityIds.value = [...selectedFacilityIds.value, facilityId];
  }
}

async function openBulkCapacityAlert() {
  const alert = await alertController.create({
    header: translate("Fulfillment Capacity"),
    message: translate("Apply a fulfillment capacity to the selected facilities."),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Unlimited Capacity"), handler: () => { applyBulkCapacity(""); } },
      { text: translate("No Capacity"), handler: () => { applyBulkCapacity(0); } },
      { text: translate("Custom"), handler: () => { openBulkCustomCapacityAlert(); } }
    ]
  });
  await alert.present();
}

async function openBulkCustomCapacityAlert() {
  const alert = await alertController.create({
    header: translate("Custom fulfillment capacity"),
    inputs: [{
      name: "setLimit",
      placeholder: translate("Order fulfillment capacity"),
      type: "number",
      min: 0
    }],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: (data) => {
          if (data.setLimit === "" || data.setLimit == undefined) {
            commonUtil.showToast(translate("Please provide a value"));
            return false;
          }
          if (parseFloat(data.setLimit) < 0) {
            commonUtil.showToast(translate("Provide a value greater than or equal to 0"));
            return false;
          }
          applyBulkCapacity(data.setLimit);
        }
      }
    ]
  });
  await alert.present();
}

async function applyBulkCapacity(maximumOrderLimit: number | string) {
  const facilityIds = [...selectedFacilityIds.value];
  const results = await Promise.allSettled(facilityIds.map((facilityId: string) => useFacilityMutations(facilityId).updateFacility({ facilityId, maximumOrderLimit })));

  // `updateFacility` already refreshed each cached row, so this loop only reports failures.
  // It used to re-refresh every success as well, which doubled the request count of a bulk edit —
  // 50 selected facilities meant 100 refetches, the second half of them strictly sequential.
  const failedNames: string[] = [];
  for (const [index, result] of results.entries() as any) {
    const facilityId = facilityIds[index];
    if (result.status !== "fulfilled" || commonUtil.hasError(result.value)) {
      failedNames.push(getFacilityName(facilityId));
      logger.error("Failed to update facility", result.status === "rejected" ? result.reason : result.value?.data);
    }
  }

  if (failedNames.length) {
    commonUtil.showToast(translate("Failed to update fulfillment capacity for ", { facilityName: failedNames.join(", ") }));
  } else {
    commonUtil.showToast(translate("Fulfillment capacity updated successfully for ", { facilityName: facilityIds.map((facilityId: string) => getFacilityName(facilityId)).join(", ") }));
  }
}

async function openBulkSellOnlineAlert() {
  if (!inventoryGroups.value.length) return;
  const groups = inventoryGroups.value;
  const alert = await alertController.create({
    header: translate("Sell Online"),
    inputs: groups.length > 1 ? groups.map((group: any, index: number) => ({
      type: "radio" as const,
      label: group.facilityGroupName ? group.facilityGroupName : group.facilityGroupId,
      value: group.facilityGroupId,
      checked: index === 0
    })) : [],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Turn off"), handler: (data) => { applyBulkSellOnline(groups.length > 1 ? data : groups[0].facilityGroupId, false); } },
      { text: translate("Turn on"), handler: (data) => { applyBulkSellOnline(groups.length > 1 ? data : groups[0].facilityGroupId, true); } }
    ]
  });
  await alert.present();
}

async function applyBulkSellOnline(facilityGroupId: string, enable: boolean) {
  if (!facilityGroupId) return;
  const facilityIds = [...selectedFacilityIds.value];
  const failedNames: string[] = [];

  // Deliberately a SERVER read, not the cache: this guards against creating a duplicate
  // association, and the login-time cache could be stale if a membership changed elsewhere.
  // It runs only on this write path, so it does not affect page-load requests.
  const membershipsByFacility = await fetchGroupMemberships(facilityIds);

  await Promise.all(facilityIds.map(async (facilityId: string) => {
    const membership = (membershipsByFacility[facilityId] || []).find((group: any) => group.facilityGroupId === facilityGroupId);
    try {
      let resp;
      if (enable && !membership) {
        resp = await useFacilityMutations(facilityId).addToGroup({ facilityGroupId, fromDate: DateTime.now().toMillis() });
      } else if (!enable && membership) {
        resp = await useFacilityMutations(facilityId).updateGroupAssociation({ facilityGroupId, fromDate: membership.fromDate, thruDate: DateTime.now().toMillis() });
      }
      if (resp && commonUtil.hasError(resp)) throw resp.data;
    } catch (err) {
      failedNames.push(getFacilityName(facilityId));
      logger.error("Failed to update sell inventory online setting", err);
    }
  }));

  // Resync membership for everything touched so rows reflect server state.
  const groupsByFacility = await fetchGroupMemberships(facilityIds);
  facilityIds.forEach((facilityId: string) => {
    const groupInformation = groupsByFacility[facilityId] || [];
    enrichmentById[facilityId] = {
      ...enrichmentById[facilityId],
      groupInformation,
      sellOnline: groupInformation.some((group: any) => group.facilityGroupTypeId === "CHANNEL_FAC_GROUP"),
      isEnriched: true
    };
  });

  const groupName = inventoryGroups.value.find((group: any) => group.facilityGroupId === facilityGroupId)?.facilityGroupName || facilityGroupId;
  if (failedNames.length) {
    commonUtil.showToast(translate("Failed to update sell inventory online setting"));
  } else {
    commonUtil.showToast(translate(enable ? "is now selling on" : "no longer sells on", { facilityName: facilityIds.map((facilityId: string) => getFacilityName(facilityId)).join(", "), facilityGroupId: groupName }));
  }
}

function getFacilityName(facilityId: string) {
  const facility = allFacilities.value.find((facility: any) => facility.facilityId === facilityId);
  return facility?.facilityName ? facility.facilityName : facilityId;
}

onBeforeUnmount(() => clearTimeout(searchDebounceHandle));

async function updateGroupFilter() {
  if (!query.value.facilityGroupId) {
    groupFacilityIds.value = null;
    return;
  }
  // Memberships are cached, so the group filter needs no request.
  groupFacilityIds.value = new Set(facilityIdsByGroup.value[query.value.facilityGroupId] ?? []);
}

async function enrichVisibleFacilities() {
  const pending = facilities.value.filter((facility: any) => !facility.isEnriched).map((facility: any) => facility.facilityId);
  if (!pending.length) return;

  // Order counts are volatile and never cached (they change constantly), so they are always
  // fetched. Group memberships come from the cache, removing the second request.
  const orderCounts = await fetchOrderCounts(pending);

  pending.forEach((facilityId: string) => {
    const groupInformation = groupsByFacility.value[facilityId] || [];
    enrichmentById[facilityId] = {
      orderCount: orderCounts[facilityId] || 0,
      groupInformation,
      sellOnline: groupInformation.some((group: any) => group.facilityGroupTypeId === "CHANNEL_FAC_GROUP"),
      isEnriched: true
    };
  });
}

async function loadMoreFacilities(event: any) {
  visibleCount.value += Number(import.meta.env.VITE_VIEW_SIZE);
  await enrichVisibleFacilities();
  await event.target.complete();
}

function viewFacilityDetails(facilityId: string) {
  router.push({ path: `/facility-details/${facilityId}` });
}


function getAssociatedInventoryGroups(facility: any) {
  return inventoryGroups.value.map((group: any) => ({
    ...group,
    isChecked: facility.groupInformation?.some((fg: any) => fg.facilityGroupId === group.facilityGroupId)
  }));
}

async function updateSellInventoryOnlineSetting(event: any, facility: any, facilityGroup: any) {
  event.stopImmediatePropagation();
  // Using `not` as the click event returns the current status of toggle, but on click we want to change the toggle status
  const isChecked = !event.target.checked;
  const result = await setGroupMembership(facility, facilityGroup, isChecked);
  if (result) enrichmentById[facility.facilityId] = { ...enrichmentById[facility.facilityId], ...result, isEnriched: true };
}

async function toggleSingleInventoryGroup(facility: any) {
  const isGroupAdded = !facility.groupInformation?.some((info: any) => info.facilityGroupId === inventoryGroups.value[0].facilityGroupId);
  const result = await setGroupMembership(facility, inventoryGroups.value[0], isGroupAdded);
  if (result) enrichmentById[facility.facilityId] = { ...enrichmentById[facility.facilityId], ...result, isEnriched: true };
}

async function selectOrderLimitType(orderLimitType: string, facility: any) {
  let header = "Unlimited fulfillment capacity";
  let message = "Unlimited capacity removes the fulfillment capacity limit entirely. To add a fulfillment capacity to this facility, use the custom option.";
  let showInput = false;
  let setLimit: number | string = facility.maximumOrderLimit;

  if (orderLimitType === 'custom') {
    header = "Custom fulfillment capacity";
    message = "";
    showInput = true;
  } else if (orderLimitType === 'no-capacity') {
    setLimit = 0;
    header = "No fulfillment capacity";
    message = "No capacity sets the fulfillment capacity to 0, preventing any new orders from being allocated to this facility. Use the \"Reject all orders\" option in the fulfillment pages to clear your facilities fulfillment queue. To add a fulfillment capacity to this facility, use the custom option.";
  } else if (orderLimitType === 'unlimited') {
    setLimit = "";
  }

  const alert = await alertController.create({
    header: translate(header),
    message: translate(message, { space: '</br></br>' }),
    inputs: showInput ? [{
      name: "setLimit",
      placeholder: translate("Order fulfillment capacity"),
      type: "number",
      value: facility.maximumOrderLimit?.toString(),
      min: 0
    }] : [],
    buttons: [
      { text: translate('Cancel'), role: "cancel" },
      {
        text: translate('Apply'),
        handler: (data) => {
          let finalLimit = setLimit;

          if (showInput) {
            if (data.setLimit === '') {
              commonUtil.showToast(translate('Please provide a value'));
              return false;
            } else if (parseFloat(data.setLimit) < 0) {
              commonUtil.showToast(translate('Provide a value greater than or equal to 0'));
              return false;
            } else {
              finalLimit = data.setLimit;
            }
          }

          popoverController.dismiss(finalLimit);
        }
      }
    ]
  });
  await alert.present();
}

async function onOrderLimitPopoverDismiss(event: any, facility: any) {
  const finalLimit = event.detail.data;
  if (finalLimit != undefined && finalLimit !== facility.maximumOrderLimit) {
    await updateFacilityOrderLimit(finalLimit, facility);
  }
}

async function updateFacilityOrderLimit(maximumOrderLimit: number | string, facility: any) {
  try {
    // `updateFacility` refreshes the cached facility row itself, so this must not refresh again.
    const resp = await useFacilityMutations(facility.facilityId).updateFacility({ maximumOrderLimit });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Fulfillment capacity updated successfully for ', { facilityName: facility.facilityName }));
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to update fulfillment capacity for ', { facilityName: facility.facilityName }));
    logger.error('Failed to update facility', err);
  }
}
</script>

<style scoped>
.facility-results-header {
  align-items: center;
  display: flex;
  gap: var(--spacer-sm);
}

.facility-results-header-start {
  display: flex;
  min-width: 24px;
}

.bulk-action-buttons {
  overflow-x: auto;
}

.list-item {
  --columns-desktop: 4;
  border-bottom: var(--border-medium);
}

main {
  margin: var(--spacer-lg);
}

ion-content {
  --padding-bottom: 80px;
}
</style>
