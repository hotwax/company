<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/netsuite" />
        </ion-buttons>
        <ion-title>{{ translate("NetSuite sync") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <!-- Store is the scope for everything below: no store mapped, nothing to monitor. -->
      <ion-card v-if="!productStoreId" class="ion-margin-top">
        <ion-card-header>
          <ion-card-title>{{ translate("No NetSuite product store") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          {{ translate("Map a product store to a NetSuite subsidiary before monitoring order sync.") }}
        </ion-card-content>
      </ion-card>

      <template v-else>
        <section class="summary-grid ion-margin-top">
          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Sales orders") }}</ion-card-subtitle>
              <ion-card-title>{{ translate("Order export") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <p>{{ translate("Target flow") }}: {{ translate("Customer → sales order → deposit") }}</p>
              <p v-if="!backlogHydrated"><ion-skeleton-text :animated="true" class="count-skeleton" /></p>
              <p v-else-if="pendingCount !== undefined">
                <strong>{{ pendingCount }}</strong> {{ translate("sales orders have no NetSuite ID") }}
              </p>
              <p v-else>{{ translate("The count of orders without a NetSuite ID is unavailable.") }}</p>
              <p>{{ translate("This is not a count of failed or eligible orders.") }}</p>
              <p v-if="backlogCheckedAt" class="overline">{{ translate("Checked") }} {{ formatDateTime(backlogCheckedAt) }}</p>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Returns") }}</ion-card-subtitle>
              <ion-card-title>{{ translate("Return processing") }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <p>{{ translate("Target records") }}: {{ translate("RMA · item receipt · credit memo · settlement") }}</p>
              <p v-if="!jobsHydrated"><ion-skeleton-text :animated="true" class="count-skeleton" /></p>
              <template v-else-if="returnJobs.length">
                <p>{{ returnJobs.length }} {{ translate("NetSuite return jobs in this OMS") }}</p>
                <p>{{ activeReturnJobs.length }} {{ translate("active") }},
                  {{ returnJobs.length - activeReturnJobs.length }} {{ translate("paused") }}</p>
              </template>
              <p v-else>{{ translate("No NetSuite return jobs found in this OMS job list.") }}</p>
              <p>{{ translate("Job configuration alone does not confirm return completion.") }}</p>
            </ion-card-content>
          </ion-card>
        </section>

        <h1>{{ translate("Data Manager activity") }}</h1>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ translate("Sales order processing") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("MDM_NS_SO_RESTLET, across all stores") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p>{{ translate("A finished file can still contain failed orders. Open a run to read its failed records.") }}</p>
            <p v-if="!mdmHydrated">{{ translate("Loading activity") }}</p>
            <p v-else-if="!recentMdmLogs.length">{{ translate("No Data Manager runs loaded for this configuration.") }}</p>
          </ion-card-content>
          <ion-list v-if="recentMdmLogs.length" lines="full">
            <ion-item v-for="log in recentMdmLogs" :key="log.logId" button detail @click="openMdmLog(log)">
              <ion-icon slot="start" :icon="logIcon(log)" :color="logColor(log)" />
              <ion-label class="ion-text-wrap">
                {{ translate("Run") }} #{{ log.logId }}
                <p>{{ formatDateTime(log.createdDate) }}<template v-if="isMdmTerminal(log)"> — {{ logStateLabel(log) }}</template></p>
              </ion-label>
              <ion-note slot="end">
                <template v-if="logOutcome(log).state === 'pending' || logOutcome(log).state === 'active'">{{ logStateLabel(log) }}</template>
                <template v-else>{{ logOutcome(log).failed }} / {{ logOutcome(log).total }} {{ translate("failed") }}</template>
              </ion-note>
            </ion-item>
          </ion-list>
        </ion-card>

        <h1>{{ translate("Order queue rules") }}</h1>
        <p>{{ translate("Rules decide which eligible orders are picked first. They do not decide whether an order is valid for NetSuite.") }}</p>

        <!-- Rule groups -->
        <ion-card v-if="groupsHydrated && !groups.length">
          <ion-card-content>
            {{ translate("No NetSuite order push rule group is configured for this product store.") }}
          </ion-card-content>
        </ion-card>

        <ion-list v-else lines="full">
          <ion-item
            v-for="group in groups"
            :key="group.ruleGroupId"
            button
            :detail="false"
            :color="group.ruleGroupId === activeGroupId ? 'light' : undefined"
            @click="activeGroupId = group.ruleGroupId"
          >
            <!--
              The id is shown only when it is not already the title. Unnamed groups came back with
              the id repeated as name AND description, which read as two different facts.
            -->
            <ion-label class="ion-text-wrap">
              {{ group.groupName || group.ruleGroupId }}
              <p v-if="group.description">{{ group.description }}</p>
              <p v-if="group.groupName">{{ group.ruleGroupId }}</p>
              <p v-if="group.jobName">{{ translate("Job") }}: {{ group.jobName }}</p>
            </ion-label>
            <ion-note slot="end">{{ ruleCountFor(group.ruleGroupId) }} {{ translate("rules") }}</ion-note>
          </ion-item>
        </ion-list>

        <!-- Rules in the selected group -->
        <template v-if="activeGroupId">
          <div class="ion-margin-top">
            <ion-button size="small" fill="outline" :disabled="isRunning" @click="runSelectedGroupNow()">
              <ion-icon slot="start" :icon="playOutline" />
              {{ translate("Run selected group now") }}
            </ion-button>
          </div>
          <h2>{{ translate("Rules") }}</h2>
          <ion-card v-if="rulesHydrated && !activeRules.length && !archivedRules.length">
            <ion-card-content>
              {{ translate("This rule group has no rules, so the order push exports nothing.") }}
            </ion-card-content>
          </ion-card>

          <ion-list v-else lines="full">
            <ion-item v-for="rule in activeRules" :key="rule.ruleId">
              <ion-toggle
                slot="start"
                :checked="true"
                :disabled="pendingRuleId === rule.ruleId"
                @ion-change="setRuleEnabled(rule, false)"
              />
              <ion-label class="ion-text-wrap">
                {{ rule.ruleName || rule.ruleId }}
                <p v-for="clause in describeConditions(rule)" :key="clause">{{ clause }}</p>
                <p v-if="!describeConditions(rule).length">{{ translate("No filter conditions — this rule matches every eligible order.") }}</p>
                <p v-if="describeSortBy(rule).length">
                  {{ translate("Sorted by") }}: {{ describeSortBy(rule).join(", ") }}
                </p>
                <!--
                  A condition stored under the rule engine's own enum is ignored by the NetSuite feed
                  (it matches poorti's enum instead). Nothing else makes that visible: the rule looks
                  configured and the run succeeds, and the only symptom is over-exporting.
                -->
                <p v-if="ignoredConditions(rule).length">
                  <ion-text color="danger">
                    {{ translate("Not applied by the order push") }}: {{ ignoredConditions(rule).join(", ") }}
                  </ion-text>
                </p>
              </ion-label>
              <ion-note slot="end">#{{ rule.sequenceNum ?? "-" }}</ion-note>
            </ion-item>

            <template v-if="archivedRules.length">
              <ion-item-divider>
                <ion-label>{{ translate("Archived") }}</ion-label>
              </ion-item-divider>
              <ion-item v-for="rule in archivedRules" :key="rule.ruleId">
                <ion-toggle
                  slot="start"
                  :checked="false"
                  :disabled="pendingRuleId === rule.ruleId"
                  @ion-change="setRuleEnabled(rule, true)"
                />
                <ion-label class="ion-text-wrap">
                  {{ rule.ruleName || rule.ruleId }}
                  <p v-for="clause in describeConditions(rule)" :key="clause">{{ clause }}</p>
                </ion-label>
              </ion-item>
            </template>
          </ion-list>

          <!-- Run history -->
          <h2>{{ translate("Rule group runs") }}</h2>
          <ion-card v-if="runsHydrated && !runs.length">
            <ion-card-content>
              <p>{{ translate("No rule group runs recorded.") }}</p>
              <!--
                Explicit, because an empty history here is genuinely ambiguous: only the rule-group
                scheduler writes RuleGroupRun rows, so a group driven as a plain scheduled job syncs
                orders while leaving this list empty. Saying "no runs" alone would read as an outage.
              -->
              <p class="ion-text-wrap">
                {{ translate("Only runs started through the rule group scheduler are recorded here. If the order push is scheduled as a plain job, check its job runs instead.") }}
              </p>
            </ion-card-content>
          </ion-card>

          <ion-list v-else lines="full">
            <ion-item v-for="run in runs" :key="run.ruleGroupRunId">
              <ion-icon
                slot="start"
                :icon="run.hasError === 'Y' ? alertCircleOutline : checkmarkCircleOutline"
                :color="run.hasError === 'Y' ? 'danger' : 'success'"
              />
              <ion-label class="ion-text-wrap">
                {{ formatDateTime(run.startDate) }}
                <p v-if="run.ruleGroupRunResult">{{ run.ruleGroupRunResult }}</p>
                <p v-else-if="!run.endDate">{{ translate("Running") }}</p>
              </ion-label>
              <ion-note v-if="durationOf(run)" slot="end">{{ durationOf(run) }}</ion-note>
            </ion-item>
          </ion-list>
        </template>
      </template>
    </ion-content>

    <ion-modal :is-open="mdmModalOpen" @didDismiss="resetMdmLog">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-button :aria-label="translate('Close')" @click="closeMdmLog"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button></ion-buttons>
          <ion-title>{{ translate("Data Manager run") }} #{{ selectedMdmLog?.logId }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p>{{ translate("Sales order processing across all stores") }}</p>
        <p>{{ logStateLabel(selectedMdmLog) }} — {{ formatDateTime(selectedMdmLog?.createdDate) }}</p>
        <p>{{ logOutcome(selectedMdmLog).success }} {{ translate("succeeded") }},
          {{ logOutcome(selectedMdmLog).failed }} {{ translate("failed") }}</p>
        <h2>{{ translate("Failed records") }}</h2>
        <p v-if="hasTestOrderHold" class="ion-padding-bottom">
          {{ translate("These orders have an active TEST_ORDER_HOLD task. Review the task on each order. If the hold is intentional, leave it in place; otherwise resolve it before retrying the order push.") }}
        </p>
        <p v-if="isMdmDetailLoading">{{ translate("Loading failed records") }}</p>
        <p v-else-if="mdmDetailError">{{ mdmDetailError }}</p>
        <p v-else-if="!errorLogs.length">{{ translate("No failed-record details are attached to this run.") }}</p>
        <ion-list v-else lines="full">
          <ion-item v-for="(record, index) in errorLogs" :key="index">
            <ion-label class="ion-text-wrap">
              {{ record.orderId || record.OrderId || translate("Record") }}
              <p>{{ record.ErrorMessage || record.errorMessage || JSON.stringify(record) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle,
  IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonModal, IonNote,
  IonPage, IonSkeletonText, IonText, IonTitle, IonToggle, IonToolbar, onIonViewDidLeave,
  onIonViewWillEnter,
} from "@ionic/vue";
import { alertCircleOutline, checkmarkCircleOutline, closeOutline, playOutline, timeOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { useCacheSync } from "@/composables/useCacheSync";
import { useDataManager, useDataManagerLogs } from "@/composables/useDataManager";
import {
  describeConditions,
  describeSortBy,
  ignoredConditions,
  runDurationMs,
  useNetSuiteDecisionRules,
  useNetSuiteOrderPushBacklog,
  useNetSuiteRuleGroupMutations,
  useNetSuiteRuleGroupRuns,
  useNetSuiteRuleGroups,
  useNetSuiteRulesByGroup,
} from "@/composables/useNetSuiteSync";
import { useNetSuiteProductStore } from "@/composables/useProductStores";
import { useServiceJobs } from "@/composables/useServiceJobs";
import { logOutcome } from "@/utils/dataManagerLog";

const { netSuiteProductStore } = useNetSuiteProductStore();
const productStoreId = computed<string | undefined>(() => netSuiteProductStore.value?.productStoreId);

const activeGroupId = ref<string | undefined>(undefined);
const pendingRuleId = ref<string | undefined>(undefined);
const isRunning = ref(false);

const { groups, hydrated: groupsHydrated } = useNetSuiteRuleGroups(() => productStoreId.value);
const { jobs, hydrated: jobsHydrated } = useServiceJobs();
const returnJobs = computed(() => jobs.value.filter((job: any) => {
  const name = `${job.jobName || ""} ${job.serviceName || ""}`;

  return /netsuite/i.test(name) && /return|rma|credit.?memo|refund/i.test(name);
}));
const activeReturnJobs = computed(() => returnJobs.value.filter((job: any) => job.paused !== "Y"));
const { logs: mdmLogs, hydrated: mdmHydrated } = useDataManagerLogs("MDM_NS_SO_RESTLET");
const recentMdmLogs = computed(() => mdmLogs.value.slice(0, 5));
const selectedMdmLog = ref<any>(null);
const mdmModalOpen = ref(false);
const mdmDetailError = ref("");
const { fetchLogDetails, errorLogs, loading: isMdmDetailLoading } = useDataManager();
const hasTestOrderHold = computed(() => errorLogs.value.some((record: any) =>
  String(record.ErrorMessage || record.errorMessage || "").includes("TEST_ORDER_HOLD")));
const { rules: activeRules, archivedRules, hydrated: rulesHydrated } =
  useNetSuiteDecisionRules(() => activeGroupId.value);
const { runs, hydrated: runsHydrated } =
  useNetSuiteRuleGroupRuns(() => activeGroupId.value);
const { pendingCount, checkedAt: backlogCheckedAt, hydrated: backlogHydrated } =
  useNetSuiteOrderPushBacklog(() => productStoreId.value);

const { setRuleEnabled: setRuleEnabledApi, runNow } = useNetSuiteRuleGroupMutations();
const { start: startSyncDomains, stop: stopSyncDomains } = useCacheSync();

// Rules for every group are already cached, so the per-group count needs no extra read.
const { countFor: ruleCountFor } = useNetSuiteRulesByGroup();

/** Select the first group once they land, so the page is never empty with a group available. */
watch(groups, (list) => {
  if(!activeGroupId.value && list.length) { activeGroupId.value = list[0].ruleGroupId; }
});

function formatDateTime(value: any): string {
  if(!value) { return "-"; }

  const timestamp = typeof value === "number" ? value : Number(value) || Date.parse(value);

  return Number.isFinite(timestamp) ? commonUtil.getDateAndTime(timestamp) : "-";
}

function logStateLabel(log: any): string {
  const state = logOutcome(log).state;

  return translate(state === "active" ? "Running" : state === "completed" ? "Completed"
    : state === "partial" ? "Partially completed" : state === "failed" ? "Failed" : "Pending");
}

function isMdmTerminal(log: any): boolean {
  const state = logOutcome(log).state;

  return state === "completed" || state === "partial" || state === "failed";
}

function logIcon(log: any) {
  const state = logOutcome(log).state;

  return state === "active" || state === "pending" ? timeOutline
    : state === "completed" ? checkmarkCircleOutline : alertCircleOutline;
}

function logColor(log: any) {
  const state = logOutcome(log).state;

  return state === "completed" ? "success" : state === "active" || state === "pending" ? "medium" : "danger";
}

async function openMdmLog(log: any) {
  selectedMdmLog.value = log;
  mdmModalOpen.value = true;
  mdmDetailError.value = "";
  errorLogs.value = [];
  try {
    await fetchLogDetails(String(log.logId));
  } catch (error) {
    logger.error("Failed to load NetSuite Data Manager run", log.logId, error);
    mdmDetailError.value = translate("Failed to load failed-record details.");
  }
}

function closeMdmLog() {
  mdmModalOpen.value = false;
}

function resetMdmLog() {
  mdmModalOpen.value = false;
  selectedMdmLog.value = null;
  errorLogs.value = [];
}

function durationOf(run: any): string {
  const ms = runDurationMs(run);

  if(ms === undefined) { return ""; }

  return ms < 1000 ? `${ms} ms` : `${Math.round(ms / 100) / 10} s`;
}

async function setRuleEnabled(rule: any, enabled: boolean) {
  pendingRuleId.value = rule.ruleId;
  try {
    await setRuleEnabledApi(rule.ruleId, enabled);
    commonUtil.showToast(translate(enabled ? "Rule enabled" : "Rule disabled"));
    // The write returns the PK only, so the cache is refreshed from the worker rather than patched.
    await startSyncDomains(activeSyncDomains());
  } catch (error) {
    logger.error("Failed to change NetSuite rule status", rule.ruleId, error);
    commonUtil.showToast(translate("Failed to update rule"));
  }
  pendingRuleId.value = undefined;
}

async function runSelectedGroupNow() {
  if(!activeGroupId.value) { return; }

  isRunning.value = true;
  try {
    await runNow(activeGroupId.value);
    commonUtil.showToast(translate("Order push scheduled"));
  } catch (error) {
    logger.error("Failed to run NetSuite order push", activeGroupId.value, error);
    commonUtil.showToast(translate("Failed to start the order push"));
  }
  isRunning.value = false;
}

function activeSyncDomains() {
  // Skipped entirely without a store: an unscoped read would cache another store's rule groups as
  // this one's. See the guard in the domain itself.
  return productStoreId.value
    ? [
      { name: "netSuiteOrderPush", args: { productStoreId: productStoreId.value, runsPerGroup: 25 } },
      { name: "dataManagerLog", args: { configId: "MDM_NS_SO_RESTLET", total: 25, batchSize: 25, refreshMax: 5 } },
    ]
    : [];
}

// The product store is resolved from the cache, so it usually arrives after first paint.
watch(productStoreId, () => { void startSyncDomains(activeSyncDomains()); });

onIonViewWillEnter(() => { void startSyncDomains(activeSyncDomains()); });
onIonViewDidLeave(() => { stopSyncDomains(); });
</script>

<style scoped>
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacer-sm);
}

.count-skeleton {
  width: var(--spacer-3xl);
}
</style>
