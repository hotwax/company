<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal" :aria-label="translate('Close')">
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

    <ion-list v-if="config" inset>
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

    <ion-list v-if="config" inset>
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
            spellcheck="false"
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

    <ion-fab v-if="config" vertical="bottom" horizontal="end" slot="fixed">
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
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  IonButton,
  IonButtons,
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
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { useStore } from "vuex";
import { translate } from "@/i18n";
import { KlaviyoService } from "@/services/KlaviyoService";
import { getResponseErrorMessage, showToast } from "@/utils";
import logger from "@/logger";
import { getPreferredUnigateSendUrl, getUnigateSendUrlWarning } from "@/utils/maarg";

const store = useStore();
const config = computed(() => store.getters["klaviyo/getUnigateConfig"]);
// maargInfo is fetched once at login (user/login → util/fetchMaargInfo).
// Read from the store instead of refetching per modal open.
const maargInfo = computed(() => store.getters["util/getMaargInfo"]);

const form = reactive({
  internalId: config.value?.internalId || "",
  sendUrl: getPreferredUnigateSendUrl(config.value?.sendUrl || "", maargInfo.value),
  description: config.value?.description || "",
  authHeaderName: config.value?.authHeaderName || "api_key",
  newApiKey: "",
});

const isReplacingKey = ref(false);
const confirmedKeyReplacement = ref(false);
const isSaving = ref(false);

const existingMaskedKey = computed(() => {
  const masked = KlaviyoService.maskApiKey(config.value?.publicKey);
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

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

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
  if (!canSave.value || !config.value) return;
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
    await KlaviyoService.updateSystemMessageRemote(config.value.systemMessageRemoteId, payload);
    await store.dispatch("klaviyo/fetchUnigateConfig");
    showToast(translate("Unigate tenant updated"));
    closeModal();
  } catch (error: any) {
    logger.error(error);
    showToast(getResponseErrorMessage(error, translate("Failed to update Unigate tenant")));
  } finally {
    isSaving.value = false;
  }
}
</script>
