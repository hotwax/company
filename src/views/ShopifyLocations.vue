<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" :defaultHref="backHref" />
        <ion-title>{{ translate("Inventory locations") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="runAudit" :disabled="isAuditing">
            <ion-icon slot="icon-only" :icon="isAuditing ? refreshOutline : checkmarkCircleOutline" />
          </ion-button>
          <ion-button @click="openImportModal">
            <ion-icon slot="icon-only" :icon="cloudDownloadOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Health audit panel — shown after user runs audit -->
      <ion-card v-if="health" class="ion-margin">
        <ion-card-content>
          <div class="health-summary">
            <span><strong>{{ health.totalShopifyLocations }}</strong> {{ translate("Shopify locations") }}</span>
            <ion-button fill="clear" size="small" :disabled="isAuditing" @click="runAudit">
              <ion-icon :icon="refreshOutline" slot="start" />
              {{ translate("Re-run") }}
            </ion-button>
          </div>
          <div class="health-items">
            <span>
              <ion-icon :icon="health.unmapped === 0 ? checkmarkCircleOutline : refreshOutline"
                        :color="health.unmapped === 0 ? 'success' : 'warning'" />
              {{ health.totalShopifyLocations - health.unmapped }} {{ translate("mapped") }}
            </span>
            <span v-if="health.unmapped > 0" class="health-warning">
              {{ health.unmapped }} {{ translate("not imported") }}
            </span>
            <span v-if="health.stale > 0" class="health-warning">
              {{ health.stale }} {{ translate("stale") }}
            </span>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- Run Audit button — shown before first audit -->
      <div v-else class="ion-padding-horizontal ion-padding-bottom">
        <ion-button fill="outline" expand="block" :disabled="isAuditing" @click="runAudit">
          <ion-spinner v-if="isAuditing" name="crescent" slot="start" />
          <ion-icon v-else :icon="checkmarkCircleOutline" slot="start" />
          {{ translate("Run Facility Audit") }}
        </ion-button>
      </div>

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
import { alertController, IonButton, IonBackButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSkeletonText, IonSpinner, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, checkmarkCircleOutline, cloudDownloadOutline, refreshOutline, saveOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import ImportShopifyLocationsModal from '@/components/ImportShopifyLocationsModal.vue'
import { commonUtil, emitter, hasError, logger, translate } from '@common'
import { useUtilStore } from '@/store/util';
import { useShopifyStore } from '@/store/shopify';
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";

const props = defineProps(['id']);
const utilStore = useUtilStore();
const shopifyStore = useShopifyStore();
const isLoading = ref(true);
const editingItemId = ref("");
const localMappings = ref<any>({});
const health = ref<any>(null)
const isAuditing = ref(false)

const facilities = computed(() => utilStore.facilities)
const shopifyShopLocations = computed(() => shopifyStore.shopifyShopsLocations)
const backHref = computed(() => {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo")
  return returnTo || `/shopify-connection-details/${props.id}`
})

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
    utilStore.fetchFacilities(),
    shopifyStore.fetchShopifyShopLocations({ shopId: props.id })
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
    commonUtil.showToast(translate("Please provide a Shopify location ID"));
    return;
  }

  emitter.emit("presentLoader");
  try {
    const resp = await shopifyStore.createShopifyShopLocation({
      shopId: props.id,
      facilityId,
      shopifyLocationId
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Mapping updated successfully"));
      await shopifyStore.fetchShopifyShopLocations({ shopId: props.id });
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
  const dirtyIds = Object.keys(localMappings.value).filter(id => localMappings.value[id] !== (getShopifyLocationId(id) || ""));

  try {
    for (const id of dirtyIds) {
      await shopifyStore.createShopifyShopLocation({
        shopId: props.id,
        facilityId: id,
        shopifyLocationId: localMappings.value[id]
      });
    }
    await shopifyStore.fetchShopifyShopLocations({ shopId: props.id });
    commonUtil.showToast(translate("All mappings saved successfully"));
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to save some mappings"));
  }
  emitter.emit("dismissLoader");
}

async function openImportModal() {
  const modal = await modalController.create({
    component: ImportShopifyLocationsModal,
    componentProps: { shopId: props.id }
  })
  await modal.present()
  const { data } = await modal.onDidDismiss()
  if (data?.imported) {
    isLoading.value = true
    await Promise.all([
      utilStore.fetchFacilities(),
      shopifyStore.fetchShopifyShopLocations({ shopId: props.id })
    ])
    initializeLocalMappings()
    isLoading.value = false
    // Re-run the audit so the health panel reflects the newly imported facilities
    await runAudit()
  }
}

async function runAudit() {
  isAuditing.value = true
  try {
    const [shopifyResp, omsResp] = await Promise.all([
      shopifyStore.fetchLocationsFromShopify({ shopId: props.id }),
      shopifyStore.fetchShopifyShopLocationsRaw({ shopId: props.id })
    ])
    const nodes = (shopifyResp.data?.locations?.edges || []).map((e: any) => e.node)
    const omsMappings = omsResp.data || []
    const mappedIds = new Set(omsMappings.map((m: any) => String(m.shopifyLocationId)))
    const nodeById = new Map(nodes.map((n: any) => [String(n.id).split('/').pop(), n]))

    health.value = {
      totalShopifyLocations: nodes.length,
      unmapped: nodes.filter((n: any) => !mappedIds.has(String(n.id).split('/').pop())).length,
      stale: omsMappings.filter((m: any) => {
        const node = nodeById.get(String(m.shopifyLocationId))
        return node && !node.isActive
      }).length
    }
  } catch (e) {
    commonUtil.showToast(translate('Audit failed'))
  } finally {
    isAuditing.value = false
  }
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

.health-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.health-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.875rem;
}

.health-warning {
  color: var(--ion-color-warning);
}
</style>
