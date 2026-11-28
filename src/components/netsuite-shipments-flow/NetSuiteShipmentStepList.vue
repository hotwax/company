<template>
  <div>
    <ion-card v-if="loadError" :data-testid="`netsuite-shipments-${step}-${list}-error`">
      <ion-card-content>{{ loadError }}</ion-card-content>
    </ion-card>

    <ion-card v-if="showsLedger" :data-testid="`netsuite-shipments-${step}-${list}-ledger`">
      <ion-card-header>
        <ion-card-title>
          <ion-skeleton-text v-if="isLoading" animated class="count-skeleton" />
          <template v-else>{{ stepList?.ledgerRowCount === 1 ? translate("1 shipment") : translate("{count} shipments", { count: stepList?.ledgerRowCount ?? 0 }) }}</template>
        </ion-card-title>
        <ion-card-subtitle>{{ translate(shipmentStep.listMeanings[list]) }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item v-if="!isLoading && !stepList?.ledgerRows.length" lines="none">
          <ion-label>{{ translate("No shipments") }}</ion-label>
        </ion-item>
        <ion-item v-for="ledgerRow in stepList?.ledgerRows ?? []" :key="ledgerRow.netsuiteFulfillmentId">
          <ion-label class="ion-text-wrap">
            {{ ledgerRow.fulfillmentNumber || ledgerRow.netsuiteFulfillmentId }}
            <p>{{ translate("Order {order} · NetSuite order {netsuiteOrderId}", { order: ledgerRow.orderName || ledgerRow.orderId || "-", netsuiteOrderId: ledgerRow.netsuiteOrderId || "-" }) }}</p>
            <p>{{ translate("Read") }}: {{ commonUtil.getDateAndTime(ledgerRow.receivedDate) }}</p>
            <p v-if="ledgerRow.packageReadCount">{{ translate("Box reads with no box: {count}", { count: ledgerRow.packageReadCount }) }}</p>
            <p v-if="ledgerRow.attemptCount">{{ translate("Tries: {count}, last {date}", { count: ledgerRow.attemptCount, date: commonUtil.getDateAndTime(ledgerRow.lastAttemptDate) }) }}</p>
            <p v-if="ledgerRow.errorMessage"><ion-text color="danger">{{ ledgerRow.errorMessage }}</ion-text></p>
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-button v-if="!isLoading && (stepList?.ledgerRows.length ?? 0) < (stepList?.ledgerRowCount ?? 0)" fill="clear" expand="block" @click="emit('loadMore')">
        {{ translate("Load more") }}
      </ion-button>
    </ion-card>

    <ion-card v-if="showsFiles" :data-testid="`netsuite-shipments-${step}-${list}-files`">
      <ion-card-header>
        <ion-card-title>
          <ion-skeleton-text v-if="isLoading" animated class="count-skeleton" />
          <template v-else-if="list === 'failed'">{{ stepList?.failedRecordCount === 1 ? translate("1 failed record") : translate("{count} failed records", { count: stepList?.failedRecordCount ?? 0 }) }}</template>
          <template v-else>{{ stepList?.fileCount === 1 ? translate("1 file") : translate("{count} files", { count: stepList?.fileCount ?? 0 }) }}</template>
        </ion-card-title>
        <ion-card-subtitle>{{ translate(list === "failed" && showsLedger ? FILES_FAILED_MEANING : shipmentStep.listMeanings[list]) }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item v-if="!isLoading && !stepList?.files.length" lines="none">
          <ion-label>{{ translate("No files") }}</ion-label>
        </ion-item>
        <ion-item v-for="file in stepList?.files ?? []" :key="file.logId">
          <ion-label class="ion-text-wrap">
            {{ translate("File {logId}", { logId: file.logId }) }}
            <p>{{ translate("Made") }}: {{ commonUtil.getDateAndTime(file.createdDate) }}</p>
            <p>{{ translate(DATA_MANAGER_STATUS_LABELS[file.statusId] ?? file.statusId) }}<template v-if="file.finishDateTime"> · {{ commonUtil.getDateAndTime(file.finishDateTime) }}</template></p>
            <p v-if="file.failedRecordCount"><ion-text color="danger">{{ translate("{failed} of {total} records failed", { failed: file.failedRecordCount, total: file.totalRecordCount ?? "-" }) }}</ion-text></p>
          </ion-label>
          <ion-button
            v-if="file.failedRecordCount"
            slot="end"
            fill="clear"
            :title="translate('Download failed records')"
            :aria-label="translate('Download failed records')"
            :data-testid="`netsuite-shipments-file-errors-${file.logId}`"
            @click="downloadFailedRecords(file)"
          >
            <ion-icon slot="icon-only" :icon="downloadOutline" />
          </ion-button>
        </ion-item>
      </ion-list>
      <ion-button v-if="!isLoading && (stepList?.files.length ?? 0) < (stepList?.fileCount ?? 0)" fill="clear" expand="block" @click="emit('loadMore')">
        {{ translate("Load more") }}
      </ion-button>
    </ion-card>

    <ion-card v-if="showsOrders" :data-testid="`netsuite-shipments-${step}-${list}-orders`">
      <ion-card-header>
        <ion-card-title>
          <ion-skeleton-text v-if="isLoading" animated class="count-skeleton" />
          <template v-else>{{ stepList?.orderCount === 1 ? translate("1 order") : translate("{count} orders", { count: stepList?.orderCount ?? 0 }) }}</template>
        </ion-card-title>
        <ion-card-subtitle>{{ translate(shipmentStep.listMeanings[list], { hours: stepList?.minAgeHours ?? 6 }) }}</ion-card-subtitle>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item v-if="!isLoading && !stepList?.orders.length" lines="none">
          <ion-label>{{ translate("No orders") }}</ion-label>
        </ion-item>
        <ion-item v-for="order in stepList?.orders ?? []" :key="order.orderId">
          <ion-label class="ion-text-wrap">
            {{ order.orderName || order.orderId }}
            <p v-if="order.orderName">{{ order.orderId }}</p>
            <p>{{ translate("NetSuite order {netsuiteOrderId}", { netsuiteOrderId: order.netsuiteOrderId }) }}</p>
            <p>{{ translate("Sent to NetSuite") }}: {{ commonUtil.getDateAndTime(order.sentDate) }}</p>
            <p>{{ order.openItemCount === 1 ? translate("1 open item") : translate("{count} open items", { count: order.openItemCount }) }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-button v-if="!isLoading && (stepList?.orders.length ?? 0) < (stepList?.orderCount ?? 0)" fill="clear" expand="block" @click="emit('loadMore')">
        {{ translate("Load more") }}
      </ion-button>
    </ion-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonItem, IonLabel, IonList, IonSkeletonText, IonText } from "@ionic/vue";
import { downloadOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { downloadFileFailedRecords, useNetSuiteShipmentStepList } from "@/composables/useNetSuiteShipmentsFlow";
import { DATA_MANAGER_STATUS_LABELS, NETSUITE_SHIPMENT_STEPS } from "@/config/netSuiteShipmentSteps";

const props = defineProps<{ productStoreId: string; step: string; list: string }>();
const emit = defineEmits<{ loadMore: [] }>();

const FILES_FAILED_MEANING = "Files this step made in the last 7 days with records the OMS could not save. Newest first.";

const shipmentStep = computed(() => NETSUITE_SHIPMENT_STEPS[props.step]);
const { loadError, stepList, isLoading } = useNetSuiteShipmentStepList(() => props.productStoreId, () => props.step, () => props.list);

const readsLedger = computed(() => ["boxes", "shipments"].includes(props.step));
const readsStore = computed(() => ["sweep", "closed-lines"].includes(props.step));
const showsLedger = computed(() => readsLedger.value && props.list !== "stuck");
const showsFiles = computed(() => props.list === "stuck" || (props.list === "failed" && props.step !== "shipments"));
const showsOrders = computed(() => readsStore.value && props.list === "waiting");

async function downloadFailedRecords(file: any) {
  try {
    await downloadFileFailedRecords(file);
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Could not download the failed records.")} ${commonUtil.getErrorMessage(error)}`);
  }
}
</script>

<style scoped>
.count-skeleton {
  width: 12rem;
}
</style>
