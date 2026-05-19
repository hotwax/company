<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="'/shopify-connection-details/' + id" />
        </ion-buttons>
        <ion-title>{{ translate("New product sync upgrade") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <ion-card v-if="loadErrorMessage">
          <ion-card-header>
            <ion-card-title>{{ translate("Upgrade assistant could not load") }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ loadErrorMessage }}</p>
            <ion-button fill="outline" @click="loadAssistant">{{ translate("Retry") }}</ion-button>
          </ion-card-content>
        </ion-card>

        <template v-if="!loadErrorMessage">
          <!-- Summary/Eligibility Card (Always visible for context) -->
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ assistantTitle }}</ion-card-title>
              <ion-card-subtitle>{{ assistantSubtitle }}</ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Backend release") }}
                  <p>{{ backendReleaseDetail }}</p>
                </ion-label>
                <ion-spinner v-if="assistantState.isEligible === null" slot="end" name="crescent" />
                <ion-badge v-else slot="end" :color="eligibilityBadgeColor">{{ eligibilityBadgeLabel }}</ion-badge>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  {{ translate("Per-shop sync job") }}
                  <p>{{ perShopSyncJobDetail }}</p>
                </ion-label>
                <ion-spinner v-if="assistantState.syncJobConfigured === null" slot="end" name="crescent" />
                <ion-badge v-else slot="end" :color="syncJobBadgeColor">{{ syncJobBadgeLabel }}</ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>

          <!-- Step 1: Readiness -->
          <ion-card v-if="currentStep === 1">
            <ion-card-header>
              <div class="card-header-wrapper">
                <div>
                  <ion-card-title>{{ translate("1. Confirm readiness") }}</ion-card-title>
                  <ion-card-subtitle>{{ translate("Verify the compatible backend release and the shared new-sync jobs before teardown starts.") }}</ion-card-subtitle>

                </div>
                <ion-button v-if="hasMissingArtifacts" fill="clear" color="danger"
                  @click="copyMissingArtifactsToClipboard">
                  {{ translate("Copy details") }}
                </ion-button>
              </div>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item v-for="artifactCheck in assistantState.artifactChecks" :key="artifactCheck.id"
                :button="artifactCheck.status === 'missing'"
                @click="artifactCheck.status === 'missing' ? copyArtifactCheckToClipboard(artifactCheck) : null">
                <ion-label>
                  {{ artifactCheck.label }}
                  <p>{{ artifactCheck.id }}</p>
                  <p>{{ artifactCheck.note }}</p>
                </ion-label>
                <ion-spinner v-if="artifactCheck.status === 'checking'" slot="end" name="crescent" />
                <ion-badge v-else slot="end" :color="getArtifactCheckColor(artifactCheck)">{{ getArtifactCheckLabel(artifactCheck) }}</ion-badge>

              </ion-item>
            </ion-list>
            <ion-card-content>
              <ion-button v-if="entryAction === 'current'" expand="block" @click="openProductSync">{{ translate("Open current product sync") }}</ion-button>

              <ion-button v-else expand="block" :disabled="!isStep1Done" @click="currentStep = 2">
                {{ translate("Next") }}
                <ion-icon slot="end" :icon="arrowForwardOutline" />
              </ion-button>
              <ion-button expand="block" fill="clear" @click="loadAssistant">{{ translate("Refresh checks") }}</ion-button>

            </ion-card-content>
          </ion-card>

          <!-- Step 2: Teardown -->
          <ion-card v-if="currentStep === 2">
            <ion-card-header>
              <ion-card-title>{{ translate("2. Deactivate the legacy sync") }}</ion-card-title>
              <ion-card-subtitle>{{ translate("Turn off the old product sync for this shop so future product updates run through the new sync only.") }}</ion-card-subtitle>

            </ion-card-header>
            <ion-list lines="full">
              <template v-if="assistantState.legacySystemMessageTypes.length">
                <ion-item-divider color="light">
                    {{ translate("Legacy system message types") }}
                  <ion-button v-if="assistantState.legacySystemMessageTypes.some(type => isActionableLegacyItem(type, 'type'))" slot="end"
                    fill="clear" :disabled="isTeardownSectionRunning['type'] || isTeardownRunning"
                    @click="teardownSection('type')">
                    <ion-spinner v-if="isTeardownSectionRunning['type']" name="crescent" slot="start" />
                    {{ translate("Deactivate all") }}
                  </ion-button>
                </ion-item-divider>
                <ion-card-content>
                  <p>
                    {{ translate("Deactivating a type clears the old sync bindings and marks the name as deprecated.") }}
                    {{ legacySystemMessageTypesSummary }}
                  </p>
                </ion-card-content>
                <ion-item v-for="type in assistantState.legacySystemMessageTypes" :key="type.id" class="hover-action">
                  <ion-label>
                    {{ type.label }}
                    <p>{{ type.id }}</p>
                    <p>{{ type.note }}</p>
                  </ion-label>
                  <div class="teardown-action" slot="end">
                    <ion-badge :color="getLegacyItemColor(type.status)" :class="{ 'hide-on-hover': isActionableLegacyItem(type, 'type') }">
                      {{ getLegacyItemLabel(type.status) }}
                    </ion-badge>

                    <ion-button v-if="isActionableLegacyItem(type, 'type')" fill="outline" class="hover-button"
                      :disabled="isTeardownItemRunning[type.id] || isTeardownSectionRunning['type'] || isTeardownRunning"
                      @click="teardownItem(type, 'type')">
                      <ion-spinner v-if="isTeardownItemRunning[type.id]" name="crescent" slot="start" />
                      {{ getLegacyActionLabel(type, 'type') }}
                    </ion-button>
                  </div>

                </ion-item>
              </template>

              <template v-if="assistantState.legacyServiceJobs.length">

                <ion-item-divider color="light">
                    {{ translate("Legacy service jobs") }}
                  <ion-button v-if="assistantState.legacyServiceJobs.some(job => isActionableLegacyItem(job, 'job'))" slot="end"
                    fill="clear" :disabled="isTeardownSectionRunning['job'] || isTeardownRunning"
                    @click="teardownSection('job')">
                    <ion-spinner v-if="isTeardownSectionRunning['job']" name="crescent" slot="start" />
                    {{ translate("Finish all") }}
                  </ion-button>
                </ion-item-divider>
                <ion-card-content>
                  <p>
                    {{ translate("Deactivating a job pauses it and clears the old service target so it can no longer run work.") }}
                    {{ legacyServiceJobsSummary }}
                  </p>
                </ion-card-content>
                <ion-item v-for="job in assistantState.legacyServiceJobs" :key="job.id" class="hover-action">
                  <ion-label>
                    {{ job.label }}
                    <p>{{ job.id }}</p>
                    <p>{{ job.note }}</p>
                  </ion-label>
                  <div slot="end">
                    <ion-badge :color="getLegacyItemColor(job.status)" :class="{ 'hide-on-hover': isActionableLegacyItem(job, 'job') }">
                      {{ getLegacyItemLabel(job.status) }}
                    </ion-badge>
                    <ion-button v-if="isActionableLegacyItem(job, 'job')" fill="outline" class="hover-button" :disabled="isTeardownItemRunning[job.id] || isTeardownSectionRunning['job'] || isTeardownRunning" @click="teardownItem(job, 'job')">
                      <ion-spinner v-if="isTeardownItemRunning[job.id]" name="crescent" slot="start" />
                      {{ getLegacyActionLabel(job, 'job') }}
                    </ion-button>
                  </div>

                </ion-item>
              </template>

              <template v-if="assistantState.legacySystemMessages.length">
                <ion-item-divider color="light">
                    {{ translate("Legacy system messages") }}
                  <ion-button v-if="assistantState.legacySystemMessages.some(message => isActionableLegacyItem(message, 'message'))" slot="end"
                    fill="clear" :disabled="isTeardownSectionRunning['message'] || isTeardownRunning"
                    @click="teardownSection('message')">
                    <ion-spinner v-if="isTeardownSectionRunning['message']" name="crescent" slot="start" />
                    {{ translate("Cancel all") }}
                  </ion-button>
                </ion-item-divider>
                <ion-card-content>
                  <p>
                    {{ translate("Only unfinished legacy messages appear here. Cancel them so the old sync cannot keep processing.") }}
                    {{ legacySystemMessagesSummary }}
                  </p>
                </ion-card-content>
                <ion-item v-for="message in assistantState.legacySystemMessages" :key="message.id" class="hover-action">
                  <ion-label>
                    {{ message.label }}
                    <p>{{ message.id }}</p>
                    <p>{{ message.note }}</p>
                  </ion-label>
                  <div slot="end">
                    <ion-badge :color="getLegacyItemColor(message.status)" :class="{ 'hide-on-hover': isActionableLegacyItem(message, 'message') }">
                      {{ getLegacyItemLabel(message.status) }}
                    </ion-badge>
                    <ion-button v-if="isActionableLegacyItem(message, 'message')" fill="outline" class="hover-button" :disabled="isTeardownItemRunning[message.id] || isTeardownSectionRunning['message'] || isTeardownRunning" @click="teardownItem(message, 'message')">
                      <ion-spinner v-if="isTeardownItemRunning[message.id]" name="crescent" slot="start" />
                      {{ getLegacyActionLabel(message, 'message') }}
                    </ion-button>
                  </div>

                </ion-item>
              </template>
              <ion-item v-else lines="none">
                <ion-label>
                  {{ translate("No unfinished legacy system messages need action for this shop.") }}
                  <p>{{ translate("Finished and cancelled legacy messages are hidden here so you only review work that still needs attention.") }}</p>
                </ion-label>
                <ion-badge slot="end" color="success">{{ translate("Ready") }}</ion-badge>
              </ion-item>

              <ion-item v-if="!canRunTeardown && !isTeardownRunning" lines="none">
                <ion-label color="success">
                  <ion-icon :icon="checkmarkCircleOutline" slot="start" />
                  {{ translate("All legacy artifacts have been deactivated or are already terminal.") }}
                </ion-label>
              </ion-item>
            </ion-list>

            <ion-card-content>
              <p>{{ teardownStepDetail }}</p>
              <p v-if="teardownErrorMessage" class="ion-color-danger">{{ teardownErrorMessage }}</p>
              <p v-else-if="teardownSuccessMessage">{{ teardownSuccessMessage }}</p>
              <ion-button expand="block" v-if="canRunTeardown" :disabled="isTeardownRunning"
                @click="confirmLegacyTeardown">
                <ion-spinner v-if="isTeardownRunning" name="crescent" slot="start" />
                {{ teardownActionLabel }}
              </ion-button>
              <ion-button v-if="isStep2Done" expand="block" @click="currentStep = 3">
                {{ translate("Next") }}
                <ion-icon slot="end" :icon="arrowForwardOutline" />
              </ion-button>
              <ion-button expand="block" fill="clear" :disabled="isTeardownRunning" @click="currentStep = 1">{{ translate("Back") }}</ion-button>

            </ion-card-content>

            <!-- Live teardown activity log -->
            <ion-list v-if="teardownLog.length" lines="full">
              <ion-list-header>{{ translate("Teardown activity") }}</ion-list-header>
              <ion-item v-for="step in teardownLog" :key="`log-${step.kind}-${step.id}`">
                <ion-label>
                  {{ step.label }}
                  <p v-if="step.error">{{ step.error }}</p>
                </ion-label>
                <ion-spinner v-if="step.status === 'processing'" slot="end" name="crescent" />
                <ion-badge v-else slot="end" :color="getTeardownStepColor(step.status)">
                  {{ getTeardownStepLabel(step.status) }}
                </ion-badge>
              </ion-item>
            </ion-list>

            <!-- Failure summary after teardown -->
            <ion-list v-if="teardownFailedSteps.length && !isTeardownRunning" lines="full">
              <ion-list-header>{{ translate("Steps that could not complete") }}</ion-list-header>
              <ion-item v-for="step in teardownFailedSteps" :key="`fail-${step.kind}-${step.id}`">
                <ion-label color="danger">
                  {{ step.label }}
                  <p>{{ step.error }}</p>
                </ion-label>
                <ion-badge slot="end" color="danger">{{ translate("Failed") }}</ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>

          <!-- Step 3: Setup -->
          <ion-card v-if="currentStep === 3">
            <ion-card-header>
              <ion-card-title>{{ translate("3. Setup the new sync") }}</ion-card-title>
              <ion-card-subtitle>{{ translate("Once readiness checks pass and the old sync is deactivated, continue to the current product-sync setup flow.") }}</ion-card-subtitle>

              <ion-progress-bar :value="setupProgressValue" style="margin-top: 16px;"></ion-progress-bar>
              <p style="margin-top: 8px; font-size: 14px; color: var(--ion-color-medium);">
                {{ translate("{completed} of {total} setup steps complete", { completed: setupProgressCompleted, total: setupProgressTotal }) }}

              </p>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Per-shop sync job pattern") }}
                  <p>{{ perShopPatternLabel }}</p>
                  <p>{{ translate("The app will configure or verify the shop-specific job from the shared sync template.") }}</p>

                </ion-label>
                <ion-spinner v-if="assistantState.syncJobConfigured === null" slot="end" name="crescent" />
                <ion-badge v-else slot="end" :color="syncJobBadgeColor">{{ syncJobBadgeLabel }}</ion-badge>
                <ion-button v-if="!assistantState.syncJobConfigured" slot="end" fill="outline"
                  :disabled="isConfiguringSyncJob" @click="configureSyncJobForShop">
                  <ion-spinner v-if="isConfiguringSyncJob" name="crescent" slot="start" />
                  {{ translate("Configure") }}
                </ion-button>
              </ion-item>

              <ion-item v-for="job in sharedInfrastructureJobs" :key="job.id">
                <ion-label>
                  {{ job.label }}
                  <p>{{ job.id }}</p>
                  <p>{{ job.note }}</p>
                </ion-label>
                <ion-spinner v-if="job.status === 'checking'" slot="end" name="crescent" />
                <ion-badge v-else slot="end" :color="getJobStatusColor(job)">{{ getJobStatusLabel(job) }}</ion-badge>
                <ion-button v-if="job.status === 'verified' && job.isPaused" slot="end" fill="outline"
                  :disabled="isEnablingJob[job.id]" @click="enableJob(job)">
                  <ion-spinner v-if="isEnablingJob[job.id]" name="crescent" slot="start" />
                  {{ translate("Enable") }}
                </ion-button>
              </ion-item>

              <ion-item lines="none">
                <ion-label>
                  {{ translate("Next step") }}
                  <p>{{ nextStepDetail }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
            <ion-card-content>
              <ion-button v-if="entryAction !== 'request-upgrade'" expand="block" :disabled="!isStep3Done" @click="openProductSync">{{ entryAction === "current" ? translate("Open current product sync") : translate("Go to new product sync setup") }}</ion-button>

              <ion-button expand="block" fill="clear" @click="currentStep = 2">{{ translate("Back") }}</ion-button>
            </ion-card-content>
          </ion-card>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter
} from "@ionic/vue";
import { arrowForwardOutline, checkmarkCircleOutline } from "ionicons/icons";
import { computed, defineProps, ref } from "vue";
import { useRouter } from "vue-router";
import { useStore } from "vuex";
import { translate } from "@/i18n";
import { PRODUCT_SYNC_MIGRATION_CONFIG } from "@/config/productSyncMigration";
import {
  type ProductSyncMigrationAssistantState,
  type ProductSyncMigrationEntryAction,
  type ProductSyncMigrationLegacyItem,
  type ProductSyncMigrationTeardownStep,
  isActionableLegacyItem,
  ShopifyProductSyncMigrationService
} from "@/services/ShopifyProductSyncMigrationService";
import { ShopifyProductSyncService } from "@/services/ShopifyProductSyncService";
import { showToast } from "@/utils";
import logger from "@/logger";

const props = defineProps(["id"]);
const router = useRouter();
const store = useStore();
const migrationConfig = PRODUCT_SYNC_MIGRATION_CONFIG;
const isLoading = ref(true);
const loadErrorMessage = ref("");
const isTeardownRunning = ref(false);
const currentStep = ref(1);
const teardownErrorMessage = ref("");
const teardownSuccessMessage = ref("");
const teardownLog = ref<ProductSyncMigrationTeardownStep[]>([]);
const teardownFailedSteps = ref<ProductSyncMigrationTeardownStep[]>([]);
const isConfiguringSyncJob = ref(false);
const isEnablingJob = ref<Record<string, boolean>>({});
const isTeardownItemRunning = ref<Record<string, boolean>>({});
const isTeardownSectionRunning = ref<Record<string, boolean>>({});

const assistantState = ref<ProductSyncMigrationAssistantState>({
  componentRelease: "",
  minimumComponentRelease: migrationConfig.minimumComponentRelease,
  isEligible: null,
  hasNewProductSyncMessages: null,
  systemMessageRemoteId: "",
  legacySystemMessageRemoteIds: [],
  legacySystemMessagesTotalCount: 0,
  syncJobConfigured: null,
  syncJobName: "",
  artifactChecks: [],
  legacySystemMessageTypes: [],
  legacyServiceJobs: [],
  legacySystemMessages: []
});

const shop = computed(() => store.getters["shopify/getShopById"](props.id) || {});
const entryAction = computed<ProductSyncMigrationEntryAction>(() => {
  return ShopifyProductSyncMigrationService.resolveEntryAction(assistantState.value);
});
const assistantTitle = computed(() => {
  if (entryAction.value === "current") {
    return translate("New product sync is already active");
  }

  if (entryAction.value === "setup") {
    return translate("This shop can move to the new product sync");
  }

  return translate("This shop is not yet eligible for the new product sync");
});
const assistantSubtitle = computed(() => {
  return shop.value.name || props.id;
});
const backendReleaseDetail = computed(() => {
  if (assistantState.value.componentRelease) {
    return translate("Current backend release: {release}", { release: assistantState.value.componentRelease });
  }

  return translate("The backend release could not be read from Maarg.");
});
const eligibilityBadgeLabel = computed(() => {
  if (assistantState.value.isEligible === null) return translate("Checking");
  return assistantState.value.isEligible ? translate("Eligible") : translate("Upgrade required");
});
const eligibilityBadgeColor = computed(() => {
  if (assistantState.value.isEligible === null) return "medium";
  return assistantState.value.isEligible ? "success" : "warning";
});
const perShopSyncJobDetail = computed(() => {
  if (assistantState.value.syncJobConfigured && assistantState.value.syncJobName) {
    return assistantState.value.syncJobName;
  }

  return translate("No per-shop sync job is configured yet.");
});
const syncJobBadgeLabel = computed(() => {
  if (assistantState.value.syncJobConfigured === null) return translate("Checking");
  return assistantState.value.syncJobConfigured ? translate("Configured") : translate("Not configured");
});
const syncJobBadgeColor = computed(() => {
  if (assistantState.value.syncJobConfigured === null) return "medium";
  return assistantState.value.syncJobConfigured ? "success" : "medium";
});
const legacySystemMessageTypesSummary = computed(() => {
  const activeCount = assistantState.value.legacySystemMessageTypes.filter((item) => item.status === "active").length;
  const partialCount = assistantState.value.legacySystemMessageTypes.filter((item) => item.status === "partial").length;
  const deprecatedCount = assistantState.value.legacySystemMessageTypes.filter((item) => item.status === "deprecated").length;
  return translate("{activeCount} active, {partialCount} partially deactivated, {deprecatedCount} done.", { activeCount, partialCount, deprecatedCount });
});
const legacyServiceJobsSummary = computed(() => {
  const activeCount = assistantState.value.legacyServiceJobs.filter((item) => item.status === "active").length;
  const partialCount = assistantState.value.legacyServiceJobs.filter((item) => item.status === "partial").length;
  const deactivatedCount = assistantState.value.legacyServiceJobs.filter((item) => item.status === "deactivated").length;
  return translate("{activeCount} active, {partialCount} partially deactivated, {deactivatedCount} done.", { activeCount, partialCount, deactivatedCount });
});
const legacySystemMessagesSummary = computed(() => {
  if (!assistantState.value.legacySystemMessagesTotalCount) {
    return translate("No unfinished legacy system messages were found for this shop.");
  }

  return translate("Showing {count} unfinished legacy product-sync messages for this shop.", { count: assistantState.value.legacySystemMessages.length });
});
const perShopPatternLabel = computed(() => {
  return migrationConfig.incoming.serviceJobs.perShopPattern;
});
const nextStepDetail = computed(() => {
  if (entryAction.value === "current") {
    return translate("The new sync is already active, so continue on the current product sync page.");
  }

  if (entryAction.value === "setup") {
    return translate("Complete the readiness review, deactivate the old sync, and then continue to the new product sync setup flow.");
  }

  return translate("Request the backend upgrade first, then return here to complete readiness review and setup.");
});
const canRunTeardown = computed(() => {
  return assistantState.value.legacySystemMessageTypes.some((item) => isActionableLegacyItem(item, "type")) ||
    assistantState.value.legacyServiceJobs.some((item) => isActionableLegacyItem(item, "job")) ||
    assistantState.value.legacySystemMessages.some((item) => isActionableLegacyItem(item, "message"));
});
const teardownActionLabel = computed(() => {
  if (isTeardownRunning.value) {
    return translate("Deactivating legacy sync");
  }

  return canRunTeardown.value ? translate("Deactivate legacy sync") : translate("Legacy sync already deactivated");
});
const teardownStepDetail = computed(() => {
  if (canRunTeardown.value) {
    return translate("Review the legacy artifacts found for this shop, then deactivate the old sync in one guided step.");
  }

  return translate("No active legacy sync artifacts were found for this shop.");
});

const sharedInfrastructureJobs = computed(() => {
  return assistantState.value.artifactChecks.filter(check =>
    check.id === migrationConfig.incoming.serviceJobs.send ||
    check.id === migrationConfig.incoming.serviceJobs.poll
  );
});
const hasMissingArtifacts = computed(() => {
  return assistantState.value.artifactChecks.some(check => check.status === "missing");
});
const setupProgressTotal = computed(() => {
  return 1 + sharedInfrastructureJobs.value.length;
});
const setupProgressCompleted = computed(() => {
  let count = 0;
  if (assistantState.value.syncJobConfigured) count++;
  sharedInfrastructureJobs.value.forEach(job => {
    if (job.status === "verified" && !job.isPaused) count++;
  });
  return count;
});
const isStep1Done = computed(() => {
  return !hasMissingArtifacts.value && assistantState.value.isEligible === true;
});
const isStep2Done = computed(() => {
  return !canRunTeardown.value;
});
const isStep3Done = computed(() => {
  return setupProgressCompleted.value === setupProgressTotal.value;
});

const setupProgressValue = computed(() => {
  if (setupProgressTotal.value === 0) return 0;
  return setupProgressCompleted.value / setupProgressTotal.value;
});

onIonViewWillEnter(async () => {
  await loadAssistant();
});

async function loadAssistant() {
  isLoading.value = true;
  loadErrorMessage.value = "";
  teardownErrorMessage.value = "";
  teardownSuccessMessage.value = "";
  teardownLog.value = [];
  teardownFailedSteps.value = [];

  // Reset granular states to null/checking
  assistantState.value = {
    ...assistantState.value,
    isEligible: null,
    syncJobConfigured: null,
    artifactChecks: assistantState.value.artifactChecks.map(check => ({ ...check, status: "checking" })),
    legacySystemMessageTypes: assistantState.value.legacySystemMessageTypes.map(item => ({ ...item, status: "checking" })),
    legacyServiceJobs: assistantState.value.legacyServiceJobs.map(item => ({ ...item, status: "checking" })),
    legacySystemMessages: assistantState.value.legacySystemMessages.map(item => ({ ...item, status: "checking" }))
  };

  try {
    if (!shop.value.shopId) {
      await store.dispatch("shopify/fetchShopifyShops");
    }

    const currentShop = store.getters["shopify/getShopById"](props.id) || {};

    await ShopifyProductSyncMigrationService.fetchAssistantState(
      { shopId: props.id, shop: currentShop },
      (partialState) => {
        assistantState.value = { ...assistantState.value, ...partialState };
      }
    );

    // Auto-advance logic removed to ensure users always start on Step 1 and manually proceed.

  } catch (error: any) {
    loadErrorMessage.value = error?.message || translate("Failed to load the product sync upgrade assistant.");
  }

  isLoading.value = false;
}

function openProductSync() {
  router.push(`/shopify-connection-details/${props.id}/product-sync`);
}

function getLegacyItemLabel(status: ProductSyncMigrationLegacyItem["status"]) {
  switch (status) {
    case "checking":
      return translate("Checking");
    case "active":
      return translate("Active");
    case "partial":
      return translate("Partially deactivated");
    case "deprecated":
      return translate("Deprecated");
    case "deactivated":
      return translate("Deactivated");
    case "cancelled":
      return translate("Cancelled");
    case "terminal":
      return translate("Terminal");
    case "missing":
      return translate("Missing");
    default:
      return translate("Failed");
  }
}

function getLegacyItemColor(status: ProductSyncMigrationLegacyItem["status"]) {
  switch (status) {
    case "checking":
      return "medium";
    case "active":
    case "partial":
      return "warning";
    case "deprecated":
    case "deactivated":
    case "cancelled":
    case "terminal":
      return "success";
    case "missing":
      return "medium";
    default:
      return "danger";
  }
}


function getLegacyActionLabel(item: ProductSyncMigrationLegacyItem, kind: "type" | "job" | "message") {
  if (kind === "message") {
    return translate("Cancel");
  }

  if (item.status === "partial") {
    return translate("Finish teardown");
  }

  return translate("Deactivate");
}

function getArtifactCheckLabel(artifactCheck: any) {
  if (artifactCheck.status === "checking") return translate("Checking");
  return artifactCheck.status === "verified" ? translate("Verified") : translate("Missing");
}

function getArtifactCheckColor(artifactCheck: any) {
  if (artifactCheck.status === "checking") return "medium";
  if (artifactCheck.status === "verified") return "success";
  return "danger";
}

function getTeardownStepLabel(status: ProductSyncMigrationTeardownStep["status"]) {
  switch (status) {
    case "processing":
      return translate("In progress");
    case "done":
      return translate("Done");
    case "skipped":
      return translate("Skipped");
    case "failed":
      return translate("Failed");
    default:
      return translate("Unknown");
  }
}

function getTeardownStepColor(status: ProductSyncMigrationTeardownStep["status"]) {
  switch (status) {
    case "done":
      return "success";
    case "skipped":
      return "medium";
    case "failed":
      return "danger";
    default:
      return "primary";
  }
}

function getJobStatusLabel(job: any) {
  if (job.status === "missing") return translate("Missing");
  if (job.isPaused) return translate("Paused");
  return translate("Enabled");
}

function getJobStatusColor(job: any) {
  if (job.status === "missing") return "danger";
  if (job.isPaused) return "warning";
  return "success";
}

async function configureSyncJobForShop() {
  isConfiguringSyncJob.value = true;
  try {
    const shopId = props.id;
    await ShopifyProductSyncService.configureSyncJob({
      shopId,
      productStoreId: shop.value.productStore?.productStoreId || shop.value.productStoreId,
      productIdentifierEnumId: shop.value.productStore?.productIdentifierEnumId || shop.value.productIdentifierEnumId
    });

    await showToast(translate("Product sync job scheduled successfully."));
    await loadAssistant();
  } catch (error) {
    logger.error("Failed to configure sync job", error);
    await showToast(translate("Failed to schedule job."));
  } finally {
    isConfiguringSyncJob.value = false;
  }
}

async function enableJob(artifactCheck: any) {
  isEnablingJob.value[artifactCheck.id] = true;
  try {
    await ShopifyProductSyncMigrationService.enableServiceJob(artifactCheck.id, artifactCheck.jobDetail);
    await showToast(translate("Job enabled successfully."));
    await loadAssistant();
  } catch (error) {
    logger.error("Failed to enable job", error);
    await showToast(translate("Failed to enable job."));
  } finally {
    isEnablingJob.value[artifactCheck.id] = false;
  }
}

async function copyMissingArtifactsToClipboard() {
  const missingArtifacts = assistantState.value.artifactChecks.filter(check => check.status === "missing");
  if (!missingArtifacts.length) return;

  const details = missingArtifacts.map(check => `${check.label} (${check.id}): ${check.note}`).join("\n");
  const textToCopy = `${translate("Missing readiness artifacts")}:\n${details}`;

  await copyToClipboard(textToCopy);
}

async function copyArtifactCheckToClipboard(artifactCheck: any) {
  const textToCopy = `${artifactCheck.label} (${artifactCheck.id}): ${artifactCheck.note}`;
  await copyToClipboard(textToCopy);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    await showToast(translate("Details copied to clipboard."));
  } catch (err) {
    logger.error("Failed to copy to clipboard", err);
  }
}

async function confirmLegacyTeardown() {
  if (!canRunTeardown.value || isTeardownRunning.value) {
    return;
  }

  const alert = await alertController.create({
    header: translate("Deactivate legacy sync?"),
    message: translate("This will cancel unfinished legacy system messages, pause legacy jobs, and deprecate legacy message types for this shop."),
    buttons: [
      {
        text: translate("Keep legacy sync"),
        role: "cancel"
      },
      {
        text: translate("Deactivate"),
        handler: async () => {
          await teardownLegacySync();
        }
      }
    ]
  });

  await alert.present();
}

async function teardownLegacySync() {
  isTeardownRunning.value = true;
  teardownErrorMessage.value = "";
  teardownSuccessMessage.value = "";
  teardownLog.value = [];
  teardownFailedSteps.value = [];

  try {
    const currentShop = store.getters["shopify/getShopById"](props.id) || {};
    const result = await ShopifyProductSyncMigrationService.teardownLegacySync(
      { shopId: props.id, shop: currentShop },
      (step: ProductSyncMigrationTeardownStep) => {
        // Update or append this step in the log
        const existingIndex = teardownLog.value.findIndex(
          (s) => s.kind === step.kind && s.id === step.id
        );
        if (existingIndex >= 0) {
          teardownLog.value[existingIndex] = { ...step };
        } else {
          teardownLog.value.push({ ...step });
        }
      }
    );

    assistantState.value = {
      ...assistantState.value,
      legacySystemMessageTypes: result.legacySystemMessageTypes,
      legacyServiceJobs: result.legacyServiceJobs,
      legacySystemMessages: result.legacySystemMessages,
      legacySystemMessagesTotalCount: result.legacySystemMessagesTotalCount,
      legacySystemMessageRemoteIds: result.legacySystemMessageRemoteIds
    };
    teardownFailedSteps.value = result.failedSteps;

    if (result.failedSteps.length > 0) {
      teardownSuccessMessage.value = translate("Teardown completed with {count} step(s) that could not be completed. See details below.", { count: result.failedSteps.length });
      await showToast(translate("Teardown completed. {count} step(s) failed.", { count: result.failedSteps.length }));
    } else {
      teardownSuccessMessage.value = translate("Legacy product sync teardown completed successfully for all artifacts on this shop.");
      await showToast(translate("Legacy product sync teardown completed."));
    }
  } catch (error: any) {
    teardownErrorMessage.value = error?.message || translate("Failed to deactivate the legacy product sync.");
    await showToast(teardownErrorMessage.value);
  } finally {
    isTeardownRunning.value = false;
  }
}

async function teardownItem(item: ProductSyncMigrationLegacyItem, kind: "type" | "job" | "message") {
  isTeardownItemRunning.value[item.id] = true;
  try {
    await runTeardownAction(item, kind);
    await showToast(translate("Artifact deactivated successfully."));
    await loadAssistant();
  } catch (error) {
    logger.error(`Failed to teardown legacy ${kind} ${item.id}`, error);
    await showToast(translate("Failed to deactivate artifact."));
  } finally {
    isTeardownItemRunning.value[item.id] = false;
  }
}

async function teardownSection(kind: "type" | "job" | "message") {
  isTeardownSectionRunning.value[kind] = true;
  try {
    let items: ProductSyncMigrationLegacyItem[] = [];
    if (kind === "type") {
      items = assistantState.value.legacySystemMessageTypes.filter((item) => isActionableLegacyItem(item, kind));
    } else if (kind === "job") {
      items = assistantState.value.legacyServiceJobs.filter((item) => isActionableLegacyItem(item, kind));
    } else if (kind === "message") {
      items = assistantState.value.legacySystemMessages.filter((item) => isActionableLegacyItem(item, kind));
    }

    if (!items.length) return;

    for (const item of items) {
      await runTeardownAction(item, kind);
    }

    await showToast(translate("Section deactivated successfully."));
    await loadAssistant();
  } catch (error) {
    logger.error(`Failed to teardown legacy section ${kind}`, error);
    await showToast(translate("Failed to deactivate section."));
  } finally {
    isTeardownSectionRunning.value[kind] = false;
  }
}

async function runTeardownAction(item: ProductSyncMigrationLegacyItem, kind: "type" | "job" | "message") {
  if (kind === "type") {
    await ShopifyProductSyncMigrationService.deprecateLegacySystemMessageType(item.id);
    return;
  }

  if (kind === "job") {
    await ShopifyProductSyncMigrationService.deactivateLegacyServiceJob(item.id);
    return;
  }

  await ShopifyProductSyncMigrationService.cancelLegacySystemMessage(item.id);
}
</script>

<style scoped>
main {
  max-width: 70ch;
  margin-inline: auto;
}

.card-header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

ion-item .teardown-action {
  display: flex;
  flex-direction: column;
}

.hover-button {
  display: none;
}

.hover-action:hover .hide-on-hover {
  display: none;
}

/* Ensure the button is visible when a spinner is active (item is running) */
.hover-button:has(ion-spinner) {
  display: inline;
}

.hover-action:hover .hover-button {
  display: inline;
}

/* Ensure the badge is hidden when a spinner is active (item is running) */
.hover-action:has(ion-spinner) .hide-on-hover {
  display: inline;
}
</style>
