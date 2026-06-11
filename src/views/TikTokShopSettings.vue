<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="`/tiktok-connection-details/${id}`" />
        <ion-title>{{ translate("TikTok shop settings") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list lines="full">
        <ion-item>
          <ion-select v-model="form.productStoreId" :label="translate('Product store')" interface="popover">
            <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">
              {{ store.storeName || store.productStoreId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select v-model="form.facilityGroupId" :label="translate('Facility group')" interface="popover">
            <ion-select-option v-for="group in facilityGroups" :key="group.facilityGroupId" :value="group.facilityGroupId">
              {{ group.facilityGroupName || group.facilityGroupId }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-input v-model.number="form.holdMinutes" type="number" min="0" :label="translate('Hold minutes')" label-placement="floating" />
        </ion-item>
        <ion-item>
          <ion-toggle :checked="form.autoApproveBuyerCancel === 'Y'"
            @ionChange="form.autoApproveBuyerCancel = $event.detail.checked ? 'Y' : 'N'">
            {{ translate("Auto-approve buyer cancellations") }}
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-input v-model="form.tiktokWarehouseId" :label="translate('TikTok warehouse ID')" label-placement="floating" />
        </ion-item>
        <ion-item>
          <ion-input v-model="form.sellerCancelReason" :label="translate('Seller cancel reason')" label-placement="floating" />
        </ion-item>
        <ion-item>
          <ion-toggle :checked="form.shopStatusId === 'TTSHOP_ACTIVE'"
            @ionChange="form.shopStatusId = $event.detail.checked ? 'TTSHOP_ACTIVE' : 'TTSHOP_DISABLED'">
            {{ translate("Active") }}
          </ion-toggle>
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button :disabled="isSaving || !isValid" @click="save()">
          <ion-icon :icon="saveOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonList, IonPage, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { saveOutline } from "ionicons/icons";
import { translate, commonUtil, logger } from '@common';
import { computed, reactive, ref } from "vue";
import { useTikTokStore } from '@/store/tiktok';
import { useProductStore } from '@/store/productStore';
import { useUtilStore } from '@/store/util';

const props = defineProps<{ id: string }>()
const tiktokStore = useTikTokStore();
const productStoreStore = useProductStore();
const utilStore = useUtilStore();

const productStores = computed(() => productStoreStore.productStores)
const facilityGroups = computed(() => utilStore.facilityGroups)

const form = reactive({
  productStoreId: '' as string,
  facilityGroupId: '' as string,
  holdMinutes: 60 as number,
  autoApproveBuyerCancel: 'Y' as string,
  tiktokWarehouseId: '' as string,
  sellerCancelReason: '' as string,
  shopStatusId: 'TTSHOP_ACTIVE' as string
})
const isSaving = ref(false)

const isValid = computed(() => Number.isInteger(form.holdMinutes) && form.holdMinutes >= 0)

onIonViewWillEnter(async () => {
  try {
    const [shop] = await Promise.all([
      tiktokStore.fetchTikTokShop(props.id),
      productStoreStore.fetchProductStores(),
      utilStore.fetchFacilityGroups()
    ])
    form.productStoreId = shop.productStoreId || ''
    form.facilityGroupId = shop.facilityGroupId || ''
    form.holdMinutes = shop.holdMinutes ?? 60
    form.autoApproveBuyerCancel = shop.autoApproveBuyerCancel || 'Y'
    form.tiktokWarehouseId = shop.tiktokWarehouseId || ''
    form.sellerCancelReason = shop.sellerCancelReason || ''
    form.shopStatusId = shop.shopStatusId || 'TTSHOP_ACTIVE'
  } catch (error) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to load TikTok shop settings"))
  }
})

async function save() {
  isSaving.value = true
  try {
    await tiktokStore.updateTikTokShop({ shopId: props.id, ...form })
    await commonUtil.showToast(translate("TikTok shop updated"))
  } catch (error) {
    await commonUtil.showToast(translate("Failed to update TikTok shop"))
  } finally {
    isSaving.value = false
  }
}
</script>
