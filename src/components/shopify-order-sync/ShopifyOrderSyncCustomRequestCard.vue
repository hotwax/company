<template>
  <ion-card>
    <ion-card-header>
      <ion-card-title>{{ translate("Custom request") }}</ion-card-title>
    </ion-card-header>
    <ion-list>
      <ion-item button detail :disabled="disabled" @click="emit('open-search')">
        <ion-label>
          {{ translate("Download specific orders") }}
          <p>{{ translate("Search Shopify directly and select orders to download on demand") }}</p>
        </ion-label>
      </ion-item>
      <ion-item button detail :disabled="disabled" @click="emit('open-replay')">
        <ion-label>
          {{ translate("Replay orders updated since") }}
          <p>{{ translate("Re-import matching orders from a chosen date") }}</p>
        </ion-label>
      </ion-item>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import { IonCard, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList } from "@ionic/vue";
import { translate } from "@common";

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ "open-search": []; "open-replay": [] }>();
</script>
