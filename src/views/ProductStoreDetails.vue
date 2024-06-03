<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/tabs/product-store"/>
        <ion-title>{{ productStore.storeName }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <div class="store-info">
          <ion-card class="store-info store-details">
            <ion-item lines="none" class="ion-margin-top">
              <ion-label>
                <p class="overline">{{ productStore.productStoreId }}</p>
                <h1>{{ productStore.storeName ? productStore.storeName : productStore.productStoreId }}</h1>
                <p>{{ productStore.companyName }}</p>
              </ion-label>
              <ion-button fill="outline" @click="renameProductStore()">{{ translate("Edit") }}</ion-button>
            </ion-item>

            <div class="ion-margin-top">
              <ion-item>
                <ion-icon :icon="mapOutline" slot="start"/>
                <ion-label>{{ translate("Operating in") }}</ion-label>
                <ion-label slot="end">{{  translate(dbicCountriesCount == 1 ? "country" : "countries", {count: dbicCountriesCount}) }}</ion-label>
              </ion-item>

              <ion-item>
                <ion-icon :icon="compassOutline" slot="start"/>
                <ion-toggle :checked="getBooleanValue(productStore.enableBrokering)" @click.prevent="updateProductStoreDetail($event, 'enableBrokering', true)">{{ translate("Order brokering") }}</ion-toggle>
              </ion-item>

              <ion-item lines="none">
                <ion-icon :icon="wineOutline" slot="start"/>
                <ion-toggle :checked="getBooleanValue(productStore.reserveInventory)" @click.prevent="updateProductStoreDetail($event, 'reserveInventory', true)">{{ translate("Inventory reservation") }}</ion-toggle>
              </ion-item>
            </div>
          </ion-card>
        </div>

        <section>
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Order") }}</ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Import") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-input :label="translate('ID prefix')" :placeholder="translate('prefix')" :value="productStore.orderNumberPrefix" @keydown.enter="updateProductStoreDetail($event, 'orderNumberPrefix', false)" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Specify any preferred prefix to be added to internal order IDs.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['SAVE_BILL_TO_INF']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'SAVE_BILL_TO_INF', true)">{{ translate("Save billing information") }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Store billing information associated with orders in OMS.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item-divider color="light">
                <ion-label>{{ translate("Approval") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(productStore.autoApproveOrder)" @click.prevent="updateProductStoreDetail($event, 'autoApproveOrder', true)">{{ translate("Approve on import") }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Configure when no further order information is needed prior to order approval.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item-divider color="light">
                <ion-label>{{ translate("Returns") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-input :label="translate('Create deadline days')" :placeholder="translate('days count')" type="number" min="0" :value="settings['RETURN_DEADLINE_DAYS']?.settingValue" @keydown.enter="updateProductStoreSettings($event, 'RETURN_DEADLINE_DAYS', false)" @keydown="validateInput($event)" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Specify the number of days permitted for creating returns for in-store.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Brokering") }}</ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Soft Allocation") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-label>{{ translate("Preselected facility tag") }}</ion-label>
                <ion-chip outline @click="createUpdateTag('PRE_SLCTD_FAC_TAG')" v-if="settings['PRE_SLCTD_FAC_TAG']?.settingValue">
                  {{ settings['PRE_SLCTD_FAC_TAG'].settingValue }}
                  <ion-icon :icon="closeCircleOutline" @click.stop="removeTag('PRE_SLCTD_FAC_TAG')" />
                </ion-chip>
                <ion-button fill="clear" @click="createUpdateTag('PRE_SLCTD_FAC_TAG')" v-else>
                  <ion-icon slot="icon-only" :icon="addCircleOutline" />
                </ion-button>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Orders tagged with this tag will undergo line item check for fulfillment facility selection.") }}</p>
                </ion-label>
              </ion-item>
              
              <ion-item>
                <ion-label>{{ translate("Shipping facility tag") }}</ion-label>
                <ion-chip outline @click="createUpdateTag('ORD_ITM_SHIP_FAC')" v-if="settings['ORD_ITM_SHIP_FAC']?.settingValue">
                  {{ settings['ORD_ITM_SHIP_FAC'].settingValue }}
                  <ion-icon :icon="closeCircleOutline" @click.stop="removeTag('ORD_ITM_SHIP_FAC')" />
                </ion-chip>
                <ion-button fill="clear" @click="createUpdateTag('ORD_ITM_SHIP_FAC')" v-else>
                  <ion-icon slot="icon-only" :icon="addCircleOutline" />
                </ion-button>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Tag will hold the preselected fulfillment facility value.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item-divider color="light">
                <ion-label>{{ translate("Routing") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(productStore.allowSplit)" @click.prevent="updateProductStoreDetail($event, 'allowSplit', true)">{{ translate("Order splitting") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-input :label="translate('Minimum shipment threshold')" :placeholder="translate('threshold')" type="number" min="0" :value="settings['BRK_SHPMNT_THRESHOLD']?.settingValue" @keydown.enter="updateProductStoreSettings($event, 'BRK_SHPMNT_THRESHOLD', false)" @keydown="validateInput($event)" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Split orders into multiple groups and fulfill them from different fulfillment centers.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <div>
            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Fulfillment") }}</ion-card-title>
              </ion-card-header>

              <ion-list>
                <ion-item-divider color="light">
                  <ion-label>{{ translate("Notifications") }}</ion-label>
                </ion-item-divider>
  
                <ion-item>
                  <ion-toggle :checked="getBooleanValue(settings['FULFILL_NOTIF']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'FULFILL_NOTIF', true)" >{{ translate("Send notification to Shopify") }}</ion-toggle>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ translate("Update tracking information upon order shipment in Shopify.") }}</p>
                  </ion-label>
                </ion-item>

                <ion-item-divider color="light">
                  <ion-label>{{ translate("Cancellations") }}</ion-label>
                </ion-item-divider>

                <ion-item>
                  <ion-toggle :checked="autoCancellationActive" @ionChange="updateOrderCancellationStatus()">{{ translate("Auto order cancellation") }}</ion-toggle>
                </ion-item>
  
                <ion-item>
                  <ion-input :label="translate('Auto cancellations days')" :placeholder="translate('days count')" type="number" min="0" :value="productStore.daysToCancelNonPay" @keydown.enter="updateProductStoreDetail($event, 'daysToCancelNonPay', false)" :disabled="!autoCancellationActive" @keydown="validateInput($event)" />
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ translate("Configure cancellation threshold for unfulfilled orders based on a specified number of days.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>{{ translate("Store pickup") }}</ion-card-title>
              </ion-card-header>

              <ion-list>
                <ion-item>
                  <ion-toggle :checked="getBooleanValue(settings['BOPIS_PART_ODR_REJ']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'BOPIS_PART_ODR_REJ', true)" >{{ translate("Partial order rejection") }}</ion-toggle>
                </ion-item>
                <ion-item lines="none">
                  <ion-label>
                    <p>{{ translate("Specify whether you reject a BOPIS order partially when any order item inventory is insufficient at the store.") }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card>
          </div>
        </section>

        <section>
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Inventory") }}</ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Inventory view") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['INV_CNT_VIEW_QOH']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'INV_CNT_VIEW_QOH', true)" >{{ translate("Show systemic inventory") }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Display current physical quantity expected at locations while inventory counting.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item-divider color="light">
                <ion-label>{{ translate("Pre-order computation") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['HOLD_PRORD_PHYCL_INV']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'HOLD_PRORD_PHYCL_INV', true)" >{{ translate("Hold pre-order physical inventory") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Pre-order group')" interface="popover" :placeholder="translate('Select')" :value="settings['PRE_ORDER_GROUP_ID']?.settingValue" @ionChange="updateProductStoreSettings($event, 'PRE_ORDER_GROUP_ID', false)">
                  <ion-select-option v-for="group in facilityGroups" :key="group.facilityGroupId" :value="group.facilityGroupId">{{ group.facilityGroupName }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Configure inventory computation for pre-sell items based on inventory channels and pre-sell queues.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Product") }}</ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-item-divider color="light">
                <ion-label>{{ translate("Identifier") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-select :label="translate('Global identifier')" interface="popover" :placeholder="translate('Select')" :value="productStore.productIdentifierEnumId"  @ionChange="updateProductStoreDetail($event, 'productIdentifierEnumId', false)">
                  <ion-select-option v-for="identifier in productIdentifiers" :key="identifier.enumId" :value="identifier.enumId">{{ identifier.description }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("The identifier used globally throughout the business operations.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item-divider color="light">
                <ion-label>{{ translate("Preferred identifier") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-select :label="translate('Primary identifier')" interface="popover" :placeholder="translate('Select')" :value="getPreferredIdentification('primaryId')" @ionChange="updatePreferredIdentification($event, 'primaryId')">
                  <ion-select-option v-for="option in productIdentificationOptions" :key="option" :value="option">{{ option }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Secondary identifier')" interface="popover" :placeholder="translate('Select')" :value="getPreferredIdentification('secondaryId')" @ionChange="updatePreferredIdentification($event, 'secondaryId')">
                  <ion-select-option v-for="option in productIdentificationOptions" :key="option" :value="option">{{ option }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Choosing a product identifier allows you to view products with your preferred identifiers.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <div>
                <ion-card-subtitle class="overline">{{ translate("Re-route fulfillment") }}</ion-card-subtitle>
                <ion-card-title>{{ translate("Order edit permissions") }}</ion-card-title>
              </div>
            </ion-card-header>

            <ion-list>
              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['CUST_DLVR_MTHD_UPD']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'CUST_DLVR_MTHD_UPD', true)" >{{ translate("Delivery method") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Shipment method')" interface="popover" :placeholder="translate('Select')" :value="settings['RF_SHIP_MTHD']?.settingValue" @ionChange="updateProductStoreSettings($event, 'RF_SHIP_MTHD', false)" >
                  <ion-select-option v-for="shipmentMethod in shipmentMethodTypes" :key="shipmentMethod.shipmentMethodTypeId" :value="shipmentMethod.shipmentMethodTypeId">{{ shipmentMethod.description ? shipmentMethod.description : shipmentMethod.shipmentMethodTypeId }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['CUST_DLVRADR_UPDATE']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'CUST_DLVRADR_UPDATE', true)" >{{ translate("Delivery address") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['CUST_PCKUP_UPDATE']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'CUST_PCKUP_UPDATE', true)" >{{ translate("Pick up location") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['CUST_ALLOW_CNCL']?.settingValue)" @click.prevent="updateProductStoreSettings($event, 'CUST_ALLOW_CNCL', true)" >{{ translate("Cancel order before fulfillment") }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Control what your customers are allowed to edit on their own when they are editing their order on Re-route Fulfillment.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonChip, IonHeader, IonIcon, IonInput, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar, alertController, onIonViewWillEnter } from "@ionic/vue";
import { addCircleOutline, closeCircleOutline, compassOutline, mapOutline, wineOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useStore } from "vuex";
import { computed, defineProps, ref } from "vue";
import { hasError, showToast } from "@/utils";
import logger from "@/logger";
import { ProductStoreService } from "@/services/ProductStoreService";
import emitter from "@/event-bus";
import { DateTime } from "luxon";

const props = defineProps(["productStoreId"]);
const store = useStore();

const productIdentificationOptions = ["productId", "groupId", "groupName", "internalName", "parentProductName", "primaryProductCategoryName", "sku", "title", "SHOPIFY_PROD_SKU"];
const autoCancellationActive = ref(false);

const facilityGroups = computed(() => store.getters["util/getFacilityGroups"])
const productStore = computed(() => store.getters["productStore/getCurrent"])
const settings = computed(() => store.getters["productStore/getCurrentStoreSettings"])
const dbicCountriesCount = computed(() => store.getters["util/getDBICCountriesCount"])
const productIdentifiers = computed(() => store.getters["util/getProductIdentifiers"])
const shipmentMethodTypes = computed(() => store.getters["util/getShipmentMethodTypes"])

onIonViewWillEnter(async() => {
  emitter.emit("presentLoader");
  await Promise.allSettled([store.dispatch("util/fetchDBICCountries"), store.dispatch("productStore/fetchProductStoreDetails", props.productStoreId), store.dispatch("productStore/fetchCurrentStoreSettings", props.productStoreId), store.dispatch("util/fetchFacilityGroups"), store.dispatch("util/fetchProductIdentifiers"), store.dispatch("util/fetchShipmentMethodTypes", { pageSize: 250 })])  
  if(productStore.value.daysToCancelNonPay) autoCancellationActive.value = true;
  emitter.emit("dismissLoader");
})

function getPreferredIdentification(id: string) {
  const identifications = settings.value['PRDT_IDEN_PREF']?.settingValue ? JSON.parse(settings.value['PRDT_IDEN_PREF'].settingValue) : {}
  return identifications[id];
}

async function updatePreferredIdentification(event: any, identifier: string) {
  let payload;
  const identification = settings.value['PRDT_IDEN_PREF']?.settingValue ? JSON.parse(settings.value['PRDT_IDEN_PREF'].settingValue) : {}
  identification[identifier] = event.detail.value;
  
  if(settings.value['PRDT_IDEN_PREF']) {
    
    payload = {
      ...settings.value['PRDT_IDEN_PREF'],
      settingValue: JSON.stringify(identification)
    }
  } else {
    payload = {
      fromDate: DateTime.now().toMillis(),
      productStoreId: productStore.value.productStoreId,
      settingTypeEnumId: "PRDT_IDEN_PREF",
      settingValue: JSON.stringify(identification)
    }
  }

  emitter.emit("presentLoader")
  try {
    const resp = await ProductStoreService.updateCurrentStoreSettings(payload);
    if(!hasError(resp)) {
      const settingEnums = Object.keys(settings.value).length ? JSON.parse(JSON.stringify(settings.value)) : {}
      if(settingEnums[payload.settingTypeEnumId]) {
        settingEnums[payload.settingTypeEnumId].settingValue = payload.settingValue;
      } else {
        settingEnums[payload.settingTypeEnumId] = payload;
      }

      store.dispatch("productStore/updateCurrentStoreSettings", settingEnums)
      showToast(translate("Product store setting updated successfully."))
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to update product store settings."))
  }
  emitter.emit("dismissLoader")
}

async function renameProductStore() {
  const alert = await alertController.create({
    header: translate("Product store name"),
    inputs: [{
      name: "storeName",
      value: productStore.value.storeName
    }],
    buttons: [{
      text: translate("Cancel"),
      role: "cancel"
    },
    {
      text: translate("Confirm"),
      handler: async(data) => {
        if(!data.storeName.trim()) {
          showToast(translate("Product store name can't be empty."));
          return false;
        }

        if(data.storeName.trim() === productStore.value.storeName) return;

        const updatedStore = JSON.parse(JSON.stringify(productStore.value));
        updatedStore.storeName = data.storeName.trim();

        try {
          const resp = await ProductStoreService.updateProductStore(updatedStore);

          if(!hasError(resp)) {
            store.dispatch("productStore/updateCurrent", updatedStore);
            showToast(translate("Product store name updated successfully."))
          } else {
            throw resp.data;
          }
        } catch(error: any) {
          logger.error(error);
          showToast(translate("Failed to update product store name."))
        }
      }
    }]
  })

  await alert.present()
}

async function createUpdateTag(enumId: string) {
  const settingEnums = Object.keys(settings.value).length ? JSON.parse(JSON.stringify(settings.value)) : {}
  const alert = await alertController.create({
    header: translate("Create new tag"),
    inputs: [{
      name: "tag",
      value: settingEnums[enumId]?.settingValue,
    }],
    buttons: [{
      text: translate("Cancel"),
      role: "cancel"
    },
    {
      text: settingEnums[enumId]?.settingValue ? translate("Update") : translate("Add"),
      handler: async(data) => {
        if(!data.tag.trim()) {
          showToast(translate("Tags can't be empty."));
          return false;
        }

        if(data.tag.trim() === settingEnums[enumId]?.settingValue) return;

        let payload;
        if(settingEnums[enumId]?.productStoreId) {
          payload = settingEnums[enumId];
          payload.settingValue = data.tag.trim();
        } else {
          payload = {
            fromDate: DateTime.now().toMillis(),
            productStoreId: productStore.value.productStoreId,
            settingTypeEnumId: enumId,
            settingValue: data.tag.trim()
          }
        }

        try {
          const resp = await ProductStoreService.updateCurrentStoreSettings(payload);

          if(!hasError(resp)) {
            if(!settingEnums[enumId]?.productStoreId) settingEnums[enumId] = payload;
            store.dispatch("productStore/updateCurrentStoreSettings", settingEnums)
            showToast(translate("Product store setting updated successfully."))
          } else {
            throw resp.data;
          }
        } catch(error: any) {
          logger.error(error);
          showToast(translate("Failed to update product store settings."))
        }
      }
    }]
  })

  await alert.present()
}

async function removeTag(enumId: string) {
  const settingEnums = Object.keys(settings.value).length ? JSON.parse(JSON.stringify(settings.value)) : {}
  const payload = {
    ...settingEnums[enumId],
    settingValue: ""
  };

  try {
    const resp = await ProductStoreService.updateCurrentStoreSettings(payload);

    if(!hasError(resp)) {
      settingEnums[enumId] = payload;
      store.dispatch("productStore/updateCurrentStoreSettings", settingEnums)
      showToast(translate("Tag removed successfully."))
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to remove tag."))
  }
}

function getBooleanValue(value: any) {
  if(value === 'Y' || value === 'N') {
    return value === 'Y' ? true : false;
  }
  return value;
}

async function updateProductStoreDetail(event: any, fieldName: string, isToggle: boolean) {
  let payload;

  if(isToggle) {
    event.stopImmediatePropagation();
    payload = {[fieldName]: productStore.value[fieldName] === 'Y' ? 'N' : 'Y' };
  } else {
    if((!productStore.value[fieldName] && !event.target.value.trim()) || (productStore.value[fieldName] && productStore.value[fieldName] === event.target.value.trim())) return;
    payload = { [fieldName]: event.target.value };
  }

  emitter.emit("presentLoader")
  try {
    payload = { ...productStore.value, ...payload }
    
    const resp = await ProductStoreService.updateProductStore(payload);
    if(!hasError(resp)) {
      if(fieldName === "daysToCancelNonPay" && (!payload.daysToCancelNonPay || parseInt(payload.daysToCancelNonPay) === 0)) autoCancellationActive.value = false;
      showToast("Product store setting updated successfully.")
      store.dispatch("productStore/updateCurrent", payload)
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to update product store settings."))
  }
  emitter.emit("dismissLoader")
}

async function updateProductStoreSettings(event: any, enumId: string, isToggle: boolean) {
  const settingEnums = Object.keys(settings.value).length ? JSON.parse(JSON.stringify(settings.value)) : {}
  let payload;
  if(isToggle) {
    event.stopImmediatePropagation();

    if(settingEnums[enumId]) {
      payload = settingEnums[enumId]
      
      if(enumId === 'SAVE_BILL_TO_INF' || enumId === 'FULFILL_NOTIF') {
        payload.settingValue = settingEnums[enumId].settingValue === 'Y' ? 'N' : 'Y'
      } else {
        payload.settingValue = settingEnums[enumId].settingValue === "true" ? "false" : "true"
      }
    } else {
      payload = {
        fromDate: DateTime.now().toMillis(),
        productStoreId: productStore.value.productStoreId,
        settingTypeEnumId: enumId,
        settingValue: (enumId === 'SAVE_BILL_TO_INF' || enumId === 'FULFILL_NOTIF') ? "Y" : "true"
      }
    }
  } else {
    if((!settingEnums[enumId]?.settingValue && !event.target.value.trim()) || (settingEnums[enumId]?.settingValue && settingEnums[enumId].settingValue === event.target.value.trim())) return;

    if(settingEnums[enumId]) {
      payload =  {
        ...settingEnums[enumId],
        settingValue: event.target.value
      }
    } else {
      payload = {
        fromDate: DateTime.now().toMillis(),
        productStoreId: productStore.value.productStoreId,
        settingTypeEnumId: enumId,
        settingValue: event.target.value
      }
    }
  }

  emitter.emit("presentLoader")
  try {
    const resp = await ProductStoreService.updateCurrentStoreSettings(payload);
    if(!hasError(resp)) {
      if(settingEnums[enumId]) settingEnums[enumId].settingValue = payload.settingValue
      else settingEnums[enumId] = payload;

      store.dispatch("productStore/updateCurrentStoreSettings", settingEnums)
      showToast(translate("Product store setting updated successfully."))
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to update product store settings."))
  }
  emitter.emit("dismissLoader")
}

async function updateOrderCancellationStatus() {
  if(!autoCancellationActive.value) {
    autoCancellationActive.value = true;
    return;
  }

  const currentStore = JSON.parse(JSON.stringify(productStore.value));
  currentStore.daysToCancelNonPay = 0;

  emitter.emit("presentLoader")
  try {
    const resp = await ProductStoreService.updateProductStore(currentStore);
    if(!hasError(resp)) {
      showToast(translate("Product store setting updated successfully."))
      store.dispatch("productStore/updateCurrent", currentStore)
      autoCancellationActive.value = false;
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    showToast(translate("Failed to update product store settings."))
  }
  emitter.emit("dismissLoader")
}

function validateInput(event: any) {
  if(/[`!@#$%^&*()_+\-=\\|,.<>?~]/.test(event.key)) event.preventDefault();
}

</script>

<style scoped>
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: start;
}

.store-details {
  grid-column: span 2;
}

ion-card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.store-info {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: start; 
}

@media screen and (min-width: 700px) {
  ion-content > main {
    margin: var(--spacer-lg)
  }
}
</style>
