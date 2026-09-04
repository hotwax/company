<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/product-store" />
        <ion-title>{{ translate("Product Store setup") }}</ion-title>
        <ion-progress-bar
          :value="userProgressValue"
          role="progressbar"
          :aria-label="setupProgressLabel"
          :aria-valuemin="0"
          :aria-valuemax="onboarding.totalStepCount"
          :aria-valuenow="onboarding.completedCount"
          :aria-valuetext="setupProgressLabel"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content ref="contentRef">
      <main class="onboarding-layout">
        <aside class="desktop-steps" aria-label="Product Store setup progress">
          <ion-list lines="none">
            <ion-list-header>
              <ion-label>
                {{ translate("Progress") }}
                <p>
                  {{ translate("{complete} of {total} setup steps complete", {
                    complete: onboarding.completedCount,
                    total: onboarding.totalStepCount
                  }) }}
                </p>
              </ion-label>
            </ion-list-header>
          </ion-list>
          <onboarding-step-list
            :groups="PRODUCT_STORE_ONBOARDING_GROUPS"
            :steps="PRODUCT_STORE_ONBOARDING_STEPS"
            :current-step-id="onboarding.currentStepId"
            :step-statuses="onboarding.stepStatuses"
            @select-step="selectStep"
          />
        </aside>

        <section class="onboarding-task">
          <ion-item class="mobile-step-picker" lines="none">
            <ion-select
              :label="translate('Setup step')"
              label-placement="stacked"
              interface="popover"
              :value="onboarding.currentStepId"
              @ion-change="selectStep(String($event.detail.value || ''))"
            >
              <ion-select-option
                v-for="(step, index) in PRODUCT_STORE_ONBOARDING_STEPS"
                :key="step.id"
                :value="step.id"
              >
                {{ index + 1 }}. {{ translate(step.label) }} — {{ translate(statusLabel(onboarding.stepStatuses[step.id])) }}
              </ion-select-option>
            </ion-select>
            <ion-note
              slot="end"
              class="mobile-progress-count"
              data-testid="mobile-progress-count"
              role="status"
              aria-live="polite"
              :aria-label="setupProgressLabel"
            >
              {{ onboarding.completedCount }} / {{ onboarding.totalStepCount }}
            </ion-note>
          </ion-item>

          <ion-card>
            <ion-card-header>
              <div class="step-heading-row">
                <div>
                  <ion-card-title ref="stepHeadingRef" tabindex="-1">
                    {{ translate(currentStep.label) }}
                  </ion-card-title>
                  <ion-card-subtitle>{{ translate(currentStep.summary) }}</ion-card-subtitle>
                </div>
                <ion-badge :color="stepStatusPresentation.color">
                  {{ translate(stepStatusPresentation.label) }}
                </ion-badge>
              </div>
            </ion-card-header>

            <ion-card-content v-if="currentStep.id === 'name'" class="form-stack">
              <ion-input
                v-if="shouldCollectCompanyName"
                ref="companyNameInputRef"
                fill="outline"
                label-placement="stacked"
                :label="translate('Company name')"
                :helper-text="translate('The organization that owns this first Product Store.')"
                required
                :value="onboarding.draft.companyName"
                @ion-input="updateDraft('companyName', $event.detail.value)"
              />
              <ion-input
                ref="storeNameInputRef"
                fill="outline"
                label-placement="stacked"
                :label="translate('Store name')"
                :helper-text="translate('The brand or storefront name operators will recognize.')"
                required
                :value="onboarding.draft.storeName"
                @ion-input="updateDraft('storeName', $event.detail.value)"
              />
              <ion-input
                ref="productStoreIdInputRef"
                data-testid="product-store-id-input"
                fill="outline"
                label-placement="stacked"
                :label="translate('Product Store ID')"
                :helper-text="translate('A permanent identifier with 20 characters or fewer.')"
                :error-text="productStoreIdError"
                :class="{ 'ion-invalid ion-touched': !!productStoreIdError }"
                :disabled="!!selectedProductStoreId"
                required
                :maxlength="20"
                :counter="true"
                :value="onboarding.draft.productStoreId"
                @ion-input="updateDraft('productStoreId', $event.detail.value)"
                @ion-blur="storeFieldTouched.productStoreId = true"
              />
              <ion-select
                ref="currencyInputRef"
                fill="outline"
                label-placement="stacked"
                interface="popover"
                :label="translate('Currency')"
                required
                :value="onboarding.draft.defaultCurrencyUomId"
                @ion-change="updateDraft('defaultCurrencyUomId', $event.detail.value)"
              >
                <ion-select-option v-for="currency in currencyOptions" :key="currency.uomId" :value="currency.uomId">
                  {{ currency.label }}
                </ion-select-option>
              </ion-select>
              <ion-input
                ref="localeInputRef"
                data-testid="default-locale-input"
                fill="outline"
                label-placement="stacked"
                :label="translate('Default locale')"
                :helper-text="translate('Use a locale such as en_US.')"
                :error-text="localeError"
                :class="{ 'ion-invalid ion-touched': !!localeError }"
                required
                pattern="[a-z]{2,3}_[A-Z]{2}"
                :value="onboarding.draft.locale"
                @ion-input="updateDraft('locale', $event.detail.value)"
                @ion-blur="storeFieldTouched.locale = true"
              />
              <ion-select
                ref="timezoneInputRef"
                fill="outline"
                label-placement="stacked"
                interface="popover"
                :label="translate('Default time zone')"
                required
                :value="onboarding.draft.timezone"
                @ion-change="updateDraft('timezone', $event.detail.value)"
              >
                <ion-select-option v-for="timeZone in timeZoneOptions" :key="timeZone.id" :value="timeZone.id">
                  {{ timeZone.label || timeZone.id }}
                </ion-select-option>
              </ion-select>
              <ion-input
                ref="orderNumberPrefixInputRef"
                fill="outline"
                label-placement="stacked"
                :label="translate('Sales order ID prefix')"
                required
                :value="onboarding.draft.orderNumberPrefix"
                @ion-input="updateDraft('orderNumberPrefix', $event.detail.value)"
              />
              <ion-list lines="full">
                <ion-item>
                  <ion-toggle
                    :checked="onboarding.draft.autoApproveOrder === 'Y'"
                    @ion-change="updateDraft('autoApproveOrder', $event.detail.checked ? 'Y' : 'N')"
                  >
                    {{ translate("Approve imported orders") }}
                  </ion-toggle>
                </ion-item>
                <ion-item>
                  <ion-toggle
                    :checked="onboarding.draft.saveBillingInformation === 'Y'"
                    @ion-change="updateDraft('saveBillingInformation', $event.detail.checked ? 'Y' : 'N')"
                  >
                    {{ translate("Save billing information") }}
                  </ion-toggle>
                </ion-item>
              </ion-list>
              <step-feedback step-id="name" />
              <ion-button :disabled="busy.name" @click="saveStore">
                <ion-spinner v-if="busy.name" slot="start" name="crescent" />
                <ion-icon v-else slot="start" :icon="saveOutline" />
                {{ translate(selectedProductStoreId ? "Save store" : "Create product store") }}
              </ion-button>
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'shopify'" class="form-stack">
              <ion-list v-if="linkedShopifyShop" lines="full">
                <ion-item>
                  <ion-icon slot="start" :icon="linkOutline" />
                  <ion-label>
                    {{ translate("Linked Shopify shop") }}
                    <p>{{ shopLabel(linkedShopifyShop) }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="success">
                    {{ translate("Complete") }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-icon slot="start" :icon="connectionIsWritable ? lockOpenOutline : lockClosedOutline" />
                  <ion-label class="ion-text-wrap">
                    {{ translate("Connection access") }}
                    <p>{{ connectionAccessDescription }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="connectionIsWritable ? 'success' : 'warning'">
                    {{ connectionAccessLabel }}
                  </ion-badge>
                </ion-item>
              </ion-list>
              <div v-if="linkedShopifyShop && !connectionIsWritable" class="step-actions">
                <ion-button
                  v-if="connectionRemoteResolved"
                  :disabled="busy.connectionAccess"
                  @click="grantConnectionWriteAccess"
                >
                  <ion-spinner v-if="busy.connectionAccess" slot="start" name="crescent" />
                  <ion-icon v-else slot="start" :icon="lockOpenOutline" />
                  {{ translate("Grant write access") }}
                </ion-button>
                <ion-button v-else fill="outline" @click="openShopifyConnections">
                  <ion-icon slot="start" :icon="openOutline" />
                  {{ translate("Open Shopify connections") }}
                </ion-button>
              </div>
              <template v-if="!linkedShopifyShop">
                <ion-select
                  v-if="availableShopifyShops.length"
                  fill="outline"
                  label-placement="stacked"
                  interface="popover"
                  :label="translate('Existing Shopify shop')"
                  :helper-text="translate('Only unassigned Shopify shops are available here.')"
                  :value="onboarding.draft.selectedShopifyShopId"
                  @ion-change="updateDraft('selectedShopifyShopId', $event.detail.value)"
                >
                  <ion-select-option v-for="shop in availableShopifyShops" :key="shop.shopId" :value="shop.shopId">
                    {{ shopLabel(shop) }}
                  </ion-select-option>
                </ion-select>
                <ion-note v-else color="warning">
                  {{ translate("No unassigned Shopify shop is available. Add the connection first, then return here.") }}
                </ion-note>
                <div class="step-actions">
                  <ion-button
                    v-if="availableShopifyShops.length"
                    :disabled="!selectedAvailableShopifyShop || busy.shopify"
                    @click="linkShopifyShop"
                  >
                    <ion-spinner v-if="busy.shopify" slot="start" name="crescent" />
                    <ion-icon v-else slot="start" :icon="linkOutline" />
                    {{ translate("Link Shopify shop") }}
                  </ion-button>
                  <ion-button fill="outline" @click="openShopifyConnections">
                    <ion-icon slot="start" :icon="openOutline" />
                    {{ translate("Open Shopify connections") }}
                  </ion-button>
                </div>
              </template>
              <step-feedback step-id="shopify" />
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'products'" class="form-stack">
              <!-- 1. Set shopify primary identifier -->
              <ion-card>
                <ion-card-header>
                  <ion-card-title>{{ translate("Shopify primary identifier") }}</ion-card-title>
                  <ion-card-subtitle>{{ translate("The identifier controls how Shopify products match HotWax products.") }}</ion-card-subtitle>
                </ion-card-header>
                <ion-card-content>
                  <ion-select
                    fill="outline"
                    label-placement="stacked"
                    interface="popover"
                    :label="translate('Shopify primary identifier')"
                    :value="onboarding.draft.productIdentifierEnumId"
                    @ion-change="updateDraft('productIdentifierEnumId', $event.detail.value)"
                  >
                    <ion-select-option v-for="identifier in shopifyPrimaryIdentifierOptions" :key="identifier.enumId" :value="identifier.enumId">
                      {{ identifier.description || identifier.enumId }}
                    </ion-select-option>
                  </ion-select>
                </ion-card-content>
              </ion-card>

              <!-- 2. List of jobs needed to make sure sync will work for given shop -->
              <ion-card>
                <ion-card-header>
                  <ion-card-title>{{ translate("Product sync jobs") }}</ion-card-title>
                  <ion-card-subtitle>{{ translate("Review the jobs that move product updates through the sync pipeline") }}</ion-card-subtitle>
                </ion-card-header>
                <ion-list lines="full">
                  <ion-item button detail :disabled="!syncJobObj" @click="openSyncJobDetails(syncJobObj)">
                    <ion-label>
                      {{ translate("Queue update requests") }}
                      <p>{{ queueUpdateRequestsLastRunLabel }}</p>
                    </ion-label>
                    <ion-icon slot="end" :icon="isSyncJobPaused ? pauseCircleOutline : checkmarkCircleOutline" />
                  </ion-item>
                  <ion-item button detail :disabled="!sendUpdateRequestJobObj?.jobName" @click="openSyncJobDetails(sendUpdateRequestJobObj)">
                    <ion-label>
                      {{ translate("Send update request") }}
                      <p>{{ sendUpdateRequestLastRunLabel }}</p>
                    </ion-label>
                    <ion-icon slot="end" :icon="isBulkOperationSendJobPaused ? pauseCircleOutline : checkmarkCircleOutline" />
                  </ion-item>
                  <ion-item button detail :disabled="!importCompletedRequestsJobObj?.jobName" @click="openSyncJobDetails(importCompletedRequestsJobObj)">
                    <ion-label>
                      {{ translate("Import completed requests") }}
                      <p>{{ importCompletedRequestsLastRunLabel }}</p>
                    </ion-label>
                    <ion-icon slot="end" :icon="isBulkOperationPollJobPaused ? pauseCircleOutline : checkmarkCircleOutline" />
                  </ion-item>
                </ion-list>
              </ion-card>

              <!-- 2.5 Show how many products are in shopify -->
              <ion-card>
                <ion-card-content>
                  <h1 class="ion-text-center">
                    <AnimatedNumber v-if="shopifyProductCount !== undefined && shopifyProductCount !== null" :value="Number(shopifyProductCount)" />
                    <template v-else>
                      {{ shopifyProductCountLabel }}
                    </template>
                  </h1>
                </ion-card-content>
                <ion-item lines="none">
                  <ion-label class="ion-text-center">
                    {{ translate("Products in Shopify") }}
                  </ion-label>
                  <ion-spinner v-if="isShopifyProductCountLoading" slot="end" name="crescent" />
                </ion-item>
              </ion-card>

              <!-- 3. Product store setting for selecting primary and secondary identifier -->
              <ion-card>
                <ion-card-header>
                  <ion-card-title>{{ translate("Product Identifier") }}</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                  {{ translate("Choosing a product identifier allows you to view products with your preferred identifiers.") }}
                </ion-card-content>
                <ion-item>
                  <ion-select
                    :label="translate('Primary')"
                    interface="popover"
                    :placeholder="translate('primary identifier')"
                    :value="onboarding.draft.primaryProductIdentification"
                    @ion-change="updateDraft('primaryProductIdentification', $event.detail.value)"
                  >
                    <ion-select-option v-for="identification in productIdentificationOptions" :key="identification.goodIdentificationTypeId" :value="identification.goodIdentificationTypeId">
                      {{ identification.description ? identification.description : identification.goodIdentificationTypeId }}
                    </ion-select-option>
                  </ion-select>
                </ion-item>
                <ion-item lines="none">
                  <ion-select
                    :label="translate('Secondary')"
                    interface="popover"
                    :placeholder="translate('secondary identifier')"
                    :value="onboarding.draft.secondaryProductIdentification"
                    @ion-change="updateDraft('secondaryProductIdentification', $event.detail.value)"
                  >
                    <ion-select-option v-for="identification in productIdentificationOptions" :key="identification.goodIdentificationTypeId" :value="identification.goodIdentificationTypeId">
                      {{ identification.description ? identification.description : identification.goodIdentificationTypeId }}
                    </ion-select-option>
                    <ion-select-option value="">
                      {{ translate("None") }}
                    </ion-select-option>
                  </ion-select>
                </ion-item>
                <template v-if="currentSampleProduct">
                  <ion-item lines="full" color="light">
                    <ion-label color="medium">
                      {{ translate("Preview Product Identifier") }}
                    </ion-label>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-thumbnail slot="start">
                      <DxpShopifyImg size="small" :src="currentSampleProduct.mainImageUrl" />
                    </ion-thumbnail>
                    <ion-label>
                      {{ commonUtil.getProductIdentificationValue(onboarding.draft.primaryProductIdentification, currentSampleProduct) ? commonUtil.getProductIdentificationValue(onboarding.draft.primaryProductIdentification, currentSampleProduct) : currentSampleProduct.productId }}
                      <p>{{ commonUtil.getProductIdentificationValue(onboarding.draft.secondaryProductIdentification, currentSampleProduct) }}</p>
                    </ion-label>
                    <ion-button size="default" fill="clear" @click="shuffleProduct">
                      <ion-icon slot="icon-only" :icon="shuffleOutline" />
                    </ion-button>
                  </ion-item>
                </template>
              </ion-card>

              <div class="actions">
                <ion-button :disabled="busy.products || !canConfigureProducts" @click="saveProductSetup">
                  <ion-spinner v-if="busy.products" slot="start" name="crescent" />
                  {{ translate("Save product setup") }}
                </ion-button>
              </div>
              <step-feedback step-id="products" />
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'facilities'" class="form-stack">
              <ion-list lines="full">
                <ion-item>
                  <ion-icon slot="start" :icon="storefrontOutline" />
                  <ion-label>
                    {{ translate("Product Store facilities") }}
                    <p>{{ translate("{count} facilities associated", { count: facilityCount }) }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="facilityCount ? 'success' : 'medium'">
                    {{ facilityCount }}
                  </ion-badge>
                </ion-item>
              </ion-list>
              <ion-segment
                :value="onboarding.draft.facilityMode"
                @ion-change="updateDraft('facilityMode', $event.detail.value)"
              >
                <ion-segment-button value="import">
                  <ion-label>{{ translate("Import from Shopify") }}</ion-label>
                </ion-segment-button>
                <ion-segment-button value="create">
                  <ion-label>{{ translate("Create one facility") }}</ion-label>
                </ion-segment-button>
              </ion-segment>
              <ion-note v-if="onboarding.draft.facilityMode === 'import'">
                {{ translate("Import Shopify locations as facilities and associate every imported facility with this Product Store.") }}
              </ion-note>
              <ion-note v-else>
                {{ translate("Create one retail facility using the Product Store name.") }}
              </ion-note>
              <ion-button
                v-if="onboarding.draft.facilityMode === 'import'"
                ref="facilityImportTriggerRef"
                :disabled="!linkedShopId || busy.facilities"
                @click="openFacilityImport"
              >
                <ion-spinner v-if="busy.facilities" slot="start" name="crescent" />
                <ion-icon v-else slot="start" :icon="cloudDownloadOutline" />
                {{ translate("Import Shopify locations") }}
              </ion-button>
              <ion-button v-else :disabled="!selectedProductStoreId || busy.facilities" @click="createStoreFacility">
                <ion-spinner v-if="busy.facilities" slot="start" name="crescent" />
                <ion-icon v-else slot="start" :icon="addOutline" />
                {{ translate("Create store facility") }}
              </ion-button>
              <step-feedback step-id="facilities" />
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'locations'" class="form-stack">
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    {{ translate("Shopify location mappings") }}
                    <p>{{ translate("{count} locations mapped to HotWax facilities", { count: mappedShopifyLocationCount }) }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="mappedShopifyLocationCount ? 'success' : 'warning'">
                    {{ mappedShopifyLocationCount }}
                  </ion-badge>
                </ion-item>
              </ion-list>
              <ion-note>
                {{ translate("Map at least one Shopify inventory location before loading inventory.") }}
              </ion-note>
              <div class="step-actions">
                <ion-button :disabled="!linkedShopId" @click="openLocationMapping">
                  <ion-icon slot="start" :icon="openOutline" />
                  {{ translate("Open location mapping") }}
                </ion-button>
                <ion-button fill="outline" :disabled="!linkedShopId || busy.locations" @click="refreshLocationMappings">
                  <ion-spinner v-if="busy.locations" slot="start" name="crescent" />
                  <ion-icon v-else slot="start" :icon="syncOutline" />
                  {{ translate("Refresh") }}
                </ion-button>
              </div>
              <step-feedback step-id="locations" />
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'inventory'" class="form-stack">
              <ion-list lines="full">
                <ion-item>
                  <ion-label>
                    {{ translate("Inventory source") }}
                    <p>{{ translate("Initial available inventory will load from the linked Shopify shop.") }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="primary">
                    {{ translate("Shopify") }}
                  </ion-badge>
                </ion-item>
                <ion-item>
                  <ion-toggle
                    :checked="onboarding.draft.reserveInventory === 'Y'"
                    @ion-change="updateDraft('reserveInventory', $event.detail.checked ? 'Y' : 'N')"
                  >
                    {{ translate("Reserve inventory for orders") }}
                  </ion-toggle>
                </ion-item>
                <ion-item>
                  <ion-toggle
                    :checked="onboarding.draft.showSystemicInventory === 'true'"
                    @ion-change="updateDraft('showSystemicInventory', $event.detail.checked ? 'true' : 'false')"
                  >
                    {{ translate("Show systemic inventory in counts") }}
                  </ion-toggle>
                </ion-item>
              </ion-list>
              <onboarding-sync-status
                subtitle="Monitor each step as inventory gets imported from Shopify"
                :configuration="inventorySyncConfiguration"
                :initial-load="inventoryDisplayedInitialLoad"
                :hydrated="inventoryInitialLoad.hydrated"
                :load-error="initialLoadError"
                save-action-label="Save inventory setup"
                :show-run-action="true"
                :run-action-label="initialLoadActionLabel('inventory', 'Load inventory')"
                :show-refresh-action="!!linkedShopId"
                :save-disabled="!canConfigureInventory || !inventorySetupDirty || initialLoadRunBlocked('inventory', inventoryInitialLoad.run.status)"
                :run-disabled="!canLoadInventory || initialLoadRunBlocked('inventory', inventoryInitialLoad.run.status)"
                :refresh-disabled="!linkedShopId"
                :busy-action="inventorySyncBusyAction"
                @save="saveInventorySetup"
                @run="loadInventory"
                @refresh="refreshInitialLoadStatus('inventory')"
              />
              <step-feedback step-id="inventory" />
            </ion-card-content>

            <ion-card-content v-else-if="currentStep.id === 'orders'" class="form-stack">
              <ion-input
                data-testid="order-history-start-input"
                fill="outline"
                type="date"
                label-placement="stacked"
                :label="translate('Order history start date')"
                :helper-text="translate('The earliest Shopify order date to import.')"
                :error-text="orderHistoryStartDateError"
                :class="{ 'ion-invalid ion-touched': !!orderHistoryStartDateError }"
                required
                :max="onboarding.draft.orderLaunchDate || undefined"
                :value="onboarding.draft.orderHistoryStartDate"
                @ion-input="updateDraft('orderHistoryStartDate', $event.detail.value)"
                @ion-blur="orderFieldTouched.historyStartDate = true"
              />
              <ion-input
                data-testid="order-launch-date-input"
                fill="outline"
                type="date"
                label-placement="stacked"
                :label="translate('Order launch date')"
                :helper-text="translate('Orders on or after this date enter live fulfillment. It does not limit what the first sync imports.')"
                :error-text="orderLaunchDateError"
                :class="{ 'ion-invalid ion-touched': !!orderLaunchDateError }"
                required
                :min="onboarding.draft.orderHistoryStartDate || undefined"
                :value="onboarding.draft.orderLaunchDate"
                @ion-input="updateDraft('orderLaunchDate', $event.detail.value)"
                @ion-blur="orderFieldTouched.launchDate = true"
              />
              <ion-note class="ion-text-wrap">
                {{ translate("The first order sync takes every open order that is still unfulfilled or part fulfilled, whatever its date. Later syncs pick up whatever changed since the one before.") }}
              </ion-note>
              <ion-note class="ion-text-wrap">
                {{ translate("Only open and unfulfilled orders will be downloaded") }}
              </ion-note>
              <onboarding-sync-status
                subtitle="Monitor each step as order history gets imported from Shopify"
                :configuration="orderSyncConfiguration"
                :initial-load="orderDisplayedInitialLoad"
                :hydrated="orderInitialLoad.hydrated"
                :load-error="initialLoadError"
                save-action-label="Save order import"
                :show-run-action="true"
                :run-action-label="initialLoadActionLabel('orders', 'Load order history')"
                :show-refresh-action="!!linkedShopId"
                :show-details-action="!!orderInitialLoad.details.route"
                :save-disabled="!canConfigureOrders || !orderSetupDirty || initialLoadRunBlocked('orders', orderInitialLoad.run.status)"
                :run-disabled="!canLoadOrders || initialLoadRunBlocked('orders', orderInitialLoad.run.status)"
                :refresh-disabled="!linkedShopId"
                :busy-action="orderSyncBusyAction"
                @save="saveOrderSetup"
                @run="loadOrderHistory"
                @refresh="refreshInitialLoadStatus('orders')"
                @open-details="openInitialLoadDetails('orders', orderInitialLoad)"
              />
              <step-feedback step-id="orders" />
            </ion-card-content>

            <ion-card-content v-else class="form-stack">
              <ion-list lines="full">
                <ion-list-header>
                  <ion-label>{{ translate("Setup outcomes") }}</ion-label>
                </ion-list-header>
                <ion-item
                  v-for="step in setupSteps"
                  :key="step.id"
                  button
                  :detail="true"
                  @click="selectStep(step.id)"
                >
                  <ion-icon
                    slot="start"
                    :icon="reviewStatus(step.id).icon"
                    :color="reviewStatus(step.id).color"
                  />
                  <ion-label>
                    {{ translate(step.label) }}
                    <p>{{ translate(step.summary) }}</p>
                  </ion-label>
                  <ion-badge slot="end" :color="reviewStatus(step.id).color">
                    {{ translate(reviewStatus(step.id).label) }}
                  </ion-badge>
                </ion-item>
              </ion-list>
              <ion-note :color="isReadyToFinish ? 'success' : 'warning'">
                {{ translate(isReadyToFinish
                  ? "Every required setup outcome has authoritative success evidence."
                  : "Queued imports are still in progress. Verify each initial load completes successfully before finishing.") }}
              </ion-note>
              <step-feedback step-id="readiness" />
            </ion-card-content>

            <div class="wizard-footer">
              <ion-button fill="clear" :disabled="onboarding.currentStepIndex === 0" @click="goPrevious">
                {{ translate("Back") }}
              </ion-button>
              <ion-button v-if="currentStep.id !== 'readiness'" :disabled="!canContinue" @click="goNext">
                {{ translate("Continue") }}
              </ion-button>
              <ion-button v-else :disabled="!isReadyToFinish" @click="finishSetup">
                {{ translate("Finish setup") }}
              </ion-button>
            </div>
          </ion-card>
        </section>
      </main>
    </ion-content>
    <ServiceJobDetailsModal
      :is-open="showSyncJobDetailsModal"
      :job-name="selectedSyncJobDetailsJob?.jobName || ''"
      :title="selectedSyncJobDetailsJob?.jobName || ''"
      @close="showSyncJobDetailsModal = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { DxpShopifyImg, commonUtil, logger, translate, useSolrSearch } from "@common"
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
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonThumbnail,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
  onIonViewDidLeave,
  onIonViewWillEnter
} from "@ionic/vue"
import {
  addOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  cloudDownloadOutline,
  ellipseOutline,
  linkOutline,
  lockClosedOutline,
  lockOpenOutline,
  openOutline,
  pauseCircleOutline,
  saveOutline,
  shuffleOutline,
  storefrontOutline,
  syncOutline,
  timeOutline
} from "ionicons/icons"
import { computed, defineComponent, h, nextTick, reactive, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import AnimatedNumber from "@/components/common/AnimatedNumber.vue"
import ServiceJobDetailsModal from "@/components/common/ServiceJobDetailsModal.vue"
import ImportShopifyLocationsModal from "@/components/facility/ImportShopifyLocationsModal.vue"
import OnboardingStepList from "@/components/product-store-onboarding/OnboardingStepList.vue"
import type {
  OnboardingSyncBusyAction,
  OnboardingSyncConfiguration,
  OnboardingSyncRun
} from "@/components/product-store-onboarding/OnboardingSyncStatus.types"
import OnboardingSyncStatus from "@/components/product-store-onboarding/OnboardingSyncStatus.vue"
import { useFacilities, useFacilityMutations } from "@/composables/useFacilities"
import {
  type OnboardingInitialLoadKind,
  type OnboardingInitialLoadSnapshot,
  useProductStoreOnboardingInitialLoad
} from "@/composables/useProductStoreOnboardingInitialLoad"
import { type ProductStoreOnboardingDraft, useProductStoreOnboardingWizard } from "@/composables/useProductStoreOnboardingWizard"
import { useProductStoreCreation, useProductStoreData, useProductStoreMutations } from "@/composables/useProductStores"
import { useCurrencies, useGoodIdentificationTypes, useOrganization, useTimeZones, useTypedEnums } from "@/composables/useSeed"
import { useServiceJobRunsByJob, useServiceJobs } from "@/composables/useServiceJobs"
import {
  fetchLiveCatalogCounts,
  fetchShopifyShopLocations,
  useOrderSyncLandmarkDates,
  useShopifyAccessScopes,
  useShopifyProductSyncRunState,
  useShopifyShopMutations,
  useShopifyShops,
  useShopifySyncContext
} from "@/composables/useShopify"
import {
  PRODUCT_STORE_ONBOARDING_GROUPS,
  PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS,
  PRODUCT_STORE_ONBOARDING_STEPS,
  type ProductStoreOnboardingStepId,
  type ProductStoreOnboardingStepStatus,
  isProductStoreOnboardingStepId
} from "@/config/productStoreOnboarding"
import { generateInternalId, getResponseErrorMessage } from "@/utils"
import { isPaused } from "@/utils/serviceJob"
import { SHOPIFY_RW_ACCESS_SCOPE, isWritableAccessScope } from "@/utils/systemMessage"

const props = defineProps<{ productStoreId?: string }>()
const route = useRoute()
const router = useRouter()
const onboarding = useProductStoreOnboardingWizard()
const productStoreData = useProductStoreData()
const { createStore } = useProductStoreCreation()
const { shops: cachedShopifyShops, hydrated: shopifyShopsHydrated } = useShopifyShops()
const { currencies } = useCurrencies()
const { values: productIdentifierOptions } = useTypedEnums("SHOP_PROD_IDENTITY")
const { facilities: allFacilities } = useFacilities()
const { createFacility } = useFacilityMutations()
const { organizationPartyId, loadOrganizationPartyId, bootstrapOrganization } = useOrganization()
const { loadTimeZones } = useTimeZones()

type FeedbackTone = "success" | "warning" | "danger" | "medium"
type FeedbackState = { text: string; tone: FeedbackTone } | null

const feedback = reactive<Record<ProductStoreOnboardingStepId, FeedbackState>>({
  name: null,
  shopify: null,
  products: null,
  facilities: null,
  locations: null,
  inventory: null,
  orders: null,
  readiness: null
})
const busy = reactive({
  name: false,
  shopify: false,
  products: false,
  productImport: false,
  facilities: false,
  locations: false,
  inventory: false,
  inventoryImport: false,
  orders: false,
  orderImport: false,
  connectionAccess: false
})
const initialLoadRefreshBusy = reactive<Record<OnboardingInitialLoadKind, boolean>>({
  products: false,
  inventory: false,
  orders: false
})
const contentRef = ref<any>(null)
const stepHeadingRef = ref<any>(null)
const companyNameInputRef = ref<any>(null)
const storeNameInputRef = ref<any>(null)
const productStoreIdInputRef = ref<any>(null)
const currencyInputRef = ref<any>(null)
const localeInputRef = ref<any>(null)
const timezoneInputRef = ref<any>(null)
const orderNumberPrefixInputRef = ref<any>(null)
const facilityImportTriggerRef = ref<any>(null)
const shopifyLocationMappings = ref<any[]>([])
const locationMappingFetchStatus = ref<"idle" | "pending" | "success" | "error">("idle")
const timeZoneOptions = ref<any[]>([])
const storeValidationAttempted = ref(false)
const storeFieldTouched = reactive({ productStoreId: false, locale: false })
const orderValidationAttempted = ref(false)
const orderFieldTouched = reactive({ historyStartDate: false, launchDate: false })

const LOCALE_PATTERN = /^[a-z]{2,3}_[A-Z]{2}$/

const StepFeedback = defineComponent({
  props: { stepId: { type: String, required: true } },
  setup(componentProps) {
    return () => {
      const state = feedback[componentProps.stepId as ProductStoreOnboardingStepId]

      return state
        ? h(IonNote, { class: "step-feedback", color: state.tone, role: state.tone === "danger" ? "alert" : "status" }, () => state.text)
        : null
    }
  }
})

const currentStep = computed(() => onboarding.currentStep)
const selectedProductStoreId = computed(() =>
  onboarding.createdProductStoreId || props.productStoreId || "")
const shouldCollectCompanyName = computed(() =>
  productStoreData.productStores.length === 0 || !organizationPartyId.value)
const currencyOptions = computed(() => currencies.value.map((currency: any) => ({
  ...currency,
  label: currency.description ? `${currency.description} (${currency.uomId})` : currency.uomId
})))
function assignedShopifyShops(statusOverride?: any) {
  const productStoreId = String(selectedProductStoreId.value || "")
  if(!productStoreId) {return []}

  const status = statusOverride === undefined
    ? productStoreData.currentShopifyJobStatus
    : statusOverride
  const statusIsForSelectedStore = String(status?.productStoreId || "") === productStoreId
  const source = statusIsForSelectedStore && Array.isArray(status.linkedShops)
    ? status.linkedShops
    : cachedShopifyShops.value

  return source.filter((shop: any) =>
    String(shop?.productStoreId || "") === productStoreId && !!shop?.shopId)
}

const linkedShopifyShop = computed(() => {
  const assignedShops = assignedShopifyShops()
  const persistedShopId = String(onboarding.draft.linkedShopifyShopId || "")

  return assignedShops.find((shop: any) => String(shop.shopId) === persistedShopId) || assignedShops[0] || null
})
// Never fall back to the persisted id here. Every downstream job/import action must use a shop
// that the current cache or live setup response confirms is still assigned to this Product Store.
const linkedShopId = computed(() => String(linkedShopifyShop.value?.shopId || ""))
/**
 * The linked shop's SystemMessageRemote.
 *
 * A `ShopifyShop` row does NOT carry `systemMessageRemoteId` — the remote is joined to the shop by
 * `remote.internalId === shop.shopId` (and `remote.remoteId === shop.shopifyShopId`). Reading it off
 * the shop therefore always yielded undefined, and the shop id was sent to `shopify/graphql` in its
 * place, which the backend rejects with "Could not find SystemMessageRemote with ID <shopId>".
 *
 * `useShopifySyncContext` owns that join and applies the same rule the sync worker uses, so the
 * screen and the poller cannot disagree about which remote a shop owns.
 */
const shopifySyncContext = useShopifySyncContext(() => linkedShopId.value)
/**
 * When the Product Store was created, as epoch milliseconds.
 *
 * The wizard's own record of having started a load lives in browser storage and is gone whenever the
 * operator starts another setup or opens the store elsewhere. This is the durable half: a shop run
 * that began before this store existed cannot belong to it, which is what lets the step report a run
 * it did not personally start without resurrecting another store's history.
 */
const selectedProductStoreCreatedAt = computed(() => {
  const value = productStoreData.current?.createdStamp
  const parsed = typeof value === "number" ? value : Date.parse(String(value ?? ""))

  return Number.isFinite(parsed) ? Number(parsed) : 0
})
const initialLoadStatus = useProductStoreOnboardingInitialLoad(
  () => linkedShopId.value,
  () => onboarding.runRequests,
  () => selectedProductStoreCreatedAt.value
)
const productInitialLoad = initialLoadStatus.products
const inventoryInitialLoad = initialLoadStatus.inventory
const orderInitialLoad = initialLoadStatus.orders
const initialLoadError = computed(() => String(initialLoadStatus.refreshError?.value || ""))
const INITIAL_LOAD_REQUEST_TIMEOUT_MS = 15 * 60 * 1000
const initialLoadClock = ref(Date.now())
let initialLoadClockTimer: ReturnType<typeof setInterval> | null = null
const inventoryDisplayedInitialLoad = computed(() => displayedInitialLoad("inventory", inventoryInitialLoad.value))
const orderDisplayedInitialLoad = computed(() => displayedInitialLoad("orders", orderInitialLoad.value))
const {
  landmarkDates: orderLandmarkDates,
  load: loadOrderLandmarkDates,
  record: recordOrderLandmarkDates
} = useOrderSyncLandmarkDates(() => linkedShopId.value)
const orderLandmarkDatesKnown = computed(() => orderLandmarkDates.value.status === "ready")
const orderLandmarkDatesFailed = computed(() => orderLandmarkDates.value.status === "error")
const savedSetupSnapshots = reactive<Record<"products" | "inventory" | "orders", string | null>>({
  products: null,
  inventory: null,
  orders: null
})

const { runState: spineRunState } = useShopifyProductSyncRunState(() => linkedShopId.value)
const finishedMdmLogs = computed(() => {
  return (spineRunState.value?.systemMessages || []).filter((msg: any) =>
    Boolean(msg.logId) && (msg.logStatusId === "DmlsFinished" || Boolean(msg.finishDateTime) || msg.statusId === "SmsgConsumed"))
})
const hasFinishedMdmLog = computed(() => {
  if(finishedMdmLogs.value.length > 0) {return true}
  const initialLoadCompleted = productInitialLoad.value?.run?.stages?.some((stage: any) => stage.id === "hotwax-import" && stage.status === "completed")

  return Boolean(initialLoadCompleted)
})

const { jobs } = useServiceJobs()

const shopifyPrimaryIdentifierOptions = computed(() => {
  if(productIdentifierOptions.value?.length) {
    return productIdentifierOptions.value
  }

  return [
    { enumId: "SHOPIFY_PRODUCT_SKU", description: translate("SKU") },
    { enumId: "SHOPIFY_BARCODE", description: translate("UPCA / Barcode") },
    { enumId: "SHOPIFY_PRODUCT_ID", description: translate("Shopify internal id") }
  ]
})

const syncJobObj = computed(() => {
  const shopId = linkedShopId.value
  if(!shopId) {return jobs.value.find((j: any) => j.serviceName === "sync_ShopifyProductUpdates") || null}
  const specificName = `sync_ShopifyProductUpdates_${shopId}`

  return jobs.value.find((j: any) => j.jobName === specificName) ||
    jobs.value.find((j: any) => (j.serviceName === "sync_ShopifyProductUpdates" || j.jobName?.includes("sync_ShopifyProductUpdates")) && j.jobName?.includes(shopId)) ||
    jobs.value.find((j: any) => j.serviceName === "sync_ShopifyProductUpdates") ||
    null
})
const sendUpdateRequestJobObj = computed(() => {
  return jobs.value.find((j: any) => j.jobName === "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery" || j.serviceName === "send_ProducedBulkOperationSystemMessage_ShopifyBulkQuery") || null
})
const importCompletedRequestsJobObj = computed(() => {
  return jobs.value.find((j: any) => j.jobName === "poll_ShopifyBulkOperationResult" || j.serviceName === "poll_ShopifyBulkOperationResult") || null
})

const watchedProductJobNames = computed(() => [
  syncJobObj.value?.jobName,
  sendUpdateRequestJobObj.value?.jobName,
  importCompletedRequestsJobObj.value?.jobName
].filter(Boolean) as string[])
const serviceJobRuns = useServiceJobRunsByJob(() => watchedProductJobNames.value, 10)

const isSyncJobPaused = computed(() => isPaused(syncJobObj.value))
const isBulkOperationSendJobPaused = computed(() => isPaused(sendUpdateRequestJobObj.value))
const isBulkOperationPollJobPaused = computed(() => isPaused(importCompletedRequestsJobObj.value))

function formatJobLastRun(job: any, isPausedState: boolean) {
  if(!job?.jobName) {return translate("Not configured")}
  if(isPausedState) {return translate("Paused")}
  const runs = serviceJobRuns.runsFor(job.jobName)
  if(runs?.length) {
    const latest = runs[0]
    const startedAt = latest.runTime || latest.startDate || latest.startTime || latest.createdDate || ""
    const status = latest.statusDesc || latest.statusId || (latest.hasError === "Y" ? translate("Error") : translate("Finished"))
    const dateLabel = startedAt ? commonUtil.formatDateTime(startedAt) : ""

    return dateLabel ? `${translate("Last run")}: ${dateLabel} · ${status}` : String(status)
  }

  return job.cronString || translate("No recent runs")
}

const queueUpdateRequestsLastRunLabel = computed(() => formatJobLastRun(syncJobObj.value, isSyncJobPaused.value))
const sendUpdateRequestLastRunLabel = computed(() => formatJobLastRun(sendUpdateRequestJobObj.value, isBulkOperationSendJobPaused.value))
const importCompletedRequestsLastRunLabel = computed(() => formatJobLastRun(importCompletedRequestsJobObj.value, isBulkOperationPollJobPaused.value))

const showSyncJobDetailsModal = ref(false)
const selectedSyncJobDetailsJob = ref<any>(null)
function openSyncJobDetails(job: any) {
  if(!job?.jobName) {return}
  selectedSyncJobDetailsJob.value = job
  showSyncJobDetailsModal.value = true
}

// 2.5 Live Shopify products count
const shopifyProductCount = ref<number | undefined>(undefined)
const isShopifyProductCountLoading = ref(false)
const shopifyProductCountLabel = computed(() => {
  if(isShopifyProductCountLoading.value) {return "..."}
  if(shopifyProductCount.value !== undefined && shopifyProductCount.value !== null) {
    return String(shopifyProductCount.value)
  }

  return translate("Unavailable")
})
async function loadShopifyProductCount() {
  if(!linkedShopId.value) {return}
  isShopifyProductCountLoading.value = true
  try {
    const remoteId = shopifySyncContext.remoteId.value
    if(!remoteId) {return}
    const stats = await fetchLiveCatalogCounts({
      systemMessageRemoteId: remoteId,
      shop: linkedShopifyShop.value
    })
    if(stats?.shopifyProductCount !== undefined) {
      shopifyProductCount.value = stats.shopifyProductCount
    }
  } catch (err) {
    logger.error("Failed to fetch Shopify catalog counts", err)
  } finally {
    isShopifyProductCountLoading.value = false
  }
}

// 3. Product Store setting for selecting primary and secondary identifier with sample product shown
const STATIC_PRODUCT_IDENTIFIER_OPTIONS = [
  { goodIdentificationTypeId: "productId", description: translate("Product ID") },
  { goodIdentificationTypeId: "groupId", description: translate("Group ID") },
  { goodIdentificationTypeId: "groupName", description: translate("Group Name") },
  { goodIdentificationTypeId: "internalName", description: translate("Internal Name") },
  { goodIdentificationTypeId: "parentProductName", description: translate("Parent Product Name") },
  { goodIdentificationTypeId: "primaryProductCategoryName", description: translate("Primary Product Category Name") },
  { goodIdentificationTypeId: "title", description: translate("Title") }
]
const fetchedGoodIdentificationOptions = ref<any[]>([])
const productIdentificationOptions = computed(() => {
  return [...STATIC_PRODUCT_IDENTIFIER_OPTIONS, ...fetchedGoodIdentificationOptions.value]
})
const { fetchGoodIdentificationTypes } = useGoodIdentificationTypes()
async function loadGoodIdentificationTypes() {
  try {
    const data = await fetchGoodIdentificationTypes("HC_GOOD_ID_TYPE", 50)
    if(Array.isArray(data)) {
      fetchedGoodIdentificationOptions.value = data
    }
  } catch (error) {
    logger.error("Failed to fetch good identification types", error)
  }
}

const sampleProducts = ref<any[]>([])
const currentSampleProduct = ref<any>(null)
function shuffleProduct() {
  if(sampleProducts.value.length) {
    const randomIndex = Math.floor(Math.random() * sampleProducts.value.length)
    currentSampleProduct.value = sampleProducts.value[randomIndex]
  }
}
async function fetchSampleProducts() {
  // Only show after product is imported from shopify!
  if(!hasFinishedMdmLog.value) {
    sampleProducts.value = []
    currentSampleProduct.value = null

    return
  }
  try {
    const resp = await useSolrSearch().searchProducts({ viewSize: 10 })
    if(resp?.products?.length) {
      sampleProducts.value = resp.products
      shuffleProduct()
    }
  } catch (error) {
    logger.error("Failed to fetch sample products for preview", error)
  }
}
const availableShopifyShops = computed(() => cachedShopifyShops.value.filter((shop: any) =>
  !shop.productStoreId))
const selectedAvailableShopifyShop = computed(() => availableShopifyShops.value.find((shop: any) =>
  String(shop.shopId) === String(onboarding.draft.selectedShopifyShopId || "")))
const facilityCount = computed(() => productStoreData.currentFacilities.length)
const mappedShopifyLocationCount = computed(() => shopifyLocationMappings.value.length)
const hasSelectedProductStore = computed(() => !!selectedProductStoreId.value)
const hasLinkedShopifyShop = computed(() => !!linkedShopId.value)
const setupSteps = computed(() => PRODUCT_STORE_ONBOARDING_STEPS.filter((step) => step.id !== "readiness"))
const setupProgressLabel = computed(() => translate("{complete} of {total} setup steps complete", {
  complete: onboarding.completedCount,
  total: onboarding.totalStepCount
}))
const userProgressValue = computed(() => {
  const index = onboarding.currentStepIndex
  const total = PRODUCT_STORE_ONBOARDING_STEPS.length
  if(!total || index < 0) {return 0}

  return (index + 1) / total
})
const isReadyToFinish = computed(() => PRODUCT_STORE_ONBOARDING_SETUP_STEP_IDS.every((stepId) =>
  onboarding.stepStatuses[stepId] === "complete") &&
  productSyncConfiguration.value.status === "configured" &&
  inventorySyncConfiguration.value.status === "configured" &&
  orderSyncConfiguration.value.status === "configured")
const productStoreIdError = computed(() => {
  if(!storeValidationAttempted.value && !storeFieldTouched.productStoreId) {return ""}
  const value = onboarding.draft.productStoreId.trim()
  if(!value) {return translate("Product Store ID is required.")}
  if(value.length > 20) {return translate("Product store ID cannot be more than 20 characters.")}

  return ""
})
const localeError = computed(() => {
  if(!storeValidationAttempted.value && !storeFieldTouched.locale) {return ""}
  const value = onboarding.draft.locale.trim()
  if(!value) {return translate("Default locale is required.")}
  if(!LOCALE_PATTERN.test(value)) {return translate("Enter a locale in the format en_US.")}

  return ""
})
const orderDateRangeValid = computed(() => {
  const historyStartDate = onboarding.draft.orderHistoryStartDate
  const launchDate = onboarding.draft.orderLaunchDate

  return !historyStartDate || !launchDate || historyStartDate <= launchDate
})
const orderHistoryStartDateError = computed(() => {
  if(!orderValidationAttempted.value && !orderFieldTouched.historyStartDate) {return ""}
  if(!onboarding.draft.orderHistoryStartDate) {return translate("Order history start date is required.")}

  return ""
})
const orderLaunchDateError = computed(() => {
  const validationVisible = orderValidationAttempted.value ||
    orderFieldTouched.historyStartDate || orderFieldTouched.launchDate
  if(!validationVisible) {return ""}
  if(!onboarding.draft.orderLaunchDate) {return translate("Order launch date is required.")}
  if(!orderDateRangeValid.value) {
    return translate("Order history start date must be on or before the order launch date.")
  }

  return ""
})
const canSaveStore = computed(() => {
  const baseValid = !!onboarding.draft.storeName.trim() &&
    !!onboarding.draft.productStoreId.trim() &&
    onboarding.draft.productStoreId.trim().length <= 20 &&
    !!onboarding.draft.defaultCurrencyUomId &&
    !!onboarding.draft.locale.trim() &&
    LOCALE_PATTERN.test(onboarding.draft.locale.trim()) &&
    !!onboarding.draft.timezone &&
    !!onboarding.draft.orderNumberPrefix.trim()

  return baseValid && (!shouldCollectCompanyName.value || !!onboarding.draft.companyName.trim())
})
const canConfigureProducts = computed(() =>
  !!selectedProductStoreId.value && !!linkedShopId.value && !!onboarding.draft.productIdentifierEnumId)
const productSetupDirty = computed(() =>
  savedSetupSnapshots.products === null || savedSetupSnapshots.products !== captureProductSetup().snapshot)
const inventoryResetJobStatus = computed(() =>
  productStoreData.currentShopifyJobStatus?.jobs?.find((job: any) => job.key === "inventoryReset") || null)
const inventoryResetSetupAvailability = computed<"available" | "missing" | "unknown">(() => {
  if(productStoreData.fetchStatus?.shopifyJobStatus !== "success") {return "unknown"}

  const job = inventoryResetJobStatus.value
  if(!job) {return "unknown"}
  // `templateJob` / `expectedJob` are the projection's own fields. An earlier pair of booleans
  // (`templateExists` / `expectedJobExists`) is long gone, so those clauses were dead and only the
  // status string still decided this.
  if(job.ready === true || !!job.templateJob || !!job.expectedJob ||
    job.status === "template-ready") {return "available"}

  return job.status === "missing-template" ? "missing" : "unknown"
})
/**
 * Every initial load in this wizard is a Shopify BULK QUERY, and `bulkOperationRunQuery` is a GraphQL
 * mutation. The connector refuses it outright on a read-only connection — "Cannot post graphQL
 * mutation, only read access is enabled for Shopify with systemMessageRemoteId" — inside a job that
 * runs on a fifteen-minute cron, so the wizard would accept the request, show it queued, and let the
 * operator wait for an import that could never leave the building. The steps that import list write
 * access as a prerequisite instead.
 */
const connectionAccessCheckDetail = computed(() => {
  if(connectionIsWritable.value) {return ""}
  if(!connectionRemoteResolved.value) {
    return "This shop's Shopify connection could not be read, so its access level is unknown. Open Shopify connections to check it."
  }

  return "Shopify bulk imports are sent as GraphQL mutations, which a read-only connection refuses. Grant write access on the Shopify step."
})

const inventoryResetSetupDetail = computed(() => {
  if(inventoryResetSetupAvailability.value === "missing") {
    // Named from the status rather than written in, because this text tells an operator which seed
    // data to ask for. It used to name `sync_ShopifyInventoryReset` while setup cloned a different
    // template, which would have sent them after the wrong one.
    return translate(
      "The backend service-job template {templateJobName} is missing. Ask the backend owner to load the Shopify inventory seed data, then select Refresh.",
      { templateJobName: String(inventoryResetJobStatus.value?.templateJobName || "") }
    )
  }
  if(inventoryResetSetupAvailability.value === "unknown") {
    return "The backend inventory job template has not been verified. Select Refresh before saving inventory preferences."
  }

  return ""
})
const canConfigureInventory = computed(() =>
  !!selectedProductStoreId.value && !!linkedShopId.value && mappedShopifyLocationCount.value > 0 &&
  inventoryResetSetupAvailability.value === "available")
const inventorySetupDirty = computed(() =>
  savedSetupSnapshots.inventory === null || savedSetupSnapshots.inventory !== captureInventorySetup().snapshot)
// Saving preferences stays available on a read-only connection — those writes are local and valid.
// Only the LOAD is gated, because it is the half that needs a Shopify mutation the connector refuses.
const canLoadInventory = computed(() =>
  canConfigureInventory.value && !inventorySetupDirty.value && connectionIsWritable.value)
const canConfigureOrders = computed(() =>
  !!selectedProductStoreId.value && !!linkedShopId.value &&
  !!onboarding.draft.orderHistoryStartDate && !!onboarding.draft.orderLaunchDate &&
  orderDateRangeValid.value)
const orderSetupDirty = computed(() =>
  savedSetupSnapshots.orders === null || savedSetupSnapshots.orders !== captureOrderSetup().snapshot)
const canLoadOrders = computed(() =>
  canConfigureOrders.value && !orderSetupDirty.value && connectionIsWritable.value)
const shopifyConfigurationKnown = computed(() =>
  productStoreData.fetchStatus?.shopifyJobStatus === "success")
const shopifyConfigurationFailed = computed(() =>
  productStoreData.fetchStatus?.shopifyJobStatus === "error")
const productStoreDetailsKnown = computed(() =>
  productStoreData.fetchStatus?.productStoreDetails === "success")
const productStoreSettingsKnown = computed(() =>
  productStoreData.fetchStatus?.currentStoreSettings === "success")
const productStoreConfigurationKnown = computed(() =>
  productStoreDetailsKnown.value && productStoreSettingsKnown.value)
const productStoreConfigurationFailed = computed(() =>
  productStoreData.fetchStatus?.productStoreDetails === "error" ||
  productStoreData.fetchStatus?.currentStoreSettings === "error")
const selectedProductStoreLoaded = computed(() =>
  String(productStoreData.current?.productStoreId || "") === String(selectedProductStoreId.value || ""))
function persistedProductPreferences() {
  const text = String(productStoreData.currentStoreSettings?.PRDT_IDEN_PREF?.settingValue || "")
  if(!text) {return null}
  try {
    const parsed = JSON.parse(text)
    if(!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {return null}

    return {
      primaryId: typeof parsed.primaryId === "string" ? parsed.primaryId : "",
      secondaryId: typeof parsed.secondaryId === "string" ? parsed.secondaryId : ""
    }
  } catch {
    return null
  }
}
const productPreferencesPersisted = computed(() => {
  const storeMatches = String(productStoreData.current?.productStoreId || "") === String(selectedProductStoreId.value || "")
  const identifier = String(productStoreData.current?.productIdentifierEnumId || "")
  const preference = persistedProductPreferences()

  return storeMatches && !!identifier && identifier === onboarding.draft.productIdentifierEnumId && !!preference &&
    preference.primaryId === onboarding.draft.primaryProductIdentification &&
    preference.secondaryId === onboarding.draft.secondaryProductIdentification
})
const inventoryPreferencesPersisted = computed(() => {
  const storeMatches = String(productStoreData.current?.productStoreId || "") === String(selectedProductStoreId.value || "")
  const reserveInventory = String(productStoreData.current?.reserveInventory || "")
  const inventoryView = String(productStoreData.currentStoreSettings?.INV_CNT_VIEW_QOH?.settingValue || "")

  return storeMatches && reserveInventory === onboarding.draft.reserveInventory &&
    inventoryView === onboarding.draft.showSystemicInventory
})
const orderDatesPersisted = computed(() =>
  dateTimeValue(onboarding.draft.orderHistoryStartDate) === orderLandmarkDates.value.historyLastSyncDate &&
  dateTimeValue(onboarding.draft.orderLaunchDate) === orderLandmarkDates.value.launchDate)
const productSyncConfiguration = computed<OnboardingSyncConfiguration>(() => syncConfiguration(
  !productSetupDirty.value && hasSelectedProductStore.value && hasLinkedShopifyShop.value &&
    productPreferencesPersisted.value && connectionIsWritable.value &&
    ["productSync", "productBulkSend", "productBulkPoll"].every(jobReady),
  [
    syncCheck("product-store", "Product Store", selectedProductStoreLoaded.value, productStoreDetailsKnown.value),
    syncCheck("product-shop", "Shopify shop", hasLinkedShopifyShop.value, true),
    syncCheck(
      "product-access",
      "Shopify write access",
      connectionIsWritable.value,
      connectionRemoteResolved.value,
      connectionAccessCheckDetail.value
    ),
    syncCheck("product-identifier", "Global identifier", productPreferencesPersisted.value, productStoreConfigurationKnown.value),
    syncCheck("product-queue", "Queue update requests", jobReady("productSync"), shopifyConfigurationKnown.value),
    syncCheck("product-send", "Send update request", jobReady("productBulkSend"), shopifyConfigurationKnown.value),
    syncCheck("product-import", "Import completed requests", jobReady("productBulkPoll"), shopifyConfigurationKnown.value)
  ],
  shopifyConfigurationFailed.value || productStoreConfigurationFailed.value
))
const inventorySyncConfiguration = computed<OnboardingSyncConfiguration>(() => syncConfiguration(
  !inventorySetupDirty.value && hasSelectedProductStore.value && hasLinkedShopifyShop.value &&
    mappedShopifyLocationCount.value > 0 && inventoryPreferencesPersisted.value &&
    connectionIsWritable.value && jobReady("inventoryReset"),
  [
    syncCheck("inventory-store", "Product Store", selectedProductStoreLoaded.value, productStoreDetailsKnown.value),
    syncCheck("inventory-shop", "Shopify shop", hasLinkedShopifyShop.value, true),
    syncCheck(
      "inventory-access",
      "Shopify write access",
      connectionIsWritable.value,
      connectionRemoteResolved.value,
      connectionAccessCheckDetail.value
    ),
    syncCheck(
      "inventory-mappings",
      "Shopify location mappings",
      mappedShopifyLocationCount.value > 0,
      locationMappingFetchStatus.value === "success"
    ),
    syncCheck("inventory-preferences", "Inventory preferences", inventoryPreferencesPersisted.value, productStoreConfigurationKnown.value),
    syncCheck(
      "inventory-job",
      // Reads job readiness, so it must not be named after the import. Labelled "Initial inventory
      // import", it showed Complete the moment setup was saved and nothing had been imported —
      // directly contradicting the run panel below it, which correctly said Not started.
      "Inventory feed to Shopify",
      jobReady("inventoryReset"),
      inventoryResetSetupAvailability.value !== "unknown",
      inventoryResetSetupDetail.value
    )
  ],
  shopifyConfigurationFailed.value || productStoreConfigurationFailed.value ||
    locationMappingFetchStatus.value === "error"
))
const orderSyncConfiguration = computed<OnboardingSyncConfiguration>(() => syncConfiguration(
  !orderSetupDirty.value && hasSelectedProductStore.value && hasLinkedShopifyShop.value &&
    orderDatesPersisted.value && orderDateRangeValid.value && connectionIsWritable.value &&
    jobReady("orderImport") && jobReady("orderHistory"),
  [
    syncCheck("order-store", "Product Store", selectedProductStoreLoaded.value, productStoreDetailsKnown.value),
    syncCheck("order-shop", "Shopify shop", hasLinkedShopifyShop.value, true),
    syncCheck(
      "order-access",
      "Shopify write access",
      connectionIsWritable.value,
      connectionRemoteResolved.value,
      connectionAccessCheckDetail.value
    ),
    syncCheck(
      "order-dates",
      "Order import dates",
      orderDatesPersisted.value && orderDateRangeValid.value,
      orderLandmarkDatesKnown.value
    ),
    syncCheck("order-live-job", "Order import", jobReady("orderImport"), shopifyConfigurationKnown.value),
    syncCheck("order-history-job", "Historic order import", jobReady("orderHistory"), shopifyConfigurationKnown.value)
  ],
  shopifyConfigurationFailed.value || productStoreConfigurationFailed.value || orderLandmarkDatesFailed.value
))
const inventorySyncBusyAction = computed<OnboardingSyncBusyAction>(() => syncBusyAction(
  "inventory",
  busy.inventory,
  busy.inventoryImport
))
const orderSyncBusyAction = computed<OnboardingSyncBusyAction>(() => syncBusyAction(
  "orders",
  busy.orders,
  busy.orderImport
))
const canContinue = computed(() => currentStep.value.id !== "name" || !!selectedProductStoreId.value)
const stepStatusPresentation = computed(() => reviewStatus(currentStep.value.id))

function syncCheck(id: string, label: string, complete: boolean, known: boolean, detail = "") {
  return {
    id,
    label,
    status: known ? (complete ? "complete" as const : "missing" as const) : "unknown" as const,
    detail
  }
}

function syncConfiguration(
  ready: boolean,
  checks: OnboardingSyncConfiguration["checks"],
  evidenceFailed = false
): OnboardingSyncConfiguration {
  const known = checks?.every((check) => check.status !== "unknown") ?? true

  if(!known && evidenceFailed) {
    return {
      status: "unknown",
      summary: "Configuration status could not be loaded. Refresh to try again.",
      checks
    }
  }

  return {
    status: known ? (ready ? "configured" : "not-configured") : "unknown",
    summary: known
      ? (ready
        ? "Configuration is ready. Run the initial load or refresh its status."
        : "Complete the missing checks, save, then run the initial load.")
      : "Configuration status is still loading.",
    checks
  }
}

function syncBusyAction(
  kind: OnboardingInitialLoadKind,
  saving: boolean,
  running: boolean
): OnboardingSyncBusyAction {
  if(saving) {return "save"}
  if(running) {return "run"}
  if(initialLoadRefreshBusy[kind]) {return "refresh"}

  return null
}

function initialLoadActive(status: string) {
  return ["pending", "queued", "sent", "running", "importing"].includes(status)
}

function initialLoadHasRequestEvidence(
  kind: OnboardingInitialLoadKind,
  snapshot: OnboardingInitialLoadSnapshot
) {
  const request = onboarding.runRequests[kind]
  if(!request || request.shopId !== linkedShopId.value) {return false}
  if(request.systemMessageId) {return snapshot.details.systemMessageId === request.systemMessageId}

  return !!request.jobRunId && snapshot.details.jobRunId === request.jobRunId
}

function initialLoadRunBlocked(kind: OnboardingInitialLoadKind, status: string) {
  const request = onboarding.runRequests[kind]
  if(request) {
    const hasEvidence = initialLoadHasRequestEvidence(kind, initialLoadSnapshot(kind))
    if(hasEvidence) {return initialLoadActive(status)}

    return initialLoadClock.value - request.requestedAt < INITIAL_LOAD_REQUEST_TIMEOUT_MS
  }

  return initialLoadActive(status)
}

function initialLoadActionLabel(kind: OnboardingInitialLoadKind, defaultLabel: string) {
  const snapshot = kind === "products"
    ? productInitialLoad.value
    : kind === "inventory"
      ? inventoryInitialLoad.value
      : orderInitialLoad.value

  const request = onboarding.runRequests[kind]
  const hasEvidence = !!request && initialLoadHasRequestEvidence(kind, snapshot)
  const requestStalled = request && !hasEvidence &&
    initialLoadClock.value - request.requestedAt >= INITIAL_LOAD_REQUEST_TIMEOUT_MS
  const correlatedTerminalFailure = hasEvidence && snapshot.hydrated &&
    ["error", "cancelled", "unavailable", "unknown"].includes(snapshot.run.status)

  return correlatedTerminalFailure || ["error", "cancelled"].includes(snapshot.run.status) || requestStalled
    ? "Retry"
    : defaultLabel
}

function displayedInitialLoad(
  kind: OnboardingInitialLoadKind,
  snapshot: OnboardingInitialLoadSnapshot
): OnboardingSyncRun {
  const request = onboarding.runRequests[kind]
  if(!request || initialLoadHasRequestEvidence(kind, snapshot)) {return snapshot.run}
  const stalled = initialLoadClock.value - request.requestedAt >= INITIAL_LOAD_REQUEST_TIMEOUT_MS

  return {
    status: stalled ? "error" : "queued",
    summary: stalled
      ? "No sync evidence appeared for the accepted request. Refresh, then retry if needed."
      : "Request accepted. Waiting for its sync run to appear.",
    lastRunLabel: request.jobRunId || request.systemMessageId || undefined,
    stages: []
  }
}

function statusLabel(status: ProductStoreOnboardingStepStatus) {
  return {
    "not-started": "Not started",
    "in-progress": "In progress",
    complete: "Complete",
    attention: "Needs attention"
  }[status]
}

function reviewStatus(stepId: ProductStoreOnboardingStepId) {
  const status = onboarding.stepStatuses[stepId]

  return {
    "not-started": { label: "Not started", color: "medium", icon: ellipseOutline },
    "in-progress": { label: "In progress", color: "primary", icon: timeOutline },
    complete: { label: "Complete", color: "success", icon: checkmarkCircleOutline },
    attention: { label: "Needs attention", color: "warning", icon: alertCircleOutline }
  }[status]
}

function setFeedback(stepId: ProductStoreOnboardingStepId, text: string, tone: FeedbackTone) {
  feedback[stepId] = { text, tone }
}

function updateDraft(field: keyof ProductStoreOnboardingDraft, value: unknown) {
  onboarding.updateDraftField(field, String(value ?? ""))
  const status = onboarding.stepStatuses[onboarding.currentStepId]
  if(status === "not-started" || (status === "complete" && field !== "facilityMode")) {
    onboarding.markStepInProgress()
  }
}

async function resetStepViewport() {
  await nextTick()
  const content = contentRef.value?.$el || contentRef.value
  await content?.scrollToTop?.(0)
  const heading = stepHeadingRef.value?.$el || stepHeadingRef.value
  heading?.focus?.()
}

async function selectStep(stepId: string) {
  if(!isProductStoreOnboardingStepId(stepId)) {return}
  onboarding.selectStep(stepId)
  await resetStepViewport()
}

async function goNext() {
  onboarding.goNext()
  await resetStepViewport()
}

async function goPrevious() {
  onboarding.goPrevious()
  await resetStepViewport()
}

function shopLabel(shop: any) {
  return shop?.name || shop?.myshopifyDomain || shop?.shopName || shop?.shopId || ""
}

function responseFailed(response: any) {
  if(!response) {return true}
  if(commonUtil.hasError(response)) {return true}

  const payload = response?.data ?? response

  return payload?.hasError === true || payload?.hasError === "Y" || !!payload?._ERROR_MESSAGE_ ||
    (Array.isArray(payload?._ERROR_MESSAGE_LIST_) && payload._ERROR_MESSAGE_LIST_.length > 0) ||
    (Array.isArray(payload?.errorMessages) && payload.errorMessages.length > 0) ||
    (typeof payload?.errorMessages === "string" && !!payload.errorMessages.trim())
}

function feedbackForError(error: any, fallback: string) {
  const payload = error?.data ?? error
  if(Array.isArray(payload?.errorMessages) && payload.errorMessages.length) {
    return payload.errorMessages.join(", ")
  }
  if(typeof payload?.errorMessages === "string" && payload.errorMessages.trim()) {
    return payload.errorMessages
  }

  return getResponseErrorMessage(error, translate(fallback))
}

function dateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function dateTimeValue(date: string) {
  return date ? `${date} 00:00:00` : ""
}

function captureStoreSetup() {
  return {
    productStoreId: onboarding.draft.productStoreId.trim(),
    storeName: onboarding.draft.storeName.trim(),
    defaultCurrencyUomId: onboarding.draft.defaultCurrencyUomId.trim(),
    locale: onboarding.draft.locale.trim(),
    timezone: onboarding.draft.timezone.trim(),
    autoApproveOrder: onboarding.draft.autoApproveOrder === "Y" ? "Y" : "N",
    orderNumberPrefix: onboarding.draft.orderNumberPrefix.trim(),
    saveBillingInformation: onboarding.draft.saveBillingInformation === "Y" ? "Y" : "N"
  }
}

async function focusIonicControl(controlRef: any) {
  await nextTick()
  const control = controlRef?.value?.$el || controlRef?.value
  await control?.setFocus?.()
  if(!control?.setFocus) {control?.focus?.()}
}

async function focusFirstInvalidStoreField() {
  const invalidControl = [
    [shouldCollectCompanyName.value && !onboarding.draft.companyName.trim(), companyNameInputRef],
    [!onboarding.draft.storeName.trim(), storeNameInputRef],
    [!onboarding.draft.productStoreId.trim() || onboarding.draft.productStoreId.trim().length > 20, productStoreIdInputRef],
    [!onboarding.draft.defaultCurrencyUomId, currencyInputRef],
    [!LOCALE_PATTERN.test(onboarding.draft.locale.trim()), localeInputRef],
    [!onboarding.draft.timezone, timezoneInputRef],
    [!onboarding.draft.orderNumberPrefix.trim(), orderNumberPrefixInputRef]
  ].find(([invalid]) => invalid)?.[1]

  if(invalidControl) {await focusIonicControl(invalidControl)}
}

async function saveStore() {
  storeValidationAttempted.value = true
  if(!canSaveStore.value) {
    setFeedback("name", translate("Complete every required store field before saving."), "danger")
    await focusFirstInvalidStoreField()

    return
  }

  busy.name = true
  feedback.name = null
  const wasExisting = !!selectedProductStoreId.value
  const expectedSetup = captureStoreSetup()
  const requestedId = expectedSetup.productStoreId

  try {
    if(!organizationPartyId.value) {
      const organization = await bootstrapOrganization({ groupName: onboarding.draft.companyName.trim() })
      if(!organization?.partyId) {throw new Error(translate("Unable to create the company organization."))}
    }

    const storePayload = {
      storeName: expectedSetup.storeName,
      defaultCurrencyUomId: expectedSetup.defaultCurrencyUomId,
      defaultLocaleString: expectedSetup.locale,
      defaultTimeZoneString: expectedSetup.timezone,
      autoApproveOrder: expectedSetup.autoApproveOrder,
      orderNumberPrefix: expectedSetup.orderNumberPrefix,
      payToPartyId: organizationPartyId.value
    }

    let response: any
    if(wasExisting) {
      response = await useProductStoreMutations(selectedProductStoreId.value).updateStore(storePayload)
    } else {
      response = await createStore({ ...storePayload, productStoreId: requestedId })
    }
    if(responseFailed(response)) {throw response?.data || response}

    const savedId = String(response?.data?.productStoreId || selectedProductStoreId.value || requestedId)
    onboarding.setCreatedProductStoreId(savedId)
    await router.replace(`/product-store-onboarding/${encodeURIComponent(savedId)}`)

    const billingResponse = await useProductStoreMutations(savedId).saveSettings({
      settingTypeEnumId: "SAVE_BILL_TO_INF",
      settingValue: expectedSetup.saveBillingInformation
    })
    if(responseFailed(billingResponse)) {throw billingResponse?.data || billingResponse}

    const loaded = await loadSelectedProductStore(savedId)
    if(!loaded || !persistedStoreMatches(expectedSetup)) {
      throw new Error(translate("Failed to save the Product Store."))
    }
    setFeedback("name", translate(wasExisting ? "Store settings saved." : "Product Store created."), "success")
  } catch (error: any) {
    logger.error(error)
    onboarding.markStepAttention("name")
    setFeedback("name", feedbackForError(error, "Failed to save the Product Store."), "danger")
  } finally {
    busy.name = false
  }
}

async function linkShopifyShop() {
  const shopId = String(selectedAvailableShopifyShop.value?.shopId || "")
  if(!selectedProductStoreId.value || !shopId) {return}

  busy.shopify = true
  feedback.shopify = null
  try {
    const response = await useShopifyShopMutations(shopId).updateShop({
      productStoreId: selectedProductStoreId.value
    })
    if(responseFailed(response)) {throw response?.data || response}

    await refreshShopifyStatus(shopId)
    setFeedback("shopify", translate("Shopify shop linked to this Product Store."), "success")
    await refreshLocationMappings()
  } catch (error: any) {
    logger.error(error)
    onboarding.markStepAttention("shopify")
    setFeedback("shopify", feedbackForError(error, "Failed to link the Shopify shop."), "danger")
  } finally {
    busy.shopify = false
  }
}

function openShopifyConnections() {
  router.push("/shopify")
}

/**
 * The OMS-side read/write shutoff on the shop's SystemMessageRemote.
 *
 * Importing from Shopify only needs read access, so the wizard's own steps run fine on a read-only
 * connection — but everything the store publishes back does not. Associating facilities already
 * records inventory-channel events, and the connector refuses them with "No write-capable Shopify
 * remote for shop ..., needs SHOP_RW_ACCESS" in the backend log and nothing at all on screen. The
 * operator finished setup believing the store was live. So the level is shown here beside the shop
 * it belongs to, and can be raised without leaving the wizard.
 */
/**
 * Whether the shop's remote has RESOLVED, which is a separate question from what scope it carries.
 *
 * The remote is what decides both, and an empty `accessScopeEnumId` on a remote that exists is a real
 * state the connector treats as read-only (see `getShopifyAccessStateFromCandidate`). Reading the
 * scope string alone conflated it with "still loading", which hid the Grant button behind a message
 * promising a value that was never going to arrive, while the load actions stayed disabled — a store
 * that could not be imported into and offered no control to fix it.
 */
const connectionRemoteResolved = computed(() =>
  !!String(shopifySyncContext.remote.value?.systemMessageRemoteId ?? "").trim())
const connectionAccessScopeId = computed(() => String(shopifySyncContext.remote.value?.accessScopeEnumId || ""))
const connectionIsWritable = computed(() =>
  connectionRemoteResolved.value && isWritableAccessScope(connectionAccessScopeId.value))
const connectionAccessLabel = computed(() => {
  if(connectionIsWritable.value) {return translate("Read and write")}

  return connectionRemoteResolved.value ? translate("Read only") : translate("Unknown")
})
const connectionAccessDescription = computed(() => {
  if(connectionIsWritable.value) {
    return translate("This Product Store can publish inventory and fulfillments back to Shopify.")
  }
  if(!connectionRemoteResolved.value) {
    return translate("This shop's Shopify connection could not be read, so its access level is unknown. Open Shopify connections to check it.")
  }

  return translate("Imports work, but nothing this store records will reach Shopify until write access is granted.")
})

async function grantConnectionWriteAccess() {
  const remoteId = shopifySyncContext.remoteId.value
  if(!remoteId || connectionIsWritable.value || busy.connectionAccess) {return}

  busy.connectionAccess = true
  feedback.shopify = null
  try {
    await useShopifyAccessScopes().setConnectionAccessScope(remoteId, SHOPIFY_RW_ACCESS_SCOPE)
    setFeedback("shopify", translate("This connection can now write to Shopify."), "success")
  } catch (error: any) {
    logger.error(error)
    setFeedback("shopify", feedbackForError(error, "Failed to grant write access to this connection."), "danger")
  } finally {
    busy.connectionAccess = false
  }
}

function captureProductSetup() {
  const setup = {
    productStoreId: selectedProductStoreId.value,
    shopId: linkedShopId.value,
    productIdentifierEnumId: onboarding.draft.productIdentifierEnumId,
    primaryProductIdentification: onboarding.draft.primaryProductIdentification,
    secondaryProductIdentification: onboarding.draft.secondaryProductIdentification
  }

  return {
    ...setup,
    snapshot: JSON.stringify(Object.values(setup))
  }
}

function captureInventorySetup() {
  const setup = {
    productStoreId: selectedProductStoreId.value,
    shopId: linkedShopId.value,
    reserveInventory: onboarding.draft.reserveInventory === "Y" ? "Y" : "N",
    showSystemicInventory: onboarding.draft.showSystemicInventory === "true" ? "true" : "false"
  }

  return {
    ...setup,
    snapshot: JSON.stringify(Object.values(setup))
  }
}

function captureOrderSetup() {
  const setup = {
    productStoreId: selectedProductStoreId.value,
    shopId: linkedShopId.value,
    historyStartDate: dateTimeValue(onboarding.draft.orderHistoryStartDate),
    launchDate: dateTimeValue(onboarding.draft.orderLaunchDate)
  }

  return {
    ...setup,
    snapshot: JSON.stringify(Object.values(setup))
  }
}

function initialLoadSnapshot(kind: OnboardingInitialLoadKind) {
  return kind === "products"
    ? productInitialLoad.value
    : kind === "inventory"
      ? inventoryInitialLoad.value
      : orderInitialLoad.value
}

function beginInitialLoadRequest(kind: OnboardingInitialLoadKind, shopId: string, setupSnapshot: string) {
  const existing = onboarding.runRequests[kind]
  if(existing && Date.now() - existing.requestedAt >= INITIAL_LOAD_REQUEST_TIMEOUT_MS) {
    onboarding.setRunRequest(kind, null)
  }
  onboarding.setRunRequest(kind, {
    shopId,
    setupSnapshot,
    baselineSystemMessageId: initialLoadSnapshot(kind).details.systemMessageId,
    systemMessageId: "",
    jobRunId: "",
    requestedAt: Date.now()
  })
}

function acceptInitialLoadRequest(kind: OnboardingInitialLoadKind, response: any) {
  const request = onboarding.runRequests[kind]
  if(!request) {return}
  const payload = response?.data ?? response ?? {}
  // Which identifier comes back is a property of the transport, not of the step. Products and
  // inventory are produced as SystemMessages by the connector's bulk-query resources; historic
  // orders run a service job and return a ServiceJobRun. Assuming one per step is what broke
  // inventory tracking when its load moved onto the connector resource: the run was accepted by the
  // backend and the step still reported that it could not be tracked. Read whichever arrived, and
  // let `initialLoadMatchesRequest` match on the one that is set.
  const systemMessageId = String(payload.systemMessageId || "").trim()
  const jobRunId = String(payload.jobRunId || "").trim()
  if(!systemMessageId && !jobRunId) {
    throw new Error(translate("The sync request could not be tracked because the backend returned no tracking ID."))
  }
  onboarding.setRunRequest(kind, { ...request, systemMessageId, jobRunId })
}

function initialLoadMatchesRequest(kind: OnboardingInitialLoadKind, snapshot: OnboardingInitialLoadSnapshot) {
  const request = onboarding.runRequests[kind]
  if(!request || request.shopId !== linkedShopId.value) {return false}
  const setupSnapshot = kind === "products"
    ? captureProductSetup().snapshot
    : kind === "inventory"
      ? captureInventorySetup().snapshot
      : captureOrderSetup().snapshot
  if(request.setupSnapshot !== setupSnapshot) {return false}
  if(request.systemMessageId) {return snapshot.details.systemMessageId === request.systemMessageId}
  if(request.jobRunId) {
    return snapshot.details.jobRunId === request.jobRunId
  }

  return false
}

function productPreferenceValue(primaryId: string, secondaryId: string) {
  const value: Record<string, string> = {}
  if(primaryId) {
    value.primaryId = primaryId
  }
  if(secondaryId) {
    value.secondaryId = secondaryId
  }

  return JSON.stringify(value)
}

async function saveProductSetup() {
  if(!canConfigureProducts.value ||
    busy.products || busy.productImport || initialLoadRefreshBusy.products) {return}

  const setup = captureProductSetup()
  busy.products = true
  feedback.products = null
  try {
    const storeResponse = await useProductStoreMutations(setup.productStoreId).updateStore({
      productIdentifierEnumId: setup.productIdentifierEnumId
    })
    if(responseFailed(storeResponse)) {throw storeResponse?.data || storeResponse}

    const settingResponse = await useProductStoreMutations(setup.productStoreId).saveSettings({
      settingTypeEnumId: "PRDT_IDEN_PREF",
      settingValue: productPreferenceValue(setup.primaryProductIdentification, setup.secondaryProductIdentification)
    })
    if(responseFailed(settingResponse)) {throw settingResponse?.data || settingResponse}

    const jobResponse = await productStoreData.setupProductStoreShopifyProductImport({
      productStoreId: setup.productStoreId,
      shopId: setup.shopId,
      productIdentifierEnumId: setup.productIdentifierEnumId,
      activateJobs: true
    })
    if(responseFailed(jobResponse)) {throw jobResponse?.data || jobResponse}

    await loadSelectedProductStore(setup.productStoreId)
    savedSetupSnapshots.products = setup.snapshot
    onboarding.setRunRequest("products", null)
    if(hasFinishedMdmLog.value) {
      onboarding.markStepComplete("products")
      setFeedback("products", translate("Product setup saved."), "success")
      void fetchSampleProducts()
    } else {
      onboarding.markStepInProgress("products")
      setFeedback("products", translate("Product setup saved. You can now load the catalog."), "success")
    }
  } catch (error: any) {
    logger.error(error)
    onboarding.markStepAttention("products")
    setFeedback("products", feedbackForError(error, "Failed to save product setup."), "danger")
  } finally {
    busy.products = false
  }
}

async function openFacilityImport() {
  if(!linkedShopId.value || !selectedProductStoreId.value) {return}

  const trigger = facilityImportTriggerRef.value?.$el || facilityImportTriggerRef.value
  busy.facilities = true
  feedback.facilities = null
  try {
    const modal = await modalController.create({
      component: ImportShopifyLocationsModal,
      componentProps: {
        shopId: linkedShopId.value,
        productStoreId: selectedProductStoreId.value
      }
    })
    await modal.present()
    const { data } = await modal.onDidDismiss()
    if(!data) {return}

    await productStoreData.fetchProductStoreFacilities(selectedProductStoreId.value)
    await refreshLocationMappings()
    const associationFacilityIds = Array.isArray(data.associationFacilityIds)
      ? data.associationFacilityIds
      : []
    const fullyAssociated = associationFacilityIds.length > 0 &&
      data.associationFailed !== true &&
      data.associated === associationFacilityIds.length &&
      Array.isArray(data.associatedFacilityIds) &&
      data.associatedFacilityIds.length === associationFacilityIds.length

    if(!fullyAssociated) {
      onboarding.markStepAttention("facilities")
      setFeedback("facilities", translate("Facilities were only partly imported or associated. Review the failed locations before continuing."), "danger")

      return
    }

    onboarding.markStepComplete("facilities")
    setFeedback("facilities", translate("Every selected facility was associated with this Product Store."), "success")
  } catch (error: any) {
    logger.error(error)
    onboarding.markStepAttention("facilities")
    setFeedback("facilities", feedbackForError(error, "Failed to import Shopify locations."), "danger")
  } finally {
    busy.facilities = false
    await nextTick()
    if(trigger) {
      if(trigger.setFocus) {
        await trigger.setFocus()
      } else {
        trigger.focus?.()
      }
    }
  }
}

async function createStoreFacility() {
  if(!selectedProductStoreId.value) {return}

  busy.facilities = true
  feedback.facilities = null
  try {
    const facilityId = generateInternalId(`${selectedProductStoreId.value}_STORE`).slice(0, 20)
    const exists = allFacilities.value.some((facility: any) => facility.facilityId === facilityId)
    if(!exists) {
      const facilityResponse = await createFacility({
        facilityId,
        facilityName: onboarding.draft.storeName || selectedProductStoreId.value,
        externalId: facilityId,
        facilityTypeId: "RETAIL_STORE",
        defaultInventoryItemTypeId: "NON_SERIAL_INV_ITEM",
        ownerPartyId: organizationPartyId.value
      })
      if(responseFailed(facilityResponse)) {throw facilityResponse?.data || facilityResponse}
    }

    const associationResponse = await useProductStoreMutations(selectedProductStoreId.value).addFacility({ facilityId })
    if(responseFailed(associationResponse)) {throw associationResponse?.data || associationResponse}

    await productStoreData.fetchProductStoreFacilities(selectedProductStoreId.value)
    onboarding.markStepComplete("facilities")
    setFeedback("facilities", translate("The retail facility was created and associated."), "success")
  } catch (error: any) {
    logger.error(error)
    onboarding.markStepAttention("facilities")
    setFeedback("facilities", feedbackForError(error, "Failed to create the store facility."), "danger")
  } finally {
    busy.facilities = false
  }
}

async function refreshLocationMappings() {
  if(!linkedShopId.value) {
    shopifyLocationMappings.value = []
    locationMappingFetchStatus.value = "idle"

    return
  }

  busy.locations = true
  locationMappingFetchStatus.value = "pending"
  try {
    shopifyLocationMappings.value = await fetchShopifyShopLocations(linkedShopId.value, 200)
    locationMappingFetchStatus.value = "success"
    if(shopifyLocationMappings.value.length) {
      onboarding.markStepComplete("locations")
      setFeedback("locations", translate("Shopify location mappings are ready."), "success")
    } else {
      if(onboarding.stepStatuses.locations === "complete") {onboarding.markStepAttention("locations")}
      setFeedback("locations", translate("No Shopify locations are mapped yet."), "warning")
    }
  } catch (error: any) {
    locationMappingFetchStatus.value = "error"
    logger.error(error)
    if(onboarding.stepStatuses.locations !== "complete") {
      onboarding.markStepAttention("locations")
    }
    setFeedback("locations", feedbackForError(error, "Failed to refresh Shopify location mappings."), "danger")
  } finally {
    busy.locations = false
  }
}

function openLocationMapping() {
  if(!linkedShopId.value) {return}
  router.push({
    path: `/shopify-connection-details/${encodeURIComponent(linkedShopId.value)}/locations`,
    query: { returnTo: route.fullPath }
  })
}

async function saveInventorySetup() {
  if(!canConfigureInventory.value || !inventorySetupDirty.value ||
    initialLoadRunBlocked("inventory", inventoryInitialLoad.value.run.status) ||
    busy.inventory || busy.inventoryImport || initialLoadRefreshBusy.inventory) {return}

  const setup = captureInventorySetup()
  busy.inventory = true
  feedback.inventory = null
  try {
    // Provisioning is the preflight for the preference writes below. A missing backend template or
    // clone target must fail before ProductStore/ProductStoreSetting can be partially updated.
    const jobResponse = await productStoreData.setupProductStoreShopifyInventoryReset({
      productStoreId: setup.productStoreId,
      shopId: setup.shopId,
      activateJobs: false,
      inventoryResetAdditionalParameters: {}
    })
    if(responseFailed(jobResponse)) {throw jobResponse?.data || jobResponse}

    const storeResponse = await useProductStoreMutations(setup.productStoreId).updateStore({
      reserveInventory: setup.reserveInventory
    })
    if(responseFailed(storeResponse)) {throw storeResponse?.data || storeResponse}

    const settingResponse = await useProductStoreMutations(setup.productStoreId).saveSettings({
      settingTypeEnumId: "INV_CNT_VIEW_QOH",
      settingValue: setup.showSystemicInventory
    })
    if(responseFailed(settingResponse)) {throw settingResponse?.data || settingResponse}

    savedSetupSnapshots.inventory = setup.snapshot
    onboarding.setRunRequest("inventory", null)
    onboarding.markStepInProgress("inventory")
    setFeedback("inventory", translate("Inventory setup saved. You can now load inventory."), "success")
  } catch (error: any) {
    logger.error(error)
    onboarding.markStepAttention("inventory")
    setFeedback("inventory", feedbackForError(error, "Failed to save inventory setup."), "danger")
  } finally {
    busy.inventory = false
  }
}

async function loadInventory() {
  if(!canLoadInventory.value || initialLoadRunBlocked("inventory", inventoryInitialLoad.value.run.status) ||
    busy.inventory || busy.inventoryImport || initialLoadRefreshBusy.inventory) {return}

  const setup = captureInventorySetup()
  const savedSnapshot = savedSetupSnapshots.inventory
  busy.inventoryImport = true
  feedback.inventory = null
  beginInitialLoadRequest("inventory", setup.shopId, setup.snapshot)
  try {
    const response = await productStoreData.runProductStoreShopifyInventoryReset({ shopId: setup.shopId })
    if(responseFailed(response)) {throw response?.data || response}
    acceptInitialLoadRequest("inventory", response)
    if(savedSetupSnapshots.inventory !== savedSnapshot || captureInventorySetup().snapshot !== savedSnapshot) {return}

    onboarding.markStepInProgress("inventory")
    setFeedback("inventory", translate("The initial inventory load was queued. This step stays in progress until the load finishes successfully."), "medium")
  } catch (error: any) {
    onboarding.setRunRequest("inventory", null)
    logger.error(error)
    onboarding.markStepAttention("inventory")
    setFeedback("inventory", feedbackForError(error, "The initial inventory load could not be queued."), "danger")
  } finally {
    busy.inventoryImport = false
  }
}

async function saveOrderSetup() {
  if(!orderSetupDirty.value || initialLoadRunBlocked("orders", orderInitialLoad.value.run.status) ||
    busy.orders || busy.orderImport || initialLoadRefreshBusy.orders) {return}

  orderValidationAttempted.value = true
  if(!canConfigureOrders.value) {
    if(!orderDateRangeValid.value) {
      setFeedback("orders", translate("Correct the order import date range before saving."), "danger")
    }

    return
  }

  const setup = captureOrderSetup()
  busy.orders = true
  feedback.orders = null
  try {
    await productStoreData.saveProductStoreShopifyOrderDates({
      shopId: setup.shopId,
      historyStartDate: setup.historyStartDate,
      launchDate: setup.launchDate
    })
    recordOrderLandmarkDates({
      historyLastSyncDate: setup.historyStartDate,
      launchDate: setup.launchDate
    })

    const jobResponse = await productStoreData.setupProductStoreShopifyOrderImport({
      productStoreId: setup.productStoreId,
      shopId: setup.shopId,
      // Activates the LIVE order feed only; the history job stays on demand. Left paused, the feed
      // never ran and a finished setup imported no orders at all. What holds orders back from live
      // fulfillment is the launch date the operator set, not this flag — the same reason the Products
      // step activates its own sync here.
      activateJobs: true,
      windowDays: 7
    })
    if(responseFailed(jobResponse)) {throw jobResponse?.data || jobResponse}

    savedSetupSnapshots.orders = setup.snapshot
    onboarding.setRunRequest("orders", null)
    onboarding.markStepInProgress("orders")
    setFeedback("orders", translate("Order import dates and batch jobs were saved."), "success")
  } catch (error: any) {
    logger.error(error)
    onboarding.markStepAttention("orders")
    const fallback = Array.isArray(error?.savedSystemPropertyIds) && error.savedSystemPropertyIds.length
      ? "The order dates were only partly saved. Review them before retrying."
      : "Failed to save order import setup."
    setFeedback("orders", feedbackForError(error, fallback), "danger")
  } finally {
    busy.orders = false
  }
}

async function loadOrderHistory() {
  if(!canLoadOrders.value || initialLoadRunBlocked("orders", orderInitialLoad.value.run.status) ||
    busy.orders || busy.orderImport || initialLoadRefreshBusy.orders) {return}

  const setup = captureOrderSetup()
  const savedSnapshot = savedSetupSnapshots.orders
  busy.orderImport = true
  feedback.orders = null
  beginInitialLoadRequest("orders", setup.shopId, setup.snapshot)
  try {
    const response = await productStoreData.runProductStoreShopifyOrderHistoryImport({
      shopId: setup.shopId,
      fromDate: setup.historyStartDate,
      launchDate: setup.launchDate,
      windowDays: 7
    })
    if(responseFailed(response)) {throw response?.data || response}
    acceptInitialLoadRequest("orders", response)
    if(savedSetupSnapshots.orders !== savedSnapshot || captureOrderSetup().snapshot !== savedSnapshot) {return}

    onboarding.markStepInProgress("orders")
    setFeedback("orders", translate("The initial order history load was queued. This step stays in progress until the import finishes successfully."), "medium")
  } catch (error: any) {
    onboarding.setRunRequest("orders", null)
    logger.error(error)
    onboarding.markStepAttention("orders")
    setFeedback("orders", feedbackForError(error, "The initial order history load could not be queued."), "danger")
  } finally {
    busy.orderImport = false
  }
}

function initialLoadConfiguration(kind: OnboardingInitialLoadKind) {
  if(kind === "products") {return productSyncConfiguration.value}
  if(kind === "inventory") {return inventorySyncConfiguration.value}

  return orderSyncConfiguration.value
}

function reconcileInitialLoadStep(kind: OnboardingInitialLoadKind, snapshot: OnboardingInitialLoadSnapshot) {
  const status = snapshot.run.status
  const configured = initialLoadConfiguration(kind).status === "configured"
  const matchesRequest = initialLoadMatchesRequest(kind, snapshot)

  if(kind === "products" && hasFinishedMdmLog.value) {
    if(configured || (productPreferencesPersisted.value && onboarding.draft.productIdentifierEnumId)) {
      onboarding.markStepComplete("products")
    } else {
      onboarding.markStepAttention("products")
    }

    return
  }

  if(status === "completed" && configured && matchesRequest) {
    onboarding.markStepComplete(kind)

    return
  }
  if(status === "error" || status === "cancelled" ||
    (snapshot.hydrated && !!(snapshot.details.systemMessageId || snapshot.details.jobRunId) &&
      (status === "unknown" || status === "unavailable"))) {
    onboarding.markStepAttention(kind)

    return
  }
  if(["pending", "queued", "sent", "running", "importing"].includes(status)) {
    if(kind === "products" && hasFinishedMdmLog.value) {
      if(productPreferencesPersisted.value && onboarding.draft.productIdentifierEnumId) {
        onboarding.markStepComplete("products")
      } else {
        onboarding.markStepAttention("products")
      }

      return
    }
    onboarding.markStepInProgress(kind)

    return
  }
  if(status === "completed" && (!configured || !matchesRequest)) {
    if(!configured) {
      onboarding.markStepAttention(kind)
    } else if(onboarding.stepStatuses[kind] === "complete") {
      onboarding.markStepInProgress(kind)
    }
    if(configured && !matchesRequest && !onboarding.runRequests[kind]) {
      setFeedback(
        kind,
        translate("The completed run could not be tied to this saved setup. Run the initial load again to validate it."),
        "warning"
      )
    }

    return
  }
  if(snapshot.hydrated && status === "not-started" && onboarding.stepStatuses[kind] === "complete") {
    onboarding.markStepAttention(kind)
  }
}

async function refreshInitialLoadStatus(kind: OnboardingInitialLoadKind) {
  const savingOrRunning = kind === "products"
    ? busy.products || busy.productImport
    : kind === "inventory"
      ? busy.inventory || busy.inventoryImport
      : busy.orders || busy.orderImport
  if(initialLoadRefreshBusy[kind] || savingOrRunning) {return}

  initialLoadRefreshBusy[kind] = true
  feedback[kind] = null
  try {
    const configurationRefreshes: Promise<unknown>[] = []
    if(selectedProductStoreId.value) {
      configurationRefreshes.push(
        productStoreData.fetchProductStoreDetails(selectedProductStoreId.value),
        productStoreData.fetchCurrentStoreSettings(selectedProductStoreId.value)
      )
    }
    if(kind === "inventory") {configurationRefreshes.push(refreshLocationMappings())}
    if(kind === "orders") {configurationRefreshes.push(loadOrderLandmarkDates())}

    await Promise.all([
      initialLoadStatus.refresh(),
      selectedProductStoreId.value
        ? productStoreData.fetchProductStoreShopifyJobStatus(selectedProductStoreId.value)
        : Promise.resolve(null),
      ...configurationRefreshes
    ])
    if((productStoreData.fetchStatus?.productStoreDetails === "error") ||
      (productStoreData.fetchStatus?.currentStoreSettings === "error") ||
      (kind === "inventory" && locationMappingFetchStatus.value === "error") ||
      (kind === "orders" && orderLandmarkDates.value.status === "error")) {
      throw new Error(translate("Configuration status could not be loaded. Refresh to try again."))
    }
    reconcileShopifyLink()
    reconcileSavedSetupSnapshots()
    reconcileSetupFacts()
    const snapshot = kind === "products"
      ? productInitialLoad.value
      : kind === "inventory"
        ? inventoryInitialLoad.value
        : orderInitialLoad.value
    reconcileInitialLoadStep(kind, snapshot)
    setFeedback(kind, translate("Sync status refreshed."), "medium")
  } catch (error: any) {
    logger.error(error)
    setFeedback(kind, feedbackForError(error, "Failed to refresh sync status."), "danger")
  } finally {
    initialLoadRefreshBusy[kind] = false
  }
}

function openInitialLoadDetails(
  kind: OnboardingInitialLoadKind,
  snapshot: OnboardingInitialLoadSnapshot
) {
  if(!snapshot.details.route) {return}
  const request = onboarding.runRequests[kind]
  const matchesRequest = !!request && initialLoadMatchesRequest(kind, snapshot)
  const systemMessageId = request
    ? request.systemMessageId || (matchesRequest ? snapshot.details.systemMessageId : "")
    : snapshot.details.systemMessageId
  const jobRunId = request
    ? request.jobRunId || (matchesRequest ? snapshot.details.jobRunId : "")
    : snapshot.details.jobRunId
  const query: Record<string, string> = { returnTo: route.fullPath }
  if(systemMessageId) {query.systemMessageId = systemMessageId}
  if(jobRunId) {query.jobRunId = jobRunId}

  router.push({
    path: snapshot.details.route,
    query
  })
}

/**
 * The warning shown when a shop this wizard had linked is no longer assigned to the store.
 *
 * Named because `reconcileShopifyLink` has to recognise its OWN warning to withdraw it. The check
 * runs on every status refresh and can see an empty assigned-shop list for a tick while the shop
 * cache is still filling, so it would post the warning and then verify the link on the next pass —
 * leaving "the previously linked shop is no longer assigned" sitting under a row that said the shop
 * was linked and complete.
 */
function staleShopifyLinkMessage() {
  return translate("The previously linked Shopify shop is no longer assigned to this Product Store. Select an unassigned shop to continue.")
}

function hasCurrentShopifyEvidence(statusOverride?: any) {
  const status = statusOverride === undefined
    ? productStoreData.currentShopifyJobStatus
    : statusOverride
  const statusIsForSelectedStore = String(status?.productStoreId || "") === String(selectedProductStoreId.value || "")

  return Boolean(statusIsForSelectedStore && Array.isArray(status.linkedShops)) || Boolean(shopifyShopsHydrated.value)
}

function reconcileShopifyLink(statusOverride?: any, expectedShopId = "") {
  if(!selectedProductStoreId.value) {return null}

  const assignedShops = assignedShopifyShops(statusOverride)
  const persistedShopId = String(onboarding.draft.linkedShopifyShopId || "")
  const preferredShopId = expectedShopId || persistedShopId
  const linkedShop = assignedShops.find((shop: any) => String(shop.shopId) === preferredShopId) ||
    (expectedShopId ? null : assignedShops[0])

  if(linkedShop?.shopId) {
    const verifiedShopId = String(linkedShop.shopId)
    if(persistedShopId && persistedShopId !== verifiedShopId) {
      onboarding.setRunRequest("products", null)
      onboarding.setRunRequest("inventory", null)
      onboarding.setRunRequest("orders", null)
    }
    if(persistedShopId !== verifiedShopId) {
      onboarding.updateDraftField("linkedShopifyShopId", verifiedShopId)
    }
    if(String(onboarding.draft.selectedShopifyShopId || "") !== verifiedShopId) {
      onboarding.updateDraftField("selectedShopifyShopId", verifiedShopId)
    }
    onboarding.markStepComplete("shopify")
    // A verified link makes any earlier stale-link warning obsolete. Only that message is cleared:
    // the caller sets its own success text after this returns, and other steps' feedback is theirs.
    if(feedback.shopify?.text === staleShopifyLinkMessage()) {feedback.shopify = null}

    return linkedShop
  }

  if(!hasCurrentShopifyEvidence(statusOverride)) {return null}

  if(onboarding.stepStatuses.locations === "complete") {
    onboarding.markStepAttention("locations")
  }

  const staleShopId = expectedShopId || persistedShopId
  if(staleShopId) {
    onboarding.setRunRequest("products", null)
    onboarding.setRunRequest("inventory", null)
    onboarding.setRunRequest("orders", null)
  }
  if(persistedShopId) {onboarding.updateDraftField("linkedShopifyShopId", "")}
  if(staleShopId && String(onboarding.draft.selectedShopifyShopId || "") === staleShopId) {
    onboarding.updateDraftField("selectedShopifyShopId", "")
  }
  if(staleShopId || onboarding.stepStatuses.shopify === "complete") {
    onboarding.markStepAttention("shopify")
    setFeedback("shopify", staleShopifyLinkMessage(), "warning")
  }

  return null
}

async function refreshShopifyStatus(expectedShopId = "") {
  if(!selectedProductStoreId.value) {return null}
  const status = await productStoreData.fetchProductStoreShopifyJobStatus(selectedProductStoreId.value)
  const linkedShop = reconcileShopifyLink(status, expectedShopId)
  if(expectedShopId && !linkedShop) {
    throw new Error("The Shopify shop association could not be verified. Refresh the available shops and try again.")
  }

  return status
}

const STORE_DRAFT_FIELDS: Array<keyof ProductStoreOnboardingDraft> = [
  "storeName",
  "productStoreId",
  "defaultCurrencyUomId",
  "locale",
  "timezone",
  "autoApproveOrder",
  "orderNumberPrefix",
  "saveBillingInformation"
]

function hydrateDraftFromStore(expectedProductStoreId: string) {
  const store = productStoreData.current
  if(String(store?.productStoreId || "") !== expectedProductStoreId) {return false}

  const values: Partial<ProductStoreOnboardingDraft> = {
    storeName: store.storeName,
    productStoreId: store.productStoreId,
    defaultCurrencyUomId: store.defaultCurrencyUomId,
    locale: store.defaultLocaleString,
    timezone: store.defaultTimeZoneString,
    autoApproveOrder: store.autoApproveOrder,
    orderNumberPrefix: store.orderNumberPrefix,
    reserveInventory: store.reserveInventory,
    productIdentifierEnumId: store.productIdentifierEnumId,
    saveBillingInformation: productStoreData.currentStoreSettings?.SAVE_BILL_TO_INF?.settingValue,
    showSystemicInventory: productStoreData.currentStoreSettings?.INV_CNT_VIEW_QOH?.settingValue
  }
  // These fields are rendered with useful defaults for a brand-new store. Existing-store
  // hydration must overwrite those defaults even when the backend value is absent; otherwise an
  // incomplete persisted record appears complete without ever having saved the displayed value.
  for(const field of STORE_DRAFT_FIELDS) {
    const value = values[field]
    if(field === "timezone" && (value === undefined || value === null || value === "")) {
      if(!onboarding.draft.timezone) {
        onboarding.updateDraftField("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York")
      }
    } else {
      onboarding.updateDraftField(field, value === undefined || value === null ? "" : String(value))
    }
  }
  for(const field of ["reserveInventory", "productIdentifierEnumId", "showSystemicInventory"] as const) {
    const value = values[field]
    if(value !== undefined && value !== null && value !== "") {
      onboarding.updateDraftField(field, String(value))
    }
  }

  onboarding.updateDraftField("primaryProductIdentification", "")
  onboarding.updateDraftField("secondaryProductIdentification", "")
  const preferences = persistedProductPreferences()
  if(preferences) {
    onboarding.updateDraftField("primaryProductIdentification", preferences.primaryId)
    onboarding.updateDraftField("secondaryProductIdentification", preferences.secondaryId)
  }

  return true
}

function persistedStoreMatches(expected?: ReturnType<typeof captureStoreSetup>) {
  const store = productStoreData.current
  const billingValue = String(productStoreData.currentStoreSettings?.SAVE_BILL_TO_INF?.settingValue || "")
  const persisted = {
    productStoreId: String(store?.productStoreId || "").trim(),
    storeName: String(store?.storeName || "").trim(),
    defaultCurrencyUomId: String(store?.defaultCurrencyUomId || "").trim(),
    locale: String(store?.defaultLocaleString || "").trim(),
    timezone: String(store?.defaultTimeZoneString || "").trim(),
    autoApproveOrder: String(store?.autoApproveOrder || "").trim(),
    orderNumberPrefix: String(store?.orderNumberPrefix || "").trim(),
    saveBillingInformation: billingValue
  }
  const hasRequiredPersistedValues = persisted.productStoreId === String(selectedProductStoreId.value || "") &&
    !!persisted.storeName &&
    !!persisted.defaultCurrencyUomId &&
    LOCALE_PATTERN.test(persisted.locale) &&
    !!persisted.timezone &&
    (persisted.autoApproveOrder === "Y" || persisted.autoApproveOrder === "N") &&
    !!persisted.orderNumberPrefix &&
    (persisted.saveBillingInformation === "Y" || persisted.saveBillingInformation === "N")

  if(!hasRequiredPersistedValues) {return false}

  const displayed = expected || captureStoreSetup()

  return Object.entries(persisted).every(([field, value]) =>
    value === displayed[field as keyof typeof displayed])
}

function jobReady(key: string) {
  return productStoreData.currentShopifyJobStatus?.jobs?.find((job: any) => job.key === key)?.ready === true
}

function reconcileRequiredJobs(
  stepId: "products" | "inventory" | "orders",
  requiredJobKeys: string[]
) {
  // Job definitions prove that a setup is runnable, not that an initial import succeeded.
  const configured = requiredJobKeys.every(jobReady)
  const status = onboarding.stepStatuses[stepId]
  if(configured) {
    if(stepId === "products" && hasFinishedMdmLog.value) {
      if(productPreferencesPersisted.value && onboarding.draft.productIdentifierEnumId) {
        onboarding.markStepComplete("products")
      }

      return
    }
    if(status === "not-started") {
      onboarding.markStepInProgress(stepId)
    }

    return
  }

  if(status !== "not-started") {
    onboarding.markStepAttention(stepId)
  }
}

function resetSavedSetupSnapshots() {
  savedSetupSnapshots.products = null
  savedSetupSnapshots.inventory = null
  savedSetupSnapshots.orders = null
}

function reconcileSavedSetupSnapshots() {
  const currentStoreMatches = String(productStoreData.current?.productStoreId || "") ===
    String(selectedProductStoreId.value || "")
  const jobStatusMatches = String(productStoreData.currentShopifyJobStatus?.productStoreId || "") ===
    String(selectedProductStoreId.value || "")

  savedSetupSnapshots.products = currentStoreMatches && jobStatusMatches &&
    productPreferencesPersisted.value && jobReady("productSync") &&
    jobReady("productBulkSend") && jobReady("productBulkPoll")
    ? captureProductSetup().snapshot
    : null
  savedSetupSnapshots.inventory = currentStoreMatches && jobStatusMatches &&
    inventoryPreferencesPersisted.value && jobReady("inventoryReset")
    ? captureInventorySetup().snapshot
    : null
  savedSetupSnapshots.orders = currentStoreMatches && jobStatusMatches &&
    !!orderLandmarkDates.value.historyLastSyncDate && !!orderLandmarkDates.value.launchDate &&
    jobReady("orderImport") && jobReady("orderHistory")
    ? captureOrderSetup().snapshot
    : null
}

function reconcileSetupFacts() {
  if(persistedStoreMatches()) {
    onboarding.markStepComplete("name")
  } else if(selectedProductStoreId.value) {
    onboarding.markStepAttention("name")
  }
  reconcileShopifyLink()
  if(productStoreData.fetchStatus?.facilities === "success") {
    if(facilityCount.value) {
      onboarding.markStepComplete("facilities")
    } else if(onboarding.stepStatuses.facilities !== "not-started") {
      onboarding.markStepAttention("facilities")
    }
  }
  if(locationMappingFetchStatus.value === "success") {
    if(mappedShopifyLocationCount.value) {
      onboarding.markStepComplete("locations")
    } else if(onboarding.stepStatuses.locations === "complete") {
      onboarding.markStepAttention("locations")
    }
  }

  if(productStoreData.fetchStatus?.shopifyJobStatus === "success") {
    reconcileRequiredJobs("products", ["productSync", "productBulkSend", "productBulkPoll"])
    reconcileRequiredJobs("inventory", ["inventoryReset"])
    reconcileRequiredJobs("orders", ["orderImport", "orderHistory"])
  }

  if(hasFinishedMdmLog.value) {
    if(productPreferencesPersisted.value && onboarding.draft.productIdentifierEnumId) {
      onboarding.markStepComplete("products")
    } else if(onboarding.stepStatuses.products === "in-progress") {
      onboarding.markStepAttention("products")
    }
  }
}

let setupLoadGeneration = 0
let selectedStoreLoadQueue: Promise<unknown> = Promise.resolve()

function currentSetupLoadMatches(generation: number, productStoreId: string) {
  return generation === setupLoadGeneration &&
    String(selectedProductStoreId.value || "") === productStoreId
}

function loadSelectedProductStore(productStoreId: string, loadGeneration?: number) {
  const requestedProductStoreId = String(productStoreId || "").trim()
  const generation = loadGeneration ?? ++setupLoadGeneration
  if(!requestedProductStoreId) {return Promise.resolve(false)}

  // The composable owns one shared `current*` bucket. Serialize route loads so an older request
  // cannot finish after a newer one and overwrite that bucket; the generation check skips queued
  // work that is already obsolete before it starts.
  const load = selectedStoreLoadQueue.catch(() => undefined).then(async () => {
    if(!currentSetupLoadMatches(generation, requestedProductStoreId)) {return false}

    resetSavedSetupSnapshots()
    await Promise.allSettled([
      productStoreData.fetchProductStoreDetails(requestedProductStoreId),
      productStoreData.fetchCurrentStoreSettings(requestedProductStoreId),
      productStoreData.fetchProductStoreFacilities(requestedProductStoreId),
      productStoreData.fetchProductStoreShopifyJobStatus(requestedProductStoreId)
    ])
    if(!currentSetupLoadMatches(generation, requestedProductStoreId) ||
      !hydrateDraftFromStore(requestedProductStoreId)) {return false}

    await loadOrderLandmarkDates()
    if(!currentSetupLoadMatches(generation, requestedProductStoreId) ||
      String(productStoreData.current?.productStoreId || "") !== requestedProductStoreId) {return false}

    if(orderLandmarkDates.value.historyLastSyncDate) {
      onboarding.updateDraftField("orderHistoryStartDate", orderLandmarkDates.value.historyLastSyncDate.slice(0, 10))
    }
    if(orderLandmarkDates.value.launchDate) {
      onboarding.updateDraftField("orderLaunchDate", orderLandmarkDates.value.launchDate.slice(0, 10))
    }
    reconcileSavedSetupSnapshots()
    await refreshLocationMappings()
    if(!currentSetupLoadMatches(generation, requestedProductStoreId) ||
      String(productStoreData.current?.productStoreId || "") !== requestedProductStoreId) {return false}

    reconcileSetupFacts()
    void loadShopifyProductCount()
    void loadGoodIdentificationTypes()
    void fetchSampleProducts()

    return true
  })
  selectedStoreLoadQueue = load.then(() => undefined, () => undefined)

  return load
}

async function initialiseSetup() {
  const requestedProductStoreId = String(props.productStoreId || "").trim()
  const generation = ++setupLoadGeneration
  if(requestedProductStoreId) {onboarding.initializeForProductStore(requestedProductStoreId)}

  if(!onboarding.draft.timezone) {
    onboarding.updateDraftField("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone)
  }
  if(!onboarding.draft.orderHistoryStartDate) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    onboarding.updateDraftField("orderHistoryStartDate", dateInputValue(startDate))
  }
  if(!onboarding.draft.orderLaunchDate) {
    onboarding.updateDraftField("orderLaunchDate", dateInputValue(new Date()))
  }

  try {
    const [loadedTimeZones] = await Promise.all([
      loadTimeZones(),
      loadOrganizationPartyId(),
      productStoreData.fetchProductStores()
    ])
    if(generation !== setupLoadGeneration ||
      String(props.productStoreId || "").trim() !== requestedProductStoreId) {return}

    timeZoneOptions.value = loadedTimeZones || []
    if(!timeZoneOptions.value.some((timeZone: any) => timeZone.id === onboarding.draft.timezone)) {
      timeZoneOptions.value = [{ id: onboarding.draft.timezone, label: onboarding.draft.timezone }, ...timeZoneOptions.value]
    }
    if(organizationPartyId.value) {await productStoreData.fetchCompany()}

    if(requestedProductStoreId || selectedProductStoreId.value) {
      await loadSelectedProductStore(requestedProductStoreId || selectedProductStoreId.value, generation)
    }
  } catch (error: any) {
    if(generation !== setupLoadGeneration ||
      String(props.productStoreId || "").trim() !== requestedProductStoreId) {return}
    logger.error(error)
    setFeedback(onboarding.currentStepId, feedbackForError(error, "Some setup data could not be loaded."), "danger")
  }
}

async function finishSetup() {
  if(!isReadyToFinish.value || !selectedProductStoreId.value) {return}
  onboarding.markStepComplete("readiness")
  const productStoreId = selectedProductStoreId.value
  await router.replace(`/product-store-details/${encodeURIComponent(productStoreId)}`)
  onboarding.startNewSetup()
}

watch(
  [selectedProductStoreId, cachedShopifyShops, shopifyShopsHydrated, () => productStoreData.currentShopifyJobStatus],
  () => reconcileShopifyLink(),
  { deep: true }
)

watch(() => props.productStoreId, (productStoreId, previousProductStoreId) => {
  if(productStoreId === previousProductStoreId) {return}
  void initialiseSetup()
})

watch(
  [
    productInitialLoad,
    inventoryInitialLoad,
    orderInitialLoad,
    productSyncConfiguration,
    inventorySyncConfiguration,
    orderSyncConfiguration
  ],
  ([products, inventory, orders]) => {
    reconcileInitialLoadStep("products", products)
    reconcileInitialLoadStep("inventory", inventory)
    reconcileInitialLoadStep("orders", orders)
  },
  { deep: true, immediate: true }
)

/**
 * The remote is a cache join, so it resolves after the step is already on screen. Without this the
 * count stayed "Unavailable" for the rest of the visit: the one load attempt ran while `remoteId`
 * was still empty and nothing asked again.
 */
watch(() => shopifySyncContext.remoteId.value, (remoteId) => {
  if(remoteId && currentStep.value?.id === "products" && shopifyProductCount.value === undefined) {
    void loadShopifyProductCount()
  }
})

watch(currentStep, (step) => {
  if(step?.id === "products") {
    if(shopifyProductCount.value === undefined) {
      void loadShopifyProductCount()
    }
    if(productIdentificationOptions.value.length <= STATIC_PRODUCT_IDENTIFIER_OPTIONS.length) {
      void loadGoodIdentificationTypes()
    }
    if(hasFinishedMdmLog.value && !sampleProducts.value.length) {
      void fetchSampleProducts()
    }
  }
})

watch(hasFinishedMdmLog, (finished) => {
  if(finished && !sampleProducts.value.length) {
    void fetchSampleProducts()
  }
})

onIonViewWillEnter(() => {
  initialLoadClock.value = Date.now()
  initialLoadClockTimer ||= setInterval(() => { initialLoadClock.value = Date.now() }, 30_000)
  void initialLoadStatus.activate().catch((error) => logger.error("Import [Onboarding] - Failed to monitor imports", error))

  return initialiseSetup()
})
onIonViewDidLeave(() => {
  initialLoadStatus.deactivate()
  if(initialLoadClockTimer) {
    clearInterval(initialLoadClockTimer)
    initialLoadClockTimer = null
  }
})
</script>

<style scoped>
.onboarding-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 22rem) minmax(0, 44rem);
  align-items: start;
  justify-content: center;
  gap: var(--spacer-lg);
  padding: var(--spacer-lg);
}

.desktop-steps,
.onboarding-task {
  min-width: 0;
}

.onboarding-task ion-card {
  margin: 0;
}

.mobile-step-picker {
  display: none;
}

.mobile-progress-count {
  flex: 0 0 auto;
  margin-inline-start: var(--spacer-sm);
  font-variant-numeric: tabular-nums;
}

.step-heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacer-sm);
}

.step-heading-row ion-card-title {
  margin: 0;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-sm);
}

.step-actions,
.wizard-footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacer-xs);
}

.step-feedback {
  display: block;
}

.wizard-footer {
  justify-content: space-between;
  border-top: var(--border-medium);
  padding: var(--spacer-sm);
}

@media (max-width: 900px) {
  .onboarding-layout {
    display: block;
    padding: var(--spacer-sm);
  }

  .desktop-steps {
    display: none;
  }

  .mobile-step-picker {
    display: block;
    margin-bottom: var(--spacer-sm);
  }

  .step-heading-row {
    align-items: center;
  }
}
</style>
