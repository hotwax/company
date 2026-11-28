<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("NetSuite") }}</ion-title>
        <ion-button slot="end" fill="clear">
          <ion-icon slot="icon-only" :icon="search" color="medium"/>
        </ion-button>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-horizontal">
      <ion-card class="ion-margin-top" data-testid="netsuite-connection-card">
        <ion-card-header>
          <ion-card-subtitle>{{ translate("Connection") }}</ion-card-subtitle>
          <ion-card-title>
            <ion-skeleton-text v-if="isConnectionLoading" :animated="true" class="count-skeleton" />
            <template v-else-if="netSuiteAccountId">
              {{ translate(isSandbox ? "Login saved for NetSuite sandbox {accountId}" : "Login saved for NetSuite account {accountId}", { accountId: netSuiteAccountId }) }}
            </template>
            <template v-else>{{ translate("No NetSuite login saved") }}</template>
          </ion-card-title>
        </ion-card-header>
      </ion-card>

      <ion-item v-if="setupState === 'MATCHES'" lines="none" data-testid="netsuite-setup-done">
        <ion-label class="ion-text-wrap">
          {{ translate("Company setup matches NetSuite.") }}
          <p v-if="lastSave">{{ translate("Last saved by {username}, {date}", { username: lastSave.username, date: commonUtil.getDateAndTime(lastSave.savedDate) }) }}</p>
        </ion-label>
        <ion-button slot="end" fill="clear" data-testid="netsuite-setup-review-again" @click="router.push(reviewRoute('subsidiaries'))">{{ translate("Review again") }}</ion-button>
      </ion-item>
      <ion-card v-else-if="setupCard" data-testid="netsuite-setup-card">
        <ion-card-header>
          <ion-card-subtitle>{{ translate("Next step") }}</ion-card-subtitle>
          <ion-card-title>{{ setupCard.title }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ setupCard.note }}</p>
          <ion-button v-if="setupCard.action" class="ion-margin-top" data-testid="netsuite-setup-action" @click="router.push(reviewRoute(tabToFix))">{{ setupCard.action }}</ion-button>
        </ion-card-content>
      </ion-card>

      <div class="ion-margin-top">
        <h1>{{ translate("Subsidiaries") }}</h1>
        <p class="section-note">{{ translate("The client's companies in NetSuite, and whether each is set up in the OMS.") }}</p>
        <ion-list lines="full" data-testid="netsuite-subsidiaries">
          <ion-item v-if="subsidiariesLoadError" data-testid="netsuite-subsidiaries-error">
            <ion-label class="ion-text-wrap">
              {{ translate(subsidiaries.length ? "Could not read the subsidiaries from NetSuite. The list below is from the last good read." : "Could not read the subsidiaries from NetSuite.") }}
              <p>{{ subsidiariesLoadError }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="isSubsidiariesLoading">
            <ion-skeleton-text :animated="true" />
          </ion-item>
          <ion-item v-else-if="!subsidiaries.length && !subsidiariesLoadError">
            <ion-label>{{ translate("NetSuite returned no subsidiaries.") }}</ion-label>
          </ion-item>
          <ion-item v-for="subsidiary in subsidiaries" v-else :key="subsidiary.subsidiaryId" button detail :data-testid="`netsuite-subsidiary-${subsidiary.subsidiaryId}`" @click="router.push(`/netsuite/subsidiaries/${subsidiary.subsidiaryId}`)">
            <ion-label class="ion-text-wrap">
              <h2>{{ translate("{name} ({subsidiaryId})", { name: subsidiary.name, subsidiaryId: subsidiary.subsidiaryId }) }}</h2>
              <p v-if="subsidiary.status === 'SET_UP' || subsidiary.locationCount">
                {{ translate(subsidiary.locationCount === 1 ? "Owns 1 location" : "Owns {count} locations", { count: subsidiary.locationCount }) }}
              </p>
              <p v-if="subsidiary.status === 'ROLE_MISSING'"><ion-text color="warning">{{ translate("An organization holds this id, but it has no Subsidiary role.") }}</ion-text></p>
              <p v-if="subsidiary.status === 'DUPLICATE'"><ion-text color="warning">{{ translate("More than one organization holds this id.") }}</ion-text></p>
              <p v-if="subsidiary.isInactive === 'Y'">{{ translate("Inactive in NetSuite") }}</p>
            </ion-label>
            <ion-badge slot="end" :color="SUBSIDIARY_STATUS_COLORS[subsidiary.status]">{{ translate(SUBSIDIARY_STATUS_LABELS[subsidiary.status]) }}</ion-badge>
          </ion-item>
        </ion-list>
      </div>

      <div class="ion-margin-top">
        <h1>{{ translate("Monitoring") }}</h1>
        <section>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button data-testid="netsuite-orders-item" @click="openOrdersFlow()">
            <ion-label class="ion-text-wrap">
              {{ translate("Orders") }}
              <p v-if="!netSuiteProductStore?.productStoreId">{{ translate("Set a NetSuite product store first.") }}</p>
              <ion-skeleton-text v-else-if="isOrdersSummaryLoading" :animated="true" />
              <p v-else data-testid="netsuite-orders-summary"><ion-text :color="ordersNeedAttention ? 'warning' : undefined">{{ ordersSummary }}</ion-text></p>
              <p v-if="flowWarning" data-testid="netsuite-orders-setup-warning"><ion-text color="warning">{{ translate(flowWarning) }}</ion-text></p>
            </ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button data-testid="netsuite-shipments-item" @click="openShipmentsFlow()">
            <ion-label class="ion-text-wrap">
              {{ translate("Shipments from NetSuite") }}
              <p v-if="!netSuiteProductStore?.productStoreId">{{ translate("Set a NetSuite product store first.") }}</p>
              <ion-skeleton-text v-else-if="isShipmentsSummaryLoading" :animated="true" />
              <p v-else data-testid="netsuite-shipments-summary"><ion-text :color="shipmentsNeedAttention ? 'warning' : undefined">{{ shipmentsSummary }}</ion-text></p>
            </ion-label>
          </ion-item>
        </section>
      </div>

      <div class="ion-margin-top">
        <h1>{{ translate("Configuration") }}</h1>
        <section>
          <ion-item detail class="item-box" lines="none" button @click="openProductStoreModal()">
            <ion-label>{{ translate("Product Store") }}</ion-label>
          </ion-item>
        </section>
      </div>
      
      <div class="ion-margin-top">
        <h1>{{ translate("Orders and fulfillment") }}</h1>
        <section>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button @click="openShipmentMethod()">
            <ion-label>{{ translate("Shipping methods") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button @click="openPaymentMethods()">
            <ion-label>{{ translate("Payment method") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button @click="openPriceLevelModal()">
            <ion-label>{{ translate("Price level") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button @click="openDiscountsModal()">
            <ion-label>{{ translate("Discounts") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button @click="openDepartments()">
            <ion-label>{{ translate("Departments") }}</ion-label>
          </ion-item>
        </section>
      </div>
      
      <ion-modal :is-open="showProductStoreModal" @didDismiss="closeProductStoreModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeProductStoreModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Product Store") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-item class="ion-margin-top">
            <ion-icon slot="start" :icon="informationCircleOutline" />
            <ion-label>
              {{ translate("Learn more about mapping product stores to subsidiaries") }}
            </ion-label>
            <ion-button fill="clear" size="default" color="medium" @click="openProductStoreDoc">
              <ion-icon :icon="openOutline" slot="icon-only" />
            </ion-button>
          </ion-item>

          <ion-item lines="full" class="ion-margin-top">
            <ion-select v-model="selectedProductStoreId" :disabled="!storesReady" interface="popover" :label="translate('Product Store')" :placeholder="translate('Select')" @ionChange="updatedStoreSubsidiaryId">
              <ion-select-option v-for="store in productStores" :key="store" :value="store.productStoreId">
                {{ store.storeName ? store.storeName : store.productStoreId }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item lines="full">
            <ion-input v-model="subsidiaryId" :label="translate('Subsidiary')" :placeholder="translate('Usually 1')" />
          </ion-item>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button @click="updateSubsidiaryId" :disabled="isSaveButtonDisabled()">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showPriceLevelModal" @didDismiss="closePriceLevelModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closePriceLevelModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Price level") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-item class="ion-margin-top">
            <ion-icon slot="start" :icon="informationCircleOutline" />
            <ion-label>
              {{ translate("Learn more about price levels in NetSuite") }}
            </ion-label>
            <ion-button fill="clear" size="default" color="medium" @click="openPriceLevelDoc">
              <ion-icon :icon="openOutline" slot="icon-only" />
            </ion-button>
          </ion-item>

          <ion-item lines="full" class="ion-margin-top">
            <ion-input v-model="selectedPriceLevel" :label="translate('Price level')" :placeholder="translate('Base Price')"/>
          </ion-item>

          <ion-list>
            <ion-list-header>{{ translate("Frequently used") }}</ion-list-header>
            <ion-radio-group v-model="selectedPriceLevel">
              <ion-item>
                <ion-radio value="Base" label-placement="end" justify="start">
                  <ion-label>
                    {{ translate("Base Price") }}
                    <p>{{ translate("Defaults to product price set in NetSuite") }}</p>
                  </ion-label>
                </ion-radio>
              </ion-item>
              <ion-item>
                <ion-radio value="Custom" label-placement="end" justify="start">
                  <ion-label>
                    {{ translate("Custom") }}
                    <p>{{ translate("Use the price a product was sold at in the order.") }}</p>
                  </ion-label>
                </ion-radio>
              </ion-item>
            </ion-radio-group>
          </ion-list>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button :disabled="isPriceLevelChanged()" @click="savePrice">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showDiscountsModal" @didDismiss="closeDiscountsModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeDiscountsModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Discounts") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-item class="ion-margin-top">
            <ion-icon slot="start" :icon="informationCircleOutline" />
            <ion-label>
              {{ translate("Learn more about discounts in NetSuite") }}
            </ion-label>
            <ion-button fill="clear" size="default" color="medium">
              <ion-icon :icon="openOutline" slot="icon-only" />
            </ion-button>
          </ion-item>

          <ion-item lines="full" class="ion-margin-top">
            <ion-input v-model="orderLevelDiscount" :label="translate('Order level discount')" :placeholder="translate('NetSuite discount item ID')" />
          </ion-item>

          <ion-item lines="full">
            <ion-input v-model="itemLevelDiscount" :label="translate('Item level discounts')" :placeholder="translate('NetSuite discount item ID')" />
          </ion-item>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button @click="editNetSuiteDiscountItemIds" :disabled="isDiscountValueChanged()">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { useNetSuiteProductStore, useProductStoreMutations, useProductStores } from "@/composables/useProductStores";
import { useIntegrationTypeMappings } from "@/composables/useNetSuite";
import { IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonMenuButton, IonModal, IonPage, IonRadio, IonRadioGroup, IonSelect, IonSelectOption, IonSkeletonText, IonText, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline, search } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from '@common';
import router from "@/router";
import { useNetSuite } from "@/composables/useNetSuite";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains } from "@/db/appDbSync";
import { useNetSuiteConnection, useNetSuiteSubsidiaries } from "@/composables/useNetSuiteSubsidiaries";
import { useNetSuiteOrdersSummary } from "@/composables/useNetSuiteOrdersFlow";
import { useNetSuiteShipmentsSummary } from "@/composables/useNetSuiteShipmentsFlow";
import { reviewRoute, SETUP_STATUS_DOMAINS, useNetSuiteSetupReviewSave, useNetSuiteSetupStatus } from "@/composables/useNetSuiteSetupReview";
import { NETSUITE_ORDERS_SETUP_DOMAIN, NETSUITE_SENDING_COUNTS_DOMAIN, NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN, NETSUITE_STEP_COUNTS_DOMAIN, NETSUITE_SUBSIDIARIES_DOMAIN } from "@/config/appSyncConfig";
import { computed, ref, watch } from "vue";


const priceLevelTypeId = JSON.parse(import.meta.env.VITE_NETSUITE_INTEGRATION_TYPE_MAPPING)?.PRICE_LEVEL_TYPE_ID
const discountTypeId = JSON.parse(import.meta.env.VITE_NETSUITE_INTEGRATION_TYPE_MAPPING)?.DISCOUNT_TYPE_ID
const { updateNetSuiteId: updatePriceLevelNetSuiteId, mappings: priceLevelMappings } = useNetSuite(priceLevelTypeId);
const { addNetSuiteId: addDiscountNetSuiteId, updateNetSuiteId: updateDiscountNetSuiteId } = useNetSuite(discountTypeId);

const { netSuiteProductStore } = useNetSuiteProductStore();

const SUBSIDIARY_STATUS_LABELS: Record<string, string> = { SET_UP: "Set up", ROLE_MISSING: "Not set up", DUPLICATE: "Not set up", NOT_SET_UP: "Not set up", SKIPPED: "Skipped (accounting only)" };
const SUBSIDIARY_STATUS_COLORS: Record<string, string> = { SET_UP: "success", ROLE_MISSING: "warning", DUPLICATE: "danger", NOT_SET_UP: "warning", SKIPPED: "medium" };

const { isLoading: isConnectionLoading, accountId: netSuiteAccountId, isSandbox } = useNetSuiteConnection();
const { subsidiaries, isLoading: isSubsidiariesLoading, loadError: subsidiariesLoadError } = useNetSuiteSubsidiaries();
const { isLoading: isOrdersSummaryLoading, summary: ordersSummary, needsAttention: ordersNeedAttention } =
  useNetSuiteOrdersSummary(() => netSuiteProductStore.value?.productStoreId);
const { isLoading: isShipmentsSummaryLoading, summary: shipmentsSummary, needsAttention: shipmentsNeedAttention } =
  useNetSuiteShipmentsSummary(() => netSuiteProductStore.value?.productStoreId);
const { state: setupState, companiesNotSetUp, actionCounts, tabToFix, flowWarning } = useNetSuiteSetupStatus();
const { lastSave, loadLastSave } = useNetSuiteSetupReviewSave();

const setupCard = computed(() => {
  if (setupState.value === "NO_LOGIN") {
    return { title: translate("Save the NetSuite login first"), note: translate("The setup reads the client's companies from NetSuite with this login.") };
  }
  if (setupState.value === "COMPANIES_NOT_SET_UP") {
    const count = companiesNotSetUp.value.length;
    return {
      title: translate(count === 1 ? "1 company is not set up in the OMS" : "{count} companies are not set up in the OMS", { count }),
      note: translate("Review the companies NetSuite has, and save the ones to set up."),
      action: translate("Review and fix"),
    };
  }
  if (setupState.value === "NOT_CHECKED") {
    return {
      title: translate("Locations and departments are not checked yet"),
      note: translate("Compare them with NetSuite before you switch on a flow."),
      action: translate("Review setup"),
    };
  }
  if (setupState.value === "DIFFERS") {
    const { locations, departments } = actionCounts.value;
    const title = locations && departments
      ? translate("{locations} locations and {departments} departments need action", { locations, departments })
      : locations
        ? translate(locations === 1 ? "1 location needs action" : "{count} locations need action", { count: locations })
        : translate(departments === 1 ? "1 department needs action" : "{count} departments need action", { count: departments });
    return {
      title,
      note: translate("Found at the last review. Fix them before you switch on a flow."),
      action: translate("Review and fix"),
    };
  }
  return undefined;
});

const SYNC_OWNER = createSyncDomainOwner("netSuiteView");

function netSuiteSyncDomains() {
  const productStoreId = netSuiteProductStore.value?.productStoreId;
  const storeDomains = productStoreId
    ? [
      { name: NETSUITE_SENDING_COUNTS_DOMAIN },
      { name: NETSUITE_STEP_COUNTS_DOMAIN, args: { productStoreId } },
      { name: NETSUITE_ORDERS_SETUP_DOMAIN, args: { productStoreId } },
      { name: NETSUITE_SHIPMENT_STEP_COUNTS_DOMAIN, args: { productStoreId } },
    ]
    : [];
  return [{ name: NETSUITE_SUBSIDIARIES_DOMAIN }, ...SETUP_STATUS_DOMAINS, ...storeDomains];
}

watch(() => netSuiteProductStore.value?.productStoreId, () => { void activateSyncDomains(netSuiteSyncDomains(), SYNC_OWNER); });
onIonViewWillEnter(() => {
  void activateSyncDomains(netSuiteSyncDomains(), SYNC_OWNER);
  loadLastSave().catch((error) => logger.error("Could not read the last save of the NetSuite setup review", error));
});
onIonViewDidLeave(() => { void deactivateSyncDomains(SYNC_OWNER); });

function openOrdersFlow() {
  if (!netSuiteProductStore.value?.productStoreId) return;
  router.push(`/netsuite/stores/${netSuiteProductStore.value.productStoreId}/orders`)
}

function openShipmentsFlow() {
  if (!netSuiteProductStore.value?.productStoreId) return;
  router.push(`/netsuite/stores/${netSuiteProductStore.value.productStoreId}/shipments`)
}

function openShipmentMethod() {
  router.push("/netsuite/shipment-methods")
}

function openPaymentMethods() {
  router.push("/netsuite/payment-methods")
}

function openDepartments() {
  router.push("/netsuite/departments")
}

// Product Store modal
const showProductStoreModal = ref(false);
const { productStores, hydrated: storesReady } = useProductStores();
const selectedProductStoreId = ref("");
const subsidiaryId = ref("")

async function openProductStoreModal() {
  selectedProductStoreId.value = "";
  subsidiaryId.value = "";
  showProductStoreModal.value = true;
  if(netSuiteProductStore.value) {
    selectedProductStoreId.value = netSuiteProductStore.value.productStoreId;
    subsidiaryId.value = netSuiteProductStore.value.subsidiaryId;
  }
}

function closeProductStoreModal() {
  showProductStoreModal.value = false;
}

function isSaveButtonDisabled() {
  const initialProductStoreId = netSuiteProductStore.value?.productStoreId;
  const initialSubsidiaryId = netSuiteProductStore.value?.subsidiaryId;
  return !selectedProductStoreId.value || !subsidiaryId.value || (selectedProductStoreId.value === initialProductStoreId) && (subsidiaryId.value === initialSubsidiaryId);
}

async function updateSubsidiaryId() {

  try {
    const updatedStore = {
      externalId: subsidiaryId.value,
      productStoreId: selectedProductStoreId.value
    };

    const resp = await useProductStoreMutations(updatedStore.productStoreId).updateStore(updatedStore);
    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Product store setting updated successfully"))
      // No cache refresh here: `updateStore` already re-reads the store into the cache on success,
      // and `netSuiteProductStore` is derived from that row. Refreshing again just paid for a second
      // identical GET per save.
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    const serverError = commonUtil.getErrorMessage(error);
    logger.error(error);
    commonUtil.showToast(`${translate("Failed to update product store settings")}. ${serverError}`);
  }
  emitter.emit("dismissLoader")
  closeProductStoreModal();
}

function updatedStoreSubsidiaryId() {
  const updatedProductStore = productStores.value.find((store: any) => store.productStoreId === selectedProductStoreId.value);
  subsidiaryId.value = updatedProductStore.externalId ? updatedProductStore.externalId : "";
}

function openProductStoreDoc() {
  window.open('https://docs.hotwax.co/documents/v/learn-netsuite/netsuite-deployment/prerequisites/productstoresettings', '_blank', 'noopener, noreferrer');
}

// Price Level modal
const showPriceLevelModal = ref(false);
const priceLevelIntegrationMapping = ref("") as any;
const selectedPriceLevel = ref("")

async function openPriceLevelModal() {
  selectedPriceLevel.value = "";
  priceLevelIntegrationMapping.value = "";
  showPriceLevelModal.value = true;
  // Mappings are cached (synced at login), so opening this modal needs no request.
  const integrationMappings = priceLevelMappings.value;
  selectedPriceLevel.value = (priceLevelIntegrationMapping.value = integrationMappings[0]).mappingValue || "";
}

function closePriceLevelModal() {
  showPriceLevelModal.value = false;
}

function isPriceLevelChanged() {
  return (!selectedPriceLevel.value.trim() || selectedPriceLevel.value.trim() === priceLevelIntegrationMapping.value.mappingValue)
}

// saves the selectedPriceLevel price level to Netsuite for integration type id: 'NETSUITE_PRICE_LEVEL' & mappingKey: 'PRICE_LEVEL'.
async function savePrice() {
  const payload = {
    integrationTypeId: priceLevelTypeId,
    mappingKey: "PRICE_LEVEL",
    mappingValue: selectedPriceLevel.value
  };
  await updatePriceLevelNetSuiteId(payload, priceLevelIntegrationMapping.value.integrationMappingId);
  closePriceLevelModal();
}

function openPriceLevelDoc() {
  window.open('https://docs.hotwax.co/documents/v/learn-netsuite/synchronization-flows/integration-mappings/price-levels', '_blank', 'noopener, noreferrer');
}

// Discounts modal
const showDiscountsModal = ref(false);
const { mappings: discountIntegrationTypeMappings } = useIntegrationTypeMappings(discountTypeId);
const orderLevelDiscount = ref("");
const itemLevelDiscount = ref("");
const integrationMappingByKey = ref({}) as any
const mappingKeys = {
  order: "SHOPIFY_DISC",
  item: "SHOPIFY_ITEM_DISC"
}

async function openDiscountsModal() {
  orderLevelDiscount.value = "";
  itemLevelDiscount.value = "";
  showDiscountsModal.value = true;
  // Set orderLevelDiscount and itemLevelDiscount based on their corresponding mapping keys in integration type mappings.
  discountIntegrationTypeMappings.value.map((mapping: any) => {
    integrationMappingByKey[mapping.mappingKey] = mapping
    if(mapping.mappingKey === mappingKeys.order) {
      orderLevelDiscount.value = mapping.mappingValue
    } else {
      itemLevelDiscount.value = mapping.mappingValue
    }
  });
}

function closeDiscountsModal() {
  showDiscountsModal.value = false;
}

function isDiscountValueChanged() {
  return !(orderLevelDiscount.value?.trim() && itemLevelDiscount.value?.trim() && (orderLevelDiscount.value !== integrationMappingByKey[mappingKeys.order]?.mappingValue || itemLevelDiscount.value !== integrationMappingByKey[mappingKeys.item]?.mappingValue));
}

async function editNetSuiteDiscountItemIds() {
  if(orderLevelDiscount.value !== integrationMappingByKey[mappingKeys.order].mappingValue) {
    await updateMapping(mappingKeys.order, orderLevelDiscount.value)
  }
  if(!itemLevelDiscount.value !== integrationMappingByKey[mappingKeys.item].mappingValue) {
    await updateMapping(mappingKeys.item, itemLevelDiscount.value)
  }
  closeDiscountsModal();
}

async function updateMapping(mappingKey: any, mappingValue: any) {

  const payload = {
    integrationTypeId: discountTypeId,
    mappingKey,
    mappingValue
  }

  if(integrationMappingByKey[mappingKey]?.integrationMappingId) {
    await updateDiscountNetSuiteId(payload, integrationMappingByKey[mappingKey].integrationMappingId);
  } else {
    await addDiscountNetSuiteId(payload);
  }
}
</script>

<style scoped>
/* ion-card {
  margin-inline: 0px;
} */

/* .analytics-header {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));  
}

.count-size {
  font-size: 128px;
} */

.item-box::part(native) {
  --border-radius: var(--spacer-xs);
  border: var(--border-medium);
}

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacer-sm);
}


.count-skeleton {
  width: var(--spacer-3xl);
}

.section-note {
  color: var(--ion-color-medium);
}

</style>
