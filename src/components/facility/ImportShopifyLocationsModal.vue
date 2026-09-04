<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button :aria-label="translate('Close')" @click="closeModal">
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
      <ion-note color="danger">
        {{ fetchError }}
      </ion-note>
      <ion-button fill="clear" @click="fetchData">
        {{ translate("Retry") }}
      </ion-button>
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
            :aria-label="loc.name"
            :checked="selectedIds.has(loc.shopifyLocationId)"
            :disabled="!canSelectLocation(loc)"
            @ion-change="toggleSelection(loc.shopifyLocationId, $event.detail.checked)"
          />

          <ion-label>
            <p class="overline">
              {{ loc.shopifyLocationId }}
            </p>
            {{ loc.name }}
            <p>{{ [loc.city, loc.provinceCode, loc.countryCode].filter(Boolean).join(', ') }}</p>
            <ion-note v-if="loc.isFulfillmentService" color="warning">
              {{ loc.fulfillmentServiceName || translate("Fulfillment Service") }}
            </ion-note>
            <ion-note v-else-if="loc.pickupEnabled" color="success">
              {{ translate("Pickup enabled") }}
            </ion-note>
            <ion-note v-if="isAlreadyAssociated(loc)" color="medium">
              {{ translate("Already in OMS") }}
            </ion-note>
            <ion-note v-else-if="loc.mappedFacilityId" color="warning">
              {{ translate("Already in OMS") }} · {{ translate("Retry") }}
            </ion-note>
            <ion-note v-else-if="loc.alreadyInOms" color="medium">
              {{ translate("Already in OMS") }}
            </ion-note>
          </ion-label>

          <ion-select
            v-if="!loc.alreadyInOms"
            slot="end"
            :aria-label="translate('Type')"
            :value="facilityTypes[loc.shopifyLocationId]"
            :placeholder="translate('Type')"
            interface="popover"
            @ion-change="facilityTypes[loc.shopifyLocationId] = $event.detail.value"
          >
            <ion-select-option value="RETAIL_STORE">
              {{ translate("Retail Store") }}
            </ion-select-option>
            <ion-select-option value="WAREHOUSE">
              {{ translate("Warehouse") }}
            </ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>
    </template>
  </ion-content>

  <ion-footer>
    <ion-toolbar>
      <ion-button
        slot="end"
        strong
        :disabled="selectedForAction.length === 0 || isImporting"
        @click="importSelected"
      >
        <ion-spinner v-if="isImporting" slot="start" name="crescent" />
        <ion-icon v-else slot="start" :icon="selectedForImport.length ? downloadOutline : refreshOutline" />
        {{ translate(selectedForImport.length ? "Import" : "Retry") }}
      </ion-button>
    </ion-toolbar>
  </ion-footer>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common"
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFooter,
  IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList,
  IonNote, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar,
  modalController
} from "@ionic/vue"
import { close, downloadOutline, refreshOutline } from "ionicons/icons"
import { computed, onMounted, ref } from "vue"
import { useFacilityProductStores } from "@/composables/useFacilities";
import { useProductStoreMutations } from "@/composables/useProductStores";
import { fetchLocationsFromShopify, fetchShopifyShopLocations, importShopifyFacilities } from "@/composables/useShopify";
import { refreshAfterMutation } from "@/services/appCacheBootstrap";

const props = defineProps<{ shopId: string, productStoreId?: string }>()
const isLoading = ref(true)
const isImporting = ref(false)
const fetchError = ref("")
const locations = ref<any[]>([])
const selectedIds = ref(new Set<string>())
const facilityTypes = ref<Record<string, string>>({})
const DEFAULT_FACILITY_TYPE_ID = "RETAIL_STORE"
const { associations: productStoreFacilityAssociations } = useFacilityProductStores()

const associatedFacilityIds = computed(() => {
  return new Set((productStoreFacilityAssociations.value || [])
    .filter((association: any) =>
      String(association.productStoreId) === props.productStoreId &&
      (!association.thruDate || Number(association.thruDate) > Date.now()))
    .map((association: any) => String(association.facilityId).trim()))
})

function isAlreadyAssociated(loc: any) {
  return !!loc.mappedFacilityId && associatedFacilityIds.value.has(loc.mappedFacilityId)
}

function canSelectLocation(loc: any) {
  if(!loc.alreadyInOms) {return true}
  if(!loc.mappedFacilityId) {return false}

  return !!props.productStoreId && !isAlreadyAssociated(loc)
}

const selectedForImport = computed(() =>
  locations.value.filter(loc =>
    !loc.alreadyInOms &&
    selectedIds.value.has(loc.shopifyLocationId)))

const selectedForAssociationRetry = computed(() =>
  locations.value.filter(loc =>
    !!loc.mappedFacilityId &&
    canSelectLocation(loc) &&
    selectedIds.value.has(loc.shopifyLocationId)))

const selectedForAction = computed(() => [
  ...selectedForImport.value,
  ...selectedForAssociationRetry.value
])

async function fetchData() {
  isLoading.value = true
  fetchError.value = ""
  selectedIds.value = new Set()
  facilityTypes.value = {}
  try {
    // Both composable functions return UNWRAPPED arrays (Shopify location nodes / mapping rows),
    // not axios envelopes — the store versions returned raw responses.
    const [shopifyNodes, omsMappings] = await Promise.all([
      fetchLocationsFromShopify(props.shopId),
      fetchShopifyShopLocations(props.shopId)
    ])

    const mappingsByLocationId = new Map(omsMappings.map((mapping: any) => [
      String(mapping.shopifyLocationId),
      mapping
    ]))

    const nodes = shopifyNodes
    locations.value = nodes.map((node: any) => {
      const shopifyLocationId = String(node.id).split("/").pop()!
      const mapping: any = mappingsByLocationId.get(shopifyLocationId)

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
        mappedFacilityId:    mapping?.facilityId == null ? "" : String(mapping.facilityId).trim(),
        alreadyInOms:        !!mapping
      }
    })

    locations.value.forEach(loc => {
      if(canSelectLocation(loc)) {
        selectedIds.value.add(loc.shopifyLocationId)
      }
      if(!loc.alreadyInOms) {
        facilityTypes.value[loc.shopifyLocationId] = DEFAULT_FACILITY_TYPE_ID
      }
    })
  } catch (e: any) {
    fetchError.value = e?.message || translate("Failed to fetch locations")
  } finally {
    isLoading.value = false
  }
}

function toggleSelection(id: string, checked: boolean) {
  if(checked) {
    selectedIds.value.add(id)
  } else {
    selectedIds.value.delete(id)
  }
}

async function importSelected() {
  const missing = selectedForImport.value.filter(loc => !facilityTypes.value[loc.shopifyLocationId])
  if(missing.length) {
    commonUtil.showToast(translate("Set a facility type for all selected locations"))

    return
  }

  isImporting.value = true
  try {
    const locationsToImport = selectedForImport.value
    const mappedRetryFacilityIds = selectedForAssociationRetry.value.map(loc => loc.mappedFacilityId)
    const retriedFacilityIds = Array.from(new Set(mappedRetryFacilityIds))
    // Retry existing mappings first. If a separate import fails afterwards, these associations
    // remain fixed and the live ProductStoreFacility cache disables their rows without reimporting.
    const retryAssociationResult = await associateImportedFacilities(retriedFacilityIds)
    let facilityIds: string[] = []

    if(locationsToImport.length) {
      const resp = await importShopifyFacilities(
        props.shopId,
        locationsToImport.map(loc => ({
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
      )

      if(commonUtil.hasError(resp)) {throw resp.data}

      // Moqui invokes store#ShopifyFacility once per item in the POST array. Each result must carry
      // that invocation's top-level facilityId; without it we cannot truthfully refresh, associate,
      // or report the imported facility.
      facilityIds = readImportedFacilityIds(resp.data, locationsToImport.length)
    }
    const imported = facilityIds.length
    // The import created OMS facilities, and the facility lists read the CACHE — without this
    // write-through the new rows stay invisible until the next login sync. (The Shopify-location
    // mapping domain is refreshed inside `importShopifyFacilities` itself.)
    await Promise.allSettled(facilityIds.map(facilityId => refreshAfterMutation("facility", { facilityId })))
    const importAssociationResult = await associateImportedFacilities(facilityIds)
    const associatedFacilityIds = [
      ...retryAssociationResult.associatedFacilityIds,
      ...importAssociationResult.associatedFacilityIds
    ]
    const failedAssociationFacilityIds = [
      ...retryAssociationResult.failedAssociationFacilityIds,
      ...importAssociationResult.failedAssociationFacilityIds
    ]
    const associationFacilityIds = props.productStoreId
      ? Array.from(new Set([...retriedFacilityIds, ...facilityIds]))
      : []
    const associationFailed = failedAssociationFacilityIds.length > 0
    const result = {
      imported,
      retried: retriedFacilityIds.length,
      associated: associatedFacilityIds.length,
      facilityIds,
      retriedFacilityIds,
      associationFacilityIds,
      associatedFacilityIds,
      failedAssociationFacilityIds,
      associationFailed
    }

    if(associationFailed) {
      commonUtil.showToast(translate(imported
        ? "Locations imported, but Product Store association failed"
        : "Failed to update some product store associations"))
      modalController.dismiss(result)

      return
    }

    commonUtil.showToast(imported
      ? translate("{count} locations imported", { count: imported })
      : translate("Facility associations updated successfully."))
    modalController.dismiss(result)
  } catch (e: any) {
    logger.error(e)
    commonUtil.showToast(translate("Import failed"))
  } finally {
    isImporting.value = false
  }
}

function readImportedFacilityIds(data: any, expectedCount: number): string[] {
  if(!Array.isArray(data) || data.length === 0 || data.length !== expectedCount) {
    throw new Error("Shopify facility import returned an unexpected result count")
  }

  const facilityIds = data.map((row: any) =>
    typeof row?.facilityId === "string" ? row.facilityId.trim() : "")

  if(facilityIds.some((facilityId: string) => !facilityId)) {
    throw new Error("Shopify facility import returned a result without facilityId")
  }

  if(new Set(facilityIds).size !== facilityIds.length) {
    throw new Error("Shopify facility import returned duplicate facilityIds")
  }

  return facilityIds
}

async function associateImportedFacilities(facilityIds: string[]) {
  const associatedFacilityIds: string[] = []
  const failedAssociationFacilityIds: string[] = []
  if(!props.productStoreId) {return { associatedFacilityIds, failedAssociationFacilityIds }}

  const mutations = useProductStoreMutations(props.productStoreId)
  for(const facilityId of facilityIds) {
    try {
      const resp = await mutations.addFacility({ facilityId })
      if(commonUtil.hasError(resp)) {throw resp.data}
      associatedFacilityIds.push(facilityId)
    } catch (error: any) {
      logger.error(error)
      failedAssociationFacilityIds.push(facilityId)
    }
  }

  return { associatedFacilityIds, failedAssociationFacilityIds }
}

function closeModal() {
  modalController.dismiss()
}

onMounted(fetchData)
</script>
