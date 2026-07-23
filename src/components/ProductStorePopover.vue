<template>
  <ion-content>
    <ion-list>
      <ion-list-header>
        {{ getProductStoreById(currentProductStore.productStoreId)?.storeName || currentProductStore.productStoreId }}
      </ion-list-header>
      <ion-item button @click="togglePrimary()">
        {{ translate("Primary") }}
        <ion-icon slot="end"
          :color="current.primaryFacilityGroupId === shopifyShopIdForProductStore(currentProductStore.productStoreId) ? 'warning' : ''"
          :icon="current.primaryFacilityGroupId === shopifyShopIdForProductStore(currentProductStore.productStoreId) ? star : starOutline"
        />
      </ion-item>
      <ion-item button lines="none" @click="removeStoreFromFacility()">
        {{ translate("Unlink") }}
        <ion-icon slot="end" :icon="removeCircleOutline" />
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonItem,
  IonList,
  IonListHeader,
  popoverController
} from "@ionic/vue";
import { removeCircleOutline, star, starOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { DateTime } from "luxon";
import { useFacilityStore } from "@/store/facility";
import { useUtilStore } from "@/store/util";
import { useProductStore } from "@/store/productStore";
import { computed } from "vue";

const props = defineProps(['currentProductStore', 'facilityId']);
const facilityStore = useFacilityStore();
const utilStore = useUtilStore();
const productStoreStore = useProductStore();

const current = computed(() => facilityStore.getCurrent);
const getProductStoreById = computed(() => (id: string) => productStoreStore.getProductStoreById(id));
const shopifyShopIdForProductStore = computed(() => (id: string) => utilStore.getShopifyShopIdForProductStore(id));

async function removeStoreFromFacility() {
  emitter.emit('presentLoader');

  try {
    const resp = await facilityStore.updateProductStoreFacility({
      facilityId: props.facilityId,
      productStoreId: props.currentProductStore.productStoreId,
      fromDate: props.currentProductStore.fromDate,
      thruDate: DateTime.now().toMillis()
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Store unlinked successfully.'));

      if (shopifyShopIdForProductStore.value(props.currentProductStore.productStoreId) === current.value.primaryFacilityGroupId) {
        const updateResp = await facilityStore.updateFacility({
          facilityId: props.facilityId,
          primaryFacilityGroupId: ''
        });
        if (!commonUtil.hasError(updateResp)) {
          await facilityStore.updateCurrentFacility({ ...current.value, primaryFacilityGroupId: '' });
        } else {
          throw updateResp.data;
        }
      }

      await facilityStore.fetchCurrentFacilityProductStores({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
    commonUtil.showToast(translate('Store unlink failed.'));
  }

  popoverController.dismiss();
  emitter.emit('dismissLoader');
}

async function updatePrimaryStore(shopifyShopId = '') {
  try {
    const resp = await facilityStore.updateFacility({
      facilityId: props.facilityId,
      primaryFacilityGroupId: shopifyShopId
    });
    if (!commonUtil.hasError(resp)) {
      await facilityStore.updateCurrentFacility({ ...current.value, primaryFacilityGroupId: shopifyShopId });
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate('Failed to update primary product store'));
    logger.error('Failed to update primary product store', error);
  }
}

async function togglePrimary() {
  emitter.emit('presentLoader');

  const productStoreId = props.currentProductStore.productStoreId;
  let shopifyShopId = shopifyShopIdForProductStore.value(productStoreId);

  if (!shopifyShopId) {
    shopifyShopId = await utilStore.fetchShopifyShopForProductStores([productStoreId]);
  }

  if (!shopifyShopId) {
    commonUtil.showToast(translate('Failed to make product store primary due to missing Shopify shop'));
    popoverController.dismiss();
    emitter.emit('dismissLoader');
    return;
  }

  if (current.value.primaryFacilityGroupId === shopifyShopId) {
    await updatePrimaryStore();
    popoverController.dismiss();
    emitter.emit('dismissLoader');
    return;
  }

  let facilityGroupId = await fetchFacilityGroup(shopifyShopId);

  if (!facilityGroupId) {
    facilityGroupId = await createFacilityGroup(shopifyShopId);
  }

  if (facilityGroupId) {
    await updatePrimaryStore(shopifyShopId);
  } else {
    commonUtil.showToast(translate('Failed to make product store primary due to missing group'));
  }

  popoverController.dismiss();
  emitter.emit('dismissLoader');
}

async function fetchFacilityGroup(shopifyShopId: string) {
  let facilityGroupId;
  try {
    const resp = await facilityStore.fetchFacilityGroup(shopifyShopId);
    if (!commonUtil.hasError(resp)) {
      facilityGroupId = resp.data?.facilityGroupId;
    } else {
      throw resp.data;
    }
  } catch (error) {
    logger.error('Failed to fetch facility group', error);
  }
  return facilityGroupId;
}

async function createFacilityGroup(shopifyShopId: string) {
  let facilityGroupId;
  try {
    const resp = await facilityStore.createFacilityGroup({
      facilityGroupId: shopifyShopId,
      facilityGroupName: getProductStoreById.value(props.currentProductStore.productStoreId)?.storeName,
      facilityGroupTypeId: 'FEATURING'
    });
    if (!commonUtil.hasError(resp)) {
      facilityGroupId = resp.data.facilityGroupId;
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
  }
  return facilityGroupId;
}
</script>
