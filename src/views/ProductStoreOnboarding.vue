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
            :in-progress-step-ids="inProgressStepIds"
            @select-step="onboardingStore.selectStep"
          />
        </section>

        <section class="onboarding-task">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate(currentStep.label) }}</ion-card-title>
              <ion-card-subtitle>{{ translate(currentStep.summary) }}</ion-card-subtitle>
            </ion-card-header>

            <ion-card-content v-if="currentStep.id === 'name'">
              <ion-input class="form-field" fill="outline"
                :value="onboardingStore.draft.storeName"
                label-placement="stacked"
                :helper-text="translate('Product store represents a brand in OMS')"
                :clear-input="true"
                @ionInput="onboardingStore.updateDraftField('storeName', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
              <ion-input class="form-field" fill="outline"
                :value="onboardingStore.draft.productStoreId"
                label-placement="stacked"
                :label="translate('ID')"
                :helper-text="selectedProductStoreId ? translate('The ID is permanent once the product store is created') : translate('Product store ID represents an unique ID for your product store')"
                :clear-input="!selectedProductStoreId"
                :readonly="!!selectedProductStoreId"
                @ionInput="onboardingStore.updateDraftField('productStoreId', String($event.detail.value || ''))"
              />
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.defaultCurrencyUomId"
                @ionChange="onboardingStore.updateDraftField('defaultCurrencyUomId', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Currency") }} <ion-text color="danger">*</ion-text></div>
                <ion-select-option v-for="currency in currencyOptions" :key="currency.uomId" :value="currency.uomId">
                  {{ currency.label }}
                </ion-select-option>
              </ion-select>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.locale"
                @ionChange="onboardingStore.updateDraftField('locale', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Locale") }}</div>
                <ion-select-option v-for="loc in localeOptions" :key="loc.value" :value="loc.value">
                  {{ loc.label }}
                </ion-select-option>
              </ion-select>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.timezone"
                @ionChange="onboardingStore.updateDraftField('timezone', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Timezone") }}</div>
                <ion-select-option v-for="tz in timezoneOptions" :key="tz.id" :value="tz.id">
                  {{ tz.label }}
                </ion-select-option>
              </ion-select>
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'general'">
              <ion-item>
                <ion-label>
                  {{ translate("Order import defaults") }}
                  <p>{{ translate("These values control how new imported orders are identified, approved, and stored.") }}</p>
                </ion-label>
                <ion-badge :color="selectedProductStoreId ? 'success' : 'warning'" slot="end">
                  {{ selectedProductStoreId ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-input class="form-field" fill="outline"
                :value="onboardingStore.draft.orderNumberPrefix"
                label-placement="stacked"
                :label="translate('Sales order ID prefix')"
                :helper-text="translate('Added to HotWax sales order IDs generated for this Product Store')"
                :clear-input="true"
                @ionInput="onboardingStore.updateDraftField('orderNumberPrefix', String($event.detail.value || ''))"
              />
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
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'shopify'">
              <ion-item>
                <ion-label>
                  {{ translate("Connect a Shopify store") }}
                  <p>{{ translate("A Shopify store cannot be linked to more than one product store at a time.") }}</p>
                </ion-label>
                <ion-badge :color="linkedShopifyShop ? 'success' : 'warning'" slot="end">
                  {{ linkedShopifyShop ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-radio-group class="radio-group"
                :value="onboardingStore.draft.shopifyConnectionMode"
                @ionChange="onboardingStore.updateDraftField('shopifyConnectionMode', String($event.detail.value || ''))"
              >
                <ion-radio class="radio-option" justify="start" label-placement="end" value="Use existing Shopify shop">{{ translate("Use existing Shopify shop") }}</ion-radio>
                <ion-radio class="radio-option" justify="start" label-placement="end" value="Authenticate new shop" :disabled="true">{{ translate("Authenticate new shop") }}</ion-radio>
              </ion-radio-group>
              <ion-item v-if="isExistingShopifyMode && linkedShopifyShop">
                <ion-label>
                  {{ translate("Linked Shopify shop") }}
                  <p>{{ linkedShopifyShop.name || linkedShopifyShop.myshopifyDomain || linkedShopifyShop.shopId }}</p>
                </ion-label>
                <ion-badge color="success" slot="end">{{ translate("Ready") }}</ion-badge>
              </ion-item>
              <ion-select v-if="isExistingShopifyMode && !linkedShopifyShop && availableShopifyShops.length"
                class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.selectedShopifyShopId"
                @ionChange="onboardingStore.updateDraftField('selectedShopifyShopId', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Existing Shopify shop") }} <ion-text color="danger">*</ion-text></div>
                <ion-select-option v-for="shop in availableShopifyShops" :key="shop.shopId" :value="shop.shopId">
                  {{ getShopifyShopLabel(shop) }}
                </ion-select-option>
              </ion-select>
              <ion-item v-if="isExistingShopifyMode && !linkedShopifyShop && !availableShopifyShops.length">
                <ion-label>
                  {{ translate("No available Shopify connection") }}
                  <p>{{ translate("Create the Shopify connection first, then return to link it here.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
              <ion-input v-if="!isExistingShopifyMode"
                class="form-field" fill="outline"
                :value="onboardingStore.draft.shopifyDomain"
                label-placement="stacked"
                :label="translate('Shopify domain')"
                :clear-input="true"
                @ionInput="onboardingStore.updateDraftField('shopifyDomain', String($event.detail.value || ''))"
              />
              <ion-item v-if="onboardingStore.draft.shopifyConnectionMode === 'Authenticate new shop'">
                <ion-label>
                  {{ translate("Connection handoff") }}
                  <p>{{ shopifyTokenHandoffDescription }}</p>
                </ion-label>
                <ion-badge :color="shopifyHandoffToken ? 'success' : 'primary'" slot="end">
                  {{ shopifyHandoffToken ? translate("Ready") : translate("Generate") }}
                </ion-badge>
              </ion-item>
              <ion-input v-if="onboardingStore.draft.shopifyConnectionMode === 'Authenticate new shop'"
                class="form-field" fill="outline"
                :value="onboardingStore.draft.shopifyTokenSubjectUserLoginId"
                :label="translate('Integration user')"
                label-placement="stacked"
                :clear-input="true"
                @ionInput="updateShopifyTokenDraftField('shopifyTokenSubjectUserLoginId', String($event.detail.value || ''))"
              />
              <ion-select v-if="onboardingStore.draft.shopifyConnectionMode === 'Authenticate new shop'"
                class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.shopifyTokenExpireIn"
                @ionChange="updateShopifyTokenDraftField('shopifyTokenExpireIn', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Token expiry") }}</div>
                <ion-select-option value="2592000">{{ translate("30 days") }}</ion-select-option>
                <ion-select-option value="15552000">{{ translate("6 months") }}</ion-select-option>
                <ion-select-option value="31536000">{{ translate("1 year") }}</ion-select-option>
              </ion-select>
              <ion-item v-if="onboardingStore.draft.shopifyConnectionMode === 'Authenticate new shop'">
                <ion-input fill="outline"
                  :value="onboardingStore.draft.shopifyTokenPurpose"
                  :label="translate('Token purpose')"
                  label-placement="stacked"
                  :clear-input="true"
                  @ionInput="updateShopifyTokenDraftField('shopifyTokenPurpose', String($event.detail.value || ''))"
                />
                <ion-button
                  slot="end"
                  fill="clear"
                  :aria-label="translate('Generate JWT token')"
                  :disabled="!canGenerateShopifyToken || isGeneratingShopifyToken"
                  @click="generateShopifyHandoffToken()"
                >
                  <ion-spinner v-if="isGeneratingShopifyToken" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="keyOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-if="onboardingStore.draft.shopifyConnectionMode === 'Authenticate new shop'">
                <ion-label>
                  {{ translate("OMS URL") }}
                  <p>{{ shopifyHandoffOmsUrl }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  :aria-label="translate('Copy OMS URL')"
                  @click="copyShopifyHandoffValue(shopifyHandoffOmsUrl, 'OMS URL copied.')"
                >
                  <ion-icon slot="icon-only" :icon="copyOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-if="onboardingStore.draft.shopifyConnectionMode === 'Authenticate new shop' && shopifyHandoffToken">
                <ion-textarea fill="outline"
                  :value="shopifyHandoffToken"
                  :label="translate('JWT token')"
                  label-placement="stacked"
                  readonly
                  auto-grow
                />
                <ion-button
                  slot="end"
                  fill="clear"
                  :aria-label="translate('Copy JWT token')"
                  @click="copyShopifyHandoffValue(shopifyHandoffToken, 'JWT token copied.')"
                >
                  <ion-icon slot="icon-only" :icon="copyOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-if="onboardingStore.draft.shopifyConnectionMode === 'Authenticate new shop' && shopifyHandoffTokenExpirationLabel">
                <ion-label>
                  {{ translate("Token expires") }}
                  <p>{{ shopifyHandoffTokenExpirationLabel }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-if="selectedProductStoreId">
                <ion-label>
                  {{ translate("Shopify setup status") }}
                  <p>{{ shopifySetupStatusDescription }}</p>
                </ion-label>
                <ion-badge :color="shopifyConnectionBadgeColor" slot="end">
                  {{ shopifyConnectionStatusLabel }}
                </ion-badge>
                <ion-button
                  slot="end"
                  fill="clear"
                  :aria-label="translate('Refresh Shopify setup status')"
                  :disabled="isLoadingShopifyJobStatus"
                  @click="refreshShopifyJobStatus()"
                >
                  <ion-spinner v-if="isLoadingShopifyJobStatus" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="syncOutline" />
                </ion-button>
              </ion-item>
              <ion-list-header v-if="linkedShopifyShop">
                <ion-label>{{ translate("Shopify mappings") }}</ion-label>
              </ion-list-header>
              <ion-item v-if="linkedShopifyShop">
                <ion-label>
                  {{ translate("Mapping readiness") }}
                  <p>{{ shopifyMappingReadinessDescription }}</p>
                </ion-label>
                <ion-badge :color="shopifyMappingBadgeColor" slot="end">
                  {{ shopifyMappingStatusLabel }}
                </ion-badge>
                <ion-button
                  slot="end"
                  fill="clear"
                  :aria-label="translate('Refresh Shopify mappings')"
                  :disabled="isLoadingShopifyMappingStatus"
                  @click="refreshShopifyMappingStatus()"
                >
                  <ion-spinner v-if="isLoadingShopifyMappingStatus" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="syncOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-if="linkedShopifyShop && hasShopifyMappingGaps">
                <ion-icon slot="start" :icon="gitNetworkOutline" />
                <ion-label>
                  {{ translate("Starter mapping package") }}
                  <p>{{ starterShopifyMappingDescription }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="onboarding-create-starter-shopify-mappings"
                  :aria-label="translate('Create starter Shopify mappings')"
                  :disabled="isSavingShopifyStarterMappings"
                  @click="setupStarterShopifyMappings()"
                >
                  <ion-spinner v-if="isSavingShopifyStarterMappings" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="syncOutline" />
                </ion-button>
              </ion-item>
              <template v-if="linkedShopifyShop">
                <ion-item
                  v-for="mapping in shopifyMappingAreas"
                  :key="mapping.id"
                  button
                  detail
                  @click="openShopifyMappingPath(mapping.path)"
                >
                  <ion-icon slot="start" :icon="gitNetworkOutline" />
                  <ion-label>
                    {{ mapping.label }}
                    <p>{{ mapping.description }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ mapping.count }}</ion-note>
                  <ion-badge :color="mapping.count ? 'success' : 'warning'" slot="end">
                    {{ mapping.count ? translate("Ready") : translate("Gap") }}
                  </ion-badge>
                </ion-item>
              </template>
              <ion-item v-for="requirement in shopifyConnectionRequirements" :key="requirement.id">
                <ion-label>
                  {{ translate(requirement.label) }}
                  <p>{{ requirement.message }}</p>
                </ion-label>
                <ion-button v-if="requirement.fixableRemoteId" slot="end" size="small" fill="outline"
                  @click="fixRemoteAccessScope(requirement.fixableRemoteId)"
                >
                  {{ translate("Enable read-write") }}
                </ion-button>
                <ion-badge :color="getRequirementBadgeColor(requirement)" slot="end">
                  {{ getRequirementStatusLabel(requirement) }}
                </ion-badge>
              </ion-item>
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'products'">
              <ion-item>
                <ion-label>
                  {{ translate("Product matching") }}
                  <p>{{ translate("Choose the identifier HotWax should trust when matching Shopify products and variants.") }}</p>
                </ion-label>
                <ion-badge :color="onboardingStore.draft.productIdentifierEnumId ? 'success' : 'warning'" slot="end">
                  {{ onboardingStore.draft.productIdentifierEnumId ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.productIdentifierEnumId"
                @ionChange="onboardingStore.updateDraftField('productIdentifierEnumId', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Global identifier") }} <ion-text color="danger">*</ion-text></div>
                <ion-select-option v-for="identifier in productIdentifierOptions" :key="identifier.enumId" :value="identifier.enumId">
                  {{ identifier.description || identifier.enumId }}
                </ion-select-option>
              </ion-select>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="preferredPrimaryProductIdentification"
                @ionChange="onboardingStore.updateDraftField('primaryProductIdentification', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Primary identifier") }}</div>
                <ion-select-option value="">{{ translate("Not selected") }}</ion-select-option>
                <ion-select-option v-for="identifier in goodIdentificationTypeOptions" :key="identifier.id" :value="identifier.id">
                  {{ identifier.label }}
                </ion-select-option>
              </ion-select>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="preferredSecondaryProductIdentification"
                @ionChange="onboardingStore.updateDraftField('secondaryProductIdentification', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Secondary identifier") }}</div>
                <ion-select-option value="">{{ translate("Not selected") }}</ion-select-option>
                <ion-select-option v-for="identifier in goodIdentificationTypeOptions" :key="identifier.id" :value="identifier.id">
                  {{ identifier.label }}
                </ion-select-option>
              </ion-select>
              <ion-item>
                <ion-label>
                  {{ translate("Shopify product import") }}
                  <p>{{ productSyncHandoffDescription }}</p>
                </ion-label>
                <ion-badge :color="getShopifyJobBadgeColor('productSync')" slot="end">
                  {{ getShopifyJobStatusLabel('productSync') }}
                </ion-badge>
              </ion-item>
              <ion-item v-if="linkedShopifyShop">
                <ion-icon slot="start" :icon="syncOutline" />
                <ion-label>
                  {{ translate("Product import workspace") }}
                  <p>{{ translate("Review live Shopify catalog counts or troubleshoot product import history.") }}</p>
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
              <ion-item v-if="linkedShopifyShop">
                <ion-icon slot="start" :icon="cloudDownloadOutline" />
                <ion-label>
                  {{ translate("Initial product import") }}
                  <p>{{ initialProductImportDescription }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="onboarding-run-product-import"
                  :aria-label="translate('Queue Shopify product import')"
                  :disabled="!canRunProductImport || isSettingUpProductImportJob || isQueueingProductImport"
                  @click="setupAndQueueInitialProductImport()"
                >
                  <ion-spinner v-if="isSettingUpProductImportJob || isQueueingProductImport" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="cloudDownloadOutline" />
                </ion-button>
              </ion-item>
              <ion-item v-else>
                <ion-label>
                  {{ translate("Shopify shop required") }}
                  <p>{{ translate("Link a Shopify shop before importing products.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
              <ion-item v-if="productImportProgressVisible" lines="none">
                <ion-icon slot="start" :icon="productImportStatusIcon(productImportProgressBadgeColor)" :color="productImportProgressBadgeColor" />
                <ion-label>
                  {{ translate("Catalog import progress") }}
                  <p>{{ productImportHeadline }}</p>
                </ion-label>
                <ion-badge slot="end" :color="productImportProgressBadgeColor">{{ productImportProgressLabel }}</ion-badge>
              </ion-item>
              <ion-progress-bar v-if="productImportProgressVisible && isProductImportInProgress" :value="productImportBulkProgressValue" />
              <!-- After a failed/partial run let the user retry in place, or open the sync page to troubleshoot. -->
              <div v-if="productImportProgressVisible && (canRetryProductImport || canOpenShopifyProductSync)" class="ion-padding-start ion-padding-top">
                <ion-button v-if="canRetryProductImport" size="small" @click="retryProductImport()">
                  <ion-icon slot="start" :icon="syncOutline" />
                  {{ translate("Retry import") }}
                </ion-button>
                <ion-button size="small" fill="clear" :disabled="!canOpenShopifyProductSync" @click="openShopifyProductSync()">
                  <ion-icon slot="start" :icon="openOutline" />
                  {{ translate("View details") }}
                </ion-button>
              </div>
              <template v-if="linkedShopifyShop">
                <ion-list-header>
                  <ion-label>{{ translate("Product import jobs") }}</ion-label>
                </ion-list-header>
                <ion-item v-for="job in productImportJobDetails" :key="job.key" class="job-status-row">
                  <ion-label>
                    {{ job.label }}
                    <p>{{ job.detail }}</p>
                  </ion-label>
                  <ion-badge :color="job.color" slot="end">{{ job.status }}</ion-badge>
                </ion-item>
              </template>
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'facilities'">
              <ion-item>
                <ion-label>
                  {{ translate("Business locations") }}
                  <p>{{ translate("Import Shopify locations as HotWax facilities, then map inventory locations before sync starts.") }}</p>
                </ion-label>
                <ion-badge :color="facilityCount ? 'success' : 'warning'" slot="end">
                  {{ facilityCount ? translate("Ready") : translate("Gap") }}
                </ion-badge>
              </ion-item>
              <ion-radio-group class="radio-group"
                :value="onboardingStore.draft.facilityMode"
                @ionChange="onboardingStore.updateDraftField('facilityMode', String($event.detail.value || ''))"
              >
                <ion-radio class="radio-option" justify="start" label-placement="end" value="One store">{{ translate("One store") }}</ion-radio>
                <ion-radio class="radio-option" justify="start" label-placement="end" value="Stores and warehouses">{{ translate("Stores and warehouses") }}</ion-radio>
                <ion-radio class="radio-option" justify="start" label-placement="end" value="Not sure yet">{{ translate("Not sure yet") }}</ion-radio>
              </ion-radio-group>
              <ion-item>
                <ion-icon slot="start" :icon="storefrontOutline" />
                <ion-label>
                  {{ translate("HotWax facilities") }}
                  <p>{{ facilityCount }} {{ translate("facilities available for setup") }}</p>
                </ion-label>
                <ion-note slot="end">{{ facilityCount }}</ion-note>
              </ion-item>
              <ion-item v-if="shouldCreateStarterFacility">
                <ion-icon slot="start" :icon="storefrontOutline" />
                <ion-label>
                  {{ translate("Starter store") }}
                  <p>{{ starterFacilityDescription }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  :disabled="isCreatingStarterFacility"
                  @click="createStarterFacility()"
                >
                  <ion-spinner v-if="isCreatingStarterFacility" name="crescent" />
                  <ion-icon v-else slot="start" :icon="storefrontOutline" />
                  {{ translate("Create store") }}
                </ion-button>
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
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'locations'">
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
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'inventory'">
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.inventorySource"
                @ionChange="onboardingStore.updateDraftField('inventorySource', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Inventory source") }}</div>
                <ion-select-option value="Shopify">{{ translate("Shopify") }}</ion-select-option>
                <ion-select-option value="ERP or WMS">{{ translate("ERP or WMS") }}</ion-select-option>
                <ion-select-option value="HotWax file reset">{{ translate("HotWax file reset") }}</ion-select-option>
                <ion-select-option value="Not sure yet">{{ translate("Not sure yet") }}</ion-select-option>
              </ion-select>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.reserveInventory === 'Y'"
                  @ionChange="onboardingStore.updateDraftField('reserveInventory', $event.detail.checked ? 'Y' : 'N')"
                >
                  {{ translate("Reserve inventory for imported orders") }}
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.showSystemicInventory === 'true'"
                  @ionChange="onboardingStore.updateDraftField('showSystemicInventory', $event.detail.checked ? 'true' : 'false')"
                >
                  {{ translate("Show systemic inventory") }}
                </ion-toggle>
              </ion-item>
              <ion-list-header>
                <ion-label>{{ translate("Pre-order computation") }}</ion-label>
              </ion-list-header>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.holdPreorderPhysicalInventory === 'true'"
                  @ionChange="onboardingStore.updateDraftField('holdPreorderPhysicalInventory', $event.detail.checked ? 'true' : 'false')"
                >
                  {{ translate("Hold pre-order physical inventory") }}
                </ion-toggle>
              </ion-item>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.preorderFacilityGroupId"
                @ionChange="onboardingStore.updateDraftField('preorderFacilityGroupId', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Pre-order group") }}</div>
                <ion-select-option value="">{{ translate("Not selected") }}</ion-select-option>
                <ion-select-option v-for="group in facilityGroups" :key="group.facilityGroupId" :value="group.facilityGroupId">
                  {{ group.facilityGroupName || group.facilityGroupId }}
                </ion-select-option>
              </ion-select>
              <ion-item>
                <ion-label>
                  {{ translate("Initial inventory load") }}
                  <p>{{ inventoryResetDescription }}</p>
                </ion-label>
                <ion-badge :color="inventoryResetBadgeColor" slot="end">
                  {{ inventoryResetStatusLabel }}
                </ion-badge>
              </ion-item>
              <ion-item v-if="shouldSetupShopifyInventoryReset">
                <ion-icon slot="start" :icon="cloudDownloadOutline" />
                <ion-label>
                  {{ translate("Queue Shopify inventory import") }}
                  <p>{{ initialInventoryImportDescription }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="onboarding-run-inventory-import"
                  :aria-label="translate('Queue Shopify inventory import')"
                  :disabled="!canQueueInventoryImport || isQueueingInventoryImport"
                  @click="queueInitialInventoryImport()"
                >
                  <ion-spinner v-if="isQueueingInventoryImport" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="cloudDownloadOutline" />
                </ion-button>
              </ion-item>
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'orders'">
              <ion-item>
                <ion-label>
                  {{ translate("Order import readiness") }}
                  <p>{{ orderImportStatusDescription }}</p>
                </ion-label>
                <ion-badge :color="orderImportBadgeColor" slot="end">{{ orderImportStatusLabel }}</ion-badge>
              </ion-item>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.orderImportMode"
                @ionChange="onboardingStore.updateDraftField('orderImportMode', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Order import mode") }}</div>
                <ion-select-option value="Realtime and fallback batch">{{ translate("Realtime and fallback batch") }}</ion-select-option>
                <ion-select-option value="Fallback batch only">{{ translate("Fallback batch only") }}</ion-select-option>
              </ion-select>
              <ion-input class="form-field" fill="outline"
                type="date"
                :value="preferredOrderHistoryStartDate"
                label-placement="stacked"
                :helper-text="translate('Start of the Shopify bulk query window')"
                @ionInput="onboardingStore.updateDraftField('orderHistoryStartDate', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Load Shopify orders updated since") }}</div>
              </ion-input>
              <ion-input class="form-field" fill="outline"
                type="date"
                :value="preferredOrderLaunchDate"
                label-placement="stacked"
                :helper-text="translate('Orders created before this date stay historical and bypass live fulfillment inventory')"
                @ionInput="onboardingStore.updateDraftField('orderLaunchDate', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("HotWax go-live date") }}</div>
              </ion-input>
              <ion-item>
                <ion-icon slot="start" :icon="cloudDownloadOutline" />
                <ion-label>
                  {{ translate("Initial order history") }}
                  <p>{{ initialOrderHistoryImportDescription }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="onboarding-run-order-history-import"
                  :aria-label="translate('Queue Shopify order history')"
                  :disabled="!linkedShopifyShopId || !preferredOrderHistoryStartDate || !preferredOrderLaunchDate || isQueueingOrderHistoryImport"
                  @click="queueInitialOrderHistoryImport()"
                >
                  <ion-spinner v-if="isQueueingOrderHistoryImport" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="cloudDownloadOutline" />
                </ion-button>
              </ion-item>
              <ion-input v-if="shouldConfigureRealtimeOrderImport" class="form-field" fill="outline"
                :value="onboardingStore.draft.orderSqsQueueName"
                @ionInput="onboardingStore.updateDraftField('orderSqsQueueName', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Realtime SQS queue") }}</div>
              </ion-input>
              <ion-input v-if="shouldConfigureRealtimeOrderImport" class="form-field" fill="outline"
                :value="onboardingStore.draft.orderSqsAwsRemoteId"
                @ionInput="onboardingStore.updateDraftField('orderSqsAwsRemoteId', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("AWS remote ID") }}</div>
              </ion-input>
              <ion-input v-if="shouldConfigureRealtimeOrderImport" class="form-field" fill="outline"
                type="number"
                :value="onboardingStore.draft.orderSqsExpireLockTime"
                @ionInput="onboardingStore.updateDraftField('orderSqsExpireLockTime', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Lock timeout minutes") }}</div>
              </ion-input>
              <ion-item v-for="requirement in orderJobRequirements" :key="requirement.id">
                <ion-label>
                  {{ translate(requirement.label) }}
                  <p>{{ requirement.message }}</p>
                </ion-label>
                <ion-badge :color="getRequirementBadgeColor(requirement)" slot="end">
                  {{ getRequirementStatusLabel(requirement) }}
                </ion-badge>
              </ion-item>
              <ion-item v-if="!hasShopifyJobStatus">
                <ion-label>
                  {{ translate("Shopify setup status") }}
                  <p>{{ translate("The setup flow could not read Shopify readiness from the existing ProductStore, ShopifyShop, SystemMessageRemote, ServiceJob, and DataManager records.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'routing'">
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.enableBrokering === 'Y'"
                  @ionChange="onboardingStore.updateDraftField('enableBrokering', $event.detail.checked ? 'Y' : 'N')"
                >
                  {{ translate("Order brokering") }}
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.allowSplit === 'Y'"
                  :disabled="onboardingStore.draft.enableBrokering !== 'Y'"
                  @ionChange="onboardingStore.updateDraftField('allowSplit', $event.detail.checked ? 'Y' : 'N')"
                >
                  {{ translate("Order splitting") }}
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.sendFulfillmentNotification === 'Y'"
                  @ionChange="onboardingStore.updateDraftField('sendFulfillmentNotification', $event.detail.checked ? 'Y' : 'N')"
                >
                  {{ translate("Send notification to Shopify") }}
                </ion-toggle>
              </ion-item>
              <ion-list-header>
                <ion-label>{{ translate("Cancellations") }}</ion-label>
              </ion-list-header>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.autoCancelOrders === 'Y'"
                  @ionChange="onboardingStore.updateDraftField('autoCancelOrders', $event.detail.checked ? 'Y' : 'N')"
                >
                  {{ translate("Auto order cancellation") }}
                </ion-toggle>
              </ion-item>
              <ion-input class="form-field" fill="outline"
                :label="translate('Auto cancellations days')"
                :placeholder="translate('days count')"
                type="number"
                min="0"
                :disabled="onboardingStore.draft.autoCancelOrders !== 'Y'"
                :value="onboardingStore.draft.daysToCancelNonPay"
                @ionInput="onboardingStore.updateDraftField('daysToCancelNonPay', String($event.detail.value || ''))"
              />
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'pickup'">
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.bopisPartialRejection === 'true'"
                  @ionChange="onboardingStore.updateDraftField('bopisPartialRejection', $event.detail.checked ? 'true' : 'false')"
                >
                  {{ translate("Partial order rejection") }}
                </ion-toggle>
              </ion-item>
              <ion-list-header>
                <ion-label>{{ translate("Order edit permissions") }}</ion-label>
              </ion-list-header>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.customerDeliveryMethodUpdate === 'true'"
                  @ionChange="onboardingStore.updateDraftField('customerDeliveryMethodUpdate', $event.detail.checked ? 'true' : 'false')"
                >
                  {{ translate("Delivery method") }}
                </ion-toggle>
              </ion-item>
              <ion-select class="form-field" fill="outline" label-placement="stacked"
                interface="popover"
                :value="onboardingStore.draft.rerouteShippingMethodId"
                @ionChange="onboardingStore.updateDraftField('rerouteShippingMethodId', String($event.detail.value || ''))"
              >
                <div slot="label">{{ translate("Shipment method") }}</div>
                <ion-select-option value="">{{ translate("Not selected") }}</ion-select-option>
                <ion-select-option
                  v-for="shipmentMethod in shipmentMethodTypes"
                  :key="shipmentMethod.shipmentMethodTypeId"
                  :value="shipmentMethod.shipmentMethodTypeId"
                >
                  {{ shipmentMethod.description || shipmentMethod.shipmentMethodTypeId }}
                </ion-select-option>
              </ion-select>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.customerDeliveryAddressUpdate === 'true'"
                  @ionChange="onboardingStore.updateDraftField('customerDeliveryAddressUpdate', $event.detail.checked ? 'true' : 'false')"
                >
                  {{ translate("Delivery address") }}
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.customerPickupUpdate === 'true'"
                  @ionChange="onboardingStore.updateDraftField('customerPickupUpdate', $event.detail.checked ? 'true' : 'false')"
                >
                  {{ translate("Pick up location") }}
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="onboardingStore.draft.customerCancelBeforeFulfillment === 'true'"
                  @ionChange="onboardingStore.updateDraftField('customerCancelBeforeFulfillment', $event.detail.checked ? 'true' : 'false')"
                >
                  {{ translate("Cancel order before fulfillment") }}
                </ion-toggle>
              </ion-item>
            </ion-card-content>

            <ion-list v-else-if="currentStep.id === 'readiness'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Cold-start readiness") }}
                  <p>{{ readinessSummaryDescription }}</p>
                </ion-label>
                <ion-badge :color="readinessBadgeColor" slot="end">
                  {{ readinessStatusLabel }}
                </ion-badge>
              </ion-item>
              <ion-list-header>
                <ion-label>{{ translate("Required setup") }}</ion-label>
              </ion-list-header>
              <ion-item v-for="item in requiredReadinessItems" :key="item.id">
                <ion-label>
                  {{ item.label }}
                  <p>{{ item.detail }}</p>
                </ion-label>
                <ion-badge :color="item.color" slot="end">{{ item.status }}</ion-badge>
              </ion-item>
              <ion-list-header>
                <ion-label>{{ translate("Workflow settings") }}</ion-label>
              </ion-list-header>
              <ion-item v-for="item in workflowReadinessItems" :key="item.id">
                <ion-label>
                  {{ item.label }}
                  <p>{{ item.detail }}</p>
                </ion-label>
                <ion-badge :color="item.color" slot="end">{{ item.status }}</ion-badge>
              </ion-item>
              <ion-list-header>
                <ion-label>{{ translate("Next actions") }}</ion-label>
              </ion-list-header>
              <ion-item v-for="item in nextReadinessActions" :key="item.id">
                <ion-label>
                  {{ item.label }}
                  <p>{{ item.detail }}</p>
                </ion-label>
                <ion-badge :color="item.color" slot="end">{{ item.status }}</ion-badge>
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
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
  onIonViewDidLeave,
  onIonViewWillEnter
} from "@ionic/vue"
import { computed, ref, watch } from "vue"
import { alertCircleOutline, arrowBackOutline, arrowForwardOutline, checkmarkCircleOutline, cloudDownloadOutline, copyOutline, gitNetworkOutline, keyOutline, openOutline, pulseOutline, radioButtonOffOutline, storefrontOutline, syncOutline, timeOutline } from "ionicons/icons"
import { commonUtil, emitter, logger, translate } from "@common"
import CreateShopifyConnectionModal from "@/components/CreateShopifyConnectionModal.vue"
import ImportShopifyLocationsModal from "@/components/ImportShopifyLocationsModal.vue"
import OnboardingStepList from "@/components/product-store-onboarding/OnboardingStepList.vue"
import { PRODUCT_STORE_ONBOARDING_GROUPS, PRODUCT_STORE_ONBOARDING_STEPS } from "@/config/productStoreOnboarding"
import { useProductStoreOnboardingStore } from "@/store/productStoreOnboarding"
import { useProductStore } from "@/store/productStore"
import { useShopifyStore } from "@/store/shopify"
import { useShopifyProductSyncStore } from "@/store/shopifyProductSync"
import { useUtilStore } from "@/store/util"
import { useUserStore } from "@/store/user"
import { useNetSuiteStore } from "@/store/netSuite"
import { useShopifyProductSyncRun } from "@/composables/useShopifyProductSyncRun"
import useServiceJob from "@/composables/useServiceJob"
import { normalizeProductSyncStatus, getProductSyncBulkOperationProgress } from "@/utils/shopifyProductSyncWizard"
import { generateInternalId } from "@/utils"
import router from "@/router"

const onboardingStore = useProductStoreOnboardingStore()
const productStoreStore = useProductStore()
const shopifyStore = useShopifyStore()
const shopifyProductSyncStore = useShopifyProductSyncStore()
const utilStore = useUtilStore()
const userStore = useUserStore()
const netSuiteStore = useNetSuiteStore()
const { fetchSyncRun: fetchProductImportSyncRun } = useShopifyProductSyncRun()
const { runNow: runServiceJobNow } = useServiceJob()
const props = defineProps<{ productStoreId?: string }>()
const isSavingProductStore = ref(false)
const isLinkingShopifyShop = ref(false)
const isGeneratingShopifyToken = ref(false)
const isImportingShopifyFacilities = ref(false)
const isCreatingStarterFacility = ref(false)
const isSavingProductIdentity = ref(false)
const isSettingUpProductImportJob = ref(false)
const isQueueingProductImport = ref(false)
const isSavingOrderDefaults = ref(false)
const isSavingInventorySettings = ref(false)
const isSettingUpInventoryResetJob = ref(false)
const isQueueingInventoryImport = ref(false)
const isSettingUpOrderJobs = ref(false)
const isQueueingOrderHistoryImport = ref(false)
const isSettingUpRealtimeOrderJobs = ref(false)
const isSavingRoutingDefaults = ref(false)
const isSavingPickupSettings = ref(false)
const isSavingShopifyStarterMappings = ref(false)
const isLoadingSetupData = ref(false)
const isLoadingProductImportProgress = ref(false)
const isLoadingShopifyJobStatus = ref(false)
const isLoadingShopifyMappingStatus = ref(false)
const shopifyHandoffToken = ref("")
const shopifyHandoffTokenExpirationTime = ref(0)
const productImportProgressState = ref<any>({})
const omsProductCount = ref(0)
// Bounds how many extra polls we keep running after the sync reports "completed" while waiting
// for imported products to land in OMS (the catalog write can lag the sync's completed state).
let productImportPostCompletePolls = 0
// After a retry we run the per-shop job, which produces a NEW message asynchronously. While we wait
// for it, show a "queued" placeholder and keep polling without snapping back to the old (failed) run.
const awaitingProductImportRerun = ref(false)
let productImportRetryBaselineId = ""
let productImportRerunWaitPolls = 0
const productImportRun = ref<any>(null)
const shopifyLocationMappings = ref<any[]>([])
const shopifyMappingCounts = ref<Record<string, number>>({
  productTypes: 0,
  orderSources: 0,
  paymentMethods: 0,
  shippingMethods: 0,
  locations: 0
})

const currentStep = computed(() => onboardingStore.currentStep)
const isLastStep = computed(() => onboardingStore.currentStepIndex === PRODUCT_STORE_ONBOARDING_STEPS.length - 1)
const routeProductStoreId = computed(() => props.productStoreId || "")
const selectedProductStoreId = computed(() => onboardingStore.createdProductStoreId || routeProductStoreId.value)
const organizationPartyId = computed(() => utilStore.organizationPartyId)
const isPrimaryActionLoading = computed(() => {
  return isSavingProductStore.value
    || isLinkingShopifyShop.value
    || isGeneratingShopifyToken.value
    || isImportingShopifyFacilities.value
    || isCreatingStarterFacility.value
    || isSavingProductIdentity.value
    || isSettingUpProductImportJob.value
    || isQueueingProductImport.value
    || isSavingOrderDefaults.value
    || isSavingInventorySettings.value
    || isSettingUpInventoryResetJob.value
    || isQueueingInventoryImport.value
    || isSettingUpOrderJobs.value
    || isQueueingOrderHistoryImport.value
    || isSettingUpRealtimeOrderJobs.value
    || isSavingRoutingDefaults.value
    || isSavingPickupSettings.value
    || isSavingShopifyStarterMappings.value
})
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
// In "Use existing" mode, preselect the first available (unlinked) shop so the user isn't
// forced to open the dropdown when there's an obvious default. Also re-runs if the current
// selection falls out of the available list (e.g. it gets linked elsewhere).
watch(
  [isExistingShopifyMode, availableShopifyShops, linkedShopifyShop],
  ([existingMode, shops, linked]) => {
    if (!existingMode || linked) return
    const list = (shops as any[]) || []
    if (!list.length) return
    const current = onboardingStore.draft.selectedShopifyShopId
    if (!current || !list.some((shop: any) => shop.shopId === current)) {
      onboardingStore.updateDraftField("selectedShopifyShopId", list[0].shopId)
    }
  },
  { immediate: true }
)
const shopifyJobStatus = computed(() => productStoreStore.currentShopifyJobStatus)
const hasShopifyJobStatus = computed(() => !!shopifyJobStatus.value?.requirements)
let productImportProgressPoll: number | undefined
const shopifyJobRequirements = computed(() => {
  return Array.isArray(shopifyJobStatus.value?.requirements) ? shopifyJobStatus.value.requirements : []
})
const shopifyConnectionRequirements = computed(() => {
  return shopifyJobRequirements.value.filter((requirement: any) => {
    return ["shopifyShop", "shopifyRemote"].includes(requirement.id)
  })
})
const orderJobRequirements = computed(() => {
  return shopifyJobRequirements.value.filter((requirement: any) => {
    return ["job.orderImport", "job.orderHistory", "job.realtimeOrderImport", "dataManager.orderConfigs"].includes(requirement.id)
  })
})
const shouldConfigureRealtimeOrderImport = computed(() => onboardingStore.draft.orderImportMode === "Realtime and fallback batch")
function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
const defaultOrderHistoryStartDate = computed(() => {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return formatDateInputValue(date)
})
const defaultOrderLaunchDate = computed(() => formatDateInputValue(new Date()))
const preferredOrderHistoryStartDate = computed(() => onboardingStore.draft.orderHistoryStartDate || defaultOrderHistoryStartDate.value)
const preferredOrderLaunchDate = computed(() => onboardingStore.draft.orderLaunchDate || defaultOrderLaunchDate.value)
const orderHistoryStartDateTime = computed(() => preferredOrderHistoryStartDate.value ? `${preferredOrderHistoryStartDate.value} 00:00:00` : "")
const orderLaunchDateTime = computed(() => preferredOrderLaunchDate.value ? `${preferredOrderLaunchDate.value} 00:00:00` : "")
const facilityCount = computed(() => productStoreStore.currentFacilities.length)
const shouldCreateStarterFacility = computed(() =>
  currentStep.value.id === "facilities"
    && onboardingStore.draft.facilityMode === "One store"
    && selectedProductStoreId.value
    && facilityCount.value === 0
)
const starterFacilityDescription = computed(() => {
  const storeName = onboardingStore.draft.storeName || productStoreStore.current?.storeName || selectedProductStoreId.value
  return `${translate("Create one Retail Store facility for")} ${storeName}.`
})
const facilityGroups = computed(() => utilStore.facilityGroups)
const shipmentMethodTypes = computed(() => utilStore.shipmentMethodTypes)
const productTypes = computed(() => utilStore.productTypes)
const salesChannels = computed(() => netSuiteStore.salesChannel)
const paymentMethods = computed(() => netSuiteStore.paymentMethods)
const productStoreShipmentMethods = computed(() => netSuiteStore.productStoreShipmentMethods)
const activeProductStoreShipmentMethods = computed(() => {
  const now = Date.now()
  return productStoreShipmentMethods.value.filter((method: any) => {
    return (!method.fromDate || method.fromDate <= now) && (!method.thruDate || method.thruDate > now)
  })
})
const mappedShopifyLocationCount = computed(() => shopifyLocationMappings.value.length)
const productIdentifierOptions = computed(() => utilStore.productIdentifiers)
// Primary/Secondary identifiers are OMS GoodIdentificationType ids (e.g. SKU, UPCA) — a different
// source from the Global (Shopify) identifier above, which uses SHOP_PROD_IDENTITY enums.
const goodIdentificationTypeOptions = computed(() => {
  return (utilStore.goodIdentificationTypes || []).map((type: any) => {
    const id = String(type.goodIdentificationTypeId || "").trim()
    return { id, label: String(type.description || "").trim() || id }
  }).filter((type: any) => type.id)
})
const shopifyMappingAreas = computed(() => [
  {
    id: "productTypes",
    label: translate("Product type mappings"),
    description: translate("Maps Shopify product types into OMS product types for product import."),
    path: "product-types",
    count: shopifyMappingCounts.value.productTypes
  },
  {
    id: "orderSources",
    label: translate("Sales channel mappings"),
    description: translate("Maps Shopify order sources into OMS sales channels for imported orders."),
    path: "sales-channels",
    count: shopifyMappingCounts.value.orderSources
  },
  {
    id: "paymentMethods",
    label: translate("Payment method mappings"),
    description: translate("Maps Shopify payment names into OMS payment method types."),
    path: "payment-methods",
    count: shopifyMappingCounts.value.paymentMethods
  },
  {
    id: "shippingMethods",
    label: translate("Shipping method mappings"),
    description: translate("Maps Shopify shipping names into OMS shipment methods and carriers."),
    path: "shipment-methods",
    count: shopifyMappingCounts.value.shippingMethods
  },
  {
    id: "locations",
    label: translate("Inventory location mappings"),
    description: translate("Maps Shopify inventory locations to HotWax facilities."),
    path: "locations",
    count: shopifyMappingCounts.value.locations
  }
])
const readyShopifyMappingAreaCount = computed(() => {
  return shopifyMappingAreas.value.filter((mapping) => mapping.count > 0).length
})
const hasShopifyMappingGaps = computed(() => {
  return !!linkedShopifyShopId.value && readyShopifyMappingAreaCount.value < shopifyMappingAreas.value.length
})
const shopifyMappingReadinessDescription = computed(() => {
  if (isLoadingShopifyMappingStatus.value) return translate("Checking Shopify mapping readiness.")
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before configuring mappings.")
  return `${readyShopifyMappingAreaCount.value} ${translate("of")} ${shopifyMappingAreas.value.length} ${translate("mapping areas have at least one mapping.")}`
})
const shopifyMappingStatusLabel = computed(() => {
  return readyShopifyMappingAreaCount.value === shopifyMappingAreas.value.length ? translate("Ready") : translate("Gap")
})
const shopifyMappingBadgeColor = computed(() => {
  return readyShopifyMappingAreaCount.value === shopifyMappingAreas.value.length ? "success" : "warning"
})
const starterProductTypeId = computed(() => {
  return productTypes.value.find((productType: any) => productType.productTypeId === "FINISHED_GOOD")?.productTypeId
    || productTypes.value.find((productType: any) => productType.parentTypeId === "GOOD")?.productTypeId
    || productTypes.value[0]?.productTypeId
    || "FINISHED_GOOD"
})
const starterSalesChannelEnumId = computed(() => {
  return salesChannels.value.find((salesChannel: any) => salesChannel.enumId === "WEB_SALES_CHANNEL")?.enumId
    || salesChannels.value[0]?.enumId
    || "WEB_SALES_CHANNEL"
})
const starterPaymentMethodTypeId = computed(() => {
  return paymentMethods.value.find((paymentMethod: any) => paymentMethod.paymentMethodTypeId === "EXT_SHOP_OTHR_GTWAY")?.paymentMethodTypeId
    || paymentMethods.value.find((paymentMethod: any) => paymentMethod.paymentMethodTypeId?.startsWith("EXT_SHOP_"))?.paymentMethodTypeId
    || paymentMethods.value[0]?.paymentMethodTypeId
    || "EXT_SHOP_OTHR_GTWAY"
})
const starterShipmentMethodTypeId = computed(() => {
  return shipmentMethodTypes.value.find((shipmentMethod: any) => shipmentMethod.shipmentMethodTypeId === "STANDARD")?.shipmentMethodTypeId
    || shipmentMethodTypes.value[0]?.shipmentMethodTypeId
    || "STANDARD"
})
const starterShippingMethod = computed(() => {
  return activeProductStoreShipmentMethods.value[0]
    || {
      shipmentMethodTypeId: starterShipmentMethodTypeId.value,
      partyId: "_NA_"
    }
})
const starterShopifyMappingDescription = computed(() => {
  return translate("Creates first-pass product type, web sales channel, payment, shipping, and location-ready mappings for this Shopify shop.")
})
const canOpenShopifyProductSync = computed(() => {
  return !!selectedProductStoreId.value && !!linkedShopifyShopId.value && !!onboardingStore.draft.productIdentifierEnumId
})
const canRunProductImport = computed(() => canOpenShopifyProductSync.value)
const productImportJobDetails = computed(() => {
  return [
    {
      key: "productSync",
      fallbackLabel: translate("Queue product import"),
      fallbackDetail: translate("Creates the product import system message for this Shopify shop.")
    },
    {
      key: "productBulkSend",
      fallbackLabel: translate("Send bulk operation"),
      fallbackDetail: translate("Sends produced Shopify bulk query messages.")
    },
    {
      key: "productBulkPoll",
      fallbackLabel: translate("Poll bulk operation"),
      fallbackDetail: translate("Polls Shopify until the bulk catalog result is ready.")
    }
  ].map((definition) => {
    const job = getShopifyJobStatus(definition.key)
    return {
      key: definition.key,
      label: job?.label ? translate(job.label) : definition.fallbackLabel,
      detail: getShopifyJobDetail(job, definition.fallbackDetail),
      status: getShopifyJobStatusLabel(definition.key),
      color: getShopifyJobBadgeColor(definition.key)
    }
  })
})
const productImportProgressStatus = computed(() => {
  // While awaiting the retried run's new message, present a "queued" state (no message id yet).
  if (awaitingProductImportRerun.value && !productImportProgressState.value?.systemMessageId) return "queued"
  if (!productImportProgressState.value?.systemMessageId && !productImportRun.value?.systemMessageId) return ""

  return normalizeProductSyncStatus({
    status: productImportProgressState.value?.status,
    systemMessageState: productImportProgressState.value?.systemMessageState || productImportRun.value?.systemMessage?.statusId,
    logStatusId: productImportProgressState.value?.logStatusId || productImportRun.value?.mdmLog?.statusId,
    logId: productImportProgressState.value?.logId || productImportRun.value?.mdmLog?.id
  })
})
const productImportProgressVisible = computed(() => {
  return !!linkedShopifyShopId.value && (awaitingProductImportRerun.value || !!productImportProgressState.value?.systemMessageId || !!productImportRun.value?.systemMessageId || isLoadingProductImportProgress.value)
})
// Grade a terminally-completed import by its record failure rate: 0 failed = Complete (pass);
// up to 80% failed = Partial failure; over 80% failed does not qualify as a pass = Failed.
const productImportCompletedOutcome = computed(() => {
  const mdm = productImportRun.value?.mdmLog || {}
  const total = Number(mdm.totalRecordCount || 0)
  const failed = Number(mdm.failedRecordCount || 0)
  if (failed === 0) return { key: "complete", label: translate("Complete"), color: "success" }
  if (total > 0 && failed / total > 0.8) return { key: "failed", label: translate("Failed"), color: "danger" }
  return { key: "partial", label: translate("Partial failure"), color: "warning" }
})
const productImportProgressLabel = computed(() => {
  if (isLoadingProductImportProgress.value && !productImportProgressStatus.value) return translate("Checking")

  switch (productImportProgressStatus.value) {
    case "completed": return productImportCompletedOutcome.value.label
    case "error": return translate("Error")
    case "cancelled": return translate("Canceled")
    case "importing": return translate("Importing")
    case "running": return translate("Running")
    case "sent": return translate("Sent")
    case "queued": return translate("Queued")
    default: return translate("Pending")
  }
})
const productImportProgressBadgeColor = computed(() => {
  switch (productImportProgressStatus.value) {
    case "completed": return productImportCompletedOutcome.value.color
    case "error":
    case "cancelled": return "danger"
    case "queued": return "warning"
    case "running":
    case "importing":
    case "sent": return "primary"
    default: return isLoadingProductImportProgress.value ? "primary" : "medium"
  }
})
// Allow an in-place retry from the onboarding page once a run has terminally failed (error/cancelled)
// or completed with record failures — so the user doesn't have to leave for the sync page after a big failure.
const canRetryProductImport = computed(() => {
  if (!linkedShopifyShopId.value || isProductImportInProgress.value) return false
  const status = productImportProgressStatus.value
  if (status === "error" || status === "cancelled") return true
  if (status === "completed") return Number(productImportRun.value?.mdmLog?.failedRecordCount || 0) > 0
  return false
})
const productImportBulkProgress = computed(() => {
  const objectCount = productImportRun.value?.bulkOperation?.objectCount ?? productImportProgressState.value?.objectCount ?? 0
  // No catalog total is known during onboarding, so total resolves to 0 -> hasTotalCount false (degrades to "N objects processed").
  return getProductSyncBulkOperationProgress(objectCount, 0)
})
const productImportBulkProgressValue = computed(() => {
  const status = String(productImportRun.value?.bulkOperation?.status || "").toLowerCase()
  if (status === "complete" || status === "completed") return 1
  return productImportBulkProgress.value.value
})
function productImportStatusIcon(color: string) {
  switch (color) {
    case "success": return checkmarkCircleOutline
    case "primary": return pulseOutline
    case "danger": return alertCircleOutline
    default: return timeOutline
  }
}
// Single, status-driven line for the catalog import — shows only the one fact that matters at the
// current stage (request -> Shopify export -> HotWax import -> outcome) instead of every id/count.
const productImportHeadline = computed(() => {
  const mdm = productImportRun.value?.mdmLog || {}
  const failed = Number(mdm.failedRecordCount || 0)
  const totalRecords = Number(mdm.totalRecordCount || 0)
  const objects = productImportBulkProgress.value.processedCount
  // Build the number with JS interpolation and translate only the static text: translate() does not
  // substitute named params unless the key exists in the locale, so "{count}" would render literally.
  switch (productImportProgressStatus.value) {
    case "queued":
    case "sent":
    case "waiting":
      return translate("Requesting catalog export from Shopify…")
    case "running":
      return objects > 0
        ? `${objects} ${translate("objects exported from Shopify so far…")}`
        : translate("Exporting catalog from Shopify…")
    case "importing":
      return totalRecords > 0
        ? `${translate("Importing")} ${totalRecords} ${translate("products into HotWax…")}`
        : translate("Importing products into HotWax…")
    case "completed":
      if (failed > 0) return `${failed} ${translate("of")} ${totalRecords} ${translate("records failed to import")}`
      return totalRecords > 0
        ? `${totalRecords} ${translate("products imported")}`
        : translate("Catalog import complete.")
    case "error":
      return String(productImportRun.value?.systemMessage?.errorText || "").trim() || translate("Catalog import failed.")
    case "cancelled":
      return translate("Catalog import was cancelled.")
    default:
      return translate("Checking import status…")
  }
})
const productImportProgressDescription = computed(() => {
  const run = productImportRun.value || {}
  const systemMessageId = productImportProgressState.value?.systemMessageId || run.systemMessageId
  if (!systemMessageId) return translate("No catalog import has been queued yet.")

  const details = [`${translate("System message")} ${systemMessageId}`]
  const bulkOperationId = run.bulkOperation?.id || productImportProgressState.value?.bulkOperationId
  if (bulkOperationId) details.push(`${translate("Bulk operation")} ${bulkOperationId}`)
  if (run.bulkOperation?.objectCount) details.push(`${run.bulkOperation.objectCount} ${translate("objects")}`)
  if (run.mdmLog?.id) details.push(`${translate("DataManager log")} ${run.mdmLog.id}`)
  if (run.mdmLog?.totalRecordCount) details.push(`${run.mdmLog.totalRecordCount} ${translate("records")}`)
  return details.join(" | ")
})
const isProductImportInProgress = computed(() => {
  return ["queued", "sent", "running", "importing", "waiting"].includes(productImportProgressStatus.value)
})
const productSyncHandoffDescription = computed(() => {
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before importing products.")
  if (!onboardingStore.draft.productIdentifierEnumId) return translate("Choose the product identifier before importing products.")
  const productSyncRequirement = findShopifyRequirement("job.productSync")
  if (productSyncRequirement?.message) return productSyncRequirement.message
  return translate("Configure recurring Shopify product import and queue the first catalog sync.")
})
const initialProductImportDescription = computed(() => {
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before importing products.")
  if (!onboardingStore.draft.productIdentifierEnumId) return translate("Choose the product identifier before importing products.")
  return translate("Configure the product sync job, then queue a Shopify import for the full catalog.")
})
const shopifySetupStatusDescription = computed(() => {
  if (!selectedProductStoreId.value) return translate("Create the Product Store before checking Shopify setup.")
  if (isLoadingShopifyJobStatus.value) return translate("Checking Shopify setup status.")
  if (!hasShopifyJobStatus.value) return translate("The setup flow could not read Shopify readiness from the existing remote, ServiceJob, and DataManager records.")

  const missingCount = shopifyJobRequirements.value.filter((requirement: any) => !requirement.complete).length
  if (!missingCount) return translate("Shopify remotes and onboarding jobs are ready.")
  return `${missingCount} ${translate("Shopify setup items need attention.")}`
})
const shopifyConnectionStatusLabel = computed(() => {
  if (!hasShopifyJobStatus.value) return translate("Gap")
  return shopifyConnectionRequirements.value.every((requirement: any) => requirement.complete) ? translate("Ready") : translate("Gap")
})
const shopifyConnectionBadgeColor = computed(() => {
  if (!hasShopifyJobStatus.value) return "warning"
  return shopifyConnectionRequirements.value.every((requirement: any) => requirement.complete) ? "success" : "warning"
})
const shopifyHandoffOmsUrl = computed(() => commonUtil.getMaargURL())
const canGenerateShopifyToken = computed(() => {
  return !!onboardingStore.draft.shopifyTokenSubjectUserLoginId.trim()
    && !!onboardingStore.draft.shopifyTokenPurpose.trim()
    && !!Number(onboardingStore.draft.shopifyTokenExpireIn || 0)
})
const shopifyTokenHandoffDescription = computed(() => {
  if (shopifyHandoffToken.value) return translate("Copy the OMS URL and JWT token into the Shopify app connection form.")
  return translate("Generate a one-time integration token for the Shopify app connection form.")
})
const shopifyHandoffTokenExpirationLabel = computed(() => {
  if (!shopifyHandoffTokenExpirationTime.value) return ""
  return new Date(shopifyHandoffTokenExpirationTime.value).toLocaleString()
})
const shouldSetupShopifyInventoryReset = computed(() => onboardingStore.draft.inventorySource === "Shopify")
// Product sync is "started" once a system message exists (or it's in-flight / already completed) —
// used so re-entering the Products step doesn't re-queue the import.
const isProductSyncStarted = computed(() => {
  return !!productImportProgressState.value?.systemMessageId || isProductImportInProgress.value || productImportProgressStatus.value === "completed"
})
// Product sync has actually RUN to a successful terminal state (SmsgConsumed / DataManager finished).
const isProductSyncRun = computed(() => productImportProgressStatus.value === "completed")
// Inventory hard blocker: only Shopify-sourced inventory waits on the Shopify catalog; other
// sources (ERP/WMS/file) have no Shopify products to gate on. When it applies, require the sync
// to have run AND at least one product to exist in OMS for the store.
const isInventoryProductPrerequisiteMet = computed(() => {
  if (!shouldSetupShopifyInventoryReset.value || !linkedShopifyShopId.value) return true
  return isProductSyncRun.value && omsProductCount.value > 0
})
// Steps showing a loading spinner in the step rail (product import in flight -> Products step).
const inProgressStepIds = computed<string[]>(() => (isProductImportInProgress.value ? ["products"] : []))
const inventoryResetDescription = computed(() => {
  if (!shouldSetupShopifyInventoryReset.value) return translate("This inventory source does not need a Shopify inventory reset job.")
  if (!selectedProductStoreId.value) return translate("Create the Product Store before configuring inventory reset.")
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before configuring inventory reset.")

  const inventoryRequirement = findShopifyRequirement("job.inventoryReset")
  if (inventoryRequirement?.message) return inventoryRequirement.message
  return translate("Configure the Shopify inventory reset job and queue the initial on-hand inventory import after products and locations are mapped.")
})
const initialInventoryImportDescription = computed(() => {
  if (!shouldSetupShopifyInventoryReset.value) return translate("Skipped for this inventory source.")
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before loading inventory.")
  if (!mappedShopifyLocationCount.value) return translate("Map Shopify inventory locations before loading inventory.")
  if (isProductImportInProgress.value) return translate("Finish the Shopify product import before loading inventory.")
  if (!isProductSyncRun.value) return translate("Run the product catalog sync on the Products step before loading inventory.")
  if (!omsProductCount.value) return translate("Waiting for products to import into OMS — at least one product must exist before loading inventory.")
  return translate("Queue a Shopify bulk import that resets OMS facility inventory from current on-hand quantities.")
})
const canQueueInventoryImport = computed(() => {
  return !!linkedShopifyShopId.value && !!mappedShopifyLocationCount.value && !isProductImportInProgress.value && isInventoryProductPrerequisiteMet.value
})
const inventoryResetStatusLabel = computed(() => {
  return shouldSetupShopifyInventoryReset.value ? getShopifyJobStatusLabel("inventoryReset") : translate("Skipped")
})
const inventoryResetBadgeColor = computed(() => {
  return shouldSetupShopifyInventoryReset.value ? getShopifyJobBadgeColor("inventoryReset") : "medium"
})
const orderImportStatusDescription = computed(() => {
  if (!selectedProductStoreId.value) return translate("Create the Product Store before checking order import jobs.")
  if (!hasShopifyJobStatus.value) return translate("The setup flow could not read order import readiness from the existing ServiceJob and DataManager records.")

  const missingOrderItems = orderJobRequirements.value.filter((requirement: any) => !requirement.complete)
  if (!missingOrderItems.length) return translate("Order import jobs and DataManager configs are ready.")
  return `${missingOrderItems.length} ${translate("order import setup items need attention.")}`
})
const orderImportStatusLabel = computed(() => {
  if (!hasShopifyJobStatus.value) return translate("Gap")
  return orderJobRequirements.value.every((requirement: any) => requirement.complete) ? translate("Ready") : translate("Gap")
})
const orderImportBadgeColor = computed(() => {
  if (!hasShopifyJobStatus.value) return "warning"
  return orderJobRequirements.value.every((requirement: any) => requirement.complete) ? "success" : "warning"
})
const initialOrderHistoryImportDescription = computed(() => {
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before loading orders.")
  if (!preferredOrderHistoryStartDate.value) return translate("Choose how far back to load Shopify order history.")
  if (!preferredOrderLaunchDate.value) return translate("Choose the HotWax go-live date for order import.")
  return `${translate("Queue Shopify order history updated since")} ${preferredOrderHistoryStartDate.value}. ${translate("Orders created before")} ${preferredOrderLaunchDate.value} ${translate("stay historical.")}`
})
const requiredReadinessItems = computed(() => [
  buildReadinessItem({
    id: "productStore",
    label: translate("Product Store"),
    ready: !!selectedProductStoreId.value,
    readyDetail: selectedProductStoreId.value || translate("Created ProductStore is available."),
    gapDetail: translate("Create the Product Store identity before setup can continue.")
  }),
  buildReadinessItem({
    id: "shopifyShop",
    label: translate("Shopify connection"),
    ready: !!linkedShopifyShopId.value,
    readyDetail: linkedShopifyShop.value?.myshopifyDomain || linkedShopifyShop.value?.name || linkedShopifyShopId.value,
    gapDetail: translate("Link an existing Shopify shop or prepare the Shopify app handoff.")
  }),
  buildReadinessItem({
    id: "shopifyMappings",
    label: translate("Shopify mappings"),
    ready: readyShopifyMappingAreaCount.value === shopifyMappingAreas.value.length,
    readyDetail: shopifyMappingReadinessDescription.value,
    gapDetail: shopifyMappingReadinessDescription.value
  }),
  buildReadinessItem({
    id: "productIdentity",
    label: translate("Product identity"),
    ready: !!onboardingStore.draft.productIdentifierEnumId,
    readyDetail: onboardingStore.draft.productIdentifierEnumId,
    gapDetail: translate("Choose the product identifier before product import starts.")
  }),
  buildReadinessItem({
    id: "facilities",
    label: translate("Facilities"),
    ready: facilityCount.value > 0,
    readyDetail: `${facilityCount.value} ${translate("facilities available for setup")}`,
    gapDetail: translate("Import Shopify locations or create facilities for this Product Store.")
  }),
  buildReadinessItem({
    id: "locationMappings",
    label: translate("Inventory location mappings"),
    ready: mappedShopifyLocationCount.value > 0,
    readyDetail: `${mappedShopifyLocationCount.value} ${translate("Shopify location mappings")}`,
    gapDetail: translate("Map Shopify inventory locations to HotWax facilities.")
  }),
  buildReadinessItem({
    id: "inventory",
    label: translate("Initial inventory load"),
    ready: !shouldSetupShopifyInventoryReset.value || inventoryResetStatusLabel.value === translate("Ready"),
    readyDetail: inventoryResetDescription.value,
    gapDetail: inventoryResetDescription.value,
    status: shouldSetupShopifyInventoryReset.value ? undefined : translate("Skipped"),
    color: shouldSetupShopifyInventoryReset.value ? undefined : "medium"
  }),
  buildReadinessItem({
    id: "orders",
    label: translate("Order import"),
    ready: orderImportStatusLabel.value === translate("Ready"),
    readyDetail: orderImportStatusDescription.value,
    gapDetail: orderImportStatusDescription.value
  })
])
const workflowReadinessItems = computed(() => [
  buildReadinessItem({
    id: "routing",
    label: translate("Order routing and fulfillment"),
    ready: !!selectedProductStoreId.value,
    readyDetail: translate("Routing defaults can be saved through existing ProductStore settings."),
    gapDetail: translate("Create the Product Store before saving routing defaults.")
  }),
  buildReadinessItem({
    id: "pickup",
    label: translate("In store pickup"),
    ready: !!selectedProductStoreId.value,
    readyDetail: translate("Pickup permissions can be saved through ProductStoreSetting values."),
    gapDetail: translate("Create the Product Store before saving pickup settings.")
  }),
  {
    id: "storeInventory",
    label: translate("Store inventory management"),
    detail: translate("Inventory count and receiving app setup are represented as workflow tasks until app-specific package choices are confirmed."),
    status: translate("Preview"),
    color: "medium"
  },
  {
    id: "preorders",
    label: translate("Pre-orders"),
    detail: onboardingStore.draft.preorderFacilityGroupId
      ? translate("Preorder inventory group selected.")
      : translate("Preorder release and routing setup still needs a dedicated task."),
    status: onboardingStore.draft.preorderFacilityGroupId ? translate("Ready") : translate("Preview"),
    color: onboardingStore.draft.preorderFacilityGroupId ? "success" : "medium"
  }
])
const nextReadinessActions = computed(() => {
  const actions = []

  if (hasShopifyMappingGaps.value) {
    actions.push({
      id: "shopifyMappings",
      label: translate("Create starter Shopify mappings"),
      detail: starterShopifyMappingDescription.value,
      status: translate("Action"),
      color: "primary"
    })
  }

  if (canOpenShopifyProductSync.value) {
    actions.push({
      id: "productSync",
      label: translate("Run product sync"),
      detail: productSyncHandoffDescription.value,
      status: translate("Action"),
      color: "primary"
    })
  }

  if (shouldSetupShopifyInventoryReset.value) {
    actions.push({
      id: "inventoryReset",
      label: translate("Load initial inventory"),
      detail: inventoryResetDescription.value,
      status: inventoryResetStatusLabel.value,
      color: inventoryResetBadgeColor.value
    })
  }

  actions.push({
    id: "orderJobs",
    label: translate("Enable order import"),
    detail: orderImportStatusDescription.value,
    status: orderImportStatusLabel.value,
    color: orderImportBadgeColor.value
  })

  return actions
})
const requiredReadinessGapCount = computed(() => requiredReadinessItems.value.filter((item) => item.color === "warning").length)
const requiredReadinessReadyCount = computed(() => requiredReadinessItems.value.length - requiredReadinessGapCount.value)
const readinessStatusLabel = computed(() => requiredReadinessGapCount.value ? translate("Needs attention") : translate("Ready"))
const readinessBadgeColor = computed(() => requiredReadinessGapCount.value ? "warning" : "success")
const readinessSummaryDescription = computed(() => {
  if (!requiredReadinessItems.value.length) return translate("No readiness checks available.")
  return `${requiredReadinessReadyCount.value} ${translate("of")} ${requiredReadinessItems.value.length} ${translate("required setup areas are ready.")}`
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
const localeOptions = [
  { value: "en_US", label: "English (United States)" },
  { value: "en_CA", label: "English (Canada)" },
  { value: "en_GB", label: "English (United Kingdom)" },
  { value: "en_AU", label: "English (Australia)" },
  { value: "fr_FR", label: "French (France)" },
  { value: "fr_CA", label: "French (Canada)" },
  { value: "es_ES", label: "Spanish (Spain)" },
  { value: "es_MX", label: "Spanish (Mexico)" },
  { value: "de_DE", label: "German (Germany)" },
  { value: "it_IT", label: "Italian (Italy)" },
  { value: "pt_BR", label: "Portuguese (Brazil)" },
  { value: "nl_NL", label: "Dutch (Netherlands)" },
  { value: "ja_JP", label: "Japanese (Japan)" }
]
const timezoneOptions = computed(() => {
  const zones = Array.isArray(userStore.availableTimeZones) ? userStore.availableTimeZones : []
  const current = onboardingStore.draft.timezone
  // Keep the current value selectable even before the (async) timezone list has loaded.
  if (current && !zones.some((zone: any) => zone.id === current)) {
    return [{ id: current, label: current }, ...zones]
  }
  return zones
})
const nextLabel = computed(() => {
  const nextStep = PRODUCT_STORE_ONBOARDING_STEPS[onboardingStore.currentStepIndex + 1]
  return nextStep ? translate(nextStep.label) : translate("Review")
})
const primaryActionLabel = computed(() => {
  if (currentStep.value.id === "name" && !selectedProductStoreId.value) return translate("Create product store")
  if (currentStep.value.id === "general") return translate("Save order defaults")
  if (currentStep.value.id === "shopify" && onboardingStore.draft.shopifyConnectionMode === "Authenticate new shop" && !linkedShopifyShop.value) return translate("Create Shopify connection")
  if (currentStep.value.id === "shopify" && isExistingShopifyMode.value && !linkedShopifyShop.value) return translate("Link Shopify")
  if (currentStep.value.id === "facilities" && shouldCreateStarterFacility.value) return translate("Create store facility")
  if (currentStep.value.id === "products" && linkedShopifyShopId.value && isProductSyncStarted.value) return nextLabel.value
  if (currentStep.value.id === "products" && linkedShopifyShopId.value) return translate("Save and import products")
  if (currentStep.value.id === "products") return translate("Save product identity")
  if (currentStep.value.id === "inventory" && shouldSetupShopifyInventoryReset.value && linkedShopifyShopId.value && !isProductImportInProgress.value) return translate("Save and load inventory")
  if (currentStep.value.id === "inventory") return translate("Save inventory settings")
  if (currentStep.value.id === "orders") return translate("Configure and load orders")
  if (currentStep.value.id === "routing") return translate("Save routing defaults")
  if (currentStep.value.id === "pickup") return translate("Save pickup settings")
  if (currentStep.value.id === "readiness") return requiredReadinessGapCount.value ? translate("Resolve gaps") : translate("Finish setup")
  return nextLabel.value
})
const isPrimaryActionDisabled = computed(() => {
  if (isLoadingSetupData.value || isPrimaryActionLoading.value) return true
  if (isLastStep.value && currentStep.value.id !== "readiness") return true

  if (currentStep.value.id === "name" && !selectedProductStoreId.value) {
    return !onboardingStore.draft.storeName.trim()
      || !onboardingStore.draft.defaultCurrencyUomId
  }

  if (currentStep.value.id === "shopify" && isExistingShopifyMode.value && !linkedShopifyShop.value) {
    return !selectedProductStoreId.value || !onboardingStore.draft.selectedShopifyShopId
  }

  if (currentStep.value.id === "shopify" && onboardingStore.draft.shopifyConnectionMode === "Authenticate new shop" && !linkedShopifyShop.value) {
    return !selectedProductStoreId.value
  }

  if (currentStep.value.id === "general") {
    return !selectedProductStoreId.value
  }

  if (currentStep.value.id === "products") {
    return !selectedProductStoreId.value || !onboardingStore.draft.productIdentifierEnumId
  }

  if (currentStep.value.id === "facilities") {
    return !selectedProductStoreId.value
  }

  if (currentStep.value.id === "inventory") {
    return !selectedProductStoreId.value || !isInventoryProductPrerequisiteMet.value
  }

  if (currentStep.value.id === "orders") {
    return !selectedProductStoreId.value
      || (!!linkedShopifyShopId.value && (
        !preferredOrderHistoryStartDate.value
        || (shouldConfigureRealtimeOrderImport.value && !onboardingStore.draft.orderSqsQueueName.trim())
      ))
  }

  if (currentStep.value.id === "routing") {
    return !selectedProductStoreId.value
  }

  if (currentStep.value.id === "pickup") {
    return !selectedProductStoreId.value
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

function buildReadinessItem(payload: {
  id: string
  label: string
  ready: boolean
  readyDetail: string
  gapDetail: string
  status?: string
  color?: string
}) {
  return {
    id: payload.id,
    label: payload.label,
    detail: payload.ready ? payload.readyDetail : payload.gapDetail,
    status: payload.status || (payload.ready ? translate("Ready") : translate("Gap")),
    color: payload.color || (payload.ready ? "success" : "warning")
  }
}

function findShopifyRequirement(requirementId: string) {
  return shopifyJobRequirements.value.find((requirement: any) => requirement.id === requirementId)
}

function getRequirementBadgeColor(requirement: any) {
  return requirement?.complete ? "success" : "warning"
}

function getRequirementStatusLabel(requirement: any) {
  return requirement?.complete ? translate("Ready") : translate("Gap")
}

function getShopifyJobStatus(jobKey: string) {
  const jobs = Array.isArray(shopifyJobStatus.value?.jobs) ? shopifyJobStatus.value.jobs : []
  return jobs.find((job: any) => job.key === jobKey)
}

function getShopifyJobDetail(job: any, fallbackDetail: string) {
  if (!job) return fallbackDetail
  if (job.selectedJobName) return job.selectedJobName
  if (job.expectedJobName) return job.expectedJobName
  if (job.templateJobName) return job.templateJobName
  return fallbackDetail
}

function getShopifyJobBadgeColor(jobKey: string) {
  const job = getShopifyJobStatus(jobKey)
  if (job?.ready || job?.enabled) return "success"
  if (job?.configured) return "warning"
  if (!hasShopifyJobStatus.value && jobKey === "productSync" && canOpenShopifyProductSync.value) return "success"
  return "warning"
}

function getShopifyJobStatusLabel(jobKey: string) {
  const job = getShopifyJobStatus(jobKey)
  if (job?.ready || job?.enabled) return translate("Ready")
  if (job?.configured) return translate("Paused")
  if (job?.status === "template-ready") return translate("Template")
  if (!hasShopifyJobStatus.value && jobKey === "productSync" && canOpenShopifyProductSync.value) return translate("Ready")
  return translate("Gap")
}

function updateShopifyTokenDraftField(field: "shopifyTokenSubjectUserLoginId" | "shopifyTokenPurpose" | "shopifyTokenExpireIn", value: string) {
  onboardingStore.updateDraftField(field, value)
  shopifyHandoffToken.value = ""
  shopifyHandoffTokenExpirationTime.value = 0
}

async function generateShopifyHandoffToken() {
  if (!canGenerateShopifyToken.value) {
    commonUtil.showToast(translate("Enter an integration user, token purpose, and expiry."))
    return
  }

  isGeneratingShopifyToken.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.createJwtToken({
      subjectUserLoginId: onboardingStore.draft.shopifyTokenSubjectUserLoginId.trim(),
      category: "INTEGRATION",
      purpose: onboardingStore.draft.shopifyTokenPurpose.trim(),
      expireIn: Number(onboardingStore.draft.shopifyTokenExpireIn)
    })

    if (commonUtil.hasError(resp)) throw resp.data

    shopifyHandoffToken.value = resp.data?.token || ""
    shopifyHandoffTokenExpirationTime.value = Number(resp.data?.expirationTime || 0)
    commonUtil.showToast(translate("JWT token generated."))
  } catch (error: any) {
    logger.error(error)
    shopifyHandoffToken.value = ""
    shopifyHandoffTokenExpirationTime.value = 0
    commonUtil.showToast(translate("Failed to generate JWT token."))
  } finally {
    emitter.emit("dismissLoader")
    isGeneratingShopifyToken.value = false
  }
}

async function copyShopifyHandoffValue(value: string, message: string) {
  if (!value) return

  try {
    await navigator.clipboard.writeText(value)
    commonUtil.showToast(translate(message))
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to copy value."))
  }
}

async function refreshShopifyJobStatus() {
  if (!selectedProductStoreId.value) {
    productStoreStore.currentShopifyJobStatus = null
    return
  }

  isLoadingShopifyJobStatus.value = true
  try {
    // When using an existing shop that isn't linked yet, pass it as a candidate so the read-write
    // remote check evaluates the selected shop (not just shops already linked to the product store).
    const candidateShop = isExistingShopifyMode.value && onboardingStore.draft.selectedShopifyShopId
      ? shopifyStore.getShopById(onboardingStore.draft.selectedShopifyShopId)
      : null
    await productStoreStore.fetchProductStoreShopifyJobStatus(selectedProductStoreId.value, candidateShop)
  } catch (error: any) {
    logger.warn("Failed to refresh Shopify job status", error)
  } finally {
    isLoadingShopifyJobStatus.value = false
  }
}

async function fixRemoteAccessScope(systemMessageRemoteId: string) {
  if (!systemMessageRemoteId) return
  emitter.emit("presentLoader")
  try {
    const resp = await productStoreStore.setSystemMessageRemoteReadWriteAccess(systemMessageRemoteId)
    if (commonUtil.hasError(resp)) throw resp.data
    commonUtil.showToast(translate("Read-write access enabled for this connection"))
    await refreshShopifyJobStatus()
  } catch (error: any) {
    logger.error("Failed to enable read-write access", error)
    commonUtil.showToast(translate("Failed to enable read-write access"))
  }
  emitter.emit("dismissLoader")
}

async function refreshProductImportProgress() {
  if (!linkedShopifyShopId.value) {
    productImportProgressState.value = {}
    productImportRun.value = null
    stopProductImportProgressPolling()
    return false
  }

  if (isLoadingProductImportProgress.value) return false

  isLoadingProductImportProgress.value = true
  try {
    const trackedSystemMessageId = productImportProgressState.value?.systemMessageId || ""
    const syncRunState = await shopifyProductSyncStore.fetchProductUpdateSyncRunState({
      shopId: linkedShopifyShopId.value,
      systemMessageId: trackedSystemMessageId
    })
    const latestMessage = trackedSystemMessageId
      ? syncRunState.systemMessages?.find((message: any) => message.systemMessageId === trackedSystemMessageId) || syncRunState.latestSystemMessage
      : syncRunState.latestSystemMessage

    // After a retry, hold the "queued" placeholder (and keep polling) until the job produces a NEW
    // message — don't snap back to the old failed run. Switch to the new run as soon as it appears.
    if (awaitingProductImportRerun.value) {
      const newRunId = latestMessage?.systemMessageId
      if (newRunId && newRunId !== productImportRetryBaselineId) {
        awaitingProductImportRerun.value = false
      } else if (productImportRerunWaitPolls < 24) {
        productImportRerunWaitPolls++
        return true
      } else {
        awaitingProductImportRerun.value = false
      }
    }

    if (!latestMessage?.systemMessageId) {
      productImportRun.value = null
      return false
    }

    const status = normalizeProductSyncStatus({
      systemMessageState: latestMessage.statusId,
      logStatusId: latestMessage.logStatusId,
      logId: latestMessage.logId
    })
    productImportProgressState.value = {
      ...productImportProgressState.value,
      ...latestMessage,
      systemMessageId: latestMessage.systemMessageId,
      systemMessageState: latestMessage.statusId,
      logStatusId: latestMessage.logStatusId,
      logId: latestMessage.logId,
      status,
      completed: ["completed", "error", "cancelled"].includes(status)
    }
    productImportRun.value = await fetchProductImportSyncRun(latestMessage.systemMessageId, latestMessage)

    if (productImportProgressState.value.completed) {
      // For Shopify-sourced inventory, the imported products can land in OMS a little after the
      // sync reports "completed". Keep refreshing the OMS product count for a bounded number of
      // extra polls so the inventory step unblocks as soon as products exist (and doesn't require
      // the user to leave and re-enter the wizard). Failed/cancelled syncs stop immediately.
      const waitForProducts = status === "completed"
        && shouldSetupShopifyInventoryReset.value
        && !!linkedShopifyShopId.value
        && !!selectedProductStoreId.value
      if (waitForProducts && omsProductCount.value === 0 && productImportPostCompletePolls < 12) {
        omsProductCount.value = await productStoreStore.fetchProductStoreProductCount(selectedProductStoreId.value)
        productImportPostCompletePolls++
      }
      if (!waitForProducts || omsProductCount.value > 0 || productImportPostCompletePolls >= 12) {
        stopProductImportProgressPolling()
      }
    }
    return true
  } catch (error: any) {
    logger.warn("Failed to refresh product import progress", error)
    return false
  } finally {
    isLoadingProductImportProgress.value = false
  }
}

function startProductImportProgressPolling() {
  stopProductImportProgressPolling()
  productImportPostCompletePolls = 0
  productImportProgressPoll = window.setInterval(refreshProductImportProgress, 5000)
}

function stopProductImportProgressPolling() {
  if (!productImportProgressPoll) return
  window.clearInterval(productImportProgressPoll)
  productImportProgressPoll = undefined
}

async function refreshShopifyMappingStatus() {
  shopifyMappingCounts.value = {
    productTypes: 0,
    orderSources: 0,
    paymentMethods: 0,
    shippingMethods: 0,
    locations: 0
  }

  if (!linkedShopifyShopId.value) return

  isLoadingShopifyMappingStatus.value = true

  try {
    const shopId = linkedShopifyShopId.value
    await refreshShopifyLocationMappings()

    const [
      productTypeMappings,
      orderSourceMappings,
      paymentMethodMappings,
      shippingMethodMappings
    ] = await Promise.all([
      shopifyStore.fetchShopifyTypeMappings({ shopId, mappedTypeId: "SHOPIFY_PRODUCT_TYPE" }),
      shopifyStore.fetchShopifyTypeMappings({ shopId, mappedTypeId: "SHOPIFY_ORDER_SOURCE" }),
      shopifyStore.fetchShopifyTypeMappings({ shopId, mappedTypeId: "SHOPIFY_PAYMENT_TYPE" }),
      shopifyStore.fetchShopifyShopsCarrierShipments({ shopId })
    ])

    shopifyMappingCounts.value = {
      productTypes: productTypeMappings.length,
      orderSources: orderSourceMappings.length,
      paymentMethods: paymentMethodMappings.length,
      shippingMethods: shippingMethodMappings.length,
      locations: shopifyLocationMappings.value.length
    }
  } catch (error: any) {
    logger.warn("Failed to refresh Shopify mapping status", error)
  } finally {
    isLoadingShopifyMappingStatus.value = false
  }
}

onIonViewWillEnter(async () => {
  awaitingProductImportRerun.value = false
  if (routeProductStoreId.value) {
    onboardingStore.setCreatedProductStoreId(routeProductStoreId.value)
  } else {
    onboardingStore.resetDraft()
    productStoreStore.current = {}
    productStoreStore.currentStoreSettings = {}
    productStoreStore.currentFacilities = []
    productStoreStore.currentShopifyJobStatus = null
  }

  await loadSetupData()
})

onIonViewDidLeave(() => {
  stopProductImportProgressPolling()
})

async function loadSetupData() {
  isLoadingSetupData.value = true

  try {
    if (!utilStore.organizationPartyId) await utilStore.fetchOrganizationPartyId()

    await Promise.allSettled([
      utilStore.fetchDBICCountries(),
      utilStore.fetchCurrencies({ uomTypeEnumId: "UT_CURRENCY_MEASURE", pageSize: 250 }),
      utilStore.fetchFacilities(),
      utilStore.fetchFacilityGroups(),
      utilStore.fetchProductIdentifiers(),
      utilStore.fetchGoodIdentificationTypes(),
      utilStore.fetchProductTypes(),
      utilStore.fetchShipmentMethodTypes(),
      netSuiteStore.fetchSalesChannel(),
      netSuiteStore.fetchPaymentMethods(),
      productStoreStore.fetchProductStores(),
      shopifyStore.fetchShopifyShops(),
      userStore.availableTimeZones.length ? Promise.resolve() : userStore.fetchAvailableTimeZones()
    ])

    if (utilStore.organizationPartyId) await productStoreStore.fetchCompany()
    await loadSelectedProductStoreSetup()
    await refreshShopifyMappingStatus()
    const loadedProductImportProgress = await refreshProductImportProgress()
    if (loadedProductImportProgress && isProductImportInProgress.value) startProductImportProgressPolling()
    // Seed the OMS product count on (re-)entry when the sync already shows completed, so the
    // inventory step gates correctly without waiting for the next poll cycle.
    if (shouldSetupShopifyInventoryReset.value && linkedShopifyShopId.value && selectedProductStoreId.value && isProductSyncRun.value) {
      omsProductCount.value = await productStoreStore.fetchProductStoreProductCount(selectedProductStoreId.value)
    }
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

  if (productStoreId.length > 20) {
    commonUtil.showToast(translate("Product store ID cannot be more than 20 characters."))
    return ""
  }

  isSavingProductStore.value = true
  emitter.emit("presentLoader")

  try {
    if (!organizationPartyId.value) {
      // No company name is collected; default the bootstrapped organization to the store name.
      const bootstrapCompanyName = productStoreStore.company.companyName || storeName
      await utilStore.bootstrapOrganization({ groupName: bootstrapCompanyName })
      if (organizationPartyId.value) await productStoreStore.fetchCompany()
    }

    if (!organizationPartyId.value) {
      commonUtil.showToast(translate("Unable to find company organization."))
      return ""
    }

    const payload = {
      storeName,
      productStoreId,
      companyName: productStoreStore.company.companyName || storeName,
      payToPartyId: organizationPartyId.value,
      defaultCurrencyUomId: onboardingStore.draft.defaultCurrencyUomId,
      defaultLocaleString: onboardingStore.draft.locale,
      defaultTimeZone: onboardingStore.draft.timezone
    } as any

    const resp = await productStoreStore.createProductStore(payload)

    if (commonUtil.hasError(resp)) throw resp.data

    const createdProductStoreId = resp.data.productStoreId
    onboardingStore.setCreatedProductStoreId(createdProductStoreId)
    onboardingStore.updateDraftField("productStoreId", createdProductStoreId)

    // A new store must be linked to a catalog, otherwise product import fails with
    // "Could not find ProductStoreCatalog for ProductStore". Link it to the default seeded
    // catalog ("CATALOG", which carries the browse-root category). Non-fatal: if it fails the
    // store still exists and the product step surfaces the import error with a re-run link.
    try {
      const catalogResp = await productStoreStore.associateProductStoreCatalog({ productStoreId: createdProductStoreId, prodCatalogId: "CATALOG" })
      if (commonUtil.hasError(catalogResp)) throw catalogResp.data
    } catch (error: any) {
      logger.error("Failed to link product store to catalog", error)
    }

    await productStoreStore.fetchProductStores()
    await refreshShopifyJobStatus()
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
    productStoreStore.fetchCurrentStoreSettings(selectedProductStoreId.value),
    productStoreStore.fetchProductStoreFacilities(selectedProductStoreId.value),
    netSuiteStore.fetchProductStoreShipmentMethods({ productStoreId: selectedProductStoreId.value }),
    refreshShopifyJobStatus()
  ])

  if (productStoreStore.current?.productIdentifierEnumId) {
    onboardingStore.updateDraftField("productIdentifierEnumId", productStoreStore.current.productIdentifierEnumId)
  }

  if (productStoreStore.current?.autoApproveOrder) {
    onboardingStore.updateDraftField("autoApproveOrder", productStoreStore.current.autoApproveOrder)
  }

  if (productStoreStore.current?.reserveInventory) {
    onboardingStore.updateDraftField("reserveInventory", productStoreStore.current.reserveInventory)
  }

  if (productStoreStore.current?.enableBrokering) {
    onboardingStore.updateDraftField("enableBrokering", productStoreStore.current.enableBrokering)
  }

  if (productStoreStore.current?.allowSplit) {
    onboardingStore.updateDraftField("allowSplit", productStoreStore.current.allowSplit)
  }

  if (Number(productStoreStore.current?.daysToCancelNonPay || 0) > 0) {
    onboardingStore.updateDraftField("autoCancelOrders", "Y")
    onboardingStore.updateDraftField("daysToCancelNonPay", String(productStoreStore.current.daysToCancelNonPay))
  } else {
    onboardingStore.updateDraftField("autoCancelOrders", "N")
    onboardingStore.updateDraftField("daysToCancelNonPay", "")
  }

  if (typeof productStoreStore.current?.orderNumberPrefix === "string") {
    onboardingStore.updateDraftField("orderNumberPrefix", productStoreStore.current.orderNumberPrefix)
  }

  if (productStoreStore.currentStoreSettings?.SAVE_BILL_TO_INF?.settingValue) {
    onboardingStore.updateDraftField("saveBillingInformation", productStoreStore.currentStoreSettings.SAVE_BILL_TO_INF.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.INV_CNT_VIEW_QOH?.settingValue) {
    onboardingStore.updateDraftField("showSystemicInventory", productStoreStore.currentStoreSettings.INV_CNT_VIEW_QOH.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.HOLD_PRORD_PHYCL_INV?.settingValue) {
    onboardingStore.updateDraftField("holdPreorderPhysicalInventory", productStoreStore.currentStoreSettings.HOLD_PRORD_PHYCL_INV.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.PRE_ORDER_GROUP_ID?.settingValue) {
    onboardingStore.updateDraftField("preorderFacilityGroupId", productStoreStore.currentStoreSettings.PRE_ORDER_GROUP_ID.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.FULFILL_NOTIF?.settingValue) {
    onboardingStore.updateDraftField("sendFulfillmentNotification", productStoreStore.currentStoreSettings.FULFILL_NOTIF.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.BOPIS_PART_ODR_REJ?.settingValue) {
    onboardingStore.updateDraftField("bopisPartialRejection", productStoreStore.currentStoreSettings.BOPIS_PART_ODR_REJ.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.CUST_DLVRMTHD_UPDATE?.settingValue) {
    onboardingStore.updateDraftField("customerDeliveryMethodUpdate", productStoreStore.currentStoreSettings.CUST_DLVRMTHD_UPDATE.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.RF_SHIPPING_METHOD?.settingValue) {
    onboardingStore.updateDraftField("rerouteShippingMethodId", productStoreStore.currentStoreSettings.RF_SHIPPING_METHOD.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.CUST_DLVRADR_UPDATE?.settingValue) {
    onboardingStore.updateDraftField("customerDeliveryAddressUpdate", productStoreStore.currentStoreSettings.CUST_DLVRADR_UPDATE.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.CUST_PCKUP_UPDATE?.settingValue) {
    onboardingStore.updateDraftField("customerPickupUpdate", productStoreStore.currentStoreSettings.CUST_PCKUP_UPDATE.settingValue)
  }

  if (productStoreStore.currentStoreSettings?.CUST_ALLOW_CNCL?.settingValue) {
    onboardingStore.updateDraftField("customerCancelBeforeFulfillment", productStoreStore.currentStoreSettings.CUST_ALLOW_CNCL.settingValue)
  }

  // Prefer the store's saved identification preference; otherwise fall back to the SKU/UPCA
  // defaults so an existing store with no saved preference still shows (and persists) sensible
  // defaults rather than "Not selected". Mirrors DEFAULT_DRAFT for freshly created stores.
  if (!onboardingStore.draft.primaryProductIdentification) {
    onboardingStore.updateDraftField("primaryProductIdentification", productIdentityPreferences.value.primaryId || "SKU")
  }

  if (!onboardingStore.draft.secondaryProductIdentification) {
    onboardingStore.updateDraftField("secondaryProductIdentification", productIdentityPreferences.value.secondaryId || "UPCA")
  }

  // A stale/unrecognized persisted locale (e.g. a pre-migration value) won't match any option and
  // renders blank — fall back to the default so the select always shows a valid selection.
  if (!localeOptions.some((option) => option.value === onboardingStore.draft.locale)) {
    onboardingStore.updateDraftField("locale", "en_US")
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

  if (currentStep.value.id === "shopify" && onboardingStore.draft.shopifyConnectionMode === "Authenticate new shop" && !linkedShopifyShop.value) {
    const shopCreated = await createShopifyConnectionForProductStore()
    if (!shopCreated) return
  }

  if (currentStep.value.id === "general") {
    const orderDefaultsSaved = await saveOrderDefaults()
    if (!orderDefaultsSaved) return
  }

  if (currentStep.value.id === "products") {
    const productIdentitySaved = await saveProductIdentity()
    if (!productIdentitySaved) return

    if (linkedShopifyShopId.value && !isProductSyncStarted.value) {
      const productImportStarted = await setupAndQueueInitialProductImport(false)
      if (!productImportStarted) return
    }
  }

  if (currentStep.value.id === "facilities" && shouldCreateStarterFacility.value) {
    const starterFacilityCreated = await createStarterFacility()
    if (!starterFacilityCreated) return
  }

  if (currentStep.value.id === "inventory") {
    const inventorySettingsSaved = await saveInventorySettings()
    if (!inventorySettingsSaved) return

    if (shouldSetupShopifyInventoryReset.value && linkedShopifyShopId.value && !isProductImportInProgress.value) {
      const inventoryResetConfigured = await setupInventoryResetJob()
      if (!inventoryResetConfigured) return

      const initialInventoryImportQueued = await queueInitialInventoryImport()
      if (!initialInventoryImportQueued) return
    } else if (shouldSetupShopifyInventoryReset.value && isProductImportInProgress.value) {
      commonUtil.showToast(translate("Inventory import will be available after products finish importing."))
    } else if (shouldSetupShopifyInventoryReset.value && !linkedShopifyShopId.value) {
      commonUtil.showToast(translate("Inventory import will be available after Shopify is linked."))
    }
  }

  if (currentStep.value.id === "orders" && linkedShopifyShopId.value) {
    const orderJobsConfigured = await setupOrderImportJobs()
    if (!orderJobsConfigured) return

    const realtimeOrderJobsConfigured = await setupRealtimeOrderImportJobs()
    if (!realtimeOrderJobsConfigured) return

    const initialOrderHistoryQueued = await queueInitialOrderHistoryImport()
    if (!initialOrderHistoryQueued) return
  } else if (currentStep.value.id === "orders") {
    commonUtil.showToast(translate("Order import will be available after Shopify is linked."))
  }

  if (currentStep.value.id === "routing") {
    const routingDefaultsSaved = await saveRoutingDefaults()
    if (!routingDefaultsSaved) return
  }

  if (currentStep.value.id === "pickup") {
    const pickupSettingsSaved = await savePickupSettings()
    if (!pickupSettingsSaved) return
  }

  if (currentStep.value.id === "readiness") {
    if (requiredReadinessGapCount.value) {
      const gapsResolved = await resolveReadinessGaps()
      if (!gapsResolved) return
    }

    onboardingStore.markCurrentStepComplete()
    commonUtil.showToast(translate("Product Store setup is ready."))
    return
  }

  onboardingStore.goNext()
  window.setTimeout(() => emitter.emit("dismissLoader"), 0)

  if (productStoreId) {
    replaceRouteForProductStore(productStoreId)
  }
}

async function resolveReadinessGaps() {
  if (hasShopifyMappingGaps.value) {
    const mappingsCreated = await setupStarterShopifyMappings()
    if (!mappingsCreated) return false
  }

  await loadSelectedProductStoreSetup()
  await refreshShopifyMappingStatus()

  if (requiredReadinessGapCount.value) {
    const firstGap = requiredReadinessItems.value.find((item) => item.color === "warning")
    const stepIdByGap: Record<string, string> = {
      productStore: "name",
      shopifyShop: "shopify",
      shopifyMappings: "shopify",
      productIdentity: "products",
      facilities: "facilities",
      locationMappings: "locations",
      inventory: "inventory",
      orders: "orders"
    }
    const nextStepId = firstGap ? stepIdByGap[firstGap.id] : ""
    if (nextStepId) onboardingStore.selectStep(nextStepId)
    commonUtil.showToast(translate("Some setup gaps still need attention."))
    return false
  }

  return true
}

async function setupStarterShopifyMappings() {
  if (!selectedProductStoreId.value || !linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Create the Product Store and link Shopify first."))
    return false
  }

  isSavingShopifyStarterMappings.value = true
  emitter.emit("presentLoader")

  try {
    await Promise.allSettled([
      utilStore.fetchProductTypes(),
      utilStore.fetchShipmentMethodTypes(),
      netSuiteStore.fetchSalesChannel(),
      netSuiteStore.fetchPaymentMethods(),
      netSuiteStore.fetchProductStoreShipmentMethods({ productStoreId: selectedProductStoreId.value })
    ])

    if (!activeProductStoreShipmentMethods.value.length) {
      const shipmentMethodResp = await productStoreStore.createProductStoreShipmentMethod({
        productStoreId: selectedProductStoreId.value,
        productStoreShipMethId: buildStarterShipmentMethodId(selectedProductStoreId.value, starterShipmentMethodTypeId.value),
        shipmentMethodTypeId: starterShipmentMethodTypeId.value,
        partyId: "_NA_",
        roleTypeId: "CARRIER",
        sequenceNumber: 10
      })
      if (commonUtil.hasError(shipmentMethodResp)) throw shipmentMethodResp.data
      await netSuiteStore.fetchProductStoreShipmentMethods({ productStoreId: selectedProductStoreId.value })
    }

    const shopId = linkedShopifyShopId.value
    const [
      productTypeMappings,
      orderSourceMappings,
      paymentMethodMappings,
      shippingMethodMappings
    ] = await Promise.all([
      shopifyStore.fetchShopifyTypeMappings({ shopId, mappedTypeId: "SHOPIFY_PRODUCT_TYPE" }),
      shopifyStore.fetchShopifyTypeMappings({ shopId, mappedTypeId: "SHOPIFY_ORDER_SOURCE" }),
      shopifyStore.fetchShopifyTypeMappings({ shopId, mappedTypeId: "SHOPIFY_PAYMENT_TYPE" }),
      shopifyStore.fetchShopifyShopsCarrierShipments({ shopId })
    ])

    if (!productTypeMappings.length) {
      const resp = await shopifyStore.createShopifyShopTypeMapping({
        shopId,
        mappedTypeId: "SHOPIFY_PRODUCT_TYPE",
        mappedKey: "Default",
        mappedValue: starterProductTypeId.value
      })
      if (commonUtil.hasError(resp)) throw resp.data
    }

    if (!orderSourceMappings.length) {
      const resp = await shopifyStore.createShopifyShopTypeMapping({
        shopId,
        mappedTypeId: "SHOPIFY_ORDER_SOURCE",
        mappedKey: "web",
        mappedValue: starterSalesChannelEnumId.value
      })
      if (commonUtil.hasError(resp)) throw resp.data
    }

    if (!paymentMethodMappings.length) {
      const resp = await shopifyStore.createShopifyShopTypeMapping({
        shopId,
        mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
        mappedKey: "manual",
        mappedValue: starterPaymentMethodTypeId.value
      })
      if (commonUtil.hasError(resp)) throw resp.data
    }

    if (!shippingMethodMappings.length) {
      const shippingMethod = starterShippingMethod.value
      const resp = await shopifyStore.createShopifyShopCarrierShipment({
        shopId,
        shipmentMethodTypeId: shippingMethod.shipmentMethodTypeId,
        shopifyShippingMethod: "Standard",
        carrierPartyId: shippingMethod.partyId || "_NA_"
      })
      if (commonUtil.hasError(resp)) throw resp.data
    }

    await refreshShopifyMappingStatus()
    commonUtil.showToast(translate("Starter Shopify mappings created."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to create starter Shopify mappings."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSavingShopifyStarterMappings.value = false
  }
}

function buildStarterShipmentMethodId(productStoreId: string, shipmentMethodTypeId: string) {
  return `${productStoreId}_${shipmentMethodTypeId}`.slice(0, 40)
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

async function saveInventorySettings() {
  if (!selectedProductStoreId.value) {
    commonUtil.showToast(translate("Create the Product Store before saving inventory settings."))
    return false
  }

  isSavingInventorySettings.value = true
  emitter.emit("presentLoader")

  try {
    const currentStore = productStoreStore.current?.productStoreId === selectedProductStoreId.value
      ? productStoreStore.current
      : { productStoreId: selectedProductStoreId.value }
    const productStorePayload = {
      ...currentStore,
      productStoreId: selectedProductStoreId.value,
      reserveInventory: onboardingStore.draft.reserveInventory === "Y" ? "Y" : "N"
    }
    const productStoreResp = await productStoreStore.updateProductStore(productStorePayload)

    if (commonUtil.hasError(productStoreResp)) throw productStoreResp.data

    productStoreStore.updateCurrent(productStorePayload)

    const settingPayloads = [
      buildInventorySettingPayload("INV_CNT_VIEW_QOH", onboardingStore.draft.showSystemicInventory === "true" ? "true" : "false"),
      buildInventorySettingPayload("HOLD_PRORD_PHYCL_INV", onboardingStore.draft.holdPreorderPhysicalInventory === "true" ? "true" : "false")
    ]

    if (onboardingStore.draft.preorderFacilityGroupId || productStoreStore.currentStoreSettings?.PRE_ORDER_GROUP_ID) {
      settingPayloads.push(buildInventorySettingPayload("PRE_ORDER_GROUP_ID", onboardingStore.draft.preorderFacilityGroupId))
    }

    const updatedSettings = { ...productStoreStore.currentStoreSettings }
    for (const payload of settingPayloads) {
      const settingResp = await productStoreStore.saveCurrentStoreSettings(payload)
      if (commonUtil.hasError(settingResp)) throw settingResp.data
      updatedSettings[payload.settingTypeEnumId] = payload
    }

    productStoreStore.updateCurrentStoreSettings(updatedSettings)
    commonUtil.showToast(translate("Inventory settings saved successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to save inventory settings."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSavingInventorySettings.value = false
  }
}

function buildInventorySettingPayload(settingTypeEnumId: string, settingValue: string) {
  const existingSetting = productStoreStore.currentStoreSettings?.[settingTypeEnumId]
  return {
    ...(existingSetting || {}),
    fromDate: existingSetting?.fromDate || Date.now(),
    productStoreId: selectedProductStoreId.value,
    settingTypeEnumId,
    settingValue
  }
}

async function setupInventoryResetJob() {
  if (!selectedProductStoreId.value || !linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before configuring inventory reset."))
    return false
  }

  isSettingUpInventoryResetJob.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.setupProductStoreShopifyInventoryReset({
      productStoreId: selectedProductStoreId.value,
      shopId: linkedShopifyShopId.value,
      activateJobs: false,
      inventoryResetAdditionalParameters: {}
    })

    if (commonUtil.hasError(resp)) throw resp.data

    if (resp.data?.shopifyJobsStatus) {
      productStoreStore.currentShopifyJobStatus = resp.data.shopifyJobsStatus
    } else {
      await refreshShopifyJobStatus()
    }

    commonUtil.showToast(translate("Inventory reset configured successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to configure inventory reset."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSettingUpInventoryResetJob.value = false
  }
}

async function queueInitialInventoryImport() {
  if (!linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before loading inventory."))
    return false
  }

  if (isProductImportInProgress.value) {
    commonUtil.showToast(translate("Finish the Shopify product import before loading inventory."))
    return false
  }

  if (!mappedShopifyLocationCount.value) {
    commonUtil.showToast(translate("Map Shopify inventory locations before loading inventory."))
    return false
  }

  isQueueingInventoryImport.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.runProductStoreShopifyInventoryReset({
      shopId: linkedShopifyShopId.value
    })

    if (commonUtil.hasError(resp)) throw resp.data

    commonUtil.showToast(translate("Initial inventory import queued."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to queue initial inventory import."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isQueueingInventoryImport.value = false
  }
}

async function setupOrderImportJobs() {
  if (!selectedProductStoreId.value || !linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before configuring order jobs."))
    return false
  }

  isSettingUpOrderJobs.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.setupProductStoreShopifyOrderImport({
      productStoreId: selectedProductStoreId.value,
      shopId: linkedShopifyShopId.value,
      activateJobs: false
    })

    if (commonUtil.hasError(resp)) throw resp.data

    if (resp.data?.shopifyJobsStatus) {
      productStoreStore.currentShopifyJobStatus = resp.data.shopifyJobsStatus
    } else {
      await refreshShopifyJobStatus()
    }

    commonUtil.showToast(translate("Order jobs configured successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to configure order jobs."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSettingUpOrderJobs.value = false
  }
}

async function setupRealtimeOrderImportJobs() {
  if (!shouldConfigureRealtimeOrderImport.value) return true

  if (!selectedProductStoreId.value || !onboardingStore.draft.orderSqsQueueName.trim()) {
    commonUtil.showToast(translate("Enter the SQS queue before configuring realtime order import."))
    return false
  }

  isSettingUpRealtimeOrderJobs.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.setupProductStoreShopifyRealtimeOrderImport({
      productStoreId: selectedProductStoreId.value,
      queueName: onboardingStore.draft.orderSqsQueueName.trim(),
      awsRemoteId: onboardingStore.draft.orderSqsAwsRemoteId.trim() || "AWS_CONFIG",
      expireLockTime: Number(onboardingStore.draft.orderSqsExpireLockTime || 10),
      activateJobs: false
    })

    if (commonUtil.hasError(resp)) throw resp.data

    if (resp.data?.shopifyJobsStatus) {
      productStoreStore.currentShopifyJobStatus = resp.data.shopifyJobsStatus
    } else {
      await refreshShopifyJobStatus()
    }

    commonUtil.showToast(translate("Realtime order import configured successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to configure realtime order import."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSettingUpRealtimeOrderJobs.value = false
  }
}

async function queueInitialOrderHistoryImport() {
  if (!linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before loading orders."))
    return false
  }

  if (!orderHistoryStartDateTime.value) {
    commonUtil.showToast(translate("Choose how far back to load Shopify order history."))
    return false
  }

  if (!orderLaunchDateTime.value) {
    commonUtil.showToast(translate("Choose the HotWax go-live date for order import."))
    return false
  }

  isQueueingOrderHistoryImport.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.runProductStoreShopifyOrderHistoryImport({
      shopId: linkedShopifyShopId.value,
      fromDate: orderHistoryStartDateTime.value,
      launchDate: orderLaunchDateTime.value,
      windowDays: 7
    })

    if (commonUtil.hasError(resp)) throw resp.data

    commonUtil.showToast(translate("Initial order history import queued."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to queue initial order history import."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isQueueingOrderHistoryImport.value = false
  }
}

async function saveRoutingDefaults() {
  if (!selectedProductStoreId.value) {
    commonUtil.showToast(translate("Create the Product Store before saving routing defaults."))
    return false
  }

  isSavingRoutingDefaults.value = true
  emitter.emit("presentLoader")

  try {
    const currentStore = productStoreStore.current?.productStoreId === selectedProductStoreId.value
      ? productStoreStore.current
      : { productStoreId: selectedProductStoreId.value }
    const brokeringEnabled = onboardingStore.draft.enableBrokering === "Y"
    const daysToCancelNonPay = onboardingStore.draft.autoCancelOrders === "Y"
      ? Number(onboardingStore.draft.daysToCancelNonPay || 0)
      : 0
    const productStorePayload = {
      ...currentStore,
      productStoreId: selectedProductStoreId.value,
      enableBrokering: brokeringEnabled ? "Y" : "N",
      allowSplit: brokeringEnabled && onboardingStore.draft.allowSplit === "Y" ? "Y" : "N",
      daysToCancelNonPay
    }
    const productStoreResp = await productStoreStore.updateProductStore(productStorePayload)

    if (commonUtil.hasError(productStoreResp)) throw productStoreResp.data

    productStoreStore.updateCurrent(productStorePayload)

    const notificationPayload = buildRoutingSettingPayload(
      "FULFILL_NOTIF",
      onboardingStore.draft.sendFulfillmentNotification === "Y" ? "Y" : "N"
    )
    const notificationResp = await productStoreStore.saveCurrentStoreSettings(notificationPayload)

    if (commonUtil.hasError(notificationResp)) throw notificationResp.data

    productStoreStore.updateCurrentStoreSettings({
      ...productStoreStore.currentStoreSettings,
      FULFILL_NOTIF: notificationPayload
    })

    commonUtil.showToast(translate("Routing defaults saved successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to save routing defaults."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSavingRoutingDefaults.value = false
  }
}

function buildRoutingSettingPayload(settingTypeEnumId: string, settingValue: string) {
  const existingSetting = productStoreStore.currentStoreSettings?.[settingTypeEnumId]
  return {
    ...(existingSetting || {}),
    fromDate: existingSetting?.fromDate || Date.now(),
    productStoreId: selectedProductStoreId.value,
    settingTypeEnumId,
    settingValue
  }
}

async function savePickupSettings() {
  if (!selectedProductStoreId.value) {
    commonUtil.showToast(translate("Create the Product Store before saving pickup settings."))
    return false
  }

  isSavingPickupSettings.value = true
  emitter.emit("presentLoader")

  try {
    const settingPayloads = [
      buildPickupSettingPayload("BOPIS_PART_ODR_REJ", onboardingStore.draft.bopisPartialRejection === "true" ? "true" : "false"),
      buildPickupSettingPayload("CUST_DLVRMTHD_UPDATE", onboardingStore.draft.customerDeliveryMethodUpdate === "true" ? "true" : "false"),
      buildPickupSettingPayload("CUST_DLVRADR_UPDATE", onboardingStore.draft.customerDeliveryAddressUpdate === "true" ? "true" : "false"),
      buildPickupSettingPayload("CUST_PCKUP_UPDATE", onboardingStore.draft.customerPickupUpdate === "true" ? "true" : "false"),
      buildPickupSettingPayload("CUST_ALLOW_CNCL", onboardingStore.draft.customerCancelBeforeFulfillment === "true" ? "true" : "false")
    ]

    if (onboardingStore.draft.rerouteShippingMethodId || productStoreStore.currentStoreSettings?.RF_SHIPPING_METHOD) {
      settingPayloads.push(buildPickupSettingPayload("RF_SHIPPING_METHOD", onboardingStore.draft.rerouteShippingMethodId))
    }

    const updatedSettings = { ...productStoreStore.currentStoreSettings }
    for (const payload of settingPayloads) {
      const settingResp = await productStoreStore.saveCurrentStoreSettings(payload)
      if (commonUtil.hasError(settingResp)) throw settingResp.data
      updatedSettings[payload.settingTypeEnumId] = payload
    }

    productStoreStore.updateCurrentStoreSettings(updatedSettings)
    commonUtil.showToast(translate("Pickup settings saved successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to save pickup settings."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSavingPickupSettings.value = false
  }
}

function buildPickupSettingPayload(settingTypeEnumId: string, settingValue: string) {
  const existingSetting = productStoreStore.currentStoreSettings?.[settingTypeEnumId]
  return {
    ...(existingSetting || {}),
    fromDate: existingSetting?.fromDate || Date.now(),
    productStoreId: selectedProductStoreId.value,
    settingTypeEnumId,
    settingValue
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

async function setupAndQueueInitialProductImport(shouldSaveIdentity = true) {
  if (shouldSaveIdentity) {
    const productIdentitySaved = await saveProductIdentity()
    if (!productIdentitySaved) return false
  }

  const productImportJobConfigured = await setupProductImportJob()
  if (!productImportJobConfigured) return false

  return queueInitialProductImport()
}

// Re-run the catalog import in place from the onboarding page (used after a failed/partial run).
// Runs the per-shop product-sync service job (system context) rather than the on-demand
// shopify/products/sync endpoint — the on-demand path creates the bulk-query SystemMessage in the
// user's authz context (403 for framework messages), whereas the job produces it as the system user.
async function retryProductImport() {
  if (!canRetryProductImport.value || !linkedShopifyShopId.value) return
  const jobName = `sync_ShopifyProductUpdates_${linkedShopifyShopId.value}`
  emitter.emit("presentLoader")
  try {
    const resp = await runServiceJobNow(jobName)
    if (commonUtil.hasError(resp)) throw resp.data
    commonUtil.showToast(translate("Product import re-run started."))
    // Switch the card to a live "queued" placeholder and watch for the job's new message, without
    // snapping back to the old failed run. The poller swaps to the new run as soon as it appears.
    productImportRetryBaselineId = productImportProgressState.value?.systemMessageId || ""
    productImportRerunWaitPolls = 0
    productImportPostCompletePolls = 0
    awaitingProductImportRerun.value = true
    productImportProgressState.value = { status: "queued", completed: false, systemMessageId: "" }
    productImportRun.value = null
    startProductImportProgressPolling()
  } catch (error: any) {
    logger.error("Failed to re-run product import job", error)
    commonUtil.showToast(translate("Failed to re-run product import."))
  } finally {
    emitter.emit("dismissLoader")
  }
}

async function setupProductImportJob() {
  if (!selectedProductStoreId.value || !linkedShopifyShopId.value || !onboardingStore.draft.productIdentifierEnumId) {
    commonUtil.showToast(translate("Link a Shopify shop and choose a product identifier before configuring product import."))
    return false
  }

  isSettingUpProductImportJob.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.setupProductStoreShopifyProductImport({
      productStoreId: selectedProductStoreId.value,
      shopId: linkedShopifyShopId.value,
      productIdentifierEnumId: onboardingStore.draft.productIdentifierEnumId,
      activateJobs: true
    })

    if (commonUtil.hasError(resp)) throw resp.data

    if (resp.data?.shopifyJobsStatus) {
      productStoreStore.currentShopifyJobStatus = resp.data.shopifyJobsStatus
    } else {
      await refreshShopifyJobStatus()
    }

    commonUtil.showToast(translate("Product import job configured successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to configure product import."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isSettingUpProductImportJob.value = false
  }
}

async function queueInitialProductImport() {
  if (!linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before importing products."))
    return false
  }

  isQueueingProductImport.value = true
  emitter.emit("presentLoader")

  try {
    const resp = await productStoreStore.runProductStoreShopifyProductImport({
      shopId: linkedShopifyShopId.value,
      includeAll: true
    })

    if (commonUtil.hasError(resp)) throw resp.data

    const systemMessageId = resp.data?.systemMessageId || resp.data?.progress?.systemMessageId || resp.data?.syncJobId || ""
    if (systemMessageId) {
      productImportProgressState.value = {
        systemMessageId,
        systemMessageState: "SmsgProduced",
        status: "queued",
        completed: false
      }
      productImportRun.value = null
      await refreshProductImportProgress()
      startProductImportProgressPolling()
    } else {
      const loadedProductImportProgress = await refreshProductImportProgress()
      if (loadedProductImportProgress && isProductImportInProgress.value) startProductImportProgressPolling()
    }

    await refreshShopifyJobStatus()
    commonUtil.showToast(translate("Initial product import queued."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to queue initial product import."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isQueueingProductImport.value = false
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
    await refreshShopifyJobStatus()
    await refreshShopifyMappingStatus()
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

async function createShopifyConnectionForProductStore() {
  if (!selectedProductStoreId.value) {
    commonUtil.showToast(translate("Create the Product Store before connecting Shopify."))
    return false
  }

  const modal = await modalController.create({
    component: CreateShopifyConnectionModal,
    componentProps: {
      productStoreId: selectedProductStoreId.value,
      initialDomain: onboardingStore.draft.shopifyDomain
    }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (!data?.shopId) return false

  await shopifyStore.fetchShopifyShops()
  const createdShop = shopifyStore.getShopById(data.shopId)
  onboardingStore.updateDraftField("linkedShopifyShopId", data.shopId)
  onboardingStore.updateDraftField("selectedShopifyShopId", data.shopId)
  onboardingStore.updateDraftField("shopifyDomain", createdShop?.myshopifyDomain || onboardingStore.draft.shopifyDomain)
  await refreshShopifyJobStatus()
  await refreshShopifyMappingStatus()
  return true
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
      componentProps: {
        shopId: linkedShopifyShopId.value,
        productStoreId: selectedProductStoreId.value
      }
    })

    await modal.present()
    const { data } = await modal.onDidDismiss()

    if (data?.imported) {
      await Promise.allSettled([
        utilStore.fetchFacilities(),
        productStoreStore.fetchProductStoreFacilities(selectedProductStoreId.value)
      ])
      await refreshShopifyMappingStatus()
      onboardingStore.markCurrentStepComplete()
    }
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to open facility import"))
  } finally {
    isImportingShopifyFacilities.value = false
  }
}

async function createStarterFacility() {
  if (!selectedProductStoreId.value) {
    commonUtil.showToast(translate("Create the Product Store before creating a facility."))
    return false
  }

  isCreatingStarterFacility.value = true
  emitter.emit("presentLoader")

  try {
    const facilityId = generateInternalId(`${selectedProductStoreId.value}_STORE`).slice(0, 20)
    const facilityName = onboardingStore.draft.storeName || productStoreStore.current?.storeName || selectedProductStoreId.value
    const existingFacility = utilStore.facilities.find((facility: any) => facility.facilityId === facilityId)

    if (!existingFacility) {
      const facilityResp = await utilStore.createFacility({
        facilityId,
        facilityName,
        externalId: facilityId,
        facilityTypeId: "RETAIL_STORE",
        defaultInventoryItemTypeId: "NON_SERIAL_INV_ITEM"
      })
      if (commonUtil.hasError(facilityResp)) throw facilityResp.data
    }

    const associationResp = await productStoreStore.associateProductStoreFacility({
      productStoreId: selectedProductStoreId.value,
      facilityId
    })
    if (commonUtil.hasError(associationResp)) throw associationResp.data

    await Promise.allSettled([
      utilStore.fetchFacilities(),
      productStoreStore.fetchProductStoreFacilities(selectedProductStoreId.value)
    ])
    onboardingStore.markCurrentStepComplete()
    commonUtil.showToast(translate("Store facility created successfully."))
    return true
  } catch (error: any) {
    logger.error(error)
    commonUtil.showToast(translate("Failed to create store facility."))
    return false
  } finally {
    emitter.emit("dismissLoader")
    isCreatingStarterFacility.value = false
  }
}

function openShopifyLocationMapping() {
  openShopifyMappingPath("locations")
}

function openShopifyMappingPath(pathSegment: string) {
  if (!linkedShopifyShopId.value) {
    commonUtil.showToast(translate("Link a Shopify shop before configuring mappings."))
    return
  }

  const path = `/shopify-connection-details/${encodeURIComponent(linkedShopifyShopId.value)}/${pathSegment}`
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const fallbackUrl = `${path}?returnTo=${encodeURIComponent(returnTo)}`

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

  window.location.href = `${path}?${fallbackQuery}`
}

function getShopifyShopLabel(shop: any) {
  const name = shop.name || shop.myshopifyDomain || shop.shopId
  return shop.productStoreId ? `${name} (${shop.productStoreId})` : name
}

function getJwtTokenSubjectLabel(subject: any) {
  return subject.userFullName ? `${subject.userFullName} (${subject.userLoginId})` : subject.userLoginId
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

/* Standalone outline fields inside ion-card-content: card padding handles the edge inset,
   so the fields only need vertical rhythm between each box (incl. its helper text). */
.form-field {
  display: block;
  margin-bottom: var(--spacer-sm);
}

.form-field:last-child {
  margin-bottom: 0;
}

/* Radio options render as flat rows (no ion-item) so the whole row is clickable and there
   are no orphaned item separators. Stack them with consistent vertical rhythm. */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-xs);
  margin: var(--spacer-2xs) 0 var(--spacer-sm);
}

.radio-option {
  width: 100%;
}

/* Read-only key/value rows (e.g. Locale, Timezone) shown alongside the form fields. */
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacer-xs) var(--spacer-2xs);
}

.meta-row .meta-value {
  color: var(--ion-color-medium);
}

/* Form steps render inside ion-card-content. The remaining ion-item rows (those carrying a
   slot="start"/"end" control — badges, action buttons, radios, nav rows) are flattened so
   they read as form rows, not list rows: drop the list background and side insets so content
   aligns to the card padding, and let the outline notch label overflow (items clip by
   default). card-content padding supplies the edge inset that ion-item used to. */
.onboarding-task ion-card-content ion-item {
  --background: transparent;
  --padding-start: 0;
  --inner-padding-end: 0;
  --padding-top: var(--spacer-2xs);
  --padding-bottom: var(--spacer-2xs);
  overflow: visible;
}

/* Input-bearing rows get a little more vertical room (box + helper text). */
.onboarding-task ion-card-content ion-item:has(ion-input),
.onboarding-task ion-card-content ion-item:has(ion-select),
.onboarding-task ion-card-content ion-item:has(ion-textarea) {
  --padding-top: var(--spacer-xs);
  --padding-bottom: var(--spacer-xs);
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

/* Product-import job rows show raw service / system-message names (e.g.
   send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery) that have no spaces and
   would otherwise clip. Force the label text and its detail <p> to wrap. */
.onboarding-task ion-card-content ion-item.job-status-row ion-label,
.onboarding-task ion-card-content ion-item.job-status-row ion-label p {
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
