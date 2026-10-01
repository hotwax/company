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
import { useFacilityGroupMutations, useFacilityMutations, useFacilityRecord } from "@/composables/useFacilities";
import { useProductStores } from "@/composables/useProductStores";
import { useShopifyShops } from "@/composables/useShopify";
import { computed } from "vue";

const props = defineProps(['currentProductStore', 'facilityId']);
const mutations = useFacilityMutations(props.facilityId);
const { createGroup, findGroup } = useFacilityGroupMutations();
const { productStores } = useProductStores();
const { shops } = useShopifyShops();

// All three came from stores that are no longer populated for this screen; the facility, the store
// list and the shop<->store link are all in the login-time cache already.
const { record } = useFacilityRecord(props.facilityId);
const current = computed<any>(() => (record.value as any)?.raw ?? record.value ?? {});
const getProductStoreById = computed(() => (id: string) =>
  productStores.value.find((store: any) => store.productStoreId === id));
// NOTE: `shopifyShopId`, not `shopId`. The two differ (10000 vs 6973849727) and it is the
// Shopify id that doubles as the facility group id in `primaryFacilityGroupId`.
const shopifyShopIdForProductStore = computed(() => (id: string) =>
  shops.value.find((shop: any) => shop.productStoreId === id)?.shopifyShopId ?? '');

async function removeStoreFromFacility() {
  emitter.emit('presentLoader');

  try {
    // Unlink = close the association with a thruDate; the mutation refreshes the cached table.
    const resp = await mutations.updateProductStore({
      productStoreId: props.currentProductStore.productStoreId,
      fromDate: props.currentProductStore.fromDate,
      thruDate: DateTime.now().toMillis()
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Store unlinked successfully.'));

      if (shopifyShopIdForProductStore.value(props.currentProductStore.productStoreId) === current.value.primaryFacilityGroupId) {
        const updateResp = await mutations.updateFacility({ primaryFacilityGroupId: '' });
        if (commonUtil.hasError(updateResp)) throw updateResp.data;
      }

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
    const resp = await mutations.updateFacility({ primaryFacilityGroupId: shopifyShopId });
    if (commonUtil.hasError(resp)) throw resp.data;
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
  return findGroup(shopifyShopId);
}

async function createFacilityGroup(shopifyShopId: string) {
  let facilityGroupId;
  try {
    const resp = await createGroup({
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
