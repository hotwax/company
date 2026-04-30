<template>
  <section class="sync-summary">
    <ion-card class="summary">
      <ion-card-header>
        <ion-card-title>{{ translate("Summary") }}</ion-card-title>
        <ion-card-subtitle>{{ summarySubtitle }}</ion-card-subtitle>
        <ion-buttons>
          <ion-button fill="clear" :disabled="!syncJobObj" @click="emit('run-job', syncJobObj)">

            <ion-icon slot="icon-only" :icon="flashOutline" />
          </ion-button>


          <ion-button fill="clear" @click="openActionsPopover($event)">
            <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
          </ion-button>

        </ion-buttons>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item>
          <ion-label>
            {{ translate("Last sync") }}
            <p>{{ lastSyncLabel }}</p>
          </ion-label>
          <ion-label slot="end">{{ lastSyncRelativeLabel }}</ion-label>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Updates synced") }}</ion-label>
          <ion-label slot="end">{{ 40 }}</ion-label>
        </ion-item>
        <ion-item button :detail="isSyncScheduled" @click="isSyncScheduled ? emit('open-sync-job-details') : undefined">
          <ion-label>{{ translate("Next sync time") }}
            <p v-if="isSyncScheduled">{{ nextSyncLabel }}</p>
          </ion-label>
          <ion-badge slot="end" color="warning" v-if="isSyncPaused">{{ translate("Paused") }}</ion-badge>
          <ion-label slot="end" v-else-if="isSyncScheduled">{{ nextSyncRelativeLabel }}</ion-label>
          <ion-button slot="end" fill="outline" color="primary" v-else @click.stop="openScheduleModal()">{{ translate("Schedule") }}</ion-button>
        </ion-item>
        <ion-item button detail @click="emit('open-unsynced-updates')">
          <ion-label>{{ translate("Un-synced updates") }}</ion-label>
          <ion-badge slot="end" color="medium">{{ unsyncedUpdatesCount }}</ion-badge>
        </ion-item>
        <ion-item>
          <ion-label>{{ translate("Product store") }}</ion-label>
          <ion-note slot="end">{{ selectedProductStoreName }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-card>

    <ion-card class="progress">
      <ion-card-header>
        <ion-card-title>{{ translate("Track sync progress") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Monitor each step as products get imported from Shopify") }}</ion-card-subtitle>
        <ion-buttons>
          <ion-button fill="clear" @click="emit('open-history')">
            <ion-icon slot="icon-only" :icon="timeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-card-header>
      <ion-list lines="full">
        <template v-if="currentSyncRun && currentSyncRun.systemMessageId">
          <ion-item button detail @click="emit('open-step-details', { type: 'systemMessage', id: currentSyncRun.systemMessageId })">
            <ion-label>
              {{ translate("System message") }}
              <p>{{ currentSyncRun.systemMessageId }}</p>
              <p>{{ translate("Next send attempt") }}: {{ systemMessageSendJobNextRunLabel }}</p>
            </ion-label>
            <ion-badge slot="end" :color="currentSyncRun.systemMessage.statusColor">{{ currentSyncRun.systemMessage.statusLabel }}</ion-badge>
          </ion-item>
          <ion-item button detail @click="emit('open-step-details', { type: 'bulkOperation', id: currentSyncRun.bulkOperation.id })" :disabled="!currentSyncRun.bulkOperation?.id">
            <ion-label>
              {{ translate("Shopify bulk operation") }}
              <p>{{ currentSyncRun.bulkOperation?.id || translate("Not started") }}</p>
              <p>{{ translate("Next poll attempt") }}: {{ bulkOperationPollJobNextRunLabel }}</p>
            </ion-label>
            <ion-note slot="end" v-if="currentSyncRun.bulkOperation?.objectCount">
              {{ currentSyncRun.bulkOperation.objectCount }} {{ translate("objects") }}
            </ion-note>
            <ion-badge slot="end" :color="currentSyncRun.bulkOperation?.statusColor || 'medium'">{{ currentSyncRun.bulkOperation?.statusLabel || translate("Pending") }}</ion-badge>
          </ion-item>
          <ion-item button detail @click="emit('open-step-details', { type: 'mdmLog', id: currentSyncRun.mdmLog.id })" :disabled="!currentSyncRun.mdmLog?.id">
            <ion-label>
              {{ translate("HotWax bulk import") }}
              <p>{{ currentSyncRun.mdmLog?.id || translate("Not started") }}</p>
            </ion-label>
            <ion-note slot="end" v-if="currentSyncRun.mdmLog?.totalRecordCount">
              {{ currentSyncRun.mdmLog.totalRecordCount }} {{ translate("records") }}
            </ion-note>
            <ion-badge slot="end" :color="currentSyncRun.mdmLog?.statusColor || 'medium'">{{ currentSyncRun.mdmLog?.statusLabel || translate("Pending") }}</ion-badge>
          </ion-item>
        </template>
        <ion-item v-else>
          <ion-label>{{ translate("No recent sync history, run your sync now to fetch latest updates") }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-card>
  </section>

  <section class="sync-monitor">
    <ion-item lines="none">
      <ion-label>
        {{ translate("Sync monitor") }}
        <p>{{ translate("Review sync jobs that make the sync operations work") }}</p>
      </ion-label>
    </ion-item>
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ translate("Product sync jobs") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Explain product sync jobs verification") }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list>
        <ion-item button detail :disabled="!syncJobObj" @click="emit('open-sync-job-details', syncJobObj)">
          <ion-label>
            {{ translate("Queue update requests") }}
            <p>{{ queueUpdateRequestsLastRunLabel }}</p>
          </ion-label>
          <ion-icon slot="end" :icon="isSyncPaused ? pauseCircleOutline : checkmarkCircleOutline"></ion-icon>
        </ion-item>
        <ion-item button detail :disabled="!sendUpdateRequestJobObj?.jobName" @click="emit('open-sync-job-details', sendUpdateRequestJobObj)">
          <ion-label>
            {{ translate("Send update request") }}
            <p>{{ sendUpdateRequestLastRunLabel }}</p>
          </ion-label>
          <ion-icon slot="end" :icon="sendUpdateRequestPaused ? pauseCircleOutline : checkmarkCircleOutline"></ion-icon>
        </ion-item>
        <ion-item button detail :disabled="!importCompletedRequestsJobObj?.jobName" @click="emit('open-sync-job-details', importCompletedRequestsJobObj)">
          <ion-label>
            {{ translate("Import completed requests") }}
            <p>{{ importCompletedRequestsLastRunLabel }}</p>
          </ion-label> 
          <ion-icon slot="end" :icon="importCompletedRequestsPaused ? pauseCircleOutline : checkmarkCircleOutline"></ion-icon>
        </ion-item>
      </ion-list>
    </ion-card>
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ translate("Pipeline") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Monitor how the sync pipeline is performing") }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list>
        <ion-item>
          <ion-label>
            {{ translate("Pending update requests")}} 
            <p>{{ pendingUpdateRequestsSubtitle }}</p>
          </ion-label>
          <ion-label slot="end">{{ pendingUpdateRequestsCount }}</ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Current Shopify request status")}} 
            <p>{{ currentShopifyRequestSubtitle }}</p>
          </ion-label>
          <ion-badge v-if="hasCurrentShopifyRequest" slot="end" :color="currentShopifyRequestStatusColor">{{ currentShopifyRequestStatusLabel }}</ion-badge>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Update files to process")}}
          </ion-label>
          <ion-label slot="end">1</ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Error records")}}
            <p>In the last 24 hours</p>
          </ion-label>
          <ion-label slot="end">0</ion-label>
        </ion-item>
      </ion-list>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ translate("Custom request") }}</ion-card-title>
        <ion-card-subtitle>{{ translate("Override the scheduled sync with a custom request") }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list>
        <ion-item detail>
          <ion-label>
            {{ translate("Sync specific products") }}
            <p>{{ translate("Select products to run the product sync for on demand") }}</p>
          </ion-label>
        </ion-item>
        <ion-item detail>
          <ion-label>
            {{ translate("Replay sync from a certain time") }}
            <p>{{ translate("Rewind the last sync time to reimport updates") }}</p>
          </ion-label>
        </ion-item>
        <ion-item detail>
          <ion-label>
            {{ translate("Re-sync entire catalog") }}
            <p>{{ translate("Download the entire product catalog from Shopify again. Use with caution") }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-card>
  </section>

  <section class="sync-stat">
    <div class="stat-header">
      <ion-item class="stat-title" lines="none">
        <ion-label>
          <h2>{{ translate("Recently synced product updates") }}</h2>
          <p>{{ translate("Audit what products were recently updated and what exactly changed in them") }}</p>
        </ion-label>
      </ion-item>
      <ion-searchbar v-model="updatesQuery" :placeholder="translate('Search by internal name')" />
    </div>
    <div class="stat-data">
      <ion-card v-for="item in filteredUpdates" :key="item.id">
        <ion-list lines="full">
          <ion-item>
            <ion-label class="ion-text-wrap">
              <h2>{{ item.internalName }}</h2>
              <p>{{ item.shopifyId }}</p>
            </ion-label>
            <ion-note slot="end">{{ item.updatedTime }}</ion-note>
          </ion-item>

          <ion-card-content v-if="item.details.length">
            <ion-chip v-for="label in getChangeSummary(item.details)" :key="label">
              <ion-label>{{ label }}</ion-label>
            </ion-chip>
          </ion-card-content>

          <ion-accordion-group>
            <ion-accordion :value="item.id">
              <ion-item slot="header">
                <ion-label>
                  {{ translate("Changes") }}
                  <p>{{ translate("Review field-level updates") }}</p>
                </ion-label>
                <ion-badge slot="end" color="medium">{{ item.details.length }}</ion-badge>
              </ion-item>
              <ion-list slot="content" lines="full">
                <ion-item v-for="(detail, index) in item.details" :key="index">
                  <ion-label class="ion-text-wrap">
                    <h3>{{ detail.label }}</h3>
                    <p :class="detail.type === 'added' ? 'ion-text-success' : 'ion-text-danger'">
                      {{ getDetailActionLabel(detail.type) }}
                    </p>
                    <template v-if="detail.items?.length">
                      <p v-for="(detailItem, detailItemIndex) in detail.items" :key="detailItemIndex">
                        <template v-if="detailItem.label">{{ detailItem.label }}: </template>{{ detailItem.value }}
                      </p>
                    </template>
                    <p v-else>{{ detail.value }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </ion-accordion>
          </ion-accordion-group>

          <ion-item v-if="!item.details.length">
            <ion-label>{{ translate("No details found for this update") }}</ion-label>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-card v-if="!filteredUpdates.length">
        <ion-list lines="full">
          <ion-item>
            <ion-label>{{ translate("No recently synced product updates") }}</ion-label>
          </ion-item>
        </ion-list>
      </ion-card>
    </div>
  </section>

  <section class="sync-stat">
    <div class="stat-header">
      <ion-item class="stat-title" lines="none">
        <ion-label>
          <h2>{{ translate("Recent sync errors") }}</h2>
          <p>{{ translate("Audit what products failed to sync recently and retry them") }}</p>
        </ion-label>
      </ion-item>
      <ion-searchbar v-model="errorsQuery" :placeholder="translate('Search by internal name')" />
    </div>
    <div class="stat-data">
      <ion-card v-for="item in filteredErrors" :key="item.id">
      <ion-list lines="full">
        <ion-item>
          <ion-label>
            {{ item.internalName }}
            <p>{{ item.shopifyId }}</p>
          </ion-label>
          <ion-note slot="end">{{ item.updatedTime }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label>{{ item.errorContent }}</ion-label>
        </ion-item>
      </ion-list>
      <ion-card-content>
        <ion-button fill="clear">{{ translate("Retry") }}</ion-button>
        <ion-button fill="clear">{{ translate("Download raw file") }}</ion-button>
      </ion-card-content>
    </ion-card>
    <ion-card v-if="!filteredErrors.length">
      <ion-list lines="full">
        <ion-item>
          <ion-label>
            {{ translate("No recent sync errors") }}
            <p>{{ translate("No error records in the last {count} product update imports.", { count: errorLookbackCount }) }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-card>
    </div>
  </section>

</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonItem,
  IonChip,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar
} from "@ionic/vue";
import { translate } from "@/i18n";
import { computed, defineEmits, defineProps, ref } from "vue";
import { checkmarkCircleOutline, ellipsisVerticalOutline, flashOutline, pauseCircleOutline, timeOutline } from "ionicons/icons";
import { modalController, popoverController } from "@ionic/vue";
import ScheduleModal from "./ScheduleModal.vue";
import ShopifyProductSyncActionsPopover from "./ShopifyProductSyncActionsPopover.vue";
import type { ShopifyProductSyncRun } from "@/services/ShopifyProductSyncService";

const props = defineProps<{

  isSyncScheduled?: boolean
  isSyncPaused?: boolean
  lastSyncLabel: string
  lastSyncRelativeLabel: string
  nextSyncLabel: string
  nextSyncRelativeLabel: string
  systemMessageSendJobNextRunLabel: string
  bulkOperationPollJobNextRunLabel: string
  summarySubtitle: string
  errorLookbackCount: number
  currentSyncRun?: ShopifyProductSyncRun
  recentSyncErrors: Array<{ id: string, internalName: string, shopifyId: string, updatedTime: string, errorContent: string }>
  recentSyncUpdates: Array<{
    id: string,
    internalName: string,
    shopifyId: string,
    updatedTime: string,
    details: Array<{ type: string, label: string, value: string, items?: Array<{ label?: string, value: string }> }>
  }>
  selectedProductStoreName: string
  unsyncedUpdatesCount: number | string
  pendingUpdateRequestsCount: number | string
  pendingUpdateRequestsSubtitle: string
  queueUpdateRequestsLastRunLabel: string
  sendUpdateRequestLastRunLabel: string
  sendUpdateRequestPaused?: boolean
  sendUpdateRequestJobObj?: any
  importCompletedRequestsLastRunLabel: string
  importCompletedRequestsPaused?: boolean
  importCompletedRequestsJobObj?: any
  currentShopifyRequestSubtitle: string
  currentShopifyRequestStatusLabel: string
  currentShopifyRequestStatusColor: string
  hasCurrentShopifyRequest?: boolean
  syncJobObj?: any
}>();
const emit = defineEmits(["open-history", "schedule-sync", "run-job", "open-unsynced-updates", "open-sync-job-details", "open-step-details", "toggle-pause-sync-job"]);



async function openScheduleModal() {
  const scheduleModal = await modalController.create({
    component: ScheduleModal,
    componentProps: { cronExpression: props.syncJobObj?.cronExpression || "0 */15 * ? * *" },
    showBackdrop: true,
    swipeToClose: true
  });
  scheduleModal.onDidDismiss().then((result) => {
    if (result.data && result.data.expression) {
      emit("schedule-sync", result.data.expression);
    }
  });
  await scheduleModal.present();
}

async function openActionsPopover(event: Event) {
  const popover = await popoverController.create({
    component: ShopifyProductSyncActionsPopover,
    componentProps: {
      isPaused: props.isSyncPaused
    },
    event,
    showBackdrop: false
  });
  await popover.present();

  const { data } = await popover.onDidDismiss();
  if (data?.action === 'reschedule') {
    openScheduleModal();
  } else if (data?.action === 'pause') {
    emit("toggle-pause-sync-job", true);
  } else if (data?.action === 'resume') {
    emit("toggle-pause-sync-job", false);
  }
}



const updatesQuery = ref("");
const errorsQuery = ref("");
const visibleChangeSummaryCount = 4;

function getDetailActionLabel(type: string) {
  return type === "added" ? translate("Added") : translate("Removed");
}

function getChangeSummary(details: Array<{ label: string }>) {
  const labels = [...new Set(details.map((detail) => detail.label).filter(Boolean))];
  if (labels.length <= visibleChangeSummaryCount) return labels;
  return [
    ...labels.slice(0, visibleChangeSummaryCount),
    `+${labels.length - visibleChangeSummaryCount} more`
  ];
}

const filteredUpdates = computed(() => {
  const query = updatesQuery.value.trim().toLowerCase();
  if (!query) return props.recentSyncUpdates;

  return props.recentSyncUpdates.filter((item) => {
    return item.internalName.toLowerCase().includes(query) || item.shopifyId.toLowerCase().includes(query);
  });
});

const filteredErrors = computed(() => {
  const query = errorsQuery.value.trim().toLowerCase();
  if (!query) return props.recentSyncErrors;

  return props.recentSyncErrors.filter((item) => {
    return item.internalName.toLowerCase().includes(query) || item.shopifyId.toLowerCase().includes(query);
  });
});
</script>

<style>
ion-card-header {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "title actions" "subtitle actions";
}

ion-card-title {
  grid-area: title;
}

ion-card-subtitle {
  grid-area: subtitle;
}

ion-buttons {
  grid-area: actions;
}

.sync-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: start;
}

.summary{
  grid-column: 1 / 2;
}

.progress{
  grid-column: -1 / -2;
}

.sync-monitor {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  align-items: start;
}

.sync-monitor ion-item {
  grid-column: 1 / -1;
}

.sync-monitor ion-card {
  flex: 1 0 375px;
}

.stat-header{
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  align-items: center;
}

.stat-title {
  flex: 1 2 375px;
}

.sync-stat ion-searchbar {
  flex: 0 1 375px;
}

.stat-data {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: scroll;
  align-items: start;
}

.stat-data ion-card {
  flex: 0 0 375px;
}
</style>
