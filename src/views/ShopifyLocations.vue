<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Back" @click="navigateBack">
            <ion-icon slot="icon-only" :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
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
import { alertController, IonButton, IonButtons, IonCard, IonCardContent, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSkeletonText, IonSpinner, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, arrowBackOutline, checkmarkCircleOutline, cloudDownloadOutline, refreshOutline, saveOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import ImportShopifyLocationsModal from '@/components/facility/ImportShopifyLocationsModal.vue'
import { commonUtil, emitter, logger, translate } from '@common'
import { computed, defineProps, nextTick, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { shouldPopHistoryOnBack } from "@/utils/navigation";
import { useFacilities } from '@/composables/useFacilities';
import { fetchLocationsFromShopify, useShopifyLocations, useShopifyShopMutations } from "@/composables/useShopify";
import { refreshAfterMutation, resyncDomain } from '@/services/appCacheBootstrap';

const props = defineProps(['id']);
const shopMutations = useShopifyShopMutations(props.id);
const editingItemId = ref("");
const localMappings = ref<any>({});
const health = ref<any>(null)
const isAuditing = ref(false)

// Facilities and this shop's location mappings both come from the cache — no fetch on entry.
const { facilities } = useFacilities();
const { locations: shopifyShopLocations, locationByFacility, hydrated } = useShopifyLocations(props.id);
// Skeleton shows only until the cache emits; on a warm cache that is immediate.
const isLoading = computed(() => !hydrated.value);
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


// `initializeLocalMappings` reads BOTH cached sources, which emit from IndexedDB independently.
// Watching only one meant that if the other had not arrived yet the local map was built empty and
// never rebuilt — every row then compared `undefined` against its real mapping, looked "dirty",
// and rendered the edit input instead of the mapped value. `immediate` also seeds a warm cache.
watch([shopifyShopLocations, facilities], () => {
  initializeLocalMappings();
}, { deep: true, immediate: true });

function initializeLocalMappings() {
  const mappings: any = {};
  (facilities.value || []).forEach((facility: any) => {
    mappings[facility.facilityId] = getShopifyLocationId(facility.facilityId) || "";
  });
  localMappings.value = mappings;
}

function getShopifyLocationId(facilityId: string) {
  // A MAP keyed by facilityId. This used to index the records ARRAY by facilityId, which is always
  // undefined — so every facility rendered as unmapped even with mappings cached.
  return locationByFacility.value[facilityId];
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
    const resp = await shopMutations.saveLocation({
      facilityId,
      shopifyLocationId
    }, { refresh: false });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Mapping updated successfully"));
      await shopMutations.refreshLocations();
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
      await shopMutations.saveLocation({
        facilityId: id,
        shopifyLocationId: localMappings.value[id]
      }, { refresh: false });
    }
    await shopMutations.refreshLocations();
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
    // Imported rows arrive via the cache; facilities are already cached.
    await Promise.all([
      shopMutations.refreshLocations(),
      resyncDomain("facility"),
    ])
    initializeLocalMappings()
    // Re-run the audit so the health panel reflects the newly imported facilities
    await runAudit()
  }
}

async function runAudit() {
  isAuditing.value = true
  try {
    // Shopify is remote truth so it is fetched; the OMS side is the cached `shopifyLocation`
    // domain this page already subscribes to, so the audit costs ONE request instead of two.
    const nodes = await fetchLocationsFromShopify(props.id)
    const omsMappings = shopifyShopLocations.value || []
    const mappedIds = new Set(omsMappings.map((m: any) => String(m.shopifyLocationId)))
    const nodeById = new Map(nodes.map((n: any) => [String(n.id).split('/').pop(), n]))

    health.value = {
      totalShopifyLocations: nodes.length,
      unmapped: nodes.filter((n: any) => !mappedIds.has(String(n.id).split('/').pop() ?? '')).length,
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
