<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Add existing facilities") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <!-- Loading state -->
    <div v-if="isLoading" class="ion-padding ion-text-center">
      <ion-spinner name="crescent" />
      <p>{{ translate("Loading facilities...") }}</p>
    </div>

    <!-- Error state -->
    <div v-else-if="fetchError" class="ion-padding">
      <ion-note color="danger">{{ fetchError }}</ion-note>
      <ion-button fill="clear" @click="fetchData">{{ translate("Retry") }}</ion-button>
    </div>

    <!-- Facility list -->
    <template v-else>
      <ion-item-divider color="light">
        <ion-label>
          {{ translate("{count} facilities", { count: facilities.length }) }}
        </ion-label>
      </ion-item-divider>

      <ion-list v-if="facilities.length">
        <ion-item
          v-for="fac in facilities"
          :key="fac.facilityId"
          lines="full"
          :class="{ 'associated-facility': fac.alreadyAssociated }"
        >
          <ion-checkbox
            justify="start"
            label-placement="end"
            :checked="fac.alreadyAssociated || selectedIds.has(fac.facilityId)"
            :disabled="fac.alreadyAssociated"
            @ionChange="toggleSelection(fac.facilityId, $event.detail.checked)"
          >
            <ion-label>
              <p class="overline">{{ fac.facilityId }}</p>
              {{ fac.facilityName || fac.facilityId }}
              <p v-if="fac.facilityTypeId">{{ fac.facilityTypeId }}</p>
              <ion-note v-if="fac.alreadyAssociated" color="medium">
                {{ translate("Already associated") }}
              </ion-note>
            </ion-label>
          </ion-checkbox>
        </ion-item>
      </ion-list>

      <div v-else class="ion-padding ion-text-center">
        <ion-note color="medium">{{ translate("No facilities found.") }}</ion-note>
      </div>
    </template>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button
      :disabled="selectedForAssociation.length === 0 || isAssociating"
      @click="associateSelected"
    >
      <ion-spinner v-if="isAssociating" name="crescent" />
      <ion-icon v-else :icon="checkmarkOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton,
  IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList,
  IonNote, IonSpinner, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { close, checkmarkOutline } from 'ionicons/icons'
import { commonUtil, logger, translate } from '@common'
import { useProductStore } from '@/store/productStore'
import { computed, ref, onMounted } from 'vue'

const props = defineProps<{ productStoreId: string }>()
const productStoreStore = useProductStore()

const isLoading = ref(true)
const isAssociating = ref(false)
const fetchError = ref('')
const facilities = ref<any[]>([])
const selectedIds = ref(new Set<string>())

const selectedForAssociation = computed(() =>
  facilities.value.filter(fac =>
    !fac.alreadyAssociated &&
    selectedIds.value.has(fac.facilityId)
  )
)

async function fetchData() {
  isLoading.value = true
  fetchError.value = ''
  try {
    // All instance facilities, plus the ones already linked to THIS product store so we can mark
    // them as disabled (already associated) rather than letting the user link them twice.
    const [all] = await Promise.all([
      productStoreStore.fetchAllFacilities(),
      productStoreStore.fetchProductStoreFacilities(props.productStoreId)
    ])
    const associatedIds = new Set(
      (productStoreStore.currentFacilities || []).map((fac: any) => String(fac.facilityId))
    )
    facilities.value = (all || []).map((fac: any) => ({
      ...fac,
      alreadyAssociated: associatedIds.has(String(fac.facilityId))
    }))
  } catch (e: any) {
    fetchError.value = e?.message || translate('Failed to load facilities')
  } finally {
    isLoading.value = false
  }
}

function toggleSelection(id: string, checked: boolean) {
  checked ? selectedIds.value.add(id) : selectedIds.value.delete(id)
}

async function associateSelected() {
  isAssociating.value = true
  try {
    let associated = 0
    for (const fac of selectedForAssociation.value) {
      const resp = await productStoreStore.associateProductStoreFacility({
        productStoreId: props.productStoreId,
        facilityId: fac.facilityId
      })
      if (commonUtil.hasError(resp)) throw resp.data
      associated += 1
    }
    commonUtil.showToast(translate('{count} facilities associated', { count: associated }))
    modalController.dismiss({ associated })
  } catch (e: any) {
    logger.error(e)
    commonUtil.showToast(translate('Failed to associate facilities'))
  } finally {
    isAssociating.value = false
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
/* Facilities already associated with this product store are read-only: dim and lock the row. */
.associated-facility {
  opacity: 0.55;
  pointer-events: none;
}
/* The label now lives inside ion-checkbox; let its multi-line facility content wrap instead of
   being truncated to a single line (Ionic's default for checkbox labels). */
ion-checkbox::part(label) {
  white-space: normal;
}
</style>
