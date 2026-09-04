<template>
  <section data-testid="carrier-account-readiness">
    <ion-list>
      <ion-item lines="full">
        <ion-label class="ion-text-wrap">
          <h2>{{ translate("Account readiness") }}</h2>
          <p>
            {{ translate("Manage Unigate connection, carrier credentials, and store configurations for this carrier.") }}
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
        <ion-chip slot="end" :color="chipColor(item.status)" outline>
          <ion-label>{{ statusLabel(item.status) }}</ion-label>
        </ion-chip>
      </ion-item>

      <ion-item v-if="readiness?.remote?.error" lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translateCarrierAccountVerificationError(readiness.remote.error) }}</p>
        </ion-label>
      </ion-item>
    </ion-list>

    <!-- In-Context Carrier Credentials -->
    <div class="ion-padding-horizontal ion-padding-top readiness-action-section">
      <div class="section-title-row">
        <h3>{{ translate("Configured credentials") }}</h3>
        <ion-button size="small" fill="outline" @click="openCreateAuthModal" data-testid="add-carrier-auth-btn">
          <ion-icon slot="start" :icon="addOutline" />
          {{ translate("Add credentials") }}
        </ion-button>
      </div>

      <p v-if="matchingAuths.length === 0" class="text-muted ion-margin-bottom">
        {{ translate("No credentials specifically matching this carrier found.") }}
      </p>

      <ion-list v-else lines="inset">
        <ion-item v-for="auth in matchingAuths" :key="auth.shippingGatewayAuthId">
          <ion-label>
            <h4>{{ auth.description || auth.shippingGatewayAuthId }}</h4>
            <p>{{ translate("Auth ID") }}: {{ auth.shippingGatewayAuthId }} ({{ auth.shippingGatewayConfigId }})</p>
          </ion-label>
          <ion-chip slot="end" color="primary" outline>
            <ion-label>{{ auth.shippingGatewayConfigId }}</ion-label>
          </ion-chip>
        </ion-item>
      </ion-list>
    </div>

    <!-- In-Context Carrier Store Mappings -->
    <div class="ion-padding-horizontal ion-padding-top readiness-action-section">
      <div class="section-title-row">
        <h3>{{ translate("Store mappings") }}</h3>
        <ion-button size="small" fill="outline" @click="openCreateMappingModal" data-testid="add-carrier-mapping-btn">
          <ion-icon slot="start" :icon="addOutline" />
          {{ translate("Add mapping") }}
        </ion-button>
      </div>

      <p v-if="carrierConfigs.length === 0" class="text-muted ion-margin-bottom">
        {{ translate("No store mappings configured for this carrier.") }}
      </p>

      <ion-list v-else lines="inset">
        <ion-item v-for="cfg in carrierConfigs" :key="cfg.carrierConfigId">
          <ion-label>
            <h4>{{ cfg.productStoreId }} <span v-if="cfg.facilityId">({{ translate("Facility") }}: {{ cfg.facilityId }})</span></h4>
            <p>{{ translate("Gateway Auth") }}: {{ cfg.gatewayAuthId }} | {{ translate("Account #") }}: {{ cfg.carrierAccountId || translate("N/A") }}</p>
          </ion-label>
          <ion-chip slot="end" color="secondary" outline>
            <ion-label>{{ cfg.gatewayAuthId }}</ion-label>
          </ion-chip>
        </ion-item>
      </ion-list>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import {
  IonButton,
  IonChip,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  modalController,
} from "@ionic/vue";
import { addOutline } from "ionicons/icons";
import { translate } from "@common";
import type {
  CarrierReadiness,
  CarrierReadinessStatus,
} from "@/composables/useCarriers";
import { translateCarrierAccountVerificationError } from "@/utils/errorPresentation";
import { useCarrierUnigateReadiness, useUnigate } from "@/composables/useUnigate";
import UnigateConnectionModal from "@/components/unigate/UnigateConnectionModal.vue";
import CreateShippingGatewayAuthModal from "@/components/unigate/CreateShippingGatewayAuthModal.vue";
import ShippingCarrierConfigModal from "@/components/unigate/ShippingCarrierConfigModal.vue";

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

const { fetchShippingGatewayAuths, fetchShippingCarrierConfigs } = useUnigate();
const { matchingAuths, carrierConfigs, tenantStatus, credentialStatus, storeLinkStatus, addressValidationStatus } =
  useCarrierUnigateReadiness(computed(() => props.readiness.carrierPartyId));

onMounted(() => {
  fetchShippingGatewayAuths();
  fetchShippingCarrierConfigs();
});

const readinessItems = computed(() => [
  {
    key: "tenant",
    label: "Unigate tenant",
    status: props.readiness?.tenant ?? tenantStatus.value,
  },
  {
    key: "credential",
    label: "Carrier credentials",
    status: props.readiness?.credential ?? credentialStatus.value,
  },
  {
    key: "store-link",
    label: "Product store link",
    status: props.readiness?.storeLink ?? storeLinkStatus.value,
  },
  {
    key: "automatic-address-validation",
    label: "Automatic address validation",
    status: props.readiness?.automaticAddressValidation ?? addressValidationStatus.value,
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

  return translate(labels[status] || status);
}

function chipColor(status: CarrierReadinessStatus) {
  if (status === "ready") return "success";
  if (status === "action-required") return "warning";
  if (status === "loading") return "medium";
  return "medium";
}

async function openConnectionModal() {
  const modal = await modalController.create({
    component: UnigateConnectionModal,
  });
  await modal.present();
}

async function openCreateAuthModal() {
  const modal = await modalController.create({
    component: CreateShippingGatewayAuthModal,
    componentProps: {
      defaultConfigId: props.readiness.carrierPartyId,
    },
  });
  await modal.present();
}

async function openCreateMappingModal() {
  const modal = await modalController.create({
    component: ShippingCarrierConfigModal,
    componentProps: {
      defaultCarrierPartyId: props.readiness.carrierPartyId,
    },
  });
  await modal.present();
}
</script>

<style scoped>
.readiness-action-section {
  border-top: 1px solid var(--ion-color-light-shade);
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacer-xs);
}

.section-title-row h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
</style>
