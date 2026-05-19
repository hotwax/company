<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Klaviyo") }}</ion-title>
        <ion-buttons slot="end" v-if="hasUnigateConfig">
          <ion-button @click="openUnigateConfigModal()" :aria-label="translate('Unigate tenant')">
            <ion-icon slot="icon-only" :icon="serverOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="isInitialLoading" inset>
        <ion-item v-for="item in 3" :key="item">
          <ion-label>
            <h2><ion-skeleton-text animated /></h2>
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
            <p>{{ translate("Before you can connect Klaviyo, your HotWax instance needs a Unigate tenant. This is a one-time setup an admin does on the OMS, and unlocks every email and shipping integration that runs through Unigate.") }}</p>
          </ion-card-content>
        </ion-card>

        <ion-list inset>
          <ion-item>
            <ion-label>
              <h2>1. {{ translate("Provision a Unigate tenant") }}</h2>
              <p>{{ translate("From OMS Admin, open Unigate → Communication Gateway, then click Setup Tenant. You'll need a Tenant ID, the Unigate base URL, and a Unigate API key.") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <h2>2. {{ translate("Reload this page") }}</h2>
              <p>{{ translate("Once UNIGATE_CONFIG exists on the OMS, refresh and you'll be able to add a Klaviyo connection here.") }}</p>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-button expand="block" @click="recheckUnigate" :disabled="isRechecking">
              <ion-spinner v-if="isRechecking" name="crescent" />
              <span v-else>{{ translate("Check again") }}</span>
            </ion-button>
          </ion-item>
        </ion-list>
      </template>

      <template v-else-if="!klaviyoConnections.length">
        <ion-list v-if="unigateConfigWarning" inset>
          <ion-item color="warning">
            <ion-label>
              <h2>{{ translate("Check the Unigate tenant") }}</h2>
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
              <h2>{{ translate("Check the Unigate tenant") }}</h2>
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
              <h2>{{ conn.description || translate("Untitled connection") }}</h2>
              <p>{{ translate("Connection ID") }}: {{ conn.commGatewayAuthId }}</p>
              <p>{{ translate("API key") }}: {{ maskedKey(conn) }}</p>
              <p>{{ translate("Email events") }}: {{ eventCountLabel(conn) }}</p>
              <p>{{ translate("Endpoint") }}: {{ conn.baseUrl || "https://a.klaviyo.com/api/" }}</p>
            </ion-label>
            <ion-badge slot="end" color="success">{{ translate("Connected") }}</ion-badge>
          </ion-item>
        </ion-list>
      </template>

      <ion-fab
        v-if="hasUnigateConfig && klaviyoConnections.length"
        vertical="bottom"
        horizontal="end"
        slot="fixed"
      >
        <ion-fab-button @click="openConnectionModal()">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
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
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addCircleOutline, addOutline, serverOutline } from "ionicons/icons";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import { translate } from "@/i18n";
import { KlaviyoService } from "@/services/KlaviyoService";
import KlaviyoConnectionModal from "@/components/KlaviyoConnectionModal.vue";
import KlaviyoUnigateConfigModal from "@/components/KlaviyoUnigateConfigModal.vue";
import { getUnigateSendUrlWarning } from "@/utils/maarg";

const store = useStore();
const router = useRouter();

const isInitialLoading = ref(false);
const isRechecking = ref(false);

const hasUnigateConfig = computed(() => store.getters["klaviyo/hasUnigateConfig"]);
const unigateConfig = computed(() => store.getters["klaviyo/getUnigateConfig"]);
const klaviyoConnections = computed(() => store.getters["klaviyo/getKlaviyoConnections"] || []);
const eventCountByGateway = computed(() => store.getters["klaviyo/getEventCountByGateway"] || {});
// maargInfo is fetched once at login (see user/login → util/fetchMaargInfo)
// and lives in the util Vuex module. Read it from the store instead of
// triggering a per-screen fetch.
const maargInfo = computed(() => store.getters["util/getMaargInfo"]);
const unigateConfigWarning = computed(() => {
  return getUnigateSendUrlWarning(unigateConfig.value?.sendUrl, maargInfo.value);
});

onIonViewWillEnter(async () => {
  if (!store.getters["klaviyo/hasCheckedUnigate"]) {
    isInitialLoading.value = true;
  }
  await store.dispatch("klaviyo/hydrate");
  isInitialLoading.value = false;
});

function maskedKey(conn: any) {
  return KlaviyoService.maskApiKey(conn?.publicKey) || translate("Not set");
}

function eventCountLabel(conn: any) {
  const count = eventCountByGateway.value[conn.commGatewayAuthId] || 0;
  if (count === 0) return translate("None configured");
  if (count === 1) return translate("1 configured");
  return translate("{count} configured", { count });
}

async function recheckUnigate() {
  isRechecking.value = true;
  try {
    await store.dispatch("klaviyo/hydrate");
  } finally {
    isRechecking.value = false;
  }
}

async function openConnectionModal() {
  const modal = await modalController.create({
    component: KlaviyoConnectionModal,
    componentProps: { connection: null },
  });
  modal.onDidDismiss().then(async (event: any) => {
    if (event?.data?.connection) {
      await store.dispatch("klaviyo/fetchConnections");
      router.push(`/klaviyo/${encodeURIComponent(event.data.connection.commGatewayAuthId)}`);
    }
  });
  modal.present();
}

async function openUnigateConfigModal() {
  const modal = await modalController.create({ component: KlaviyoUnigateConfigModal });
  modal.onDidDismiss().then(async () => {
    await store.dispatch("klaviyo/fetchUnigateConfig");
  });
  modal.present();
}

function openConnection(conn: any) {
  store.dispatch("klaviyo/setCurrent", conn);
  router.push(`/klaviyo/${encodeURIComponent(conn.commGatewayAuthId)}`);
}
</script>
