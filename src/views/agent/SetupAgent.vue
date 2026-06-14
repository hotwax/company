<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ copy("Setup Agent") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="readLiveOms">
            <ion-icon slot="start" :icon="refreshOutline" />
            {{ copy("Read OMS") }}
          </ion-button>
          <ion-button fill="clear" @click="emulateColdStart">
            <ion-icon slot="start" :icon="playOutline" />
            {{ copy("Cold start") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-segment v-model="activePanel">
        <ion-segment-button value="agent">
          <ion-icon :icon="chatbubbleEllipsesOutline" />
          <ion-label>{{ copy("Agent") }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="maps">
          <ion-icon :icon="gitNetworkOutline" />
          <ion-label>{{ copy("Maps") }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="package">
          <ion-icon :icon="constructOutline" />
          <ion-label>{{ copy("Package") }}</ion-label>
        </ion-segment-button>
      </ion-segment>
    </ion-header>

    <ion-content class="setup-agent__content">
      <main class="setup-agent__shell">
        <section class="setup-agent__conversation" :class="{ 'setup-agent__panel--hidden': activePanel !== 'agent' }">
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ copy("Onboarding conversation") }}</ion-card-subtitle>
              <ion-card-title>{{ copy("Talk to the setup agent") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-list lines="none">
                <ion-item v-for="message in displayMessages" :key="message.id">
                  <ion-icon slot="start" :icon="message.role === 'agent' ? sparklesOutline : personCircleOutline" />
                  <ion-label class="ion-text-wrap">
                    <p>{{ message.role === "agent" ? copy("Setup Agent") : copy("You") }}</p>
                    {{ message.content }}
                  </ion-label>
                </ion-item>
              </ion-list>

              <ion-item lines="full">
                <ion-textarea
                  v-model="draftMessage"
                  :auto-grow="true"
                  :rows="1"
                  :label="copy('Message')"
                  label-placement="stacked"
                  :placeholder="copy('Tell the agent what you want to set up')"
                />
                <ion-button slot="end" fill="clear" :disabled="!draftMessage.trim()" @click="sendMessage">
                  <ion-spinner v-if="onboardingStore.sending" name="crescent" />
                  <ion-icon v-else slot="icon-only" :icon="sendOutline" />
                </ion-button>
              </ion-item>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ copy("The agent is choosing what to ask") }}</ion-card-subtitle>
              <ion-card-title>{{ copy("Interest map") }}</ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item v-for="workflow in workflowOptions" :key="workflow.id" button @click="toggleWorkflow(workflow.id)">
                <ion-checkbox slot="start" :checked="answers.selectedWorkflows.includes(workflow.id)" />
                <ion-label class="ion-text-wrap">
                  {{ workflow.label }}
                  <p>{{ workflow.question }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ copy("Business footprint") }}</ion-card-subtitle>
              <ion-card-title>{{ copy("Start with what they know") }}</ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item>
                <ion-input v-model="answers.companyName" :label="copy('Company name')" label-placement="stacked" />
              </ion-item>
              <ion-item>
                <ion-input v-model="answers.productStoreName" :label="copy('Brand or product store')" label-placement="stacked" />
              </ion-item>
              <ion-item>
                <ion-input v-model.number="answers.storeCount" type="number" :label="copy('Stores')" label-placement="stacked" min="0" />
              </ion-item>
              <ion-item>
                <ion-input v-model.number="answers.warehouseCount" type="number" :label="copy('Warehouses')" label-placement="stacked" min="0" />
              </ion-item>
              <ion-item>
                <ion-input v-model.number="answers.shopifyShopCount" type="number" :label="copy('Shopify shops')" label-placement="stacked" min="0" />
              </ion-item>
              <ion-item>
                <ion-select v-model="answers.productIdentifier" interface="popover" :label="copy('Product identifier')" label-placement="stacked">
                  <ion-select-option value="SHOPIFY_PRODUCT_SKU">{{ copy("Shopify SKU") }}</ion-select-option>
                  <ion-select-option value="SHOPIFY_BARCODE">{{ copy("Barcode") }}</ion-select-option>
                  <ion-select-option value="SHOPIFY_PRODUCT_ID">{{ copy("Shopify product ID") }}</ion-select-option>
                </ion-select>
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ copy("Live OMS target") }}</ion-card-subtitle>
              <ion-card-title>{{ copy("Create or select the ProductStore") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-segment v-model="targetMode">
                <ion-segment-button value="create">
                  <ion-label>{{ copy("Create store") }}</ion-label>
                </ion-segment-button>
                <ion-segment-button value="existing">
                  <ion-label>{{ copy("Use existing") }}</ion-label>
                </ion-segment-button>
              </ion-segment>
              <ion-list lines="full">
                <ion-item v-if="targetMode === 'create'">
                  <ion-input
                    v-model="answers.productStoreName"
                    :label="copy('Product store name')"
                    label-placement="stacked"
                    @ionBlur="setProductStoreIdFromName"
                  />
                </ion-item>
                <ion-item>
                  <ion-input
                    v-model="productStoreId"
                    :label="targetMode === 'create' ? copy('Product store ID') : copy('Existing ProductStore ID')"
                    label-placement="stacked"
                  />
                </ion-item>
                <ion-item v-if="targetMode === 'create'">
                  <ion-select v-model="defaultCurrencyUomId" interface="popover" :label="copy('Currency')" label-placement="stacked">
                    <ion-select-option v-for="currency in currencies" :key="currency.uomId" :value="currency.uomId">
                      {{ currency.description }} ({{ currency.abbreviation }})
                    </ion-select-option>
                  </ion-select>
                </ion-item>
              </ion-list>
              <ion-button expand="block" :disabled="onboardingStore.starting" @click="startLiveSetup">
                <ion-spinner v-if="onboardingStore.starting" slot="start" name="crescent" />
                <ion-icon v-else slot="start" :icon="sparklesOutline" />
                {{ targetMode === "create" ? copy("Create store and start setup") : copy("Start setup") }}
              </ion-button>
              <ion-chip v-if="onboardingStore.pkg.productStoreId" color="success">
                <ion-icon :icon="checkmarkCircleOutline" />
                <ion-label>{{ copy("Live store") }}: {{ onboardingStore.pkg.productStoreId }}</ion-label>
              </ion-chip>
            </ion-card-content>
          </ion-card>
        </section>

        <section class="setup-agent__workspace">
          <div :class="{ 'setup-agent__panel--hidden': activePanel !== 'maps' }">
            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ copy(snapshot.mode === "live" ? "Live OMS snapshot" : "Parallel cold-start model") }}</ion-card-subtitle>
                <ion-card-title>{{ copy("Adaptive operating maps") }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-list lines="none">
                  <ion-item>
                    <ion-icon slot="start" :icon="businessOutline" />
                    <ion-label class="ion-text-wrap">
                      {{ physicalMapMode }}
                      <p>{{ physicalMapCaption }}</p>
                    </ion-label>
                  </ion-item>
                  <ion-item>
                    <ion-icon slot="start" :icon="gitBranchOutline" />
                    <ion-label class="ion-text-wrap">
                      {{ technicalMapMode }}
                      <p>{{ technicalMapCaption }}</p>
                    </ion-label>
                  </ion-item>
                </ion-list>
              </ion-card-content>
            </ion-card>

            <div class="setup-agent__maps">
              <ion-card>
                <ion-card-header>
                  <ion-card-subtitle>{{ copy("Physical business") }}</ion-card-subtitle>
                  <ion-card-title>{{ copy("Store operations topology") }}</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                  <div class="setup-agent__node-list">
                    <ion-item v-for="node in physicalNodes" :key="node.id" lines="full">
                      <ion-icon slot="start" :icon="nodeIcon(node.id)" />
                      <ion-label class="ion-text-wrap">
                        {{ node.label }}
                        <p>{{ node.caption }}</p>
                        <ion-chip v-for="tag in node.tags" :key="tag" outline>{{ tag }}</ion-chip>
                      </ion-label>
                      <ion-badge slot="end" :color="statusColor(node.state)">{{ copy(node.state) }}</ion-badge>
                    </ion-item>
                  </div>
                </ion-card-content>
              </ion-card>

              <ion-card>
                <ion-card-header>
                  <ion-card-subtitle>{{ copy("Technical stack") }}</ion-card-subtitle>
                  <ion-card-title>{{ copy("Systems and pipes") }}</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                  <div class="setup-agent__node-list">
                    <ion-item v-for="node in technicalNodes" :key="node.id" lines="full">
                      <ion-icon slot="start" :icon="nodeIcon(node.id)" />
                      <ion-label class="ion-text-wrap">
                        {{ node.label }}
                        <p>{{ node.caption }}</p>
                        <ion-chip v-for="tag in node.tags" :key="tag" outline>{{ tag }}</ion-chip>
                      </ion-label>
                      <ion-badge slot="end" :color="statusColor(node.state)">{{ copy(node.state) }}</ion-badge>
                    </ion-item>
                  </div>
                </ion-card-content>
              </ion-card>
            </div>

            <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ copy("Source of truth") }}</ion-card-subtitle>
              <ion-card-title>{{ copy("Who owns each business object?") }}</ion-card-title>
            </ion-card-header>
              <ion-list>
                <ion-item v-for="objectName in sourceOfTruthObjects" :key="objectName">
                  <ion-label>{{ copy(objectName) }}</ion-label>
                  <ion-select
                    :value="answers.sourceOfTruth[objectName]"
                    interface="popover"
                    @ionChange="answers.sourceOfTruth[objectName] = String($event.detail.value || '')"
                  >
                    <ion-select-option v-for="system in sourceOfTruthSystems" :key="system" :value="system">
                      {{ copy(system) }}
                    </ion-select-option>
                  </ion-select>
                </ion-item>
            </ion-list>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ copy("User groups") }}</ion-card-subtitle>
              <ion-card-title>{{ copy("Who needs app access?") }}</ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item v-for="role in roleBundles" :key="role.id" button @click="toggleRole(role.id)">
                <ion-checkbox slot="start" :checked="answers.selectedRoles.includes(role.id)" />
                <ion-label class="ion-text-wrap">
                  {{ role.label }}
                  <p>{{ role.permissions.length }} {{ copy("permissions") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>
        </div>

          <div :class="{ 'setup-agent__panel--hidden': activePanel !== 'package' }">
            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ copy("Generated from answers") }}</ion-card-subtitle>
                <ion-card-title>{{ copy("OMS setup package") }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-list lines="full">
                  <ion-item v-for="section in packageSections" :key="section.id">
                    <ion-icon slot="start" :icon="section.icon" />
                    <ion-label class="ion-text-wrap">
                      {{ section.label }}
                      <p>{{ section.items.length }} {{ copy("records") }}</p>
                      <ion-chip v-for="item in section.items.slice(0, 8)" :key="item" outline>{{ item }}</ion-chip>
                      <ion-chip v-if="section.items.length > 8" outline>+{{ section.items.length - 8 }}</ion-chip>
                    </ion-label>
                  </ion-item>
                </ion-list>
              </ion-card-content>
            </ion-card>

            <ion-card v-if="onboardingStore.pendingApprovals.length">
              <ion-card-header>
                <ion-card-subtitle>{{ copy("Human approval") }}</ion-card-subtitle>
                <ion-card-title>{{ copy("Live OMS writes waiting") }}</ion-card-title>
              </ion-card-header>
              <ion-list>
                <ion-item v-for="approval in onboardingStore.pendingApprovals" :key="approval.toolCallRequestId || approval.id">
                  <ion-icon slot="start" :icon="constructOutline" />
                  <ion-label class="ion-text-wrap">
                    {{ approval.toolName || copy("apply_config") }}
                    <p>{{ approvalSummary(approval) }}</p>
                  </ion-label>
                  <ion-button slot="end" fill="clear" @click="decideApproval(approval, false)">
                    {{ copy("Reject") }}
                  </ion-button>
                  <ion-button slot="end" @click="decideApproval(approval, true)">
                    {{ copy("Apply") }}
                  </ion-button>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card v-if="onboardingStore.isStarted">
              <ion-card-header>
                <ion-card-subtitle>{{ copy("Human approval") }}</ion-card-subtitle>
                <ion-card-title>{{ copy("Apply captured ProductStore setup") }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-list lines="full">
                  <ion-item>
                    <ion-icon slot="start" :icon="constructOutline" />
                    <ion-label class="ion-text-wrap">
                      {{ onboardingStore.pkg.productStoreId || copy("No target store") }}
                      <p>{{ pendingLiveConfigCount }} {{ copy("pending live values") }}</p>
                    </ion-label>
                  </ion-item>
                </ion-list>
                <ion-button expand="block" :disabled="!canApplyCapturedConfig || applyingConfig" @click="applyCapturedConfig">
                  <ion-spinner v-if="applyingConfig" slot="start" name="crescent" />
                  <ion-icon v-else slot="start" :icon="checkmarkCircleOutline" />
                  {{ copy("Apply captured settings") }}
                </ion-button>
              </ion-card-content>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ copy(onboardingStore.isStarted ? "Live and checklist" : "Draft only") }}</ion-card-subtitle>
                <ion-card-title>{{ copy("Moqui execution steps") }}</ion-card-title>
              </ion-card-header>
              <ion-list>
                <ion-item v-for="step in executionSteps" :key="step.id">
                  <ion-badge slot="start" :color="statusColor(step.status)">{{ step.method }}</ion-badge>
                  <ion-label class="ion-text-wrap">
                    {{ step.label }}
                    <p>{{ step.endpoint }}</p>
                    <ion-chip v-for="record in step.records.slice(0, 6)" :key="record" outline>{{ record }}</ion-chip>
                    <ion-chip v-if="step.records.length > 6" outline>+{{ step.records.length - 6 }}</ion-chip>
                  </ion-label>
                  <ion-badge slot="end" :color="statusColor(step.status)">{{ copy(step.status) }}</ion-badge>
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-subtitle>{{ copy("Documentation") }}</ion-card-subtitle>
                <ion-card-title>{{ copy("Links for this setup") }}</ion-card-title>
              </ion-card-header>
              <ion-list>
                <ion-item v-for="doc in packageConfig.docs" :key="doc.href" button @click="openDoc(doc.href)">
                  <ion-icon slot="start" :icon="documentTextOutline" />
                  <ion-label>{{ doc.label }}</ion-label>
                  <ion-icon slot="end" :icon="openOutline" />
                </ion-item>
              </ion-list>
            </ion-card>

            <ion-card v-if="packageConfig.limitations.length">
              <ion-card-header>
                <ion-card-subtitle>{{ copy("Limitations") }}</ion-card-subtitle>
                <ion-card-title>{{ copy("Not everything is an OMS setting") }}</ion-card-title>
              </ion-card-header>
              <ion-list>
                <ion-item v-for="limitation in packageConfig.limitations" :key="limitation">
                  <ion-icon slot="start" :icon="alertCircleOutline" />
                  <ion-label class="ion-text-wrap">{{ limitation }}</ion-label>
                </ion-item>
              </ion-list>
            </ion-card>
          </div>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ copy("Agent tools") }}</ion-card-subtitle>
              <ion-card-title>{{ copy("Tool calls and contracts") }}</ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item v-for="run in visibleToolRuns" :key="run.id">
                <ion-icon slot="start" :icon="toolIcon(run.status)" />
                <ion-label class="ion-text-wrap">
                  {{ run.label }}
                  <p>{{ run.summary }}</p>
                </ion-label>
                <ion-badge slot="end" :color="statusColor(run.status)">{{ copy(run.status) }}</ion-badge>
              </ion-item>
              <ion-accordion-group>
                <ion-accordion value="contracts">
                  <ion-item slot="header">
                    <ion-icon slot="start" :icon="terminalOutline" />
                    <ion-label>{{ copy("Available setup tools") }}</ion-label>
                  </ion-item>
                  <ion-list slot="content">
                    <ion-item v-for="tool in setupAgentToolContracts" :key="tool.id">
                      <ion-label class="ion-text-wrap">
                        {{ tool.label }}
                        <p>{{ tool.endpoint || tool.purpose }}</p>
                      </ion-label>
                      <ion-badge slot="end">{{ copy(tool.mode) }}</ion-badge>
                    </ion-item>
                  </ion-list>
                </ion-accordion>
              </ion-accordion-group>
            </ion-list>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter
} from "@ionic/vue";
import {
  alertCircleOutline,
  businessOutline,
  chatbubbleEllipsesOutline,
  checkmarkCircleOutline,
  constructOutline,
  cubeOutline,
  documentTextOutline,
  ellipseOutline,
  gitBranchOutline,
  gitNetworkOutline,
  openOutline,
  peopleOutline,
  personCircleOutline,
  playOutline,
  refreshOutline,
  sendOutline,
  serverOutline,
  sparklesOutline,
  storefrontOutline,
  terminalOutline
} from "ionicons/icons";
import { computed, reactive, ref, watch } from "vue";
import { commonUtil } from "@common";
import { useOnboardingStore } from "@/store/onboarding";
import { useProductStore } from "@/store/productStore";
import { useShopifyStore } from "@/store/shopify";
import { useUtilStore } from "@/store/util";
import { generateInternalId } from "@/utils";
import useServiceJob from "@/composables/useServiceJob";
import {
  SetupAnswers,
  SetupSnapshot,
  buildPhysicalNodes,
  buildSetupPackage,
  buildTechnicalNodes,
  defaultSetupAnswers,
  roleBundles,
  sourceOfTruthObjects,
  sourceOfTruthSystems,
  workflowOptions
} from "@/data/setupAgentCatalog";
import {
  SetupToolRun,
  buildExecutionSteps,
  createColdStartSnapshot,
  createDraftToolRuns,
  fetchSystemMessageRemotes,
  setupAgentToolContracts,
  summarizeSnapshot
} from "@/services/setupAgentTools";

type Message = {
  id: string;
  role: "agent" | "user";
  content: string;
};

type PackageSection = {
  id: string;
  label: string;
  icon: string;
  items: string[];
};

const cloneAnswers = (): SetupAnswers => JSON.parse(JSON.stringify(defaultSetupAnswers));
const copy = (value: string) => value;

const productStoreStore = useProductStore();
const shopifyStore = useShopifyStore();
const utilStore = useUtilStore();
const onboardingStore = useOnboardingStore();
const { jobs, fetchJobs } = useServiceJob();

const activePanel = ref("agent");
const draftMessage = ref("");
const targetMode = ref<"create" | "existing">("create");
const productStoreId = ref("");
const defaultCurrencyUomId = ref("USD");
const applyingConfig = ref(false);
const answers = reactive<SetupAnswers>(cloneAnswers());
const snapshot = ref<SetupSnapshot>(createColdStartSnapshot());
const toolRuns = ref<SetupToolRun[]>(summarizeSnapshot(snapshot.value));
const messages = ref<Message[]>([
  {
    id: "agent-opening",
    role: "agent",
    content: "Tell me what you want HotWax to help with first. I will decide what to ask next and translate the answers into OMS setup."
  }
]);

const packageConfig = computed(() => buildSetupPackage(answers));
const physicalNodes = computed(() => buildPhysicalNodes(answers, snapshot.value));
const technicalNodes = computed(() => buildTechnicalNodes(answers, snapshot.value));
const executionSteps = computed(() => buildExecutionSteps(answers, packageConfig.value));
const visibleToolRuns = computed(() => [...toolRuns.value, ...createDraftToolRuns(answers)]);
const productStores = computed(() => productStoreStore.productStores);
const currencies = computed(() => utilStore.currencies);
const liveMessages = computed<Message[]>(() => onboardingStore.transcript.map((message) => ({
  id: `live-${message.id}`,
  role: message.role === "assistant" ? "agent" : "user",
  content: message.content
})));
const displayMessages = computed(() => onboardingStore.isStarted ? [...messages.value, ...liveMessages.value] : messages.value);
const pendingLiveConfigCount = computed(() => onboardingStore.topics.reduce((total, topic: any) => {
  return total + (topic.slots || []).filter((slot: any) => {
    return slot.applyMode === "APPLY_LIVE" && ["ASSIGNED", "SILENT"].includes(slot.status) && slot.applied !== "Y";
  }).length;
}, 0));
const canApplyCapturedConfig = computed(() => {
  return onboardingStore.isStarted && Boolean(onboardingStore.pkg.productStoreId) && pendingLiveConfigCount.value > 0;
});

onIonViewWillEnter(async () => {
  await utilStore.fetchOrganizationPartyId();
  await Promise.all([
    productStoreStore.fetchProductStores({ fetchCounts: true }),
    productStoreStore.fetchCompany(),
    utilStore.fetchCurrencies({ uomTypeEnumId: "UT_CURRENCY_MEASURE", pageSize: 250 })
  ]);

  if (productStores.value.length === 1) {
    const onlyStore = productStores.value[0];
    targetMode.value = "existing";
    productStoreId.value = onlyStore.productStoreId || "";
    answers.productStoreName = answers.productStoreName || onlyStore.storeName || "";
  }

  answers.companyName = productStoreStore.company?.companyName || answers.companyName;
  if (!defaultCurrencyUomId.value) defaultCurrencyUomId.value = "USD";
});

const physicalMapMode = computed(() => {
  return answers.storeCount + answers.warehouseCount > 1
    ? copy("Business topology map")
    : copy("First location setup");
});

const physicalMapCaption = computed(() => {
  return answers.storeCount + answers.warehouseCount > 1
    ? copy("The interface automatically zooms out because more than one physical node is in scope.")
    : copy("The product store container stays implicit until the business adds another physical node.");
});

const technicalMapMode = computed(() => {
  const integrationCount = answers.selectedWorkflows.filter((workflow) => ["shopify", "erp", "klaviyo", "carrier"].includes(workflow)).length;
  return integrationCount > 1 ? copy("Technical stack map") : copy("First connector setup");
});

const technicalMapCaption = computed(() => {
  const integrationCount = answers.selectedWorkflows.filter((workflow) => ["shopify", "erp", "klaviyo", "carrier"].includes(workflow)).length;
  return integrationCount > 1
    ? copy("The interface automatically zooms out because more than one system path is in scope.")
    : copy("The graph stays focused on the concrete Shopify connection until another system appears.");
});

const packageSections = computed<PackageSection[]>(() => [
  {
    id: "product-store-fields",
    label: copy("ProductStore fields"),
    icon: businessOutline,
    items: packageConfig.value.productStoreFields
  },
  {
    id: "product-store-settings",
    label: copy("ProductStoreSetting records"),
    icon: constructOutline,
    items: packageConfig.value.productStoreSettings
  },
  {
    id: "permissions",
    label: copy("Permissions"),
    icon: peopleOutline,
    items: packageConfig.value.permissions
  },
  {
    id: "shopify-config",
    label: copy("Shopify and integration mappings"),
    icon: storefrontOutline,
    items: packageConfig.value.shopifyConfig
  },
  {
    id: "service-jobs",
    label: copy("Service jobs"),
    icon: serverOutline,
    items: packageConfig.value.serviceJobs
  }
]);

watch(
  () => [
    answers.companyName,
    answers.productStoreName,
    answers.storeCount,
    answers.warehouseCount,
    answers.shopifyShopCount,
    answers.productIdentifier,
    answers.selectedWorkflows.join(","),
    answers.selectedRoles.join(","),
    JSON.stringify(answers.sourceOfTruth)
  ],
  () => {
    toolRuns.value = summarizeSnapshot(snapshot.value);
  }
);

function appendMessage(role: Message["role"], content: string) {
  messages.value.push({
    id: `${role}-${Date.now()}-${messages.value.length}`,
    role,
    content
  });
}

function toggleWorkflow(workflowId: SetupAnswers["selectedWorkflows"][number]) {
  if (answers.selectedWorkflows.includes(workflowId)) {
    answers.selectedWorkflows = answers.selectedWorkflows.filter((id) => id !== workflowId);
  } else {
    answers.selectedWorkflows.push(workflowId);
  }
  const workflow = workflowOptions.find((item) => item.id === workflowId);
  if (workflow) appendMessage("agent", workflow.agentPrompt);
}

function toggleRole(roleId: SetupAnswers["selectedRoles"][number]) {
  if (answers.selectedRoles.includes(roleId)) {
    answers.selectedRoles = answers.selectedRoles.filter((id) => id !== roleId);
  } else {
    answers.selectedRoles.push(roleId);
  }
}

async function sendMessage() {
  const content = draftMessage.value.trim();
  if (!content) return;

  draftMessage.value = "";
  absorbMessage(content);
  if (onboardingStore.isStarted) {
    await onboardingStore.sendMessage(content);
  } else {
    appendMessage("user", content);
    appendMessage("agent", nextQuestion.value);
  }
}

const nextQuestion = computed(() => {
  if (!answers.selectedWorkflows.length) {
    return "What are you trying to improve first: Shopify launch, ship from store, BOPIS, store inventory, preorder, returns, integrations, or carrier labels?";
  }
  if (answers.storeCount + answers.warehouseCount <= 0) {
    return "How many stores, warehouses, and Shopify shops should be in the first rollout?";
  }
  if (Object.values(answers.sourceOfTruth).some((system) => system === "Not sure")) {
    return "Which systems own the records marked Not sure? I can keep those as pending recommendations until an owner confirms them.";
  }
  return "I have enough to draft the OMS setup package. Review the maps and generated configuration before applying anything to Moqui.";
});

function absorbMessage(content: string) {
  const text = content.toLowerCase();
  const numberMatch = text.match(/(\d+)\s+(stores?|locations?)/);
  if (numberMatch?.[1]) answers.storeCount = Number(numberMatch[1]);

  const shopMatch = text.match(/(\d+)\s+(shopify shops?|shops?)/);
  if (shopMatch?.[1]) answers.shopifyShopCount = Number(shopMatch[1]);

  const warehouseMatch = text.match(/(\d+)\s+(warehouses?|dcs?|distribution centers?)/);
  if (warehouseMatch?.[1]) answers.warehouseCount = Number(warehouseMatch[1]);

  const workflowMatches: Array<[SetupAnswers["selectedWorkflows"][number], RegExp]> = [
    ["shopify", /shopify|storefront|pos/],
    ["shipFromStore", /ship from store|sfs|fulfill|routing|broker/],
    ["bopis", /bopis|pickup|pick up|click and collect/],
    ["storeInventory", /inventory count|cycle count|receiving|transfer|scanner|barcode/],
    ["preorder", /preorder|pre-order|backorder|pre-sell/],
    ["returns", /return|cancel|exchange|refund/],
    ["erp", /netsuite|erp|ap21|acumatica|finance|procurement/],
    ["klaviyo", /klaviyo|email|unigate/],
    ["carrier", /carrier|fedex|ups|shiphawk|label|rate shopping/]
  ];

  workflowMatches.forEach(([workflow, pattern]) => {
    if (pattern.test(text) && !answers.selectedWorkflows.includes(workflow)) {
      answers.selectedWorkflows.push(workflow);
    }
  });
}

async function startLiveSetup() {
  const payload: any = {
    productStoreId: productStoreId.value.trim() || undefined,
    retailerName: answers.companyName.trim() || answers.productStoreName.trim() || undefined
  };

  if (targetMode.value === "create") {
    const trimmedStoreName = answers.productStoreName.trim();
    if (!trimmedStoreName || !defaultCurrencyUomId.value) {
      commonUtil.showToast(copy("Please fill all the required fields"));
      return;
    }

    const nextProductStoreId = productStoreId.value.trim() || generateInternalId(trimmedStoreName);
    if (nextProductStoreId.length > 20) {
      commonUtil.showToast(copy("Product store ID cannot be more than 20 characters."));
      return;
    }

    productStoreId.value = nextProductStoreId;
    payload.productStoreId = nextProductStoreId;
    payload.storeName = trimmedStoreName;
    payload.retailerName = payload.retailerName || trimmedStoreName;
    payload.defaultCurrencyUomId = defaultCurrencyUomId.value;
    payload.payToPartyId = utilStore.organizationPartyId;
  }

  const conversationId = await onboardingStore.startAndGreet(payload);
  if (!conversationId) {
    commonUtil.showToast(copy("Failed to start setup."));
    return;
  }

  await productStoreStore.fetchProductStores({ fetchCounts: true });
  await onboardingStore.fetchPackage();
  snapshot.value = {
    ...snapshot.value,
    mode: "live",
    productStores: productStoreStore.productStores
  };
  toolRuns.value = summarizeSnapshot(snapshot.value);
  activePanel.value = "maps";
}

function setProductStoreIdFromName() {
  if (!productStoreId.value && answers.productStoreName.trim()) {
    productStoreId.value = generateInternalId(answers.productStoreName);
  }
}

function approvalSummary(approval: any) {
  if (!approval.arguments) return copy("The agent wants to write captured setup values to the live store.");
  try {
    const args = typeof approval.arguments === "string" ? JSON.parse(approval.arguments) : approval.arguments;
    return args.topicId
      ? `${copy("Scope")}: ${args.topicId}${args.slotKey ? ` / ${args.slotKey}` : ""}`
      : copy("Apply all approved live ProductStore fields and ProductStoreSettings.");
  } catch {
    return copy("The agent wants to write captured setup values to the live store.");
  }
}

async function decideApproval(approval: any, approved: boolean) {
  const id = approval.toolCallRequestId || approval.id;
  if (!id) return;
  await onboardingStore.decide(id, approved);
}

async function applyCapturedConfig() {
  if (!canApplyCapturedConfig.value) return;

  applyingConfig.value = true;
  try {
    const result = await onboardingStore.applyConfig();
    commonUtil.showToast(`${result?.appliedCount || 0} ${copy("settings applied")}`);
    await productStoreStore.fetchProductStores({ fetchCounts: true });
    snapshot.value = {
      ...snapshot.value,
      mode: "live",
      productStores: productStoreStore.productStores
    };
    toolRuns.value = summarizeSnapshot(snapshot.value);
  } catch {
    commonUtil.showToast(copy("Failed to apply captured settings."));
  } finally {
    applyingConfig.value = false;
  }
}

function emulateColdStart() {
  Object.assign(answers, {
    ...cloneAnswers(),
    companyName: "Capital Hair and Beauty",
    productStoreName: "Capital Hair",
    storeCount: 60,
    warehouseCount: 1,
    shopifyShopCount: 1,
    monthlyOrderVolume: "High",
    selectedWorkflows: ["shopify", "shipFromStore", "bopis", "storeInventory", "erp", "carrier"],
    selectedRoles: ["storeAssociate", "storeManager", "inventoryManager", "routingAdmin", "integrationAdmin", "systemAdmin"],
    productIdentifier: "SHOPIFY_PRODUCT_SKU",
    sourceOfTruth: {
      Products: "Shopify",
      Prices: "NetSuite",
      Inventory: "HotWax OMS",
      Customers: "Shopify",
      Orders: "Shopify",
      Payments: "Shopify",
      POs: "NetSuite",
      Transfers: "NetSuite",
      Returns: "HotWax OMS",
      Labels: "TMS / carrier"
    }
  });
  snapshot.value = createColdStartSnapshot();
  toolRuns.value = summarizeSnapshot(snapshot.value);
  activePanel.value = "maps";
  appendMessage("agent", "I loaded a cold-start retailer model with one Shopify shop, one warehouse, and a 60-store fulfillment network. The setup package is still draft-only.");
}

async function readLiveOms() {
  toolRuns.value = setupAgentToolContracts
    .filter((tool) => tool.mode === "read")
    .map((tool) => ({
      id: `running-${tool.id}`,
      toolId: tool.id,
      label: tool.label,
      status: "running",
      summary: tool.purpose
    }));

  const [productStoresResult, facilitiesResult, facilityGroupsResult, shopifyResult, jobsResult, remotesResult] = await Promise.allSettled([
    productStoreStore.fetchProductStores({ fetchCounts: true }),
    utilStore.fetchFacilities(),
    utilStore.fetchFacilityGroups(),
    shopifyStore.fetchShopifyShops(),
    fetchJobs({}),
    fetchSystemMessageRemotes()
  ]);

  const remotes = remotesResult.status === "fulfilled" ? remotesResult.value : [];

  snapshot.value = {
    mode: "live",
    productStores: productStoresResult.status === "fulfilled" ? productStoreStore.productStores : [],
    facilities: facilitiesResult.status === "fulfilled" ? utilStore.facilities : [],
    facilityGroups: facilityGroupsResult.status === "fulfilled" ? utilStore.facilityGroups : [],
    shopifyShops: shopifyResult.status === "fulfilled" ? shopifyStore.shops : [],
    serviceJobs: jobsResult.status === "fulfilled" ? jobs.value : [],
    systemMessageRemotes: remotes
  };

  toolRuns.value = summarizeSnapshot(snapshot.value);
  appendMessage("agent", "I read the current OMS setup surfaces. If a surface came back empty, I will keep that part as a draft recommendation instead of assuming it exists.");
}

function statusColor(status: string) {
  switch (status) {
    case "ready":
    case "complete":
      return "success";
    case "running":
    case "review":
      return "primary";
    case "blocked":
    case "error":
      return "danger";
    case "missing":
      return "medium";
    default:
      return "warning";
  }
}

function nodeIcon(nodeId: string) {
  switch (nodeId) {
    case "product-store":
      return businessOutline;
    case "facilities":
      return storefrontOutline;
    case "roles":
      return peopleOutline;
    case "oms":
      return serverOutline;
    case "shopify":
      return storefrontOutline;
    case "jobs":
      return terminalOutline;
    case "unigate":
      return gitBranchOutline;
    default:
      return cubeOutline;
  }
}

function toolIcon(status: string) {
  if (status === "complete") return checkmarkCircleOutline;
  if (status === "running") return refreshOutline;
  return ellipseOutline;
}

function openDoc(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}
</script>

<style scoped>
.setup-agent__content {
  --padding-start: var(--spacer-base);
  --padding-end: var(--spacer-base);
  --padding-top: var(--spacer-base);
  --padding-bottom: var(--spacer-base);
}

.setup-agent__shell {
  display: grid;
  grid-template-columns: minmax(300px, 420px) minmax(0, 1fr);
  gap: var(--spacer-base);
  align-items: start;
}

.setup-agent__conversation,
.setup-agent__workspace {
  display: grid;
  gap: var(--spacer-base);
}

.setup-agent__maps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacer-base);
}

.setup-agent__node-list {
  display: grid;
  gap: var(--spacer-xs);
}

.setup-agent__panel--hidden {
  display: block;
}

@media (min-width: 900px) {
  .setup-agent__workspace > .setup-agent__panel--hidden,
  .setup-agent__conversation.setup-agent__panel--hidden {
    display: block;
  }
}

@media (max-width: 899px) {
  .setup-agent__shell,
  .setup-agent__maps {
    grid-template-columns: 1fr;
  }

  .setup-agent__panel--hidden {
    display: none;
  }
}
</style>
