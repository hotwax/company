<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ translate("Product calendar mappings") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("Map Shopify product metafields to lifecycle calendar dates.") }}</ion-card-subtitle>
    </ion-card-header>

    <ion-list lines="full">
      <ion-item v-for="field in calendarFields" :key="field.key" :data-testid="`calendar-mapping-${field.key}`">
        <ion-input
          :label="translate(field.label)"
          label-placement="stacked"
          :placeholder="translate('namespace:key')"
          :value="drafts[field.key]"
          @ion-input="updateDraft(field.key, $event.detail.value)"
        />
        <ion-button
          slot="end"
          fill="clear"
          :disabled="!shopId || !isDirty(field.key) || savingFields[field.key]"
          :data-testid="`save-calendar-mapping-${field.key}`"
          @click="saveField(field.key)"
        >
          {{ translate("Save") }}
          <ion-icon slot="end" :icon="saveOutline" />
        </ion-button>
      </ion-item>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
} from "@ionic/vue"
import { saveOutline } from "ionicons/icons"
import { computed, ref, watch } from "vue"
import { commonUtil, logger, translate } from "@common"
import { useShopifyShopMutations, useShopifyTypeMappings } from "@/composables/useShopify"

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
const { mappings } = useShopifyTypeMappings(props.shopId, CALENDAR_MAPPING_TYPE)
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
    if (field) byField[field] = mapping
    return byField
  }, {})
})
const drafts = ref<FieldValues>(emptyValues())
const committedValues = ref<FieldValues>(emptyValues())
const savingFields = ref<Record<CalendarDateField, boolean>>(calendarFields.reduce((values, field) => {
  values[field.key] = false
  return values
}, {} as Record<CalendarDateField, boolean>))

watch(mappingByField, (currentMappings) => {
  calendarFields.forEach((field) => {
    const mappedValue = normalize(currentMappings[field.key]?.mappedValue)
    if (drafts.value[field.key] === committedValues.value[field.key]) drafts.value[field.key] = mappedValue
    committedValues.value[field.key] = mappedValue
  })
}, { immediate: true })

function updateDraft(field: CalendarDateField, value: unknown) {
  drafts.value[field] = String(value ?? "")
}

function isDirty(field: CalendarDateField) {
  return normalize(drafts.value[field]) !== committedValues.value[field]
}

async function saveField(field: CalendarDateField) {
  const mappedValue = normalize(drafts.value[field])
  if (!isDirty(field)) return

  savingFields.value[field] = true
  try {
    const response = mappedValue
      ? await shopMutations.saveTypeMapping({
        mappedTypeId: CALENDAR_MAPPING_TYPE,
        mappedKey: field,
        mappedValue,
      })
      : await shopMutations.retireTypeMapping({
        mappedTypeId: CALENDAR_MAPPING_TYPE,
        mappedKey: field,
      })
    if (commonUtil.hasError(response)) {
      throw response.data
    }
    committedValues.value[field] = mappedValue
    commonUtil.showToast(translate("Mapping updated successfully"))
  } catch (error) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to update mapping"))
  } finally {
    savingFields.value[field] = false
  }
}
</script>
