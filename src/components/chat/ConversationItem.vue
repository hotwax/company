<template>
  <ion-item button :detail="false" lines="full" class="conversation-item">
    <ion-label class="ion-text-wrap">
      <h2 class="conversation-item__agent">{{ agentName }}</h2>
      <h3 class="conversation-item__name">{{ conversationName }}</h3>
      <p v-if="pendingRequest" class="conversation-item__pending">{{ pendingRequest }}</p>
    </ion-label>

    <ion-badge v-if="showBadge" slot="end" :color="badgeColor" class="conversation-item__badge">
      {{ badgeText }}
    </ion-badge>
  </ion-item>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonBadge, IonItem, IonLabel } from "@ionic/vue";

const props = defineProps({
  /** Name of the agent the conversation belongs to. */
  agentName: {
    type: String,
    default: ""
  },
  /** Title/summary of the conversation. */
  conversationName: {
    type: String,
    default: ""
  },
  /** Optional caption describing a pending action, e.g. "Pending request tool name". */
  pendingRequest: {
    type: String,
    default: ""
  },
  /**
   * Notification indicator. A number/string renders that value in the badge;
   * `true` renders an empty dot; falsy values hide the badge entirely.
   */
  badge: {
    type: [Number, String, Boolean],
    default: false
  },
  /** Color of the notification badge (any Ionic color). */
  badgeColor: {
    type: String,
    default: "primary"
  }
});

const showBadge = computed(() => props.badge !== false && props.badge !== "" && props.badge !== 0);
const badgeText = computed(() => (props.badge === true ? "" : props.badge));
</script>

<style scoped>

/* Empty badge renders as a notification dot */
.conversation-item__badge:empty {
  min-width: 12px;
  min-height: 12px;
  padding: 0;
  border-radius: 20px;
}
</style>
