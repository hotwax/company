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
                <ion-label slot="end">{{ dbicCountriesCount > 1 ? translate("countries", {count: dbicCountriesCount}) : translate("country", {count: dbicCountriesCount}) }}</ion-label>
              </ion-item>

              <ion-item>
                <ion-icon :icon="thunderstormOutline" slot="start"/>
                <ion-toggle :checked="getBooleanValue(productStore.enableBrokering)">{{ translate("Order brokering") }}</ion-toggle>
              </ion-item>

              <ion-item lines="none">
                <ion-icon :icon="wineOutline" slot="start"/>
                <ion-toggle :checked="getBooleanValue(productStore.reserveInventory)">{{ translate("Inventory reservation") }}</ion-toggle>
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
                <ion-input :label="translate('Id prefix')" :value="productStore.orderNumberPrefix" />
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <p>{{ translate("Specify any preferred prefix to be added to internal order IDs.") }}</p>
                </ion-label>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['SAVE_BILL_TO_INF']?.settingValue)">{{ translate("Save billing information") }}</ion-toggle>
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
                <ion-toggle :checked="getBooleanValue(productStore.autoApproveOrder)">{{ translate("Approve on import") }}</ion-toggle>
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
                <ion-input :label="translate('Create deadline days')" :value="settings['RETURN_DEADLINE_DAYS']?.settingValue" />
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
                <ion-label>{{ translate("Seat Allocation") }}</ion-label>
              </ion-item-divider>

              <ion-item>
                <ion-label>{{ translate("Preselected facility tag") }}</ion-label>
                <ion-chip outline @click="createUpdateTag(settings['PRE_SLCTD_FAC_TAG'].settingValue)" v-if="settings['PRE_SLCTD_FAC_TAG']?.settingValue">{{ settings['PRE_SLCTD_FAC_TAG'].settingValue }}</ion-chip>
                <ion-button fill="clear" @click="createUpdateTag()" v-else>
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
                <ion-chip outline @click="createUpdateTag(settings['ORD_ITM_SHIP_FAC'].settingValue)" v-if="settings['ORD_ITM_SHIP_FAC']?.settingValue">{{ settings['ORD_ITM_SHIP_FAC'].settingValue }}</ion-chip>
                <ion-button fill="clear" @click="createUpdateTag()" v-else>
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
                <ion-toggle :checked="productStore.allowSplit">{{ translate("Order splitting") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-input :label="translate('Minimum shipment threshold')" :value="settings['BRK_SHPMNT_THRESHOLD']?.settingValue" />
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
                  <ion-toggle :checked="getBooleanValue(settings['FULFILL_NOTIF']?.settingValue)">{{ translate("Send notification to Shopify") }}</ion-toggle>
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
                  <ion-toggle>{{ translate("Auto order cancellation") }}</ion-toggle>
                </ion-item>
  
                <ion-item>
                  <ion-input :label="translate('Auto cancellations days')" :value="productStore.daysToCancelNonPay" />
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
                  <ion-toggle :checked="getBooleanValue(settings['BOPIS_PART_ODR_REJ']?.settingValue)">{{ translate("Partial order rejection") }}</ion-toggle>
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
                <ion-toggle :checked="getBooleanValue(settings['INV_CNT_VIEW_QOH']?.settingValue)">{{ translate("Show systemic inventory") }}</ion-toggle>
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
                <ion-toggle :checked="getBooleanValue(settings['HOLD_PRORD_PHYCL_INV']?.settingValue)">{{ translate("Hold pre-order physical inventory") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Pre-order group')" interface="popover" :value="settings['PRE_ORDER_GROUP_ID']?.settingValue">
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
                <ion-select :label="translate('Global identifier')" interface="popover" :value="productStore.productIdentifierEnumId">
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
                <ion-select :label="translate('Primary identifier')" interface="popover" value="">
                  <ion-select-option v-for="option in productIdentificationOptions" :key="option" :value="option">{{ option }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Secondary identifier')" interface="popover" value="">
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
                <ion-toggle :checked="getBooleanValue(settings['CUST_DLVR_MTHD_UPD']?.settingValue)">{{ translate("Delivery method") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-select :label="translate('Shipment method')" interface="popover" :value="settings['RF_SHIP_MTHD']?.settingValue ? settings['RF_SHIP_MTHD'].settingValue : shipmentMethodTypes[0].shipmentMethodTypeId">
                  <ion-select-option v-for="shipmentMethod in shipmentMethodTypes" :key="shipmentMethod.shipmentMethodTypeId" :value="shipmentMethod.shipmentMethodTypeId">{{ shipmentMethod.description ? shipmentMethod.description : shipmentMethod.shipmentMethodTypeId }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['CUST_DLVRADR_UPDATE']?.settingValue)">{{ translate("Delivery address") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['ORD_ITM_PICKUP_FAC']?.settingValue)">{{ translate("Pick up location") }}</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-toggle :checked="getBooleanValue(settings['CUST_ALLOW_CNCL']?.settingValue)">{{ translate("Cancel order before fulfillment") }}</ion-toggle>
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
import { addCircleOutline, mapOutline, thunderstormOutline, wineOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useStore } from "vuex";
import { computed, defineProps } from "vue";
import { hasError, showToast } from "@/utils";
import logger from "@/logger";
import { ProductStoreService } from "@/services/ProductStoreService";

const props = defineProps(["productStoreId"]);
const store = useStore();

const productIdentificationOptions = ["productId", "groupId", "groupName", "internalName", "parentProductName", "primaryProductCategoryName", "sku", "title", "SHOPIFY_PROD_SKU"];

const facilityGroups = computed(() => store.getters["util/getFacilityGroups"])
const productStore = computed(() => store.getters["productStore/getCurrent"])
const settings = computed(() => store.getters["productStore/getCurrentStoreSettings"])
const dbicCountriesCount = computed(() => store.getters["util/getDBICCountriesCount"])
const productIdentifiers = computed(() => store.getters["util/getProductIdentifiers"])
const shipmentMethodTypes = computed(() => store.getters["util/getShipmentMethodTypes"])

onIonViewWillEnter(async() => {
  await Promise.allSettled([store.dispatch("util/fetchDBICCountries"), store.dispatch("productStore/fetchProductStoreDetails", props.productStoreId), store.dispatch("productStore/fetchCurrentStoreSettings", props.productStoreId), store.dispatch("util/fetchFacilityGroups"), store.dispatch("util/fetchProductIdentifiers"), store.dispatch("util/fetchShipmentMethodTypes", { pageSize: 250 })])
})

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
        if(!data.storeName) {
          showToast(translate("Product store name can't be empty."));
          return false;
        }

        if(data.storeName === productStore.value.storeName) return;

        const updatedStore = JSON.parse(JSON.stringify(productStore.value));
        updatedStore.storeName = data.storeName;

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

async function createUpdateTag(tag?: any) {
  const alert = await alertController.create({
    header: translate("Create new tag"),
    inputs: [{
      name: "storeName",
      value: tag,
    }],
    buttons: [{
      text: translate("Cancel"),
      role: "cancel"
    },
    {
      text: translate("Add")
    }]
  })

  await alert.present()
}

function getBooleanValue(value: any) {
  if(value === 'Y' || value === 'N') {
    return value === 'Y' ? true : false;
  }
  return value;
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
