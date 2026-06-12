<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Composer") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <main>
        <section class="configuration">
          <!-- Agent Name -->
          <div class="agent">
            <div class="agent-name">
              <ion-input class="agent-name" fill="outline" :label="translate('Give your agent a name')"
                label-placement="stacked" :placeholder="translate('Name')"
                :helper-text="translate('Your agent requires a name to start testing')" />
            </div>
            <div class="agent-description">
              <ion-textarea fill="outline" :label="translate('Instructions')" label-placement="stacked"
                :placeholder="translate('Input text')" :rows="5" />

              <ion-button fill="outline" color="primary">
                <ion-icon slot="start" :icon="sparklesOutline" />
                {{ translate("Enhance") }}
              </ion-button>
            </div>
          </div>

          <ion-list class="model">
            <ion-list-header>
              {{ translate("Select your model") }}
            </ion-list-header>
            <!-- Model Dropdown -->
            <ion-select
              fill="outline"
              :label="translate('Model')"
              interface="popover"
              :placeholder="translate('Select')"
              v-model="selectedModel"
            >
              <ion-select-option v-for="model in models" :key="model" :value="model">
                {{ model }}
              </ion-select-option>
            </ion-select>

            <!-- Reasoning Effort Dropdown -->
            <ion-select
              fill="outline"
              :label="translate('Reasoning effort')"
              interface="popover"
              :placeholder="translate('Select')"
              v-model="selectedReasoningEffort"
            >
              <ion-select-option v-for="effort in reasoningEfforts" :key="effort" :value="effort">
                {{ translate(effort) }}
              </ion-select-option>
            </ion-select>
          </ion-list>

          <!-- Tools Section -->
          <ion-card class="tools">
            <ion-item-divider color="light">
              <ion-label>{{ translate("Tools") }}</ion-label>
              <ion-button slot="end" fill="clear" size="small" @click="openToolsModal">
                {{ translate("Add") }}
                <ion-icon slot="end" :icon="addOutline" />
              </ion-button>
            </ion-item-divider>

            <ion-list>
              <ion-item v-if="!selectedTools.length">
                <ion-label>
                  {{ translate("No tools selected") }}
                  <p>{{ translate("Add tools this agent can use") }}</p>
                </ion-label>
              </ion-item>

              <ion-item v-for="tool in selectedTools" :key="tool.toolId">
                <ion-label>
                  <h2>{{ translate(tool.name) }}</h2>
                  <p>{{ translate(tool.description) }}</p>
                </ion-label>

                <ion-checkbox slot="end" label-placement="bottom" justify="center">
                  {{ translate("Auto approve") }}
                </ion-checkbox>

                <ion-button slot="end" fill="clear" color="danger" @click="removeTool(tool.toolId)">
                  <ion-icon slot="icon-only" :icon="removeCircleOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>
        <section class="preview">

          <div class="conversation ion-padding">
            <chat-container
              :chat="previewChat"
              @send-message="addPreviewMessage"
            />
          </div>
          <ion-button size="large">
            Save
            <ion-icon slot="end" :icon="saveOutline" />
          </ion-button>
        </section>
      </main>
      <ion-modal :is-open="showToolsModal" @didDismiss="showToolsModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeToolsModal">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Select tools") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-searchbar :placeholder="translate('Search tools')" v-model="toolQueryString" />

          <ion-list>
            <ion-item v-for="tool in filteredTools" :key="tool.toolId" @click="toggleToolSelection(tool.toolId)">
              <ion-checkbox :checked="isToolSelected(tool.toolId)" justify="space-between">
                <ion-label>
                  {{ translate(tool.name) }}
                  <p>{{ translate(tool.description) }}</p>
                </ion-label>
              </ion-checkbox>
              <ion-note slot="end">{{ translate(tool.category) }}</ion-note>
            </ion-item>
          </ion-list>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button @click="saveTools">
              <ion-icon :icon="checkmarkOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar
} from "@ionic/vue";
import { addOutline, checkmarkOutline, closeOutline, removeCircleOutline, saveOutline, sparklesOutline } from "ionicons/icons";
import { translate } from "@common";
import { computed, ref } from "vue";
import ChatContainer from "@/components/chat/ChatContainer.vue";

const selectedModel = ref("5.5");
const selectedReasoningEffort = ref("High");
const showToolsModal = ref(false);
const toolQueryString = ref("");
const draftToolIds = ref([] as string[]);
const previewChat = ref({
  agentName: "Circuit",
  agentMessageText: "I can help test this agent once a name, instructions, and tools are configured.",
  messages: [
    {
      id: "message-1",
      userName: "User first name",
      content: "Find open orders that need attention and explain what changed."
    }
  ],
  toolCalls: [
    {
      id: "tool-call-1",
      toolName: "Order lookup",
      args: "{\n  \"status\": \"open\",\n  \"limit\": 5\n}"
    }
  ],
  permissions: [
    {
      id: "permission-1",
      name: "Circuit",
      toolName: "Inventory availability",
      message: "Circuit wants to check availability across facilities."
    }
  ],
  steps: [
    {
      id: "step-1",
      name: "Read instructions",
      description: "Loaded the current draft agent instructions."
    },
    {
      id: "step-2",
      name: "Prepare tool plan",
      description: "Matched requested work to allowed tools."
    }
  ]
});
const selectedTools = ref([
  {
    toolId: "orders.lookup",
    name: "Order lookup",
    description: "Find orders, customers, and fulfillment status",
    category: "OMS"
  }
]);

const models = ["5.0", "5.5", "6.0"];
const reasoningEfforts = ["Low", "Medium", "High"];
const availableTools = [
  {
    toolId: "orders.lookup",
    name: "Order lookup",
    description: "Find orders, customers, and fulfillment status",
    category: "OMS"
  },
  {
    toolId: "inventory.read",
    name: "Inventory availability",
    description: "Read product availability across facilities",
    category: "Inventory"
  },
  {
    toolId: "product.store",
    name: "Product store settings",
    description: "Review product store configuration and channels",
    category: "Company"
  },
  {
    toolId: "shopify.sync",
    name: "Shopify sync history",
    description: "Inspect catalog, order, and fulfillment sync activity",
    category: "Shopify"
  },
  {
    toolId: "netsuite.lookup",
    name: "NetSuite lookup",
    description: "Check NetSuite identifiers and integration mappings",
    category: "ERP"
  },
  {
    toolId: "klaviyo.connection",
    name: "Klaviyo connection",
    description: "Read Klaviyo connection health and tenant configuration",
    category: "Marketing"
  }
];

const filteredTools = computed(() => {
  const query = toolQueryString.value.trim().toLowerCase();
  if(!query) return availableTools;

  return availableTools.filter((tool) => {
    return [tool.name, tool.description, tool.category, tool.toolId].some((value) => value.toLowerCase().includes(query));
  });
});

function openToolsModal() {
  draftToolIds.value = selectedTools.value.map((tool) => tool.toolId);
  toolQueryString.value = "";
  showToolsModal.value = true;
}

function closeToolsModal() {
  showToolsModal.value = false;
}

function isToolSelected(toolId: string) {
  return draftToolIds.value.includes(toolId);
}

function toggleToolSelection(toolId: string) {
  if(isToolSelected(toolId)) {
    draftToolIds.value = draftToolIds.value.filter((draftToolId) => draftToolId !== toolId);
  } else {
    draftToolIds.value.push(toolId);
  }
}

function saveTools() {
  selectedTools.value = availableTools.filter((tool) => draftToolIds.value.includes(tool.toolId));
  closeToolsModal();
}

function removeTool(toolId: string) {
  selectedTools.value = selectedTools.value.filter((tool) => tool.toolId !== toolId);
}

function addPreviewMessage(message: any) {
  previewChat.value.messages.push(message);
}
</script>

<style scoped>

main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacer-xl);
  max-width: 1100px;
  margin-inline: auto;
}

.configuration {
  padding: var(--spacer-sm);
}

.configuration .agent {
  margin-bottom: var(--spacer-xl);
}

.agent > *:not(:last-child), .model > ion-select:not(:last-child) {
  margin-bottom: var(--spacer-base);
}

.tools {
  margin: 0;
  margin-block-start: var(--spacer-xl);
}

.conversation {
  border: 1px solid var(--ion-color-medium);
  border-radius: 16px;
  overflow: hidden;
}

</style>
