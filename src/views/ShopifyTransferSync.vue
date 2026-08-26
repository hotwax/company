<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${props.id}`" />
        </ion-buttons>
        <ion-title>{{ translate("Transfer sync") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <!-- Fatal: the cache never hydrated for this shop and the worker is reporting an error. -->
      <ion-card v-if="!monitoringLoaded && transferSyncError" class="ion-margin-top">
        <ion-card-content class="fatal-error">
          <ion-icon :icon="warningOutline" color="danger" />
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("Transfer sync data could not be loaded") }}</h2>
            <p>{{ transferSyncError }}</p>
          </ion-label>
          <ion-button fill="outline" :disabled="retrying" @click="retry()">
            <ion-spinner v-if="retrying" name="crescent" />
            <template v-else>
              {{ translate("Retry") }}
            </template>
          </ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <!-- Non-blocking: cached rows are still shown, but they may be stale. -->
        <ion-card v-if="monitoringLoaded && transferSyncError" color="warning" class="ion-margin-top stale-banner">
          <ion-card-content>
            <ion-icon :icon="warningOutline" />
            <ion-label class="ion-text-wrap">
              {{ translate("The list below may be out of date") }}
              <p>{{ transferSyncError }}</p>
            </ion-label>
          </ion-card-content>
        </ion-card>

        <template v-if="!monitoringLoaded">
          <div class="kpi-grid ion-margin-top">
            <ion-card v-for="i in 4" :key="i">
              <ion-card-header>
                <ion-skeleton-text :animated="true" style="width: 60%" />
                <ion-skeleton-text :animated="true" style="width: 30%; height: 1.5rem" />
              </ion-card-header>
            </ion-card>
          </div>
          <ion-list lines="full">
            <ion-item v-for="i in 5" :key="i">
              <ion-label>
                <ion-skeleton-text :animated="true" style="width: 40%" />
                <p><ion-skeleton-text :animated="true" style="width: 60%" /></p>
              </ion-label>
            </ion-item>
          </ion-list>
        </template>

        <template v-else>
          <section class="kpi-grid ion-margin-top">
            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Owned transfers") }}</ion-card-subtitle>
                <ion-card-title>{{ allRows.length }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>{{ translate("Transfer orders owned by this shop") }}</ion-card-content>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Needing attention") }}</ion-card-subtitle>
                <ion-card-title :color="needsAttentionCount ? 'warning' : undefined">
                  {{ needsAttentionCount }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>{{ translate("Blocked, conflicted, or otherwise flagged transfers") }}</ion-card-content>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Webhook subscription health") }}</ion-card-subtitle>
                <ion-card-title v-if="!webhookHealthHydrated">
                  <ion-skeleton-text :animated="true" class="count-skeleton" />
                </ion-card-title>
                <ion-card-title v-else-if="webhookMissingCount === undefined" color="medium">
                  {{ translate("Not available") }}
                </ion-card-title>
                <ion-card-title v-else :color="(webhookMissingCount || webhookDuplicateCount) ? 'warning' : 'success'">
                  {{ webhookMissingCount }} / {{ webhookDuplicateCount }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                {{ translate("Missing / duplicate webhook topics") }}
                <p v-if="webhookCheckedAt" class="overline">
                  {{ translate("Checked") }} {{ formatDateTime(webhookCheckedAt) || translate("Not available") }}
                </p>
              </ion-card-content>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ translate("Update job") }}</ion-card-subtitle>
                <ion-card-title v-if="!jobsHydrated">
                  <ion-skeleton-text :animated="true" class="count-skeleton" />
                </ion-card-title>
                <ion-card-title v-else :color="updateJobBadgeColor">
                  {{ updateJobStatus }}
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                {{ translate("update_ShopifyInventoryTransfer") }}
                <p v-if="updateJobNextRun" class="overline">
                  {{ translate("Next run") }} {{ formatDateTime(updateJobNextRun) || translate("Not available") }}
                </p>
              </ion-card-content>
            </ion-card>
          </section>

          <ion-card class="filter-card">
            <ion-card-content>
              <div class="filter-grid">
                <div class="filter-item">
                  <ion-select
                    :value="stageFilter"
                    :label="translate('Stage')"
                    label-placement="stacked"
                    fill="outline"
                    interface="popover"
                    :placeholder="translate('All')"
                    @ion-change="stageFilter = $event.detail.value || ''"
                  >
                    <ion-select-option value="">
                      {{ translate("All") }}
                    </ion-select-option>
                    <ion-select-option v-for="stage in STAGE_OPTIONS" :key="stage" :value="stage">
                      {{ stageLabel(stage) }}
                    </ion-select-option>
                  </ion-select>
                </div>

                <div class="filter-item">
                  <ion-item lines="none" class="date-filter-item">
                    <ion-label>{{ translate("From") }}</ion-label>
                    <ion-datetime-button slot="end" datetime="transfer-sync-from" />
                    <ion-popover :keep-contents-on-did-dismiss="true">
                      <ion-datetime id="transfer-sync-from" v-model="dateFrom" presentation="date" />
                    </ion-popover>
                  </ion-item>
                </div>

                <div class="filter-item">
                  <ion-item lines="none" class="date-filter-item">
                    <ion-label>{{ translate("To") }}</ion-label>
                    <ion-datetime-button slot="end" datetime="transfer-sync-to" />
                    <ion-popover :keep-contents-on-did-dismiss="true">
                      <ion-datetime id="transfer-sync-to" v-model="dateTo" presentation="date" />
                    </ion-popover>
                  </ion-item>
                </div>

                <div class="filter-item">
                  <ion-item lines="none">
                    <ion-checkbox slot="start" v-model="needsAttentionOnly" />
                    <ion-label>{{ translate("Needs attention only") }}</ion-label>
                  </ion-item>
                </div>
              </div>
            </ion-card-content>
          </ion-card>

          <!-- Genuine empty state: this shop owns zero transfers. Eligibility is decided at
               approval time (exactly one common shop between the order and the receiving
               location), so an operator seeing this needs to know WHY, not just that the list
               is empty. -->
          <ion-card v-if="!allRows.length">
            <ion-card-content class="empty-state">
              <ion-icon :icon="swapHorizontalOutline" />
              <ion-label class="ion-text-wrap">
                <h2>{{ translate("No transfers owned by this shop") }}</h2>
                <p>{{ translate("A transfer becomes owned by exactly one shop at approval time, when the order and the receiving location share exactly one common Shopify shop. This shop has none right now.") }}</p>
                <p>{{ translate("Approved transfers not yet owned by any shop are not shown on this page. This OMS does not yet have an operational query for that list.") }}</p>
              </ion-label>
            </ion-card-content>
          </ion-card>

          <ion-card v-else-if="!rows.length">
            <ion-card-content>
              {{ translate("No transfers match the current filters.") }}
            </ion-card-content>
          </ion-card>

          <ion-list v-else lines="full">
            <ion-item
              v-for="row in rows"
              :key="`${row.shopId}-${row.orderId}`"
              button
              detail
              @click="openDetail(row)"
            >
              <ion-label class="ion-text-wrap">
                {{ row.orderName || row.orderId }}
                <p>{{ row.orderStatusId || translate("Not available") }}</p>
                <p>{{ row.shopifyInventoryTransferId || translate("Not created yet") }}</p>
              </ion-label>
              <ion-badge slot="end" :color="stageColor(row.syncStage)">
                {{ stageLabel(row.syncStage) }}
              </ion-badge>
              <ion-label slot="end" class="ion-text-end last-activity">
                {{ formatDateTime(row.lastActivityDate) || translate("Not available") }}
                <p>{{ translate("Last activity") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </template>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonCheckbox, IonContent, IonDatetime, IonDatetimeButton, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonPage, IonPopover, IonSelect, IonSelectOption,
  IonSkeletonText, IonSpinner, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { swapHorizontalOutline, warningOutline } from "ionicons/icons";
import { DateTime } from "luxon";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useCacheSync } from "@/composables/useCacheSync";
import { useServiceJobs } from "@/composables/useServiceJobs";
import {
  useShopifyTransferSyncList,
  useShopifyTransferWebhookHealth,
} from "@/composables/useShopifyTransferSync";
import { formatDateTime } from "@/utils";
import {
  TRANSFER_SYNC_STAGE_COLORS,
  isTransferSyncMonitoringLoaded,
  stageColor,
  stageLabel,
} from "@/utils/shopifyTransferSync";

const props = defineProps<{ id?: string }>();
const router = useRouter();

const stageFilter = ref("");
const needsAttentionOnly = ref(false);
const dateFrom = ref<string | null>(null);
const dateTo = ref<string | null>(null);
const retrying = ref(false);

const STAGE_OPTIONS = Object.keys(TRANSFER_SYNC_STAGE_COLORS);

const shopId = computed(() => String(props.id ?? ""));

const dateFilterMs = computed(() => ({
  fromMs: dateFrom.value ? DateTime.fromISO(dateFrom.value).startOf("day").toMillis() : undefined,
  toMs: dateTo.value ? DateTime.fromISO(dateTo.value).endOf("day").toMillis() : undefined,
}));

const { rows, hydrated, needsAttentionCount } = useShopifyTransferSyncList(() => shopId.value, () => ({
  stage: stageFilter.value || undefined,
  needsAttentionOnly: needsAttentionOnly.value,
  ...dateFilterMs.value,
}));
// Unfiltered count for the KPI card and the "owns zero transfers" empty state, which must not be
// masked by an active filter selection.
const { rows: allRows } = useShopifyTransferSyncList(() => shopId.value);

const {
  missingCount: webhookMissingCount,
  duplicateCount: webhookDuplicateCount,
  checkedAt: webhookCheckedAt,
  hydrated: webhookHealthHydrated,
} = useShopifyTransferWebhookHealth(() => shopId.value);

const { jobs: cachedJobs, hydrated: jobsHydrated } = useServiceJobs();
const updateJob = computed(() => cachedJobs.value.find((job: any) =>
  String(job.jobName ?? "").startsWith("update_ShopifyInventoryTransfer") &&
  (job.serviceJobParameters ?? []).some((p: any) => p.parameterName === "shopId" && String(p.parameterValue) === shopId.value)));
const updateJobStatus = computed(() => {
  if(!updateJob.value) {return translate("Not configured");}

  return updateJob.value.paused === "Y" ? translate("Paused") : translate("Active");
});
const updateJobBadgeColor = computed(() => {
  if(!updateJob.value) {return "medium";}

  return updateJob.value.paused === "Y" ? "warning" : "success";
});
const updateJobNextRun = computed(() => updateJob.value?.nextExecutionDateTime);

const {
  start: startSyncDomains,
  stop: stopSyncDomains,
  error: transferSyncError,
  domainStatus,
  syncNow,
} = useCacheSync();
const viewSyncBaselineAt = ref(0);

const monitoringLoaded = computed(() => isTransferSyncMonitoringLoaded({
  cacheHydrated: hydrated.value,
  cachedRowCount: allRows.value.length,
  liveSyncAt: Number(domainStatus.value.shopifyTransferSync?.at ?? 0),
  viewSyncBaselineAt: viewSyncBaselineAt.value,
}));

function activeSyncDomains() {
  return shopId.value
    ? [{ name: "shopifyTransferSync", args: { shopId: shopId.value, total: 300 } }]
    : [];
}

function startTransferSyncDomains() {
  // Ionic retains this component between visits. Use the last completed pass as this visit's
  // baseline so an old sync-end cannot authorize a new cold empty state.
  viewSyncBaselineAt.value = Number(domainStatus.value.shopifyTransferSync?.at ?? 0);
  void startSyncDomains(activeSyncDomains());
}

async function retry() {
  retrying.value = true;
  try {
    await syncNow();
  } finally {
    retrying.value = false;
  }
}

function openDetail(row: any) {
  router.push(`/shopify-connection-details/${props.id}/transfer-sync/${row.orderId}`);
}

watch(shopId, startTransferSyncDomains);
onIonViewWillEnter(startTransferSyncDomains);
onIonViewDidLeave(() => { stopSyncDomains(); });
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--spacer-base);
  margin-block-end: var(--spacer-base);
}

.kpi-grid ion-card {
  margin: 0;
}

.count-skeleton {
  width: var(--spacer-3xl);
}

.filter-card {
  margin-block-end: var(--spacer-base);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacer-lg);
  align-items: center;
}

.filter-item {
  display: flex;
  align-items: center;
  min-width: 0;
}

.filter-item ion-select {
  flex: 1;
  min-width: 0;
}

.date-filter-item {
  width: 100%;
}

.fatal-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacer-sm);
  text-align: center;
  padding: var(--spacer-2xl);
}

.stale-banner ion-card-content {
  display: flex;
  align-items: center;
  gap: var(--spacer-sm);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacer-sm);
  text-align: center;
  padding: var(--spacer-2xl);
}

.overline {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ion-color-medium);
}

.last-activity {
  max-width: 50%;
}
</style>
