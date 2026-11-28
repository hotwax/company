<template>
  <div>
    <ion-card v-if="loadError" :data-testid="`netsuite-${step}-failures-error`">
      <ion-card-content>{{ loadError }}</ion-card-content>
    </ion-card>

    <ion-card v-if="errorGroups.length" :data-testid="`netsuite-${step}-error-groups`">
      <ion-card-header>
        <ion-card-title>{{ translate("Most common errors") }}</ion-card-title>
      </ion-card-header>
      <ion-list lines="full">
        <ion-item v-if="selectedErrorMessage" button @click="selectError('')">
          <ion-label>{{ translate("Show all errors") }}</ion-label>
        </ion-item>
        <ion-item
          v-for="errorGroup in errorGroups"
          :key="errorGroup.errorMessage"
          button
          :color="errorGroup.errorMessage === selectedErrorMessage ? 'light' : undefined"
          @click="selectError(errorGroup.errorMessage)"
        >
          <ion-badge slot="start" color="danger">{{ errorGroup.recordCount }}</ion-badge>
          <ion-label class="ion-text-wrap error-text">{{ errorGroup.errorMessage }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-card>

    <ion-card :data-testid="`netsuite-${step}-failures`">
      <ion-card-header>
        <ion-card-title>
          <ion-skeleton-text v-if="isLoading" animated class="count-skeleton" />
          <template v-else>{{ failureCount === 1 ? translate(orderStep.failedTitleOne) : translate(orderStep.failedTitle, { count: failureCount }) }}</template>
        </ion-card-title>
      </ion-card-header>
      <ion-button
        v-if="selectedErrorMessage && !isLoading && failureCount && !orderStep.isResentByJob"
        class="ion-margin-horizontal"
        :data-testid="`netsuite-${step}-send-group-again`"
        @click="confirmSendAgain({ errorMessage: selectedErrorMessage }, failureCount)"
      >
        {{ translate("Send again ({count})", { count: failureCount }) }}
      </ion-button>
      <ion-card-content v-if="orderStep.isResentByJob">{{ translate("The job sends these again on every run.") }}</ion-card-content>
      <ion-list lines="full">
        <ion-item v-if="!isLoading && !failures.length" lines="none">
          <ion-label>{{ translate(orderStep.noFailures) }}</ion-label>
        </ion-item>
        <ion-item v-for="failure in failures" :key="failure.recordId" button detail @click="openFailure(failure)">
          <ion-label>
            {{ failure.recordName || failure.recordId }}
            <p v-if="failure.recordDetail">{{ failure.recordDetail }}</p>
            <p v-if="failure.claimedDate">{{ translate("Sent") }}: {{ commonUtil.getDateAndTime(failure.claimedDate) }}</p>
            <p v-else-if="failure.recordDate">{{ translate(orderStep.recordDateLabel) }}: {{ commonUtil.getDateAndTime(failure.recordDate) }}</p>
            <p v-if="failure.attemptCount != null">{{ describeStepTries(failure) }}</p>
            <p class="error-text">{{ failure.errorMessage || translate(orderStep.failureReason ?? "") }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <ion-button v-if="!isLoading && failures.length < failureCount" fill="clear" expand="block" @click="loadMore()">
        {{ translate("Load more") }}
      </ion-button>
    </ion-card>

    <NetSuiteStepFailureModal
      :failure="openedFailure"
      :step="step"
      @close="openedFailure = undefined"
      @send-again="(failure) => confirmSendAgain({ recordIds: [failure.recordId] }, 1)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList, IonSkeletonText, alertController,
} from "@ionic/vue";
import { commonUtil, logger, translate } from "@common";
import { useNetSuiteStepFailures } from "@/composables/useNetSuiteStepLists";
import { NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";
import { describeStepTries } from "@/utils/netSuiteStepTries";
import NetSuiteStepFailureModal from "@/components/netsuite-orders-flow/NetSuiteStepFailureModal.vue";

const props = defineProps<{ productStoreId: string; step: string; selectedErrorMessage: string }>();
const emit = defineEmits<{ selectError: [errorMessage: string]; loadMore: [] }>();

const openedFailure = ref<any>();

const orderStep = computed(() => NETSUITE_ORDER_STEPS[props.step]);

const { loadError, isLoading, failureCount, failures, errorGroups, sendAgain } = useNetSuiteStepFailures(
  () => props.productStoreId,
  () => props.step,
  () => props.selectedErrorMessage,
);

const selectError = (errorMessage: string) => emit("selectError", errorMessage);
const loadMore = () => emit("loadMore");

const openFailure = (failure: any) => {
  openedFailure.value = failure;
};

const confirmSendAgain = async (records: { recordIds?: string[]; errorMessage?: string }, recordCount: number) => {
  const alert = await alertController.create({
    header: translate("Send again"),
    message: recordCount === 1
      ? translate(orderStep.value.sendOneQuestion ?? "")
      : translate(orderStep.value.sendManyQuestion ?? "", { count: recordCount }),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Send again"), role: "confirm" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== "confirm") return;

  try {
    const releasedCount = await sendAgain(records);
    openedFailure.value = undefined;
    if (records.errorMessage) selectError("");
    commonUtil.showToast(releasedCount === 1
      ? translate(orderStep.value.sentOneMessage ?? "")
      : translate(orderStep.value.sentManyMessage ?? "", { count: releasedCount }));
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Could not send them again.")} ${commonUtil.getErrorMessage(error)}`);
  }
};
</script>

<style scoped>
.error-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.count-skeleton {
  width: 12rem;
}
</style>
