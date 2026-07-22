<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="connectionDetailsHref" />
        </ion-buttons>
        <ion-title>{{ translate("Order sync setup") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :disabled="isLoading || isRefreshing || isMutationLocked"
            :aria-label="translate('Refresh order sync setup')"
            @click="requestRefresh"
          >
            <ion-spinner v-if="isRefreshing" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card v-if="isLoading" aria-live="polite">
        <ion-card-header>
          <ion-card-title>{{ translate("Loading order sync setup") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="loading-state">
          <ion-spinner name="crescent" />
          <p>{{ translate("Checking the selected Shopify shop, job, schedule, and mappings.") }}</p>
        </ion-card-content>
      </ion-card>

      <ion-card v-else-if="loadErrorMessage" color="light" role="alert">
        <ion-card-header>
          <ion-card-title>{{ translate("Order sync setup could not load") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("No configuration change was made.") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <p>{{ loadErrorMessage }}</p>
          <ion-button fill="outline" :disabled="isRefreshing" @click="loadConfiguration">
            {{ translate("Retry") }}
          </ion-button>
        </ion-card-content>
      </ion-card>

      <main v-else class="setup-layout">
        <aside class="setup-tracker" :aria-label="translate('Order sync setup summary')">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Configure batch order sync") }}</ion-card-title>
              <ion-card-subtitle>
                {{ translate("Review this shop's job, schedule, and order mappings before activation.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Shopify shop") }}
                  <p>{{ shopId }}</p>
                </ion-label>
                <ion-note slot="end">{{ shopName }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Product Store") }}
                  <p>{{ productStoreId }}</p>
                </ion-label>
                <ion-note slot="end">{{ productStoreName }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Batch job") }}
                  <p>{{ jobName }}</p>
                </ion-label>
                <ion-badge slot="end" :color="jobStateColor">{{ jobStateLabel }}</ion-badge>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Schedule") }}
                  <p>{{ scheduleDescription || translate("Not configured") }}</p>
                </ion-label>
                <ion-note slot="end">{{ scheduleStateLabel }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Order mappings") }}
                  <p>{{ mappingSummary }}</p>
                </ion-label>
                <ion-badge slot="end" :color="mappingReadiness.hasWarnings ? 'warning' : 'success'">
                  {{ mappingReadiness.hasWarnings ? translate("Review") : translate("Ready") }}
                </ion-badge>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Activation") }}</ion-label>
                <ion-badge slot="end" :color="isConfiguredActive ? 'success' : isConfiguredPaused ? 'warning' : 'medium'">
                  {{ isConfiguredActive ? translate("Active") : isConfiguredPaused ? translate("Paused") : translate("Waiting for setup") }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-note v-if="!capabilities.canConfigure" color="medium" class="permission-note">
            {{ translate("You can review this setup. COMMON_ADMIN permission is required to create, edit, or activate the job.") }}
          </ion-note>
        </aside>

        <section class="setup-content">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Shop context") }}</ion-card-title>
              <ion-card-subtitle>{{ translate("All configuration and mapping checks are scoped to this Shopify connection.") }}</ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ shopName }}
                  <p>{{ translate("Shop ID") }}: {{ shopId }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Linked Product Store") }}
                  <p>{{ productStoreId }}</p>
                </ion-label>
                <ion-note slot="end">{{ productStoreName }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Shopify remote") }}
                  <p>{{ translate("The remote is selected from this shop on the server.") }}</p>
                </ion-label>
                <ion-note slot="end">{{ remoteLabel }}</ion-note>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card v-if="isMissing">
            <ion-card-header>
              <ion-card-title>{{ translate("Create the batch order sync job") }}</ion-card-title>
              <ion-card-subtitle>
                {{ translate("Clone only the standard Order Sync job for this shop. The new job inherits its schedule and remains paused.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ translate("Standard job") }}
                  <p>{{ translate("Only this job is cloned; historical order import is not changed.") }}</p>
                </ion-label>
                <ion-note slot="end">{{ templateJobName }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Inherited schedule") }}
                  <p>{{ templateScheduleDescription || translate("The standard job schedule will be retained.") }}</p>
                </ion-label>
                <ion-note slot="end">{{ templateCronExpression || translate("Loaded during setup") }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Initial state") }}
                  <p>{{ translate("An administrator must review and activate it explicitly.") }}</p>
                </ion-label>
                <ion-badge slot="end" color="warning">{{ translate("Paused") }}</ion-badge>
              </ion-item>
            </ion-list>
            <ion-card-content>
              <ion-button
                expand="block"
                :disabled="!capabilities.canConfigure || isMutationLocked"
                data-testid="configure-order-sync-job"
                @click="configureJob"
              >
                <ion-spinner v-if="activeMutation === 'configure'" slot="start" name="crescent" />
                {{ translate("Create paused Order Sync job") }}
              </ion-button>
              <p v-if="!capabilities.canConfigure" class="supporting-text">
                {{ translate("Ask an Integration Administrator with COMMON_ADMIN permission to create this job.") }}
              </p>
            </ion-card-content>
          </ion-card>

          <ion-card v-if="isConfigured">
            <ion-card-header>
              <ion-card-title>{{ translate("Batch sync job") }}</ion-card-title>
              <ion-card-subtitle>
                {{ isConfiguredPaused
                  ? translate("The shop-specific job is configured and paused while you review its inherited schedule.")
                  : translate("The shop-specific job is configured and active.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ jobName }}
                  <p>{{ translate("Cloned from") }} {{ templateJobName }}</p>
                </ion-label>
                <ion-badge slot="end" :color="isConfiguredPaused ? 'warning' : 'success'">
                  {{ isConfiguredPaused ? translate("Paused") : translate("Active") }}
                </ion-badge>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Message type") }}
                  <p>{{ translate("Scheduled Shopify order changes") }}</p>
                </ion-label>
                <ion-note slot="end">ShopifyOrderSync</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Shop remote") }}
                  <p>{{ translate("Resolved for the selected Shopify shop") }}</p>
                </ion-label>
                <ion-note slot="end">{{ remoteLabel }}</ion-note>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card v-if="isConfigured">
            <ion-card-header>
              <ion-card-title>{{ translate("Schedule") }}</ion-card-title>
              <ion-card-subtitle>
                {{ translate("Quartz cron expressions are evaluated in the OMS runtime timezone.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-input
                  v-model="draftCronExpression"
                  aria-describedby="order-sync-schedule-validation"
                  label-placement="stacked"
                  :label="translate('Quartz cron expression')"
                  :disabled="!capabilities.canEditSchedule || isMutationLocked"
                  :aria-invalid="!isScheduleValid"
                  data-testid="order-sync-cron-expression"
                />
              </ion-item>
              <ion-item>
                <ion-label id="order-sync-schedule-validation" class="ion-text-wrap">
                  <span class="overline">{{ translate("Schedule preview") }}</span>
                  <p v-if="isScheduleValid">{{ scheduleDescription }}</p>
                  <p v-else class="validation-error">{{ scheduleValidationMessage }}</p>
                  <p>{{ translate("OMS runtime timezone") }}: {{ timeZone }}</p>
                </ion-label>
                <ion-note slot="end">{{ nextRunLabel }}</ion-note>
              </ion-item>
              <ion-list-header>{{ translate("Schedule options") }}</ion-list-header>
              <ion-radio-group v-model="draftCronExpression" :aria-label="translate('Schedule options')">
                <ion-item v-for="option in scheduleOptions" :key="option.expression">
                  <ion-radio
                    label-placement="end"
                    justify="start"
                    :value="option.expression"
                    :disabled="!capabilities.canEditSchedule || isMutationLocked"
                  >
                    {{ translate(option.label) }}
                  </ion-radio>
                </ion-item>
              </ion-radio-group>
            </ion-list>
            <ion-card-content class="card-actions">
              <ion-button
                fill="clear"
                :disabled="!isScheduleDirty || isMutationLocked"
                @click="discardScheduleChanges"
              >
                {{ translate("Discard changes") }}
              </ion-button>
              <ion-button
                :disabled="!capabilities.canEditSchedule || !isScheduleDirty || !isScheduleValid || isMutationLocked"
                data-testid="save-order-sync-schedule"
                @click="saveSchedule"
              >
                <ion-spinner v-if="activeMutation === 'schedule'" slot="start" name="crescent" />
                {{ translate("Save schedule") }}
              </ion-button>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Order mapping readiness") }}</ion-card-title>
              <ion-card-subtitle>
                {{ translate("Missing mappings are non-blocking warnings. Complete them in the established shop mapping pages.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item
                v-for="mapping in mappingRows"
                :key="mapping.id"
                button
                detail
                :aria-label="mapping.ariaLabel"
                @click="openMapping(mapping)"
              >
                <ion-icon slot="start" :icon="mapping.ready ? checkmarkCircleOutline : alertCircleOutline" :color="mapping.ready ? 'success' : 'warning'" />
                <ion-label class="ion-text-wrap">
                  {{ mapping.label }}
                  <p>{{ mapping.description }}</p>
                  <p v-if="!mapping.ready" class="mapping-warning">
                    {{ translate(mapping.warning, { mapping: mapping.label }) }}
                  </p>
                </ion-label>
                <ion-badge slot="end" :color="mapping.ready ? 'success' : 'warning'">
                  {{ mapping.ready ? translate("Ready") : translate("Missing") }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card v-if="isConfiguredPaused">
            <ion-card-header>
              <ion-card-title>{{ translate("Activate batch order sync") }}</ion-card-title>
              <ion-card-subtitle>
                {{ translate("Activation starts the reviewed schedule. Mapping warnings do not block a valid configured job.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>{{ translate("Selected shop") }}</ion-label>
                <ion-note slot="end">{{ shopName }} ({{ shopId }})</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Remote") }}</ion-label>
                <ion-note slot="end">{{ remoteLabel }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Schedule") }}</ion-label>
                <ion-note slot="end">{{ scheduleDescription }}</ion-note>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Mapping warnings") }}
                  <p>{{ mappingSummary }}</p>
                </ion-label>
                <ion-badge slot="end" :color="mappingReadiness.hasWarnings ? 'warning' : 'success'">
                  {{ mappingReadiness.warnings.length }}
                </ion-badge>
              </ion-item>
            </ion-list>
            <ion-card-content>
              <p v-if="isScheduleDirty" class="validation-error">
                {{ translate("Save or discard schedule changes before activating the job.") }}
              </p>
              <ion-button
                expand="block"
                :disabled="!capabilities.canActivate || isScheduleDirty || !isScheduleValid || isMutationLocked"
                data-testid="open-order-sync-activation"
                @click="openActivationReview"
              >
                {{ translate("Review and activate") }}
              </ion-button>
              <p v-if="!capabilities.canActivate" class="supporting-text">
                {{ translate("COMMON_ADMIN permission is required to activate this job.") }}
              </p>
            </ion-card-content>
          </ion-card>

          <ion-card v-if="isConfiguredActive">
            <ion-card-header>
              <ion-card-title>{{ translate("Order Sync is configured") }}</ion-card-title>
              <ion-card-subtitle>{{ translate("The active job will continue on the saved schedule.") }}</ion-card-subtitle>
            </ion-card-header>
            <ion-card-content>
              <ion-button expand="block" :router-link="monitorHref">
                {{ translate("Continue to monitoring") }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        </section>
      </main>

      <ion-modal
        :is-open="showActivationModal"
        :backdrop-dismiss="false"
        :can-dismiss="canDismissActivationModal"
        @didDismiss="closeActivationReview"
      >
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button
                :disabled="activeMutation === 'activate'"
                :aria-label="translate('Close activation review')"
                @click="closeActivationReview"
              >
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Activate Order Sync") }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Confirm this shop's schedule") }}</ion-card-title>
              <ion-card-subtitle>
                {{ translate("The paused job will begin running on its configured schedule after activation.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  {{ activationTarget?.shopName || shopName }}
                  <p>{{ translate("Shop ID") }}: {{ activationTarget?.shopId || shopId }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Remote") }}
                  <p>{{ activationTarget?.remoteLabel || remoteLabel }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  {{ translate("Schedule") }}
                  <p>{{ activationTarget?.cronExpression || draftCronExpression }}</p>
                  <p>{{ activationTarget?.scheduleDescription || scheduleDescription }} · {{ activationTarget?.timeZone || timeZone }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ translate("Mapping review") }}</ion-card-title>
              <ion-card-subtitle v-if="mappingReadiness.hasWarnings">
                {{ translate("These warnings do not block activation, but they can affect how imported orders are classified.") }}
              </ion-card-subtitle>
              <ion-card-subtitle v-else>
                {{ translate("All three Order Sync mapping families have at least one mapping.") }}
              </ion-card-subtitle>
            </ion-card-header>
            <ion-list v-if="mappingReadiness.hasWarnings" lines="full">
              <ion-item v-for="warning in mappingReadiness.warnings" :key="warning">
                <ion-icon slot="start" :icon="alertCircleOutline" color="warning" />
                <ion-label class="ion-text-wrap">{{ translate(warning) }}</ion-label>
              </ion-item>
            </ion-list>
            <ion-list v-else lines="full">
              <ion-item>
                <ion-icon slot="start" :icon="checkmarkCircleOutline" color="success" />
                <ion-label>{{ translate("Sales Channel, Payment Method, and Shipping Method mappings are ready.") }}</ion-label>
              </ion-item>
            </ion-list>
            <ion-item lines="full">
              <ion-checkbox
                :checked="activationAcknowledged"
                label-placement="end"
                justify="start"
                data-testid="order-sync-activation-acknowledgement"
                @ionChange="activationAcknowledged = $event.detail.checked"
              >
                {{ activationAcknowledgementLabel }}
              </ion-checkbox>
            </ion-item>
            <ion-card-content>
              <ion-button
                expand="block"
                :disabled="!activationAcknowledged || activeMutation === 'activate'"
                data-testid="activate-order-sync-job"
                @click="activateJob"
              >
                <ion-spinner v-if="activeMutation === 'activate'" slot="start" name="crescent" />
                {{ translate("Activate Order Sync") }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { DateTime } from "luxon";
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
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonPage,
  IonRadio,
  IonRadioGroup,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
  onIonViewWillLeave
} from "@ionic/vue";
import { alertCircleOutline, checkmarkCircleOutline, closeOutline, refreshOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from "vue-router";

import { useShopifyOrderSyncStore } from "@/store/shopifyOrderSync";
import {
  SHOPIFY_ORDER_SYNC_TEMPLATE_JOB,
  deriveOrderSyncConfigurationState,
  deriveOrderSyncMappingReadiness,
  type OrderSyncConfigurationState,
  type OrderSyncMappingFamilyId,
  type OrderSyncMappingReadiness
} from "@/utils/shopifyOrderSync";
import {
  SHOPIFY_ORDER_SYNC_SCHEDULE_PRESETS,
  createShopifyOrderSyncScheduleDraft,
  describeShopifyOrderSyncCronExpression,
  getNextShopifyOrderSyncRun,
  isShopifyOrderSyncScheduleDirty,
  normalizeShopifyOrderSyncCronExpression,
  validateShopifyOrderSyncCronExpression
} from "@/utils/shopifyOrderSyncSchedule";

const props = defineProps<{ id: string }>();
const router = useRouter();
const orderSyncStore = useShopifyOrderSyncStore();

type SetupMutation = "configure" | "schedule" | "activate" | "";
type ActivationTarget = {
  shopId: string;
  shopName: string;
  jobName: string;
  remoteLabel: string;
  cronExpression: string;
  scheduleDescription: string;
  timeZone: string;
};
type MappingRow = {
  id: OrderSyncMappingFamilyId;
  label: string;
  description: string;
  routeName: "ShopifySalesChannels" | "ShopifyPaymentMethods" | "ShopifyShipmentMethods";
  ready: boolean;
  warning: string;
  ariaLabel: string;
};

const localMutation = ref<SetupMutation>("");
const activeShopId = ref(normalizeShopId(props.id));
const draftCronExpression = ref("");
const originalCronExpression = ref("");
const showActivationModal = ref(false);
const activationAcknowledged = ref(false);
const activationTarget = ref<ActivationTarget | null>(null);
const allowRouteLeave = ref(false);
const initialLoadPending = ref(true);
const refreshPending = ref(false);
const isPageActive = ref(false);
const localLoadToken = ref(0);

const connectionDetailsHref = computed(() => `/shopify-connection-details/${encodeURIComponent(activeShopId.value)}`);
const monitorHref = computed(() => `/shopify-connection-details/${encodeURIComponent(activeShopId.value)}/order-sync`);

const capabilities = computed(() => orderSyncStore.capabilities);
const hasCurrentStoreContext = computed(() => orderSyncStore.selectedShopId === activeShopId.value);
const configurationState = computed<OrderSyncConfigurationState>(() => hasCurrentStoreContext.value
  ? orderSyncStore.configurationState
  : deriveOrderSyncConfigurationState({ loading: true }));
const mappingReadiness = computed<OrderSyncMappingReadiness>(() => hasCurrentStoreContext.value
  ? orderSyncStore.mappingReadiness
  : deriveOrderSyncMappingReadiness({ selectedShopId: activeShopId.value }));

const shop = computed(() => hasCurrentStoreContext.value ? orderSyncStore.shop : null);
const productStore = computed(() => hasCurrentStoreContext.value ? orderSyncStore.productStore : null);
const remote = computed(() => hasCurrentStoreContext.value ? orderSyncStore.remote : null);
const job = computed(() => hasCurrentStoreContext.value ? orderSyncStore.job : null);
const templateJob = computed(() => hasCurrentStoreContext.value ? orderSyncStore.templateJob : null);
const shopId = computed(() => String(shop.value?.shopId || activeShopId.value));
const shopName = computed(() => String(shop.value?.name || activeShopId.value));
const productStoreId = computed(() => String(
  productStore.value?.productStoreId || shop.value?.productStoreId || translate("Not linked")
));
const productStoreName = computed(() => String(
  productStore.value?.name || productStoreId.value
));
const remoteLabel = computed(() => String(
  remote.value?.systemMessageRemoteId || remote.value?.description || translate("Unavailable")
));
const jobName = computed(() => String(job.value?.jobName || translate("Not created")));
const templateJobName = computed(() => String(templateJob.value?.jobName || SHOPIFY_ORDER_SYNC_TEMPLATE_JOB));
const templateCronExpression = computed(() => String(
  templateJob.value?.cronExpression || templateJob.value?.cronString || ""
));

const isLoading = computed(() => {
  return initialLoadPending.value
    || configurationState.value.kind === "loading"
    || Object.values(orderSyncStore.configurationResources || {}).some((resource: any) => resource?.status === "loading");
});
const isMissing = computed(() => configurationState.value.kind === "missing");
const isConfiguredPaused = computed(() => configurationState.value.kind === "configured-paused");
const isConfiguredActive = computed(() => configurationState.value.kind === "configured-active");
const isConfigured = computed(() => isConfiguredPaused.value || isConfiguredActive.value);
const isRefreshing = computed(() => refreshPending.value);
const activeMutation = computed<SetupMutation>(() => {
  const mutation = String(orderSyncStore.activeMutation || localMutation.value || "");
  if (mutation === "save-schedule") return "schedule";
  if (mutation === "set-paused" || mutation === "status") return "activate";
  return ["configure", "schedule", "activate"].includes(mutation) ? mutation as SetupMutation : localMutation.value;
});
const isMutationLocked = computed(() => Boolean(orderSyncStore.activeMutation || localMutation.value));

const loadErrorMessage = computed(() => {
  const error = configurationState.value.kind === "error"
    ? configurationState.value.error
    : orderSyncStore.configurationError;
  if (!error) return "";
  return getErrorMessage(error, translate("Unable to load this shop's Order Sync setup."));
});

const timeZone = computed(() => String(
  hasCurrentStoreContext.value ? orderSyncStore.runtimeTimeZone : ""
).trim() || "UTC");

const isScheduleDirty = computed(() => isShopifyOrderSyncScheduleDirty(
  { cronExpression: originalCronExpression.value, active: false },
  { cronExpression: draftCronExpression.value, active: false }
));
const scheduleValidation = computed(() => validateShopifyOrderSyncCronExpression(
  draftCronExpression.value,
  { timeZone: timeZone.value }
));
const isScheduleValid = computed(() => scheduleValidation.value.valid);
const isSchedulePreviewSupported = computed(() => scheduleValidation.value.previewSupported);
const scheduleValidationMessage = computed(() => translate(
  scheduleValidation.value.message || "Provide a valid Quartz cron expression."
));

const scheduleDescription = computed(() => {
  if (!isScheduleValid.value) return "";
  if (!isSchedulePreviewSupported.value) return serverAuthoritativePreviewMessage();
  return describeShopifyOrderSyncCronExpression(draftCronExpression.value, { timeZone: timeZone.value })
    || serverAuthoritativePreviewMessage();
});

const templateScheduleDescription = computed(() => {
  const validation = validateShopifyOrderSyncCronExpression(templateCronExpression.value, { timeZone: timeZone.value });
  if (!validation.valid) return "";
  if (!validation.previewSupported) return serverAuthoritativePreviewMessage();
  return describeShopifyOrderSyncCronExpression(templateCronExpression.value, { timeZone: timeZone.value })
    || serverAuthoritativePreviewMessage();
});

const nextRunLabel = computed(() => {
  if (!isScheduleValid.value) return translate("Invalid");
  if (!isSchedulePreviewSupported.value) return translate("OMS validates on save");
  const nextRun = getNextShopifyOrderSyncRun(draftCronExpression.value, {
    timeZone: timeZone.value,
    currentDate: new Date()
  });
  if (!nextRun) return translate("OMS validates on save");
  const zonedNextRun = DateTime.fromJSDate(nextRun).setZone(timeZone.value);
  return translate("Next: {time}", { time: zonedNextRun.toLocaleString(DateTime.DATETIME_SHORT) });
});

const scheduleStateLabel = computed(() => {
  if (isMissing.value) return translate("Inherited on creation");
  if (!isScheduleValid.value) return translate("Invalid");
  return isConfiguredPaused.value ? translate("Paused") : translate("Active");
});

const jobStateLabel = computed(() => {
  if (isMissing.value) return translate("Missing");
  if (isConfiguredPaused.value) return translate("Configured · Paused");
  return translate("Configured");
});

const jobStateColor = computed(() => {
  if (isMissing.value) return "medium";
  if (isConfiguredPaused.value) return "warning";
  return "success";
});

const mappingRows = computed<MappingRow[]>(() => {
  const readinessById = new Map(mappingReadiness.value.families.map((family) => [family.id, family]));
  const definitions: Array<Omit<MappingRow, "ready" | "warning" | "ariaLabel">> = [
    {
      id: "sales-channel",
      label: translate("Sales Channel"),
      description: translate("Map Shopify order sources to HotWax sales channels (SHOPIFY_ORDER_SOURCE)."),
      routeName: "ShopifySalesChannels"
    },
    {
      id: "payment-method",
      label: translate("Payment Method"),
      description: translate("Map Shopify payment types to HotWax payment methods (SHOPIFY_PAYMENT_TYPE)."),
      routeName: "ShopifyPaymentMethods"
    },
    {
      id: "shipping-method",
      label: translate("Shipping Method"),
      description: translate("Map this shop's carrier shipping methods to HotWax shipment methods."),
      routeName: "ShopifyShipmentMethods"
    }
  ];

  return definitions.map((definition) => {
    const readiness = readinessById.get(definition.id);
    const ready = Boolean(readiness?.ready);
    const warning = readiness?.warning || "{mapping} mapping is missing.";
    return {
      ...definition,
      ready,
      warning,
      ariaLabel: ready
        ? translate("Review {mapping} mappings. Ready.", { mapping: definition.label })
        : translate("Add {mapping} mappings. Missing.", { mapping: definition.label })
    };
  });
});

const mappingSummary = computed(() => {
  const readyCount = mappingReadiness.value.families.filter((family) => family.ready).length;
  if (readyCount === 3) return translate("All 3 mapping families are ready");
  return translate("{ready} of 3 ready · {warnings} warnings", {
    ready: readyCount,
    warnings: mappingReadiness.value.warnings.length
  });
});

const activationAcknowledgementLabel = computed(() => {
  if (mappingReadiness.value.hasWarnings) {
    return translate("I reviewed the missing mappings and want to activate this paused job anyway.");
  }
  return translate("I reviewed the shop, remote, schedule, and mappings and want to activate this job.");
});

const scheduleOptions = SHOPIFY_ORDER_SYNC_SCHEDULE_PRESETS;

watch(
  () => String(job.value?.cronExpression || job.value?.cronString || ""),
  (cronExpression) => {
    if (!hasCurrentStoreContext.value || isScheduleDirty.value) return;
    originalCronExpression.value = cronExpression;
    draftCronExpression.value = cronExpression;
  },
  { immediate: true }
);

onIonViewWillEnter(() => {
  isPageActive.value = true;
  const routeShopId = normalizeShopId(props.id);
  if (routeShopId !== activeShopId.value) prepareForShop(routeShopId);
  void loadConfiguration(routeShopId);
});
onIonViewWillLeave(() => {
  isPageActive.value = false;
  localLoadToken.value += 1;
});
onBeforeRouteUpdate(async (to) => {
  const nextShopId = normalizeShopId(to.params.id);
  const currentShopId = activeShopId.value;
  if (!nextShopId || nextShopId === currentShopId) return true;
  if (isMutationLocked.value) return false;

  const canSwitchShop = await confirmDiscardChanges();
  if (!canSwitchShop || isMutationLocked.value || activeShopId.value !== currentShopId) return false;
  return true;
});
onBeforeRouteLeave(async () => {
  if (allowRouteLeave.value) return true;
  if (isMutationLocked.value) return false;
  const currentShopId = activeShopId.value;
  const canLeave = await confirmDiscardChanges();
  if (!canLeave || isMutationLocked.value || activeShopId.value !== currentShopId) return false;
  discardScheduleChanges();
  closeActivationReview();
  return canLeave;
});

watch(
  () => normalizeShopId(props.id),
  (nextShopId) => {
    if (!nextShopId) return;
    if (nextShopId !== activeShopId.value) prepareForShop(nextShopId);
    if (isPageActive.value) void loadConfiguration(nextShopId);
  },
  { flush: "pre" }
);

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!isScheduleDirty.value && !isMutationLocked.value) return;
  event.preventDefault();
  event.returnValue = "";
}

window.addEventListener("beforeunload", handleBeforeUnload);
onBeforeUnmount(() => {
  localLoadToken.value += 1;
  window.removeEventListener("beforeunload", handleBeforeUnload);
});

async function loadConfiguration(targetShopId = activeShopId.value, showRefreshFailure = false) {
  if (!targetShopId || targetShopId !== activeShopId.value || normalizeShopId(props.id) !== targetShopId) return false;
  const requestToken = ++localLoadToken.value;
  initialLoadPending.value = true;
  try {
    await orderSyncStore.loadConfiguration(targetShopId);
    if (!isCurrentShopContext(targetShopId) || requestToken !== localLoadToken.value) return false;
    syncScheduleDraft(targetShopId);
    return true;
  } catch (_error) {
    logger.error("Failed to load Shopify Order Sync configuration");
    if (showRefreshFailure && isCurrentRouteShop(targetShopId)) {
      commonUtil.showToast(translate("Order sync setup could not be refreshed."));
    }
    return false;
  } finally {
    if (requestToken === localLoadToken.value && isCurrentRouteShop(targetShopId)) {
      initialLoadPending.value = false;
    }
  }
}

async function requestRefresh() {
  const targetShopId = activeShopId.value;
  if (!isCurrentShopContext(targetShopId)) return;
  const shouldRefresh = await confirmDiscardChanges();
  if (!shouldRefresh || !isCurrentShopContext(targetShopId) || isMutationLocked.value) return;

  discardScheduleChanges();
  refreshPending.value = true;
  try {
    await loadConfiguration(targetShopId, true);
  } finally {
    if (isCurrentRouteShop(targetShopId)) refreshPending.value = false;
  }
}

async function configureJob() {
  const targetShopId = activeShopId.value;
  const targetTemplateJobName = String(templateJob.value?.jobName || "");
  if (!isCurrentShopContext(targetShopId) || !isMissing.value || !targetTemplateJobName || !capabilities.value.canConfigure || isMutationLocked.value) return;
  localMutation.value = "configure";
  try {
    const configuredJob = await orderSyncStore.configure({ shopId: targetShopId });
    if (!isCurrentShopContext(targetShopId)
      || String(configuredJob?.shopId || "") !== targetShopId
      || String(templateJob.value?.jobName || "") !== targetTemplateJobName) {
      throw new Error(translate("The selected Shopify shop changed before configuration completed."));
    }
    syncScheduleDraft(targetShopId);
    commonUtil.showToast(translate("Paused Order Sync job created."));
  } catch (error) {
    logger.error("Failed to configure Shopify Order Sync job");
    if (isCurrentRouteShop(targetShopId)) {
      commonUtil.showToast(getErrorMessage(error, translate("Order Sync job could not be created.")));
    }
  } finally {
    localMutation.value = "";
  }
}

async function saveSchedule() {
  const targetShopId = activeShopId.value;
  const targetJobName = currentJobName(targetShopId);
  if (!targetJobName || !isCurrentShopContext(targetShopId) || !capabilities.value.canEditSchedule || !isScheduleDirty.value || !isScheduleValid.value || isMutationLocked.value) return;
  const cronExpression = normalizeShopifyOrderSyncCronExpression(draftCronExpression.value);
  localMutation.value = "schedule";
  try {
    const updatedJob = await orderSyncStore.updateSchedule(cronExpression, targetShopId);
    if (!isCurrentJob(targetShopId, targetJobName)
      || String(updatedJob?.jobName || "") !== targetJobName
      || String(updatedJob?.cronExpression || updatedJob?.cronString || "") !== cronExpression) {
      throw new Error(translate("The selected Order Sync job changed before the schedule update completed."));
    }
    originalCronExpression.value = cronExpression;
    draftCronExpression.value = cronExpression;
    commonUtil.showToast(translate("Order Sync schedule saved."));
  } catch (error) {
    logger.error("Failed to save Shopify Order Sync schedule");
    if (isCurrentRouteShop(targetShopId)) {
      commonUtil.showToast(getErrorMessage(error, translate("Order Sync schedule could not be saved.")));
    }
  } finally {
    localMutation.value = "";
  }
}

function discardScheduleChanges() {
  draftCronExpression.value = originalCronExpression.value;
}

function openActivationReview() {
  const targetShopId = activeShopId.value;
  const targetJobName = currentJobName(targetShopId);
  if (!targetJobName || !isCurrentShopContext(targetShopId) || !capabilities.value.canActivate || isScheduleDirty.value || !isScheduleValid.value || isMutationLocked.value) return;
  activationTarget.value = {
    shopId: targetShopId,
    shopName: shopName.value,
    jobName: targetJobName,
    remoteLabel: remoteLabel.value,
    cronExpression: normalizeShopifyOrderSyncCronExpression(draftCronExpression.value),
    scheduleDescription: scheduleDescription.value,
    timeZone: timeZone.value
  };
  activationAcknowledged.value = false;
  showActivationModal.value = true;
}

function closeActivationReview() {
  if (activeMutation.value === "activate") return;
  showActivationModal.value = false;
  activationAcknowledged.value = false;
  activationTarget.value = null;
}

function canDismissActivationModal() {
  return activeMutation.value !== "activate";
}

async function activateJob() {
  const target = activationTarget.value;
  if (!target || !isCurrentJob(target.shopId, target.jobName) || !capabilities.value.canActivate || !activationAcknowledged.value || isMutationLocked.value) return;
  if (normalizeShopifyOrderSyncCronExpression(draftCronExpression.value) !== target.cronExpression
    || timeZone.value !== target.timeZone) {
    closeActivationReview();
    commonUtil.showToast(translate("Order Sync setup changed. Review activation again."));
    return;
  }
  localMutation.value = "activate";
  try {
    const updatedJob = await orderSyncStore.updateJobStatus(false, target.shopId);
    if (!isCurrentJob(target.shopId, target.jobName)
      || String(updatedJob?.jobName || "") !== target.jobName
      || updatedJob?.paused !== false) {
      throw new Error(translate("The selected Order Sync job changed before activation completed."));
    }
    showActivationModal.value = false;
    activationAcknowledged.value = false;
    activationTarget.value = null;
    allowRouteLeave.value = true;
    commonUtil.showToast(translate("Order Sync activated."));
    await router.replace(`/shopify-connection-details/${encodeURIComponent(target.shopId)}/order-sync`);
  } catch (error) {
    logger.error("Failed to activate Shopify Order Sync job");
    allowRouteLeave.value = false;
    if (isCurrentRouteShop(target.shopId)) {
      commonUtil.showToast(getErrorMessage(error, translate("Order Sync job could not be activated.")));
    }
  } finally {
    localMutation.value = "";
  }
}

async function openMapping(mapping: MappingRow) {
  const targetShopId = activeShopId.value;
  if (!isCurrentShopContext(targetShopId) || isMutationLocked.value) return;
  await router.push({
    name: mapping.routeName,
    params: { id: targetShopId },
    query: { returnTo: `/shopify-connection-details/${encodeURIComponent(targetShopId)}/order-sync/configure` }
  });
}

function syncScheduleDraft(targetShopId = activeShopId.value) {
  if (!hasCurrentStoreContext.value || activeShopId.value !== targetShopId) return;
  const cronExpression = String(job.value?.cronExpression || job.value?.cronString || "");
  const scheduleDraft = createShopifyOrderSyncScheduleDraft(cronExpression);
  originalCronExpression.value = String(scheduleDraft.cronExpression || "");
  draftCronExpression.value = String(scheduleDraft.cronExpression || "");
}

function serverAuthoritativePreviewMessage() {
  return translate("Preview unavailable. OMS validates this schedule when you save.");
}

function normalizeShopId(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return String(candidate || "").trim();
}

function isCurrentRouteShop(targetShopId: string) {
  return Boolean(targetShopId)
    && activeShopId.value === targetShopId
    && normalizeShopId(props.id) === targetShopId;
}

function isCurrentShopContext(targetShopId: string) {
  return isPageActive.value
    && isCurrentRouteShop(targetShopId)
    && orderSyncStore.selectedShopId === targetShopId;
}

function currentJobName(targetShopId: string) {
  if (!isCurrentShopContext(targetShopId)) return "";
  const loadedJob = job.value;
  if (!loadedJob || String(loadedJob.shopId || "") !== targetShopId) return "";
  return String(loadedJob.jobName || "").trim();
}

function isCurrentJob(targetShopId: string, targetJobName: string) {
  return Boolean(targetJobName) && currentJobName(targetShopId) === targetJobName;
}

function prepareForShop(targetShopId: string) {
  if (!targetShopId) return;
  localLoadToken.value += 1;
  activeShopId.value = targetShopId;
  initialLoadPending.value = true;
  refreshPending.value = false;
  originalCronExpression.value = "";
  draftCronExpression.value = "";
  showActivationModal.value = false;
  activationAcknowledged.value = false;
  activationTarget.value = null;
  allowRouteLeave.value = false;
  orderSyncStore.resetForShop(targetShopId);
}

async function confirmDiscardChanges() {
  if (!isScheduleDirty.value) return true;

  return new Promise<boolean>((resolve) => {
    alertController.create({
      header: translate("Unsaved changes"),
      message: translate("You have unsaved Order Sync schedule changes. Discard them?"),
      backdropDismiss: false,
      buttons: [
        {
          text: translate("Keep editing"),
          role: "cancel",
          handler: () => resolve(false)
        },
        {
          text: translate("Discard changes"),
          role: "destructive",
          handler: () => resolve(true)
        }
      ]
    }).then((alert) => alert.present());
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  const record = error && typeof error === "object" ? error as Record<string, any> : {};
  const message = record.response?.data?.error
    || record.response?.data?._ERROR_MESSAGE_
    || record.data?.error
    || record.message;
  if (Array.isArray(message)) return message.join(", ");
  return message ? String(message) : fallback;
}
</script>

<style scoped>
.setup-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) minmax(0, 2fr);
  gap: var(--spacer-base);
  align-items: start;
  padding: var(--spacer-base);
}

.setup-tracker,
.setup-content {
  min-width: 0;
}

.setup-tracker {
  position: sticky;
  top: var(--spacer-base);
}

.setup-tracker ion-card,
.setup-content ion-card {
  margin: 0 0 var(--spacer-base);
}

.permission-note {
  display: block;
  padding: 0 var(--spacer-base) var(--spacer-base);
  line-height: 1.4;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: var(--spacer-base);
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacer-xs);
  flex-wrap: wrap;
}

.overline {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.validation-error,
.mapping-warning {
  color: var(--ion-color-danger-shade);
}

.supporting-text {
  color: var(--ion-color-medium-shade);
  margin-bottom: 0;
}

ion-note[slot="end"],
ion-badge[slot="end"] {
  max-width: 45%;
  text-align: end;
  white-space: normal;
}

@media (max-width: 768px) {
  .setup-layout {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--spacer-xs);
  }

  .setup-tracker {
    position: static;
  }

  .card-actions {
    flex-direction: column-reverse;
  }

  .card-actions ion-button {
    width: 100%;
  }

  ion-note[slot="end"],
  ion-badge[slot="end"] {
    max-width: 40%;
  }
}

@media (prefers-reduced-motion: reduce) {
  ion-spinner {
    animation: none;
  }
}
</style>
