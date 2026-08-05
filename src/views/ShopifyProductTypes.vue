<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Back" @click="navigateBack">
            <ion-icon slot="icon-only" :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Product types") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map product types") }}
            <p>{{ translate("Map Shopify product types to Hotwax to ensure products are categorized correctly.") }}</p>
          </ion-label>
        </ion-item>
      </div>

      <div v-if="isLoading">
        <div class="list-item ion-padding-end ion-margin-top" v-for="i in 5" :key="i">
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

      <div v-else class="list-item ion-padding-end ion-margin-top" v-for="type in productTypes" :key="type.productTypeId">
        <ion-item lines="none" button @click="editItem(type.productTypeId)">
          <ion-label>
            {{ type.description ? type.description : type.productTypeId }}
            <p>{{ type.productTypeId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- Shopify Mapping (Inline Edit) -->
        <div class="ion-text-end mapping-container">
          <div v-if="editingItemId === type.productTypeId || isItemDirty(type.productTypeId)" class="edit-controls">
            <ion-input :autofocus="editingItemId === type.productTypeId" :placeholder="translate('Shopify ID')" v-model="localMappings[type.productTypeId]" class="inline-input" />
            <ion-button fill="clear" @click.stop="saveMapping(type.productTypeId)">
              <ion-icon slot="icon-only" :icon="saveOutline" />
            </ion-button>
          </div>
          <div v-else @click="editItem(type.productTypeId)">
            <ion-chip outline v-if="getShopifyMappingId(type.productTypeId)" class="ion-no-margin">
              <ion-label>{{ getShopifyMappingId(type.productTypeId) }}</ion-label>
            </ion-chip>
            <ion-button v-else size="small" fill="outline">
              <ion-icon :icon="addOutline" slot="start"/>
              <ion-label>{{ translate("Shopify ID") }}</ion-label>
            </ion-button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { alertController, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSkeletonText, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, arrowBackOutline, saveOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { useShopifyShopMutations, useShopifyTypeMappings } from "@/composables/useShopify";
import { useProductTypes } from '@/composables/useSeed';
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { shouldPopHistoryOnBack } from "@/utils/navigation";

const props = defineProps(['id']);
// Writes still go through the store; every READ comes from the cache.
const shopMutations = useShopifyShopMutations(props.id);
const editingItemId = ref("");
const localMappings = ref<any>({});

const { mappings: shopifyTypeMappings, hydrated } = useShopifyTypeMappings(props.id, "SHOPIFY_PRODUCT_TYPE");
const { productTypes: cachedProductTypes } = useProductTypes();
const isLoading = computed(() => !hydrated.value);

// Fall back to the types present in the mappings when the catalog is empty (unchanged behavior).
const productTypes = computed(() => {
  if (cachedProductTypes.value.length) return cachedProductTypes.value

  return shopifyTypeMappings.value.map((mapping: any) => ({
    productTypeId: mapping.mappedValue,
    description: mapping.mappedValue
  }))
})
const backHref = computed(() => {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo")
  return returnTo || `/shopify-connection-details/${props.id}`
})

const isDirty = computed(() => {
  return Object.keys(localMappings.value).some(id => {
    const local = localMappings.value[id];
    const original = getShopifyMappingId(id);
    return local !== original;
  });
});


// `initializeLocalMappings` reads BOTH cached sources, which emit from IndexedDB independently.
// Watching only one meant that if the other had not arrived yet the local map was built empty and
// never rebuilt — every row then compared `undefined` against its real mapping, looked "dirty",
// and rendered the edit input instead of the mapped value. `immediate` also seeds a warm cache.
watch([shopifyTypeMappings, productTypes], () => {
  initializeLocalMappings();
}, { deep: true, immediate: true });

function initializeLocalMappings() {
  const mappings: any = {};
  (productTypes.value || []).forEach((pt: any) => {
    mappings[pt.productTypeId] = getShopifyMappingId(pt.productTypeId);
  });
  localMappings.value = mappings;
}

function isItemDirty(id: string) {
  const local = localMappings.value[id];
  const original = getShopifyMappingId(id);
  return (local ?? "") !== (original ?? "");
}

function getShopifyMappingId(productTypeId: any) {
  const shopifyMappingId = shopifyTypeMappings.value.find((mapping: any) => mapping.mappedValue === productTypeId);
  return shopifyMappingId ? shopifyMappingId.mappedKey : "";
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

async function saveMapping(productTypeId: string) {
  const newMappedKey = localMappings.value[productTypeId];
  const oldMappedKey = getShopifyMappingId(productTypeId);

  if (!newMappedKey) {
    commonUtil.showToast(translate("Please provide a Shopify product type name"));
    return;
  }

  emitter.emit("presentLoader");
  try {
    if (oldMappedKey && oldMappedKey !== newMappedKey) {
      await shopMutations.retireTypeMapping({
        mappedTypeId: "SHOPIFY_PRODUCT_TYPE",
        mappedKey: oldMappedKey
      }, { refresh: false });
    }

    const resp = await shopMutations.saveTypeMapping({
      mappedTypeId: "SHOPIFY_PRODUCT_TYPE",
      mappedKey: newMappedKey,
      mappedValue: productTypeId
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
  const dirtyIds = Object.keys(localMappings.value).filter(id => localMappings.value[id] !== getShopifyMappingId(id));

  try {
    for (const id of dirtyIds) {
      const newMappedKey = localMappings.value[id];
      const oldMappedKey = getShopifyMappingId(id);

      if (oldMappedKey) {
        await shopMutations.retireTypeMapping({
          mappedTypeId: "SHOPIFY_PRODUCT_TYPE",
          mappedKey: oldMappedKey
        }, { refresh: false });
      }

      await shopMutations.saveTypeMapping({
        mappedTypeId: "SHOPIFY_PRODUCT_TYPE",
        mappedKey: newMappedKey,
        mappedValue: id
      }, { refresh: false });
    }
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
