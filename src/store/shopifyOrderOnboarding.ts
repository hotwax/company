import { defineStore } from 'pinia'
import { api, logger } from '@common'

export type ShopifyOrderSyncActionTarget =
  | "UpdateDmConfig"
  | "AwsConnection"
  | "JobQueue"
  | "ToggleJobStatus"
  | "RunJobNow"
  | "ReturnChannel"
  | "DeleteReturnChannel"
  | "UpdateReturnChannel"
  | "ReturnApp"
  | "DeleteReturnApp"
  | "GiftCardMapping"
  | "UpdateFallbackJob"
  | "UpdateHistoricJob"
  | "CreateWebhook"
  | "DeleteWebhook"
  | "UpdateSystemProperty"
  | "ShutdownAllProductJobs"
  | "ShutdownSpecificJob"
  | "CloneJob";

export interface ShopifyOrderSyncSetupStatus {
  shopId?: string;
  systemMessageRemoteId?: string;
  systemMessageRemoteIds?: string[];
  dmConfigsLoaded?: boolean;
  dmConfigList?: any[];
  jobsConfigured?: boolean;
  liveJobExists?: boolean;
  liveJobPaused?: boolean;
  liveJobConfigured?: boolean;
  liveJobQueueName?: string;
  expireLockTime?: number;
  awsRemoteId?: string;
  validationRemoteId?: string;
  awsConfigured?: boolean;
  awsConnectionValid?: boolean;
  awsRemoteValid?: boolean;
  awsQueueValid?: boolean;
  awsConnectionError?: string;
  awsQueueUrl?: string;
  awsAccessKeyConfigured?: boolean;
  awsSecretKeyConfigured?: boolean;
  fallbackJobsList?: any[];
  fallbackJobsConfigured?: boolean;
  historicJobsList?: any[];
  historicJobsConfigured?: boolean;
  webhooksList?: any[];
  ordersUpdatedSubscribed?: boolean;
  systemProperties?: Array<{ systemPropertyId: string; systemPropertyValue: string }>;
  shutdownJobs?: any[];
  noPendingShutdownJobs?: boolean;
  returnChannelsLoaded?: boolean;
  returnAppsModelingDataLoaded?: boolean;
  giftCardMapped?: boolean;
  isFullyConfigured?: boolean;
  [key: string]: any;
}

export interface ShopifyOrderSyncSetupPayload {
  actionTarget: ShopifyOrderSyncActionTarget;
  [key: string]: any;
}

export interface ShopifyOrderSyncSetupResult {
  successMessage?: string;
}

export interface ConfigureOrderJobsPayload {
  shopId: string;
  systemMessageRemoteId: string;
  fallbackJobName?: string;
  historicJobName?: string;
  additionalParameters?: string;
  windowDays?: number;
}

export interface HistoricalOrderPolicyPayload {
  launchDate?: string;
  historyLastSyncDate?: string;
}

export interface QueueHistoricalOrderSyncPayload extends HistoricalOrderPolicyPayload {
  shopId: string;
  systemMessageRemoteId: string;
  historicJobName?: string;
  windowDays?: number;
}

const FALLBACK_TEMPLATE_JOB_NAME = "queue_ShopifyOrderSync";
const HISTORIC_TEMPLATE_JOB_NAME = "sync_ShopifyOrderHistory";
const FALLBACK_MESSAGE_TYPE_ID = "ShopifyOrderSync";
const HISTORIC_MESSAGE_TYPE_ID = "BulkOrderHistoryQuery";
const TIMESTAMP_FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

async function requestBackend<T>(request: any, context: string): Promise<T> {
  try {
    const resp = await api(request) as any;
    return resp?.data as T;
  } catch (error) {
    const details = getApiErrorDetails(error);
    logger.error(`${context} failed`, error);
    throw new Error(`${context} failed${details ? ` (${details})` : ""}.`);
  }
}

function getApiErrorDetails(error: any): string {
  const status = error?.response?.status;
  const responseMessage = error?.response?.data?.message || error?.response?.data?.error;
  const message = responseMessage || error?.message || "";
  return [status ? `status ${status}` : "", message].filter(Boolean).join(": ");
}

function normalizeStatus(shopId: string, payload: any): ShopifyOrderSyncSetupStatus {
  const healthStatus = payload?.healthStatus || payload || {};
  return {
    ...healthStatus,
    shopId,
    systemMessageRemoteIds: Array.isArray(healthStatus.systemMessageRemoteIds) ? healthStatus.systemMessageRemoteIds : [],
    dmConfigList: Array.isArray(healthStatus.dmConfigList) ? healthStatus.dmConfigList : [],
    fallbackJobsList: Array.isArray(healthStatus.fallbackJobsList) ? healthStatus.fallbackJobsList : [],
    historicJobsList: Array.isArray(healthStatus.historicJobsList) ? healthStatus.historicJobsList : [],
    webhooksList: Array.isArray(healthStatus.webhooksList) ? healthStatus.webhooksList : [],
    systemProperties: Array.isArray(healthStatus.systemProperties) ? healthStatus.systemProperties : [],
    shutdownJobs: Array.isArray(healthStatus.shutdownJobs) ? healthStatus.shutdownJobs : []
  };
}

function getRelevantJob(jobs: any[] = [], preferredJobName = "") {
  if (preferredJobName) {
    const preferred = jobs.find((job: any) => String(job?.jobName || "").trim() === preferredJobName);
    if (preferred) return preferred;
  }

  return jobs.find((job: any) => job?.isRelevantToShop) || jobs[0] || null;
}

function getHistoricJobName(shopId: string, historicJobName = "") {
  return historicJobName || `${HISTORIC_TEMPLATE_JOB_NAME}_${shopId}`;
}

function normalizeTimestampValue(value: string | undefined) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`;
  return text;
}

function optionalTimestampValue(value: string | undefined, label: string) {
  const timestamp = normalizeTimestampValue(value);
  if (!timestamp) return "";
  if (!TIMESTAMP_FORMAT.test(timestamp)) throw new Error(`${label} must use YYYY-MM-DD HH:mm:ss.`);
  return timestamp;
}

function requiredTimestampValue(value: string | undefined, label: string) {
  const timestamp = optionalTimestampValue(value, label);
  if (!timestamp) throw new Error(`${label} is required.`);
  return timestamp;
}

async function postSetupComponent(shopId: string, payload: ShopifyOrderSyncSetupPayload): Promise<ShopifyOrderSyncSetupResult> {
  const response = await requestBackend<ShopifyOrderSyncSetupResult>({
    url: `sob/shopify/orderSync/${encodeURIComponent(shopId)}/setup`,
    method: "POST",
    data: payload
  }, `Shopify order sync ${payload.actionTarget}`);

  return response || {};
}

export const useShopifyOrderOnboardingStore = defineStore('shopifyOrderOnboarding', {
  state: () => ({
    status: null as ShopifyOrderSyncSetupStatus | null,
    lastSetupResult: null as ShopifyOrderSyncSetupResult | null,
    loading: false
  }),
  actions: {
    async fetchSetupStatus(shopId: string): Promise<ShopifyOrderSyncSetupStatus> {
      this.loading = true;
      try {
        const response = await requestBackend<any>({
          url: `sob/shopify/orderSync/${encodeURIComponent(shopId)}/status`,
          method: "GET"
        }, "Shopify order sync status");
        const status = normalizeStatus(shopId, response);
        this.status = status;
        return status;
      } finally {
        this.loading = false;
      }
    },

    async setupComponent(shopId: string, payload: ShopifyOrderSyncSetupPayload): Promise<ShopifyOrderSyncSetupResult> {
      this.loading = true;
      try {
        const result = await postSetupComponent(shopId, payload);
        this.lastSetupResult = result;
        this.status = await this.fetchSetupStatus(shopId);
        return result;
      } finally {
        this.loading = false;
      }
    },

    async configureAwsConnection(shopId: string, payload: { awsRemoteId: string; sendUrl: string; username: string; password: string }) {
      return this.setupComponent(shopId, {
        actionTarget: "AwsConnection",
        ...payload
      });
    },

    async configureRealtimeQueue(shopId: string, payload: { queueName: string; awsRemoteId: string; expireLockTime: number }) {
      return this.setupComponent(shopId, {
        actionTarget: "JobQueue",
        ...payload
      });
    },

    async updateSystemProperty(shopId: string, systemPropertyId: string, systemPropertyValue: string) {
      return this.setupComponent(shopId, {
        actionTarget: "UpdateSystemProperty",
        systemPropertyId,
        systemPropertyValue
      });
    },

    async saveHistoricalOrderPolicy(shopId: string, payload: HistoricalOrderPolicyPayload) {
      const launchDate = optionalTimestampValue(payload.launchDate, "New order launch date");
      const historyLastSyncDate = optionalTimestampValue(payload.historyLastSyncDate, "Order history last sync date");

      if (!launchDate && !historyLastSyncDate) {
        throw new Error("Enter a launch date or history cursor before saving.");
      }

      this.loading = true;
      try {
        if (launchDate) {
          await postSetupComponent(shopId, {
            actionTarget: "UpdateSystemProperty",
            systemPropertyId: "newOrderSync.launchDate",
            systemPropertyValue: launchDate
          });
        }

        if (historyLastSyncDate) {
          await postSetupComponent(shopId, {
            actionTarget: "UpdateSystemProperty",
            systemPropertyId: "orderSyncHistory.lastSyncDate",
            systemPropertyValue: historyLastSyncDate
          });
        }

        this.status = await this.fetchSetupStatus(shopId);
        return this.status;
      } finally {
        this.loading = false;
      }
    },

    async configureHistoricOrderJob(payload: QueueHistoricalOrderSyncPayload) {
      const shopId = String(payload.shopId || "").trim();
      const systemMessageRemoteId = String(payload.systemMessageRemoteId || "").trim();
      const historicJobName = getHistoricJobName(shopId, payload.historicJobName);

      if (!shopId) throw new Error("Shopify shop is required.");
      if (!systemMessageRemoteId) throw new Error("Shopify remote is required before configuring historical import.");

      const currentStatus = this.status?.shopId === shopId ? this.status : await this.fetchSetupStatus(shopId);
      const historicJob = getRelevantJob(currentStatus.historicJobsList, historicJobName);

      if (!historicJob || historicJob.jobName !== historicJobName) {
        await postSetupComponent(shopId, {
          actionTarget: "CloneJob",
          jobName: HISTORIC_TEMPLATE_JOB_NAME,
          newJobName: historicJobName
        });
      }

      await postSetupComponent(shopId, {
        actionTarget: "UpdateHistoricJob",
        jobName: historicJobName,
        systemMessageTypeId: HISTORIC_MESSAGE_TYPE_ID,
        systemMessageRemoteId,
        windowDays: payload.windowDays || 7
      });

      this.status = await this.fetchSetupStatus(shopId);
      return { historicJobName, status: this.status };
    },

    async queueHistoricalOrderSync(payload: QueueHistoricalOrderSyncPayload) {
      const shopId = String(payload.shopId || "").trim();
      const systemMessageRemoteId = String(payload.systemMessageRemoteId || "").trim();
      const launchDate = requiredTimestampValue(payload.launchDate, "New order launch date");
      const historyLastSyncDate = requiredTimestampValue(payload.historyLastSyncDate, "Order history last sync date");
      const historicJobName = getHistoricJobName(shopId, payload.historicJobName);

      if (!shopId) throw new Error("Shopify shop is required.");
      if (!systemMessageRemoteId) throw new Error("Shopify remote is required before queuing historical import.");

      this.loading = true;
      try {
        await postSetupComponent(shopId, {
          actionTarget: "UpdateSystemProperty",
          systemPropertyId: "newOrderSync.launchDate",
          systemPropertyValue: launchDate
        });
        await postSetupComponent(shopId, {
          actionTarget: "UpdateSystemProperty",
          systemPropertyId: "orderSyncHistory.lastSyncDate",
          systemPropertyValue: historyLastSyncDate
        });

        await this.configureHistoricOrderJob({
          ...payload,
          shopId,
          systemMessageRemoteId,
          historicJobName,
          launchDate,
          historyLastSyncDate
        });

        const result = await postSetupComponent(shopId, {
          actionTarget: "RunJobNow",
          jobName: historicJobName
        });

        this.lastSetupResult = result;
        this.status = await this.fetchSetupStatus(shopId);
        return result;
      } finally {
        this.loading = false;
      }
    },

    async createWebhook(shopId: string, payload: { systemMessageRemoteId: string; topic: string; endpoint: string }) {
      return this.setupComponent(shopId, {
        actionTarget: "CreateWebhook",
        systemMessageRemoteId: payload.systemMessageRemoteId,
        jobName: payload.topic,
        sendUrl: payload.endpoint
      });
    },

    async deleteWebhook(shopId: string, payload: { systemMessageRemoteId: string; webhookSubscriptionId: string }) {
      return this.setupComponent(shopId, {
        actionTarget: "DeleteWebhook",
        systemMessageRemoteId: payload.systemMessageRemoteId,
        additionalParameters: payload.webhookSubscriptionId
      });
    },

    async toggleJobStatus(shopId: string, jobName: string) {
      return this.setupComponent(shopId, {
        actionTarget: "ToggleJobStatus",
        jobName
      });
    },

    async runJobNow(shopId: string, jobName: string) {
      return this.setupComponent(shopId, {
        actionTarget: "RunJobNow",
        jobName
      });
    },

    async configureOrderJobs(payload: ConfigureOrderJobsPayload) {
      const fallbackJobName = payload.fallbackJobName || `${FALLBACK_TEMPLATE_JOB_NAME}_${payload.shopId}`;
      const historicJobName = payload.historicJobName || `${HISTORIC_TEMPLATE_JOB_NAME}_${payload.shopId}`;
      const currentStatus = this.status?.shopId === payload.shopId ? this.status : await this.fetchSetupStatus(payload.shopId);
      const fallbackJob = getRelevantJob(currentStatus.fallbackJobsList, fallbackJobName);
      const historicJob = getRelevantJob(currentStatus.historicJobsList, historicJobName);

      if (!fallbackJob || fallbackJob.jobName !== fallbackJobName) {
        await postSetupComponent(payload.shopId, {
          actionTarget: "CloneJob",
          jobName: FALLBACK_TEMPLATE_JOB_NAME,
          newJobName: fallbackJobName
        });
      }

      await postSetupComponent(payload.shopId, {
        actionTarget: "UpdateFallbackJob",
        jobName: fallbackJobName,
        systemMessageTypeId: FALLBACK_MESSAGE_TYPE_ID,
        systemMessageRemoteId: payload.systemMessageRemoteId,
        runAsBatch: "true",
        additionalParameters: payload.additionalParameters || "{\"thruDateBuffer\":1}"
      });

      if (!historicJob || historicJob.jobName !== historicJobName) {
        await postSetupComponent(payload.shopId, {
          actionTarget: "CloneJob",
          jobName: HISTORIC_TEMPLATE_JOB_NAME,
          newJobName: historicJobName
        });
      }

      await postSetupComponent(payload.shopId, {
        actionTarget: "UpdateHistoricJob",
        jobName: historicJobName,
        systemMessageTypeId: HISTORIC_MESSAGE_TYPE_ID,
        systemMessageRemoteId: payload.systemMessageRemoteId,
        windowDays: payload.windowDays || 7
      });

      this.status = await this.fetchSetupStatus(payload.shopId);
      return this.status;
    },

    clearShopifyOrderOnboardingState() {
      this.$reset();
    }
  }
})
