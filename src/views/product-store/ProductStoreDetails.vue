<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/product-store"/>
        <ion-title>{{ productStore.storeName || productStore.productStoreId || "Product store" }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <main>
        <div class="ion-margin-top">
          <h1>Configuration</h1>
          <section>
            <ion-item class="item-box" lines="none">
              <ion-label class="ion-text-wrap">
                {{ productStore.storeName || productStore.productStoreId || "Product store" }}
                <p>{{ productStore.productStoreId }}</p>
              </ion-label>
            </ion-item>
            <ion-item class="item-box" lines="none">
              <ion-label class="ion-text-wrap">
                Operating countries
                <p>{{ translate(dbicCountriesCount == 1 ? "country" : "countries", {count: dbicCountriesCount}) }}</p>
              </ion-label>
            </ion-item>
          </section>
        </div>

        <div class="ion-margin-top" v-for="section in productStoreSections" :key="section.title">
          <h1>{{ section.title }}</h1>
          <section>
            <ion-item v-for="field in section.fields" :key="field.name" class="item-box" lines="none">
              <ion-label v-if="field.type === 'indicator'" class="ion-text-wrap">
                {{ field.label }}
                <p>{{ field.name }}</p>
              </ion-label>
              <ion-toggle
                v-if="field.type === 'indicator'"
                slot="end"
                :checked="getIndicatorValue(productStore[field.name])"
                :disabled="field.readonly"
                @click.prevent="updateProductStoreIndicator($event, field)"
              />

              <ion-textarea
                v-else-if="field.type === 'long-varchar'"
                :label="field.label"
                label-placement="stacked"
                :helper-text="field.name"
                :auto-grow="true"
                :value="getProductStoreValue(field)"
                :readonly="field.readonly"
                @ionBlur="updateProductStoreField($event, field)"
              />

              <ion-input
                v-else
                :label="field.label"
                label-placement="stacked"
                :helper-text="field.name"
                :type="field.type === 'numeric' ? 'number' : 'text'"
                :maxlength="field.maxlength"
                :value="getProductStoreValue(field)"
                :readonly="field.readonly"
                @keydown="field.type === 'numeric' ? validateInput($event) : undefined"
                @keydown.enter="updateProductStoreField($event, field)"
                @ionBlur="updateProductStoreField($event, field)"
              />
            </ion-item>
          </section>
        </div>

        <div class="ion-margin-top" v-for="section in productStoreSettingSections" :key="section.title">
          <h1>{{ section.title }}</h1>
          <section>
            <ion-item v-for="setting in section.settings" :key="setting.name" class="item-box" lines="none">
              <ion-label v-if="setting.control === 'toggle'" class="ion-text-wrap">
                {{ setting.label }}
                <p>{{ setting.name }}</p>
              </ion-label>
              <ion-toggle
                v-if="setting.control === 'toggle'"
                slot="end"
                :checked="getSettingBooleanValue(setting)"
                @click.prevent="updateProductStoreSettingToggle($event, setting)"
              />

              <ion-input
                v-else-if="setting.control === 'number'"
                :label="setting.label"
                label-placement="stacked"
                :helper-text="setting.name"
                type="number"
                :value="getSettingValue(setting)"
                @keydown="validateInput($event)"
                @keydown.enter="updateProductStoreSettingValue($event, setting)"
                @ionBlur="updateProductStoreSettingValue($event, setting)"
              />

              <ion-textarea
                v-else
                :label="setting.label"
                label-placement="stacked"
                :helper-text="setting.name"
                :auto-grow="true"
                :value="getSettingValue(setting)"
                @ionBlur="updateProductStoreSettingValue($event, setting)"
              />
            </ion-item>
          </section>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonPage, IonTextarea, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { commonUtil, emitter, logger, translate } from '@common'
import { useProductStore } from '@/store/productStore';
import { useUtilStore } from '@/store/util';
import { computed, defineProps } from "vue";
import { DateTime } from "luxon";

type ProductStoreFieldType = "id" | "id-ne" | "id-long" | "name" | "description" | "numeric" | "indicator" | "very-short" | "long-varchar" | "url";

type ProductStoreField = {
  name: string;
  label: string;
  type: ProductStoreFieldType;
  maxlength?: number;
  readonly?: boolean;
};

type ProductStoreSettingConfig = {
  name: string;
  label: string;
  control: "toggle" | "number" | "textarea";
  booleanFormat?: "yn" | "true-false";
};

const props = defineProps(["productStoreId"]);
const productStoreStore = useProductStore();
const utilStore = useUtilStore();

const productStore = computed(() => productStoreStore.getCurrent)
const settings = computed(() => productStoreStore.currentStoreSettings)
const dbicCountriesCount = computed(() => utilStore.dbicCountriesCount)

const idMaxLength = 20;
const idLongMaxLength = 60;
const veryShortMaxLength = 10;

const productStoreSections: Array<{ title: string; fields: ProductStoreField[] }> = [
  {
    title: "Store identity and defaults",
    fields: [
      field("productStoreId", "Product store ID", "id", { readonly: true }),
      field("primaryStoreGroupId", "Primary store group ID", "id"),
      field("storeName", "Store name", "name"),
      field("companyName", "Company name", "name"),
      field("title", "Title", "name"),
      field("subtitle", "Subtitle", "description"),
      field("payToPartyId", "Pay to party ID", "id"),
      field("visualThemeId", "Visual theme ID", "id"),
      field("defaultLocaleString", "Default locale", "very-short"),
      field("defaultTimeZoneString", "Default time zone", "id-long")
    ]
  },
  {
    title: "Order import and checkout",
    fields: [
      field("orderNumberPrefix", "Order number prefix", "id-long"),
      field("defaultCurrencyUomId", "Default currency", "id"),
      field("defaultSalesChannelEnumId", "Default sales channel", "id-ne"),
      field("viewCartOnAdd", "View cart on add", "indicator"),
      field("autoSaveCart", "Auto save cart", "indicator"),
      field("allowPassword", "Allow password", "indicator"),
      field("defaultPassword", "Default password", "long-varchar"),
      field("usePrimaryEmailUsername", "Use primary email username", "indicator"),
      field("requireCustomerRole", "Require customer role", "indicator"),
      field("retryFailedAuths", "Retry failed authorizations", "indicator"),
      field("allowComment", "Allow comments", "indicator"),
      field("orderDecimalQuantity", "Allow decimal order quantity", "indicator")
    ]
  },
  {
    title: "Approval, payment, and accounting",
    fields: [
      field("manualAuthIsCapture", "Manual authorization is capture", "indicator"),
      field("autoApproveOrder", "Auto approve order", "indicator"),
      field("autoApproveInvoice", "Auto approve invoice", "indicator"),
      field("shipIfCaptureFails", "Ship if capture fails", "indicator"),
      field("checkGcBalance", "Check gift card balance", "indicator"),
      field("selectPaymentTypePerItem", "Select payment type per item", "indicator"),
      field("splitPayPrefPerShpGrp", "Split payment preference per ship group", "indicator"),
      field("storeCreditAccountEnumId", "Store credit account enum ID", "id-ne"),
      field("storeCreditValidDays", "Store credit valid days", "numeric")
    ]
  },
  {
    title: "Inventory and product behavior",
    fields: [
      field("inventoryFacilityId", "Inventory facility ID", "id"),
      field("oneInventoryFacility", "One inventory facility", "indicator"),
      field("checkInventory", "Check inventory", "indicator"),
      field("reserveInventory", "Reserve inventory", "indicator"),
      field("reserveOrderEnumId", "Reserve order enum ID", "id-ne"),
      field("requireInventory", "Require inventory", "indicator"),
      field("balanceResOnOrderCreation", "Balance reservations on order creation", "indicator"),
      field("requirementMethodEnumId", "Requirement method enum ID", "id-ne"),
      field("isImmediatelyFulfilled", "Immediately fulfilled", "indicator"),
      field("explodeOrderItems", "Explode order items", "indicator"),
      field("prodSearchExcludeVariants", "Exclude variants from product search", "indicator"),
      field("showOutOfStockProducts", "Show out of stock products", "indicator"),
      field("managedByLot", "Managed by lot", "indicator"),
      field("setOwnerUponIssuance", "Set owner upon issuance", "indicator"),
      field("productIdentifierEnumId", "Product identifier enum ID", "id-ne")
    ]
  },
  {
    title: "Digital, tax, and returns",
    fields: [
      field("autoInvoiceDigitalItems", "Auto invoice digital items", "indicator"),
      field("reqShipAddrForDigItems", "Require ship address for digital items", "indicator"),
      field("showCheckoutGiftOptions", "Show checkout gift options", "indicator"),
      field("showPricesWithVatTax", "Show prices with VAT tax", "indicator"),
      field("showTaxIsExempt", "Show tax is exempt", "indicator"),
      field("vatTaxAuthGeoId", "VAT tax auth geo ID", "id"),
      field("vatTaxAuthPartyId", "VAT tax auth party ID", "id"),
      field("reqReturnInventoryReceive", "Require return inventory receive", "indicator"),
      field("daysToCancelNonPay", "Days to cancel non-pay orders", "numeric")
    ]
  },
  {
    title: "Customer and suggestion behavior",
    fields: [
      field("enableAutoSuggestionList", "Enable auto suggestion list", "indicator"),
      field("enableDigProdUpload", "Enable digital product upload", "indicator"),
      field("digProdUploadCategoryId", "Digital product upload category ID", "id")
    ]
  },
  {
    title: "Order statuses and customer messages",
    fields: [
      field("headerApprovedStatus", "Header approved status", "id"),
      field("itemApprovedStatus", "Item approved status", "id"),
      field("digitalItemApprovedStatus", "Digital item approved status", "id"),
      field("headerDeclinedStatus", "Header declined status", "id"),
      field("itemDeclinedStatus", "Item declined status", "id"),
      field("headerCancelStatus", "Header cancel status", "id"),
      field("itemCancelStatus", "Item cancel status", "id"),
      field("authDeclinedMessage", "Authorization declined message", "long-varchar"),
      field("authFraudMessage", "Authorization fraud message", "long-varchar"),
      field("authErrorMessage", "Authorization error message", "long-varchar")
    ]
  },
  {
    title: "Auto order retries",
    fields: [
      field("autoOrderCcTryExp", "Auto order try card expiration", "indicator"),
      field("autoOrderCcTryOtherCards", "Auto order try other cards", "indicator"),
      field("autoOrderCcTryLaterNsf", "Auto order try later for NSF", "indicator"),
      field("autoOrderCcTryLaterMax", "Auto order try later max", "numeric")
    ]
  },
  {
    title: "Deprecated storefront fields",
    fields: [
      field("oldStyleSheet", "Old style sheet", "url"),
      field("oldHeaderLogo", "Old header logo", "url"),
      field("oldHeaderMiddleBackground", "Old header middle background", "url"),
      field("oldHeaderRightBackground", "Old header right background", "url")
    ]
  }
];

const productStoreSettingSections: Array<{ title: string; settings: ProductStoreSettingConfig[] }> = [
  {
    title: "Order import and approval settings",
    settings: [
      setting("SAVE_BILL_TO_INF", "Save bill to information", "toggle", "yn"),
      setting("APPR_WO_PMNT_CHK", "Allow order approval without payment check", "toggle", "yn"),
      setting("CAPTURE_PAYMENT_TAG", "Capture payment tag", "textarea")
    ]
  },
  {
    title: "Returns and cancellation settings",
    settings: [
      setting("RETURN_DEADLINE_DAYS", "Return deadline days", "number"),
      setting("RTN_RSTCK_FAC", "Restock returns facility", "textarea"),
      setting("AUTO_REJ_IDLE_ORD", "Auto reject idle orders", "number")
    ]
  },
  {
    title: "Inventory and preorder settings",
    settings: [
      setting("HOLD_PRORD_PHYCL_INV", "Hold pre-order physical inventory", "toggle", "true-false"),
      setting("INV_CNT_VIEW_QOH", "View QOH while inventory counting", "toggle", "true-false"),
      setting("PRE_ORDER_GROUP_ID", "Pre-order group ID", "textarea"),
      setting("REL_PREORD_ROUGRP_ID", "Release preorder routing group ID", "textarea"),
      setting("EX_INV_BY_PRD_TYPE", "Exclude inventory by product type", "textarea")
    ]
  },
  {
    title: "Brokering and routing settings",
    settings: [
      setting("BRK_SHPMNT_THRESHOLD", "Brokering shipment threshold", "number"),
      setting("PRE_SLCTD_FAC_TAG", "Pre-selected facility tag", "textarea"),
      setting("ORD_ITM_PICKUP_FAC", "Order item pickup facility", "textarea"),
      setting("ORD_ITM_SHIP_FAC", "Order item ship facility", "textarea"),
      setting("ORD_ITM_SHIP_METH", "Order item shipment method", "textarea")
    ]
  },
  {
    title: "Fulfillment operations settings",
    settings: [
      setting("FULFILL_NOTIF", "Fulfillment notifications", "toggle", "yn"),
      setting("FULFILL_FORCE_SCAN", "Fulfillment force scan", "toggle", "true-false"),
      setting("FULFILL_PART_ODR_REJ", "Fulfillment partial order rejection", "toggle", "true-false"),
      setting("DISABLE_SHIPNOW", "Disable ship now", "toggle", "true-false"),
      setting("DISABLE_UNPACK", "Disable unpack", "toggle", "true-false"),
      setting("RECEIVE_FORCE_SCAN", "Receiving force scan", "toggle", "true-false")
    ]
  },
  {
    title: "Store pickup and BOPIS settings",
    settings: [
      setting("BOPIS_PART_ODR_REJ", "BOPIS partial order rejection", "toggle", "true-false"),
      setting("DEFULT_PKG_BOPIS_ORD", "Default package for BOPIS orders", "textarea"),
      setting("SHOW_SHIPPING_ORDERS", "Show shipping orders", "toggle", "true-false"),
      setting("PRINT_PACKING_SLIPS", "Print packing slips", "toggle", "true-false"),
      setting("PRINT_PICKLISTS", "Print picklists", "toggle", "true-false"),
      setting("ENABLE_TRACKING", "Enable tracking", "toggle", "true-false")
    ]
  },
  {
    title: "Customer self-service settings",
    settings: [
      setting("CUST_ALLOW_CNCL", "Allow customer cancellation", "toggle", "true-false"),
      setting("CUST_DLVRADR_UPDATE", "Allow delivery address update", "toggle", "true-false"),
      setting("CUST_DLVRMTHD_UPDATE", "Allow delivery method update", "toggle", "true-false"),
      setting("CUST_PCKUP_UPDATE", "Allow pickup update", "toggle", "true-false"),
      setting("RF_SHIPPING_METHOD", "Reroute fulfillment shipping method", "textarea")
    ]
  },
  {
    title: "Shipping and carrier settings",
    settings: [
      setting("RATE_SHOPPING", "Rate shopping", "toggle", "yn"),
      setting("DEFAULT_CARRIER", "Default carrier", "textarea")
    ]
  },
  {
    title: "Packing and document settings",
    settings: [
      setting("PCKGING_BOX_ALGO", "Packaging box algorithm", "textarea"),
      setting("PKG_SLIP", "Packing slip", "textarea")
    ]
  },
  {
    title: "Product identity and scanning settings",
    settings: [
      setting("PRDT_IDEN_PREF", "Product identification preference", "textarea"),
      setting("BARCODE_IDEN_PREF", "Barcode identification preference", "textarea")
    ]
  },
  {
    title: "Notifications and Shopify behavior settings",
    settings: [
      setting("DIS_REJ_NOTI_ON_CNCL", "Disable rejection notification on Shopify cancellation", "toggle", "yn")
    ]
  },
  {
    title: "Rejection and exception settings",
    settings: [
      setting("AFFECT_QOH_ON_REJ", "Affect QOH on rejection", "toggle", "yn"),
      setting("REJ_ITM_CC_CRT", "Create cycle count for rejected items", "toggle", "true-false"),
      setting("FF_COLLATERAL_REJ", "Fulfillment collateral rejection", "toggle", "true-false"),
      setting("FF_USE_NEW_REJ_API", "Fulfillment use new rejection API", "toggle", "true-false")
    ]
  }
];

onIonViewWillEnter(async() => {
  emitter.emit("presentLoader");
  await Promise.allSettled([
    utilStore.fetchDBICCountries(),
    productStoreStore.fetchProductStoreDetails(props.productStoreId),
    productStoreStore.fetchCurrentStoreSettings(props.productStoreId)
  ])
  emitter.emit("dismissLoader");
})

function field(name: string, label: string, type: ProductStoreFieldType, options: Partial<ProductStoreField> = {}): ProductStoreField {
  return {
    name,
    label,
    type,
    maxlength: getMaxlength(type),
    ...options
  }
}

function setting(name: string, label: string, control: ProductStoreSettingConfig["control"], booleanFormat?: ProductStoreSettingConfig["booleanFormat"]): ProductStoreSettingConfig {
  return {
    name,
    label,
    control,
    booleanFormat
  }
}

function getMaxlength(type: ProductStoreFieldType) {
  if(type === "id" || type === "id-ne") return idMaxLength;
  if(type === "id-long") return idLongMaxLength;
  if(type === "very-short") return veryShortMaxLength;
  return undefined;
}

function getProductStoreValue(field: ProductStoreField) {
  const value = productStore.value?.[field.name];
  return value === undefined || value === null ? "" : String(value);
}

function getSettingValue(setting: ProductStoreSettingConfig) {
  const value = settings.value?.[setting.name]?.settingValue;
  return value === undefined || value === null ? "" : String(value);
}

function getIndicatorValue(value: any) {
  return value === "Y" || value === true;
}

function getSettingBooleanValue(setting: ProductStoreSettingConfig) {
  const value = getSettingValue(setting);
  if(setting.booleanFormat === "yn") return value === "Y";
  return value === "true" || value === "Y" || value === "1";
}

function getEventValue(event: any) {
  const value = event?.detail?.value ?? event?.target?.value ?? "";
  return value === undefined || value === null ? "" : String(value);
}

async function updateProductStoreIndicator(event: any, field: ProductStoreField) {
  event.stopImmediatePropagation?.();
  if(field.readonly) return;
  const nextValue = getIndicatorValue(productStore.value?.[field.name]) ? "N" : "Y";
  await saveProductStoreField(field, nextValue);
}

async function updateProductStoreField(event: any, field: ProductStoreField) {
  if(field.readonly) return;
  const nextValue = getEventValue(event).trim();
  if(getProductStoreValue(field) === nextValue) return;
  await saveProductStoreField(field, nextValue);
}

async function saveProductStoreField(field: ProductStoreField, value: any) {
  emitter.emit("presentLoader")
  try {
    const payload = { ...productStore.value, [field.name]: value }
    const resp = await productStoreStore.updateProductStore(payload);
    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Product store setting updated successfully."))
      productStoreStore.updateCurrent(payload)
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to update product store settings."))
  }
  emitter.emit("dismissLoader")
}

async function updateProductStoreSettingToggle(event: any, setting: ProductStoreSettingConfig) {
  event.stopImmediatePropagation?.();
  const checked = getSettingBooleanValue(setting);
  const nextValue = setting.booleanFormat === "yn"
    ? (checked ? "N" : "Y")
    : (checked ? "false" : "true");
  await saveProductStoreSetting(setting, nextValue);
}

async function updateProductStoreSettingValue(event: any, setting: ProductStoreSettingConfig) {
  const nextValue = getEventValue(event).trim();
  if(getSettingValue(setting) === nextValue) return;
  await saveProductStoreSetting(setting, nextValue);
}

async function saveProductStoreSetting(setting: ProductStoreSettingConfig, settingValue: string) {
  const settingEnums = Object.keys(settings.value).length ? JSON.parse(JSON.stringify(settings.value)) : {}
  const payload = settingEnums[setting.name]
    ? { ...settingEnums[setting.name], settingValue }
    : {
      fromDate: DateTime.now().toMillis(),
      productStoreId: productStore.value.productStoreId,
      settingTypeEnumId: setting.name,
      settingValue
    }

  emitter.emit("presentLoader")
  try {
    const resp = await productStoreStore.saveCurrentStoreSettings(payload);
    if(!commonUtil.hasError(resp)) {
      settingEnums[setting.name] = payload;
      productStoreStore.updateCurrentStoreSettings(settingEnums)
      commonUtil.showToast(translate("Product store setting updated successfully."))
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to update product store settings."))
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
