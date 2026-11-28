<template>
  <ion-card data-testid="netsuite-orders-rules-card">
    <ion-card-header>
      <ion-card-title>{{ translate("Rules") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("The store's rules decide which records this flow sends.") }}</ion-card-subtitle>
    </ion-card-header>
    <ion-card-content v-if="isLoading">
      <ion-skeleton-text animated />
    </ion-card-content>
    <template v-else>
      <ion-list v-for="ruleSet in ruleSets" :key="ruleSet.title" lines="full">
        <ion-list-header :class="{ 'not-used': ruleSet.isNotUsed }">
          <ion-label>{{ translate(ruleSet.title) }}</ion-label>
        </ion-list-header>
        <ion-item v-if="ruleSet.isNotUsed" disabled :data-testid="`netsuite-orders-rules-not-used-${ruleSet.kind}`">
          <ion-label class="ion-text-wrap">
            <p>{{ translate("Used only when each buyer gets a NetSuite customer.") }}</p>
          </ion-label>
          <ion-badge slot="end" color="medium">{{ translate("Not used") }}</ion-badge>
        </ion-item>
        <ion-item v-if="ruleSet.facts.length" :disabled="ruleSet.isNotUsed" :data-testid="`netsuite-orders-rules-facts-${ruleSet.kind}`">
          <ion-label class="ion-text-wrap">
            {{ translate("Always required") }}
            <p v-for="fact in ruleSet.facts" :key="fact">{{ translate(fact) }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="!ruleSet.rules.length" lines="none" :disabled="ruleSet.isNotUsed">
          <ion-label>{{ translate("No active rules") }}</ion-label>
        </ion-item>
        <ion-item v-for="rule in ruleSet.rules" :key="rule.ruleId" :disabled="ruleSet.isNotUsed" :data-testid="`netsuite-orders-rule-${rule.ruleId}`">
          <ion-label class="ion-text-wrap" :class="{ 'rule-off': rule.statusId === 'ATP_RULE_DRAFT' }">
            {{ rule.ruleName || rule.ruleId }}
            <p v-if="!rule.conditions?.length">{{ translate("No other conditions") }}</p>
            <p v-for="(condition, index) in rule.conditions" :key="index">{{ describeCondition(condition) }}</p>
          </ion-label>
          <ion-badge v-if="rule.statusId === 'ATP_RULE_DRAFT'" slot="end" color="medium">{{ translate("Off") }}</ion-badge>
          <ion-button
            v-if="!ruleSet.isNotUsed && ruleSet.ruleGroupId"
            slot="end"
            fill="clear"
            size="small"
            :title="translate('Edit rule')"
            :aria-label="translate('Edit rule')"
            :data-testid="`netsuite-orders-rule-edit-${rule.ruleId}`"
            @click="editRule(ruleSet, rule)"
          >
            <ion-icon slot="icon-only" :icon="pencilOutline" />
          </ion-button>
        </ion-item>
      </ion-list>
    </template>
  </ion-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonSkeletonText, modalController } from "@ionic/vue";
import { pencilOutline } from "ionicons/icons";
import { translate, useLiveEntity } from "@common";
import NetSuiteRuleEditModal from "@/components/netsuite-orders-flow/NetSuiteRuleEditModal.vue";
import { NETSUITE_RULE_OPERATOR_WORDS } from "@/config/netSuiteRules";
import { companyDb } from "@/db/companyDb";
import { useNetSuiteCustomerPolicy } from "@/composables/useNetSuiteOrdersFlow";

const props = defineProps<{ productStoreId: string }>();

const { first: keyDates, hydrated } = useLiveEntity<any>(
  companyDb.tables.netSuiteOrdersKeyDates,
  () => ({ equals: { productStoreId: props.productStoreId } }),
);

const isLoading = computed(() => !hydrated.value || !keyDates.value);
const { usesLocationCustomer } = useNetSuiteCustomerPolicy(() => props.productStoreId);

const ruleSets = computed(() => [
  ...(keyDates.value?.customerRuleGroupId
    ? [{ kind: "customer", title: "Customer rules", facts: keyDates.value.customerFacts ?? [], rules: keyDates.value.customerRules ?? [], isNotUsed: usesLocationCustomer.value, ruleGroupId: keyDates.value.customerRuleGroupId, goLiveDateFieldName: "partyCreatedDate" }]
    : []),
  { kind: "order", title: "Order rules", facts: keyDates.value?.orderFacts ?? [], rules: keyDates.value?.orderRules ?? [], isNotUsed: false, ruleGroupId: keyDates.value?.orderRuleGroupId, goLiveDateFieldName: "orderDate" },
  { kind: "payment", title: "Payment rules", facts: keyDates.value?.paymentFacts ?? [], rules: keyDates.value?.paymentRules ?? [], isNotUsed: false, ruleGroupId: keyDates.value?.paymentRuleGroupId, goLiveDateFieldName: "orderDate" },
]);


async function editRule(ruleSet: any, rule: any) {
  const modal = await modalController.create({
    component: NetSuiteRuleEditModal,
    componentProps: { rule, ruleGroupId: ruleSet.ruleGroupId, goLiveDateFieldName: ruleSet.goLiveDateFieldName },
  });
  await modal.present();
}

const describeCondition = (condition: { fieldName?: string; operator?: string; fieldValue?: string }) => {
  const operatorWords = condition.operator && NETSUITE_RULE_OPERATOR_WORDS[condition.operator] ? translate(NETSUITE_RULE_OPERATOR_WORDS[condition.operator]) : condition.operator;
  const fieldValue = condition.fieldValue?.split(",").join(", ");
  return [condition.fieldName, operatorWords, fieldValue].filter((part) => part).join(" ");
};
</script>

<style scoped>
.rule-off {
  color: var(--ion-color-medium);
}

.not-used {
  opacity: .3;
}
</style>
