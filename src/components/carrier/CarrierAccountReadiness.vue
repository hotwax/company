<template>
  <section data-testid="carrier-account-readiness">
    <ion-list>
      <ion-item lines="full">
        <ion-label class="ion-text-wrap">
          <h2>{{ translate("Account readiness") }}</h2>
          <p>
            {{ translate("Carrier account verification is read-only here. Manage Unigate configuration in Klaviyo.") }}
          </p>
        </ion-label>
        <ion-button
          slot="end"
          fill="outline"
          :disabled="disabled"
          @click="emit('open-klaviyo')"
        >
          {{ translate("Manage Unigate in Klaviyo") }}
        </ion-button>
      </ion-item>

      <ion-item
        v-for="item in readinessItems"
        :key="item.key"
      >
        <ion-label class="ion-text-wrap">
          <h2>{{ translate(item.label) }}</h2>
          <p v-if="item.key === 'tenant' && remote?.internalId">
            {{ translate("Tenant ID") }}: {{ remote.internalId }}
          </p>
        </ion-label>
        <ion-chip slot="end" outline>
          <ion-label>{{ statusLabel(item.status) }}</ion-label>
        </ion-chip>
      </ion-item>

      <ion-item v-if="readiness?.remote?.error" lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translateCarrierAccountVerificationError(readiness.remote.error) }}</p>
        </ion-label>
      </ion-item>
    </ion-list>
  </section>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonButton,
  IonChip,
  IonItem,
  IonLabel,
  IonList,
} from "@ionic/vue";
import { computed } from "vue";
import type {
  CarrierReadiness,
  CarrierReadinessStatus,
} from "@/composables/useCarriers";
import { translateCarrierAccountVerificationError } from "@/utils/errorPresentation";

const props = withDefaults(defineProps<{
  readiness: CarrierReadiness;
  remote?: Record<string, any> | null;
  disabled?: boolean;
}>(), {
  remote: null,
  disabled: false,
});

const emit = defineEmits<{
  (event: "open-klaviyo"): void;
}>();

const readinessItems = computed(() => [
  {
    key: "tenant",
    label: "Unigate tenant",
    status: props.readiness.tenant,
  },
  {
    key: "credential",
    label: "Carrier credentials",
    status: props.readiness.credential,
  },
  {
    key: "store-link",
    label: "Product store link",
    status: props.readiness.storeLink,
  },
  {
    key: "automatic-address-validation",
    label: "Automatic address validation",
    status: props.readiness.automaticAddressValidation,
  },
]);

function statusLabel(status: CarrierReadinessStatus) {
  const labels: Record<CarrierReadinessStatus, string> = {
    loading: "Loading",
    ready: "Ready",
    "action-required": "Action required",
    "verification-unavailable": "Verification unavailable",
    "not-applicable": "Not applicable",
  };

  return translate(labels[status]);
}
</script>
