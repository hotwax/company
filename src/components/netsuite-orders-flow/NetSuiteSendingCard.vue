<template>
  <ion-card data-testid="netsuite-sending-card">
    <ion-card-header>
      <ion-card-title>{{ translate("Sending to NetSuite") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("Shared by all stores. Every step's batches go out one of these two ways.") }}</ion-card-subtitle>
    </ion-card-header>
    <ion-grid>
      <ion-row class="ion-align-items-center ion-hide-md-down">
        <ion-col size="6" />
        <ion-col v-for="sendingList in NETSUITE_SENDING_LISTS" :key="sendingList.list" size="2">
          <ion-item lines="none"><ion-label>{{ translate(sendingList.label) }}</ion-label></ion-item>
        </ion-col>
      </ion-row>
      <NetSuiteSendingRow
        v-for="sendingWay in NETSUITE_SENDING_WAYS"
        :key="sendingWay.way"
        :way="sendingWay.way"
        :send-job-label="sendingWay.sendJobLabel"
        :poll-job-label="sendingWay.pollJobLabel"
        @open-job="emit('openJob', $event)"
      />
    </ion-grid>
  </ion-card>
</template>

<script setup lang="ts">
import { IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/vue";
import { translate } from "@common";
import NetSuiteSendingRow from "@/components/netsuite-orders-flow/NetSuiteSendingRow.vue";
import { NETSUITE_SENDING_LISTS, NETSUITE_SENDING_WAYS } from "@/config/netSuiteSending";

const emit = defineEmits<{ openJob: [jobName: string] }>();
</script>
