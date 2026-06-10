<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Clone store settings") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <ion-card class="clone-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Clone Settings") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <!-- Source Store Selector -->
              <ion-item>
                <ion-select interface="popover" :label="translate('Source Product Store')" :placeholder="translate('Select store')" v-model="sourceStoreId" @ionChange="clearTargetOnConflict()">
                  <ion-select-option v-for="store in sourceStoresList" :key="store.productStoreId" :value="store.productStoreId">
                    {{ store.storeName || store.productStoreId }}
                  </ion-select-option>
                </ion-select>
              </ion-item>

              <!-- Target Store Selector -->
              <ion-item>
                <ion-select interface="popover" :label="translate('Target Product Store')" :placeholder="translate('Select store')" v-model="targetStoreId">
                  <ion-select-option v-for="store in targetStoresList" :key="store.productStoreId" :value="store.productStoreId">
                    {{ store.storeName || store.productStoreId }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-list class="categories-list">
          <ion-list-header>
            <ion-label>{{ translate("Settings categories to clone") }}</ion-label>
          </ion-list-header>
          <ion-item v-for="(cat, key) in categories" :key="key">
            <ion-checkbox label-placement="end" justify="start" v-model="cat.selected">{{ cat.label }}</ion-checkbox>
          </ion-item>
        </ion-list>

        <ion-card color="warning" class="warning-card" v-if="sourceStoreId && targetStoreId">
          <ion-card-content class="ion-text-center">
            <ion-icon :icon="alertCircleOutline" class="warning-icon" />
            <p>{{ translate("This will overwrite existing settings in the target store for all selected categories.") }}</p>
          </ion-card-content>
        </ion-card>

        <div class="ion-text-center ion-margin-top action-container">
          <ion-button expand="block" :disabled="!sourceStoreId || !targetStoreId || !hasSelectedCategories" @click="confirmClone()">
            <ion-icon slot="start" :icon="copyOutline" />
            {{ translate("Clone settings") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonMenuButton, IonPage, IonSelect, IonSelectOption, IonTitle, IonToolbar, alertController, onIonViewWillEnter } from "@ionic/vue";
import { alertCircleOutline, copyOutline } from "ionicons/icons";
import { api, commonUtil, emitter, logger, translate } from "@common";
import { useProductStore } from "@/store/productStore";
import { computed, ref } from "vue";
import router from "@/router";

const productStoreStore = useProductStore();

const sourceStoreId = ref("");
const targetStoreId = ref("");

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

const productStores = computed(() => productStoreStore.productStores || []);

const sourceStoresList = computed(() => {
  return productStores.value.filter((s: any) => s.productStoreId !== targetStoreId.value);
});

const targetStoresList = computed(() => {
  return productStores.value.filter((s: any) => s.productStoreId !== sourceStoreId.value);
});

const hasSelectedCategories = computed(() => {
  return Object.values(categories.value).some((cat: any) => cat.selected);
});

onIonViewWillEnter(async () => {
  emitter.emit("presentLoader");
  await productStoreStore.fetchProductStores();
  emitter.emit("dismissLoader");
});

function clearTargetOnConflict() {
  if (sourceStoreId.value === targetStoreId.value) {
    targetStoreId.value = "";
  }
}

async function confirmClone() {
  const alert = await alertController.create({
    header: translate("Clone store settings?"),
    message: translate("Are you sure you want to clone settings from the selected store? This will overwrite the target store's settings and cannot be undone."),
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel"
      },
      {
        text: translate("Confirm"),
        handler: () => {
          executeClone();
        }
      }
    ]
  });
  await alert.present();
}

async function executeClone() {
  emitter.emit("presentLoader");
  try {
    // 1. Fetch details and settings of source store, and details of target store
    const [sourceDetailsResp, sourceSettingsResp, targetDetailsResp] = await Promise.all([
      api({ url: `admin/productStores/${sourceStoreId.value}`, method: "get" }),
      api({ url: `admin/productStores/${sourceStoreId.value}/settings`, method: "get" }),
      api({ url: `admin/productStores/${targetStoreId.value}`, method: "get" })
    ]);

    if (commonUtil.hasError(sourceDetailsResp) || commonUtil.hasError(targetDetailsResp)) {
      throw new Error("Failed to fetch product store details");
    }

    const sourceDetails = (sourceDetailsResp as any).data;
    const sourceSettings = !commonUtil.hasError(sourceSettingsResp) ? (sourceSettingsResp as any).data : [];
    const targetDetails = (targetDetailsResp as any).data;

    // 2. Build direct fields payload for target store
    let targetPayload = { ...targetDetails };

    Object.keys(categories.value).forEach((key: string) => {
      if (categories.value[key].selected) {
        const mapping = CATEGORY_MAP[key];
        mapping.fields.forEach((field: string) => {
          if (sourceDetails[field] !== undefined) {
            targetPayload[field] = sourceDetails[field];
          }
        });
      }
    });

    // Update target product store details
    const detailsUpdateResp = await productStoreStore.updateProductStore(targetPayload);
    if (commonUtil.hasError(detailsUpdateResp)) {
      throw detailsUpdateResp.data;
    }

    // 3. Build settings copy promises
    const settingsPromises: Promise<any>[] = [];
    const activeSourceSettings = sourceSettings.filter((s: any) => !s.thruDate && s.settingValue);

    Object.keys(categories.value).forEach((key: string) => {
      if (categories.value[key].selected) {
        const mapping = CATEGORY_MAP[key];
        const settingsToClone = activeSourceSettings.filter((s: any) => mapping.settings.includes(s.settingTypeEnumId));
        
        settingsToClone.forEach((setting: any) => {
          settingsPromises.push(
            productStoreStore.saveCurrentStoreSettings({
              fromDate: Date.now(),
              productStoreId: targetStoreId.value,
              settingTypeEnumId: setting.settingTypeEnumId,
              settingValue: setting.settingValue
            })
          );
        });
      }
    });

    if (settingsPromises.length > 0) {
      const results = await Promise.allSettled(settingsPromises);
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length > 0) {
        logger.warn(`Failed to clone ${failed.length} settings`);
      }
    }

    commonUtil.showToast(translate("Product store settings cloned successfully."));
    router.replace(`/product-store-details/${targetStoreId.value}`);
  } catch (error: any) {
    logger.error("Cloning failed", error);
    commonUtil.showToast(translate("Failed to clone product store settings."));
  } finally {
    emitter.emit("dismissLoader");
  }
}
</script>

<style scoped>
main {
  max-width: 600px;
  margin: var(--spacer-lg) auto;
  padding: 0 var(--spacer-sm);
}

.clone-card {
  margin: 0 0 var(--spacer-lg);
}

.categories-list {
  background: transparent;
  margin-bottom: var(--spacer-lg);
}

.warning-card {
  margin: var(--spacer-md) 0;
}

.warning-icon {
  font-size: 2rem;
  color: var(--ion-color-warning);
  margin-bottom: var(--spacer-xs);
}

.action-container {
  padding: 0 var(--spacer-sm);
}
</style>
