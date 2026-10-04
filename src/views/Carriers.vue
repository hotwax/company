<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Carriers") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :aria-label="translate('Refresh carriers')" :disabled="refreshing" @click="handleRefresh">
            <ion-spinner v-if="refreshing" /><ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list v-if="!hydrated">
        <ion-item v-for="n in 4" :key="n">
          <ion-label><ion-skeleton-text animated /></ion-label>
        </ion-item>
      </ion-list>
      <template v-else>
        <ion-item v-if="hasCatalogError" color="danger">
          <ion-label class="ion-text-wrap">
            {{ translate("Unable to load the complete carrier catalog.") }}
            <p v-for="message in catalogErrorMessages" :key="message">
              {{ translateReferenceDataError(message) }}
            </p>
          </ion-label><ion-button slot="end" :disabled="refreshing" @click="handleRefresh">
            {{ translate("Retry") }}
          </ion-button>
        </ion-item>
        <ion-list v-if="carriers.length">
          <ion-item v-for="carrier in carriers" :key="carrier.partyId" button detail @click="viewCarrier(carrier.partyId)">
            <ion-label>{{ carrier.groupName || carrier.partyId }}<p>{{ carrier.partyId }}</p></ion-label>
            <ion-note slot="end">
              {{ methodCountsAvailable ? `${carrier.shipmentMethodCount ?? 0} ${translate(carrier.shipmentMethodCount === 1 ? 'method' : 'methods')}` : translate('Method count unavailable') }}
            </ion-note>
          </ion-item>
        </ion-list>
        <div v-else-if="readyForDisplay" class="ion-padding">
          <h2>{{ translate("No carriers configured.") }}</h2>
          <p>{{ translate("Choose a carrier to set up shipping labels or map shipping methods for external fulfillment.") }}</p>
          <ion-button v-for="starter in starters" :key="starter.partyId" fill="outline" :disabled="creating" @click="startCarrier(starter)">
            {{ starter.groupName }}
          </ion-button>
        </div>
      </template>
      <p v-if="notice" class="ion-padding" role="status">
        {{ translate(notice) }}
      </p>
    </ion-content>
    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button :aria-label="translate('Create carrier')" @click="router.push({ path: '/create-carrier' })">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>
<script setup lang="ts">
import { commonUtil, translate } from "@common";
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPage, IonSkeletonText, IonSpinner, IonTitle, IonToolbar } from "@ionic/vue";
import { addOutline, refreshOutline } from "ionicons/icons";
import { ref } from "vue";
import { createCarrier, useCarriers } from "@/composables/useCarriers";
import router from "@/router";
import { isCacheReconciliationError } from "@/utils/cacheReconciliationError";
import { translateReferenceDataError } from "@/utils/errorPresentation";

const { carriers, hydrated, hasCatalogError, catalogErrorMessages, methodCountsAvailable, readyForDisplay, refreshCarriers } = useCarriers();
const refreshing = ref(false);
const creating = ref(false);
const notice = ref("");
const starters = [{ partyId: "FEDEX", groupName: "FedEx" }, { partyId: "UPS", groupName: "UPS" }, { partyId: "CANADA_POST", groupName: "Canada Post" }];
function viewCarrier(partyId: string) { router.push({ name: "CarrierDetails", params: { partyId } }); }
async function handleRefresh() {
  refreshing.value = true;
  try { await refreshCarriers(); } catch { commonUtil.showToast(translate("Unable to load the complete carrier catalog.")); } finally { refreshing.value = false; }
}
async function startCarrier(starter: { partyId: string; groupName: string }) {
  if(creating.value || !readyForDisplay.value) {return;}
  creating.value = true;
  try {
    if(!carriers.value.some(row => row.partyId === starter.partyId)) {await createCarrier(starter);}
    await router.push({ name: "CarrierSetup", params: { partyId: starter.partyId } });
  } catch (error) {
    notice.value = isCacheReconciliationError(error) ? "Carrier saved. Refresh the catalog before continuing." : "Could not create the carrier. Refresh before trying again.";
  } finally { creating.value = false; }
}
</script>
