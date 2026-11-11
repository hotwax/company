<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("FedEx") }}</ion-title>
        <ion-progress-bar :value="completedCount / totalStepCount" role="progressbar" :aria-label="progressLabel" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main class="onboarding-layout">
        <aside class="desktop-steps" aria-label="FedEx setup progress">
          <ion-list lines="none">
            <ion-list-header>
              <ion-label>
                {{ translate("Progress") }}
                <p>{{ progressLabel }}</p>
              </ion-label>
            </ion-list-header>
          </ion-list>
          <fedex-step-list
            :current-step-id="currentStepId"
            :step-statuses="stepStatuses"
            @select-step="selectStep"
          />
        </aside>

        <section class="onboarding-task">
          <ion-item class="mobile-step-picker" lines="none">
            <ion-select :label="translate('Setup step')" label-placement="stacked" interface="popover" :value="currentStepId" @ion-change="selectStep(String($event.detail.value || ''))">
              <ion-select-option v-for="(item, index) in FEDEX_SETUP_STEPS" :key="item.id" :value="item.id">
                {{ index + 1 }}. {{ translate(item.label) }} — {{ translate(STATUS[stepStatuses[item.id]].label) }}
              </ion-select-option>
            </ion-select>
            <ion-note slot="end" class="mobile-progress-count" role="status">{{ completedCount }} / {{ totalStepCount }}</ion-note>
          </ion-item>

          <ion-card>
            <ion-card-header>
              <div class="step-heading-row">
                <div>
                  <ion-card-title>{{ translate(currentStep.label) }}</ion-card-title>
                  <ion-card-subtitle>{{ translate(currentStep.summary) }}</ion-card-subtitle>
                </div>
                <ion-badge :color="STATUS[stepStatuses[currentStepId]].color">
                  {{ translate(STATUS[stepStatuses[currentStepId]].label) }}
                </ion-badge>
              </div>
            </ion-card-header>

            <ion-card-content v-if="currentStepId === 'unigate'" class="form-stack">
              <ion-note v-if="isUnigateConfigured" color="success">{{ translate("Unigate is connected.") }}</ion-note>
              <ion-note v-else color="warning" data-testid="tenant-missing">{{ translate("Your Unigate connection is not configured yet. FedEx is sent through it.") }}</ion-note>
              <div class="step-actions">
                <ion-button :fill="isUnigateConfigured ? 'outline' : 'solid'" data-testid="configure-unigate" @click="openConnectionModal()">
                  {{ translate(isUnigateConfigured ? "Edit Unigate connection" : "Configure Unigate connection") }}
                </ion-button>
              </div>
            </ion-card-content>

            <ion-card-content v-else-if="currentStepId === 'credentials'" class="form-stack">
              <ion-note>{{ translate("Register with FedEx and create an API project. You will get an account number, an API key and a secret key.") }}</ion-note>
              <div class="step-actions">
                <ion-button fill="outline" data-testid="open-fedex-registration" @click="openRegistration()">
                  <ion-icon slot="start" :icon="openOutline" />
                  {{ translate("Open FedEx registration") }}
                </ion-button>
              </div>
              <ion-note v-if="stepStatuses.credentials === 'attention'" color="warning">
                {{ translate("A saved link points at credentials that no longer exist. Save the account again to fix it.") }}
              </ion-note>
              <form class="form-stack" @submit.prevent="saveSetup()">
                <ion-select v-model="form.productStoreId" fill="outline" label-placement="stacked" interface="popover" :label="translate('Product store')" data-testid="fedex-store" @ion-change="loadStore()">
                  <ion-select-option v-for="store in productStores" :key="store.productStoreId" :value="store.productStoreId">
                    {{ store.storeName || store.productStoreId }}
                  </ion-select-option>
                </ion-select>
                <ion-input v-model="form.accountNumber" fill="outline" label-placement="stacked" :label="translate('FedEx account number')" data-testid="fedex-account" />
                <ion-input v-model="form.apiKey" fill="outline" label-placement="stacked" :label="translate('API key')" :placeholder="existingAuthId ? translate('Leave blank to keep the saved key') : ''" autocomplete="off" data-testid="fedex-api-key" />
                <ion-input v-model="form.secretKey" fill="outline" label-placement="stacked" :label="translate('Secret key')" :placeholder="existingAuthId ? translate('Leave blank to keep the saved secret') : ''" autocomplete="off" data-testid="fedex-secret" />

                <ion-item lines="none">
                  <ion-toggle v-model="perFacility" label-placement="start" justify="space-between" data-testid="per-facility">
                    {{ translate("Use a different FedEx account for some facilities") }}
                  </ion-toggle>
                </ion-item>
                <template v-if="perFacility">
                  <ion-note>{{ translate("Shipments from these facilities use their own account number. Every other facility uses the account above.") }}</ion-note>
                  <div v-for="(row, index) in form.facilityAccounts" :key="index" class="facility-row" :data-testid="`facility-row-${index}`">
                    <ion-select v-model="row.facilityId" fill="outline" label-placement="stacked" interface="popover" :label="translate('Facility')">
                      <ion-select-option v-for="facility in facilityOptions(row.facilityId)" :key="facility.facilityId" :value="facility.facilityId">
                        {{ facility.facilityName || facility.facilityId }}
                      </ion-select-option>
                    </ion-select>
                    <ion-input v-model="row.accountNumber" fill="outline" label-placement="stacked" :label="translate('FedEx account number')" />
                    <ion-button fill="clear" color="danger" :aria-label="translate('Remove')" @click="form.facilityAccounts.splice(index, 1)">
                      <ion-icon slot="icon-only" :icon="trashOutline" />
                    </ion-button>
                  </div>
                  <div class="step-actions">
                    <ion-button fill="outline" size="small" data-testid="add-facility" @click="form.facilityAccounts.push({ facilityId: '', accountNumber: '' })">
                      <ion-icon slot="start" :icon="addOutline" />
                      {{ translate("Add facility") }}
                    </ion-button>
                  </div>
                </template>

                <div class="step-actions">
                  <ion-button type="submit" :disabled="!canSave || isSaving || !isUnigateConfigured" data-testid="fedex-save">
                    <ion-spinner v-if="isSaving" slot="start" name="crescent" />
                    {{ translate(existingAuthId ? "Update account" : "Save account") }}
                  </ion-button>
                </div>
                <ion-note v-if="!isUnigateConfigured" color="warning">{{ translate("Connect Unigate first.") }}</ion-note>
              </form>

              <ion-list v-if="fedexConfigs.length" lines="full">
                <ion-list-header><ion-label>{{ translate("Linked accounts") }}</ion-label></ion-list-header>
                <ion-item v-for="config in fedexConfigs" :key="config.carrierConfigId || `${config.productStoreId}-${config.facilityId}`">
                  <ion-label>
                    {{ storeName(config.productStoreId) }}<template v-if="config.facilityId"> · {{ facilityName(config.facilityId) }}</template>
                    <p>{{ translate("Account number") }}: {{ config.carrierAccountId || "-" }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-card-content>

            <ion-card-content v-else-if="currentStepId === 'label'" class="form-stack">
              <ion-note v-if="!mappedStoreIds.length">{{ translate("Link a product store to FedEx first, then come back to test it.") }}</ion-note>
              <template v-else>
                <ion-note>{{ translate("Packing an order asks FedEx for a real label, moves the order to packed and sets its carrier to FedEx. Pick a test order.") }}</ion-note>
                <ion-select v-model="labelStoreId" fill="outline" label-placement="stacked" interface="popover" :label="translate('Product store')" data-testid="fedex-label-store">
                  <ion-select-option v-for="storeId in mappedStoreIds" :key="storeId" :value="storeId">{{ storeName(storeId) }}</ion-select-option>
                </ion-select>
                <div class="step-actions">
                  <ion-button :disabled="!labelStoreId" data-testid="open-orders-modal" @click="openOrdersModal()">
                    <ion-icon slot="start" :icon="documentTextOutline" />
                    {{ translate("Generate sample label") }}
                  </ion-button>
                </div>
              </template>
            </ion-card-content>

            <ion-card-content v-else class="form-stack">
              <ion-list lines="full">
                <ion-item v-for="item in reviewSteps" :key="item.id" button :detail="false" @click="selectStep(item.id)">
                  <ion-label>{{ translate(item.label) }}<p>{{ translate(item.summary) }}</p></ion-label>
                  <ion-badge slot="end" :color="STATUS[stepStatuses[item.id]].color">{{ translate(STATUS[stepStatuses[item.id]].label) }}</ion-badge>
                </ion-item>
              </ion-list>
              <ion-note :color="isReady ? 'success' : 'warning'">
                {{ translate(isReady ? "FedEx is connected." : "Complete the steps above to finish. The sample label is recommended but optional.") }}
              </ion-note>
            </ion-card-content>

            <div class="wizard-footer">
              <ion-button fill="clear" :disabled="stepIndex === 0" @click="goTo(stepIndex - 1)">{{ translate("Back") }}</ion-button>
              <ion-button v-if="currentStepId !== 'readiness'" :disabled="!canContinue" data-testid="continue" @click="goTo(stepIndex + 1)">{{ translate("Continue") }}</ion-button>
              <ion-button v-else :disabled="!isReady" data-testid="finish" @click="router.push('/carriers')">{{ translate("Finish setup") }}</ion-button>
            </div>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent,
  IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonMenuButton, IonNote, IonPage,
  IonProgressBar, IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToggle, IonToolbar, modalController, onIonViewWillEnter,
} from "@ionic/vue";
import { addOutline, documentTextOutline, openOutline, trashOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import router from "@/router";
import {
  FEDEX_SETUP_REQUIRED_STEP_IDS, FEDEX_SETUP_STEPS,
  type FedexSetupStepId, type FedexSetupStepStatus,
} from "@/config/fedexSetup";
import { FEDEX_REGISTRATION_URL, fedexFormFromConfigs, useFedexSetup } from "@/composables/useFedexSetup";
import { useFacilities } from "@/composables/useFacilities";
import { useProductStores } from "@/composables/useProductStores";
import { useUnigate } from "@/composables/useUnigate";
import FedexStepList from "@/components/fedex/FedexStepList.vue";
import UnigateConnectionModal from "@/components/unigate/UnigateConnectionModal.vue";
import SampleLabelOrdersModal from "@/components/fedex/SampleLabelOrdersModal.vue";

const STATUS: Record<FedexSetupStepStatus, { label: string; color: string }> = {
  "not-started": { label: "Not started", color: "medium" },
  "in-progress": { label: "In progress", color: "primary" },
  complete: { label: "Complete", color: "success" },
  attention: { label: "Needs attention", color: "warning" },
};

const {
  isUnigateConfigured, existingAuthId, existingAuth, fedexConfigs, mappedStoreIds, stepStatuses,
  completedCount, totalStepCount, saveSetup: save, shippingCarrierConfigs,
} = useFedexSetup();
const { facilities } = useFacilities({ excludeVirtual: true });
const { refreshAll } = useUnigate();
const { productStores } = useProductStores();

const currentStepId = ref<FedexSetupStepId>("unigate");
const stepIndex = computed(() => FEDEX_SETUP_STEPS.findIndex((item) => item.id === currentStepId.value));
const currentStep = computed(() => FEDEX_SETUP_STEPS[stepIndex.value]);
const reviewSteps = FEDEX_SETUP_STEPS.filter((item) => item.id !== "readiness");
const progressLabel = computed(() =>
  translate("{complete} of {total} setup steps complete", { complete: completedCount.value, total: totalStepCount }));

const isReady = computed(() => FEDEX_SETUP_REQUIRED_STEP_IDS.every((id) => stepStatuses.value[id] === "complete"));
// The label is optional, so only the steps that gate a working connection block Continue.
const canContinue = computed(() =>
  currentStepId.value === "label" || stepStatuses.value[currentStepId.value] === "complete");

const form = reactive({
  productStoreId: "",
  accountNumber: "",
  apiKey: "",
  secretKey: "",
  facilityAccounts: [] as { facilityId: string; accountNumber: string }[],
});
const perFacility = ref(false);
const isSaving = ref(false);
const labelStoreId = ref("");
// Credentials are required only the first time; blank keeps the saved ones.
const canSave = computed(() =>
  Boolean(form.productStoreId && form.accountNumber.trim() && (existingAuthId.value || (form.apiKey.trim() && form.secretKey.trim()))));

const facilityName = (facilityId: string) =>
  facilities.value.find((facility: any) => facility.facilityId === facilityId)?.facilityName || facilityId;
/** A facility can only be picked once, so rows offer the ones not taken by another row. */
const facilityOptions = (own: string) => facilities.value.filter((facility: any) =>
  facility.facilityId === own || !form.facilityAccounts.some((row) => row.facilityId === facility.facilityId));

// Saved key and secret, so unchanged values aren't sent back.
const loadedCredentials = { apiKey: "", secretKey: "" };

/** Keeps typed values the server doesn't return. */
function loadCredentials(keepTyped = false) {
  loadedCredentials.apiKey = existingAuth.value?.username || "";
  loadedCredentials.secretKey = existingAuth.value?.publicKey || "";
  form.apiKey = loadedCredentials.apiKey || (keepTyped ? form.apiKey : "");
  form.secretKey = loadedCredentials.secretKey || (keepTyped ? form.secretKey : "");
}

/** Fills the account fields from what is saved for the selected store. */
function loadStore() {
  const saved = fedexFormFromConfigs(shippingCarrierConfigs.value, form.productStoreId);
  form.accountNumber = saved.accountNumber;
  form.facilityAccounts = saved.facilityAccounts;
  perFacility.value = saved.facilityAccounts.length > 0;
  loadCredentials();
}

const storeName = (storeId: string) =>
  productStores.value.find((store: any) => store.productStoreId === storeId)?.storeName || storeId;

const selectStep = (id: string) => {
  if(FEDEX_SETUP_STEPS.some((item) => item.id === id)) {currentStepId.value = id as FedexSetupStepId;}
};
const goTo = (index: number) => {
  const target = FEDEX_SETUP_STEPS[index];
  if(target) {currentStepId.value = target.id;}
};

// On first entry, resume at the first incomplete step.
let resumed = false;
onIonViewWillEnter(async () => {
  await refreshAll();
  if(!labelStoreId.value || !mappedStoreIds.value.includes(labelStoreId.value)) {
    labelStoreId.value = mappedStoreIds.value[0] || "";
  }
  if(resumed) {return;}
  resumed = true;
  form.productStoreId = mappedStoreIds.value[0] || (productStores.value.length === 1 ? productStores.value[0].productStoreId : "");
  loadStore();
  const next = FEDEX_SETUP_REQUIRED_STEP_IDS.find((id) => stepStatuses.value[id] !== "complete");
  currentStepId.value = next ?? "readiness";
});

const openRegistration = () => window.open(FEDEX_REGISTRATION_URL, "_blank", "noopener");

async function openConnectionModal() {
  const modal = await modalController.create({ component: UnigateConnectionModal });
  await modal.present();
  await modal.onDidDismiss();
  await refreshAll();
}

async function saveSetup() {
  if(!canSave.value || isSaving.value) {return;}
  if(!perFacility.value) {form.facilityAccounts = [];}
  isSaving.value = true;
  try {
    // Credentials are sent only when changed.
    const changed = form.apiKey.trim() !== loadedCredentials.apiKey || form.secretKey.trim() !== loadedCredentials.secretKey;
    await save({
      ...form,
      apiKey: changed || !existingAuthId.value ? form.apiKey : "",
      secretKey: changed || !existingAuthId.value ? form.secretKey : "",
      facilityAccounts: form.facilityAccounts.map((row) => ({ ...row })),
    });
    loadCredentials(true);
    labelStoreId.value = labelStoreId.value || form.productStoreId;
    commonUtil.showToast(translate("FedEx account saved"));
  } catch(error: any) {
    logger.error(error);
    commonUtil.showToast(error?.message || translate("Failed to save the FedEx account."));
  } finally {
    isSaving.value = false;
  }
}

async function openOrdersModal() {
  const modal = await modalController.create({
    component: SampleLabelOrdersModal,
    componentProps: { productStoreId: labelStoreId.value },
  });
  await modal.present();
}
</script>

<style scoped>
.onboarding-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 22rem) minmax(0, 44rem);
  align-items: start;
  justify-content: center;
  gap: var(--spacer-lg);
  padding: var(--spacer-lg);
}

.desktop-steps,
.onboarding-task {
  min-width: 0;
}

.onboarding-task ion-card {
  margin: 0;
}

.mobile-step-picker {
  display: none;
}

.mobile-progress-count {
  flex: 0 0 auto;
  margin-inline-start: var(--spacer-sm);
  font-variant-numeric: tabular-nums;
}

.step-heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacer-sm);
}

.step-heading-row ion-card-title {
  margin: 0;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-sm);
}

.facility-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: var(--spacer-xs);
}

.step-actions,
.wizard-footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacer-xs);
}

.wizard-footer {
  justify-content: space-between;
  border-top: var(--border-medium);
  padding: var(--spacer-sm);
}

@media (max-width: 900px) {
  .onboarding-layout {
    display: block;
    padding: var(--spacer-sm);
  }

  .desktop-steps {
    display: none;
  }

  .mobile-step-picker {
    display: block;
    margin-bottom: var(--spacer-sm);
  }

  .step-heading-row {
    align-items: center;
  }

  .facility-row {
    grid-template-columns: 1fr auto;
  }
}
</style>
