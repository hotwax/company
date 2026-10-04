<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="`/carriers/${encodeURIComponent(partyId)}`" />
        <ion-title>{{ translate("Set up {carrier}", { carrier: setup.carrier.value?.groupName || partyId }) }}</ion-title>
        <ion-progress-bar :value="steps.length > 1 ? stepIndex / (steps.length - 1) : 0" :aria-label="translate('Setup progress')" />
      </ion-toolbar>
    </ion-header>
    <ion-content ref="contentRef" :inert="setup.busy.value || checking">
      <ion-spinner v-if="!setup.hydrated.value" class="ion-margin" />
      <main v-else class="onboarding-layout">
        <aside class="desktop-steps" :aria-label="translate('Setup progress')">
          <ion-list lines="none">
            <ion-list-header><ion-label>{{ translate("Progress") }}<p>{{ progressLabel }}</p></ion-label></ion-list-header>
          </ion-list>
          <OnboardingStepList
            :groups="stepGroups"
            :steps="navigationSteps"
            :current-step-id="step"
            :step-statuses="stepStatuses"
            :disabled-step-ids="disabledStepIds"
            @select-step="selectStep"
          />
        </aside>
        <section class="onboarding-task">
          <ion-item class="mobile-step-picker" lines="none">
            <ion-select :label="translate('Setup step')" label-placement="stacked" interface="popover" :value="step" @ion-change="selectStep($event.detail.value)">
              <ion-select-option v-for="(id, index) in steps" :key="id" :value="id" :disabled="disabledStepIds.includes(id)">
                {{ index + 1 }}. {{ translate(SETUP_LABELS[id]) }}
              </ion-select-option>
            </ion-select>
            <ion-note slot="end">
              {{ stepIndex + 1 }} / {{ steps.length }}
            </ion-note>
          </ion-item>
          <ion-card>
            <ion-card-header>
              <ion-card-title ref="headingRef" tabindex="-1">
                {{ translate(SETUP_LABELS[step]) }}
              </ion-card-title>
            </ion-card-header>
            <ion-item v-if="!setup.ready.value" lines="none" color="warning">
              <ion-label class="ion-text-wrap">
                {{ translate("Some setup data needs to be refreshed before you can save changes.") }}
              </ion-label>
              <ion-button slot="end" :disabled="setup.busy.value" @click="setup.refresh">
                {{ translate("Refresh") }}
              </ion-button>
            </ion-item>
            <ion-card-content v-if="step === 'usage'">
              <p>{{ translate("Choose what HotWax should do. We will only show the setup steps you need.") }}</p>
              <ion-radio-group v-model="usage">
                <ion-item>
                  <ion-radio value="labels" justify="space-between">
                    <ion-label class="ion-text-wrap">
                      {{ translate("Generate shipping labels in HotWax") }}<p>{{ translate("Connect a carrier account, choose services, and enable fulfillment facilities.") }}</p>
                    </ion-label>
                  </ion-radio>
                </ion-item>
                <ion-item>
                  <ion-radio value="external" justify="space-between">
                    <ion-label class="ion-text-wrap">
                      {{ translate("Map methods for external fulfillment") }}<p>{{ translate("A 3PL or another system creates labels. HotWax only needs shipping method mappings.") }}</p>
                    </ion-label>
                  </ion-radio>
                </ion-item>
              </ion-radio-group>
              <p v-if="setup.configuredShipmentMethods.value.length">
                {{ translate("Existing shipping methods are available to reuse. This wizard does not remove existing configuration.") }}
              </p>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'prepare'">
              <p v-if="partyId !== 'FEDEX'">
                {{ translate("The account walkthrough below is for FedEx. For other carriers, prepare provider credentials and use the advanced connection settings; methods and store setup follow the same flow.") }}
              </p>
              <p>{{ translate("HotWax sends shipment requests through UniGate. Your carrier account pays for shipments; API credentials let UniGate access that account.") }}</p>
              <ion-select v-model="environment" interface="popover" fill="outline" label-placement="stacked" :label="translate('Environment')" class="ion-margin-bottom">
                <ion-select-option value="test">
                  {{ translate("Test with sandbox credentials") }}
                </ion-select-option><ion-select-option value="live">
                  {{ translate("Live shipping") }}
                </ion-select-option>
              </ion-select>
              <ion-select v-model="origin" interface="popover" fill="outline" label-placement="stacked" :label="translate('Ship-from country')">
                <ion-select-option value="US">
                  {{ translate("United States") }}
                </ion-select-option><ion-select-option value="CA">
                  {{ translate("Canada") }}
                </ion-select-option>
              </ion-select>
              <p>{{ translate("Choose where parcels leave from, not where you sell. Service availability depends on origin, destination, and your account.") }}</p>
              <ion-list>
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    {{ translate("1. Get your shipping account number") }}<p>{{ translate("For tests, use the test account listed in your FedEx project. For live shipping, use the approved shipping account.") }}</p>
                  </ion-label>
                </ion-item>
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    {{ translate("2. Prepare your FedEx API project") }}<p>{{ translate("Add the Ship API and Rates and Transit Times API. Copy the API Key and Secret Key from the same test or production environment.") }}</p>
                  </ion-label>
                </ion-item>
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    {{ translate("3. Prepare your fulfillment locations") }}<p>{{ translate("Each location needs a complete ship-from address and contact details. Have your package, pickup, and printer preferences ready.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
              <ion-button v-if="partyId === 'FEDEX'" fill="clear" href="https://developer.fedex.com/api/en-us/get-started.html" target="_blank" rel="noopener noreferrer">
                {{ translate("Open FedEx developer guide") }}
              </ion-button>
              <ion-item lines="none" button :detail="false" @click="crossBorder = !crossBorder">
                <ion-checkbox slot="start" v-model="crossBorder" :aria-label="translate('We ship across the US–Canada border')" @click.stop /><ion-label>{{ translate("We ship across the US–Canada border") }}</ion-label>
              </ion-item>
              <p v-if="crossBorder">
                {{ translate("International shipments also need customs data, including commodity descriptions, values, country of manufacture, and duties payment details. Confirm your order data and integration support these before shipping.") }}
              </p>
              <ion-note>{{ translate(environment === 'test' ? "Sandbox labels are for testing only. They do not establish live shipping readiness." : "Production access and any FedEx label approval must be completed before live shipping.") }}</ion-note>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'credentials'">
              <p>{{ translate("First check that the OMS can reach UniGate's carrier services. Then select saved credentials or add your FedEx project keys.") }}</p>
              <ion-button :disabled="checking || setup.busy.value" @click="checkConnection">
                <ion-spinner v-if="checking" />{{ translate("Check UniGate connection") }}
              </ion-button>
              <ion-button fill="clear" router-link="/unigate">
                {{ translate("Open UniGate setup") }}
              </ion-button>
              <p role="status">
                {{ translate(connectionMessage) }}
              </p>
              <template v-if="setup.credentialsLoaded.value">
                <ion-select v-model="authId" interface="popover" fill="outline" label-placement="stacked" :label="translate('Carrier credentials')" class="ion-margin-bottom">
                  <ion-select-option value="">
                    {{ translate("Add new credentials") }}
                  </ion-select-option>
                  <ion-select-option v-for="auth in environmentCredentials" :key="auth.id" :value="auth.id">
                    {{ auth.description }}
                  </ion-select-option>
                </ion-select>
                <template v-if="!authId && partyId === 'FEDEX'">
                  <ion-input v-model="credentialName" fill="outline" label-placement="stacked" :label="translate('Account nickname')" class="ion-margin-bottom" />
                  <ion-input v-model="apiKey" type="password" autocomplete="off" fill="outline" label-placement="stacked" :label="translate('FedEx API Key')" class="ion-margin-bottom" />
                  <ion-input v-model="secretKey" type="password" autocomplete="new-password" fill="outline" label-placement="stacked" :label="translate('FedEx Secret Key')" class="ion-margin-bottom" />
                  <ion-button :disabled="setup.busy.value || !apiKey.trim() || !secretKey.trim() || !credentialName.trim()" @click="saveCredential">
                    {{ translate("Save credentials") }}
                  </ion-button>
                </template>
                <ion-button v-else-if="!authId" fill="outline" router-link="/carriers/connections">
                  {{ translate("Manage carrier credentials") }}
                </ion-button>
              </template>
              <p>{{ translate("Saving keys does not test a FedEx shipment. You can prepare the remaining setup while connection issues are resolved.") }}</p>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'strategy'">
              <ion-radio-group v-model="strategy">
                <ion-item>
                  <ion-radio value="direct" justify="space-between">
                    <ion-label class="ion-text-wrap">
                      {{ translate("Use specific carrier services") }}<p>{{ translate("Map each Shopify shipping method to a service such as FedEx Priority Overnight.") }}</p>
                    </ion-label>
                  </ion-radio>
                </ion-item>
                <ion-item>
                  <ion-radio value="rate" justify="space-between">
                    <ion-label class="ion-text-wrap">
                      {{ translate("Let the OMS rate shop") }}<p>{{ translate("Map Shopify methods to delivery promises. The OMS compares eligible carrier services when generating a label.") }}</p>
                    </ion-label>
                  </ion-radio>
                </ion-item>
              </ion-radio-group>
              <p v-if="strategy === 'rate'">
                {{ translate("Rate shopping needs both delivery promises and real carrier services with service codes and delivery days. A connection check alone cannot verify rate shopping.") }}
              </p>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'methods'">
              <p>{{ translate(usage === 'external' ? "Select the OMS methods you want to map to your fulfillment partner. No carrier API credentials are required." : "Choose the services you want to offer. Importing adds their carrier service codes without replacing existing methods.") }}</p>
              <ion-list>
                <ion-item v-for="method in availableMethods" :key="method.shipmentMethodTypeId" button :detail="false" @click="toggleMethod(method.shipmentMethodTypeId, !selectedMethodIds.includes(method.shipmentMethodTypeId))">
                  <ion-checkbox slot="start" :aria-label="method.description" :checked="selectedMethodIds.includes(method.shipmentMethodTypeId)" @click.stop @ion-change="toggleMethod(method.shipmentMethodTypeId, $event.detail.checked)" />
                  <ion-label class="ion-text-wrap">
                    {{ translate(method.description || method.shipmentMethodTypeId) }}<p>{{ method.carrierServiceCode || method.shipmentMethodTypeId }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
              <template v-if="usage === 'labels'">
                <p>{{ translate("Confirm each service is available for your shipping lanes and account. Ground transit varies by destination; enter delivery days only after validating your lanes.") }}</p>
                <div v-for="method in selectedMethods" :key="method.shipmentMethodTypeId" class="ion-margin-bottom">
                  <ion-input v-model="serviceCodes[method.shipmentMethodTypeId]" fill="outline" label-placement="stacked" :label="translate('Service code for {method}', { method: method.description })" :disabled="!!existingMethod(method.shipmentMethodTypeId)?.carrierServiceCode" class="ion-margin-bottom" />
                  <ion-input v-if="strategy === 'rate'" v-model="deliveryDays[method.shipmentMethodTypeId]" type="number" min="1" step="1" fill="outline" label-placement="stacked" :label="translate('Delivery days for {method}', { method: method.description })" :disabled="hasExistingDays(method.shipmentMethodTypeId)" />
                </div>
              </template>
              <template v-if="usage === 'labels' && strategy === 'rate'">
                <h2>{{ translate("Delivery promises") }}</h2>
                <p>{{ translate("Promises are carrier-neutral: Next Day, Two Day, and Standard. Link the real services above to FedEx; Shopify orders map to these promises so the OMS can choose a carrier service.") }}</p>
                <div v-for="promise in promises" :key="promise.shipmentMethodTypeId" class="ion-margin-bottom">
                  <ion-item lines="none">
                    <ion-checkbox slot="start" :aria-label="promise.description" :checked="selectedPromiseIds.includes(promise.shipmentMethodTypeId)" @click.stop @ion-change="togglePromise(promise.shipmentMethodTypeId, $event.detail.checked)" /><ion-label>{{ translate(promise.description) }}</ion-label>
                  </ion-item>
                  <ion-input v-if="selectedPromiseIds.includes(promise.shipmentMethodTypeId)" v-model="promise.deliveryDays" type="number" min="1" step="1" fill="outline" label-placement="stacked" :label="translate('Promised delivery days')" />
                </div>
              </template>
              <ion-button fill="clear" :disabled="setup.busy.value" @click="openCustomMethod">
                {{ translate("Create a shipping method") }}
              </ion-button>
              <ion-button :disabled="!canSaveMethods" @click="saveMethods">
                {{ translate("Save selected methods") }}
              </ion-button>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'facilities'">
              <p>{{ translate("Choose the locations that will generate labels. Set up their accounts before enabling shipping methods for a Product Store.") }}</p>
              <ion-note v-if="!fulfillmentFacilities.length">
                {{ translate("No facilities currently use OMS fulfillment. Select locations below and enable OMS fulfillment to continue.") }}
              </ion-note>
              <ion-item lines="none">
                <ion-checkbox slot="start" v-model="enableFulfillment" :aria-label="translate('Enable OMS fulfillment')" @click.stop /><ion-label class="ion-text-wrap">
                  {{ translate("Enable OMS fulfillment for selected locations that need it") }}
                </ion-label>
              </ion-item>
              <ion-list>
                <ion-item v-for="facility in selectableFacilities" :key="facility.facilityId" button :detail="false" @click="toggleFacility(facility.facilityId, !facilityIds.includes(facility.facilityId))">
                  <ion-checkbox slot="start" :aria-label="facility.facilityName || facility.facilityId" :checked="facilityIds.includes(facility.facilityId)" @click.stop @ion-change="toggleFacility(facility.facilityId, $event.detail.checked)" />
                  <ion-label class="ion-text-wrap">
                    {{ facility.facilityName || facility.facilityId }}<p>{{ translate(setup.inGroup(facility.facilityId, 'OMS_FULFILLMENT') ? 'OMS fulfillment enabled' : 'OMS fulfillment not enabled') }}</p>
                  </ion-label>
                  <ion-button slot="end" fill="clear" :router-link="`/facility-details/${encodeURIComponent(facility.facilityId)}`" @click.stop>
                    {{ translate("Check address") }}
                  </ion-button>
                </ion-item>
              </ion-list>
              <ion-button v-if="!setup.facilities.value.length" fill="outline" router-link="/facilities/find">
                {{ translate("Open facilities") }}
              </ion-button>
              <ion-select v-model="accountStoreIds" interface="popover" multiple fill="outline" label-placement="stacked" :label="translate('Product Stores using these accounts')" class="ion-margin-bottom">
                <ion-select-option v-for="store in setup.productStores.value" :key="store.productStoreId" :value="store.productStoreId">
                  {{ store.storeName || store.productStoreId }}
                </ion-select-option>
              </ion-select>
              <p>{{ translate("Accounts are scoped to a Product Store and facility. You will choose the store's shipping methods in the next step. Existing facility accounts are preserved; manage them separately to change an account.") }}</p>
              <template v-if="partyId === 'FEDEX'">
                <ion-input v-model="accountNumber" type="password" autocomplete="off" fill="outline" label-placement="stacked" :label="translate('Default carrier account number')" class="ion-margin-bottom" />
                <ion-accordion-group>
                  <ion-accordion value="overrides">
                    <ion-item slot="header">
                      <ion-label>{{ translate("Different accounts at some facilities?") }}</ion-label>
                    </ion-item><div slot="content" class="ion-padding">
                      <ion-input v-for="id in facilityIds" :key="id" v-model="accountOverrides[id]" type="password" autocomplete="off" fill="outline" label-placement="stacked" :label="translate('Account override for {facility}', { facility: facilityName(id) })" class="ion-margin-bottom" />
                    </div>
                  </ion-accordion>
                </ion-accordion-group>
                <ion-select v-model="preferences.packagingType" interface="popover" fill="outline" label-placement="stacked" :label="translate('Packaging')" class="ion-margin-top">
                  <ion-select-option value="YOUR_PACKAGING">
                    {{ translate("Your own packaging") }}
                  </ion-select-option><ion-select-option value="FEDEX_ENVELOPE">
                    {{ translate("FedEx Envelope") }}
                  </ion-select-option>
                </ion-select>
                <ion-select v-model="preferences.dropoffType" interface="popover" fill="outline" label-placement="stacked" :label="translate('Pickup arrangement')" class="ion-margin-top">
                  <ion-select-option value="USE_SCHEDULED_PICKUP">
                    {{ translate("Use an existing scheduled pickup") }}
                  </ion-select-option><ion-select-option value="DROPOFF_AT_FEDEX_LOCATION">
                    {{ translate("Drop off at FedEx") }}
                  </ion-select-option>
                </ion-select>
                <ion-select v-model="preferences.labelImageType" interface="popover" fill="outline" label-placement="stacked" :label="translate('Label format')" class="ion-margin-top">
                  <ion-select-option value="PDF">
                    PDF
                  </ion-select-option><ion-select-option value="ZPLII">
                    ZPL II
                  </ion-select-option>
                </ion-select>
                <ion-select v-model="preferences.labelSize" interface="popover" :disabled="preferences.labelImageType === 'ZPLII'" fill="outline" label-placement="stacked" :label="translate('Label stock')" class="ion-margin-top">
                  <ion-select-option value="PAPER_4X6">
                    {{ translate("4 × 6 paper") }}
                  </ion-select-option><ion-select-option value="STOCK_4X6">
                    {{ translate("4 × 6 thermal") }}
                  </ion-select-option>
                </ion-select>
                <ion-select v-model="preferences.weightUomId" interface="popover" fill="outline" label-placement="stacked" :label="translate('Weight unit')" class="ion-margin-top">
                  <ion-select-option value="WT_lb">
                    {{ translate("Pounds") }}
                  </ion-select-option><ion-select-option value="WT_kg">
                    {{ translate("Kilograms") }}
                  </ion-select-option>
                </ion-select>
                <ion-item lines="none">
                  <ion-checkbox slot="start" v-model="automatic" :aria-label="translate('Enable automatic label generation')" @click.stop /><ion-label class="ion-text-wrap">
                    {{ translate("Enable automatic label generation for selected facilities") }}<p>{{ translate("This is a facility-wide setting and can affect other carriers. Leave unchecked to preserve current label timing.") }}</p>
                  </ion-label>
                </ion-item>
                <ion-button :disabled="!canSaveFacilities" @click="saveFacilities">
                  {{ translate("Save fulfillment facilities") }}
                </ion-button>
                <ion-button v-if="partyId === 'FEDEX'" :disabled="!canSaveAccounts" @click="saveAccounts">
                  {{ translate("Save facility accounts") }}
                </ion-button>
                <p v-if="!authId">
                  {{ translate("Facility membership can be saved now. Account setup remains pending until carrier credentials are connected.") }}
                </p>
                <ion-button fill="clear" router-link="/carriers/connections">
                  {{ translate("Manage existing accounts and billing") }}
                </ion-button>
              </template>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'stores'">
              <p>{{ translate("Enable your selected shipping methods for the Product Stores that should offer them.") }}</p>
              <ion-list>
                <ion-item v-for="store in setup.productStores.value" :key="store.productStoreId" button :detail="false" @click="toggleStore(store.productStoreId, !storeIds.includes(store.productStoreId))">
                  <ion-checkbox slot="start" :aria-label="store.storeName || store.productStoreId" :checked="storeIds.includes(store.productStoreId)" @click.stop @ion-change="toggleStore(store.productStoreId, $event.detail.checked)" /><ion-label>{{ store.storeName || store.productStoreId }}</ion-label>
                </ion-item>
              </ion-list>
              <p>{{ translate(usage === "labels" ? "Existing store methods stay unchanged. New label-generation methods require tracking. This does not activate UniGate shipping for a store by itself." : "Existing store methods stay unchanged.") }}</p>
              <p v-if="!completed.methods">
                {{ translate("Save your shipping methods before enabling them for a store.") }}
              </p>
              <ion-button :disabled="!setup.ready.value || setup.busy.value || !storeIds.length || !completed.methods" @click="saveStores">
                {{ translate("Enable selected methods") }}
              </ion-button>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'mappings'">
              <p>{{ translate(strategy === 'rate' && usage === 'labels' ? "Map the exact shipping name sent by Shopify to a delivery promise. The OMS selects the real carrier service during rate shopping." : "Map the exact shipping name sent by Shopify to the selected OMS shipping method.") }}</p>
              <ion-select v-model="shopId" interface="popover" fill="outline" label-placement="stacked" :label="translate('Shopify store')" class="ion-margin-bottom">
                <ion-select-option v-for="shop in selectedShops" :key="shop.shopId" :value="shop.shopId">
                  {{ shop.name || shop.shopId }}
                </ion-select-option>
              </ion-select>
              <p v-if="!selectedShops.length">
                {{ translate("No Shopify connection is linked to the selected Product Stores. You can finish this step later or configure your external system.") }}
              </p>
              <ion-input v-model="incomingMethod" fill="outline" label-placement="stacked" :label="translate('Exact Shopify shipping method name')" class="ion-margin-bottom" />
              <ion-select v-model="mappingMethodId" interface="popover" fill="outline" label-placement="stacked" :label="translate('OMS shipping method')" class="ion-margin-bottom">
                <ion-select-option v-for="method in mappingMethods" :key="method.shipmentMethodTypeId" :value="method.shipmentMethodTypeId">
                  {{ translate(method.description) }}
                </ion-select-option>
              </ion-select>
              <p v-if="existingMapping">
                {{ translate("This Shopify shipping name already has a mapping. Review it in Shopify settings before changing it.") }}
              </p>
              <p v-if="!completed.stores">
                {{ translate("Enable the selected methods for your store before adding Shopify mappings.") }}
              </p>
              <ion-button :disabled="!setup.ready.value || setup.busy.value || !shopId || !incomingMethod.trim() || !mappingMethodId || !!existingMapping || !completed.stores" @click="saveMapping">
                {{ translate("Add shipping method mapping") }}
              </ion-button>
              <ion-list>
                <ion-item v-for="mapping in visibleMappings" :key="`${mapping.shopId}:${mapping.shopifyShippingMethod}`">
                  <ion-label>{{ mapping.shopifyShippingMethod }}<p>{{ mapping.shopId }} → {{ mapping.carrierPartyId }} / {{ mapping.shipmentMethodTypeId }}</p></ion-label>
                </ion-item>
              </ion-list>
              <ion-button v-if="shopId" fill="clear" :router-link="`/shopify-connection-details/${encodeURIComponent(shopId)}/shipment-methods`">
                {{ translate("Manage Shopify mappings") }}
              </ion-button>
              <template v-if="usage === 'external'">
                <p>{{ translate("For a 3PL, use its integration's service codes and mapping settings. No universal 3PL mapping is created by this wizard.") }}</p><ion-button fill="clear" router-link="/netsuite/shipment-methods">
                  {{ translate("Open NetSuite shipping mappings") }}
                </ion-button>
              </template>
            </ion-card-content>

            <ion-card-content v-else-if="step === 'review'">
              <ion-list>
                <ion-item>
                  <ion-label>{{ translate("Shipping methods") }}</ion-label><ion-note slot="end">
                    {{ translate(completed.methods ? 'Saved' : 'Needs setup') }}
                  </ion-note>
                </ion-item>
                <ion-item v-if="usage === 'labels'">
                  <ion-label>{{ translate("Fulfillment facilities") }}</ion-label><ion-note slot="end">
                    {{ translate(completed.facilities ? 'Saved' : 'Needs setup') }}
                  </ion-note>
                </ion-item>
                <ion-item v-if="usage === 'labels'">
                  <ion-label>{{ translate("Facility accounts") }}</ion-label><ion-note slot="end">
                    {{ translate(accountsSaved ? 'Saved' : 'Needs setup') }}
                  </ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Product Store methods") }}</ion-label><ion-note slot="end">
                    {{ translate(completed.stores ? 'Saved' : 'Needs setup') }}
                  </ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>{{ translate("Incoming method mappings") }}</ion-label><ion-note slot="end">
                    {{ translate(visibleMappings.length ? 'Review mappings' : 'Needs setup') }}
                  </ion-note>
                </ion-item>
              </ion-list>
              <template v-if="usage === 'labels'">
                <h2>{{ translate("Label generation is not verified yet") }}</h2>
                <p>{{ translate("Confirm UniGate shipping is enabled for each Product Store. Then run a sandbox shipment from each facility using complete address, package, and order data. Check the returned service, price, tracking number, and printable label.") }}</p>
                <p v-if="strategy === 'rate'">
                  {{ translate("Ask your implementation team to verify the OMS rate-shopping service-code and delivery-day handling. This wizard prepares configuration; it cannot certify transit promises or the deployed shipping implementation.") }}
                </p>
                <p>{{ translate("Before going live, use production credentials and accounts, complete FedEx approval requirements, and verify a controlled live shipment. Test credentials must remain separate from live accounts.") }}</p>
                <ion-button :disabled="checking" @click="checkConnection">
                  {{ translate("Recheck UniGate connection") }}
                </ion-button>
                <p role="status">
                  {{ translate(connectionMessage) }}
                </p>
              </template>
              <ion-button :router-link="`/carriers/${encodeURIComponent(partyId)}`">
                {{ translate("Open carrier details") }}
              </ion-button>
            </ion-card-content>
            <ion-card-content v-if="setup.notice.value" role="status" aria-live="polite">
              {{ translate(setup.notice.value) }}
            </ion-card-content>
            <div class="wizard-footer">
              <ion-button fill="clear" :disabled="stepIndex === 0 || setup.busy.value || checking" @click="goTo(stepIndex - 1)">
                {{ translate("Back") }}
              </ion-button>
              <div class="step-actions">
                <ion-button v-if="['methods', 'facilities', 'stores'].includes(step) && !completed[step]" fill="clear" :disabled="setup.busy.value || checking" @click="goTo(stepIndex + 1)">
                  {{ translate("Skip for now") }}
                </ion-button>
                <ion-button v-if="stepIndex < steps.length - 1" :disabled="!canContinue" @click="goTo(stepIndex + 1)">
                  {{ translate(nextLabel) }}
                </ion-button>
              </div>
            </div>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonAccordion, IonAccordionGroup, IonBackButton, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonPage, IonProgressBar, IonRadio, IonRadioGroup, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar, modalController, onIonViewWillLeave } from "@ionic/vue";
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import CreateShipmentMethodModal from "@/components/carrier/CreateShipmentMethodModal.vue";
import OnboardingStepList from "@/components/product-store-onboarding/OnboardingStepList.vue";
import { useCarrierSetup } from "@/composables/useCarrierSetup";
import { useUnigateConnection } from "@/composables/useUnigateConnection";
import type { ProductStoreOnboardingStepStatus } from "@/config/productStoreOnboarding";
import { type CarrierUsage, SETUP_LABELS, SLA_METHODS, type ServiceStrategy, type SetupMethod, carrierSetupSteps, fedexMethodsForOrigin, positiveDeliveryDays } from "@/utils/carrierSetup";

const props = defineProps<{ partyId: string }>();
const setup = useCarrierSetup(props.partyId);
const connection = useUnigateConnection();
const contentRef = ref();
const headingRef = ref<HTMLElement>();
const usage = ref<CarrierUsage>("");
const strategy = ref<ServiceStrategy>("direct");
const stepIndex = ref(0);
const furthest = ref(0);
const steps = computed(() => carrierSetupSteps(usage.value));
const step = computed(() => steps.value[stepIndex.value] || "usage");
const completed = reactive<Record<string, boolean>>({});
const environment = ref<"test" | "live">("test");
const origin = ref("US");
const crossBorder = ref(false);
const checking = ref(false);
const connectionMessage = ref("Connection has not been checked.");
const authId = ref("");
const credentialId = ref(`FDX_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`);
const credentialName = ref("FedEx test account");
const apiKey = ref("");
const secretKey = ref("");
const environmentCredentials = computed(() => setup.credentials.value.filter(auth => props.partyId !== "FEDEX" || auth.baseUrl.replace(/\/$/, "") === (environment.value === "test" ? "https://apis-sandbox.fedex.com" : "https://apis.fedex.com")));
const selectedMethodIds = ref<string[]>([]);
const serviceCodes = reactive<Record<string, string>>({});
const deliveryDays = reactive<Record<string, string | number>>({});
const promises = ref<SetupMethod[]>(SLA_METHODS.map(row => ({ ...row })));
const selectedPromiseIds = ref<string[]>(["NEXT_DAY", "SECOND_DAY"]);
const availableMethods = computed<SetupMethod[]>(() => {
  const rows = usage.value === "external" ? setup.shipmentMethods.value : setup.configuredShipmentMethods.value;
  const existing = rows.map(row => ({ ...row, description: row.description || row.shipmentMethodTypeId }));

  return [...existing, ...(usage.value === "labels" && props.partyId === "FEDEX" ? fedexMethodsForOrigin(origin.value).filter(row => !existing.some(item => item.shipmentMethodTypeId === row.shipmentMethodTypeId)) : [])];
});
const existingMethod = (id: string) => setup.configuredShipmentMethods.value.find(row => row.shipmentMethodTypeId === id);
const hasExistingDays = (id: string) => positiveDeliveryDays(existingMethod(id)?.deliveryDays);
watch(availableMethods, methods => methods.forEach(method => {
  if(serviceCodes[method.shipmentMethodTypeId] === undefined) {serviceCodes[method.shipmentMethodTypeId] = method.carrierServiceCode || "";}
  if(deliveryDays[method.shipmentMethodTypeId] === undefined) {deliveryDays[method.shipmentMethodTypeId] = method.deliveryDays ?? "";}
}), { immediate: true });
const selectedMethods = computed(() => availableMethods.value.filter(row => selectedMethodIds.value.includes(row.shipmentMethodTypeId)).map(row => ({ ...row, carrierServiceCode: usage.value === "labels" ? serviceCodes[row.shipmentMethodTypeId]?.trim() : undefined, deliveryDays: usage.value === "labels" ? deliveryDays[row.shipmentMethodTypeId] : undefined })));
const selectedPromises = computed(() => usage.value === "labels" && strategy.value === "rate" ? promises.value.filter(row => selectedPromiseIds.value.includes(row.shipmentMethodTypeId)) : []);
const canSaveMethods = computed(() => setup.ready.value && !setup.busy.value && selectedMethods.value.length > 0 && (usage.value === "external" || selectedMethods.value.every(row => !!row.carrierServiceCode)) && (strategy.value !== "rate" || usage.value !== "labels" || (selectedPromises.value.length > 0 && [...selectedMethods.value, ...selectedPromises.value].every(row => positiveDeliveryDays(row.deliveryDays)))));
const facilityIds = ref<string[]>([]);
const accountStoreIds = ref<string[]>([]);
const storeIds = ref<string[]>([]);
const enableFulfillment = ref(false);
const automatic = ref(false);
const accountNumber = ref("");
const accountOverrides = reactive<Record<string, string>>({});
const accountsSaved = ref(false);
const preferences = reactive({ packagingType: "YOUR_PACKAGING", dropoffType: "USE_SCHEDULED_PICKUP", labelSize: "PAPER_4X6", labelImageType: "PDF", weightUomId: "WT_lb" });
const fulfillmentFacilities = computed(() => setup.facilities.value.filter(row => setup.inGroup(row.facilityId, "OMS_FULFILLMENT")));
const selectableFacilities = computed(() => enableFulfillment.value ? setup.facilities.value : fulfillmentFacilities.value);
const facilityName = (id: string) => setup.facilities.value.find(row => row.facilityId === id)?.facilityName || id;
const canSaveFacilities = computed(() => setup.ready.value && !setup.busy.value && facilityIds.value.length > 0 && facilityIds.value.every(id => enableFulfillment.value || setup.inGroup(id, "OMS_FULFILLMENT")));
const canSaveAccounts = computed(() => canSaveFacilities.value && completed.facilities && !!authId.value && !!accountNumber.value.trim() && accountStoreIds.value.length > 0 && props.partyId === "FEDEX");
const selectedShops = computed(() => setup.shops.value.filter(row => storeIds.value.includes(row.productStoreId)));
const shopId = ref("");
const incomingMethod = ref("");
const mappingMethodId = ref("");
const mappingMethods = computed(() => selectedPromises.value.length ? selectedPromises.value : selectedMethods.value);
const existingMapping = computed(() => setup.shopMappings.value.find(row => row.shopId === shopId.value && row.shopifyShippingMethod === incomingMethod.value.trim()));
const visibleMappings = computed(() => setup.shopMappings.value.filter(row => selectedShops.value.some(shop => shop.shopId === row.shopId) && mappingMethods.value.some(method => method.shipmentMethodTypeId === row.shipmentMethodTypeId) && row.carrierPartyId === (selectedPromises.value.length ? "_NA_" : props.partyId)));
const nextLabel = computed(() => step.value === "credentials" && !authId.value ? "Continue setup; connect later" : step.value === "facilities" && !accountsSaved.value ? "Continue; accounts pending" : "Continue");
const stepGroups = computed(() => [{ id: "setup", label: "Setup" }, ...(steps.value.includes("review") ? [{ id: "review", label: "Review" }] : [])]);
const navigationSteps = computed(() => steps.value.map(id => ({ id, group: id === "review" ? "review" : "setup", label: SETUP_LABELS[id] })));
const disabledStepIds = computed(() => steps.value.filter((_, index) => setup.busy.value || checking.value || index > furthest.value));
const stepStatuses = computed<Record<string, ProductStoreOnboardingStepStatus>>(() => Object.fromEntries(steps.value.map((id, index) => {
  const saved = id === "credentials" ? !!authId.value : id === "facilities" ? completed.facilities && accountsSaved.value : id === "mappings" ? visibleMappings.value.length > 0 : completed[id];

  return [id, saved ? "complete" : id === step.value ? "in-progress" : index < furthest.value ? "attention" : "not-started"];
})));
const progressLabel = computed(() => translate("{complete} of {total} setup steps complete", { complete: Object.values(stepStatuses.value).filter(status => status === "complete").length, total: steps.value.length }));
function selectStep(id: string) {
  const index = steps.value.indexOf(id);
  if(index >= 0 && !disabledStepIds.value.includes(id)) {void goTo(index);}
}
const canContinue = computed(() => !setup.busy.value && !checking.value && setup.hydrated.value && !!setup.carrier.value && (step.value !== "usage" || !!usage.value) && (step.value !== "methods" || !!completed.methods) && (step.value !== "facilities" || !!completed.facilities) && (step.value !== "stores" || !!completed.stores));
function toggle(ids: string[], id: string, enabled: boolean) {return enabled ? [...new Set([...ids, id])] : ids.filter(item => item !== id);}
function toggleMethod(id: string, enabled: boolean) {selectedMethodIds.value = toggle(selectedMethodIds.value, id, enabled);}
function togglePromise(id: string, enabled: boolean) {selectedPromiseIds.value = toggle(selectedPromiseIds.value, id, enabled);}
function toggleFacility(id: string, enabled: boolean) {facilityIds.value = toggle(facilityIds.value, id, enabled);}
function toggleStore(id: string, enabled: boolean) {storeIds.value = toggle(storeIds.value, id, enabled);}
async function goTo(index: number) {
  if(["usage", "prepare", "strategy"].includes(step.value)) {completed[step.value] = true;}
  if(step.value === "facilities" && accountStoreIds.value.length && !storeIds.value.length) {storeIds.value = [...accountStoreIds.value];}
  stepIndex.value = index; furthest.value = Math.max(furthest.value, index);
  setup.notice.value = "";
  await nextTick(); await contentRef.value?.$el?.scrollToTop?.(0); (headingRef.value as any)?.$el?.focus({ preventScroll: true });
  if(step.value === "credentials" && !setup.credentialsLoaded.value) {await checkConnection();}
}
async function checkConnection() {
  checking.value = true;
  try {
    await connection.test();
    if(connection.result.value?.status !== "connected" || connection.result.value?.carrierApiUnavailable) {
      setup.credentialsLoaded.value = false;
      connectionMessage.value = "Carrier services are unavailable. Review the OMS–UniGate connection and deployment compatibility. You can prepare the remaining steps while this is resolved.";

      return;
    }
    await setup.loadCredentials();
    connectionMessage.value = "UniGate carrier services are reachable. This does not verify FedEx credentials or label generation.";
  } catch {
    connectionMessage.value = "Carrier credentials could not be loaded. Check UniGate access and deployment compatibility.";
  } finally {checking.value = false;}
}
async function saveCredential() {
  const saved = await setup.saveCredential(credentialId.value, environment.value, credentialName.value, apiKey.value, secretKey.value);
  if(saved) {authId.value = credentialId.value; apiKey.value = ""; secretKey.value = "";}
}
async function saveMethods() {completed.methods = await setup.saveMethods(selectedMethods.value, selectedPromises.value);}
async function saveFacilities() {completed.facilities = await setup.saveFacilities(facilityIds.value, enableFulfillment.value, automatic.value);}
async function saveAccounts() {
  const saved = await setup.saveAccounts(accountStoreIds.value, facilityIds.value, authId.value, accountNumber.value, accountOverrides, preferences);
  if(saved) {
    accountNumber.value = ""; Object.keys(accountOverrides).forEach(key => delete accountOverrides[key]); storeIds.value = [...accountStoreIds.value];
  }
  await nextTick();
  accountsSaved.value = saved;
}

async function saveStores() {completed.stores = await setup.saveStores(storeIds.value, selectedMethods.value, selectedPromises.value, usage.value === "labels");}
async function saveMapping() {if(await setup.saveMapping(shopId.value, incomingMethod.value, mappingMethodId.value, selectedPromises.value.length > 0)) {incomingMethod.value = "";}}
async function openCustomMethod() {
  const modal = await modalController.create({ component: CreateShipmentMethodModal, componentProps: { partyId: props.partyId, carrierPartyId: props.partyId } });
  await modal.present();
}
watch([usage, strategy, origin], () => { completed.methods = false; completed.stores = false; mappingMethodId.value = ""; });
watch(usage, () => {furthest.value = 0; completed.facilities = false; accountsSaved.value = false; selectedMethodIds.value = [];});
watch(() => preferences.labelImageType, format => {preferences.labelSize = format === "ZPLII" ? "STOCK_4X6" : "PAPER_4X6";});
watch(environment, () => {authId.value = ""; apiKey.value = ""; secretKey.value = ""; accountNumber.value = ""; accountsSaved.value = false; credentialId.value = `FDX_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`; credentialName.value = environment.value === "test" ? "FedEx test account" : "FedEx live account";});
watch([selectedMethodIds, selectedPromiseIds, deliveryDays, serviceCodes, promises], () => {completed.methods = false; completed.stores = false; mappingMethodId.value = "";}, { deep: true });
watch([facilityIds, enableFulfillment, automatic], () => {completed.facilities = false; accountsSaved.value = false;});
watch([accountStoreIds, authId, preferences, accountNumber, accountOverrides], () => {accountsSaved.value = false;}, { deep: true });
watch(storeIds, () => {completed.stores = false; shopId.value = "";});
function clearSecrets() { apiKey.value = ""; secretKey.value = ""; accountNumber.value = ""; Object.keys(accountOverrides).forEach(key => delete accountOverrides[key]); }
onIonViewWillLeave(clearSecrets);
onUnmounted(() => {clearSecrets(); setup.clearSession();});
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
.step-actions,
.wizard-footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacer-xs);
}
.wizard-footer {
  justify-content: space-between;
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
}
</style>
