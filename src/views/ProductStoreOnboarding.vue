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

            <ion-list v-else-if="currentStep.id === 'shopify'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Connect a Shopify store") }}
                  <p>{{ translate("A Shopify store cannot be linked to more than one product store at a time.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
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
              <ion-item>
                <ion-input
                  :value="onboardingStore.draft.shopifyDomain"
                  label-placement="stacked"
                  :label="translate('Shopify domain')"
                  :clear-input="true"
                  @ionInput="onboardingStore.updateDraftField('shopifyDomain', String($event.detail.value || ''))"
                />
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
                <ion-spinner v-if="isSavingProductStore" slot="end" name="crescent" />
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
  onIonViewWillEnter
} from "@ionic/vue"
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { arrowBackOutline, arrowForwardOutline, radioButtonOffOutline } from "ionicons/icons"
import { commonUtil, emitter, logger, translate } from "@common"
import OnboardingStepList from "@/components/product-store-onboarding/OnboardingStepList.vue"
import { PRODUCT_STORE_ONBOARDING_GROUPS, PRODUCT_STORE_ONBOARDING_STEPS } from "@/config/productStoreOnboarding"
import { useProductStoreOnboardingStore } from "@/store/productStoreOnboarding"
import { useProductStore } from "@/store/productStore"
import { useUtilStore } from "@/store/util"
import { generateInternalId } from "@/utils"

const onboardingStore = useProductStoreOnboardingStore()
const productStoreStore = useProductStore()
const utilStore = useUtilStore()
const route = useRoute()
const router = useRouter()
const isSavingProductStore = ref(false)
const isLoadingSetupData = ref(false)

const currentStep = computed(() => onboardingStore.currentStep)
const isLastStep = computed(() => onboardingStore.currentStepIndex === PRODUCT_STORE_ONBOARDING_STEPS.length - 1)
const routeProductStoreId = computed(() => {
  const productStoreId = route.params.productStoreId
  if (Array.isArray(productStoreId)) return productStoreId[0] || ""
  return productStoreId ? String(productStoreId) : ""
})
const selectedProductStoreId = computed(() => onboardingStore.createdProductStoreId || routeProductStoreId.value)
const shouldCollectCompanyName = computed(() => productStoreStore.productStores.length === 0)
const organizationPartyId = computed(() => utilStore.organizationPartyId)
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
  return nextLabel.value
})
const isPrimaryActionDisabled = computed(() => {
  if (isLastStep.value || isLoadingSetupData.value || isSavingProductStore.value) return true

  if (currentStep.value.id === "name" && !selectedProductStoreId.value) {
    return !onboardingStore.draft.storeName.trim()
      || !onboardingStore.draft.defaultCurrencyUomId
      || (shouldCollectCompanyName.value && !onboardingStore.draft.companyName.trim())
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
      productStoreStore.fetchProductStores()
    ])

    if (utilStore.organizationPartyId) await productStoreStore.fetchCompany()
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

async function handlePrimaryAction() {
  let productStoreId = selectedProductStoreId.value

  if (currentStep.value.id === "name" && !selectedProductStoreId.value) {
    productStoreId = await createProductStoreFromDraft()
    if (!productStoreId) return
  }

  onboardingStore.goNext()

  if (productStoreId) {
    replaceRouteForProductStore(productStoreId)
  }
}

function replaceRouteForProductStore(productStoreId: string) {
  const path = `/product-store-onboarding/${encodeURIComponent(productStoreId)}`

  if (window.location.pathname !== path) {
    window.history.replaceState(window.history.state, "", path)
  }

  router.replace(path).catch((error: any) => logger.error(error))
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
