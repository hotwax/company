<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ translate("Carriers") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <template v-if="carriers.length">
        <div class="results">
          <ion-list>
            <ion-item v-for="carrier in carriers" :key="carrier.partyId" @click="viewCarrierDetail(carrier)" button detail>
              <ion-label>
                <p class="overline">{{ carrier.partyId }}</p>
                {{ carrier.groupName }}
              </ion-label>
              <ion-note slot="end">{{ carrier.shipmentMethodCount }} {{ translate("methods") }}</ion-note>
            </ion-item>
          </ion-list>
        </div>
      </template>
      <div v-else-if="hasError" class="empty-state">
        <p>{{ translate("Carriers could not be loaded") }}</p>
        <ion-button fill="outline" @click="loadCarriers">{{ translate("Try again") }}</ion-button>
      </div>
      <div v-else-if="!isLoading" class="empty-state">
        <p>{{ translate("No carrier found.") }}</p>
      </div>
    </ion-content>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="createCarrier">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import router from "@/router";
import { useCarrierStore, type CarrierRecord } from "@/store/carrier";

const carrierStore = useCarrierStore();
const carriers = computed(() => carrierStore.getCarriers || []);
const isLoading = computed(() => carrierStore.fetchStatus.carriers === "pending");
const hasError = computed(() => carrierStore.fetchStatus.carriers === "error");

onIonViewWillEnter(loadCarriers);

async function loadCarriers() {
  await carrierStore.fetchCarriers();
}

function viewCarrierDetail(carrier: CarrierRecord) {
  router.push(`/carriers/${encodeURIComponent(carrier.partyId)}`);
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
          if (!partyId || !groupName) return false;
          try {
            const response = await carrierStore.createCarrier(partyId, groupName);
            if (commonUtil.hasError(response)) throw response.data;
            await loadCarriers();
            viewCarrierDetail({ partyId, groupName });
          } catch (error) {
            logger.error("Failed to create carrier", error);
            commonUtil.showToast(translate("Failed to create carrier"));
          }
        },
      },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
ion-note {
  align-self: center;
  padding: 0;
}
</style>
