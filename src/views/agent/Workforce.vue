<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Workforce") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="workforce">
        <!-- Conversation list pane -->
        <aside class="workforce__list">
          <div class="workforce__filters">
            <ion-chip
              v-for="filter in filters"
              :key="filter.value"
              :outline="activeFilter !== filter.value"
              @click="activeFilter = filter.value"
            >
              <ion-icon v-if="filter.color" :icon="ellipse" :color="filter.color" />
              <ion-label>{{ translate(filter.label) }}</ion-label>
            </ion-chip>
          </div>

          <ion-list lines="full">
            <conversation-item
              v-for="conversation in filteredConversations"
              :key="conversation.id"
              :agent-name="conversation.agentName"
              :conversation-name="conversation.conversationName"
              :pending-request="statusCaption(conversation)"
              :badge="conversation.status !== 'running'"
              :badge-color="conversation.status === 'error' ? 'danger' : 'primary'"
              :class="{ 'workforce__conversation--active': conversation.id === selectedConversationId }"
              @click="selectedConversationId = conversation.id"
            />
          </ion-list>
        </aside>

        <!-- Conversation thread pane -->
        <section class="workforce__thread">
          <chat-container
            v-if="selectedChat"
            :chat="selectedChat"
            @send-message="onSendMessage"
            @allow-tool="onAllowTool"
            @deny-tool="onDenyTool"
          />
          <div v-else class="workforce__empty">
            <ion-text color="medium">{{ translate("Select a conversation to view the thread") }}</ion-text>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonList,
  IonMenuButton,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar
} from "@ionic/vue";
import { ellipse } from "ionicons/icons";
import { translate } from "@common";
import { computed, ref } from "vue";
import ChatContainer from "@/components/chat/ChatContainer.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";

type ConversationStatus = "pending" | "running" | "error";

type Conversation = {
  id: string;
  agentName: string;
  conversationName: string;
  status: ConversationStatus;
  pendingTool?: string;
};

const filters = [
  { value: "all", label: "All", color: "" },
  { value: "pending", label: "Pending", color: "primary" },
  { value: "running", label: "Running", color: "medium" },
  { value: "error", label: "Error", color: "danger" }
] as const;

const activeFilter = ref<string>("all");

const conversations = ref<Conversation[]>([
  {
    id: "conversation-1",
    agentName: "Agent Name",
    conversationName: "Conversation Name",
    status: "pending",
    pendingTool: "tool name"
  },
  {
    id: "conversation-2",
    agentName: "Agent Name",
    conversationName: "Conversation Name",
    status: "running"
  },
  {
    id: "conversation-3",
    agentName: "Agent Name",
    conversationName: "Conversation Name",
    status: "error"
  }
]);

const selectedConversationId = ref<string>("conversation-1");

const filteredConversations = computed(() =>
  activeFilter.value === "all"
    ? conversations.value
    : conversations.value.filter((conversation) => conversation.status === activeFilter.value)
);

function statusCaption(conversation: Conversation): string {
  switch (conversation.status) {
    case "pending":
      return `${translate("Pending request")} ${conversation.pendingTool ?? ""}`.trim();
    case "running":
      return translate("Running");
    case "error":
      return translate("Tool call error");
    default:
      return "";
  }
}

// Mock thread for the selected conversation, rendered by ChatContainer.
const selectedChat = computed(() => {
  if (!selectedConversationId.value) return null;

  return {
    agentName: "CIRCUIT",
    agentMessageText: "Message content",
    messages: [{ id: "message-1", userName: "User first name", content: "Message content" }],
    toolCalls: [{ id: "tool-1", toolName: "Tool name", args: "" }],
    permissions: [],
    steps: []
  };
});

function onSendMessage(message: unknown) {
  // Wire up to the agent backend when available.
  console.log("send-message", message);
}

function onAllowTool(permission: unknown) {
  console.log("allow-tool", permission);
}

function onDenyTool(permission: unknown) {
  console.log("deny-tool", permission);
}
</script>

<style scoped>
.workforce {
  display: flex;
  height: 100%;
}

.workforce__list {
  display: flex;
  flex-direction: column;
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--ion-color-step-150, #d7d8da);
  overflow-y: auto;
}

.workforce__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
}

.workforce__conversation--active {
  --background: var(--ion-color-light, #f4f5f8);
}

.workforce__thread {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.workforce__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 16px;
  text-align: center;
}

/* Stack to a single pane on small screens */
@media (max-width: 768px) {
  .workforce {
    flex-direction: column;
  }

  .workforce__list {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--ion-color-step-150, #d7d8da);
  }
}
</style>
