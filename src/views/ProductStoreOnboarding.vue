<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/product-store" slot="start" />
        <ion-title>{{ translate("Create product store") }}</ion-title>
        <ion-progress-bar :value="onboardingStore.progressValue" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main class="product-store-onboarding">
        <section class="onboarding-steps">
          <ion-list lines="none">
            <ion-list-header>
              <ion-label>
                {{ translate("Progress") }}
                <p>{{ onboardingStore.completedCount }} {{ translate("of") }} {{ onboardingStore.totalStepCount }} {{ translate("steps complete") }}</p>
              </ion-label>
            </ion-list-header>
          </ion-list>

          <onboarding-step-list
            :groups="PRODUCT_STORE_ONBOARDING_GROUPS"
            :steps="PRODUCT_STORE_ONBOARDING_STEPS"
            :current-step-id="onboardingStore.currentStepId"
            :completed-step-ids="onboardingStore.completedStepIds"
            @select-step="onboardingStore.selectStep"
          />
        </section>

        <section class="onboarding-task">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate(currentStep.label) }}</ion-card-title>
              <ion-card-subtitle>{{ translate(currentStep.summary) }}</ion-card-subtitle>
            </ion-card-header>

            <ion-list v-if="currentStep.id === 'name'" lines="full">
              <ion-item v-if="shouldCollectCompanyName">
                <ion-input
                  :value="onboardingStore.draft.companyName"
                  label-placement="stacked"
                  :helper-text="translate('The parent organization that owns this first Product Store')"
                  :clear-input="true"
                  @ionInput="onboardingStore.updateDraftField('companyName', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Company name") }} <ion-text color="danger">*</ion-text></div>
                </ion-input>
              </ion-item>
              <ion-item>
                <ion-input
                  :value="onboardingStore.draft.storeName"
                  label-placement="stacked"
                  :helper-text="translate('Product store represents a brand in OMS')"
                  :clear-input="true"
                  @ionInput="onboardingStore.updateDraftField('storeName', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
                </ion-input>
              </ion-item>
              <ion-item>
                <ion-input
                  :value="onboardingStore.draft.productStoreId"
                  label-placement="stacked"
                  :label="translate('ID')"
                  :helper-text="translate('Product store ID represents an unique ID for your product store')"
                  :clear-input="true"
                  @ionInput="onboardingStore.updateDraftField('productStoreId', String($event.detail.value || ''))"
                />
              </ion-item>
              <ion-item>
                <ion-select
                  interface="popover"
                  :value="onboardingStore.draft.defaultCurrencyUomId"
                  @ionChange="onboardingStore.updateDraftField('defaultCurrencyUomId', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Currency") }} <ion-text color="danger">*</ion-text></div>
                  <ion-select-option v-for="currency in currencyOptions" :key="currency.uomId" :value="currency.uomId">
                    {{ currency.label }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Locale") }}</ion-label>
                <ion-note slot="end">{{ onboardingStore.draft.locale }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Timezone") }}</ion-label>
                <ion-note slot="end">{{ onboardingStore.draft.timezone }}</ion-note>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'general'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Order import defaults") }}
                  <p>{{ translate("These values control how new imported orders are identified, approved, and stored.") }}</p>
                </ion-label>
                <ion-badge :color="selectedProductStoreId ? 'success' : 'warning'" slot="end">
                  {{ selectedProductStoreId ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-item>
                <ion-input
                  :value="onboardingStore.draft.orderNumberPrefix"
                  label-placement="stacked"
                  :label="translate('Sales order ID prefix')"
                  :helper-text="translate('Added to HotWax sales order IDs generated for this Product Store')"
                  :clear-input="true"
                  @ionInput="onboardingStore.updateDraftField('orderNumberPrefix', String($event.detail.value || ''))"
                />
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.autoApproveOrder === 'Y'"
                  @ionChange="onboardingStore.updateDraftField('autoApproveOrder', $event.detail.checked ? 'Y' : 'N')"
                >
                  {{ translate("Approve imported orders") }}
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.saveBillingInformation === 'Y'"
                  @ionChange="onboardingStore.updateDraftField('saveBillingInformation', $event.detail.checked ? 'Y' : 'N')"
                >
                  {{ translate("Save billing information") }}
                </ion-toggle>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'shopify'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Connect a Shopify store") }}
                  <p>{{ translate("A Shopify store cannot be linked to more than one product store at a time.") }}</p>
                </ion-label>
                <ion-badge :color="linkedShopifyShop ? 'success' : 'warning'" slot="end">
                  {{ linkedShopifyShop ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-radio-group
                :value="onboardingStore.draft.shopifyConnectionMode"
                @ionChange="onboardingStore.updateDraftField('shopifyConnectionMode', String($event.detail.value || ''))"
              >
                <ion-item>
                  <ion-radio slot="start" value="Connect now" />
                  <ion-label>{{ translate("Connect now") }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-radio slot="start" value="Use existing Shopify shop" />
                  <ion-label>{{ translate("Use existing Shopify shop") }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-radio slot="start" value="Prepare Shopify connection" />
                  <ion-label>{{ translate("Prepare Shopify connection") }}</ion-label>
                </ion-item>
              </ion-radio-group>
              <ion-item v-if="isExistingShopifyMode && linkedShopifyShop">
                <ion-label>
                  {{ translate("Linked Shopify shop") }}
                  <p>{{ linkedShopifyShop.name || linkedShopifyShop.myshopifyDomain || linkedShopifyShop.shopId }}</p>
                </ion-label>
                <ion-badge color="success" slot="end">{{ translate("Ready") }}</ion-badge>
              </ion-item>
              <ion-item v-if="isExistingShopifyMode && !linkedShopifyShop && availableShopifyShops.length">
                <ion-select
                  interface="popover"
                  :value="onboardingStore.draft.selectedShopifyShopId"
                  @ionChange="onboardingStore.updateDraftField('selectedShopifyShopId', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Existing Shopify shop") }} <ion-text color="danger">*</ion-text></div>
                  <ion-select-option v-for="shop in availableShopifyShops" :key="shop.shopId" :value="shop.shopId">
                    {{ getShopifyShopLabel(shop) }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item v-if="isExistingShopifyMode && !linkedShopifyShop && !availableShopifyShops.length">
                <ion-label>
                  {{ translate("No available Shopify connection") }}
                  <p>{{ translate("Create the Shopify connection first, then return to link it here.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
              <ion-item v-if="!isExistingShopifyMode">
                <ion-input
                  :value="onboardingStore.draft.shopifyDomain"
                  label-placement="stacked"
                  :label="translate('Shopify domain')"
                  :clear-input="true"
                  @ionInput="onboardingStore.updateDraftField('shopifyDomain', String($event.detail.value || ''))"
                />
              </ion-item>
              <ion-item v-if="onboardingStore.draft.shopifyConnectionMode === 'Connect now'">
                <ion-label>
                  {{ translate("Connection handoff") }}
                  <p>{{ translate("Generating an integration token and app handoff remains a backend setup gap.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'products'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Product matching") }}
                  <p>{{ translate("Choose the identifier HotWax should trust when matching Shopify products and variants.") }}</p>
                </ion-label>
                <ion-badge :color="onboardingStore.draft.productIdentifierEnumId ? 'success' : 'warning'" slot="end">
                  {{ onboardingStore.draft.productIdentifierEnumId ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-item>
                <ion-select
                  interface="popover"
                  :value="onboardingStore.draft.productIdentifierEnumId"
                  @ionChange="onboardingStore.updateDraftField('productIdentifierEnumId', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Global identifier") }} <ion-text color="danger">*</ion-text></div>
                  <ion-select-option v-for="identifier in productIdentifierOptions" :key="identifier.enumId" :value="identifier.enumId">
                    {{ identifier.description || identifier.enumId }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select
                  interface="popover"
                  :value="preferredPrimaryProductIdentification"
                  @ionChange="onboardingStore.updateDraftField('primaryProductIdentification', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Primary identifier") }}</div>
                  <ion-select-option value="">{{ translate("Not selected") }}</ion-select-option>
                  <ion-select-option v-for="identifier in productIdentifierOptions" :key="identifier.enumId" :value="identifier.enumId">
                    {{ identifier.description || identifier.enumId }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select
                  interface="popover"
                  :value="preferredSecondaryProductIdentification"
                  @ionChange="onboardingStore.updateDraftField('secondaryProductIdentification', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Secondary identifier") }}</div>
                  <ion-select-option value="">{{ translate("Not selected") }}</ion-select-option>
                  <ion-select-option v-for="identifier in productIdentifierOptions" :key="identifier.enumId" :value="identifier.enumId">
                    {{ identifier.description || identifier.enumId }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Shopify product import") }}
                  <p>{{ productSyncHandoffDescription }}</p>
                </ion-label>
                <ion-badge :color="canOpenShopifyProductSync ? 'success' : 'warning'" slot="end">
                  {{ canOpenShopifyProductSync ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-item v-if="linkedShopifyShop">
                <ion-icon slot="start" :icon="syncOutline" />
                <ion-label>
                  {{ translate("Product import workspace") }}
                  <p>{{ translate("Review live Shopify catalog counts before starting the first import.") }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="onboarding-open-product-sync"
                  :aria-label="translate('Open product import')"
                  :disabled="!canOpenShopifyProductSync || isSavingProductIdentity"
                  @click="openShopifyProductSync()"
                >
                  <ion-spinner v-if="isSavingProductIdentity" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="openOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-else>
                <ion-label>
                  {{ translate("Shopify shop required") }}
                  <p>{{ translate("Link a Shopify shop before importing products.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'facilities'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Business locations") }}
                  <p>{{ translate("Import Shopify locations as HotWax facilities, then map inventory locations before sync starts.") }}</p>
                </ion-label>
                <ion-badge :color="facilityCount ? 'success' : 'warning'" slot="end">
                  {{ facilityCount ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-radio-group
                :value="onboardingStore.draft.facilityMode"
                @ionChange="onboardingStore.updateDraftField('facilityMode', String($event.detail.value || ''))"
              >
                <ion-item>
                  <ion-radio slot="start" value="One store" />
                  <ion-label>{{ translate("One store") }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-radio slot="start" value="Stores and warehouses" />
                  <ion-label>{{ translate("Stores and warehouses") }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-radio slot="start" value="Not sure yet" />
                  <ion-label>{{ translate("Not sure yet") }}</ion-label>
                </ion-item>
              </ion-radio-group>
              <ion-item>
                <ion-icon slot="start" :icon="storefrontOutline" />
                <ion-label>
                  {{ translate("HotWax facilities") }}
                  <p>{{ facilityCount }} {{ translate("facilities available for setup") }}</p>
                </ion-label>
                <ion-note slot="end">{{ facilityCount }}</ion-note>
              </ion-item>
              <ion-item v-if="linkedShopifyShop">
                <ion-icon slot="start" :icon="cloudDownloadOutline" />
                <ion-label>
                  {{ translate("Import from Shopify") }}
                  <p>{{ linkedShopifyShop.myshopifyDomain || linkedShopifyShop.name || linkedShopifyShop.shopId }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="onboarding-import-shopify-facilities"
                  :aria-label="translate('Import from Shopify')"
                  :disabled="isImportingShopifyFacilities"
                  @click="openShopifyLocationImport()"
                >
                  <ion-spinner v-if="isImportingShopifyFacilities" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="cloudDownloadOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-else>
                <ion-label>
                  {{ translate("Shopify shop required") }}
                  <p>{{ translate("Link a Shopify shop before importing locations as facilities.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'locations'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Shopify location mapping") }}
                  <p>{{ translate("Each active Shopify inventory location should point to the matching HotWax facility.") }}</p>
                </ion-label>
                <ion-badge :color="mappedShopifyLocationCount ? 'success' : 'warning'" slot="end">
                  {{ mappedShopifyLocationCount ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="gitNetworkOutline" />
                <ion-label>
                  {{ translate("Mapped facilities") }}
                  <p>{{ mappedShopifyLocationCount }} {{ translate("of") }} {{ facilityCount }} {{ translate("facilities have Shopify locations") }}</p>
                </ion-label>
                <ion-note slot="end">{{ mappedShopifyLocationCount }}</ion-note>
              </ion-item>
              <ion-item v-if="linkedShopifyShop">
                <ion-label>
                  {{ translate("Open mapping workspace") }}
                  <p>{{ translate("Use the existing inventory location audit and mapping screen.") }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="onboarding-open-location-mapping"
                  :aria-label="translate('Open mapping workspace')"
                  @click="openShopifyLocationMapping()"
                >
                  <ion-icon slot="icon-only" :icon="gitNetworkOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-else>
                <ion-label>
                  {{ translate("Shopify shop required") }}
                  <p>{{ translate("Link a Shopify shop before mapping inventory locations.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.group === 'workflows'" lines="full">
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.selectedWorkflows.includes(currentStep.id)"
                  @ionChange="onboardingStore.toggleWorkflow(currentStep.id, $event.detail.checked)"
                >
                  {{ translate("Enable workflow") }}
                </ion-toggle>
              </ion-item>
              <ion-item v-for="question in currentStep.questions" :key="question">
                <ion-label>{{ translate(question) }}</ion-label>
                <ion-icon slot="end" :icon="radioButtonOffOutline" color="medium" />
              </ion-item>
            </ion-list>

            <ion-list v-else lines="full">
              <ion-item v-for="question in currentStep.questions" :key="question">
                <ion-label>{{ translate(question) }}</ion-label>
                <ion-icon slot="end" :icon="radioButtonOffOutline" color="medium" />
              </ion-item>
            </ion-list>

            <ion-list lines="full">
              <ion-list-header>
                <ion-label>{{ translate("Setup package") }}</ion-label>
              </ion-list-header>
              <ion-item v-if="selectedProductStoreId">
                <ion-label>
                  {{ translate("Created product store") }}
                  <p>{{ selectedProductStoreId }}</p>
                </ion-label>
                <ion-badge slot="end" color="success">{{ translate("Ready") }}</ion-badge>
              </ion-item>
              <ion-item v-for="output in currentStep.outputs" :key="output">
                <ion-label>{{ translate(output) }}</ion-label>
                <ion-badge slot="end" :color="capabilityColor">{{ translate(capabilityLabel) }}</ion-badge>
              </ion-item>
            </ion-list>

            <ion-card-content>
              <ion-button fill="clear" :disabled="onboardingStore.currentStepIndex === 0" @click="onboardingStore.goPrevious()">
                <ion-icon slot="start" :icon="arrowBackOutline" />
                {{ translate("Back") }}
              </ion-button>
              <ion-button :disabled="isPrimaryActionDisabled" @click="handlePrimaryAction()">
                {{ primaryActionLabel }}
                <ion-spinner v-if="isPrimaryActionLoading" slot="end" name="crescent" />
                <ion-icon v-else slot="end" :icon="arrowForwardOutline" />
              </ion-button>
            </ion-card-content>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from "@ionic/vue"
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { arrowBackOutline, arrowForwardOutline, cloudDownloadOutline, gitNetworkOutline, openOutline, radioButtonOffOutline, storefrontOutline, syncOutline } from "ionicons/icons"
import { commonUtil, emitter, logger, translate } from "@common"
import ImportShopifyLocationsModal from "@/components/ImportShopifyLocationsModal.vue"
import OnboardingStepList from "@/components/product-store-onboarding/OnboardingStepList.vue"
import { PRODUCT_STORE_ONBOARDING_GROUPS, PRODUCT_STORE_ONBOARDING_STEPS } from "@/config/productStoreOnboarding"
import { useProductStoreOnboardingStore } from "@/store/productStoreOnboarding"
import { useProductStore } from "@/store/productStore"
import { useShopifyStore } from "@/store/shopify"
import { useUtilStore } from "@/store/util"
import { generateInternalId } from "@/utils"

const onboardingStore = useProductStoreOnboardingStore()
const productStoreStore = useProductStore()
const shopifyStore = useShopifyStore()
const utilStore = useUtilStore()
const props = defineProps<{ productStoreId?: string }>()
const route = useRoute()
const router = useRouter()
const isSavingProductStore = ref(false)
const isLinkingShopifyShop = ref(false)
const isImportingShopifyFacilities = ref(false)
const isSavingProductIdentity = ref(false)
const isSavingOrderDefaults = ref(false)
const isLoadingSetupData = ref(false)
const shopifyLocationMappings = ref<any[]>([])

const currentStep = computed(() => onboardingStore.currentStep)
const isLastStep = computed(() => onboardingStore.currentStepIndex === PRODUCT_STORE_ONBOARDING_STEPS.length - 1)
const routeProductStoreId = computed(() => {
  if (props.productStoreId) return props.productStoreId

  const productStoreId = (route as any)?.params?.productStoreId
  if (Array.isArray(productStoreId)) return productStoreId[0] || ""
  return productStoreId ? String(productStoreId) : ""
})
const selectedProductStoreId = computed(() => onboardingStore.createdProductStoreId || routeProductStoreId.value)
const shouldCollectCompanyName = computed(() => productStoreStore.productStores.length === 0)
const organizationPartyId = computed(() => utilStore.organizationPartyId)
const isPrimaryActionLoading = computed(() => isSavingProductStore.value || isLinkingShopifyShop.value || isImportingShopifyFacilities.value || isSavingProductIdentity.value || isSavingOrderDefaults.value)
const isExistingShopifyMode = computed(() => onboardingStore.draft.shopifyConnectionMode === "Use existing Shopify shop")
const availableShopifyShops = computed(() => {
  return shopifyStore.shops.filter((shop: any) => {
    return !shop.productStoreId
      || shop.productStoreId === selectedProductStoreId.value
      || shop.shopId === onboardingStore.draft.linkedShopifyShopId
  })
})
const linkedShopifyShop = computed(() => {
  const linkedShopId = onboardingStore.draft.linkedShopifyShopId
  if (linkedShopId) return shopifyStore.getShopById(linkedShopId) || { shopId: linkedShopId }

  return shopifyStore.shops.find((shop: any) => shop.productStoreId === selectedProductStoreId.value) || null
})
const linkedShopifyShopId = computed(() => linkedShopifyShop.value?.shopId || "")
const facilityCount = computed(() => utilStore.facilities.length)
const mappedShopifyLocationCount = computed(() => shopifyLocationMappings.value.length)
const productIdentifierOptions = computed(() => utilStore.productIdentifiers)
const canOpenShopifyProductSync = computed(() => {
  return !!selectedProductStoreId.value && !!linkedShopifyShopId.value && !!onboardingStore.draft.productIdentifierEnumId
})
const productSyncHandoffDescription = computed(() => {
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before importing products.")
  if (!onboardingStore.draft.productIdentifierEnumId) return translate("Choose the product identifier before importing products.")
  return translate("Open the existing first-time product sync wizard with this Product Store and identifier preselected.")
})
const productIdentityPreferences = computed(() => {
  const settingValue = productStoreStore.currentStoreSettings?.PRDT_IDEN_PREF?.settingValue
  if (!settingValue) return {} as any

  try {
    return JSON.parse(settingValue)
  } catch (error: any) {
    logger.error(error)
    return {} as any
  }
})
const preferredPrimaryProductIdentification = computed(() => onboardingStore.draft.primaryProductIdentification || productIdentityPreferences.value.primaryId || "")
const preferredSecondaryProductIdentification = computed(() => onboardingStore.draft.secondaryProductIdentification || productIdentityPreferences.value.secondaryId || "")
const currencyOptions = computed(() => {
  if (utilStore.currencies.length) {
    return utilStore.currencies.map((currency: any) => ({
      uomId: currency.uomId,
      label: `${currency.description} (${currency.abbreviation})`
    }))
  }

  return [
    { uomId: "USD", label: translate("USD") },
    { uomId: "CAD", label: translate("CAD") },
    { uomId: "GBP", label: translate("GBP") }
  ]
})
const nextLabel = computed(() => {
  const nextStep = PRODUCT_STORE_ONBOARDING_STEPS[onboardingStore.currentStepIndex + 1]
  return nextStep ? translate(nextStep.label) : translate("Review")
})
const primaryActionLabel = computed(() => {
  if (currentStep.value.id === "name" && !selectedProductStoreId.value) return translate("Create product store")
  if (currentStep.value.id === "general") return translate("Save order defaults")
  if (currentStep.value.id === "shopify" && isExistingShopifyMode.value && !linkedShopifyShop.value) return translate("Link Shopify")
  if (currentStep.value.id === "products") return translate("Save product identity")
  return nextLabel.value
})
const isPrimaryActionDisabled = computed(() => {
  if (isLastStep.value || isLoadingSetupData.value || isPrimaryActionLoading.value) return true

  if (currentStep.value.id === "name" && !selectedProductStoreId.value) {
    return !onboardingStore.draft.storeName.trim()
      || !onboardingStore.draft.defaultCurrencyUomId
      || (shouldCollectCompanyName.value && !onboardingStore.draft.companyName.trim())
  }

  if (currentStep.value.id === "shopify" && isExistingShopifyMode.value && !linkedShopifyShop.value) {
    return !selectedProductStoreId.value || !onboardingStore.draft.selectedShopifyShopId
  }

  if (currentStep.value.id === "general") {
    return !selectedProductStoreId.value
  }

  if (currentStep.value.id === "products") {
    return !selectedProductStoreId.value || !onboardingStore.draft.productIdentifierEnumId
  }

  return false
})
const capabilityLabel = computed(() => {
  if (currentStep.value.capability === "backend-gap") return "Gap"
  if (currentStep.value.capability === "existing-api") return "Existing API"
  return "Preview"
})
const capabilityColor = computed(() => {
  if (currentStep.value.capability === "backend-gap") return "warning"
  if (currentStep.value.capability === "existing-api") return "success"
  return "medium"
})

onIonViewWillEnter(async () => {
  if (routeProductStoreId.value) {
    onboardingStore.setCreatedProductStoreId(routeProductStoreId.value)
  }

  await loadSetupData()
})

async function loadSetupData() {
  isLoadingSetupData.value = true

  try {
    if (!utilStore.organizationPartyId) await utilStore.fetchOrganizationPartyId()

    await Promise.allSettled([
      utilStore.fetchDBICCountries(),
      utilStore.fetchCurrencies({ uomTypeEnumId: "UT_CURRENCY_MEASURE", pageSize: 250 }),
      utilStore.fetchFacilities(),
      utilStore.fetchProductIdentifiers(),
      productStoreStore.fetchProductStores(),
      shopifyStore.fetchShopifyShops()
    ])

    if (utilStore.organizationPartyId) await productStoreStore.fetchCompany()
    await loadSelectedProductStoreSetup()
    await refreshShopifyLocationMappings()
  } catch (error: any) {
    logger.error(error)
  }

  isLoadingSetupData.value = false
}

async function createProductStoreFromDraft() {
  const storeName = onboardingStore.draft.storeName.trim()
  const productStoreId = onboardingStore.draft.productStoreId.trim() || generateInternalId(storeName)

  if (!storeName || !onboardingStore.draft.defaultCurrencyUomId) {
    commonUtil.showToast(translate("Please fill all the required fields"))
    return ""
  }

  if (shouldCollectCompanyName.value && !onboardingStore.draft.companyName.trim()) {
    commonUtil.showToast(translate("Please fill all the required fields"))
    return ""
  }

  if (productStoreId.length > 20) {
    commonUtil.showToast(translate("Product store ID cannot be more than 20 characters."))
    return ""
  }

  if (!organizationPartyId.value) {
    commonUtil.showToast(translate("Unable to find company organization."))
    return ""
  }

  isSavingProductStore.value = true
  emitter.emit("presentLoader")

  try {
    const payload = {
      storeName,
      productStoreId,
      companyName: productStoreStore.company.companyName,
      payToPartyId: organizationPartyId.value,
      defaultCurrencyUomId: onboardingStore.draft.defaultCurrencyUomId
    } as any

    if (shouldCollectCompanyName.value) payload.companyName = onboardingStore.draft.companyName.trim()

    const resp = await productStoreStore.createProductStore(payload)

    if (commonUtil.hasError(resp)) throw resp.data

    const createdProductStoreId = resp.data.productStoreId
    onboardingStore.setCreatedProductStoreId(createdProductStoreId)
    onboardingStore.updateDraftField("productStoreId", createdProductStoreId)

    if (shouldCollectCompanyName.value && onboardingStore.draft.companyName.trim()) {
      await productStoreStore.updateCompany({
        ...productStoreStore.company,
        groupName: onboardingStore.draft.companyName.trim()
      })
    }

    await productStoreStore.fetchProductStores()
    commonUtil.showToast(translate("Product store created successfully."))
    return createdProductStoreId
  } catch (error: any) {
    commonUtil.showToast(translate(error.response?.data?.errors ? error.response.data.errors : "Failed to create product store."))
    logger.error(error)
    return ""
  } finally {
    emitter.emit("dismissLoader")
    isSavingProductStore.value = false
  }
}

async function loadSelectedProductStoreSetup() {
  if (!selectedProductStoreId.value) return

  await Promise.allSettled([
    productStoreStore.fetchProductStoreDetails(selectedProductStoreId.value),
    productStoreStore.fetchCurrentStoreSettings(selectedProductStoreId.value)
  ])

  if (productStoreStore.current?.productIdentifierEnumId) {
    onboardingStore.updateDraftField("productIdentifierEnumId", productStoreStore.current.productIdentifierEnumId)
  }

  if (productStoreStore.current?.autoApproveOrder) {
    onboardingStore.updateDraftField("autoApproveOrder", productStoreStore.current.autoApproveOrder)
  }

  if (typeof productStoreStore.current?.orderNumberPrefix === "string") {
    onboardingStore.updateDraftField("orderNumberPrefix", productStoreStore.current.orderNumberPrefix)
  }

  if (productStoreStore.currentStoreSettings?.SAVE_BILL_TO_INF?.settingValue) {
    onboardingStore.updateDraftField("saveBillingInformation", productStoreStore.currentStoreSettings.SAVE_BILL_TO_INF.settingValue)
  }

  if (!onboardingStore.draft.primaryProductIdentification && productIdentityPreferences.value.primaryId) {
    onboardingStore.updateDraftField("primaryProductIdentification", productIdentityPreferences.value.primaryId)
  }

  if (!onboardingStore.draft.secondaryProductIdentification && productIdentityPreferences.value.secondaryId) {
    onboardingStore.updateDraftField("secondaryProductIdentification", productIdentityPreferences.value.secondaryId)
  }
}

async function handlePrimaryAction() {
  let productStoreId = selectedProductStoreId.value

  if (currentStep.value.id === "name" && !selectedProductStoreId.value) {
    productStoreId = await createProductStoreFromDraft()
    if (!productStoreId) return
  }

  if (currentStep.value.id === "shopify" && isExistingShopifyMode.value && !linkedShopifyShop.value) {
    const shopLinked = await linkExistingShopifyShop()
    if (!shopLinked) return
  }

  if (currentStep.value.id === "general") {
    const orderDefaultsSaved = await saveOrderDefaults()
    if (!orderDefaultsSaved) return
  }

  if (currentStep.value.id === "products") {
    const productIdentitySaved = await saveProductIdentity()
    if (!productIdentitySaved) return
  }

  onboardingStore.goNext()

  if (productStoreId) {
    replaceRouteForProductStore(productStoreId)
  }
}

async function saveOrderDefaults() {
  if (!selectedProductStoreId.value) {
    commonUtil.showToast(translate("Create the Product Store before saving order defaults."))
    return false
  }

  isSavingOrderDefaults.value = true
  emitter.emit("presentLoader")

  try {
    const currentStore = productStoreStore.current?.productStoreId === selectedProductStoreId.value
      ? productStoreStore.current
      : { productStoreId: selectedProductStoreId.value }
    const productStorePayload = {
      ...currentStore,
      productStoreId: selectedProductStoreId.value,
      autoApproveOrder: onboardingStore.draft.autoApproveOrder === "Y" ? "Y" : "N",
      orderNumberPrefix: onboardingStore.draft.orderNumberPrefix.trim()
    }
    const productStoreResp = await productStoreStore.updateProductStore(productStorePayload)

    if (commonUtil.hasError(productStoreResp)) throw productStoreResp.data

    productStoreStore.updateCurrent(productStorePayload)

    const billingSettingPayload = buildSaveBillingInformationPayload()
    const billingSettingResp = await productStoreStore.saveCurrentStoreSettings(billingSettingPayload)

    if (commonUtil.hasError(billingSettingResp)) throw billingSettingResp.data

    productStoreStore.updateCurrentStoreSettings({
      ...productStoreStore.currentStoreSettings,
      SAVE_BILL_TO_INF: billingSettingPayload
    })

    commonUtil.showToast(translate("Order defaults saved successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to save order defaults."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSavingOrderDefaults.value = false
  }
}

function buildSaveBillingInformationPayload() {
  const existingSetting = productStoreStore.currentStoreSettings?.SAVE_BILL_TO_INF
  return {
    ...(existingSetting || {}),
    fromDate: existingSetting?.fromDate || Date.now(),
    productStoreId: selectedProductStoreId.value,
    settingTypeEnumId: "SAVE_BILL_TO_INF",
    settingValue: onboardingStore.draft.saveBillingInformation === "Y" ? "Y" : "N"
  }
}

async function saveProductIdentity() {
  if (!selectedProductStoreId.value || !onboardingStore.draft.productIdentifierEnumId) {
    commonUtil.showToast(translate("Please select a product identifier."))
    return false
  }

  isSavingProductIdentity.value = true
  emitter.emit("presentLoader")

  try {
    const currentStore = productStoreStore.current?.productStoreId === selectedProductStoreId.value
      ? productStoreStore.current
      : { productStoreId: selectedProductStoreId.value }
    const productStorePayload = {
      ...currentStore,
      productStoreId: selectedProductStoreId.value,
      productIdentifierEnumId: onboardingStore.draft.productIdentifierEnumId
    }
    const productStoreResp = await productStoreStore.updateProductStore(productStorePayload)

    if (commonUtil.hasError(productStoreResp)) throw productStoreResp.data

    productStoreStore.updateCurrent(productStorePayload)

    const preferencePayload = buildProductIdentificationPreferencePayload()
    if (preferencePayload) {
      const preferenceResp = await productStoreStore.saveCurrentStoreSettings(preferencePayload)
      if (commonUtil.hasError(preferenceResp)) throw preferenceResp.data

      productStoreStore.updateCurrentStoreSettings({
        ...productStoreStore.currentStoreSettings,
        PRDT_IDEN_PREF: preferencePayload
      })
    }

    commonUtil.showToast(translate("Product identity saved successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to save product identity."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSavingProductIdentity.value = false
  }
}

function buildProductIdentificationPreferencePayload() {
  const preferences = { ...productIdentityPreferences.value }
  const primaryId = onboardingStore.draft.primaryProductIdentification
  const secondaryId = onboardingStore.draft.secondaryProductIdentification

  if (primaryId) preferences.primaryId = primaryId
  if (secondaryId) preferences.secondaryId = secondaryId

  if (!Object.keys(preferences).length) return null

  const existingSetting = productStoreStore.currentStoreSettings?.PRDT_IDEN_PREF
  return {
    ...(existingSetting || {}),
    fromDate: existingSetting?.fromDate || Date.now(),
    productStoreId: selectedProductStoreId.value,
    settingTypeEnumId: "PRDT_IDEN_PREF",
    settingValue: JSON.stringify(preferences)
  }
}

async function linkExistingShopifyShop() {
  if (!selectedProductStoreId.value || !onboardingStore.draft.selectedShopifyShopId) {
    commonUtil.showToast(translate("Please select a Shopify shop."))
    return false
  }

  isLinkingShopifyShop.value = true
  emitter.emit("presentLoader")

  try {
    const selectedShop = shopifyStore.getShopById(onboardingStore.draft.selectedShopifyShopId)
    const resp = await shopifyStore.updateShopifyShop({
      shopId: onboardingStore.draft.selectedShopifyShopId,
      productStoreId: selectedProductStoreId.value
    })

    if (commonUtil.hasError(resp)) throw resp.data

    onboardingStore.updateDraftField("linkedShopifyShopId", onboardingStore.draft.selectedShopifyShopId)
    onboardingStore.updateDraftField("shopifyDomain", selectedShop?.myshopifyDomain || onboardingStore.draft.shopifyDomain)
    await shopifyStore.fetchShopifyShops()
    await refreshShopifyLocationMappings()
    commonUtil.showToast(translate("Product store linked successfully"))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to link product store"))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isLinkingShopifyShop.value = false
  }
}

async function refreshShopifyLocationMappings() {
  shopifyLocationMappings.value = []

  if (!linkedShopifyShopId.value) return

  try {
    const resp = await shopifyStore.fetchShopifyShopLocationsRaw({
      shopId: linkedShopifyShopId.value,
      pageSize: 200
    })

    if (!commonUtil.hasError(resp) && Array.isArray(resp.data)) {
      shopifyLocationMappings.value = resp.data
    }
  } catch (error: any) {
    logger.error(error)
  }
}

async function openShopifyLocationImport() {
  if (!linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before importing facilities."))
    return
  }

  isImportingShopifyFacilities.value = true

  try {
    const modal = await modalController.create({
      component: ImportShopifyLocationsModal,
      componentProps: { shopId: linkedShopifyShopId.value }
    })

    await modal.present()
    const { data } = await modal.onDidDismiss()

    if (data?.imported) {
      await Promise.all([
        utilStore.fetchFacilities(),
        refreshShopifyLocationMappings()
      ])
    }
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to open facility import"))
  } finally {
    isImportingShopifyFacilities.value = false
  }
}

function openShopifyLocationMapping() {
  if (!linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before mapping locations."))
    return
  }

  const path = `/shopify-connection-details/${encodeURIComponent(linkedShopifyShopId.value)}/locations`
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const fallbackUrl = `${path}?returnTo=${encodeURIComponent(returnTo)}`

  if ((router as any)?.push) {
    router.push({ path, query: { returnTo } }).catch((error: any) => logger.error(error))
    return
  }

  window.location.href = fallbackUrl
}

async function openShopifyProductSync() {
  if (!canOpenShopifyProductSync.value) {
    commonUtil.showToast(translate("Link Shopify and choose a product identifier before importing products."))
    return
  }

  const saved = await saveProductIdentity()
  if (!saved) return

  onboardingStore.markCurrentStepComplete()

  const path = `/shopify-connection-details/${encodeURIComponent(linkedShopifyShopId.value)}/product-sync`
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const query = {
    mode: "first-time",
    step: "review",
    productStoreId: selectedProductStoreId.value,
    identifierEnumId: onboardingStore.draft.productIdentifierEnumId,
    returnTo
  }
  const fallbackQuery = new URLSearchParams(query).toString()

  if ((router as any)?.push) {
    router.push({ path, query }).catch((error: any) => logger.error(error))
    return
  }

  window.location.href = `${path}?${fallbackQuery}`
}

function getShopifyShopLabel(shop: any) {
  const name = shop.name || shop.myshopifyDomain || shop.shopId
  return shop.productStoreId ? `${name} (${shop.productStoreId})` : name
}

function replaceRouteForProductStore(productStoreId: string) {
  const path = `/product-store-onboarding/${encodeURIComponent(productStoreId)}`

  if (window.location.pathname !== path) {
    window.history.replaceState(window.history.state, "", path)
  }

  if ((router as any)?.replace) {
    router.replace(path).catch((error: any) => logger.error(error))
  }
}
</script>

<style scoped>
.product-store-onboarding {
  display: flex;
  align-items: flex-start;
  gap: 56px;
  padding: 24px 16px 48px;
}

.onboarding-steps {
  flex: 0 0 375px;
  max-width: 375px;
  width: 100%;
}

.onboarding-task {
  flex: 1 1 420px;
  max-width: 420px;
  margin: 20px auto 0;
}

@media (max-width: 900px) {
  .product-store-onboarding {
    flex-direction: column;
    gap: 16px;
  }

  .onboarding-steps,
  .onboarding-task {
    max-width: none;
    width: 100%;
    margin: 0;
  }

  .onboarding-task {
    order: 1;
  }

  .onboarding-steps {
    order: 2;
  }
}
</style>
