<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Unigate Integration") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="outline" @click="openConnectionModal" data-testid="unigate-config-header-btn">
            <ion-icon slot="start" :icon="settingsOutline" />
            {{ translate("Connection settings") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Identity & Status Banner -->
      <section class="ion-padding identity-banner">
        <div class="identity-content">
          <div class="identity-titles">
            <h1>{{ translate("Unigate Gateway") }}</h1>
            <p v-if="tenantId">
              {{ translate("Tenant") }}: <strong>{{ tenantId }}</strong>
              <span v-if="sendUrl" class="ion-margin-start url-text">({{ sendUrl }})</span>
            </p>
            <p v-else class="text-muted">
              {{ translate("Unigate connection is not configured yet.") }}
            </p>
          </div>
          <div class="identity-chips">
            <ion-chip :color="isConfigured ? 'success' : 'warning'" outline>
              <ion-icon :icon="isConfigured ? checkmarkCircleOutline : alertCircleOutline" />
              <ion-label>{{ isConfigured ? translate("Configured") : translate("Action required") }}</ion-label>
            </ion-chip>
          </div>
        </div>
      </section>

      <!-- Segment Tabs -->
      <ion-segment v-model="activeTab" class="ion-padding-horizontal" data-testid="unigate-segment-tabs">
        <ion-segment-button value="credentials" data-testid="tab-credentials">
          <ion-label>{{ translate("Carrier credentials") }} ({{ shippingGatewayAuths.length }})</ion-label>
        </ion-segment-button>
        <ion-segment-button value="mappings" data-testid="tab-mappings">
          <ion-label>{{ translate("Carrier mappings") }} ({{ shippingCarrierConfigs.length }})</ion-label>
        </ion-segment-button>
        <ion-segment-button value="billing" data-testid="tab-billing">
          <ion-label>{{ translate("Billing accounts") }} ({{ shippingCarrierBillingConfigs.length }})</ion-label>
        </ion-segment-button>
        <ion-segment-button value="connection" data-testid="tab-connection">
          <ion-label>{{ translate("Tenant & Status") }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      <!-- Tab 1: Carrier Credentials (ShippingGatewayAuths) -->
      <section v-if="activeTab === 'credentials'" class="ion-padding" data-testid="unigate-credentials-section">
        <div class="section-header">
          <div>
            <h2>{{ translate("Shipping Gateway Auths") }}</h2>
            <p class="text-muted">{{ translate("Manage carrier API credentials and authentication tokens stored in Unigate.") }}</p>
          </div>
          <ion-button @click="openCreateAuthModal()" data-testid="add-credential-btn">
            <ion-icon slot="start" :icon="addOutline" />
            {{ translate("Add credentials") }}
          </ion-button>
        </div>

        <div v-if="shippingGatewayAuths.length === 0" class="empty-state">
          <p>{{ translate("No carrier credentials configured in Unigate yet.") }}</p>
          <ion-button fill="outline" @click="openCreateAuthModal()">
            {{ translate("Add your first carrier credential") }}
          </ion-button>
        </div>

        <ion-list v-else lines="full" class="ion-margin-top">
          <ion-item v-for="auth in shippingGatewayAuths" :key="auth.shippingGatewayAuthId">
            <ion-label class="ion-text-wrap">
              <div class="item-title-row">
                <h3>{{ auth.description || auth.shippingGatewayAuthId }}</h3>
                <ion-chip color="primary" outline>
                  <ion-label>{{ auth.shippingGatewayConfigId }}</ion-label>
                </ion-chip>
              </div>
              <p>
                <strong>{{ translate("Auth ID") }}:</strong> {{ auth.shippingGatewayAuthId }}
                <span v-if="auth.username" class="ion-margin-start">
                  <strong>{{ translate("Username/Key") }}:</strong> {{ auth.username }}
                </span>
                <span v-if="auth.baseUrl" class="ion-margin-start">
                  <strong>{{ translate("Base URL") }}:</strong> {{ auth.baseUrl }}
                </span>
              </p>
            </ion-label>
            <ion-buttons slot="end">
              <ion-button fill="clear" @click="openCreateAuthModal(auth)" :title="translate('Edit')">
                <ion-icon slot="icon-only" :icon="pencilOutline" />
              </ion-button>
              <ion-button color="danger" fill="clear" @click="confirmDeleteAuth(auth)" :title="translate('Delete')">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-buttons>
          </ion-item>
        </ion-list>
      </section>

      <!-- Tab 2: Carrier Mappings (ShippingCarrierConfigs) -->
      <section v-if="activeTab === 'mappings'" class="ion-padding" data-testid="unigate-mappings-section">
        <div class="section-header">
          <div>
            <h2>{{ translate("OMS Carrier Mappings") }}</h2>
            <p class="text-muted">{{ translate("Link OMS carrier parties, product stores, and facilities to Unigate gateway credentials.") }}</p>
          </div>
          <ion-button @click="openCreateCarrierConfigModal()" data-testid="add-mapping-btn">
            <ion-icon slot="start" :icon="addOutline" />
            {{ translate("Add carrier mapping") }}
          </ion-button>
        </div>

        <div v-if="shippingCarrierConfigs.length === 0" class="empty-state">
          <p>{{ translate("No carrier mappings configured yet.") }}</p>
          <ion-button fill="outline" @click="openCreateCarrierConfigModal()">
            {{ translate("Add your first carrier mapping") }}
          </ion-button>
        </div>

        <ion-list v-else lines="full" class="ion-margin-top">
          <ion-item v-for="cfg in shippingCarrierConfigs" :key="cfg.carrierConfigId">
            <ion-label class="ion-text-wrap">
              <div class="item-title-row">
                <h3>{{ cfg.carrierPartyId }} &rarr; {{ cfg.productStoreId }}</h3>
                <ion-chip color="secondary" outline>
                  <ion-label>{{ cfg.gatewayAuthId }}</ion-label>
                </ion-chip>
                <ion-chip v-if="cfg.facilityId" color="medium" outline>
                  <ion-label>{{ translate("Facility") }}: {{ cfg.facilityId }}</ion-label>
                </ion-chip>
              </div>
              <p>
                <span v-if="cfg.carrierAccountId">
                  <strong>{{ translate("Account #") }}:</strong> {{ cfg.carrierAccountId }} |
                </span>
                <span v-if="cfg.packagingType">
                  <strong>{{ translate("Packaging") }}:</strong> {{ cfg.packagingType }} |
                </span>
                <span v-if="cfg.labelSize">
                  <strong>{{ translate("Label") }}:</strong> {{ cfg.labelSize }} ({{ cfg.labelImageType || 'PDF' }})
                </span>
              </p>
            </ion-label>
            <ion-buttons slot="end">
              <ion-button fill="clear" @click="openCreateCarrierConfigModal(cfg)" :title="translate('Edit')">
                <ion-icon slot="icon-only" :icon="pencilOutline" />
              </ion-button>
              <ion-button color="danger" fill="clear" @click="confirmDeleteCarrierConfig(cfg)" :title="translate('Delete')">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-buttons>
          </ion-item>
        </ion-list>
      </section>

      <!-- Tab 3: Billing Accounts (ShippingCarrierBillingConfigs) -->
      <section v-if="activeTab === 'billing'" class="ion-padding" data-testid="unigate-billing-section">
        <div class="section-header">
          <div>
            <h2>{{ translate("Carrier Billing Configurations") }}</h2>
            <p class="text-muted">{{ translate("Map carrier billing accounts by product store and sales channel.") }}</p>
          </div>
          <ion-button @click="openCreateBillingConfigModal()" data-testid="add-billing-btn">
            <ion-icon slot="start" :icon="addOutline" />
            {{ translate("Add billing config") }}
          </ion-button>
        </div>

        <div v-if="shippingCarrierBillingConfigs.length === 0" class="empty-state">
          <p>{{ translate("No carrier billing configurations set up yet.") }}</p>
          <ion-button fill="outline" @click="openCreateBillingConfigModal()">
            {{ translate("Add your first billing configuration") }}
          </ion-button>
        </div>

        <ion-list v-else lines="full" class="ion-margin-top">
          <ion-item v-for="b in shippingCarrierBillingConfigs" :key="b.carrierBillingConfigId">
            <ion-label class="ion-text-wrap">
              <div class="item-title-row">
                <h3>{{ b.carrierPartyId }} &rarr; {{ b.productStoreId }}</h3>
                <ion-chip v-if="b.salesChannelEnumId" color="tertiary" outline>
                  <ion-label>{{ b.salesChannelEnumId }}</ion-label>
                </ion-chip>
              </div>
              <p>
                <strong>{{ translate("Billing Account #") }}:</strong> {{ b.billingAccountNumber }}
                <span v-if="b.facilityId" class="ion-margin-start">
                  <strong>{{ translate("Facility") }}:</strong> {{ b.facilityId }}
                </span>
              </p>
            </ion-label>
            <ion-buttons slot="end">
              <ion-button color="danger" fill="clear" @click="confirmDeleteBillingConfig(b)" :title="translate('Delete')">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-buttons>
          </ion-item>
        </ion-list>
      </section>

      <!-- Tab 4: Tenant Connection & Status -->
      <section v-if="activeTab === 'connection'" class="ion-padding" data-testid="unigate-status-section">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Unigate Connection Information") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  <h3>{{ translate("Tenant ID") }}</h3>
                  <p>{{ tenantId || translate("Not configured") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ translate("Unigate Base URL") }}</h3>
                  <p>{{ sendUrl || translate("Not configured") }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ translate("API Key / Token") }}</h3>
                  <p>{{ hasKey ? translate("Configured (Secret stored)") : translate("Not configured") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>

            <div class="ion-padding-top ion-text-right">
              <ion-button fill="outline" @click="refreshAll()">
                <ion-icon slot="start" :icon="refreshOutline" />
                {{ translate("Refresh all data") }}
              </ion-button>
              <ion-button class="ion-margin-start" @click="openConnectionModal()">
                {{ translate("Edit connection") }}
              </ion-button>
            </div>
          </ion-card-content>
        </ion-card>
      </section>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  alertController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import {
  addOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  pencilOutline,
  refreshOutline,
  settingsOutline,
  trashOutline,
} from "ionicons/icons";
import { commonUtil, translate } from "@common";
import {
  deleteShippingCarrierBillingConfig,
  deleteShippingCarrierConfig,
  deleteShippingGatewayAuth,
  type ShippingCarrierBillingConfig,
  type ShippingCarrierConfig,
  type ShippingGatewayAuth,
  useUnigate,
} from "@/composables/useUnigate";
import UnigateConnectionModal from "@/components/unigate/UnigateConnectionModal.vue";
import CreateShippingGatewayAuthModal from "@/components/unigate/CreateShippingGatewayAuthModal.vue";
import ShippingCarrierConfigModal from "@/components/unigate/ShippingCarrierConfigModal.vue";
import ShippingCarrierBillingConfigModal from "@/components/unigate/ShippingCarrierBillingConfigModal.vue";

const activeTab = ref<"credentials" | "mappings" | "billing" | "connection">("credentials");

const {
  unigateConfig,
  shippingGatewayAuths,
  shippingCarrierConfigs,
  shippingCarrierBillingConfigs,
  isConfigured,
  tenantId,
  sendUrl,
  hasKey,
  refreshAll,
} = useUnigate();

onMounted(async () => {
  await refreshAll();
});

async function openConnectionModal() {
  const modal = await modalController.create({
    component: UnigateConnectionModal,
  });
  await modal.present();
}

async function openCreateAuthModal(auth?: ShippingGatewayAuth) {
  const modal = await modalController.create({
    component: CreateShippingGatewayAuthModal,
    componentProps: { auth },
  });
  await modal.present();
}

async function openCreateCarrierConfigModal(config?: ShippingCarrierConfig) {
  const modal = await modalController.create({
    component: ShippingCarrierConfigModal,
    componentProps: { config },
  });
  await modal.present();
}

async function openCreateBillingConfigModal(config?: ShippingCarrierBillingConfig) {
  const modal = await modalController.create({
    component: ShippingCarrierBillingConfigModal,
    componentProps: { config },
  });
  await modal.present();
}

async function confirmDeleteAuth(auth: ShippingGatewayAuth) {
  const alert = await alertController.create({
    header: translate("Delete carrier credentials?"),
    message: translate("Are you sure you want to delete {id} from Unigate?", { id: auth.shippingGatewayAuthId }),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Delete"),
        role: "destructive",
        handler: async () => {
          try {
            await deleteShippingGatewayAuth(auth.shippingGatewayAuthId);
            commonUtil.showToast(translate("Carrier credentials deleted successfully."));
          } catch (err: any) {
            commonUtil.showToast(translate(err?.message || "Failed to delete carrier credentials."));
          }
        },
      },
    ],
  });
  await alert.present();
}

async function confirmDeleteCarrierConfig(cfg: ShippingCarrierConfig) {
  if (!cfg.carrierConfigId) return;
  const alert = await alertController.create({
    header: translate("Delete carrier mapping?"),
    message: translate("Are you sure you want to delete this carrier mapping?"),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Delete"),
        role: "destructive",
        handler: async () => {
          try {
            await deleteShippingCarrierConfig(cfg.carrierConfigId!);
            commonUtil.showToast(translate("Carrier mapping deleted successfully."));
          } catch (err: any) {
            commonUtil.showToast(translate(err?.message || "Failed to delete carrier mapping."));
          }
        },
      },
    ],
  });
  await alert.present();
}

async function confirmDeleteBillingConfig(b: ShippingCarrierBillingConfig) {
  if (!b.carrierBillingConfigId) return;
  const alert = await alertController.create({
    header: translate("Delete billing configuration?"),
    message: translate("Are you sure you want to delete this billing configuration?"),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Delete"),
        role: "destructive",
        handler: async () => {
          try {
            await deleteShippingCarrierBillingConfig(b.carrierBillingConfigId!);
            commonUtil.showToast(translate("Billing configuration deleted successfully."));
          } catch (err: any) {
            commonUtil.showToast(translate(err?.message || "Failed to delete billing configuration."));
          }
        },
      },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
.identity-banner {
  background-color: var(--ion-color-light);
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.identity-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacer-base);
}

.identity-titles h1 {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px 0;
}

.identity-titles p {
  margin: 0;
  color: var(--ion-color-medium);
}

.url-text {
  font-size: 13px;
  font-family: monospace;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacer-sm);
  margin-bottom: var(--spacer-base);
}

.section-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.empty-state {
  text-align: center;
  padding: var(--spacer-2xl) var(--spacer-base);
  color: var(--ion-color-medium);
}

.item-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacer-sm);
}

.item-title-row h3 {
  font-weight: 600;
  margin: 0;
}
</style>
