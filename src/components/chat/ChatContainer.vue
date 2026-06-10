<template>
  <div class="chat-container">
    <div class="thread">
      <chat-message
        v-for="message in chat.messages"
        :key="message.id"
        :user-name="message.userName"
        :content="message.content"
      />

      <chat-tool-call
        v-for="toolCall in chat.toolCalls"
        :key="toolCall.id"
        :tool-name="toolCall.toolName"
        :args="toolCall.args"
      />

      <chat-tool-permission
        v-for="permission in chat.permissions"
        :key="permission.id"
        :name="permission.name"
        :tool-name="permission.toolName"
        @allow="$emit('allow-tool', permission)"
        @deny="$emit('deny-tool', permission)"
      >
        {{ permission.message }}
      </chat-tool-permission>

      <ion-item v-for="step in chat.steps" :key="step.id" lines="none">
        <ion-icon slot="start" :icon="checkmarkCircleOutline" aria-hidden="true" />
        <ion-label>
          {{ step.name }}
          <p>{{ step.description }}</p>
        </ion-label>
      </ion-item>

      <div v-if="chat.agentMessageText">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="terminalOutline" aria-hidden="true" />
          <ion-label class="overline">{{ chat.agentName }}</ion-label>
        </ion-item>

        <ion-text class="ion-padding">
          {{ chat.agentMessageText }}
        </ion-text>
      </div>
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
        />

        <ion-button slot="end" fill="clear" :disabled="!messageText.trim()" @click="sendMessage">
          <ion-icon slot="icon-only" :icon="sendOutline" />
        </ion-button>
      </ion-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonText, IonTextarea } from "@ionic/vue";
import { checkmarkCircleOutline, sendOutline, terminalOutline } from "ionicons/icons";
import { translate } from "@common";
import { PropType, ref } from "vue";
import ChatMessage from "@/components/chat/ChatMessage.vue";
import ChatToolCall from "@/components/chat/ChatToolCall.vue";
import ChatToolPermission from "@/components/chat/ChatToolPermission.vue";

type ChatContainerMessage = {
  id: string;
  userName: string;
  content: string;
};

type ChatContainerToolCall = {
  id: string;
  toolName: string;
  args: string;
};

type ChatContainerPermission = {
  id: string;
  name: string;
  toolName: string;
  message: string;
};

type ChatContainerStep = {
  id: string;
  name: string;
  description: string;
};

type ChatContainerModel = {
  agentName: string;
  agentMessageText: string;
  messages: ChatContainerMessage[];
  toolCalls: ChatContainerToolCall[];
  permissions: ChatContainerPermission[];
  steps: ChatContainerStep[];
};

defineProps({
  chat: {
    type: Object as PropType<ChatContainerModel>,
    default: () => ({
      agentName: "",
      agentMessageText: "",
      messages: [],
      toolCalls: [],
      permissions: [],
      steps: []
    })
  }
});

const emit = defineEmits(["send-message", "allow-tool", "deny-tool"]);
const messageText = ref("");

function sendMessage() {
  const content = messageText.value.trim();
  if(!content) return;

  emit("send-message", {
    id: `message-${Date.now()}`,
    userName: "You",
    content
  });
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

.next-message {
  border-top: 1px solid var(--ion-color-medium);
}

</style>
