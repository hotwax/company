<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="`/tiktok-connection-details/${id}`" />
        <ion-title>{{ translate("Shipping providers") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item v-if="!hasDefaultMapping" lines="none" color="warning">
        <ion-icon slot="start" :icon="alertCircleOutline" />
        <ion-label class="ion-text-wrap">
          {{ translate("Default provider mapping (_DEFAULT_) is required for fulfillment pushes.") }}
        </ion-label>
      </ion-item>

      <ion-list lines="full">
        <ion-item v-for="mapping in mappings" :key="mapping.mappedKey">
          <ion-label>
            {{ mapping.mappedKey }}
            <p>{{ translate("Carrier") }}</p>
          </ion-label>
          <ion-label slot="end">{{ mapping.mappedValue }}</ion-label>
          <ion-button slot="end" fill="clear" color="danger" @click="removeMapping(mapping)">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-item>
      </ion-list>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ translate("Add mapping") }}</ion-card-title>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item>
            <ion-select v-model="newMappedKey" :label="translate('Carrier')" interface="popover">
              <ion-select-option value="_DEFAULT_">_DEFAULT_</ion-select-option>
              <ion-select-option v-for="carrierPartyId in carrierOptions" :key="carrierPartyId" :value="carrierPartyId">
                {{ carrierPartyId }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input v-model="newMappedValue" :label="translate('Shipping provider ID')" label-placement="floating" />
          </ion-item>
        </ion-list>
        <ion-button expand="block" fill="clear" :disabled="!newMappedKey || !newMappedValue.trim() || isSaving" @click="addMapping()">
          {{ translate("Add mapping") }}
        </ion-button>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonCard, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonPage, IonSelect, IonSelectOption, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { alertCircleOutline, trashOutline } from "ionicons/icons";
import { translate, commonUtil, logger } from '@common';
import { computed, ref } from "vue";
import { useTikTokStore } from '@/store/tiktok';
import { useNetSuiteStore } from '@/store/netSuite';

const props = defineProps<{ id: string }>()
const MAPPED_TYPE_ID = "TIKTOK_SHIP_PROVIDER"

const tiktokStore = useTikTokStore();
const netSuiteStore = useNetSuiteStore();

const mappings = computed(() => tiktokStore.getShopMappings(props.id, MAPPED_TYPE_ID))
const hasDefaultMapping = computed(() => mappings.value.some((m: any) => m.mappedKey === '_DEFAULT_'))
const carrierOptions = computed(() => {
  const carriers = new Set<string>()
  ;(netSuiteStore.productStoreShipmentMethods || []).forEach((sm: any) => {
    if (sm.carrierPartyId) carriers.add(sm.carrierPartyId)
  })
  return Array.from(carriers).sort()
})

const newMappedKey = ref("")
const newMappedValue = ref("")
const isSaving = ref(false)

onIonViewWillEnter(async () => {
  try {
    const shop = await tiktokStore.fetchTikTokShop(props.id)
    const fetches: Promise<any>[] = [tiktokStore.fetchTikTokShopMappings(props.id, MAPPED_TYPE_ID)]
    if (shop.productStoreId) {
      fetches.push(netSuiteStore.fetchProductStoreShipmentMethods({ productStoreId: shop.productStoreId }))
    }
    await Promise.all(fetches)
  } catch (error) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to load shipping providers"))
  }
})

async function addMapping() {
  isSaving.value = true
  try {
    await tiktokStore.createTikTokShopMapping({
      shopId: props.id,
      mappedTypeId: MAPPED_TYPE_ID,
      mappedKey: newMappedKey.value,
      mappedValue: newMappedValue.value.trim()
    })
    commonUtil.showToast(translate("Mapping saved"))
    newMappedKey.value = ""
    newMappedValue.value = ""
  } catch (error) {
    commonUtil.showToast(translate("Failed to save mapping"))
  } finally {
    isSaving.value = false
  }
}

async function removeMapping(mapping: any) {
  try {
    await tiktokStore.deleteTikTokShopMapping({
      shopId: props.id,
      mappedTypeId: MAPPED_TYPE_ID,
      mappedKey: mapping.mappedKey
    })
    commonUtil.showToast(translate("Mapping removed"))
  } catch (error) {
    commonUtil.showToast(translate("Failed to remove mapping"))
  }
}
</script>
