<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/carriers" />
        <ion-title>{{ translate("Carrier connection settings") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :aria-label="translate('Refresh carriers')"
            :disabled="refreshing"
            @click="handleRefresh()"
          >
            <ion-spinner v-if="refreshing" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item v-if="loadFailed" lines="none">
        <ion-label class="ion-text-wrap">
          {{ translate("Carrier settings could not be loaded. Check the OMS–UniGate connection before making changes.") }}
        </ion-label><ion-button slot="end" router-link="/unigate">
          {{ translate("Open UniGate setup") }}
        </ion-button>
      </ion-item>
      <ion-spinner v-if="refreshing" class="ion-margin" />
      <template v-if="ready">
        <ion-segment v-model="activeTab" :scrollable="true" class="ion-padding-horizontal" data-testid="carrier-segment-tabs">
          <ion-segment-button value="credentials" data-testid="tab-credentials">
            <ion-label>{{ translate("Carrier credentials") }} ({{ shippingGatewayAuths.length }})</ion-label>
          </ion-segment-button>
          <ion-segment-button value="mappings" data-testid="tab-mappings">
            <ion-label>{{ translate("Carrier mappings") }} ({{ shippingCarrierConfigs.length }})</ion-label>
          </ion-segment-button>
          <ion-segment-button value="billing" data-testid="tab-billing">
            <ion-label>{{ translate("Billing accounts") }} ({{ shippingCarrierBillingConfigs.length }})</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Tab 1: Carrier Credentials (ShippingGatewayAuths) -->
        <section v-if="activeTab === 'credentials'" class="ion-padding" data-testid="unigate-credentials-section">
          <div class="section-header">
            <div>
              <h2>{{ translate("Shipping Gateway Auths") }}</h2>
              <p class="text-muted">
                {{ translate("Manage carrier API credentials and authentication tokens stored in Unigate.") }}
              </p>
            </div>
            <ion-button data-testid="add-credential-btn" @click="openCreateAuthModal()">
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
                  {{ auth.description || auth.shippingGatewayAuthId }}
                  <ion-chip color="primary" outline>
                    <ion-label>{{ auth.shippingGatewayConfigId }}</ion-label>
                  </ion-chip>
                </div>
                <p>
                  <strong>{{ translate("Auth ID") }}:</strong> {{ auth.shippingGatewayAuthId }}
                  <span v-if="auth.baseUrl" class="ion-margin-start">
                    <strong>{{ translate("Base URL") }}:</strong> {{ auth.baseUrl }}
                  </span>
                </p>
              </ion-label>
              <ion-buttons slot="end">
                <ion-button fill="clear" :title="translate('Edit')" @click="openCreateAuthModal(auth)">
                  <ion-icon slot="icon-only" :icon="pencilOutline" />
                </ion-button>
                <ion-button color="danger" fill="clear" :title="translate('Delete')" @click="confirmDeleteAuth(auth)">
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
              <p class="text-muted">
                {{ translate("Link OMS carrier parties, product stores, and facilities to Unigate gateway credentials.") }}
              </p>
            </div>
            <ion-button data-testid="add-mapping-btn" @click="openCreateCarrierConfigModal()">
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
                  {{ cfg.carrierPartyId }} &rarr; {{ cfg.productStoreId }}
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
                <ion-button fill="clear" :title="translate('Edit')" @click="openCreateCarrierConfigModal(cfg)">
                  <ion-icon slot="icon-only" :icon="pencilOutline" />
                </ion-button>
                <ion-button color="danger" fill="clear" :title="translate('Delete')" @click="confirmDeleteCarrierConfig(cfg)">
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
              <p class="text-muted">
                {{ translate("Map carrier billing accounts by product store and sales channel.") }}
              </p>
            </div>
            <ion-button data-testid="add-billing-btn" @click="openCreateBillingConfigModal()">
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
                  {{ b.carrierPartyId }} &rarr; {{ b.productStoreId }}
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
                <ion-button color="danger" fill="clear" :title="translate('Delete')" @click="confirmDeleteBillingConfig(b)">
                  <ion-icon slot="icon-only" :icon="trashOutline" />
                </ion-button>
              </ion-buttons>
            </ion-item>
          </ion-list>
        </section>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  modalController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { addOutline, pencilOutline, refreshOutline, trashOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import CreateShippingGatewayAuthModal from "@/components/unigate/CreateShippingGatewayAuthModal.vue";
import ShippingCarrierBillingConfigModal from "@/components/unigate/ShippingCarrierBillingConfigModal.vue";
import ShippingCarrierConfigModal from "@/components/unigate/ShippingCarrierConfigModal.vue";

import {
  type ShippingCarrierBillingConfig,
  type ShippingCarrierConfig,
  type ShippingGatewayAuth,
  deleteShippingCarrierBillingConfig,
  deleteShippingCarrierConfig,
  deleteShippingGatewayAuth,
  useUnigate,
} from "@/composables/useUnigate";

import { useUnigateConnection } from "@/composables/useUnigateConnection";



const activeTab = ref<"credentials" | "mappings" | "billing">("credentials");
const { shippingGatewayAuths, shippingCarrierConfigs, shippingCarrierBillingConfigs, status, refreshAll } = useUnigate();
const connection = useUnigateConnection();
const refreshing = ref(false);
const loadFailed = ref(false);
const loaded = ref(false);
const ready = computed(() => loaded.value && !loadFailed.value);
onIonViewWillEnter(handleRefresh);
async function handleRefresh() {
  if(refreshing.value) {return;}
  refreshing.value = true; loaded.value = false; loadFailed.value = false;
  try {
    await connection.test();
    if(connection.result.value?.status !== "connected" || connection.result.value?.carrierApiUnavailable) {throw new Error("Carrier services unavailable");}
    await refreshAll();
    if([status.value.auths, status.value.carrierConfigs, status.value.billingConfigs].some(value => value !== "success")) {throw new Error("Carrier settings unavailable");}
    loaded.value = true;
  } catch {loadFailed.value = true;} finally {refreshing.value = false;}
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
  if(!cfg.carrierConfigId) {return;}
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
  if(!b.carrierBillingConfigId) {return;}
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
ion-note {
  align-self: center;
  padding: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacer-sm);
  margin-bottom: var(--spacer-base);
}

.empty-state {
  text-align: center;
  padding: var(--spacer-2xl) var(--spacer-base);
}

.item-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacer-sm);
}

</style>
