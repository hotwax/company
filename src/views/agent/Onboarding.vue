<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Onboarding") }}</ion-title>
        <ion-buttons slot="end" v-if="store.isStarted">
          <ion-button @click="restart">
            <ion-icon slot="start" :icon="refreshOutline" />
            {{ translate("Restart") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Start gate -->
      <div v-if="!store.isStarted" class="start">
        <ion-card class="start-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Set up a store with the onboarding agent") }}</ion-card-title>
            <ion-card-subtitle>
              {{ translate("Answer a few questions about your business. The agent maps them to OMS configuration and applies the settings for you.") }}
            </ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-segment class="field" v-model="targetMode">
              <ion-segment-button value="create">
                <ion-label>{{ translate("Create store") }}</ion-label>
              </ion-segment-button>
              <ion-segment-button value="existing">
                <ion-label>{{ translate("Use existing") }}</ion-label>
              </ion-segment-button>
            </ion-segment>
            <ion-input class="field" fill="outline" label-placement="stacked"
              :label="translate('Retailer / brand name (optional)')" :placeholder="translate('e.g. Capital Hair & Beauty')"
              v-model="retailerName" />
            <template v-if="targetMode === 'create'">
              <ion-input class="field" fill="outline" label-placement="stacked"
                :label="translate('Product store name')" :placeholder="translate('e.g. West Coast Beauty')"
                v-model="storeName" @ionBlur="setProductStoreIdFromName" />
              <ion-input class="field" fill="outline" label-placement="stacked"
                :label="translate('Product store ID')" :placeholder="translate('(generated when you enter a name)')"
                v-model="productStoreId" />
              <ion-input v-if="!productStores.length" class="field" fill="outline" label-placement="stacked"
                :label="translate('Company name')" :placeholder="translate('Parent organization')"
                v-model="companyName" />
              <ion-select class="field" fill="outline" interface="popover" label-placement="stacked"
                :label="translate('Currency')" :placeholder="translate('Select')"
                v-model="defaultCurrencyUomId">
                <ion-select-option v-for="currency in currencies" :key="currency.uomId" :value="currency.uomId">
                  {{ currency.description }} ({{ currency.abbreviation }})
                </ion-select-option>
              </ion-select>
            </template>
            <ion-input v-else class="field" fill="outline" label-placement="stacked"
              :label="translate('Target product store id (optional)')" :placeholder="translate('Leave blank to decide with the agent')"
              v-model="productStoreId" />
            <ion-button expand="block" :disabled="store.starting" @click="start">
              <ion-spinner v-if="store.starting" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="sparklesOutline" />
              {{ targetMode === 'create' ? translate("Create store and start onboarding") : translate("Start onboarding") }}
            </ion-button>
          </ion-card-content>
        </ion-card>
      </div>

      <!-- Workspace -->
      <main v-else>
        <!-- Live configuration package -->
        <section class="package">
          <div class="package-header">
            <div>
              <h2>{{ translate("Configuration package") }}</h2>
              <p class="muted">
                <span v-if="store.pkg.retailerName">{{ store.pkg.retailerName }} · </span>
                <span v-if="store.pkg.productStoreId">{{ translate("Store") }}: {{ store.pkg.productStoreId }}</span>
                <span v-else>{{ translate("No target store set yet") }}</span>
              </p>
            </div>
          </div>

          <div class="summary">
            <ion-chip color="success"><ion-label>{{ store.counts.assigned || 0 }} {{ translate("set") }}</ion-label></ion-chip>
            <ion-chip color="medium"><ion-label>{{ store.counts.silent || 0 }} {{ translate("default") }}</ion-label></ion-chip>
            <ion-chip color="warning"><ion-label>{{ store.counts.pending || 0 }} {{ translate("pending") }}</ion-label></ion-chip>
            <ion-chip color="tertiary"><ion-label>{{ store.counts.setupReq || 0 }} {{ translate("setup") }}</ion-label></ion-chip>
            <ion-chip color="primary"><ion-label>{{ store.counts.applied || 0 }} {{ translate("applied") }}</ion-label></ion-chip>
            <ion-chip :color="(store.counts.openRequired || 0) === 0 ? 'success' : 'danger'">
              <ion-icon :icon="(store.counts.openRequired || 0) === 0 ? checkmarkCircleOutline : ellipseOutline" />
              <ion-label>{{ store.counts.openRequired || 0 }} {{ translate("open") }}</ion-label>
            </ion-chip>
          </div>

          <ion-list v-if="store.topics.length">
            <ion-accordion-group :multiple="true" :value="store.topics.map((t) => t.topicId)">
              <ion-accordion v-for="topic in store.topics" :key="topic.topicId" :value="topic.topicId">
                <ion-item slot="header" color="light">
                  <ion-label>{{ topic.topicName }}</ion-label>
                  <ion-note slot="end">{{ assignedCount(topic) }}/{{ topic.slots.length }}</ion-note>
                </ion-item>
                <div slot="content">
                  <ion-item v-for="slot in topic.slots" :key="slot.slotKey" lines="full">
                    <ion-label class="ion-text-wrap">
                      <h3>{{ slot.label }}</h3>
                      <p v-if="slot.value">{{ slot.value }}</p>
                      <p v-else class="muted">{{ slot.required === 'Y' ? translate('Required') : translate('Optional') }}</p>
                    </ion-label>
                    <ion-icon v-if="slot.applied === 'Y'" slot="end" :icon="checkmarkCircleOutline" color="primary"
                      :title="translate('Applied to the live store')" />
                    <ion-chip slot="end" :color="statusColor(slot.status)" class="status-chip">
                      <ion-label>{{ statusLabel(slot.status) }}</ion-label>
                    </ion-chip>
                  </ion-item>
                </div>
              </ion-accordion>
            </ion-accordion-group>
          </ion-list>

          <div v-else class="empty muted">
            {{ translate("As you talk to the agent, the configuration it captures will appear here, grouped by topic.") }}
          </div>
        </section>

        <!-- Conversation -->
        <section class="conversation">
          <chat-container
            :chat="chat"
            @send-message="onSend"
            @allow-tool="onAllow"
            @deny-tool="onDeny"
          />
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter
} from "@ionic/vue";
import { checkmarkCircleOutline, ellipseOutline, refreshOutline, sparklesOutline } from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { computed, ref } from "vue";
import ChatContainer from "@/components/chat/ChatContainer.vue";
import { useOnboardingStore } from "@/store/onboarding";
import { useProductStore } from "@/store/productStore";
import { useUtilStore } from "@/store/util";
import { generateInternalId } from "@/utils";

const store = useOnboardingStore();
const productStoreStore = useProductStore();
const utilStore = useUtilStore();
const targetMode = ref<"create" | "existing">("create");
const retailerName = ref("");
const storeName = ref("");
const productStoreId = ref("");
const companyName = ref("");
const defaultCurrencyUomId = ref("USD");

const productStores = computed(() => productStoreStore.productStores);
const currencies = computed(() => utilStore.currencies);

onIonViewWillEnter(async () => {
  await utilStore.fetchOrganizationPartyId();
  await Promise.all([
    productStoreStore.fetchProductStores(),
    productStoreStore.fetchCompany(),
    utilStore.fetchCurrencies({ uomTypeEnumId: "UT_CURRENCY_MEASURE", pageSize: 250 })
  ]);

  if (productStores.value.length === 1) {
    const onlyStore = productStores.value[0];
    targetMode.value = "existing";
    productStoreId.value = onlyStore.productStoreId || "";
    retailerName.value = retailerName.value || onlyStore.storeName || "";
  } else {
    targetMode.value = "create";
  }

  companyName.value = companyName.value || productStoreStore.company?.companyName || "";
  if (!defaultCurrencyUomId.value) defaultCurrencyUomId.value = "USD";
});

const chat = computed(() => ({
  agentName: "Onboarding agent",
  agentMessageText: store.sending ? translate("Thinking...") : "",
  messages: store.transcript.map((m) => ({
    id: m.id,
    userName: m.role === "user" ? translate("You") : translate("Onboarding agent"),
    content: m.content
  })),
  toolCalls: [],
  permissions: store.pendingApprovals.map((p: any) => ({
    id: p.toolCallRequestId || p.id,
    name: translate("Onboarding agent"),
    toolName: p.toolName || "apply_config",
    message: approvalMessage(p)
  })),
  steps: []
}));

function approvalMessage(p: any) {
  const base = translate("The agent wants to write these settings to the live store.");
  if (!p.arguments) return base;
  try {
    const args = typeof p.arguments === "string" ? JSON.parse(p.arguments) : p.arguments;
    const scope = args.topicId ? ` (${args.topicId}${args.slotKey ? " · " + args.slotKey : ""})` : "";
    return `${base}${scope}`;
  } catch {
    return base;
  }
}

async function start() {
  const payload: any = {
    productStoreId: productStoreId.value.trim() || undefined,
    retailerName: retailerName.value.trim() || undefined
  };

  if (targetMode.value === "create") {
    const trimmedStoreName = storeName.value.trim();
    if (!trimmedStoreName || !defaultCurrencyUomId.value) {
      commonUtil.showToast(translate("Please fill all the required fields"));
      return;
    }

    const nextProductStoreId = productStoreId.value.trim() || generateInternalId(trimmedStoreName);
    if (nextProductStoreId.length > 20) {
      commonUtil.showToast(translate("Product store ID cannot be more than 20 characters."));
      return;
    }

    productStoreId.value = nextProductStoreId;
    payload.productStoreId = nextProductStoreId;
    payload.storeName = trimmedStoreName;
    payload.retailerName = payload.retailerName || trimmedStoreName;
    payload.defaultCurrencyUomId = defaultCurrencyUomId.value;
    payload.companyName = productStores.value.length ? productStoreStore.company?.companyName : companyName.value.trim();
    payload.payToPartyId = utilStore.organizationPartyId;
  }

  const conversationId = await store.startAndGreet(payload);
  if (!conversationId) commonUtil.showToast(translate("Failed to start onboarding."));
}

function restart() {
  store.reset();
}

function setProductStoreIdFromName() {
  if (!productStoreId.value && storeName.value.trim()) {
    productStoreId.value = generateInternalId(storeName.value);
  }
}

function onSend(message: { content: string }) {
  store.sendMessage(message.content);
}

function onAllow(permission: { id: string }) {
  store.decide(permission.id, true);
}

function onDeny(permission: { id: string }) {
  store.decide(permission.id, false);
}

function assignedCount(topic: any) {
  return (topic.slots || []).filter((s: any) => s.status && s.status !== "OPEN").length;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  ASSIGNED: { color: "success", label: "Set" },
  SILENT: { color: "medium", label: "Default" },
  PENDING: { color: "warning", label: "Pending" },
  SETUP_REQ: { color: "tertiary", label: "Setup" },
  OPEN: { color: "light", label: "Open" }
};

function statusColor(status: string) {
  return (STATUS_META[status] || STATUS_META.OPEN).color;
}

function statusLabel(status: string) {
  return translate((STATUS_META[status] || STATUS_META.OPEN).label);
}
</script>

<style scoped>
.start {
  display: flex;
  justify-content: center;
  padding-top: var(--spacer-xl);
}

.start-card {
  max-width: 560px;
  width: 100%;
}

.field {
  margin-bottom: var(--spacer-base);
}

main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacer-xl);
  max-width: 1200px;
  margin-inline: auto;
  height: 100%;
}

.package {
  overflow-y: auto;
}

.package-header h2 {
  margin: 0;
}

.muted {
  color: var(--ion-color-medium);
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-block: var(--spacer-sm);
}

.status-chip {
  min-width: 76px;
  justify-content: center;
}

.empty {
  padding: var(--spacer-xl);
  text-align: center;
}

.conversation {
  border: 1px solid var(--ion-color-medium);
  border-radius: 16px;
  overflow: hidden;
  height: 100%;
  min-height: 480px;
}
</style>
