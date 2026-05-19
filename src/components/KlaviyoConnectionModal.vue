<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal" :aria-label="translate('Close')">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ isEdit ? translate("Klaviyo connection") : translate("Connect Klaviyo") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-label>
          {{ isEdit ? form.description || translate("Untitled connection") : translate("Connect a Klaviyo account") }}
          <p v-if="!isEdit">
            {{ translate("Use a Klaviyo private API key to send transactional emails like ready-for-pickup notifications. Each connection represents one Klaviyo account or brand.") }}
          </p>
          <p v-else>
            {{ translate("Editing only changes how this connection appears in HotWax. To replace the live API key, use the dedicated control below.") }}
          </p>
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.description"
          :label="translate('Connection name')"
          label-placement="stacked"
          :placeholder="translate('e.g. Brand A — production')"
          :maxlength="120"
        />
      </ion-item>
      <ion-item>
        <ion-label>
          <h3>{{ translate("Connection ID") }}</h3>
          <p>{{ isEdit ? form.commGatewayAuthId : previewAuthId }}</p>
          <p v-if="!isEdit">{{ translate("Generated automatically from the connection name. Cannot be changed later.") }}</p>
        </ion-label>
      </ion-item>
    </ion-list>

    <ion-list v-if="!isEdit" inset>
      <ion-item>
        <ion-input
          v-model="form.privateApiKey"
          type="password"
          :label="translate('Klaviyo private API key')"
          label-placement="stacked"
          :placeholder="'pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'"
          autocomplete="off"
          spellcheck="false"
        >
          <ion-input-password-toggle slot="end" />
        </ion-input>
      </ion-item>
      <ion-item>
        <ion-label>
          <p>{{ translate("Find this in Klaviyo at Settings → API Keys → Create Private API Key. Paste only the key value (no Authorization header).") }}</p>
        </ion-label>
      </ion-item>
    </ion-list>

    <ion-list v-else inset>
      <ion-item>
        <ion-label>
          <h3>{{ translate("Klaviyo private API key") }}</h3>
          <p>{{ maskedExistingKey }}</p>
          <p>{{ translate("API keys are write-only. The full value is never displayed once saved.") }}</p>
        </ion-label>
        <ion-button v-if="!isReplacingKey" slot="end" fill="outline" color="danger" @click="beginReplaceKey">
          {{ translate("Replace API key") }}
        </ion-button>
      </ion-item>

      <template v-if="isReplacingKey">
        <ion-item color="danger">
          <ion-label>
            <h3>{{ translate("This will stop your current key from working") }}</h3>
            <p>{{ translate("As soon as you save, every email this connection handles will start using the new key. If the new key is wrong or missing, customers will stop receiving emails until you fix it.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-input
            v-model="form.privateApiKey"
            type="password"
            :label="translate('New Klaviyo private API key')"
            label-placement="stacked"
            :placeholder="'pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'"
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

    <ion-list inset>
      <ion-item>
        <ion-label>
          <h3>{{ translate("Endpoint") }}</h3>
          <p>{{ form.baseUrl }}</p>
          <p>{{ translate("Klaviyo API base URL — pre-filled and not editable.") }}</p>
        </ion-label>
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button
        :disabled="!canSave || isSaving"
        @click="save"
        :aria-label="isEdit ? translate('Save changes') : translate('Connect Klaviyo')"
      >
        <ion-spinner v-if="isSaving" name="crescent" />
        <ion-icon v-else :icon="isEdit ? saveOutline : checkmarkOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, defineProps, ref, watch } from "vue";
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
import { checkmarkOutline, closeOutline, saveOutline } from "ionicons/icons";
import { useStore } from "vuex";
import { translate } from "@/i18n";
import { KlaviyoService } from "@/services/KlaviyoService";
import { getResponseErrorMessage, hasError, showToast } from "@/utils";
import logger from "@/logger";

const props = defineProps<{ connection?: any | null }>();

const store = useStore();
const isEdit = computed(() => !!props.connection?.commGatewayAuthId);

const form = ref({
  commGatewayAuthId: props.connection?.commGatewayAuthId || "",
  description: props.connection?.description || "",
  baseUrl: props.connection?.baseUrl || "https://a.klaviyo.com/api/",
  authHeaderName: props.connection?.authHeaderName || "Authorization",
  privateApiKey: "",
});

const isReplacingKey = ref(false);
const confirmedKeyReplacement = ref(false);
const isSaving = ref(false);

const previewAuthId = computed(() => {
  if (!form.value.description.trim()) return translate("(generated when you enter a name)");
  return KlaviyoService.generateAuthId(form.value.description).slice(0, 60);
});

const maskedExistingKey = computed(() => {
  const masked = KlaviyoService.maskApiKey(props.connection?.publicKey);
  return masked || translate("Not set");
});

const canSave = computed(() => {
  if (!form.value.description.trim()) return false;
  if (!isEdit.value) {
    return !!form.value.privateApiKey.trim();
  }
  if (isReplacingKey.value) {
    return !!form.value.privateApiKey.trim() && confirmedKeyReplacement.value;
  }
  return true;
});

watch(
  () => props.connection,
  (next) => {
    if (!next) return;
    form.value.commGatewayAuthId = next.commGatewayAuthId || "";
    form.value.description = next.description || "";
    form.value.baseUrl = next.baseUrl || "https://a.klaviyo.com/api/";
    form.value.authHeaderName = next.authHeaderName || "Authorization";
    form.value.privateApiKey = "";
    isReplacingKey.value = false;
    confirmedKeyReplacement.value = false;
  }
);

function closeModal(payload: any = { dismissed: true }) {
  modalController.dismiss(payload);
}

function beginReplaceKey() {
  isReplacingKey.value = true;
  form.value.privateApiKey = "";
  confirmedKeyReplacement.value = false;
}

function cancelReplaceKey() {
  isReplacingKey.value = false;
  form.value.privateApiKey = "";
  confirmedKeyReplacement.value = false;
}

async function save() {
  if (!canSave.value) return;
  isSaving.value = true;

  try {
    if (isEdit.value) {
      const payload: any = {
        commGatewayConfigId: "KLAVIYO",
        description: form.value.description.trim(),
      };
      if (isReplacingKey.value && form.value.privateApiKey.trim()) {
        payload.publicKey = KlaviyoService.ensureKeyPrefix(form.value.privateApiKey.trim());
        payload.authHeaderName = form.value.authHeaderName || "Authorization";
        payload.baseUrl = form.value.baseUrl;
      }
      const updated = await KlaviyoService.updateCommGatewayAuth(form.value.commGatewayAuthId, payload);
      await store.dispatch("klaviyo/fetchConnections");
      showToast(translate("Klaviyo connection updated"));
      closeModal({ dismissed: false, connection: updated });
    } else {
      const id = KlaviyoService.generateAuthId(form.value.description.trim());
      const payload = {
        commGatewayAuthId: id,
        commGatewayConfigId: "KLAVIYO",
        description: form.value.description.trim(),
        baseUrl: form.value.baseUrl,
        authHeaderName: form.value.authHeaderName,
        publicKey: KlaviyoService.ensureKeyPrefix(form.value.privateApiKey.trim()),
      };
      const created: any = await KlaviyoService.createCommGatewayAuth(payload);
      if (hasError({ data: created })) throw created;
      await store.dispatch("klaviyo/fetchConnections");
      showToast(translate("Klaviyo connected"));
      closeModal({ dismissed: false, connection: created || payload });
    }
  } catch (error: any) {
    logger.error(error);
    showToast(getResponseErrorMessage(error, translate("Failed to save Klaviyo connection")));
  } finally {
    isSaving.value = false;
  }
}
</script>
