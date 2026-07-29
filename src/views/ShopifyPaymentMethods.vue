<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Back" @click="navigateBack">
            <ion-icon slot="icon-only" :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Payment methods") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openCreatePaymentMethodModal">
            <ion-icon slot="start" :icon="addOutline" />
            {{ translate("Add") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map payment methods") }}
            <p>{{ translate("For synchronization to work correctly, payment methods from Shopify must be mapped to Hotwax payment method IDs.") }}</p>
          </ion-label>
        </ion-item>
      </div>

      <div v-if="isLoading">
        <div class="list-item ion-padding-end" v-for="i in 5" :key="i">
          <ion-item lines="none">
            <ion-label>
              <ion-skeleton-text animated style="width: 60%" />
              <p><ion-skeleton-text animated style="width: 40%" /></p>
            </ion-label>
          </ion-item>
          <div class="ion-text-center">
            <ion-skeleton-text animated style="width: 80px; height: 32px; border-radius: 16px;" />
          </div>
        </div>
      </div>

      <div v-else class="list-item ion-padding-end" v-for="paymentMethod in paymentMethods" :key="paymentMethod.paymentMethodTypeId">
        <ion-item lines="none" button @click="editItem(paymentMethod.paymentMethodTypeId)">
          <ion-label>
            {{ paymentMethod.description }}
            <p>{{ paymentMethod.paymentMethodTypeId }}</p>
          </ion-label>
        </ion-item>

        <!-- Shopify Mapping (Inline Edit) -->
        <div class="ion-text-end mapping-container">
          <div v-if="editingItemId === paymentMethod.paymentMethodTypeId || isItemDirty(paymentMethod.paymentMethodTypeId)" class="edit-controls">
            <ion-input :autofocus="editingItemId === paymentMethod.paymentMethodTypeId" :placeholder="translate('Shopify ID')" v-model="localMappings[paymentMethod.paymentMethodTypeId]" class="inline-input" />
            <ion-button fill="clear" @click.stop="saveMapping(paymentMethod.paymentMethodTypeId)">
              <ion-icon slot="icon-only" :icon="saveOutline" />
            </ion-button>
          </div>
          <div v-else @click="editItem(paymentMethod.paymentMethodTypeId)">
            <ion-chip outline v-if="getShopifyMapping(paymentMethod.paymentMethodTypeId)" class="ion-no-margin">
              <ion-label>{{ getShopifyMapping(paymentMethod.paymentMethodTypeId) }}</ion-label>
            </ion-chip>
            <ion-button v-else size="small" fill="outline">
              <ion-icon :icon="addOutline" slot="start"/>
              <ion-label>{{ translate("Shopify ID") }}</ion-label>
            </ion-button>
          </div>
        </div>
      </div>

      <ion-modal :is-open="showCreatePaymentMethodModal" @didDismiss="closeCreatePaymentMethodModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeCreatePaymentMethodModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Create payment method") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list>
            <ion-item>
              <ion-input
                v-model="description"
                :label="translate('Payment method name')"
                label-placement="stacked"
                :placeholder="translate('e.g. Store Credit')"
                :maxlength="60"
                @ionInput="resetState" />
            </ion-item>

            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <p>{{ translate("Hotwax ID") }}: <ion-text color="primary">{{ derivedId || "—" }}</ion-text></p>
              </ion-label>
            </ion-item>

            <ion-item lines="none" v-if="duplicateWarning">
              <ion-note color="warning">{{ translate("A payment method with this Hotwax ID already exists.") }}</ion-note>
            </ion-item>

            <ion-item>
              <ion-input
                v-model="shopifyId"
                :label="translate('Shopify ID')"
                label-placement="stacked"
                :placeholder="translate('Shopify payment method')" />
            </ion-item>
          </ion-list>
        </ion-content>

        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button :disabled="!canSave" @click="createPaymentMethod()">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { alertController, IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonNote, IonPage, IonSkeletonText, IonText, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, arrowBackOutline, closeOutline, saveOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { shouldPopHistoryOnBack } from "@/utils/navigation";
import { useShopifyShopMutations, useShopifyTypeMappings } from "@/composables/useShopify";
import { createPaymentMethodType } from "@/composables/useSeed";
import { usePaymentMethodTypes } from '@/composables/useSeed';
import { refreshAfterMutation, resyncDomain } from '@/services/appCacheBootstrap';

const props = defineProps(['id']);
const shopMutations = useShopifyShopMutations(props.id);
// `refreshing` is toggled by the create/refresh flow; the skeleton also covers cache hydration.
const refreshing = ref(false);
const isLoading = computed(() => refreshing.value || !hydrated.value);
const editingItemId = ref("");
const localMappings = ref<any>({});

const { mappings: shopifyTypeMappings, hydrated } = useShopifyTypeMappings(props.id, "SHOPIFY_PAYMENT_TYPE");
// Cached reference data; `resyncDomain('paymentMethodType')` refreshes it after a create. The page
// previously read the same list twice — once from the cache and once from the netSuite store.
const { paymentMethodTypes } = usePaymentMethodTypes();
const paymentMethods = paymentMethodTypes;
const backHref = computed(() => {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo")
  return returnTo || `/shopify-connection-details/${props.id}`
})

const isDirty = computed(() => {
  return Object.keys(localMappings.value).some(id => {
    const local = localMappings.value[id];
    const original = getShopifyMapping(id);
    return local !== original;
  });
});

const showCreatePaymentMethodModal = ref(false);
const existingPaymentTypes = ref<any[]>([]);
const description = ref("");
const shopifyId = ref("");
const trimmedDescription = computed(() => description.value.trim());
const createdTypeIds = ref(new Set<string>());

const derivedId = computed(() => description.value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
);

const existingTypeIds = computed(() => {
  const ids = new Set<string>();
  const addTypeId = (rawId: any) => {
    const normalized = String(rawId || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (normalized) {
      ids.add(normalized);
    }
  };

  (existingPaymentTypes.value || []).forEach((type: any) => {
    addTypeId(type?.paymentMethodTypeId);
  });
  (paymentMethodTypes.value || []).forEach((type: any) => {
    addTypeId(type?.paymentMethodTypeId);
  });

  return ids;
});

const duplicateWarning = computed(() => {
  return Boolean(
    derivedId.value &&
    existingTypeIds.value.has(derivedId.value) &&
    !createdTypeIds.value.has(derivedId.value)
  );
});

const canSave = computed(() => {
  return Boolean(derivedId.value && shopifyId.value.trim()) && !duplicateWarning.value;
});


// `initializeLocalMappings` reads BOTH cached sources, which emit from IndexedDB independently.
// Watching only one meant that if the other had not arrived yet the local map was built empty and
// never rebuilt — every row then compared `undefined` against its real mapping, looked "dirty",
// and rendered the edit input instead of the mapped value. `immediate` also seeds a warm cache.
watch([shopifyTypeMappings, paymentMethods], () => {
  initializeLocalMappings();
}, { deep: true, immediate: true });

function initializeLocalMappings() {
  const mappings: any = {};
  (paymentMethods.value || []).forEach((paymentMethod: any) => {
    mappings[paymentMethod.paymentMethodTypeId] = getShopifyMapping(paymentMethod.paymentMethodTypeId);
  });
  localMappings.value = mappings;
}

function isItemDirty(id: string) {
  const local = localMappings.value[id];
  const original = getShopifyMapping(id);
  return local !== original;
}

function getShopifyMapping(paymentMethodTypeId: any) {
  const shopifyMapping = shopifyTypeMappings.value.find((mapping: any) => mapping.mappedValue === paymentMethodTypeId);
  return shopifyMapping ? shopifyMapping.mappedKey : "";
}

async function editItem(id: string) {
  editingItemId.value = id;
  await nextTick();
  const input = document.querySelector('ion-input[autofocus]') as any;
  if (input) {
    input.setFocus();
    const nativeInput = await input.getInputElement();
    nativeInput.select();
  }
}

function openCreatePaymentMethodModal() {
  description.value = "";
  shopifyId.value = "";
  createdTypeIds.value = new Set<string>();
  existingPaymentTypes.value = paymentMethods.value;
  showCreatePaymentMethodModal.value = true;
}

function closeCreatePaymentMethodModal() {
  showCreatePaymentMethodModal.value = false;
}

function resetState() {
  const trimmed = description.value.trim();
  if (trimmed) {
    return;
  }
  shopifyId.value = "";
}

async function createPaymentMethod() {
  if(!canSave.value) {return}

  const paymentMethodTypeId = derivedId.value;
  emitter.emit("presentLoader");

  try {
    if (!existingTypeIds.value.has(paymentMethodTypeId)) {
      // Creating the type re-snapshots the cached catalog, so the picker picks it up on its own —
      // the old local mirror push (`upsertPaymentMethodType`) is gone with the store.
      const typeResp = await createPaymentMethodType({
        paymentMethodTypeId,
        description: trimmedDescription.value
      });
      if (commonUtil.hasError(typeResp)) {
        throw typeResp.data;
      }
      createdTypeIds.value = new Set([...createdTypeIds.value, paymentMethodTypeId]);
    }

    const mappingResp = await shopMutations.saveTypeMapping({
      mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
      mappedKey: shopifyId.value.trim(),
      mappedValue: paymentMethodTypeId
    }, { refresh: false });
    if (commonUtil.hasError(mappingResp)) {
      throw mappingResp.data;
    }

    commonUtil.showToast(translate("Payment method created successfully"));
    showCreatePaymentMethodModal.value = false;
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to create payment method"));
    return;
  } finally {
    emitter.emit("dismissLoader");
  }

  // Refresh data (formerly handled in modal.onDidDismiss). Isolated from the create
  // try/catch so a refresh failure can't report the already-successful creation as failed.
  refreshing.value = true;
  try {
    await Promise.all([
      shopMutations.refreshTypeMappings(),
      resyncDomain("paymentMethodType"),
    ]);
    initializeLocalMappings();
  } catch (refreshError) {
    logger.error(refreshError);
  } finally {
    refreshing.value = false;
  }
}

async function saveMapping(paymentMethodTypeId: string) {
  const newMappedKey = localMappings.value[paymentMethodTypeId];
  const oldMappedKey = getShopifyMapping(paymentMethodTypeId);

  if (!newMappedKey) {
    commonUtil.showToast(translate("Please provide a Shopify payment method name"));
    return;
  }

  emitter.emit("presentLoader");
  try {
    if (oldMappedKey && oldMappedKey !== newMappedKey) {
      await shopMutations.retireTypeMapping({
        mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
        mappedKey: oldMappedKey
      }, { refresh: false });
    }

    const resp = await shopMutations.saveTypeMapping({
      mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
      mappedKey: newMappedKey,
      mappedValue: paymentMethodTypeId
    }, { refresh: false });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Mapping updated successfully"));
      await shopMutations.refreshTypeMappings();
      editingItemId.value = "";
    } else {
      throw resp.data;
    }
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to update mapping"));
  }
  emitter.emit("dismissLoader");
}

async function saveAllDirtyMappings() {
  emitter.emit("presentLoader");
  const dirtyIds = Object.keys(localMappings.value).filter(id => localMappings.value[id] !== getShopifyMapping(id));

  try {
    const promises = [];
    for (const id of dirtyIds) {
      const newMappedKey = localMappings.value[id];
      const oldMappedKey = getShopifyMapping(id);

      if (oldMappedKey) {
        promises.push(shopMutations.retireTypeMapping({
          mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
          mappedKey: oldMappedKey
        }, { refresh: false }));
      }

      promises.push(shopMutations.saveTypeMapping({
        mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
        mappedKey: newMappedKey,
        mappedValue: id
      }, { refresh: false }));
    }
    await Promise.all(promises);

    await shopMutations.refreshTypeMappings();
    commonUtil.showToast(translate("All mappings saved successfully"));
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to save some mappings"));
  }
  emitter.emit("dismissLoader");
}

async function confirmLeaveWithDirtyMappings() {
  if (!isDirty.value) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    alertController.create({
      header: translate("Unsaved changes"),
      message: translate("You have unsaved changes. Would you like to save them before leaving?"),
      buttons: [
        {
          text: translate("Discard"),
          role: "destructive",
          handler: () => {
            resolve(true);
          }
        },
        {
          text: translate("Cancel"),
          role: "cancel",
          handler: () => {
            resolve(false);
          }
        },
        {
          text: translate("Save"),
          handler: async () => {
            await saveAllDirtyMappings();
            resolve(true);
          }
        }
      ]
    }).then(alert => alert.present());
  });
}

const router = useRouter();

onBeforeRouteLeave(() => confirmLeaveWithDirtyMappings());

function navigateBack() {
  // POP the entry we came from; do not push. Pushing left this page sitting ahead of the connection
  // detail page in history, so its ion-back-button walked forward into here instead of reaching
  // /shopify — an inescapable loop. See `shouldPopHistoryOnBack`.
  if (shouldPopHistoryOnBack(window.location.search, router.options.history.state?.back)) {
    router.back();
    return;
  }
  router.replace(backHref.value);
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 3;
  border-bottom: var(--border-medium);
}

.mapping-container {
  min-width: 150px;
}

.edit-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.inline-input {
  --padding-start: 0;
  --padding-end: 0;
  text-align: right;
  max-width: 200px;
}
</style>
