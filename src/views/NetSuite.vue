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
      <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
      <!-- <section class="analytics-header">
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">4</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Orders pending sync") }}</ion-label>
          </ion-item>
        </ion-card>
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">15</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Customers pending sync") }}</ion-label>
          </ion-item>
        </ion-card>
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">2</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ ("Products pending sync") }}</ion-label>
          </ion-item>
        </ion-card>
      </section> -->

      <div>
        <h1>{{ translate("Configuration") }}</h1>
        <section>
          <ion-item detail class="item-box" lines="none" button @click="openSftpModal()">
            <ion-label>{{ translate("SFTP") }}</ion-label>
          </ion-item>
          <ion-item detail class="item-box" lines="none" button @click="openProductStoreModal()">
            <ion-label>{{ translate("Product Store") }}</ion-label>
          </ion-item>
        </section>
      </div>
      
      <div class="ion-margin-top">
        <h1>{{ translate("Products and Inventory") }}</h1>
        <section>
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button @click="openInventoryVariances()">
            <ion-label>{{ translate("Inventory variances") }}</ion-label>
          </ion-item>
          <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
          <!-- <ion-item class="item-box" lines="none" button @click="openFacilities()">
            <ion-label>{{ translate("Facilities") }}</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item> -->
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
          <ion-item detail :disabled="!netSuiteProductStore?.productStoreId" class="item-box" lines="none" button @click="openSalesChannel()">
            <ion-label>{{ translate("Sales Channel") }}</ion-label>
          </ion-item>
        </section>
      </div>
      
      <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
      <!-- <div class="ion-margin-top">
        <h1>{{ translate("Transfer orders") }}</h1>
        <section>
          <ion-item detail class="item-box" lines="none" button>
            <ion-label>{{ translate("Transfer order fulfillment") }}</ion-label>
          </ion-item>
          <ion-item detail class="item-box" lines="none" button>
            <ion-label>{{ translate("Transfer order receipt") }}</ion-label>
          </ion-item>
        </section>
      </div> -->

      <ion-modal :is-open="showSftpModal" @didDismiss="closeSftpModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeSftpModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("SFTP") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-item class="ion-margin-top">
            <ion-icon slot="start" :icon="informationCircleOutline" />
            <ion-label>
              {{ translate("Learn more about NetSuite SFTP configuration.") }}
            </ion-label>
            <ion-button fill="clear" size="default" color="medium" @click="openSftpDoc">
              <ion-icon :icon="openOutline" slot="icon-only" />
            </ion-button>
          </ion-item>

          <ion-item lines="full" class="ion-margin-top">
            <ion-input v-model="sftpFormData.guid" :label="translate('GUID')" :placeholder="translate('Unique SFTP identifier')" />
          </ion-item>
          <ion-item lines="full">
            <ion-input v-model="sftpFormData.server" :label="translate('SERVER')" :placeholder="translate('Address or domain of the SFTP server')" />
          </ion-item>
          <ion-item lines="full">
            <ion-input v-model="sftpFormData.userId" :label="translate('USER ID')" :placeholder="translate('SFTP username')" />
          </ion-item>
          <ion-item lines="full">
            <ion-input v-model="sftpFormData.port" :label="translate('PORT')" :placeholder="translate('Default is 22')" />
          </ion-item>
          <ion-item lines="full">
            <ion-input v-model="sftpFormData.hostKey" :label="translate('HOST KEY')" :placeholder="translate('Authentication key')" />
          </ion-item>
          <ion-item lines="full">
            <ion-input v-model="sftpFormData.defaultDirectory" :label="translate('DEFAULT DIRECTORY')" placeholder="/home/-sftp/netsuite/" />
          </ion-item>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button @click="saveSftpConfig" :disabled="isFormInvalid">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>

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
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonMenuButton, IonModal, IonPage, IonRadio, IonRadioGroup, IonSelect, IonSelectOption, IonTitle, IonToolbar } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline, search } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from '@common';
import router from "@/router";
import { useNetSuite } from "@/composables/useNetSuite";
import { computed, ref } from "vue";


const priceLevelTypeId = JSON.parse(import.meta.env.VITE_NETSUITE_INTEGRATION_TYPE_MAPPING)?.PRICE_LEVEL_TYPE_ID
const discountTypeId = JSON.parse(import.meta.env.VITE_NETSUITE_INTEGRATION_TYPE_MAPPING)?.DISCOUNT_TYPE_ID
const { updateNetSuiteId: updatePriceLevelNetSuiteId, mappings: priceLevelMappings } = useNetSuite(priceLevelTypeId);
const { addNetSuiteId: addDiscountNetSuiteId, updateNetSuiteId: updateDiscountNetSuiteId } = useNetSuite(discountTypeId);

const { updateSftpConfig } = useNetSuite();
const { netSuiteProductStore } = useNetSuiteProductStore();

function openShipmentMethod() {
  router.push("/netsuite/shipment-methods")
}

function openPaymentMethods() {
  router.push("/netsuite/payment-methods")
}

function openInventoryVariances() {
  router.push("/netsuite/inventory-variances")
}

function openSalesChannel() {
  router.push("/netsuite/sales-channel")
}

function openDepartments() {
  router.push("/netsuite/departments")
}

// SFTP modal
const showSftpModal = ref(false);
const sftpFormData = ref({
  guid: "",
  server: "",
  userId: "",
  port: "",
  hostKey: "",
  defaultDirectory: ""
});

const isFormInvalid = computed(() => {
  return Object.values(sftpFormData.value).some(value => !value);
});

function openSftpModal() {
  sftpFormData.value = {
    guid: "",
    server: "",
    userId: "",
    port: "",
    hostKey: "",
    defaultDirectory: ""
  };
  showSftpModal.value = true;
}

function closeSftpModal() {
  showSftpModal.value = false;
}

async function saveSftpConfig() {
  try {
    const payload = {
      guid: sftpFormData.value.guid,
      server: sftpFormData.value.server,
      userId: sftpFormData.value.userId,
      port: sftpFormData.value.port,
      hostKey: sftpFormData.value.hostKey,
      defaultDirectory: sftpFormData.value.defaultDirectory
    };

    const resp = await updateSftpConfig(payload);

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("SFTP configurations updated successfully"))
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to update SFTP configurations"))
  }

  emitter.emit("dismissLoader")
  closeSftpModal();
}

function openSftpDoc() {
  window.open('https://docs.hotwax.co/documents/v/learn-netsuite/netsuite-deployment/sdfbundle/setupsftp', '_blank', 'noopener, noreferrer');
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
    logger.error(error);
    commonUtil.showToast(translate("Failed to update product store settings"))
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

</style>
