<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ translate("Custom request") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("Queues standalone fresh-fetch requests without changing the schedule") }}</ion-card-subtitle>
    </ion-card-header>
    <ion-list>
      <ion-item button detail @click="emit('open-search')">
        <ion-label>
          {{ translate("Download specific orders") }}
          <p>{{ translate("Search Shopify directly and select orders to download on demand") }}</p>
        </ion-label>
      </ion-item>
      <ion-item button detail @click="emit('open-replay')">
        <ion-label>
          {{ translate("Replay orders from a time") }}
          <p>{{ translate("Re-import every order updated since a chosen time") }}</p>
        </ion-label>
      </ion-item>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import { IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonItem, IonLabel, IonList } from "@ionic/vue";
import { translate } from "@common";

const emit = defineEmits<{ "open-search": []; "open-replay": [] }>();
</script>
