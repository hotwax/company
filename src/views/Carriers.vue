<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Carriers") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="isLoading" @click="loadCarriers" :aria-label="translate('Refresh carriers')">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-searchbar
            v-model="query"
            :placeholder="translate('Search carriers')"
            :debounce="200"
          />
        </ion-card-content>
      </ion-card>

      <ion-list v-if="isLoading" inset>
        <ion-item v-for="item in 4" :key="item">
          <ion-label>
            <ion-skeleton-text animated />
            <p><ion-skeleton-text animated /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-else-if="hasError" inset>
        <ion-item color="danger">
          <ion-icon slot="start" :icon="alertCircleOutline" />
          <ion-label>
            {{ translate("Carriers could not be loaded") }}
            <p>{{ translate("Check your OMS connection and try again.") }}</p>
          </ion-label>
          <ion-button slot="end" fill="outline" @click="loadCarriers">{{ translate("Try again") }}</ion-button>
        </ion-item>
      </ion-list>

      <ion-list v-else inset>
        <ion-list-header>
          <ion-label>{{ carrierCountLabel }}</ion-label>
        </ion-list-header>
        <ion-item
          v-for="carrier in filteredCarriers"
          :key="carrier.partyId"
          button
          detail
          @click="openCarrier(carrier.partyId)"
        >
          <ion-icon slot="start" :icon="airplaneOutline" />
          <ion-label>
            {{ carrier.groupName || carrier.partyId }}
            <p>{{ carrier.partyId }}</p>
          </ion-label>
          <ion-note slot="end">{{ methodCountLabel(carrier.shipmentMethodCount || 0) }}</ion-note>
        </ion-item>
        <ion-item v-if="!filteredCarriers.length" lines="none">
          <ion-label>
            {{ query ? translate("No carriers match your search") : translate("No carriers found") }}
            <p>{{ query ? translate("Try a different carrier name or ID.") : translate("Create a carrier to begin configuring shipment methods and Unigate.") }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="createCarrier" :aria-label="translate('Create carrier')">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addOutline, airplaneOutline, alertCircleOutline, refreshOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import router from "@/router";
import { useCarrierStore } from "@/store/carrier";

const carrierStore = useCarrierStore();
const query = ref("");

const carriers = computed(() => carrierStore.getCarriers || []);
const isLoading = computed(() => carrierStore.fetchStatus.carriers === "pending");
const hasError = computed(() => carrierStore.fetchStatus.carriers === "error");
const filteredCarriers = computed(() => {
  const normalized = query.value.trim().toLowerCase();
  if (!normalized) return carriers.value;
  return carriers.value.filter((carrier) => (
    carrier.partyId.toLowerCase().includes(normalized)
    || String(carrier.groupName || "").toLowerCase().includes(normalized)
  ));
});
const carrierCountLabel = computed(() => {
  const count = filteredCarriers.value.length;
  return count === 1 ? translate("1 carrier") : translate("{count} carriers", { count });
});

onIonViewWillEnter(loadCarriers);

async function loadCarriers() {
  await carrierStore.fetchCarriers();
}

function methodCountLabel(count: number) {
  return count === 1 ? translate("1 method") : translate("{count} methods", { count });
}

function openCarrier(partyId: string) {
  router.push(`/carriers/${encodeURIComponent(partyId)}`);
}

async function createCarrier() {
  const alert = await alertController.create({
    header: translate("Create carrier"),
    inputs: [
      { name: "partyId", placeholder: translate("Carrier ID") },
      { name: "groupName", placeholder: translate("Carrier name") },
    ],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Create"),
        handler: async (data: any) => {
          const partyId = String(data.partyId || "").trim().toUpperCase();
          const groupName = String(data.groupName || "").trim();
          if (!partyId || !groupName) {
            commonUtil.showToast(translate("Carrier ID and name are required."));
            return false;
          }
          try {
            await carrierStore.createCarrier(partyId, groupName);
            commonUtil.showToast(translate("Carrier created"));
            await loadCarriers();
            openCarrier(partyId);
          } catch (error) {
            logger.error(error);
            commonUtil.showToast(translate("Failed to create carrier"));
          }
        },
      },
    ],
  });
  await alert.present();
}
</script>
