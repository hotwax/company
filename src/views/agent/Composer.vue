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
              <ion-input class="agent-name" fill="outline" v-model="composer.agentName"
                :label="translate('Give your agent a name')"
                label-placement="stacked" :placeholder="translate('Name')"
                :helper-text="translate('Your agent requires a name to start testing')" />
            </div>
            <div class="agent-description">
              <ion-textarea fill="outline" v-model="composer.instructions" :label="translate('Instructions')"
                label-placement="stacked" :placeholder="translate('Input text')" :rows="5" />

              <ion-button fill="outline" color="primary" :disabled="composer.enhancing || !composer.instructions.trim()" @click="enhance">
                <ion-spinner v-if="composer.enhancing" slot="start" name="crescent" />
                <ion-icon v-else slot="start" :icon="sparklesOutline" />
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
              <ion-select-option v-for="model in composer.modelOptions"
                :key="`${model.providerName}::${model.modelName}`"
                :value="`${model.providerName}::${model.modelName}`">
                {{ model.modelName }} ({{ model.providerName }})
              </ion-select-option>
            </ion-select>

            <!-- Reasoning Effort Dropdown -->
            <ion-select
              fill="outline"
              :label="translate('Reasoning effort')"
              interface="popover"
              :placeholder="translate('Select')"
              v-model="composer.reasoningEffort"
            >
              <ion-select-option v-for="effort in composer.reasoningEffortOptions" :key="effort" :value="effort">
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
              <ion-item v-if="!composer.selectedTools.length">
                <ion-label>
                  {{ translate("No tools selected") }}
                  <p>{{ translate("Add tools this agent can use") }}</p>
                </ion-label>
              </ion-item>

              <ion-item v-for="tool in composer.selectedTools" :key="tool.toolId">
                <ion-label>
                  <h2>{{ tool.toolName }}</h2>
                  <p>{{ tool.description }}</p>
                </ion-label>

                <ion-checkbox slot="end" label-placement="bottom" justify="center"
                  :checked="tool.autoApprove" @ionChange="tool.autoApprove = $event.detail.checked">
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
              :agent-name="composer.agentName || translate('Agent')"
              :items="composer.previewItems"
              :busy="composer.previewing"
              @send-message="sendPreview"
            />
          </div>
          <div class="actions">
            <ion-button fill="outline" :disabled="composer.saving || !composer.agentName.trim()" @click="save">
              {{ translate("Save") }}
              <ion-icon slot="end" :icon="saveOutline" />
            </ion-button>
            <ion-button :disabled="!composer.canActivate" @click="activate">
              {{ translate("Activate") }}
              <ion-icon slot="end" :icon="rocketOutline" />
            </ion-button>
          </div>
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
                  {{ tool.toolName }}
                  <p>{{ tool.description }}</p>
                </ion-label>
              </ion-checkbox>
              <ion-note slot="end">{{ tool.effectEnumId === 'AI_TOOL_MUTATING' ? translate("Mutating") : translate("Read only") }}</ion-note>
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
  IonListHeader,
  IonMenuButton,
  IonModal,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  alertController,
  onIonViewWillEnter
} from "@ionic/vue";
import { addOutline, checkmarkOutline, closeOutline, removeCircleOutline, rocketOutline, saveOutline, sparklesOutline } from "ionicons/icons";
import { translate } from "@common";
import { computed, ref } from "vue";
import ChatContainer from "@/components/chat/ChatContainer.vue";
import { useComposerStore } from "@/store/composer";
import { showToast } from "@/utils";

const composer = useComposerStore();

const showToolsModal = ref(false);
const toolQueryString = ref("");
const draftToolIds = ref([] as string[]);

const selectedModel = computed({
  get: () => composer.modelName ? `${composer.providerName}::${composer.modelName}` : "",
  set: (value: string) => {
    const [providerName, modelName] = value.split("::");
    composer.providerName = providerName;
    composer.modelName = modelName;
  }
});

const filteredTools = computed(() => {
  const query = toolQueryString.value.trim().toLowerCase();
  if(!query) return composer.toolCatalog;
  return composer.toolCatalog.filter((tool) =>
    [tool.toolName, tool.description, tool.toolId].some((value) => (value || "").toLowerCase().includes(query)));
});

onIonViewWillEnter(async () => {
  await Promise.all([composer.fetchModelOptions(), composer.fetchToolCatalog()]);
});

function openToolsModal() {
  draftToolIds.value = composer.selectedTools.map((tool) => tool.toolId);
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
  composer.selectedTools = draftToolIds.value.map((toolId) => {
    const existing = composer.selectedTools.find((tool) => tool.toolId === toolId);
    if(existing) return existing;
    const catalogTool = composer.toolCatalog.find((tool) => tool.toolId === toolId) as any;
    // default the checkbox to the tool's actual default: read-only tools are auto-approved already
    return { ...catalogTool, autoApprove: (catalogTool.requiresApproval || "N") === "N" };
  });
  closeToolsModal();
}

function removeTool(toolId: string) {
  composer.selectedTools = composer.selectedTools.filter((tool) => tool.toolId !== toolId);
}

async function save() {
  try {
    await composer.saveDraft();
    showToast(translate("Draft saved"));
  } catch {
    showToast(translate("Failed to save agent"));
  }
}

async function activate() {
  try {
    await composer.saveDraft();
    await composer.activate();
    showToast(translate("Agent activated. Find it in the Workforce."));
    composer.clearComposerState();
  } catch {
    showToast(translate("Failed to activate agent"));
  }
}

async function enhance() {
  const alert = await alertController.create({
    header: translate("Enhance instructions"),
    message: translate("Replace your instructions with an improved version written by the model?"),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: translate("Enhance"), role: "confirm" }
    ]
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if(role !== "confirm") return;
  try {
    await composer.enhanceInstructions();
    showToast(translate("Instructions enhanced"));
  } catch {
    showToast(translate("Failed to enhance instructions"));
  }
}

async function sendPreview(content: string) {
  if(!composer.agentName.trim()) {
    showToast(translate("Your agent requires a name to start testing"));
    return;
  }
  try {
    await composer.sendPreviewMessage(content);
  } catch {
    showToast(translate("Preview failed"));
  }
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
  box-sizing: border-box;
  height: clamp(500px, 70vh, 70vh);
  max-height: 70vh;
  min-height: 500px;
  overflow: hidden;
}

.actions {
  display: flex;
  gap: var(--spacer-sm);
  margin-block-start: var(--spacer-base);
}

</style>
