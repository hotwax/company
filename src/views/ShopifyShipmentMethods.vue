<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Back" @click="navigateBack">
            <ion-icon slot="icon-only" :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Shipment methods") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Create shipment method" :disabled="!carriers.length" @click="openCreateModal()">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="primary">
          <ion-button :disabled="!isDirty" @click="saveAllDirtyMappings()">
            {{ translate("Save all") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map shipment methods") }}
            <p>{{ translate("For synchronization to work correctly, shipment methods from Shopify must be mapped to Hotwax shipment method types.") }}</p>
          </ion-label>
        </ion-item>
      </div>

      <ion-segment v-if="carriers.length" v-model="selectedCarrierPartyId" scrollable>
        <ion-segment-button v-for="carrier in carriers" :key="carrier.partyId" :value="carrier.partyId">
          <ion-label>{{ carrier.groupName || carrier.partyId }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      <div v-if="isLoading">
        <div class="list-item ion-padding-end" v-for="i in 5" :key="i">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="airplaneOutline" />
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

      <div v-else class="list-item ion-padding-end" v-for="shipmentMethod in filteredShipmentMethods" :key="shipmentMethod.productStoreShipMethId">
        <ion-item lines="none" button @click="editItem(shipmentMethod.partyId, shipmentMethod.shipmentMethodTypeId)">
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>
            {{ getShipmentMethodDesc(shipmentMethod.shipmentMethodTypeId) }}
            <p>{{ shipmentMethod.shipmentMethodTypeId }}</p>
          </ion-label>
        </ion-item>

        <!-- Shopify Mapping (Inline Edit) -->
        <div class="ion-text-end mapping-container">
          <div v-if="editingItemKey === (shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId) || isItemDirty(shipmentMethod.shipmentMethodTypeId)" class="edit-controls">
            <ion-input :autofocus="editingItemKey === (shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId)" :placeholder="translate('Shopify Name')" v-model="localMappings[shipmentMethod.partyId + '_' + shipmentMethod.shipmentMethodTypeId].shopifyShippingMethod" class="inline-input" />
            <ion-button fill="clear" @click.stop="saveMapping(shipmentMethod.shipmentMethodTypeId)">
              <ion-icon slot="icon-only" :icon="saveOutline" />
            </ion-button>
          </div>
          <div v-else @click="editItem(shipmentMethod.partyId, shipmentMethod.shipmentMethodTypeId)">
            <template v-if="getShopifyMapping(shipmentMethod.shipmentMethodTypeId)">
                <ion-chip outline class="ion-no-margin">
                    <ion-label>{{ getShopifyMapping(shipmentMethod.shipmentMethodTypeId).shopifyShippingMethod }}</ion-label>
                </ion-chip>
            </template>
            <ion-button v-else size="small" fill="outline">
                <ion-icon :icon="addOutline" slot="start"/>
                <ion-label>{{ translate("Shopify name") }}</ion-label>
            </ion-button>
          </div>
        </div>
      </div>

      <ion-modal :is-open="showCreateShipmentMethodModal" @didDismiss="closeCreateShipmentMethodModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeCreateShipmentMethodModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Create shipment method") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list>
            <ion-item v-if="carriers.length > 1">
              <ion-select :label="translate('Carrier')" :placeholder="translate('Select')" v-model="createShipmentCarrierPartyId" interface="popover">
                <ion-select-option v-for="carrier in carriers" :key="carrier.partyId" :value="carrier.partyId">
                  {{ carrier.groupName || carrier.partyId }}
                </ion-select-option>
              </ion-select>
            </ion-item>

            <ion-item>
              <ion-input v-model="description" :label="translate('Shipment method name')" label-placement="stacked" :placeholder="translate('e.g. Standard Shipping')" :maxlength="60" @ionInput="onDescriptionInput" />
            </ion-item>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <p>{{ translate("Hotwax ID") }}: <ion-text color="primary">{{ derivedId || "—" }}</ion-text></p>
              </ion-label>
            </ion-item>

            <ion-item>
              <ion-input v-model="shopifyShippingMethod" :label="translate('Shopify name')" label-placement="stacked" :placeholder="translate('Shopify shipping method name')" />
            </ion-item>
          </ion-list>
        </ion-content>

        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button :disabled="!canSave" @click="createShipmentMethod()">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { useShopifyCarrierShipments, useShopifyShop, useShopifyShopMutations } from "@/composables/useShopify";
import { useShipmentMethodTypeMutations, useShipmentMethodTypes } from "@/composables/useSeed";
import { useProductStoreMutations, useProductStoreShippingMethods } from "@/composables/useProductStores";
import { refreshAfterMutation, resyncDomain } from "@/services/appCacheBootstrap";
import { alertController, IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonPage, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSkeletonText, IonText, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, airplaneOutline, arrowBackOutline, closeOutline, saveOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { shouldPopHistoryOnBack } from "@/utils/navigation";

const props = defineProps(['id']);
const shopMutations = useShopifyShopMutations(props.id);
const { createShipmentMethodType } = useShipmentMethodTypeMutations();
// Skeleton only until the cache emits; on a warm cache that is immediate.
const isLoading = computed(() => !hydrated.value);
const editingItemKey = ref("");
// Keys the user has actually started editing. Everything else is safe to reseed from the cache.
const userEditedKeys = ref<Set<string>>(new Set());
const localMappings = ref<any>({});
const { record: shopRecord } = useShopifyShop(props.id);
const shop = computed<any>(() => shopRecord.value ?? {});
const selectedCarrierPartyId = ref("");

const { shipmentMethodTypes } = useShipmentMethodTypes();
const { shippingMethods: productStoreShipmentMethods } = useProductStoreShippingMethods();
const { byCarrierAndMethod: shopifyShopsCarrierShipments, hydrated } = useShopifyCarrierShipments(props.id);
const backHref = computed(() => {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo")
  return returnTo || `/shopify-connection-details/${props.id}`
})

const carriers = computed(() => {
  const carrierMap: any = {};
  (productStoreShipmentMethods.value || []).forEach((sm: any) => {
    if (sm.partyId) {
      carrierMap[sm.partyId] = sm.groupName || sm.partyId;
    }
  });
  return Object.entries(carrierMap).map(([partyId, groupName]) => ({ partyId, groupName }));
});

const filteredShipmentMethods = computed(() => {
  const now = Date.now();
  return (productStoreShipmentMethods.value || []).filter((sm: any) => 
    sm.partyId === selectedCarrierPartyId.value &&
    (!sm.fromDate || sm.fromDate <= now) &&
    (!sm.thruDate || sm.thruDate > now)
  );
});

const isDirty = computed(() => {
  return Object.keys(localMappings.value).some(key => {
    const local = localMappings.value[key];
    const original = shopifyShopsCarrierShipments.value[key];
    const originalShopifyName = original ? original.shopifyShippingMethod : "";
    return local.shopifyShippingMethod !== originalShopifyName;
  });
});


watch(carriers, (newCarriers) => {
  if (newCarriers.length && !selectedCarrierPartyId.value) {
    selectedCarrierPartyId.value = newCarriers[0].partyId;
  }
})

// Seed the local edit map whenever either cached source emits. It reads BOTH the store's shipment
// methods and the shop's carrier shipments, which arrive from IndexedDB independently, and it was
// previously only invoked after a create — so on a normal page load nothing seeded it and every row
// compared against an empty local map, rendering the edit input instead of the mapped value.
watch([productStoreShipmentMethods, shopifyShopsCarrierShipments], () => {
  initializeLocalMappings();
}, { deep: true, immediate: true });

function initializeLocalMappings() {
  const now = Date.now();
  (productStoreShipmentMethods.value || []).forEach((sm: any) => {
    // Only initialize for active methods
    if ((!sm.fromDate || sm.fromDate <= now) && (!sm.thruDate || sm.thruDate > now)) {
      const key = `${sm.partyId}_${sm.shipmentMethodTypeId}`;
      const original = shopifyShopsCarrierShipments.value[key];
      // Reseed anything the USER has not opened for editing. The previous guard skipped rows that
      // merely LOOKED dirty, which is the state produced when the first seed ran before the carrier
      // shipments arrived: local was "", the real mapping landed later, and the row was then stuck
      // in edit mode forever because it could never be reseeded.
      if (!userEditedKeys.value.has(key)) {
        localMappings.value[key] = {
          shopifyShippingMethod: original ? original.shopifyShippingMethod : ""
        };
      }
    }
  });
}

function getShipmentMethodDesc(shipmentMethodTypeId: string) {
  const shipmentMethodType = shipmentMethodTypes.value.find((type: any) => type.shipmentMethodTypeId === shipmentMethodTypeId);
  return shipmentMethodType ? shipmentMethodType.description : shipmentMethodTypeId;
}

function isItemDirtyByCarrier(carrierPartyId: string, shipmentMethodTypeId: string) {
  const key = `${carrierPartyId}_${shipmentMethodTypeId}`;
  const local = localMappings.value[key];
  const original = shopifyShopsCarrierShipments.value[key];
  const originalShopifyName = original ? original.shopifyShippingMethod : "";
  return local && local.shopifyShippingMethod !== originalShopifyName;
}

function isItemDirty(shipmentMethodTypeId: string) {
  return isItemDirtyByCarrier(selectedCarrierPartyId.value, shipmentMethodTypeId);
}

function getShopifyMapping(shipmentMethodTypeId: string) {
    const key = `${selectedCarrierPartyId.value}_${shipmentMethodTypeId}`;
    const mapping = shopifyShopsCarrierShipments.value[key];
    return mapping && mapping.shopifyShippingMethod ? mapping : null;
}

async function editItem(carrierPartyId: string, shipmentMethodTypeId: string) {
  editingItemKey.value = `${carrierPartyId}_${shipmentMethodTypeId}`;
  userEditedKeys.value.add(editingItemKey.value);
  await nextTick();
  const input = document.querySelector('ion-input[autofocus]') as any;
  if (input) {
    input.setFocus();
    const nativeInput = await input.getInputElement();
    nativeInput.select();
  }
}

async function saveMapping(shipmentMethodTypeId: string) {
  const key = `${selectedCarrierPartyId.value}_${shipmentMethodTypeId}`;
  const mapping = localMappings.value[key];
  if (!mapping.shopifyShippingMethod) {
    commonUtil.showToast(translate("Please provide Shopify name"));
    return;
  }

  emitter.emit("presentLoader");
  try {
    const resp = await shopMutations.saveCarrierShipment({
      shipmentMethodTypeId,
      shopifyShippingMethod: mapping.shopifyShippingMethod,
      carrierPartyId: selectedCarrierPartyId.value
    }, { refresh: false });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Mapping updated successfully"));
      await shopMutations.refreshCarrierShipments();
      editingItemKey.value = "";
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
  const dirtyKeys = Object.keys(localMappings.value).filter(key => {
    const local = localMappings.value[key];
    const original = shopifyShopsCarrierShipments.value[key];
    const originalShopifyName = original ? original.shopifyShippingMethod : "";
    return local.shopifyShippingMethod !== originalShopifyName;
  });

  try {
    for (const key of dirtyKeys) {
      const [carrierPartyId, shipmentMethodTypeId] = key.split('_');
      const mapping = localMappings.value[key];
      await shopMutations.saveCarrierShipment({
        shipmentMethodTypeId,
        shopifyShippingMethod: mapping.shopifyShippingMethod,
        carrierPartyId: carrierPartyId
      }, { refresh: false });
    }
    await shopMutations.refreshCarrierShipments();
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

const showCreateShipmentMethodModal = ref(false);
const description = ref("");
const shopifyShippingMethod = ref("");
const createShipmentCarrierPartyId = ref("");

// Auto-derive the shipment method type id from the description (uppercase, non-alphanumeric -> underscore).
const derivedId = computed(() => description.value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
);

const canSave = computed(() => Boolean(derivedId.value && shopifyShippingMethod.value.trim() && createShipmentCarrierPartyId.value));

function onDescriptionInput() {
  // keep description as typed; derivedId recomputes reactively
}

function openCreateModal() {
  // Seed fresh modal state (formerly the modal's ref initializers via componentProps).
  description.value = "";
  shopifyShippingMethod.value = "";
  createShipmentCarrierPartyId.value = selectedCarrierPartyId.value || (carriers.value[0]?.partyId ?? "");
  showCreateShipmentMethodModal.value = true;
}

function closeCreateShipmentMethodModal() {
  showCreateShipmentMethodModal.value = false;
}

async function createShipmentMethod() {
  if(!canSave.value) {return;}

  const shipmentMethodTypeId = derivedId.value;
  emitter.emit("presentLoader");

  try {
    // 1. Create the shipment method type if it does not already exist.
    const typeExists = shipmentMethodTypes.value.some((type: any) => type.shipmentMethodTypeId === shipmentMethodTypeId);
    if(!typeExists) {
      // Resyncs the shipmentMethodType cache itself.
      await createShipmentMethodType({ shipmentMethodTypeId, description: description.value.trim() });
    }

    // 2. Associate the shipment method type with the product store + carrier so it appears as a row.
    const assocResp = await useProductStoreMutations(shop.value.productStoreId).addShipmentMethod({
      shipmentMethodTypeId,
      partyId: createShipmentCarrierPartyId.value,
      roleTypeId: "CARRIER"
    });
    if(commonUtil.hasError(assocResp)) {
      throw assocResp.data;
    }

    // 3. Create the Shopify carrier-shipment mapping (the identification).
    const mappingResp = await shopMutations.saveCarrierShipment({
      shipmentMethodTypeId,
      shopifyShippingMethod: shopifyShippingMethod.value.trim(),
      carrierPartyId: createShipmentCarrierPartyId.value
    }, { refresh: false });
    if(commonUtil.hasError(mappingResp)) {
      throw mappingResp.data;
    }

    commonUtil.showToast(translate("Shipment method created successfully"));
    showCreateShipmentMethodModal.value = false;
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to create shipment method"));
    // Keep the modal open so the user can correct and retry.
    return;
  } finally {
    emitter.emit("dismissLoader");
  }

  // Refresh data and reflect the created method (formerly handled in modal.onDidDismiss).
  // Isolated from the create try/catch so a refresh failure can't report the
  // already-successful creation as failed or keep the modal open.
  try {
    if (createShipmentCarrierPartyId.value) selectedCarrierPartyId.value = createShipmentCarrierPartyId.value;
    // Both lists render from the cache, so refreshing means re-snapshotting those domains.
    await Promise.all([
      resyncDomain("productStoreShippingMethod"),
      resyncDomain("shopifyCarrierShipment"),
    ]);
    initializeLocalMappings();
  } catch (refreshError) {
    logger.error(refreshError);
  }
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
  flex-direction: column;
  align-items: flex-end;
}

.inline-input {
  --padding-start: 0;
  --padding-end: 0;
  text-align: right;
}

.carrier-label {
  margin: 0;
  font-size: 0.8em;
}
</style>
