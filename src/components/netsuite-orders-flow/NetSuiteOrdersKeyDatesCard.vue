<template>
  <ion-card data-testid="netsuite-orders-key-dates-card">
    <ion-card-header>
      <ion-card-title>{{ translate("Key dates") }}</ion-card-title>
      <ion-card-subtitle>{{ translate("The dates that decide which records this flow sends.") }}</ion-card-subtitle>
    </ion-card-header>
    <ion-card-content v-if="isLoading">
      <ion-skeleton-text animated />
    </ion-card-content>
    <template v-else>
      <ion-list lines="full">
        <template v-for="flow in flows" :key="flow.id">
          <ion-item :disabled="flow.isNotUsed" :data-testid="flow.testId">
            <ion-label class="ion-text-wrap">
              {{ translate(flow.title) }}
              <p v-if="flow.isNotUsed">{{ translate("Used only when each buyer gets a NetSuite customer.") }}</p>
              <p v-else-if="flow.goLiveDate">{{ translate(flow.dateLine, { date: commonUtil.getDateAndTime(flow.goLiveDate) }) }}</p>
              <p v-else>{{ translate(flow.noDateLine) }}</p>
              <p v-if="flow.sharedNote && !flow.isNotUsed">{{ flow.sharedNote }}</p>
            </ion-label>
            <ion-badge v-if="flow.isNotUsed" slot="end" color="medium">{{ translate("Not used") }}</ion-badge>
            <ion-button
              v-else-if="flow.goLiveDate"
              slot="end"
              fill="clear"
              size="small"
              :title="translate('Change go-live date')"
              :aria-label="translate('Change go-live date')"
              :data-testid="`${flow.testId}-change`"
              @click="chooseGoLiveDate(flow)"
            >
              <ion-icon slot="icon-only" :icon="calendarOutline" />
            </ion-button>
          </ion-item>
          <template v-if="flow.moves.length && !flow.isNotUsed">
            <ion-item-divider color="light">
              <ion-label>{{ translate("{flow}: go-live history", { flow: translate(flow.title) }) }}</ion-label>
            </ion-item-divider>
            <ion-item v-for="move in flow.moves" :key="`${move.changedDate}-${move.newGoLiveDate}`" :data-testid="`${flow.testId}-move`">
              <ion-label class="ion-text-wrap">
                {{ move.oldGoLiveDate ? translate("{from} to {to}", { from: commonUtil.getDateAndTime(move.oldGoLiveDate), to: commonUtil.getDateAndTime(move.newGoLiveDate) }) : translate("Set to {to}", { to: commonUtil.getDateAndTime(move.newGoLiveDate) }) }}
                <p v-if="move.changeReason">{{ move.changeReason }}</p>
                <p>{{ translate("{who} on {when}", { who: move.changedByUsername, when: commonUtil.getDateAndTime(move.changedDate) }) }}</p>
              </ion-label>
            </ion-item>
          </template>
        </template>
        <ion-item lines="none" data-testid="netsuite-orders-dateless-steps">
          <ion-label class="ion-text-wrap">
            <p>{{ dateless }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="hasPaymentDateGap" color="warning" data-testid="netsuite-orders-payment-date-gap">
          <ion-label class="ion-text-wrap">
            {{ paymentDateGapMessage }}
          </ion-label>
        </ion-item>
      </ion-list>
    </template>
  </ion-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DateTime } from "luxon";
import { calendarOutline } from "ionicons/icons";
import { IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonSkeletonText, alertController } from "@ionic/vue";
import { commonUtil, logger, translate, useLiveEntity } from "@common";
import { companyDb } from "@/db/companyDb";
import { moveFlowGoLiveDate, useNetSuiteCustomerPolicy } from "@/composables/useNetSuiteOrdersFlow";
import { NETSUITE_ORDER_STEPS } from "@/config/netSuiteOrderSteps";

const props = defineProps<{ productStoreId: string }>();

const { first: keyDates, hydrated } = useLiveEntity<any>(
  companyDb.tables.netSuiteOrdersKeyDates,
  () => ({ equals: { productStoreId: props.productStoreId } }),
);

const isLoading = computed(() => !hydrated.value || !keyDates.value);
const { usesLocationCustomer } = useNetSuiteCustomerPolicy(() => props.productStoreId);

const hasPaymentDateGap = computed(() => Boolean(keyDates.value?.paymentRuleGroupId)
  && keyDates.value?.paymentGoLiveDate !== keyDates.value?.orderGoLiveDate);

const paymentDateGapMessage = computed(() => keyDates.value?.paymentGoLiveDate
  ? translate("The payment rules use a different date: payments on orders placed after {date}.", { date: commonUtil.getDateAndTime(keyDates.value.paymentGoLiveDate) })
  : translate("The payment rules have no go-live date: a payment rule has no date condition."));

interface FlowGoLive {
  id: string;
  testId: string;
  title: string;
  dateLine: string;
  noDateLine: string;
  moveMessage: string;
  ruleGroupId: string;
  dateFieldName: string;
  goLiveDate?: number;
  moves: any[];
  isNotUsed: boolean;
  sharedNote?: string;
}

const stepLabels = (steps: string[]) => {
  const labels = steps.map((step) => translate(NETSUITE_ORDER_STEPS[step].label));
  return labels.length > 1 ? translate("{first} and {last}", { first: labels.slice(0, -1).join(", "), last: labels[labels.length - 1] }) : labels.join("");
};

const paymentSharedNote = computed(() => {
  const dates = keyDates.value ?? {};
  const sharingSteps = [
    dates.exchangePaymentRuleGroupId === dates.paymentRuleGroupId ? "exchange-payment" : "",
    dates.refundRuleGroupId === dates.paymentRuleGroupId ? "refund" : "",
  ].filter(Boolean);
  return sharingSteps.length ? translate("{steps} use these rules too, so they move with this date.", { steps: stepLabels(sharingSteps) }) : "";
});

const dateless = computed(() => translate("{steps} have no date. They only change orders NetSuite already has.", { steps: stepLabels(["line-close", "order-change", "order-moved"]) }));

const flows = computed<FlowGoLive[]>(() => {
  const dates = keyDates.value ?? {};
  return [
    {
      id: "order", testId: "netsuite-orders-go-live", title: "Orders",
      dateLine: "Orders placed after {date}", noDateLine: dates.orderRules?.length ? "No go-live date: an order rule has no date condition." : "No order rules for this store.",
      moveMessage: "Orders placed after the new date go to NetSuite. The history keeps the old date, the new date and the reason.",
      ruleGroupId: dates.orderRuleGroupId, dateFieldName: "orderDate", goLiveDate: dates.orderGoLiveDate, moves: dates.orderGoLiveMoves ?? [], isNotUsed: false,
    },
    {
      id: "customer", testId: "netsuite-orders-customer-go-live", title: "Customers",
      dateLine: "Customers created after {date}", noDateLine: "No customer date: a customer rule has no date condition.",
      moveMessage: "Customers created after the new date go to NetSuite. The history keeps the old date, the new date and the reason.",
      ruleGroupId: dates.customerRuleGroupId, dateFieldName: "partyCreatedDate", goLiveDate: dates.customerGoLiveDate, moves: dates.customerGoLiveMoves ?? [], isNotUsed: usesLocationCustomer.value,
    },
    {
      id: "payment", testId: "netsuite-orders-payment-go-live", title: "Payments",
      dateLine: "Payments on orders placed after {date}", noDateLine: "No payment date: a payment rule has no date condition.",
      moveMessage: "Payments on orders placed after the new date go to NetSuite. The history keeps the old date, the new date and the reason.",
      ruleGroupId: dates.paymentRuleGroupId, dateFieldName: "orderDate", goLiveDate: dates.paymentGoLiveDate, moves: dates.paymentGoLiveMoves ?? [], isNotUsed: false,
      sharedNote: paymentSharedNote.value,
    },
    {
      id: "storeShipment", testId: "netsuite-orders-store-shipment-go-live", title: "Store shipments",
      dateLine: "Store shipments of orders placed after {date}", noDateLine: "No store shipment date: a store shipment rule has no date condition.",
      moveMessage: "Store shipments of orders placed after the new date go to NetSuite. The history keeps the old date, the new date and the reason.",
      ruleGroupId: dates.storeShipmentRuleGroupId, dateFieldName: "orderDate", goLiveDate: dates.storeShipmentGoLiveDate, moves: dates.storeShipmentGoLiveMoves ?? [], isNotUsed: false,
    },
  ].filter((flow) => flow.id === "order" || flow.ruleGroupId);
});

async function chooseGoLiveDate(flow: FlowGoLive) {
  const alert = await alertController.create({
    header: translate("Move the {flow} go-live date", { flow: translate(flow.title).toLowerCase() }),
    message: translate(flow.moveMessage),
    inputs: [
      { name: "goLiveDate", type: "date", value: DateTime.fromMillis(Number(flow.goLiveDate)).toISODate() },
      { name: "changeReason", type: "textarea", placeholder: translate("Reason, for example: sync version 2 released") },
    ],
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Move"),
        handler: (values) => {
          const changeReason = String(values.changeReason ?? "").trim();
          if (!values.goLiveDate || !changeReason) {
            commonUtil.showToast(translate("Give the new date and the reason."));
            return false;
          }
          void moveGoLiveDate(flow, values.goLiveDate, changeReason);
        },
      },
    ],
  });
  await alert.present();
}

async function moveGoLiveDate(flow: FlowGoLive, goLiveDate: string, changeReason: string) {
  try {
    await moveFlowGoLiveDate(flow.ruleGroupId, flow.dateFieldName, `${goLiveDate} 00:00:00`, changeReason);
    commonUtil.showToast(translate("Go-live date moved"));
  } catch (error: any) {
    logger.error("Could not move the go-live date", error);
    commonUtil.showToast(error?.response?.data?.errors ?? translate("Could not move the go-live date."));
  }
}
</script>
