<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("AWS") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="isLoading" :aria-label="translate('Refresh queues')" data-testid="refresh-queues" @click="refresh">
            <ion-spinner v-if="isLoading && hasLoaded" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list v-if="!hasLoaded" inset>
        <ion-item v-for="item in 3" :key="item">
          <ion-label>
            <h2><ion-skeleton-text animated /></h2>
            <p><ion-skeleton-text animated /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-card v-else-if="loadError" color="light" role="alert">
        <ion-card-header>
          <ion-card-title>{{ translate("SQS queues could not load") }}</ion-card-title>
          <ion-card-subtitle>{{ loadError }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-button fill="outline" :disabled="isLoading" @click="refresh">
            {{ translate("Retry") }}
          </ion-button>
        </ion-card-content>
      </ion-card>

      <ion-card v-else-if="!queues.length">
        <ion-card-header>
          <ion-card-title>{{ translate("No SQS consumer jobs") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ translate("The real-time Shopify order and product-delete syncs read from Amazon SQS queues. Give a consumer job a queue name and an AWS remote, and its queue appears here.") }}</p>
        </ion-card-content>
      </ion-card>

      <template v-else>
        <ion-card v-for="queue in queues" :key="queue.jobName" :data-testid="`sqs-queue-${queue.jobName}`">
          <ion-card-header>
            <ion-card-title>{{ queue.queueName || translate("Queue not configured") }}</ion-card-title>
            <ion-card-subtitle>{{ queue.description || queue.jobName }}</ion-card-subtitle>
          </ion-card-header>
          <ion-list lines="full">
            <ion-item>
              <ion-label>
                {{ translate("Consumer job") }}
                <p>{{ queue.jobName }}</p>
              </ion-label>
              <ion-badge slot="end" :color="queue.paused ? 'warning' : 'success'">
                {{ queue.paused ? translate("Paused") : translate("Active") }}
              </ion-badge>
            </ion-item>
            <ion-item>
              <ion-label class="ion-text-wrap">
                {{ translate("AWS remote") }}
                <p>{{ queue.remoteSendUrl || queue.remoteDescription }}</p>
              </ion-label>
              <ion-note slot="end">
                {{ queue.systemMessageRemoteId || translate("Not set") }}
              </ion-note>
            </ion-item>

            <ion-item v-if="!queue.configured" lines="none">
              <ion-label class="ion-text-wrap">
                <p>{{ translate("Set the queueName and systemMessageRemoteId parameters on this job to read its queue.") }}</p>
              </ion-label>
            </ion-item>
            <ion-item v-else-if="queue.error" lines="none" role="alert">
              <ion-label class="ion-text-wrap">
                {{ translate("Queue could not be read") }}
                <p>{{ queue.error }}</p>
              </ion-label>
            </ion-item>
            <template v-else>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ translate("Delivery delay") }}
                  <p>{{ translate("New messages stay hidden this long before the job can read them.") }}</p>
                </ion-label>
                <ion-note slot="end">
                  {{ formatSeconds(queue.delaySeconds) }}
                </ion-note>
                <ion-button
                  slot="end"
                  fill="clear"
                  :disabled="savingJobName === queue.jobName"
                  :aria-label="translate('Edit delivery delay')"
                  :data-testid="`edit-delay-${queue.jobName}`"
                  @click="editDelay(queue)"
                >
                  <ion-spinner v-if="savingJobName === queue.jobName" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="pencilOutline" />
                </ion-button>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Visibility timeout") }}</ion-label>
                <ion-note slot="end">
                  {{ formatSeconds(queue.visibilityTimeout) }}
                </ion-note>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Message retention") }}</ion-label>
                <ion-note slot="end">
                  {{ formatSeconds(queue.messageRetentionPeriod) }}
                </ion-note>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ translate("Messages") }}
                  <p>
                    {{ translate("{available} available, {inFlight} in flight, {delayed} delayed", {
                      available: queue.approximateNumberOfMessages ?? 0,
                      inFlight: queue.approximateNumberOfMessagesNotVisible ?? 0,
                      delayed: queue.approximateNumberOfMessagesDelayed ?? 0,
                    }) }}
                  </p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ translate("Dead-letter queue") }}
                  <p v-if="queue.maxReceiveCount">
                    {{ translate("After {count} receives, to {target}", { count: queue.maxReceiveCount, target: queueNameFromArn(queue.deadLetterTargetArn) }) }}
                  </p>
                  <p v-else>
                    {{ translate("None") }}
                  </p>
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label>{{ translate("Queue type") }}</ion-label>
                <ion-note slot="end">
                  {{ queue.fifoQueue ? translate("FIFO") : translate("Standard") }}
                </ion-note>
              </ion-item>
            </template>
          </ion-list>
        </ion-card>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import {
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
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSkeletonText,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter,
} from "@ionic/vue";
import { pencilOutline, refreshOutline } from "ionicons/icons";
import { ref } from "vue";
import { useAws } from "@/composables/useAws";
import { getResponseErrorMessage } from "@/utils";
import { MAX_DELAY_SECONDS, type SqsConsumerQueue, formatSeconds, parseDelaySeconds, queueNameFromArn } from "@/utils/sqsQueue";

// Module-level live state: the queues are AWS-side facts, refreshed on every visit.
const { queues, isLoading, hasLoaded, loadError, fetchSqsConsumerQueues, updateSqsQueueDelay } = useAws();
const savingJobName = ref("");

onIonViewWillEnter(() => {
  void fetchSqsConsumerQueues();
});

async function refresh() {
  await fetchSqsConsumerQueues();
}

async function editDelay(queue: SqsConsumerQueue) {
  const alert = await alertController.create({
    header: translate("Delivery delay"),
    message: translate("Seconds a new message waits in {queue} before the consumer can read it. AWS allows 0 to 900. Messages already in a standard queue keep their old delay.", { queue: queue.queueName }),
    inputs: [
      {
        name: "delaySeconds",
        type: "number",
        min: 0,
        max: MAX_DELAY_SECONDS,
        value: String(queue.delaySeconds ?? 0),
      },
    ],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Save"),
        handler: (data: { delaySeconds?: unknown }) => {
          const delaySeconds = parseDelaySeconds(data?.delaySeconds);
          if(delaySeconds === null) {
            commonUtil.showToast(translate("Enter a whole number of seconds from 0 to 900."));

            return false;
          }
          void saveDelay(queue, delaySeconds);

          return true;
        },
      },
    ],
  });
  await alert.present();
}

async function saveDelay(queue: SqsConsumerQueue, delaySeconds: number) {
  if(!queue.systemMessageRemoteId || !queue.queueName) {return;}
  savingJobName.value = queue.jobName;
  try {
    await updateSqsQueueDelay({ systemMessageRemoteId: queue.systemMessageRemoteId, queueName: queue.queueName }, delaySeconds);
    commonUtil.showToast(translate("Delivery delay set to {seconds} seconds.", { seconds: delaySeconds }));
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(getResponseErrorMessage(error, translate("Failed to update the delivery delay.")));
  } finally {
    savingJobName.value = "";
  }
}
</script>
