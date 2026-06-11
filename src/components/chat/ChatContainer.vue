<template>
  <div class="chat-container">
    <div class="thread">
      <template v-for="item in items" :key="item.id">
        <chat-message v-if="item.type === 'message'" :user-name="item.userName" :content="item.content" />

        <div v-else-if="item.type === 'agentMessage'">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="terminalOutline" aria-hidden="true" />
            <ion-label class="overline">{{ agentName }}</ion-label>
          </ion-item>
          <ion-text class="ion-padding chat-container__agent-text">
            {{ item.content }}
          </ion-text>
        </div>

        <chat-tool-call v-else-if="item.type === 'toolCall'" :tool-name="item.toolName" :args="item.args" />

        <chat-tool-permission v-else-if="item.type === 'permission'" :name="agentName" :tool-name="item.toolName"
          @allow="$emit('allow-tool', item)" @deny="$emit('deny-tool', item)">
          {{ item.message }}
        </chat-tool-permission>
      </template>

      <ion-item v-if="busy" lines="none">
        <ion-spinner slot="start" name="dots" />
        <ion-label color="medium">{{ translate("Working") }}</ion-label>
      </ion-item>
    </div>
    <div class="next-message ion-padding">
      <ion-item lines="full">
        <ion-textarea
          v-model="messageText"
          :label="translate('Message')"
          label-placement="stacked"
          :placeholder="translate('Ask the agent')"
          :auto-grow="true"
          :rows="1"
          :disabled="busy"
        />

        <ion-button slot="end" fill="clear" :disabled="busy || !messageText.trim()" @click="sendMessage">
          <ion-icon slot="icon-only" :icon="sendOutline" />
        </ion-button>
      </ion-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonItem, IonLabel, IonSpinner, IonText, IonTextarea } from "@ionic/vue";
import { sendOutline, terminalOutline } from "ionicons/icons";
import { translate } from "@common";
import { PropType, ref } from "vue";
import ChatMessage from "@/components/chat/ChatMessage.vue";
import ChatToolCall from "@/components/chat/ChatToolCall.vue";
import ChatToolPermission from "@/components/chat/ChatToolPermission.vue";

/**
 * One entry in the chat timeline, rendered in order:
 * - message: a user turn (userName + content)
 * - agentMessage: an assistant text turn (content; header shows agentName)
 * - toolCall: a tool invocation card (toolName + args JSON string)
 * - permission: a pending approval card (permissionId + toolName + message)
 */
export type ChatItem = {
  id: string;
  type: "message" | "agentMessage" | "toolCall" | "permission";
  userName?: string;
  content?: string;
  toolName?: string;
  args?: string;
  permissionId?: string;
  message?: string;
};

defineProps({
  /** Agent display name for assistant turns and permission cards. */
  agentName: {
    type: String,
    default: ""
  },
  /** Ordered chat timeline. */
  items: {
    type: Array as PropType<ChatItem[]>,
    default: () => []
  },
  /** True while a send/decide is in flight; shows the working row and disables input. */
  busy: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["send-message", "allow-tool", "deny-tool"]);
const messageText = ref("");

function sendMessage() {
  const content = messageText.value.trim();
  if(!content) return;

  emit("send-message", content);
  messageText.value = "";
}
</script>

<style scoped>

.chat-container {
  display: grid;
  grid-template-rows: 1fr min-content;
  height: 100%;
}

.thread {
  overflow-y: auto;
}

.chat-container__agent-text {
  display: block;
  white-space: pre-wrap;
}

.next-message {
  border-top: 1px solid var(--ion-color-medium);
}

</style>
