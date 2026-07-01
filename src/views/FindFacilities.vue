<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Find Facilities") }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar :placeholder="translate('Search facilities')" v-model="query.queryString" @keyup.enter="updateQuery()" />
      </ion-toolbar>
      <ion-toolbar>
        <div class="filters">
          <ion-item lines="none">
            <ion-icon :icon="globeOutline" slot="start" />
            <ion-select :label="translate('Product Store')" interface="popover" v-model="query.productStoreId" @ionChange="updateQuery()">
              <ion-select-option value="">{{ translate("All") }}</ion-select-option>
              <ion-select-option :value="productStore.productStoreId" :key="productStore.productStoreId" v-for="productStore in productStores">{{ productStore.storeName ? productStore.storeName : productStore.productStoreId }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item lines="none">
            <ion-icon :icon="businessOutline" slot="start" />
            <ion-select :label="translate('Type')" interface="popover" v-model="query.facilityTypeId" @ionChange="updateQuery()">
              <ion-select-option value="">{{ translate("All") }}</ion-select-option>
              <ion-select-option :value="facilityType.facilityTypeId" :key="facilityType.facilityTypeId" v-for="facilityType in facilityTypes">{{ facilityType.description ? facilityType.description : facilityType.facilityTypeId }}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item lines="none">
            <ion-icon :icon="albumsOutline" slot="start" />
            <ion-select :label="translate('Group')" interface="popover" v-model="query.facilityGroupId" @ionChange="updateQuery()">
              <ion-select-option value="">{{ translate("All") }}</ion-select-option>
              <ion-select-option :value="facilityGroup.facilityGroupId" :key="facilityGroup.facilityGroupId" v-for="facilityGroup in facilityGroups">{{ facilityGroup.facilityGroupName ? facilityGroup.facilityGroupName : facilityGroup.facilityGroupId }}</ion-select-option>
            </ion-select>
          </ion-item>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main v-if="facilities?.length">
        <div class="list-item" v-for="facility in facilities" :key="facility.facilityId" @click="viewFacilityDetails(facility.facilityId)">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="businessOutline" />
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
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonCheckbox,
  IonChip,
  IonContent,
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
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
  popoverController
} from '@ionic/vue';
import { albumsOutline, businessOutline, globeOutline, lockClosedOutline, lockOpenOutline, shareOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { commonUtil, logger, translate } from "@common"
import { useFacilityStore } from '@/store/facility';
import { useUtilStore } from '@/store/util';
import { useProductStore } from '@/store/productStore';
import router from '@/router';

const facilityStore = useFacilityStore();
const utilStore = useUtilStore();
const productStoreStore = useProductStore();

const facilities = computed(() => facilityStore.getFacilities);
const query = computed(() => facilityStore.getFacilityQuery);
const isScrollable = computed(() => facilityStore.isFacilitiesScrollable);
const productStores = computed(() => productStoreStore.getProductStores);
const facilityTypes = computed(() => facilityStore.getFacilityTypes);
const facilityGroups = computed(() => utilStore.getFacilityGroups);
const inventoryGroups = computed(() => utilStore.getInventoryGroups);

onIonViewWillEnter(async () => {
  await Promise.all([
    facilityStore.fetchFacilityTypes(),
    utilStore.fetchFacilityGroups(),
    productStoreStore.fetchProductStores()
  ]);
  await fetchFacilities();
});

async function updateQuery() {
  await facilityStore.updateFacilityQuery(query.value);
  await fetchFacilities();
}

async function fetchFacilities(vSize?: any, vIndex?: any) {
  const pageSize = vSize ? vSize : import.meta.env.VITE_VIEW_SIZE;
  const pageIndex = vIndex ? vIndex : 0;
  await facilityStore.fetchFacilities({ pageSize, pageIndex });
}

async function loadMoreFacilities(event: any) {
  await fetchFacilities(
    undefined,
    Math.ceil(
      facilities.value?.length / (import.meta.env.VITE_VIEW_SIZE as any)
    ).toString()
  );
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
  await facilityStore.updateFacilityGroupAssociation(facility, facilityGroup, isChecked);
}

async function toggleSingleInventoryGroup(facility: any) {
  const isGroupAdded = !facility.groupInformation?.some((info: any) => info.facilityGroupId === inventoryGroups.value[0].facilityGroupId);
  await facilityStore.updateFacilityGroupAssociation(facility, inventoryGroups.value[0], isGroupAdded);
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
    const resp = await facilityStore.updateFacility({ facilityId: facility.facilityId, maximumOrderLimit });
    if (!commonUtil.hasError(resp)) {
      const updatedFacilities = facilityStore.getFacilities.map((item: any) => {
        if (item.facilityId === facility.facilityId) {
          item.maximumOrderLimit = maximumOrderLimit === "" ? null : maximumOrderLimit;
          item.orderLimitType = item.maximumOrderLimit === null ? 'unlimited' : (item.maximumOrderLimit === 0 ? 'no-capacity' : 'custom');
        }
        return item;
      });
      facilityStore.updateFacilities(updatedFacilities);
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
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
}

.filters ion-item {
  flex: 1;
  min-width: 200px;
  --background: transparent;
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
