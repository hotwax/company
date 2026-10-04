<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Klaviyo") }}</ion-title>
        <ion-buttons v-if="hasUnigateConfig" slot="end">
          <ion-button router-link="/unigate" :aria-label="translate('Unigate tenant')">
            <ion-icon slot="icon-only" :icon="serverOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="isInitialLoading" inset>
        <ion-item v-for="item in 3" :key="item">
          <ion-label>
            <ion-skeleton-text animated />
            <p><ion-skeleton-text animated /></p>
            <p><ion-skeleton-text animated /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <template v-else-if="!hasUnigateConfig">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Klaviyo isn't ready on this instance yet") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Connect OMS to UniGate before adding your Klaviyo account. Manage the shared connection on the UniGate page.") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-list inset>
          <ion-item button detail router-link="/unigate">
            <ion-label>{{ translate("Set up UniGate") }}<p>{{ translate("Connect this OMS to UniGate, then return to add your Klaviyo account.") }}</p></ion-label>
          </ion-item>
        </ion-list>
      </template>

      <template v-else-if="!klaviyoConnections.length">
        <ion-list v-if="unigateConfigWarning" inset>
          <ion-item color="warning">
            <ion-label>
              {{ translate("Check the Unigate tenant") }}
              <p>{{ unigateConfigWarning }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Send your first Klaviyo email") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("Connect a Klaviyo account to start sending transactional emails — like ready-for-pickup notifications, BOPIS rejections, and order completions — straight from HotWax.") }}</p>
            <ion-button expand="block" @click="openConnectionModal()">
              <ion-icon slot="start" :icon="addCircleOutline" />
              {{ translate("Connect Klaviyo") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-list inset>
          <ion-item>
            <ion-label>{{ translate("Notify customers the moment their pickup order is ready") }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Confirm completed BOPIS handovers with a thank-you email") }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Send a polite update when an order item gets rejected") }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>{{ translate("Trigger custom Klaviyo flows on cancellations") }}</ion-label>
          </ion-item>
        </ion-list>
      </template>

      <template v-else>
        <ion-list v-if="unigateConfigWarning" inset>
          <ion-item color="warning">
            <ion-label>
              {{ translate("Check the Unigate tenant") }}
              <p>{{ unigateConfigWarning }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-card>
          <ion-card-content>
            <p>{{ translate("Each connection is one Klaviyo account or brand. Open one to control which transactional emails are sent for which product stores.") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-list inset>
          <ion-item
            v-for="conn in klaviyoConnections"
            :key="conn.commGatewayAuthId"
            button
            detail
            @click="openConnection(conn)"
          >
            <ion-label>
              {{ conn.description || translate("Untitled connection") }}
              <p>{{ translate("Connection ID") }}: {{ conn.commGatewayAuthId }}</p>
              <p>{{ translate("API key") }}: {{ maskedKey(conn) }}</p>
              <p>{{ translate("Email events") }}: {{ eventCountLabel(conn) }}</p>
              <p>{{ translate("Endpoint") }}: {{ conn.baseUrl || "https://a.klaviyo.com/api/" }}</p>
            </ion-label>
            <ion-badge slot="end" color="success">
              {{ translate("Connected") }}
            </ion-badge>
          </ion-item>
        </ion-list>
      </template>

      <ion-fab
        v-if="hasUnigateConfig && klaviyoConnections.length"
        slot="fixed"
        vertical="bottom"
        horizontal="end"
      >
        <ion-fab-button @click="openConnectionModal()">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonPage,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addCircleOutline, addOutline, serverOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import KlaviyoConnectionModal from "@/components/klaviyo/KlaviyoConnectionModal.vue";
import { maskApiKey, useKlaviyo } from "@/composables/useKlaviyo";
import { useMaargConfig } from "@/composables/useSeed";
import router from "@/router";
import { getUnigateSendUrlWarning } from "@/utils/maarg";

// Module-level composable state — this page, the details view, and the modal share one copy.
const {
  hasUnigateConfig, unigateConfig, klaviyoConnections, eventCountByGateway,
  hasCheckedUnigate, hydrate, fetchConnections,
} = useKlaviyo();

const isInitialLoading = ref(false);
// Maarg config is seed data held in localStorage; loaded once and read here.
// Read from the store instead of triggering a per-screen fetch.
const { config: maargConfig } = useMaargConfig();
const maargInfo = computed(() => maargConfig.value);
const unigateConfigWarning = computed(() => {
  return getUnigateSendUrlWarning(unigateConfig.value?.sendUrl ?? "", maargInfo.value);
});

onIonViewWillEnter(async () => {
  if(!hasCheckedUnigate.value) {
    isInitialLoading.value = true;
  }
  await hydrate();
  isInitialLoading.value = false;
});

function maskedKey(conn: any) {
  return maskApiKey(conn?.publicKey) || translate("Not set");
}

function eventCountLabel(conn: any) {
  const count = eventCountByGateway.value[conn.commGatewayAuthId] || 0;
  if(count === 0) {return translate("None configured");}
  if(count === 1) {return translate("1 configured");}

  return translate("{count} configured", { count });
}

async function openConnectionModal() {
  const modal = await modalController.create({
    component: KlaviyoConnectionModal,
    componentProps: { connection: null },
  });
  modal.onDidDismiss().then(async (event: any) => {
    if(event?.data?.connection) {
      await fetchConnections();
      router.push(`/klaviyo/${encodeURIComponent(event.data.connection.commGatewayAuthId)}`);
    }
  });
  modal.present();
}

function openConnection(conn: any) {
  // The details view resolves its connection from the route param; the store's write-only
  // `setCurrent` mirror had no reader anywhere and was dropped in the composable migration.
  router.push(`/klaviyo/${encodeURIComponent(conn.commGatewayAuthId)}`);
}
</script>
