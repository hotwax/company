<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ translate("Product calendar mappings") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("Map Shopify product metafields to lifecycle calendar dates.") }}</ion-card-subtitle>
    </ion-card-header>

    <ion-list lines="full">
      <ion-item
        v-for="field in calendarFields"
        :key="field.key"
        :button="hydrated"
        :detail="hydrated"
        :data-testid="`calendar-mapping-${field.key}`"
        @click="openPicker(field.key)"
      >
        <ion-label>
          {{ translate(field.label) }}
          <p v-if="!hydrated">
            <ion-skeleton-text animated />
          </p>
          <p v-else>
            {{ committedValues[field.key] || translate("Not mapped") }}
          </p>
        </ion-label>
      </ion-item>
    </ion-list>

    <CalendarMetafieldPickerModal
      :field="editingFieldConfig"
      :current-selector="editingField ? committedValues[editingField] : ''"
      :system-message-remote-id="remoteId"
      :saving="saving"
      @close="closePicker"
      @save="(selector) => editingField && saveField(editingField, selector)"
    />
  </ion-card>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common"
import {
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonItem,
  IonLabel,
  IonList,
  IonSkeletonText,
} from "@ionic/vue"
import { computed, ref, watch } from "vue"
import CalendarMetafieldPickerModal from "@/components/shopify-product-sync/CalendarMetafieldPickerModal.vue"
import { useShopifyShopMutations, useShopifySyncContext, useShopifyTypeMappings } from "@/composables/useShopify"
import { CACHE_RECONCILIATION_ERROR_MESSAGE, isCacheReconciliationError } from "@/utils/db/cacheReconciliationError"

const CALENDAR_MAPPING_TYPE = "SHOPIFY_PRODUCT_CALENDAR_DATE"

const calendarFields = [
  { key: "introductionDate", label: "Introduction date" },
  { key: "releaseDate", label: "Release date" },
  { key: "supportDiscontinuationDate", label: "Support discontinuation date" },
  { key: "salesDiscontinuationDate", label: "Sales discontinuation date" },
] as const

type CalendarDateField = typeof calendarFields[number]["key"]
type FieldValues = Record<CalendarDateField, string>

const props = defineProps<{ shopId: string }>()
const { mappings, hydrated } = useShopifyTypeMappings(props.shopId, CALENDAR_MAPPING_TYPE)
const { remoteId } = useShopifySyncContext(() => props.shopId)
const shopMutations = useShopifyShopMutations(props.shopId)

function emptyValues(): FieldValues {
  return calendarFields.reduce((values, field) => {
    values[field.key] = ""

    return values
  }, {} as FieldValues)
}

function normalize(value: unknown) {
  return String(value ?? "").trim()
}

const mappingByField = computed<Partial<Record<CalendarDateField, Record<string, unknown>>>>(() => {
  return mappings.value.reduce((byField: Partial<Record<CalendarDateField, Record<string, unknown>>>, mapping: Record<string, unknown>) => {
    const field = calendarFields.find((candidate) => candidate.key === mapping.mappedKey)?.key
    if(field) {
      byField[field] = mapping
    }

    return byField
  }, {})
})
// Follows the cache, except after a committed write whose cache refresh failed (see saveField).
const committedValues = ref<FieldValues>(emptyValues())
// Every save refreshes the shop's whole type-mapping partition. The picker stays open and cannot be
// dismissed while a save is pending, so saves never overlap.
const saving = ref(false)
const editingField = ref<CalendarDateField | null>(null)
const editingFieldConfig = computed(() => calendarFields.find((field) => field.key === editingField.value) ?? null)

watch(mappingByField, (currentMappings) => {
  calendarFields.forEach((field) => {
    committedValues.value[field.key] = normalize(currentMappings[field.key]?.mappedValue)
  })
}, { immediate: true })

function openPicker(field: CalendarDateField) {
  if(hydrated.value && props.shopId) {
    editingField.value = field
  }
}

function closePicker() {
  if(!saving.value) {
    editingField.value = null
  }
}

async function saveField(field: CalendarDateField, selector: string) {
  const mappedValue = normalize(selector)
  if(saving.value || mappedValue === committedValues.value[field]) {
    return
  }

  saving.value = true
  try {
    const response = mappedValue
      ? await shopMutations.saveTypeMapping({
        mappedTypeId: CALENDAR_MAPPING_TYPE,
        mappedKey: field,
        mappedValue,
      })
      : await shopMutations.deleteTypeMapping({ mappedKey: field })
    if(commonUtil.hasError(response)) {
      throw response.data
    }
    committedValues.value[field] = mappedValue
    editingField.value = null
    commonUtil.showToast(translate("Mapping updated successfully"))
  } catch (error) {
    logger.error(error)
    if(isCacheReconciliationError(error)) {
      // The server write is committed; only the cache refresh failed, so never offer to replay it.
      committedValues.value[field] = mappedValue
      editingField.value = null
      commonUtil.showToast(translate(CACHE_RECONCILIATION_ERROR_MESSAGE))
    } else {
      // Keep the picker open with the operator's choice so they can retry or cancel.
      commonUtil.showToast(translate("Failed to update mapping"))
    }
  } finally {
    saving.value = false
  }
}
</script>
