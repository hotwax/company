<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="dismiss()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Configure Unigate connection") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ion-padding">
    <form @submit.prevent="save">
      <ion-list>
        <ion-item>
          <ion-input
            v-model="formData.sendUrl"
            :label="translate('Unigate base URL')"
            label-placement="floating"
            placeholder="https://unigate-uat.hotwax.io/rest/s1/unigate"
            required
            data-testid="unigate-send-url-input"
          />
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.internalId"
            :label="translate('Tenant ID')"
            label-placement="floating"
            placeholder="STORE"
            required
            data-testid="unigate-tenant-id-input"
          />
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.publicKey"
            :type="showKey ? 'text' : 'password'"
            :label="translate('API Key / Secret')"
            label-placement="floating"
            :placeholder="unigateConfig?.hasKey ? translate('(Key configured - enter to rotate)') : translate('Enter Unigate API key')"
            autocomplete="new-password"
            data-testid="unigate-public-key-input"
          />
          <ion-button
            slot="end"
            fill="clear"
            @click="showKey = !showKey"
            :title="showKey ? translate('Hide API key') : translate('Show API key')"
          >
            <ion-icon slot="icon-only" :icon="showKey ? eyeOffOutline : eyeOutline" />
          </ion-button>
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.description"
            :label="translate('Description')"
            label-placement="floating"
            placeholder="Unigate configuration for shipping and communication integrations"
          />
        </ion-item>
      </ion-list>

      <div class="ion-padding-top">
        <ion-button
          expand="block"
          type="submit"
          :disabled="isSaving || !isValid"
          data-testid="save-unigate-connection-btn"
        >
          <ion-spinner v-if="isSaving" slot="start" />
          {{ translate("Save connection") }}
        </ion-button>
      </div>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { closeOutline, eyeOffOutline, eyeOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { updateUnigateConnection, useUnigate } from "@/composables/useUnigate";

const props = defineProps<{
  initialSendUrl?: string;
  initialTenantId?: string;
  initialDescription?: string;
}>();

const { unigateConfig } = useUnigate();

const formData = reactive({
  sendUrl: props.initialSendUrl || unigateConfig.value?.sendUrl || "",
  internalId: props.initialTenantId || unigateConfig.value?.internalId || "",
  publicKey: "",
  description: props.initialDescription || unigateConfig.value?.description || "",
});

const showKey = ref(false);
const isSaving = ref(false);

const isValid = computed(() => Boolean(formData.sendUrl.trim() && formData.internalId.trim()));

function dismiss(saved = false) {
  modalController.dismiss({ saved });
}

async function save() {
  if (!isValid.value) return;
  isSaving.value = true;
  try {
    const payload: any = {
      sendUrl: formData.sendUrl,
      internalId: formData.internalId,
      description: formData.description,
    };
    if (formData.publicKey.trim()) {
      payload.publicKey = formData.publicKey.trim();
    }
    await updateUnigateConnection(payload);
    commonUtil.showToast(translate("Unigate connection saved successfully."));
    dismiss(true);
  } catch (err: any) {
    commonUtil.showToast(translate(err?.message || "Failed to save Unigate connection."));
  } finally {
    isSaving.value = false;
  }
}
</script>
