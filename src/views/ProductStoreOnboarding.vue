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
              <ion-item v-for="requirement in shopifyConnectionRequirements" :key="requirement.id">
                <ion-label>
                  {{ translate(requirement.label) }}
                  <p>{{ requirement.message }}</p>
                </ion-label>
                <ion-badge :color="getRequirementBadgeColor(requirement)" slot="end">
                  {{ getRequirementStatusLabel(requirement) }}
                </ion-badge>
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
                <ion-badge :color="getShopifyJobBadgeColor('productSync')" slot="end">
                  {{ getShopifyJobStatusLabel('productSync') }}
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

            <ion-list v-else-if="currentStep.id === 'inventory'" lines="full">
              <ion-item>
                <ion-select
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
              </ion-item>
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
              <ion-item>
                <ion-select
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
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Initial inventory load") }}
                  <p>{{ inventoryResetDescription }}</p>
                </ion-label>
                <ion-badge :color="getShopifyJobBadgeColor('inventoryReset')" slot="end">
                  {{ getShopifyJobStatusLabel('inventoryReset') }}
                </ion-badge>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'orders'" lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Order import readiness") }}
                  <p>{{ orderImportStatusDescription }}</p>
                </ion-label>
                <ion-badge :color="orderImportBadgeColor" slot="end">{{ orderImportStatusLabel }}</ion-badge>
              </ion-item>
              <ion-item>
                <ion-select
                  interface="popover"
                  :value="onboardingStore.draft.orderImportMode"
                  @ionChange="onboardingStore.updateDraftField('orderImportMode', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Order import mode") }}</div>
                  <ion-select-option value="Realtime and fallback batch">{{ translate("Realtime and fallback batch") }}</ion-select-option>
                  <ion-select-option value="Fallback batch only">{{ translate("Fallback batch only") }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item v-if="shouldConfigureRealtimeOrderImport">
                <ion-input
                  :value="onboardingStore.draft.orderSqsQueueName"
                  @ionInput="onboardingStore.updateDraftField('orderSqsQueueName', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Realtime SQS queue") }}</div>
                </ion-input>
              </ion-item>
              <ion-item v-if="shouldConfigureRealtimeOrderImport">
                <ion-input
                  :value="onboardingStore.draft.orderSqsAwsRemoteId"
                  @ionInput="onboardingStore.updateDraftField('orderSqsAwsRemoteId', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("AWS remote ID") }}</div>
                </ion-input>
              </ion-item>
              <ion-item v-if="shouldConfigureRealtimeOrderImport">
                <ion-input
                  type="number"
                  :value="onboardingStore.draft.orderSqsExpireLockTime"
                  @ionInput="onboardingStore.updateDraftField('orderSqsExpireLockTime', String($event.detail.value || ''))"
                >
                  <div slot="label">{{ translate("Lock timeout minutes") }}</div>
                </ion-input>
              </ion-item>
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
                  {{ translate("Backend status endpoint") }}
                  <p>{{ translate("The setup flow can show job readiness after the maarg-util onboarding status endpoint is deployed.") }}</p>
                </ion-label>
                <ion-badge color="warning" slot="end">{{ translate("Gap") }}</ion-badge>
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'routing'" lines="full">
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
              <ion-item>
                <ion-input
                  :label="translate('Auto cancellations days')"
                  :placeholder="translate('days count')"
                  type="number"
                  min="0"
                  :disabled="onboardingStore.draft.autoCancelOrders !== 'Y'"
                  :value="onboardingStore.draft.daysToCancelNonPay"
                  @ionInput="onboardingStore.updateDraftField('daysToCancelNonPay', String($event.detail.value || ''))"
                />
              </ion-item>
            </ion-list>

            <ion-list v-else-if="currentStep.id === 'pickup'" lines="full">
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
              <ion-item>
                <ion-select
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
              </ion-item>
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
const isSavingInventorySettings = ref(false)
const isSettingUpOrderJobs = ref(false)
const isSettingUpRealtimeOrderJobs = ref(false)
const isSavingRoutingDefaults = ref(false)
const isSavingPickupSettings = ref(false)
const isLoadingSetupData = ref(false)
const isLoadingShopifyJobStatus = ref(false)
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
const isPrimaryActionLoading = computed(() => {
  return isSavingProductStore.value
    || isLinkingShopifyShop.value
    || isImportingShopifyFacilities.value
    || isSavingProductIdentity.value
    || isSavingOrderDefaults.value
    || isSavingInventorySettings.value
    || isSettingUpOrderJobs.value
    || isSettingUpRealtimeOrderJobs.value
    || isSavingRoutingDefaults.value
    || isSavingPickupSettings.value
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
const shopifyJobStatus = computed(() => productStoreStore.currentShopifyJobStatus)
const hasShopifyJobStatus = computed(() => !!shopifyJobStatus.value?.requirements)
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
const facilityCount = computed(() => utilStore.facilities.length)
const facilityGroups = computed(() => utilStore.facilityGroups)
const shipmentMethodTypes = computed(() => utilStore.shipmentMethodTypes)
const mappedShopifyLocationCount = computed(() => shopifyLocationMappings.value.length)
const productIdentifierOptions = computed(() => utilStore.productIdentifiers)
const canOpenShopifyProductSync = computed(() => {
  return !!selectedProductStoreId.value && !!linkedShopifyShopId.value && !!onboardingStore.draft.productIdentifierEnumId
})
const productSyncHandoffDescription = computed(() => {
  if (!linkedShopifyShopId.value) return translate("Link a Shopify shop before importing products.")
  if (!onboardingStore.draft.productIdentifierEnumId) return translate("Choose the product identifier before importing products.")
  const productSyncRequirement = findShopifyRequirement("job.productSync")
  if (productSyncRequirement?.message) return productSyncRequirement.message
  return translate("Open the existing first-time product sync wizard with this Product Store and identifier preselected.")
})
const shopifySetupStatusDescription = computed(() => {
  if (!selectedProductStoreId.value) return translate("Create the Product Store before checking Shopify setup.")
  if (isLoadingShopifyJobStatus.value) return translate("Checking Shopify setup status.")
  if (!hasShopifyJobStatus.value) return translate("The backend status endpoint is not available in this OMS yet.")

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
const inventoryResetDescription = computed(() => {
  const inventoryRequirement = findShopifyRequirement("job.inventoryReset")
  if (inventoryRequirement?.message) return inventoryRequirement.message
  return translate("Shopify, ERP, and file reset paths still need a backend wrapper before onboarding can run the first QOH load.")
})
const orderImportStatusDescription = computed(() => {
  if (!selectedProductStoreId.value) return translate("Create the Product Store before checking order import jobs.")
  if (!hasShopifyJobStatus.value) return translate("The backend status endpoint is required before onboarding can verify order import readiness.")

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
  if (currentStep.value.id === "inventory") return translate("Save inventory settings")
  if (currentStep.value.id === "orders") return translate("Configure order jobs")
  if (currentStep.value.id === "routing") return translate("Save routing defaults")
  if (currentStep.value.id === "pickup") return translate("Save pickup settings")
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

  if (currentStep.value.id === "inventory") {
    return !selectedProductStoreId.value
  }

  if (currentStep.value.id === "orders") {
    return !selectedProductStoreId.value
      || !linkedShopifyShopId.value
      || (shouldConfigureRealtimeOrderImport.value && !onboardingStore.draft.orderSqsQueueName.trim())
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

function getShopifyJobBadgeColor(jobKey: string) {
  const job = getShopifyJobStatus(jobKey)
  if (job?.configured) return "success"
  if (!hasShopifyJobStatus.value && jobKey === "productSync" && canOpenShopifyProductSync.value) return "success"
  return "warning"
}

function getShopifyJobStatusLabel(jobKey: string) {
  const job = getShopifyJobStatus(jobKey)
  if (job?.configured) return translate("Ready")
  if (job?.status === "template-ready") return translate("Template")
  if (!hasShopifyJobStatus.value && jobKey === "productSync" && canOpenShopifyProductSync.value) return translate("Ready")
  return translate("Gap")
}

async function refreshShopifyJobStatus() {
  if (!selectedProductStoreId.value) {
    productStoreStore.currentShopifyJobStatus = null
    return
  }

  isLoadingShopifyJobStatus.value = true
  try {
    await productStoreStore.fetchProductStoreShopifyJobStatus(selectedProductStoreId.value)
  } catch (error: any) {
    logger.warn("Failed to refresh Shopify job status", error)
  } finally {
    isLoadingShopifyJobStatus.value = false
  }
}

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
      utilStore.fetchFacilityGroups(),
      utilStore.fetchProductIdentifiers(),
      utilStore.fetchShipmentMethodTypes(),
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

  if (currentStep.value.id === "inventory") {
    const inventorySettingsSaved = await saveInventorySettings()
    if (!inventorySettingsSaved) return
  }

  if (currentStep.value.id === "orders") {
    const orderJobsConfigured = await setupOrderImportJobs()
    if (!orderJobsConfigured) return

    const realtimeOrderJobsConfigured = await setupRealtimeOrderImportJobs()
    if (!realtimeOrderJobsConfigured) return
  }

  if (currentStep.value.id === "routing") {
    const routingDefaultsSaved = await saveRoutingDefaults()
    if (!routingDefaultsSaved) return
  }

  if (currentStep.value.id === "pickup") {
    const pickupSettingsSaved = await savePickupSettings()
    if (!pickupSettingsSaved) return
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
