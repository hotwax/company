<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button :aria-label="translate('Close')" @click="modalController.dismiss()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Edit rule") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ rule.ruleName || rule.ruleId }}</ion-card-title>
      </ion-card-header>
      <ion-item lines="none">
        <ion-toggle v-model="isActive" data-testid="netsuite-rule-edit-active">{{ translate("Rule is on") }}</ion-toggle>
      </ion-item>
      <ion-item v-if="rule.hasGoLiveFilter" lines="none" disabled>
        <ion-label class="ion-text-wrap">
          {{ translate("Go-live date filter") }}
          <p>{{ translate("Change it on the Key dates card.") }}</p>
        </ion-label>
      </ion-item>
      <ion-item lines="none">
        <ion-textarea
          v-model="changeReason"
          :label="translate('Reason')"
          label-placement="stacked"
          auto-grow
          :placeholder="translate('Why this rule changes, for example: stop sending marketplace orders')"
          data-testid="netsuite-rule-edit-reason"
        />
      </ion-item>
    </ion-card>

    <ion-card>
      <ion-item lines="full">
        <ion-label>{{ translate("Filters") }}</ion-label>
        <ion-button fill="clear" :disabled="!fields.length" data-testid="netsuite-rule-edit-add-filter" @click="addFilter()">
          {{ translate("Add") }}
          <ion-icon :icon="addCircleOutline" slot="end" />
        </ion-button>
      </ion-item>
      <ion-item v-if="isLoadingFields" lines="none">
        <ion-label><ion-skeleton-text animated /></ion-label>
      </ion-item>
      <ion-item v-else-if="!filters.length" lines="none">
        <ion-label class="ion-text-wrap">{{ translate("No other filters: the rule picks every record the step's facts allow.") }}</ion-label>
      </ion-item>
      <ion-list v-for="(filter, index) in filters" :key="filter.key" lines="none" :data-testid="`netsuite-rule-edit-filter-${index}`">
        <ion-item>
          <ion-select v-model="filter.fieldName" :label="translate('Field')" interface="popover" :placeholder="translate('Select a field')">
            <ion-select-option v-for="field in fields" :key="field.fieldName" :value="field.fieldName">{{ field.fieldName }}</ion-select-option>
          </ion-select>
          <ion-button slot="end" fill="clear" color="medium" :aria-label="translate('Remove filter')" @click="filters.splice(index, 1)">
            <ion-icon slot="icon-only" :icon="closeCircleOutline" />
          </ion-button>
        </ion-item>
        <ion-item>
          <ion-select v-model="filter.operator" :label="translate('Is')" interface="popover">
            <ion-select-option v-for="operator in NETSUITE_RULE_FILTER_OPERATORS" :key="operator" :value="operator">{{ translate(operatorWords(filter.fieldName, operator)) }}</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item v-if="!NETSUITE_RULE_VALUELESS_OPERATORS.includes(filter.operator)" lines="full">
          <ion-input v-model="filter.fieldValue" :label="translate(['in', 'not-in'].includes(filter.operator) ? 'Values, separated by commas' : 'Value')" />
        </ion-item>
      </ion-list>
    </ion-card>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!canSave" :aria-label="translate('Save')" data-testid="netsuite-rule-edit-save" @click="save()">
        <ion-spinner v-if="isSaving" name="crescent" />
        <ion-icon v-else :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  IonButton, IonButtons, IonCard, IonCardHeader, IonCardTitle, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList,
  IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonTextarea, IonTitle, IonToggle, IonToolbar, modalController,
} from "@ionic/vue";
import { addCircleOutline, closeCircleOutline, closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { getRuleGroupFields, saveNetSuiteRule } from "@/composables/useNetSuiteOrdersFlow";
import {
  NETSUITE_RULE_DATE_FIELD_TYPES, NETSUITE_RULE_FILTER_OPERATORS, NETSUITE_RULE_NUMBER_OPERATOR_WORDS, NETSUITE_RULE_OPERATOR_WORDS, NETSUITE_RULE_VALUELESS_OPERATORS,
} from "@/config/netSuiteRules";

const props = defineProps<{ rule: any; ruleGroupId: string; goLiveDateFieldName: string }>();

let nextKey = 0;
const isActive = ref(props.rule.statusId !== "ATP_RULE_DRAFT");
const filters = ref((props.rule.conditions ?? []).map((condition: any) => ({ ...condition, key: nextKey++ })));
const changeReason = ref("");
const fields = ref<{ fieldName: string; fieldType: string }[]>([]);
const isLoadingFields = ref(true);
const isSaving = ref(false);

const isFilterComplete = (filter: any) => filter.fieldName && filter.operator
  && (NETSUITE_RULE_VALUELESS_OPERATORS.includes(filter.operator) || String(filter.fieldValue ?? "").trim());
const canSave = computed(() => !isSaving.value && !isLoadingFields.value && changeReason.value.trim() && filters.value.every(isFilterComplete));

onMounted(async () => {
  try {
    fields.value = await getRuleGroupFields(props.ruleGroupId);
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Could not read the fields this rule may use.")} ${commonUtil.getErrorMessage(error)}`);
  } finally {
    isLoadingFields.value = false;
  }
});

function operatorWords(fieldName: string, operator: string) {
  const fieldType = fields.value.find((field) => field.fieldName === fieldName)?.fieldType ?? "";
  const isDateField = NETSUITE_RULE_DATE_FIELD_TYPES.includes(fieldType);
  return (!isDateField && NETSUITE_RULE_NUMBER_OPERATOR_WORDS[operator]) || NETSUITE_RULE_OPERATOR_WORDS[operator];
}

function addFilter() {
  filters.value.push({ key: nextKey++, fieldName: "", operator: "equals", fieldValue: "" });
}

async function save() {
  isSaving.value = true;
  try {
    await saveNetSuiteRule({
      ruleId: props.rule.ruleId,
      isActive: isActive.value,
      filters: filters.value.map((filter: any) => ({
        conditionSeqId: filter.conditionSeqId,
        fieldName: filter.fieldName,
        operator: filter.operator,
        fieldValue: NETSUITE_RULE_VALUELESS_OPERATORS.includes(filter.operator) ? undefined : filter.fieldValue,
      })),
      goLiveDateFieldName: props.goLiveDateFieldName,
      changeReason: changeReason.value.trim(),
    });
    commonUtil.showToast(translate("Rule saved"));
    await modalController.dismiss({ saved: true });
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Nothing was saved.")} ${commonUtil.getErrorMessage(error)}`);
  } finally {
    isSaving.value = false;
  }
}
</script>
