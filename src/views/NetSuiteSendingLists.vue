<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/netsuite" />
        </ion-buttons>
        <ion-title>{{ translate("{way} · Sending to NetSuite", { way: translate(sendingWay?.label ?? way) }) }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment :value="list" @ion-change="showList(String($event.detail.value))">
          <ion-segment-button v-for="sendingList in NETSUITE_SENDING_LISTS" :key="sendingList.list" :value="sendingList.list">
            <ion-label>{{ translate(sendingList.label) }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card :data-testid="`netsuite-sending-${way}-${list}-list`">
        <ion-card-header>
          <ion-card-title>
            <ion-skeleton-text v-if="isLoading" animated class="count-skeleton" />
            <template v-else>{{ messageCount === 1 ? translate(sendingList?.titleOne ?? "") : translate(sendingList?.title ?? "", { count: messageCount ?? 0 }) }}</template>
          </ion-card-title>
          <ion-card-subtitle>{{ translate(sendingList?.meaning ?? "") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content v-if="loadError">{{ loadError }}</ion-card-content>
        <ion-list lines="full">
          <ion-item v-if="!isLoading && !messages.length" lines="none">
            <ion-label>{{ translate("No batches") }}</ion-label>
          </ion-item>
          <ion-item v-for="message in messages" :key="message.systemMessageId">
            <ion-label class="ion-text-wrap">
              {{ message.systemMessageTypeId }}
              <p>{{ translate("Batch {systemMessageId}", { systemMessageId: message.systemMessageId }) }}</p>
              <p>{{ translate("Made") }}: {{ commonUtil.getDateAndTime(message.initDate) }}</p>
              <p v-if="message.lastAttemptDate">{{ translate("Last sent or tried") }}: {{ commonUtil.getDateAndTime(message.lastAttemptDate) }}</p>
              <p v-if="message.failCount">{{ translate("Failed send tries: {count}", { count: message.failCount }) }}</p>
              <p v-if="message.remoteMessageId" class="remote-id">{{ translate("NetSuite id") }}: {{ message.remoteMessageId }}</p>
              <p v-if="message.errorText" class="error-text">{{ message.errorText }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
        <ion-button v-if="!isLoading && messageCount != null && messages.length < messageCount" fill="clear" expand="block" @click="loadMore()">
          {{ translate("Load more") }}
        </ion-button>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonItem,
  IonLabel, IonList, IonPage, IonSegment, IonSegmentButton, IonSkeletonText, IonTitle, IonToolbar, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { commonUtil, translate } from "@common";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains } from "@/db/appDbSync";
import { NETSUITE_SENDING_LIST_DOMAIN, NETSUITE_STEP_LIST_PAGE } from "@/config/appSyncConfig";
import { NETSUITE_SENDING_LISTS, findNetSuiteSendingList, findNetSuiteSendingWay } from "@/config/netSuiteSending";
import { useNetSuiteSendingList } from "@/composables/useNetSuiteSending";

const props = defineProps<{ way: string; list: string }>();

const router = useRouter();
const SYNC_OWNER = createSyncDomainOwner("netSuiteSendingLists");
const isActive = ref(false);
const limit = ref(NETSUITE_STEP_LIST_PAGE);

const sendingWay = computed(() => findNetSuiteSendingWay(props.way));
const sendingList = computed(() => findNetSuiteSendingList(props.list));

const { loadError, isLoading, messageCount, messages } = useNetSuiteSendingList(() => props.way, () => props.list);

const activate = () => activateSyncDomains([{ name: NETSUITE_SENDING_LIST_DOMAIN, args: { way: props.way, list: props.list, limit: limit.value } }], SYNC_OWNER);

const showList = (list: string) => {
  if (list !== props.list) void router.replace(`/netsuite/sending/${props.way}/${list}`);
};

const loadMore = () => {
  limit.value += NETSUITE_STEP_LIST_PAGE;
  void activate();
};

onIonViewWillEnter(() => {
  isActive.value = true;
  void activate();
});

onIonViewDidLeave(() => {
  isActive.value = false;
  void deactivateSyncDomains(SYNC_OWNER);
});

watch(() => [props.way, props.list], () => {
  limit.value = NETSUITE_STEP_LIST_PAGE;
  if (isActive.value) void activate();
});
</script>

<style scoped>
.count-skeleton {
  width: 12rem;
}

.remote-id {
  word-break: break-all;
}

.error-text {
  white-space: pre-wrap;
  user-select: text;
}
</style>
