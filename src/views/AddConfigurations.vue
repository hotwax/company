<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/product-store" slot="start"></ion-back-button>
        <ion-title>{{ translate("Add configurations") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button slot="icon-only">
            <ion-icon :icon="informationCircleOutline" />
          </ion-button>
        </ion-buttons>
        <ion-progress-bar value="0.75" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <h1 class="ion-margin-start">{{ translate('Configurations') }}</h1>

        <ion-segment v-model="configMode" class="ion-margin-bottom">
          <ion-segment-button value="manual">
            <ion-label>{{ translate("Configure manually") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="clone">
            <ion-label>{{ translate("Clone settings") }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Manual Configuration Form -->
        <ion-list v-show="configMode === 'manual'">
          <ion-list-header>
            <ion-label>{{ translate("Product") }}</ion-label>
          </ion-list-header>

          <ion-item>
            <ion-icon slot="start" :icon="shirtOutline"/>
            <ion-select interface="popover" :label="translate('Product Identifier')" v-model="formData.productIdentifierEnumId">
              <ion-select-option v-for="identifier in productIdentifiers" :key="identifier.enumId" :value="identifier.enumId">{{ identifier.description || identifier.enumId }}</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-list-header>
            <ion-label>{{ translate("Order") }}</ion-label>
          </ion-list-header>

          <ion-item>
            <ion-toggle :checked="formData.autoApproveOrder" @ionChange="formData.autoApproveOrder = $event.detail.checked">{{ translate("Auto approve orders") }}</ion-toggle>
          </ion-item>
          <ion-item lines="none">
            <ion-input v-model="formData.orderNumberPrefix" label-placement="floating" :label="translate('Sales order ID prefix')" :helper-text="translate('Add a custom prefix to HotWax order IDs: <inputValue>10001')" />
          </ion-item>
        </ion-list>

        <!-- Clone Configuration Form -->
        <ion-list v-show="configMode === 'clone'">
          <ion-item>
            <ion-icon slot="start" :icon="copyOutline"/>
            <ion-select interface="popover" :label="translate('Source Product Store')" :placeholder="translate('Select store')" v-model="selectedSourceStoreId">
              <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">{{ store.storeName || store.productStoreId }}</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-list-header>
            <ion-label>{{ translate("Settings categories to clone") }}</ion-label>
          </ion-list-header>

          <ion-item v-for="(cat, key) in categories" :key="key">
            <ion-checkbox slot="start" v-model="cat.selected" />
            <ion-label>{{ cat.label }}</ion-label>
          </ion-item>
        </ion-list>

        <ion-button class="ion-margin-top" @click="setupProductStore()">
          {{ translate("Setup product store") }}
          <ion-icon slot="end" :icon="arrowForwardOutline"/>
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonProgressBar, IonSelect, IonSelectOption, IonSegment, IonSegmentButton, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { arrowForwardOutline, copyOutline, informationCircleOutline, shirtOutline } from "ionicons/icons";
import { api, commonUtil, emitter, hasError, logger, translate } from '@common'
import router from "@/router";
import { useProductStore } from '@/store/productStore';
import { computed, defineProps, ref } from "vue";
import { useUtilStore } from '@/store/util';

const utilStore = useUtilStore();
const productStoreStore = useProductStore();

const props = defineProps(["productStoreId"]);

const productStore = ref({}) as any;
const configMode = ref("manual");
const selectedSourceStoreId = ref("");
const formData = ref({
  autoApproveOrder: false,
  orderNumberPrefix: "",
  productIdentifierEnumId: "SHOPIFY_PRODUCT_SKU"
})

const categories = ref({
  order: { label: translate("Order configurations"), selected: true },
  brokering: { label: translate("Brokering rules"), selected: true },
  fulfillment: { label: translate("Fulfillment settings"), selected: true },
  inventory: { label: translate("Inventory settings"), selected: true },
  product: { label: translate("Product configurations"), selected: true },
  permissions: { label: translate("Order edit permissions"), selected: true }
}) as any;

const CATEGORY_MAP = {
  order: {
    fields: ["autoApproveOrder", "orderNumberPrefix"],
    settings: ["SAVE_BILL_TO_INF", "RETURN_DEADLINE_DAYS"]
  },
  brokering: {
    fields: ["enableBrokering", "allowSplit"],
    settings: ["PRE_SLCTD_FAC_TAG", "ORD_ITM_SHIP_FAC"]
  },
  fulfillment: {
    fields: ["daysToCancelNonPay"],
    settings: ["FULFILL_NOTIF", "BOPIS_PART_ODR_REJ"]
  },
  inventory: {
    fields: ["reserveInventory"],
    settings: ["HOLD_PRORD_PHYCL_INV", "PRE_ORDER_GROUP_ID"]
  },
  product: {
    fields: ["productIdentifierEnumId"],
    settings: ["PRDT_IDEN_PREF"]
  },
  permissions: {
    fields: [],
    settings: ["CUST_DLVRMTHD_UPDATE", "RF_SHIPPING_METHOD", "CUST_DLVRADR_UPDATE", "CUST_PCKUP_UPDATE", "CUST_ALLOW_CNCL"]
  }
} as any;

const productIdentifiers = computed(() => utilStore.productIdentifiers)
const productStores = computed(() => productStoreStore.productStores.filter((s: any) => s.productStoreId !== props.productStoreId))

onIonViewWillEnter(async () => {
  utilStore.fetchProductIdentifiers();
  fetchProductStore();
  productStoreStore.fetchProductStores();
})

async function fetchProductStore() {
  try {
    const resp = await api({
      url: `admin/productStores/${props.productStoreId}`,
      method: "get"
    })
    if(!commonUtil.hasError(resp)) {
      productStore.value = (resp as any).data;
    } else {
      throw (resp as any).data;
    }
  } catch(error: any) {
    logger.error("Failed to fetch product store details.")
  }
}

async function setupProductStore() {
  emitter.emit("presentLoader");

  try {
    if (configMode.value === "clone") {
      if (!selectedSourceStoreId.value) {
        commonUtil.showToast(translate("Please select a source product store."));
        emitter.emit("dismissLoader");
        return;
      }

      // Fetch source store details and settings
      const [detailsResp, settingsResp] = await Promise.all([
        api({ url: `admin/productStores/${selectedSourceStoreId.value}`, method: "get" }),
        api({ url: `admin/productStores/${selectedSourceStoreId.value}/settings`, method: "get" })
      ]);

      if (commonUtil.hasError(detailsResp)) {
        throw new Error("Failed to fetch source store details");
      }

      const sourceStoreDetails = (detailsResp as any).data;
      const sourceStoreSettings = !commonUtil.hasError(settingsResp) ? (settingsResp as any).data : [];

      // Build target payload by copying direct fields for selected categories
      let targetPayload = { ...productStore.value };

      Object.keys(categories.value).forEach((key: string) => {
        if (categories.value[key].selected) {
          const mapping = CATEGORY_MAP[key];
          mapping.fields.forEach((field: string) => {
            if (sourceStoreDetails[field] !== undefined) {
              targetPayload[field] = sourceStoreDetails[field];
            }
          });
        }
      });

      // Update target store details
      const updateDetailsResp = await productStoreStore.updateProductStore(targetPayload);
      if (commonUtil.hasError(updateDetailsResp)) {
        throw updateDetailsResp.data;
      }

      // Update settings for selected categories
      const settingsPromises: Promise<any>[] = [];
      const activeSourceSettings = sourceStoreSettings.filter((s: any) => !s.thruDate && s.settingValue);

      Object.keys(categories.value).forEach((key: string) => {
        if (categories.value[key].selected) {
          const mapping = CATEGORY_MAP[key];
          const settingsToClone = activeSourceSettings.filter((s: any) => mapping.settings.includes(s.settingTypeEnumId));
          
          settingsToClone.forEach((setting: any) => {
            settingsPromises.push(
              productStoreStore.saveCurrentStoreSettings({
                fromDate: Date.now(),
                productStoreId: props.productStoreId,
                settingTypeEnumId: setting.settingTypeEnumId,
                settingValue: setting.settingValue
              })
            );
          });
        }
      });

      if (settingsPromises.length > 0) {
        await Promise.allSettled(settingsPromises);
      }

      commonUtil.showToast(translate("Product store configurations cloned successfully."));
    } else {
      // Manual flow
      const payload = {
        ...productStore.value,
        orderNumberPrefix: formData.value.orderNumberPrefix,
        autoApproveOrder: formData.value.autoApproveOrder ? "Y" : "N",
        productIdentifierEnumId: formData.value.productIdentifierEnumId
      }

      const resp = await productStoreStore.updateProductStore(payload);
      if (commonUtil.hasError(resp)) {
        throw resp.data;
      }
      commonUtil.showToast(translate("Product store configurations updated successfully."));
    }

    emitter.emit("dismissLoader");
    router.replace(`/product-store-details/${productStore.value.productStoreId}`);
  } catch(error: any) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to save product store configurations."));
  }

  emitter.emit("dismissLoader");
}
</script>

<style scoped>
  @media (min-width: 700px) {
    main {
      max-width: 375px;
      margin: auto;
    }
  }
</style>
