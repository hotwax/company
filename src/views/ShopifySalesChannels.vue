<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="'/shopify-connection-details/' + id" />
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
import { alertController, IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSkeletonText, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, saveOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { ShopifyService } from "@/services/ShopifyService";
import { hasError, showToast } from "@/utils"
import emitter from "@/event-bus";
import logger from "@/logger";
import { onBeforeRouteLeave } from "vue-router";

const props = defineProps(['id']);
const store = useStore();
const isLoading = ref(true);
const editingItemId = ref("");
const localMappings = ref<any>({});

const salesChannels = computed(() => store.getters["netSuite/getSalesChannel"])
const shopifyTypeMappings = computed(() => store.getters["shopify/getShopifyTypeMappings"]("SHOPIFY_ORDER_SOURCE"))

const isDirty = computed(() => {
  return Object.keys(localMappings.value).some(id => {
    const local = localMappings.value[id];
    const original = getShopifyMappingId(id);
    return local !== original;
  });
});

onIonViewWillEnter(async () => {
  isLoading.value = true;
  await Promise.all([
    store.dispatch("netSuite/fetchSalesChannel"),
    store.dispatch("shopify/fetchShopifyTypeMappings", "SHOPIFY_ORDER_SOURCE")
  ]);
  initializeLocalMappings();
  isLoading.value = false;
})

watch(shopifyTypeMappings, () => {
  initializeLocalMappings();
}, { deep: true });

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
  const newMappedKey = localMappings.value[salesChannelEnumId];
  const oldMappedKey = getShopifyMappingId(salesChannelEnumId);

  if (!newMappedKey) {
    showToast(translate("Please provide a Shopify order source name"));
    return;
  }

  emitter.emit("presentLoader");
  try {
    if (oldMappedKey && oldMappedKey !== newMappedKey) {
      await ShopifyService.deleteShopifyShopTypeMapping({
        shopId: props.id,
        mappedTypeId: "SHOPIFY_ORDER_SOURCE",
        mappedKey: oldMappedKey
      });
    }

    const resp = await ShopifyService.createShopifyShopTypeMapping({
      shopId: props.id,
      mappedTypeId: "SHOPIFY_ORDER_SOURCE",
      mappedKey: newMappedKey,
      mappedValue: salesChannelEnumId
    });

    if (!hasError(resp)) {
      showToast(translate("Mapping updated successfully"));
      await store.dispatch("shopify/fetchShopifyTypeMappings", "SHOPIFY_ORDER_SOURCE");
      editingItemId.value = "";
    } else {
      throw resp.data;
    }
  } catch (error) {
    logger.error(error);
    showToast(translate("Failed to update mapping"));
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
        await ShopifyService.deleteShopifyShopTypeMapping({
          shopId: props.id,
          mappedTypeId: "SHOPIFY_ORDER_SOURCE",
          mappedKey: oldMappedKey
        });
      }

      await ShopifyService.createShopifyShopTypeMapping({
        shopId: props.id,
        mappedTypeId: "SHOPIFY_ORDER_SOURCE",
        mappedKey: newMappedKey,
        mappedValue: id
      });
    }
    await store.dispatch("shopify/fetchShopifyTypeMappings", "SHOPIFY_ORDER_SOURCE");
    showToast(translate("All mappings saved successfully"));
  } catch (error) {
    logger.error(error);
    showToast(translate("Failed to save some mappings"));
  }
  emitter.emit("dismissLoader");
}

onBeforeRouteLeave(async () => {
  if (!isDirty.value) {
    return true;
  }

  return new Promise((resolve) => {
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
});
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
