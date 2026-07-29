<template>
  <ion-page>
    <ion-header>
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

      <div class="ion-padding-horizontal ion-text-end">
        <ion-button
          fill="outline"
          :disabled="!readyForDisplay || creatingCarrier"
          @click="openCreateCarrierAlert()"
        >
          <ion-icon slot="start" :icon="addOutline" />
          {{ translate("Create carrier") }}
        </ion-button>
      </div>

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

        <ion-list v-if="filteredCarriers.length">
          <ion-item
            v-for="carrier in filteredCarriers"
            :key="carrier.partyId"
            button
            detail
            @click="viewCarrier(carrier.partyId)"
          >
            <ion-label class="ion-text-wrap">
              {{ carrier.groupName || carrier.partyId }}
              <p>{{ carrier.partyId }}</p>
            </ion-label>
            <ion-chip v-if="methodCountsAvailable" slot="end" outline>
              <ion-label>
                {{ carrier.shipmentMethodCount ?? 0 }}
                {{ translate((carrier.shipmentMethodCount ?? 0) === 1
                  ? "shipment method"
                  : "shipment methods") }}
              </ion-label>
            </ion-chip>
            <ion-chip v-else slot="end" outline>
              <ion-label>{{ translate("Method count unavailable") }}</ion-label>
            </ion-chip>
          </ion-item>
        </ion-list>

        <ion-item v-else-if="readyForDisplay && hasSearch" lines="none">
          <ion-label class="ion-text-center ion-text-wrap">
            {{ translate("No carriers match your search.") }}
          </ion-label>
        </ion-item>

        <ion-item v-else-if="readyForDisplay" lines="none">
          <ion-label class="ion-text-center ion-text-wrap">
            {{ translate("No carriers configured.") }}
          </ion-label>
        </ion-item>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonPage,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
} from "@ionic/vue";
import { addOutline, refreshOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { createCarrier, useCarriers } from "@/composables/useCarriers";
import { isCacheReconciliationError } from "@/utils/cacheReconciliationError";
import {
  translateMutationError,
  translateReferenceDataError,
} from "@/utils/errorPresentation";
import router from "@/router";

const {
  carriers,
  hydrated,
  catalogErrors,
  readyForDisplay,
  refreshCarriers,
} = useCarriers();

const searchQuery = ref("");
const refreshing = ref(false);
const creatingCarrier = ref(false);
const refreshError = ref("");

const hasSearch = computed(() => Boolean(searchQuery.value.trim()));
const filteredCarriers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  if(!query) {
    return carriers.value;
  }

  return carriers.value.filter((carrier) =>
    carrier.partyId.toLowerCase().includes(query) ||
    String(carrier.groupName ?? "").toLowerCase().includes(query));
});

const catalogErrorMessages = computed(() => {
  const messages = Object.values(catalogErrors.value)
    .map((message) => String(message).trim())
    .filter(Boolean);

  if(refreshError.value) {
    messages.push(refreshError.value);
  }

  return [...new Set(messages)];
});

const hasCatalogError = computed(() => catalogErrorMessages.value.length > 0);
const methodCountsAvailable = computed(() =>
  !catalogErrors.value.carrierShipmentMethod &&
  !catalogErrors.value.__start);

async function handleRefresh() {
  if(refreshing.value) {
    return;
  }

  refreshing.value = true;
  refreshError.value = "";

  try {
    await refreshCarriers();
  } catch {
    refreshError.value = "Failed to refresh carriers.";
    commonUtil.showToast(translate("Failed to refresh carriers."));
  } finally {
    refreshing.value = false;
  }
}

function viewCarrier(partyId: string) {
  return router.push({
    name: "CarrierDetails",
    params: { partyId },
  });
}

async function submitCarrier(data: Record<string, unknown>): Promise<boolean> {
  if(creatingCarrier.value) {
    return false;
  }

  const partyId = String(data.partyId ?? "").trim().toUpperCase();
  const groupName = String(data.groupName ?? "").trim();

  if(!partyId || !groupName) {
    commonUtil.showToast(translate("Carrier ID and name are required."));

    return false;
  }

  const duplicate = carriers.value.some((carrier) =>
    carrier.partyId.trim().toUpperCase() === partyId);

  if(duplicate) {
    commonUtil.showToast(translate("A carrier with this ID already exists."));

    return false;
  }

  creatingCarrier.value = true;

  try {
    const createdPartyId = await createCarrier({ partyId, groupName });

    try {
      await router.push({
        name: "CarrierDetails",
        params: { partyId: createdPartyId || partyId },
      });
    } catch {
      commonUtil.showToast(translate("Carrier created, but its detail page could not be opened."));
    }

    return true;
  } catch (error) {
    if(isCacheReconciliationError(error)) {
      commonUtil.showToast(translateMutationError(error, "Failed to create carrier."));

      // The POST already committed. Dismiss the alert so a second click cannot duplicate it; the
      // recorded cache-domain error keeps further writes gated until Retry succeeds.
      return true;
    }
    commonUtil.showToast(translateMutationError(error, "Failed to create carrier."));

    return false;
  } finally {
    creatingCarrier.value = false;
  }
}

async function openCreateCarrierAlert() {
  const alert = await alertController.create({
    header: translate("Create carrier"),
    inputs: [
      {
        name: "partyId",
        type: "text",
        placeholder: translate("Carrier ID"),
      },
      {
        name: "groupName",
        type: "text",
        placeholder: translate("Carrier name"),
      },
    ],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel",
      },
      {
        text: translate("Create"),
        handler: submitCarrier,
      },
    ],
  });

  await alert.present();
}
</script>
