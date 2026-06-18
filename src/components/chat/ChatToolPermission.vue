<template>
  <ion-card class="chat-tool-permission">
    <ion-item lines="none">
      <ion-icon slot="start" :icon="terminalOutline" aria-hidden="true" />
      <ion-label>
        <p class="overline">{{ name }}</p>
      </ion-label>
    </ion-item>

    <ion-item lines="full">
      <ion-label class="ion-text-wrap chat-tool-permission__message">
        <slot>{{ translate("Requesting permission for tool call") }} {{ toolName }}</slot>
      </ion-label>
    </ion-item>

    <ion-item lines="none" class="chat-tool-permission__actions">
      <ion-button fill="clear" @click="$emit('allow')">
        {{ translate("Allow") }}
      </ion-button>
      <ion-button fill="clear" @click="$emit('deny')">
        {{ translate("Deny") }}
      </ion-button>
    </ion-item>
  </ion-card>
</template>

<script setup lang="ts">
import { IonButton, IonCard, IonIcon, IonItem, IonLabel } from "@ionic/vue";
import { terminalOutline } from "ionicons/icons";
import { translate } from "@common";

defineProps({
  /** Name of the agent/source requesting permission, shown in the header (e.g. "CIRCUIT"). */
  name: {
    type: String,
    default: ""
  },
  /** Name of the tool the permission is being requested for, shown in the message. */
  toolName: {
    type: String,
    default: ""
  }
});

defineEmits(["allow", "deny"]);
</script>

<style scoped>
/* Subtitle 1 / Roboto Regular */
.chat-tool-permission__message {
  font-size: 16px;
  line-height: 24px;
  letter-spacing: 0.15px;
  color: rgba(0, 0, 0, 0.87);
}

/* Card / Actions — divider above, buttons left-aligned */
.chat-tool-permission__actions {
  --inner-padding-end: 0;
}
</style>
