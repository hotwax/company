<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Workforce") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openNewConversationModal">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
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
              :key="conversation.conversationId"
              :agent-name="conversation.agentName"
              :conversation-name="conversation.title || translate('New conversation')"
              :pending-request="statusCaption(conversation)"
              :badge="conversation.derivedStatus === 'pending' || conversation.derivedStatus === 'error'"
              :badge-color="conversation.derivedStatus === 'error' ? 'danger' : 'primary'"
              :class="{ 'workforce__conversation--active': conversation.conversationId === workforce.selectedConversationId }"
              @click="workforce.selectConversation(conversation.conversationId)"
            />
          </ion-list>
        </aside>

        <!-- Conversation thread pane -->
        <section class="workforce__thread">
          <chat-container
            v-if="workforce.selectedConversationId"
            :agent-name="workforce.detail?.agent?.agentName || ''"
            :items="workforce.chatItems"
            :busy="workforce.sending || workforce.deciding"
            @send-message="onSendMessage"
            @allow-tool="onAllowTool"
            @deny-tool="onDenyTool"
          />
          <div v-else class="workforce__empty">
            <ion-text color="medium">{{ translate("Select a conversation to view the thread") }}</ion-text>
          </div>
        </section>
      </div>

      <ion-modal :is-open="showNewConversationModal" @didDismiss="showNewConversationModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="showNewConversationModal = false">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Start a conversation") }}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list>
            <ion-item v-if="!workforce.activeAgents.length">
              <ion-label>{{ translate("No active agents found. Compose and activate one first.") }}</ion-label>
            </ion-item>
            <ion-item v-for="agent in workforce.activeAgents" :key="agent.agentId" button @click="startConversation(agent.agentId)">
              <ion-label>
                <h2>{{ agent.agentName }}</h2>
                <p>{{ agent.description }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
  onIonViewWillLeave
} from "@ionic/vue";
import { addOutline, closeOutline, ellipse } from "ionicons/icons";
import { translate } from "@common";
import { computed, ref } from "vue";
import ChatContainer from "@/components/chat/ChatContainer.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";
import { useWorkforceStore, WorkforceConversation } from "@/store/workforce";
import { showToast } from "@/utils";

const workforce = useWorkforceStore();

const filters = [
  { value: "all", label: "All", color: "" },
  { value: "pending", label: "Pending", color: "primary" },
  { value: "running", label: "Running", color: "medium" },
  { value: "error", label: "Error", color: "danger" }
] as const;

const activeFilter = ref<string>("all");
const showNewConversationModal = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const filteredConversations = computed(() =>
  activeFilter.value === "all"
    ? workforce.conversations
    : workforce.conversations.filter((conversation) => conversation.derivedStatus === activeFilter.value)
);

function statusCaption(conversation: WorkforceConversation): string {
  switch (conversation.derivedStatus) {
    case "pending":
      return `${translate("Pending request")} ${conversation.pendingToolName ?? ""}`.trim();
    case "running":
      return translate("Running");
    case "error":
      return translate("Tool call error");
    default:
      return "";
  }
}

async function refresh() {
  await workforce.fetchConversations();
  if(workforce.selectedConversationId) await workforce.fetchConversationDetail();
}

onIonViewWillEnter(async () => {
  await refresh();
  pollTimer = setInterval(refresh, 10000);
});

onIonViewWillLeave(() => {
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = null;
});

async function onSendMessage(content: string) {
  try {
    await workforce.sendMessage(content);
  } catch {
    showToast(translate("Failed to send message"));
  }
}

async function onAllowTool(item: any) {
  try {
    await workforce.decideToolCall(item.permissionId, true);
  } catch {
    showToast(translate("Failed to record decision"));
  }
}

async function onDenyTool(item: any) {
  try {
    await workforce.decideToolCall(item.permissionId, false);
  } catch {
    showToast(translate("Failed to record decision"));
  }
}

async function openNewConversationModal() {
  await workforce.fetchActiveAgents();
  showNewConversationModal.value = true;
}

async function startConversation(agentId: string) {
  try {
    await workforce.startConversation(agentId);
    showNewConversationModal.value = false;
  } catch {
    showToast(translate("Failed to start conversation"));
  }
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
