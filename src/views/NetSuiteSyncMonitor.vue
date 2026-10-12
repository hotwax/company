<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/netsuite" />
        </ion-buttons>
        <ion-title>{{ translate("NetSuite sync monitoring") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="!activeGroupId || isRunning" @click="runSelectedGroupNow()">
            <ion-icon slot="start" :icon="playOutline" />
            {{ translate("Run now") }}
          </ion-button>
        </ion-buttons>
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
              <ion-card-subtitle>{{ translate("Orders pending sync") }}</ion-card-subtitle>
              <ion-card-title>
                <!--
                  Three distinct states, never collapsed: a real number, "unavailable" when the OMS
                  cannot answer, and a skeleton while the first worker tick lands. Rendering the
                  unavailable case as 0 would read as a healthy empty backlog.
                -->
                <template v-if="!backlogHydrated">
                  <ion-skeleton-text :animated="true" class="count-skeleton" />
                </template>
                <template v-else-if="pendingCount !== undefined">{{ pendingCount }}</template>
                <template v-else>{{ translate("Unavailable") }}</template>
              </ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <p v-if="pendingCount !== undefined">
                {{ translate("Sales orders in this store with no NetSuite order ID yet.") }}
              </p>
              <p v-else-if="backlogHydrated">
                {{ translate("This OMS does not expose the pending order count. It ships in mantle-netsuite-connector; until that release is deployed the backlog cannot be read.") }}
              </p>
              <p v-if="backlogCheckedAt" class="overline">
                {{ translate("Checked") }} {{ formatDateTime(backlogCheckedAt) }}
              </p>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Recent failures") }}</ion-card-subtitle>
              <ion-card-title>{{ failedRuns.length }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <p>{{ translate("Rule group runs that reported an error.") }}</p>
              <p v-if="latestRun" class="overline">
                {{ translate("Last run") }} {{ formatDateTime(latestRun.startDate) }}
              </p>
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Active rules") }}</ion-card-subtitle>
              <ion-card-title>{{ activeRules.length }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <p>{{ translate("Rules deciding which orders are exported.") }}</p>
              <p v-if="archivedRules.length" class="overline">
                {{ archivedRules.length }} {{ translate("archived") }}
              </p>
            </ion-card-content>
          </ion-card>
        </section>

        <!-- Rule groups -->
        <h1>{{ translate("Order push rule groups") }}</h1>

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
          <h1>{{ translate("Rules") }}</h1>
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
          <h1>{{ translate("Recent runs") }}</h1>
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
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle,
  IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonNote,
  IonPage, IonSkeletonText, IonText, IonTitle, IonToggle, IonToolbar, onIonViewDidLeave,
  onIonViewWillEnter,
} from "@ionic/vue";
import { alertCircleOutline, checkmarkCircleOutline, playOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useNetSuiteProductStore } from "@/composables/useProductStores";
import { useCacheSync } from "@/composables/useCacheSync";
import {
  describeConditions,
  describeSortBy,
  ignoredConditions,
  runDurationMs,
  useNetSuiteDecisionRules,
  useNetSuiteOrderPushBacklog,
  useNetSuiteRecentRuns,
  useNetSuiteRuleGroupMutations,
  useNetSuiteRuleGroupRuns,
  useNetSuiteRuleGroups,
  useNetSuiteRulesByGroup,
} from "@/composables/useNetSuiteSync";

const { netSuiteProductStore } = useNetSuiteProductStore();
const productStoreId = computed<string | undefined>(() => netSuiteProductStore.value?.productStoreId);

const activeGroupId = ref<string | undefined>(undefined);
const pendingRuleId = ref<string | undefined>(undefined);
const isRunning = ref(false);

const { groups, hydrated: groupsHydrated } = useNetSuiteRuleGroups(() => productStoreId.value);
const { rules: activeRules, archivedRules, hydrated: rulesHydrated } =
  useNetSuiteDecisionRules(() => activeGroupId.value);
const { runs, hydrated: runsHydrated, latest: latestRun } =
  useNetSuiteRuleGroupRuns(() => activeGroupId.value);
const { failed: failedRuns } =
  useNetSuiteRecentRuns(() => groups.value.map((group: any) => group.ruleGroupId));
const { pendingCount, checkedAt: backlogCheckedAt, hydrated: backlogHydrated } =
  useNetSuiteOrderPushBacklog(() => productStoreId.value);

const { setRuleEnabled: setRuleEnabledApi, runNow } = useNetSuiteRuleGroupMutations();
const { start: startSyncDomains, stop: stopSyncDomains } = useCacheSync();

// Rules for every group are already cached, so the per-group count needs no extra read.
const { countFor: ruleCountFor } = useNetSuiteRulesByGroup();

/** Select the first group once they land, so the page is never empty with a group available. */
watch(groups, (list) => {
  if (!activeGroupId.value && list.length) activeGroupId.value = list[0].ruleGroupId;
});

function formatDateTime(value: any): string {
  return value ? commonUtil.getDateAndTime(Number(value)) : "-";
}

function durationOf(run: any): string {
  const ms = runDurationMs(run);
  if (ms === undefined) return "";
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
  if (!activeGroupId.value) return;
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
    ? [{ name: "netSuiteOrderPush", args: { productStoreId: productStoreId.value, runsPerGroup: 25 } }]
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
