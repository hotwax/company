<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Carriers") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :aria-label="translate('Refresh carriers')"
            :disabled="refreshing"
            @click="handleRefresh()"
          >
            <ion-spinner v-if="refreshing" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar
        v-model="searchQuery"
        :placeholder="translate('Search carriers')"
      />

      <ion-list v-if="!hydrated">
        <ion-item v-for="index in 4" :key="`carrier-skeleton-${index}`">
          <ion-label>
            <ion-skeleton-text animated style="width: 45%" />
            <ion-skeleton-text animated style="width: 25%" />
          </ion-label>
        </ion-item>
      </ion-list>

      <template v-else>
        <ion-item v-if="hasCatalogError" color="danger">
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("Unable to load the complete carrier catalog.") }}</h2>
            <p v-for="message in catalogErrorMessages" :key="message">
              {{ translateReferenceDataError(message) }}
            </p>
          </ion-label>
          <ion-button
            slot="end"
            fill="outline"
            color="light"
            :disabled="refreshing"
            @click="handleRefresh()"
          >
            {{ translate("Retry") }}
          </ion-button>
        </ion-item>

        <div v-if="filteredCarriers.length" class="results">
          <ion-list>
            <ion-item
              v-for="carrier in filteredCarriers"
              :key="carrier.partyId"
              button
              detail
              @click="viewCarrier(carrier.partyId)"
            >
              <ion-label>
                <p class="overline">{{ carrier.partyId }}</p>
                {{ carrier.groupName || carrier.partyId }}
              </ion-label>
              <ion-note v-if="methodCountsAvailable" slot="end">
                {{ carrier.shipmentMethodCount ?? 0 }} {{ translate((carrier.shipmentMethodCount ?? 0) === 1 ? "method" : "methods") }}
              </ion-note>
              <ion-note v-else slot="end">
                {{ translate("Method count unavailable") }}
              </ion-note>
            </ion-item>
          </ion-list>
        </div>

        <div v-else-if="readyForDisplay && hasSearch" class="empty-state">
          <p>{{ translate("No carriers match your search.") }}</p>
        </div>

        <div v-else-if="readyForDisplay" class="empty-state">
          <p>{{ translate("No carriers configured.") }}</p>
        </div>
      </template>
    </ion-content>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :aria-label="translate('Create carrier')" @click="createCarrier()">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { addOutline, refreshOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { useCarriers } from "@/composables/useCarriers";
import { translateReferenceDataError } from "@/utils/errorPresentation";
import router from "@/router";

const {
  carriers,
  hydrated,
  hasCatalogError,
  catalogErrorMessages,
  methodCountsAvailable,
  readyForDisplay,
  refreshCarriers,
} = useCarriers();

const searchQuery = ref("");
const refreshing = ref(false);

const hasSearch = computed(() => Boolean(searchQuery.value.trim()));

const filteredCarriers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    return carriers.value;
  }

  return carriers.value.filter((carrier) =>
    carrier.partyId.toLowerCase().includes(query) ||
    String(carrier.groupName ?? "").toLowerCase().includes(query),
  );
});

function viewCarrier(partyId: string) {
  router.push({ name: "CarrierDetails", params: { partyId } });
}

function createCarrier() {
  router.push({ path: "/create-carrier" });
}

async function handleRefresh() {
  if (refreshing.value) {
    return;
  }

  refreshing.value = true;
  try {
    await refreshCarriers();
    commonUtil.showToast(translate("Carrier catalog refreshed."));
  } catch (err: any) {
    commonUtil.showToast(
      translateReferenceDataError(err?.message || "Failed to refresh carriers."),
    );
  } finally {
    refreshing.value = false;
  }
}
</script>

<style scoped>
ion-note {
  align-self: center;
  padding: 0;
}
</style>
