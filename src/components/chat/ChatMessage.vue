<template>
  <ion-card class="chat-message">
    <ion-item lines="none">
      <ion-icon slot="start" :icon="personCircleOutline" aria-hidden="true" />
      <ion-label>
        <p class="overline chat-message__name">{{ userName }}</p>
      </ion-label>
    </ion-item>

    <ion-item lines="none">
      <ion-label class="ion-text-wrap chat-message__content">
        <slot>{{ content }}</slot>
      </ion-label>
    </ion-item>
  </ion-card>
</template>

<script setup lang="ts">
import { IonCard, IonIcon, IonItem, IonLabel } from "@ionic/vue";
import { personCircleOutline } from "ionicons/icons";

defineProps({
  /** Name shown above the message, e.g. the user's first name. */
  userName: {
    type: String,
    default: ""
  },
  /** Message text. Can also be provided via the default slot for rich content. */
  content: {
    type: String,
    default: ""
  }
});
</script>

<style scoped>
/* Subtitle 1 / Roboto Regular */
.chat-message__content {
  font-weight: 400;
  font-size: 16px;
  line-height: 24px;
  letter-spacing: 0.15px;
  color: rgba(0, 0, 0, 0.87);
}
</style>
