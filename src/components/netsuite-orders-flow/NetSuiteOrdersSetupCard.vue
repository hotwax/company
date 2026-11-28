<template>
  <ion-card data-testid="netsuite-orders-setup-card">
    <ion-card-header>
      <ion-card-title>{{ translate("Setup") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("A missing item is a warning. Orders that need it wait.") }}</ion-card-subtitle>
    </ion-card-header>
    <ion-card-content v-if="isLoading">
      <ion-skeleton-text animated />
    </ion-card-content>
    <ion-list v-else lines="full">
      <ion-item data-testid="netsuite-orders-setup-customer-policy">
        <ion-label class="ion-text-wrap">
          {{ translate("Customer policy") }}
          <p>{{ policyLabel ? translate(policyLabel) : translate("No sales order job") }}</p>
        </ion-label>
        <ion-button
          v-if="customerServiceName"
          slot="end"
          fill="clear"
          size="small"
          :title="translate('Change customer policy')"
          :aria-label="translate('Change customer policy')"
          data-testid="netsuite-orders-customer-policy-change"
          @click="choosePolicy()"
        >
          <ion-icon slot="icon-only" :icon="pencilOutline" />
        </ion-button>
      </ion-item>
      <ion-item v-for="item in setupItems" :key="item.id" :disabled="item.state === 'not-used'" :data-testid="`netsuite-orders-setup-${item.id}`">
        <ion-label class="ion-text-wrap">
          {{ translate(item.label) }}
          <p v-if="item.detail">{{ item.detail }}</p>
        </ion-label>
        <ion-button
          v-if="item.listPath && item.missingCount"
          slot="end"
          size="small"
          color="warning"
          :router-link="item.listPath"
          :data-testid="`netsuite-orders-setup-${item.id}-link`"
        >
          {{ translate("{count} missing", { count: item.missingCount }) }}
        </ion-button>
        <ion-badge v-else slot="end" :color="STATE_BADGES[item.state].color">{{ translate(STATE_BADGES[item.state].label) }}</ion-badge>
      </ion-item>
    </ion-list>
  </ion-card>
</template>

<script setup lang="ts">
import { IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonItem, IonLabel, IonList, IonSkeletonText, alertController } from "@ionic/vue";
import { pencilOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { useNetSuiteCustomerPolicy, useNetSuiteOrdersSetupItems } from "@/composables/useNetSuiteOrdersFlow";
import { CUSTOMER_POLICIES } from "@/config/netSuiteOrdersSetup";

const props = defineProps<{ productStoreId: string }>();

const STATE_BADGES: Record<string, { label: string; color: string }> = {
  done: { label: "Done", color: "success" },
  missing: { label: "Missing", color: "warning" },
  unknown: { label: "Not checked", color: "medium" },
  "not-used": { label: "Not used", color: "medium" },
};

const { isLoading, setupItems } = useNetSuiteOrdersSetupItems(() => props.productStoreId);
const { customerServiceName, policyLabel, savePolicy } = useNetSuiteCustomerPolicy(() => props.productStoreId);

async function choosePolicy() {
  const alert = await alertController.create({
    header: translate("Customer policy"),
    inputs: CUSTOMER_POLICIES.map((policy) => ({
      type: "radio" as const,
      label: translate(policy.label),
      value: policy.customerServiceName,
      checked: policy.customerServiceName === customerServiceName.value,
    })),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Save"),
        handler: (chosenServiceName: string) => {
          if (!chosenServiceName || chosenServiceName === customerServiceName.value) return;
          void changePolicy(chosenServiceName);
        },
      },
    ],
  });
  await alert.present();
}

async function changePolicy(chosenServiceName: string) {
  emitter.emit("presentLoader");
  try {
    await savePolicy(chosenServiceName);
    commonUtil.showToast(translate("Customer policy updated"));
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Customer policy was not changed.")} ${commonUtil.getErrorMessage(error)}`);
  }
  emitter.emit("dismissLoader");
}
</script>
