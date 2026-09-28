<template>
  <ion-modal :is-open="!!field" :can-dismiss="!saving" @did-dismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" :disabled="saving" @click="emit('close')">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ field ? translate(field.label) : "" }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="mode">
          <ion-segment-button value="list" data-testid="metafield-mode-list">
            <ion-label>{{ translate("From Shopify") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="manual" data-testid="metafield-mode-manual">
            <ion-label>{{ translate("Enter manually") }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <ion-toolbar v-if="mode === 'list'">
        <ion-searchbar v-model="query" :placeholder="translate('Search metafields')" />
      </ion-toolbar>
    </ion-header>

    <ion-content ref="content">
      <template v-if="mode === 'list'">
        <ion-list v-if="loading">
          <ion-item lines="none">
            <ion-spinner slot="start" name="crescent" />
            <ion-label>{{ translate("Loading Shopify metafields") }}</ion-label>
          </ion-item>
        </ion-list>
        <ion-list v-else-if="loadError">
          <ion-item lines="none" data-testid="metafield-load-error">
            <ion-label class="ion-text-wrap" color="danger">
              {{ loadError }}
            </ion-label>
            <ion-button slot="end" fill="clear" @click="loadDefinitions">
              {{ translate("Check again") }}
            </ion-button>
          </ion-item>
        </ion-list>
        <ion-radio-group v-else v-model="selectedOption">
          <ion-list v-for="group in groups" :key="group.ownerType">
            <ion-list-header>{{ translate(group.label) }}</ion-list-header>
            <ion-item v-for="definition in group.definitions" :key="optionValue(definition)">
              <ion-radio :value="optionValue(definition)" label-placement="end" justify="start">
                <ion-label>
                  {{ definition.name }}
                  <p>{{ definition.selector }}</p>
                  <p>{{ translate(typeLabel(definition.type)) }}</p>
                </ion-label>
              </ion-radio>
            </ion-item>
            <ion-item v-if="!group.definitions.length" lines="none">
              <ion-label>{{ translate(query ? "No matching date metafields" : "No date metafields") }}</ion-label>
            </ion-item>
          </ion-list>
        </ion-radio-group>
      </template>

      <ion-list v-else>
        <ion-item>
          <ion-input
            v-model="manualSelector"
            :label="translate('Metafield')"
            label-placement="stacked"
            :placeholder="translate('namespace:key')"
            data-testid="manual-metafield-input"
          />
          <ion-button
            slot="end"
            fill="clear"
            :disabled="checking || !manualSelector.trim()"
            data-testid="check-manual-metafield"
            @click="checkManualSelector"
          >
            {{ translate("Check on Shopify") }}
          </ion-button>
        </ion-item>
        <!-- Always rendered, so a check swaps its text instead of adding or removing a row. -->
        <ion-item lines="none" data-testid="manual-metafield-result">
          <ion-spinner v-if="checking" slot="start" name="crescent" />
          <ion-icon v-else slot="start" :icon="manualStatus.icon" :color="manualStatus.iconColor" />
          <ion-label class="ion-text-wrap">
            {{ manualStatus.message }}
          </ion-label>
        </ion-item>
        <ion-item v-if="needsAcknowledgement" lines="none">
          <ion-checkbox v-model="acknowledged" label-placement="end" justify="start" data-testid="acknowledge-metafield-warning">
            <div class="ion-text-wrap">
              {{ translate("I understand these dates may not be populated if the metafield on Shopify is different.") }}
            </div>
          </ion-checkbox>
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button v-if="currentSelector" color="danger" :disabled="saving" data-testid="remove-calendar-mapping" @click="emit('save', '')">
            {{ translate("Remove mapping") }}
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button fill="solid" :disabled="!canSave || saving" data-testid="save-calendar-mapping" @click="emit('save', chosenSelector)">
            <ion-spinner v-if="saving" name="crescent" />
            <template v-else>
              {{ translate("Save") }}
            </template>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import { logger, translate } from "@common"
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonRadio,
  IonRadioGroup,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/vue"
import { alertCircleOutline, checkmarkCircleOutline, closeCircleOutline, closeOutline, informationCircleOutline } from "ionicons/icons"
import { computed, ref, watch } from "vue"
import { fetchShopifyMetafieldDefinitions } from "@/composables/useShopify"
import {
  type MetafieldSelectorCheck,
  type ShopifyMetafieldDefinition,
  checkMetafieldSelector,
  isCalendarMetafieldType,
} from "@/utils/shopifyMetafieldDefinitions"

const props = defineProps<{
  field: { key: string; label: string } | null
  currentSelector: string
  systemMessageRemoteId: string
  saving: boolean
}>()
const emit = defineEmits<{ close: []; save: [selector: string] }>()

const content = ref()
const definitions = ref<ShopifyMetafieldDefinition[]>([])
const loading = ref(false)
const loadError = ref("")
const mode = ref<"list" | "manual">("list")
const query = ref("")
const selectedOption = ref("")
const manualSelector = ref("")
const checking = ref(false)
// A check answers for exactly the value that was checked; editing the input discards it.
const manualCheck = ref<{ selector: string; result: MetafieldSelectorCheck | { status: "unverified"; error: string } } | null>(null)
const acknowledged = ref(false)

function optionValue(definition: ShopifyMetafieldDefinition) {
  return `${definition.ownerType}|${definition.selector}`
}

function typeLabel(type: string) {
  return type === "date_time" ? "Date and time" : "Date"
}

const calendarDefinitions = computed(() => definitions.value.filter((definition) => isCalendarMetafieldType(definition.type)))

const groups = computed(() => {
  const search = query.value.trim().toLowerCase()
  const visible = calendarDefinitions.value.filter((definition) => !search ||
    [definition.name, definition.namespace, definition.key].some((text) => text.toLowerCase().includes(search)))

  return [
    { ownerType: "PRODUCT", label: "Product metafields", definitions: visible.filter((definition) => definition.ownerType === "PRODUCT") },
    { ownerType: "PRODUCTVARIANT", label: "Variant metafields", definitions: visible.filter((definition) => definition.ownerType === "PRODUCTVARIANT") },
  ]
})

const currentManualCheck = computed(() => manualCheck.value?.selector === manualSelector.value.trim() ? manualCheck.value.result : null)

const manualStatus = computed(() => {
  const result = currentManualCheck.value
  const selector = manualSelector.value.trim()
  if(checking.value) {
    return { icon: informationCircleOutline, iconColor: "medium", message: translate("Checking Shopify") }
  }
  if(!result) {
    return { icon: informationCircleOutline, iconColor: "medium", message: translate("Check the metafield on Shopify before saving.") }
  }
  if(result.status === "match") {
    return { icon: checkmarkCircleOutline, iconColor: "success", message: translate("Matches {name} on Shopify.", { name: result.matches[0].name }) }
  }
  if(result.status === "invalid") {
    return { icon: closeCircleOutline, iconColor: "danger", message: translate("Use namespace:key, for example custom:release_date.") }
  }
  if(result.status === "wrong-type") {
    return {
      icon: alertCircleOutline,
      iconColor: "warning",
      message: translate("{selector} exists on Shopify as {type}, not a date. The sync skips metafields that are not a date or date and time.", { selector, type: result.matches[0].type }),
    }
  }
  if(result.status === "no-match") {
    return { icon: alertCircleOutline, iconColor: "warning", message: translate("No product or variant metafield definition on Shopify matches {selector}.", { selector }) }
  }

  return { icon: alertCircleOutline, iconColor: "warning", message: translate("Could not check Shopify. {error}", { error: result.error }) }
})

const needsAcknowledgement = computed(() => ["wrong-type", "no-match", "unverified"].includes(currentManualCheck.value?.status ?? ""))

const chosenSelector = computed(() => {
  if(mode.value === "manual") {return manualSelector.value.trim()}

  return calendarDefinitions.value.find((definition) => optionValue(definition) === selectedOption.value)?.selector ?? ""
})

const canSave = computed(() => {
  if(!chosenSelector.value || chosenSelector.value === props.currentSelector) {return false}
  if(mode.value === "list") {return true}
  const status = currentManualCheck.value?.status

  return status === "match" || (needsAcknowledgement.value && acknowledged.value)
})

watch(currentManualCheck, () => {
  acknowledged.value = false
})

watch(mode, () => {
  void content.value?.$el?.scrollToTop?.(0)
})

async function loadDefinitions() {
  loading.value = true
  loadError.value = ""
  try {
    definitions.value = await fetchShopifyMetafieldDefinitions(props.systemMessageRemoteId)
  } catch (error: any) {
    logger.error(error)
    loadError.value = error?.message || translate("Could not load Shopify metafields.")
  } finally {
    loading.value = false
  }
}

// Re-reads Shopify without the list's loading state, so the list never collapses under the form.
async function checkManualSelector() {
  const selector = manualSelector.value.trim()
  // The connector cannot parse a malformed value, so reject it without asking Shopify.
  if(checkMetafieldSelector(selector, definitions.value).status === "invalid") {
    manualCheck.value = { selector, result: { status: "invalid" } }

    return
  }
  checking.value = true
  try {
    definitions.value = await fetchShopifyMetafieldDefinitions(props.systemMessageRemoteId)
    loadError.value = ""
    manualCheck.value = { selector, result: checkMetafieldSelector(selector, definitions.value) }
  } catch (error: any) {
    logger.error(error)
    manualCheck.value = { selector, result: { status: "unverified", error: error?.message || translate("Could not load Shopify metafields.") } }
  } finally {
    checking.value = false
  }
}

watch(() => props.field?.key, async (fieldKey) => {
  if(!fieldKey) {return}
  mode.value = "list"
  query.value = ""
  selectedOption.value = ""
  manualSelector.value = ""
  manualCheck.value = null
  acknowledged.value = false
  await loadDefinitions()
  if(!props.currentSelector) {return}
  const current = calendarDefinitions.value.find((definition) => definition.selector === props.currentSelector)
  if(current) {
    selectedOption.value = optionValue(current)
  } else {
    mode.value = "manual"
    manualSelector.value = props.currentSelector
  }
}, { immediate: true })
</script>
