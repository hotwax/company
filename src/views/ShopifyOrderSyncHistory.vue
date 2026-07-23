<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/shopify-connection-details/${id}/order-sync`" />
        </ion-buttons>
        <ion-title>{{ translate("Order import history") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            fill="clear"
            :disabled="isLoading"
            :aria-label="translate('Refresh order import history')"
            @click="loadHistory"
          >
            <ion-spinner v-if="isLoading" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card v-if="isLoading">
        <ion-card-header>
          <ion-card-title>{{ translate("Loading order import history") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content><ion-spinner name="crescent" /></ion-card-content>
      </ion-card>

      <ion-card v-else-if="loadError">
        <ion-card-header>
          <ion-card-title>{{ translate("Order import history could not load") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ loadError }}</p>
          <ion-button fill="outline" @click="loadHistory">{{ translate("Retry") }}</ion-button>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <ion-list lines="full">
          <ion-list-header>
            <ion-label>
              {{ translate("MDM logs linked to this Shopify instance") }}
              <p>{{ shopName }}</p>
            </ion-label>
          </ion-list-header>
          <ion-item v-for="batch in batches" :key="batch.systemMessageId">
            <ion-label>
              {{ translate("Shopify order batch") }}
              <p>{{ translate("SystemMessage") }} · {{ batch.systemMessageId }}</p>
              <p>{{ translate("Requested") }} · {{ formatDate(batch.initDate) }}</p>
            </ion-label>
            <ion-badge slot="end" :color="batchColor(batch.statusId)">{{ statusLabel(batch.statusId) }}</ion-badge>
          </ion-item>
          <ion-item v-if="!batches.length">
            <ion-label>{{ translate("No order sync history found") }}</ion-label>
          </ion-item>
        </ion-list>

        <ion-card v-for="batch in batches" :key="`${batch.systemMessageId}-imports`">
          <ion-card-header>
            <ion-card-title>{{ batch.systemMessageId }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Order imports") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item v-for="log in importsFor(batch.systemMessageId)" :key="log.logId">
              <ion-label>
                {{ importLabel(log.configId) }}
                <p>{{ log.logId }}</p>
                <p>{{ log.totalRecordCount }} {{ translate("records") }} · {{ log.successRecordCount }} {{ translate("successful") }} · {{ log.failedRecordCount }} {{ translate("failed") }}</p>
              </ion-label>
              <ion-badge slot="end" :color="statusColor(log.statusId)">{{ statusLabel(log.statusId, log.failedRecordCount) }}</ion-badge>
              <ion-button slot="end" fill="clear" @click="openMdmLogDetails(log)">
                {{ translate("View MDM log") }}
              </ion-button>
            </ion-item>
            <ion-item v-if="!importsFor(batch.systemMessageId).length">
              <ion-label>{{ translate("No MDM import was required for this batch") }}</ion-label>
            </ion-item>
          </ion-list>
        </ion-card>
      </template>
    </ion-content>
    <ShopifyOrderSyncMdmLogModal
      :is-open="showMdmLogModal"
      :log-id="selectedMdmLog?.logId || ''"
      :details="selectedMdmLogDetails"
      @close="closeMdmLogDetails"
    />
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonCardSubtitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonListHeader, IonPage, IonSpinner, IonTitle, IonToolbar, onIonViewWillEnter
} from "@ionic/vue";
import { translate } from "@common";
import { computed, ref } from "vue";
import { refreshOutline } from "ionicons/icons";
import { formatDateTime } from "@/utils";
import { useShopifyOrderSyncStore, type ShopifyOrderSyncBatch, type ShopifyOrderSyncImport } from "@/store/shopifyOrderSync";
import ShopifyOrderSyncMdmLogModal from "@/components/ShopifyOrderSyncMdmLogModal.vue";

const props = defineProps<{ id: string }>();
const orderSyncStore = useShopifyOrderSyncStore();
const isLoading = ref(true);
const loadError = ref("");
const batches = ref<ShopifyOrderSyncBatch[]>([]);
const importsBySystemMessageId = ref<Record<string, ShopifyOrderSyncImport[]>>({});
const showMdmLogModal = ref(false);
const selectedMdmLog = ref<ShopifyOrderSyncImport | null>(null);
const shopName = computed(() => orderSyncStore.shop?.name || translate("Shopify instance {id}", { id: props.id }));
const selectedMdmLogDetails = computed(() => selectedMdmLog.value ? {
  statusId: selectedMdmLog.value.statusId,
  configId: selectedMdmLog.value.configId,
  systemMessageId: selectedMdmLog.value.systemMessageId,
  startedAt: selectedMdmLog.value.createdDate,
  completedAt: selectedMdmLog.value.finishDateTime,
  totalRecordCount: selectedMdmLog.value.totalRecordCount,
  successRecordCount: selectedMdmLog.value.successRecordCount,
  failedRecordCount: selectedMdmLog.value.failedRecordCount,
} : {});

onIonViewWillEnter(loadHistory);

async function loadHistory() {
  isLoading.value = true;
  loadError.value = "";
  try {
    const result = await orderSyncStore.loadHistory(props.id);
    batches.value = result?.batches || [];
    importsBySystemMessageId.value = result?.importsBySystemMessageId || {};
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : translate("Order import history could not load.");
  } finally {
    isLoading.value = false;
  }
}

function importsFor(systemMessageId: string): ShopifyOrderSyncImport[] {
  return importsBySystemMessageId.value[systemMessageId] || [];
}

function formatDate(value: unknown): string {
  return formatDateTime(value) || translate("Not available");
}

function importLabel(configId: string): string {
  return configId === "SYNC_SHOPIFY_ORDER" ? translate("New order import") : translate("Updated order import");
}

function statusLabel(status: unknown, failed = 0): string {
  const value = String(status || "").toLowerCase();
  if (failed > 0 || value.includes("error") || value.includes("fail")) return translate("Failed");
  if (value.includes("complete") || value.includes("success") || value.includes("finish") || value.includes("confirm")) return translate("Completed");
  if (value.includes("run") || value.includes("process") || value.includes("active")) return translate("In progress");
  return status ? String(status) : translate("Not available");
}

function statusColor(status: unknown, failed = 0): string {
  return statusLabel(status, failed) === translate("Failed") ? "danger" : statusLabel(status, failed) === translate("Completed") ? "success" : "primary";
}

function batchColor(status: unknown): string {
  return statusColor(status);
}

function openMdmLogDetails(log: ShopifyOrderSyncImport) {
  selectedMdmLog.value = log;
  showMdmLogModal.value = true;
}

function closeMdmLogDetails() {
  showMdmLogModal.value = false;
  selectedMdmLog.value = null;
}
</script>
