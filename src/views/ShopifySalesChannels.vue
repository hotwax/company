<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Back" @click="navigateBack">
            <ion-icon slot="icon-only" :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Sales channels") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map sales channels") }}
            <p>{{ translate("Map Shopify order sources to Hotwax sales channels to ensure orders are attributed correctly.") }}</p>
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

      <div v-else class="list-item ion-padding-end ion-margin-top" v-for="channel in salesChannels" :key="channel.enumId">
        <ion-item lines="none" button @click="editItem(channel.enumId)">
          <ion-label>
            {{ channel.description ? channel.description : channel.enumId }}
            <p>{{ channel.enumId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- Shopify Mapping (Inline Edit) -->
        <div class="ion-text-end mapping-container">
          <div v-if="editingItemId === channel.enumId || isItemDirty(channel.enumId)" class="edit-controls">
            <ion-input :autofocus="editingItemId === channel.enumId" :placeholder="translate('Shopify ID')" v-model="localMappings[channel.enumId]" class="inline-input" />
            <ion-button fill="clear" @click.stop="saveMapping(channel.enumId)">
              <ion-icon slot="icon-only" :icon="saveOutline" />
            </ion-button>
          </div>
          <div v-else @click="editItem(channel.enumId)">
            <ion-chip outline v-if="getShopifyMappingId(channel.enumId)" class="ion-no-margin">
              <ion-label>{{ getShopifyMappingId(channel.enumId) }}</ion-label>
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
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { shouldPopHistoryOnBack } from "@/utils/navigation";
import { useShopifyShopMutations, useShopifyTypeMappings } from "@/composables/useShopify";
import { useTypedEnums } from '@/composables/useSeed';

const props = defineProps(['id']);
const shopMutations = useShopifyShopMutations(props.id);
const editingItemId = ref("");
const localMappings = ref<any>({});

// Sales channels are ORDER_SALES_CHANNEL enums, cached per type.
const { values: salesChannels } = useTypedEnums("ORDER_SALES_CHANNEL");
const { mappings: shopifyTypeMappings, hydrated } = useShopifyTypeMappings(props.id, "SHOPIFY_ORDER_SOURCE");
// Skeleton shows only until the cache emits; on a warm cache that is immediate.
const isLoading = computed(() => !hydrated.value);
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
watch([shopifyTypeMappings, salesChannels], () => {
  initializeLocalMappings();
}, { deep: true, immediate: true });

function initializeLocalMappings() {
  const mappings: any = {};
  (salesChannels.value || []).forEach((channel: any) => {
    mappings[channel.enumId] = getShopifyMappingId(channel.enumId);
  });
  localMappings.value = mappings;
}

function isItemDirty(id: string) {
  const local = localMappings.value[id];
  const original = getShopifyMappingId(id);
  return local !== original;
}

function getShopifyMappingId(salesChannelEnumId: any) {
  const shopifyMappingId = shopifyTypeMappings.value.find((mapping: any) => mapping.mappedValue === salesChannelEnumId);
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

async function saveMapping(salesChannelEnumId: string) {
  const newMappedKey = (localMappings.value[salesChannelEnumId] || "").trim();
  const oldMappedKey = getShopifyMappingId(salesChannelEnumId);

  if (!newMappedKey && !oldMappedKey) {
    editingItemId.value = "";
    return;
  }

  emitter.emit("presentLoader");
  try {
    if (oldMappedKey && oldMappedKey !== newMappedKey) {
      await shopMutations.retireTypeMapping({
        mappedTypeId: "SHOPIFY_ORDER_SOURCE",
        mappedKey: oldMappedKey
      }, { refresh: false });
    }

    if (newMappedKey) {
      const resp = await shopMutations.saveTypeMapping({
        mappedTypeId: "SHOPIFY_ORDER_SOURCE",
        mappedKey: newMappedKey,
        mappedValue: salesChannelEnumId
      }, { refresh: false });

      if (commonUtil.hasError(resp)) {
        throw resp.data;
      }
    }

    commonUtil.showToast(translate("Mapping updated successfully"));
    await shopMutations.refreshTypeMappings();
    editingItemId.value = "";
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
    await Promise.all(dirtyIds.map(async (id) => {
      const oldMappedKey = getShopifyMappingId(id);
      if (oldMappedKey) {
        await shopMutations.retireTypeMapping({
          mappedTypeId: "SHOPIFY_ORDER_SOURCE",
          mappedKey: oldMappedKey
        }, { refresh: false });
      }
    }));

    await Promise.all(dirtyIds.map(async (id) => {
      const newMappedKey = localMappings.value[id];
      if (newMappedKey) {
        await shopMutations.saveTypeMapping({
          mappedTypeId: "SHOPIFY_ORDER_SOURCE",
          mappedKey: newMappedKey,
          mappedValue: id
        }, { refresh: false });
      }
    }));

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
