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

      <ion-modal :is-open="showUnigateConfig" @didDismiss="onUnigateConfigDismiss">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeUnigateConfig" :aria-label="translate('Close')">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Unigate tenant") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list inset>
            <ion-item lines="none">
              <ion-label>
                {{ translate("This is the OMS-side connection that proxies every Klaviyo call.") }}
                <p>{{ translate("All Klaviyo connections you add here are sent through this tenant. Edit only when the Unigate URL, tenant ID, or API key actually changes.") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>

          <ion-list v-if="unigateConfig" inset>
            <ion-item>
              <ion-input
                v-model="form.internalId"
                :label="translate('Tenant ID')"
                label-placement="stacked"
                :placeholder="translate('Required — your Unigate tenant party ID')"
                :maxlength="60"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="form.sendUrl"
                :label="translate('Unigate base URL')"
                label-placement="stacked"
                :placeholder="'https://unigate.example.com/rest/s1/unigate/'"
              />
            </ion-item>
            <ion-item v-if="sendUrlWarning" color="warning">
              <ion-label>
                {{ translate("Check this Unigate URL") }}
                <p>{{ sendUrlWarning }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-input
                v-model="form.description"
                :label="translate('Description')"
                label-placement="stacked"
                :placeholder="translate('e.g. Unigate connection for shipping and email')"
                :maxlength="120"
              />
            </ion-item>
            <ion-item>
              <ion-input
                v-model="form.authHeaderName"
                :label="translate('Auth header')"
                label-placement="stacked"
                :placeholder="'api_key'"
              />
            </ion-item>
          </ion-list>

          <ion-list v-if="unigateConfig" inset>
            <ion-item>
              <ion-label>
                {{ translate("Unigate API key") }}
                <p>{{ existingMaskedKey }}</p>
                <p>{{ translate("API keys are write-only. The full value is never displayed once saved.") }}</p>
              </ion-label>
              <ion-button v-if="!isReplacingKey" slot="end" fill="outline" color="danger" @click="beginReplaceKey">
                {{ translate("Replace API key") }}
              </ion-button>
            </ion-item>

            <template v-if="isReplacingKey">
              <ion-item color="danger">
                <ion-label>
                  {{ translate("This will stop your current key from working") }}
                  <p>{{ translate("As soon as you save, every Klaviyo connection routed through this tenant will start using the new key. If the new key is wrong or missing, customers will stop receiving emails until you fix it.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-input
                  v-model="form.newApiKey"
                  type="password"
                  :label="translate('New Unigate API key')"
                  label-placement="stacked"
                  autocomplete="off"
                  :spellcheck="false"
                >
                  <ion-input-password-toggle slot="end" />
                </ion-input>
              </ion-item>
              <ion-item>
                <ion-checkbox
                  :checked="confirmedKeyReplacement"
                  @ionChange="confirmedKeyReplacement = $event.detail.checked"
                  justify="space-between"
                >
                {{ translate("I understand the previous key will stop working immediately.") }}
                </ion-checkbox>
              </ion-item>
              <ion-item lines="none">
                <ion-button fill="clear" expand="block" @click="cancelReplaceKey">{{ translate("Cancel key replacement") }}</ion-button>
              </ion-item>
            </template>
          </ion-list>

          <ion-list v-else inset>
            <ion-item>
              <ion-label>
                {{ translate("UNIGATE_CONFIG isn't set up on this OMS instance yet.") }}
                <p>{{ translate("From OMS Admin, open Unigate → Communication Gateway, then Setup Tenant. Once it exists, refresh this page.") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>

          <ion-fab v-if="unigateConfig" vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button
              :disabled="!canSave || isSaving"
              @click="save"
              :aria-label="translate('Save tenant changes')"
            >
              <ion-spinner v-if="isSaving" name="crescent" />
              <ion-icon v-else :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonPage,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addCircleOutline, addOutline, closeOutline, saveOutline, serverOutline } from "ionicons/icons";
import { maskApiKey, updateSystemMessageRemote, useKlaviyo } from '@/composables/useKlaviyo';
import { useMaargConfig } from '@/composables/useSeed';
import router from "@/router";
import { commonUtil, logger, translate } from '@common';
import KlaviyoConnectionModal from "@/components/klaviyo/KlaviyoConnectionModal.vue";
import { getPreferredUnigateSendUrl, getUnigateSendUrlWarning } from "@/utils/maarg";

// Module-level composable state — this page, the details view, and the modal share one copy.
const {
  hasUnigateConfig, unigateConfig, klaviyoConnections, eventCountByGateway,
  hasCheckedUnigate, hydrate, fetchUnigateConfig, fetchConnections,
} = useKlaviyo();

const isInitialLoading = ref(false);
const isRechecking = ref(false);
// Maarg config is seed data held in localStorage; loaded once and read here.
// Read from the store instead of triggering a per-screen fetch.
const { config: maargConfig, load: loadMaargConfig } = useMaargConfig();
const maargInfo = computed(() => maargConfig.value);
const unigateConfigWarning = computed(() => {
  return getUnigateSendUrlWarning(unigateConfig.value?.sendUrl ?? "", maargInfo.value);
});

// --- Unigate tenant config modal (inlined) ---
const showUnigateConfig = ref(false);

const form = reactive({
  internalId: unigateConfig.value?.internalId || "",
  sendUrl: getPreferredUnigateSendUrl(unigateConfig.value?.sendUrl || "", maargInfo.value),
  description: unigateConfig.value?.description || "",
  authHeaderName: unigateConfig.value?.authHeaderName || "api_key",
  newApiKey: "",
});

const isReplacingKey = ref(false);
const confirmedKeyReplacement = ref(false);
const isSaving = ref(false);

const existingMaskedKey = computed(() => {
  const masked = maskApiKey(unigateConfig.value?.publicKey);
  return masked || translate("Saved on the server (not visible)");
});

// Tenant ID is always required to save. The API key is required only when
// the user explicitly chose to replace it (existing key remains otherwise).
const canSave = computed(() => {
  if (!form.internalId.trim()) return false;
  if (isReplacingKey.value) {
    if (!form.newApiKey.trim()) return false;
    if (!confirmedKeyReplacement.value) return false;
  }
  return true;
});

const sendUrlWarning = computed(() => getUnigateSendUrlWarning(form.sendUrl, maargInfo.value));

function beginReplaceKey() {
  isReplacingKey.value = true;
  form.newApiKey = "";
  confirmedKeyReplacement.value = false;
}

function cancelReplaceKey() {
  isReplacingKey.value = false;
  form.newApiKey = "";
  confirmedKeyReplacement.value = false;
}

async function save() {
  if (!canSave.value || !unigateConfig.value) return;
  isSaving.value = true;

  try {
    const payload: any = {
      internalId: form.internalId.trim(),
      sendUrl: form.sendUrl.trim(),
      description: form.description.trim(),
      authHeaderName: form.authHeaderName.trim() || "api_key",
    };
    if (isReplacingKey.value && form.newApiKey.trim()) {
      payload.publicKey = form.newApiKey.trim();
    }
    await updateSystemMessageRemote(unigateConfig.value.systemMessageRemoteId, payload);
    void loadMaargConfig();
    await fetchUnigateConfig();
    commonUtil.showToast(translate("Unigate tenant updated"));
    closeUnigateConfig();
  } catch (error: any) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to update Unigate tenant"));
  } finally {
    isSaving.value = false;
  }
}

function closeUnigateConfig() {
  showUnigateConfig.value = false;
}

// Runs on every dismiss (close button, save, backdrop) — mirrors the former
// modal's onDidDismiss() → fetchUnigateConfig() follow-up.
async function onUnigateConfigDismiss() {
  await fetchUnigateConfig();
}
// --- end Unigate tenant config modal ---

onIonViewWillEnter(async () => {
  if (!hasCheckedUnigate.value) {
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
  if (count === 0) return translate("None configured");
  if (count === 1) return translate("1 configured");
  return translate("{count} configured", { count });
}

async function recheckUnigate() {
  isRechecking.value = true;
  try {
    await hydrate();
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
      await fetchConnections();
      router.push(`/klaviyo/${encodeURIComponent(event.data.connection.commGatewayAuthId)}`);
    }
  });
  modal.present();
}

function openUnigateConfigModal() {
  // Re-seed form + local state so each open behaves like a fresh modal instance.
  form.internalId = unigateConfig.value?.internalId || "";
  form.sendUrl = getPreferredUnigateSendUrl(unigateConfig.value?.sendUrl || "", maargInfo.value);
  form.description = unigateConfig.value?.description || "";
  form.authHeaderName = unigateConfig.value?.authHeaderName || "api_key";
  form.newApiKey = "";
  isReplacingKey.value = false;
  confirmedKeyReplacement.value = false;
  isSaving.value = false;
  showUnigateConfig.value = true;
}

function openConnection(conn: any) {
  // The details view resolves its connection from the route param; the store's write-only
  // `setCurrent` mirror had no reader anywhere and was dropped in the composable migration.
  router.push(`/klaviyo/${encodeURIComponent(conn.commGatewayAuthId)}`);
}
</script>
