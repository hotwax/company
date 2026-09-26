<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="dismiss()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ isEdit ? translate("Edit carrier credentials") : translate("Add carrier credentials") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ion-padding">
    <form @submit.prevent="save">
      <ion-list>
        <ion-item>
          <ion-select
            v-model="formData.shippingGatewayConfigId"
            :label="translate('Gateway provider')"
            label-placement="floating"
            :disabled="isEdit"
            required
            data-testid="gateway-provider-select"
          >
            <ion-select-option
              v-for="cfg in shippingGatewayConfigs"
              :key="cfg.shippingGatewayConfigId"
              :value="cfg.shippingGatewayConfigId"
            >
              {{ cfg.description || cfg.shippingGatewayConfigId }} ({{ cfg.shippingGatewayConfigId }})
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.shippingGatewayAuthId"
            :label="translate('Auth ID / Name')"
            label-placement="floating"
            placeholder="e.g. FEDEX_PROD_1"
            :disabled="isEdit"
            required
            data-testid="gateway-auth-id-input"
          />
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.description"
            :label="translate('Description')"
            label-placement="floating"
            placeholder="e.g. FedEx Production Account"
            required
            data-testid="gateway-auth-desc-input"
          />
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.username"
            :label="translate('Account username / Key')"
            label-placement="floating"
            placeholder="e.g. l7xx..."
            data-testid="gateway-auth-username-input"
          />
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.password"
            :label="translate('Account password / Secret')"
            label-placement="floating"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="isEdit ? translate('Leave blank to keep current secret') : ''"
            data-testid="gateway-auth-password-input"
          />
          <ion-button
            slot="end"
            fill="clear"
            @click="showPassword = !showPassword"
            :title="showPassword ? translate('Hide secret') : translate('Show secret')"
          >
            <ion-icon slot="icon-only" :icon="showPassword ? eyeOffOutline : eyeOutline" />
          </ion-button>
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.publicKey"
            :label="translate('Public key / Token')"
            label-placement="floating"
            :type="showPublicKey ? 'text' : 'password'"
            :placeholder="isEdit ? translate('Leave blank to keep current token') : ''"
            data-testid="gateway-auth-publickey-input"
          />
          <ion-button
            slot="end"
            fill="clear"
            @click="showPublicKey = !showPublicKey"
            :title="showPublicKey ? translate('Hide token') : translate('Show token')"
          >
            <ion-icon slot="icon-only" :icon="showPublicKey ? eyeOffOutline : eyeOutline" />
          </ion-button>
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.baseUrl"
            :label="translate('Gateway base URL (optional)')"
            label-placement="floating"
            placeholder="https://apis.fedex.com"
            data-testid="gateway-auth-baseurl-input"
          />
        </ion-item>

        <ion-item>
          <ion-input
            v-model="formData.authHeaderName"
            :label="translate('Auth header name')"
            label-placement="floating"
            placeholder="Authorization"
          />
        </ion-item>
      </ion-list>

      <div class="ion-padding-top">
        <ion-button
          expand="block"
          type="submit"
          :disabled="isSaving || !isValid"
          data-testid="save-gateway-auth-btn"
        >
          <ion-spinner v-if="isSaving" slot="start" />
          {{ isEdit ? translate("Update credentials") : translate("Save credentials") }}
        </ion-button>
      </div>
    </form>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { closeOutline, eyeOffOutline, eyeOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import {
  createShippingGatewayAuth,
  fetchShippingGatewayConfigs,
  type ShippingGatewayAuth,
  updateShippingGatewayAuth,
  useUnigate,
} from "@/composables/useUnigate";

const props = defineProps<{
  auth?: ShippingGatewayAuth | null;
  defaultConfigId?: string;
}>();

const { shippingGatewayConfigs } = useUnigate();

const isEdit = computed(() => Boolean(props.auth?.shippingGatewayAuthId));

const formData = reactive({
  shippingGatewayConfigId: props.auth?.shippingGatewayConfigId || props.defaultConfigId || "FEDEX",
  shippingGatewayAuthId: props.auth?.shippingGatewayAuthId || "",
  description: props.auth?.description || "",
  username: props.auth?.username || "",
  password: "",
  publicKey: "",
  baseUrl: props.auth?.baseUrl || "",
  authHeaderName: props.auth?.authHeaderName || "Authorization",
});

const showPassword = ref(false);
const showPublicKey = ref(false);
const isSaving = ref(false);

const isValid = computed(() => {
  return Boolean(
    formData.shippingGatewayConfigId &&
    formData.shippingGatewayAuthId.trim() &&
    formData.description.trim()
  );
});

onMounted(async () => {
  await fetchShippingGatewayConfigs();
  if (!formData.shippingGatewayConfigId && shippingGatewayConfigs.value.length > 0) {
    formData.shippingGatewayConfigId = shippingGatewayConfigs.value[0].shippingGatewayConfigId;
  }
});

function dismiss(saved = false) {
  modalController.dismiss({ saved });
}

async function save() {
  if (!isValid.value) return;
  isSaving.value = true;
  try {
    if (isEdit.value && props.auth?.shippingGatewayAuthId) {
      const payload: any = {
        description: formData.description.trim(),
        username: formData.username.trim(),
        baseUrl: formData.baseUrl.trim(),
        authHeaderName: formData.authHeaderName.trim(),
      };
      if (formData.password.trim()) payload.password = formData.password.trim();
      if (formData.publicKey.trim()) payload.publicKey = formData.publicKey.trim();

      await updateShippingGatewayAuth(props.auth.shippingGatewayAuthId, payload);
      commonUtil.showToast(translate("Carrier credentials updated successfully."));
    } else {
      await createShippingGatewayAuth({
        shippingGatewayConfigId: formData.shippingGatewayConfigId,
        shippingGatewayAuthId: formData.shippingGatewayAuthId.trim(),
        description: formData.description.trim(),
        username: formData.username.trim(),
        password: formData.password.trim(),
        publicKey: formData.publicKey.trim(),
        baseUrl: formData.baseUrl.trim(),
        authHeaderName: formData.authHeaderName.trim(),
      });
      commonUtil.showToast(translate("Carrier credentials created successfully."));
    }
    dismiss(true);
  } catch (err: any) {
    commonUtil.showToast(translate(err?.message || "Failed to save carrier credentials."));
  } finally {
    isSaving.value = false;
  }
}
</script>
