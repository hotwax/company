<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Import facility") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <!-- Loading state -->
    <div v-if="isLoading" class="ion-padding ion-text-center">
      <ion-spinner name="crescent" />
      <p>{{ translate("Fetching locations from Shopify...") }}</p>
    </div>

    <!-- Error state -->
    <div v-else-if="fetchError" class="ion-padding">
      <ion-note color="danger">{{ fetchError }}</ion-note>
      <ion-button fill="clear" @click="fetchData">{{ translate("Retry") }}</ion-button>
    </div>

    <!-- Location list -->
    <template v-else>
      <ion-item-divider color="light">
        <ion-label>
          {{ translate("{count} locations from Shopify", { count: locations.length }) }}
        </ion-label>
      </ion-item-divider>

      <ion-list>
        <ion-item v-for="loc in locations" :key="loc.shopifyLocationId" lines="full">
          <ion-checkbox
            slot="start"
            :checked="selectedIds.has(loc.shopifyLocationId)"
            :disabled="loc.alreadyInOms"
            @ionChange="toggleSelection(loc.shopifyLocationId, $event.detail.checked)"
          />

          <ion-label>
            <p class="overline">{{ loc.shopifyLocationId }}</p>
            {{ loc.name }}
            <p>{{ [loc.city, loc.provinceCode, loc.countryCode].filter(Boolean).join(', ') }}</p>
            <ion-note v-if="loc.isFulfillmentService" color="warning">
              {{ loc.fulfillmentServiceName || translate("Fulfillment Service") }}
            </ion-note>
            <ion-note v-else-if="loc.pickupEnabled" color="success">
              {{ translate("Pickup enabled") }}
            </ion-note>
            <ion-note v-if="loc.alreadyInOms" color="medium">
              {{ translate("Already in OMS") }}
            </ion-note>
          </ion-label>

          <ion-select
            v-if="!loc.alreadyInOms"
            slot="end"
            :value="facilityTypes[loc.shopifyLocationId]"
            :placeholder="translate('Type')"
            interface="popover"
            @ionChange="facilityTypes[loc.shopifyLocationId] = $event.detail.value"
          >
            <ion-select-option value="RETAIL_STORE">{{ translate("Retail Store") }}</ion-select-option>
            <ion-select-option value="WAREHOUSE">{{ translate("Warehouse") }}</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>
    </template>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button
      :disabled="selectedForImport.length === 0 || isImporting"
      @click="importSelected"
    >
      <ion-spinner v-if="isImporting" name="crescent" />
      <ion-icon v-else :icon="downloadOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton,
  IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList,
  IonNote, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar,
  modalController
} from '@ionic/vue'
import { close, downloadOutline } from 'ionicons/icons'
import { commonUtil, translate } from '@common'
import { useShopifyStore } from '@/store/shopify'
import { computed, ref, onMounted } from 'vue'

const props = defineProps(['shopId'])
const shopifyStore = useShopifyStore()

const isLoading    = ref(true)
const isImporting  = ref(false)
const fetchError   = ref('')
const locations    = ref<any[]>([])
const selectedIds  = ref(new Set<string>())
const facilityTypes = ref<Record<string, string>>({})

const selectedForImport = computed(() =>
  locations.value.filter(loc =>
    !loc.alreadyInOms &&
    selectedIds.value.has(loc.shopifyLocationId)
  )
)

async function fetchData() {
  isLoading.value = true
  fetchError.value = ''
  try {
    const [shopifyResp, omsResp] = await Promise.all([
      shopifyStore.fetchLocationsFromShopify({ shopId: props.shopId }),
      shopifyStore.fetchShopifyShopLocationsRaw({ shopId: props.shopId })
    ])

    const alreadyMapped = new Set(
      (omsResp.data || []).map((m: any) => String(m.shopifyLocationId))
    )

    const nodes = (shopifyResp.data?.locations?.edges || []).map((e: any) => e.node)
    locations.value = nodes.map((node: any) => {
      const shopifyLocationId = String(node.id).split('/').pop()!
      return {
        shopifyLocationId,
        name:                node.name,
        isFulfillmentService: node.isFulfillmentService,
        fulfillmentServiceName: node.fulfillmentService?.serviceName ?? null,
        pickupEnabled:       !!node.localPickupSettingsV2?.pickupTime,
        address1:            node.address?.address1,
        address2:            node.address?.address2,
        city:                node.address?.city,
        provinceCode:        node.address?.provinceCode,
        countryCode:         node.address?.countryCode,
        zip:                 node.address?.zip,
        phone:               node.address?.phone,
        latitude:            node.address?.latitude,
        longitude:           node.address?.longitude,
        alreadyInOms:        alreadyMapped.has(shopifyLocationId)
      }
    })

    locations.value.forEach(loc => {
      if (!loc.alreadyInOms) selectedIds.value.add(loc.shopifyLocationId)
    })
  } catch (e: any) {
    fetchError.value = e?.message || translate('Failed to fetch locations')
  } finally {
    isLoading.value = false
  }
}

function toggleSelection(id: string, checked: boolean) {
  checked ? selectedIds.value.add(id) : selectedIds.value.delete(id)
}

async function importSelected() {
  const missing = selectedForImport.value.filter(
    loc => !facilityTypes.value[loc.shopifyLocationId]
  )
  if (missing.length) {
    commonUtil.showToast(translate('Set a facility type for all selected locations'))
    return
  }

  isImporting.value = true
  try {
    const resp = await shopifyStore.importShopifyFacilities({
      shopId: props.shopId,
      locations: selectedForImport.value.map(loc => ({
        shopifyLocationId: loc.shopifyLocationId,
        name:              loc.name,
        facilityTypeId:    facilityTypes.value[loc.shopifyLocationId],
        address1:    loc.address1,
        address2:    loc.address2,
        city:        loc.city,
        provinceCode: loc.provinceCode,
        countryCode: loc.countryCode,
        zip:         loc.zip,
        phone:       loc.phone,
        latitude:    loc.latitude,
        longitude:   loc.longitude
      }))
    })
    const count = Array.isArray(resp.data) ? resp.data.length : selectedForImport.value.length
    commonUtil.showToast(translate('{count} locations imported', { count }))
    modalController.dismiss({ imported: count })
  } catch (e: any) {
    commonUtil.showToast(translate('Import failed'))
  } finally {
    isImporting.value = false
  }
}

function closeModal() {
  modalController.dismiss()
}

onMounted(fetchData)
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
