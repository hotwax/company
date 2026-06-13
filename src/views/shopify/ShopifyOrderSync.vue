<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="returnTo || `/shopify-connection-details/${id}`" />
        </ion-buttons>
        <ion-title>{{ translate("Order sync") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="isLoading" @click="loadSetupStatus">{{ translate("Refresh") }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card v-if="isLoading && !status">
        <ion-card-header>
          <ion-card-title>{{ translate("Loading order sync") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-spinner name="crescent" />
        </ion-card-content>
      </ion-card>

      <ion-card v-else-if="loadError">
        <ion-card-header>
          <ion-card-title>{{ translate("Order sync could not load") }}</ion-card-title>
          <ion-card-subtitle>{{ loadError }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-button fill="outline" @click="loadSetupStatus">{{ translate("Retry") }}</ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Order sync setup") }}</ion-card-title>
            <ion-card-subtitle>{{ setupSummary }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-label>
                {{ translate("Shopify remote") }}
                <p>{{ primaryShopifyRemoteId || translate("No write-enabled Shopify remote found") }}</p>
              </ion-label>
              <ion-badge slot="end" :color="primaryShopifyRemoteId ? 'success' : 'warning'">{{ primaryShopifyRemoteId ? translate("Ready") : translate("Missing") }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Data Manager") }}
                <p>{{ dataManagerSummary }}</p>
              </ion-label>
              <ion-badge slot="end" :color="status?.dmConfigsLoaded ? 'success' : 'warning'">{{ status?.dmConfigsLoaded ? translate("Ready") : translate("Review") }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Realtime order import") }}
                <p>{{ realtimeSummary }}</p>
              </ion-label>
              <ion-badge slot="end" :color="realtimeBadgeColor">{{ realtimeBadgeLabel }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Fallback order import") }}
                <p>{{ fallbackSummary }}</p>
              </ion-label>
              <ion-badge slot="end" :color="status?.fallbackJobsConfigured ? 'success' : 'warning'">{{ status?.fallbackJobsConfigured ? translate("Ready") : translate("Setup") }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Historical order import") }}
                <p>{{ historicSummary }}</p>
              </ion-label>
              <ion-badge slot="end" :color="status?.historicJobsConfigured ? 'success' : 'warning'">{{ status?.historicJobsConfigured ? translate("Ready") : translate("Setup") }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                {{ translate("Webhook") }}
                <p>{{ webhookSummary }}</p>
              </ion-label>
              <ion-badge slot="end" :color="status?.ordersUpdatedSubscribed ? 'success' : 'medium'">{{ status?.ordersUpdatedSubscribed ? translate("Subscribed") : translate("Optional") }}</ion-badge>
            </ion-item>
          </ion-list>
        </ion-card>

        <ion-segment :value="activeSection" @ionChange="activeSection = String($event.detail.value || 'policy')">
          <ion-segment-button :value="'policy'">
            <ion-label>{{ translate("Policy") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button :value="'realtime'">
            <ion-label>{{ translate("Realtime") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button :value="'jobs'">
            <ion-label>{{ translate("Jobs") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button :value="'webhooks'">
            <ion-label>{{ translate("Webhooks") }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <ion-card v-if="activeSection === 'policy'">
          <ion-card-header>
            <ion-card-title>{{ translate("Historical order policy") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Use dates to keep old open Shopify orders from entering fulfillment after go live.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-input v-model="launchDate" :label="translate('New order launch date')" label-placement="stacked" :placeholder="translate('YYYY-MM-DD HH:mm:ss')" />
            </ion-item>
            <ion-item>
              <ion-input v-model="historyLastSyncDate" :label="translate('Order history last sync date')" label-placement="stacked" :placeholder="translate('YYYY-MM-DD HH:mm:ss')" />
            </ion-item>
          </ion-list>
          <ion-card-content>
            <ion-button expand="block" :disabled="isSaving" @click="saveHistoricalPolicy">{{ translate("Save historical policy") }}</ion-button>
            <ion-button expand="block" fill="outline" :disabled="isSaving || !canQueueHistoricalImport" @click="queueHistoricalImport">{{ translate("Queue first history window") }}</ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="activeSection === 'realtime'">
          <ion-card-header>
            <ion-card-title>{{ translate("Realtime SQS consumer") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Connect the shared Shopify order SQS consumer to the AWS remote and queue.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-input v-model="awsRemoteId" :label="translate('AWS remote ID')" label-placement="stacked" placeholder="AWS_CONFIG" />
            </ion-item>
            <ion-item>
              <ion-input v-model="queueName" :label="translate('SQS queue name')" label-placement="stacked" />
            </ion-item>
            <ion-item>
              <ion-input v-model.number="expireLockTime" type="number" :label="translate('Expire lock minutes')" label-placement="stacked" />
            </ion-item>
          </ion-list>
          <ion-card-content>
            <ion-button expand="block" :disabled="isSaving || !queueName" @click="saveRealtimeQueue">{{ translate("Save realtime queue") }}</ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="activeSection === 'realtime'">
          <ion-card-header>
            <ion-card-title>{{ translate("AWS connection") }}</ion-card-title>
            <ion-card-subtitle>{{ awsCredentialSubtitle }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-input v-model="awsSendUrl" :label="translate('AWS endpoint or region URL')" label-placement="stacked" />
            </ion-item>
            <ion-item>
              <ion-input v-model="awsUsername" :label="translate('Access key')" label-placement="stacked" />
            </ion-item>
            <ion-item>
              <ion-input v-model="awsPassword" type="password" :label="translate('Secret key')" label-placement="stacked" />
            </ion-item>
          </ion-list>
          <ion-card-content>
            <ion-button expand="block" fill="outline" :disabled="isSaving || !awsSendUrl || !awsUsername || !awsPassword" @click="saveAwsConnection">{{ translate("Save AWS connection") }}</ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="activeSection === 'jobs'">
          <ion-card-header>
            <ion-card-title>{{ translate("Order import jobs") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Configure fallback and historical imports for this Shopify shop.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-select v-model="selectedSystemMessageRemoteId" :label="translate('Shopify remote')" label-placement="stacked" interface="popover">
                <ion-select-option v-for="remoteId in shopifyRemoteIds" :key="remoteId" :value="remoteId">{{ remoteId }}</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input v-model="fallbackJobName" :label="translate('Fallback job')" label-placement="stacked" />
            </ion-item>
            <ion-item>
              <ion-textarea v-model="fallbackAdditionalParameters" :label="translate('Fallback parameters')" label-placement="stacked" auto-grow />
            </ion-item>
            <ion-item>
              <ion-input v-model="historicJobName" :label="translate('Historical job')" label-placement="stacked" />
            </ion-item>
            <ion-item>
              <ion-input v-model.number="historyWindowDays" type="number" :label="translate('History window days')" label-placement="stacked" />
            </ion-item>
          </ion-list>
          <ion-card-content>
            <ion-button expand="block" :disabled="isSaving || !selectedSystemMessageRemoteId" @click="saveOrderJobs">{{ translate("Configure order import jobs") }}</ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="activeSection === 'webhooks'">
          <ion-card-header>
            <ion-card-title>{{ translate("Order webhook") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Subscribe Shopify order events to the EventBridge or webhook endpoint used by realtime order import.") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-select v-model="selectedSystemMessageRemoteId" :label="translate('Shopify remote')" label-placement="stacked" interface="popover">
                <ion-select-option v-for="remoteId in shopifyRemoteIds" :key="remoteId" :value="remoteId">{{ remoteId }}</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input v-model="webhookTopic" :label="translate('Topic')" label-placement="stacked" />
            </ion-item>
            <ion-item>
              <ion-input v-model="webhookEndpoint" :label="translate('Endpoint ARN or URL')" label-placement="stacked" />
            </ion-item>
          </ion-list>
          <ion-card-content>
            <ion-button expand="block" :disabled="isSaving || !selectedSystemMessageRemoteId || !webhookEndpoint" @click="saveWebhook">{{ translate("Create webhook") }}</ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Finish") }}</ion-card-title>
            <ion-card-subtitle>{{ finishSubtitle }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-button expand="block" :disabled="!returnTo" @click="returnToSetup">{{ translate("Return to product store setup") }}</ion-button>
          </ion-card-content>
        </ion-card>
      </template>
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
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter
} from "@ionic/vue";
import { computed, defineProps, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { commonUtil, logger, translate } from "@common";
import { useShopifyOrderOnboardingStore, type ShopifyOrderSyncSetupStatus } from "@/store/shopifyOrderOnboarding";

const props = defineProps(["id"]);
const route = useRoute();
const router = useRouter();
const shopifyOrderSyncStore = useShopifyOrderOnboardingStore();

const status = ref<ShopifyOrderSyncSetupStatus | null>(null);
const isLoading = ref(false);
const isSaving = ref(false);
const loadError = ref("");
const activeSection = ref("policy");

const launchDate = ref("");
const historyLastSyncDate = ref("");
const awsRemoteId = ref("AWS_CONFIG");
const queueName = ref("");
const expireLockTime = ref(10);
const awsSendUrl = ref("");
const awsUsername = ref("");
const awsPassword = ref("");
const selectedSystemMessageRemoteId = ref("");
const fallbackJobName = ref("");
const fallbackAdditionalParameters = ref("{\"thruDateBuffer\":1}");
const historicJobName = ref("");
const historyWindowDays = ref(7);
const webhookTopic = ref("ORDERS_UPDATED");
const webhookEndpoint = ref("");

const returnTo = computed(() => String(route.query.returnTo || ""));
const shopifyRemoteIds = computed(() => status.value?.systemMessageRemoteIds || []);
const primaryShopifyRemoteId = computed(() => status.value?.systemMessageRemoteId || shopifyRemoteIds.value[0] || "");
const setupSummary = computed(() => {
  if (status.value?.isFullyConfigured) return translate("Order sync is fully configured for this Shopify shop.");
  return translate("Complete the setup sections that match how this retailer wants Shopify orders imported.");
});
const dataManagerSummary = computed(() => {
  const configs = status.value?.dmConfigList || [];
  if (!configs.length) return translate("Order import Data Manager configs were not returned.");
  return configs.map((config: any) => `${config.configId}: ${config.exists ? translate("ready") : translate("missing")}`).join(" · ");
});
const realtimeSummary = computed(() => {
  if (!status.value?.liveJobExists) return translate("consume_ShopifyOrders_SQS was not found.");
  if (!status.value.liveJobConfigured) return translate("Queue name and AWS remote are not configured.");
  if (!status.value.awsConnectionValid) return status.value.awsConnectionError || translate("AWS connection or queue validation has not passed.");
  return translate("SQS consumer is configured and AWS validation passed.");
});
const realtimeBadgeColor = computed(() => {
  if (status.value?.awsConnectionValid) return "success";
  if (status.value?.liveJobConfigured) return "warning";
  return "medium";
});
const realtimeBadgeLabel = computed(() => {
  if (status.value?.awsConnectionValid) return translate("Ready");
  if (status.value?.liveJobConfigured) return translate("Validate");
  return translate("Setup");
});
const fallbackSummary = computed(() => {
  const job = getRelevantJob(status.value?.fallbackJobsList);
  return job?.jobName || translate("No fallback order import job is configured for this shop.");
});
const historicSummary = computed(() => {
  const job = getRelevantJob(status.value?.historicJobsList);
  return job?.jobName || translate("No historical order import job is configured for this shop.");
});
const canQueueHistoricalImport = computed(() => {
  return !!selectedSystemMessageRemoteId.value && !!launchDate.value && !!historyLastSyncDate.value;
});
const webhookSummary = computed(() => {
  if (status.value?.ordersUpdatedSubscribed) return translate("ORDERS_UPDATED is subscribed.");
  return translate("Create a webhook after the EventBridge or webhook endpoint is ready.");
});
const awsCredentialSubtitle = computed(() => {
  if (status.value?.awsAccessKeyConfigured && status.value?.awsSecretKeyConfigured) {
    return translate("AWS credentials are saved. Enter new values only when rotating credentials.");
  }
  return translate("Save the AWS credentials used by the order SQS consumer.");
});
const finishSubtitle = computed(() => {
  if (returnTo.value) return translate("Return to product store setup when order sync is ready enough for onboarding.");
  return translate("This order sync setup can be reopened from Shopify connection details.");
});

onIonViewWillEnter(loadSetupStatus);

async function loadSetupStatus() {
  if (!props.id) return;
  isLoading.value = true;
  loadError.value = "";
  try {
    const nextStatus = await shopifyOrderSyncStore.fetchSetupStatus(props.id);
    status.value = nextStatus;
    hydrateDraft(nextStatus);
  } catch (error: any) {
    logger.error(error);
    loadError.value = error?.message || translate("Order sync setup status is unavailable.");
  } finally {
    isLoading.value = false;
  }
}

function hydrateDraft(nextStatus: ShopifyOrderSyncSetupStatus) {
  awsRemoteId.value = nextStatus.validationRemoteId || nextStatus.awsRemoteId || awsRemoteId.value || "AWS_CONFIG";
  queueName.value = nextStatus.liveJobQueueName || queueName.value;
  expireLockTime.value = Number(nextStatus.expireLockTime || expireLockTime.value || 10);
  awsSendUrl.value = nextStatus.awsQueueUrl || awsSendUrl.value;
  selectedSystemMessageRemoteId.value = nextStatus.systemMessageRemoteId || nextStatus.systemMessageRemoteIds?.[0] || selectedSystemMessageRemoteId.value;
  fallbackJobName.value = getRelevantJob(nextStatus.fallbackJobsList)?.jobName || `${"queue_ShopifyOrderSync"}_${props.id}`;
  historicJobName.value = getRelevantJob(nextStatus.historicJobsList)?.jobName || `${"sync_ShopifyOrderHistory"}_${props.id}`;
  const launchProperty = getSystemProperty(nextStatus, "newOrderSync.launchDate");
  const historyProperty = getSystemProperty(nextStatus, "orderSyncHistory.lastSyncDate");
  launchDate.value = launchProperty || launchDate.value;
  historyLastSyncDate.value = historyProperty || historyLastSyncDate.value;
}

function getRelevantJob(jobs: any[] = []) {
  return jobs.find((job: any) => job?.isRelevantToShop) || jobs[0] || null;
}

function getSystemProperty(nextStatus: ShopifyOrderSyncSetupStatus, systemPropertyId: string) {
  return String(nextStatus.systemProperties?.find((property) => property.systemPropertyId === systemPropertyId)?.systemPropertyValue || "").trim();
}

async function runSave(action: () => Promise<any>, successMessage: string) {
  isSaving.value = true;
  try {
    const result = await action();
    commonUtil.showToast(result?.successMessage || successMessage);
    await loadSetupStatus();
  } catch (error: any) {
    logger.error(error);
    commonUtil.showToast(error?.message || translate("Order sync setup action failed."));
  } finally {
    isSaving.value = false;
  }
}

async function saveHistoricalPolicy() {
  await runSave(async () => {
    await shopifyOrderSyncStore.saveHistoricalOrderPolicy(props.id, {
      launchDate: launchDate.value,
      historyLastSyncDate: historyLastSyncDate.value
    });
  }, translate("Historical order policy saved."));
}

async function queueHistoricalImport() {
  await runSave(async () => {
    return await shopifyOrderSyncStore.queueHistoricalOrderSync({
      shopId: props.id,
      systemMessageRemoteId: selectedSystemMessageRemoteId.value,
      launchDate: launchDate.value,
      historyLastSyncDate: historyLastSyncDate.value,
      historicJobName: historicJobName.value,
      windowDays: Number(historyWindowDays.value || 7)
    });
  }, translate("Historical order sync queued."));
}

async function saveRealtimeQueue() {
  await runSave(async () => {
    await shopifyOrderSyncStore.configureRealtimeQueue(props.id, {
      queueName: queueName.value,
      awsRemoteId: awsRemoteId.value || "AWS_CONFIG",
      expireLockTime: Number(expireLockTime.value || 10)
    });
  }, translate("Realtime order queue saved."));
}

async function saveAwsConnection() {
  await runSave(async () => {
    await shopifyOrderSyncStore.configureAwsConnection(props.id, {
      awsRemoteId: awsRemoteId.value || "AWS_CONFIG",
      sendUrl: awsSendUrl.value,
      username: awsUsername.value,
      password: awsPassword.value
    });
    awsPassword.value = "";
  }, translate("AWS connection saved."));
}

async function saveOrderJobs() {
  await runSave(async () => {
    await shopifyOrderSyncStore.configureOrderJobs({
      shopId: props.id,
      systemMessageRemoteId: selectedSystemMessageRemoteId.value,
      fallbackJobName: fallbackJobName.value,
      historicJobName: historicJobName.value,
      additionalParameters: fallbackAdditionalParameters.value,
      windowDays: Number(historyWindowDays.value || 7)
    });
  }, translate("Order import jobs configured."));
}

async function saveWebhook() {
  await runSave(async () => {
    await shopifyOrderSyncStore.createWebhook(props.id, {
      systemMessageRemoteId: selectedSystemMessageRemoteId.value,
      topic: webhookTopic.value || "ORDERS_UPDATED",
      endpoint: webhookEndpoint.value
    });
  }, translate("Order webhook created."));
}

function returnToSetup() {
  if (returnTo.value) router.push(returnTo.value);
}
</script>
