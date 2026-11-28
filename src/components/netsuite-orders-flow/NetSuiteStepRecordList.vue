<template>
  <ion-card :data-testid="`netsuite-${step}-${list}-list`">
    <ion-card-header>
      <ion-card-title>
        <ion-skeleton-text v-if="isLoading" animated class="count-skeleton" />
        <template v-else-if="recordCount == null">{{ translate("No go-live date") }}</template>
        <template v-else>{{ recordCount === 1 ? translate(orderStep.listTitleOne) : translate(orderStep.listTitle, { count: recordCount }) }}</template>
      </ion-card-title>
      <ion-card-subtitle>{{ translate(orderStep.listMeanings[list] ?? "") }}</ion-card-subtitle>
    </ion-card-header>
    <ion-card-content v-if="loadError">{{ loadError }}</ion-card-content>
    <ion-list lines="full">
      <ion-item v-if="!isLoading && !records.length" lines="none">
        <ion-label>{{ translate(orderStep.noRecords) }}</ion-label>
      </ion-item>
      <ion-item v-for="record in records" :key="record.recordId">
        <ion-label>
          {{ record.recordName || record.recordId }}
          <p v-if="record.recordName">{{ record.recordId }}</p>
          <p v-if="record.recordDetail">{{ record.recordDetail }}</p>
          <p v-if="record.recordDate">{{ translate(orderStep.recordDateLabel) }}: {{ commonUtil.getDateAndTime(record.recordDate) }}</p>
          <p v-if="record.systemMessageId">
            {{ translate("Batch {systemMessageId}, sent {sentDate}", { systemMessageId: record.systemMessageId, sentDate: commonUtil.getDateAndTime(record.batchInitDate) }) }}
          </p>
        </ion-label>
      </ion-item>
    </ion-list>
    <ion-button v-if="!isLoading && recordCount != null && records.length < recordCount" fill="clear" expand="block" @click="emit('loadMore')">
      {{ translate("Load more") }}
    </ion-button>
  </ion-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonItem, IonLabel, IonList, IonSkeletonText } from "@ionic/vue";
import { commonUtil, translate } from "@common";
import { useNetSuiteStepList } from "@/composables/useNetSuiteStepLists";
import { NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";

const props = defineProps<{ productStoreId: string; step: string; list: string }>();
const emit = defineEmits<{ loadMore: [] }>();

const orderStep = computed(() => NETSUITE_ORDER_STEPS[props.step]);

const { loadError, isLoading, recordCount, records } = useNetSuiteStepList(() => props.productStoreId, () => props.step, () => props.list);
</script>

<style scoped>
.count-skeleton {
  width: 12rem;
}
</style>
