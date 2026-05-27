<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :default-href="'/shopify-connection-details/' + id" />
        <ion-title>{{ translate("Inventory locations") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map inventory locations") }}
            <p>{{ translate("Map Shopify locations to Hotwax facilities to ensure unified inventory is updated correctly.") }}</p>
          </ion-label>
        </ion-item>
      </div>

      <div v-if="isLoading">
        <div class="list-item ion-padding-end ion-margin-top" v-for="i in 5" :key="i">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
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

      <div v-else class="list-item ion-padding-end ion-margin-top" v-for="facility in facilities" :key="facility.facilityId">
        <ion-item lines="none" button @click="editItem(facility.facilityId)">
          <ion-icon slot="start" :icon="storefrontOutline" />
          <ion-label>
            <p class="overline">{{ facility.facilityTypeId }}</p>
            {{ facility.facilityName }}
            <p>{{ facility.facilityId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- Shopify Mapping (Inline Edit) -->
        <div class="ion-text-end mapping-container">
          <div v-if="editingItemId === facility.facilityId || isItemDirty(facility.facilityId)" class="edit-controls">
            <ion-input :autofocus="editingItemId === facility.facilityId" :placeholder="translate('Shopify ID')" v-model="localMappings[facility.facilityId]" class="inline-input" />
            <ion-button fill="clear" @click.stop="saveMapping(facility.facilityId)">
              <ion-icon slot="icon-only" :icon="saveOutline" />
            </ion-button>
          </div>
          <div v-else @click="editItem(facility.facilityId)">
            <ion-chip outline v-if="getShopifyLocationId(facility.facilityId)" class="ion-no-margin">
              <ion-label>{{ getShopifyLocationId(facility.facilityId) }}</ion-label>
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
import { addOutline, saveOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
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

const facilities = computed(() => store.getters["util/getFacilities"])
const shopifyShopLocations = computed(() => store.getters["shopify/getShopifyShopsLocations"])

const isDirty = computed(() => {
  return Object.keys(localMappings.value).some(id => {
    const local = localMappings.value[id];
    const original = getShopifyLocationId(id) || "";
    return local !== original;
  });
});

onIonViewWillEnter(async () => {
  isLoading.value = true;
  await Promise.all([
    store.dispatch("util/fetchFacilities"),
    store.dispatch("shopify/fetchShopifyShopLocations")
  ]);
  initializeLocalMappings();
  isLoading.value = false;
})

watch(shopifyShopLocations, () => {
  initializeLocalMappings();
}, { deep: true });

function initializeLocalMappings() {
  const mappings: any = {};
  (facilities.value || []).forEach((facility: any) => {
    mappings[facility.facilityId] = getShopifyLocationId(facility.facilityId) || "";
  });
  localMappings.value = mappings;
}

function getShopifyLocationId(facilityId: string) {
  return shopifyShopLocations.value[facilityId];
}

function isItemDirty(id: string) {
  const local = localMappings.value[id];
  const original = getShopifyLocationId(id) || "";
  return local !== original;
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

async function saveMapping(facilityId: string) {
  const shopifyLocationId = localMappings.value[facilityId];

  if (!shopifyLocationId) {
    showToast(translate("Please provide a Shopify location ID"));
    return;
  }

  emitter.emit("presentLoader");
  try {
    const resp = await ShopifyService.createShopifyShopLocation({
      shopId: props.id,
      facilityId,
      shopifyLocationId
    });

    if (!hasError(resp)) {
      showToast(translate("Mapping updated successfully"));
      await store.dispatch("shopify/fetchShopifyShopLocations");
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
  const dirtyIds = Object.keys(localMappings.value).filter(id => localMappings.value[id] !== (getShopifyLocationId(id) || ""));

  try {
    for (const id of dirtyIds) {
      await ShopifyService.createShopifyShopLocation({
        shopId: props.id,
        facilityId: id,
        shopifyLocationId: localMappings.value[id]
      });
    }
    await store.dispatch("shopify/fetchShopifyShopLocations");
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
