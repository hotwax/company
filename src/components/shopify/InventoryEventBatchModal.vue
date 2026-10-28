<template>
  <ion-modal :is-open="!!batch" @will-present="resetScroll" @did-dismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" @click="emit('close')">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Batch {id}", { id: batch?.id ?? "" }) }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content ref="content">
      <ion-list v-if="batch" lines="full">
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Shopify target") }}
            <p>{{ targetLabel }}</p>
          </ion-label>
          <!-- Every row of one batch shares its delivery. -->
          <ion-badge slot="end" :color="batch.events[0]?.deliveryColor">
            {{ batch.events[0]?.deliveryLabel }}
          </ion-badge>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Publishes under") }}
            <p>{{ batch.reason }}</p>
          </ion-label>
          <ion-badge v-if="!batch.reasonMapped" slot="end" color="warning">
            {{ batch.mixedEventTypes ? translate("Mixed types") : translate("Unmapped") }}
          </ion-badge>
        </ion-item>

        <!-- The events below, summed per (inventory item, location). -->
        <ion-list-header>
          <ion-label>{{ translate("Change entries") }}</ion-label>
        </ion-list-header>
        <ion-item v-for="entry in batch.entries" :key="entry.key">
          <ion-label class="ion-text-wrap">
            {{ entry.sample.productName || translate("Item {id}", { id: entry.inventoryItemId }) }}
            <p v-if="entry.sample.productSku">
              {{ entry.sample.productSku }}
            </p>
            <p>{{ translate("{location}, item {item}", { location: entry.sample.locationLabel, item: entry.inventoryItemId }) }}</p>
            <p>{{ translate("{count} events summed", { count: entry.eventCount }) }}</p>
          </ion-label>
          <ion-note slot="end">
            {{ `${entry.delta > 0 ? "+" : ""}${entry.delta}` }}
          </ion-note>
        </ion-item>

        <!-- Why it has not landed. Without this a failed batch reads as merely "not sent yet". -->
        <template v-if="errors.length">
          <ion-list-header>
            <ion-label>{{ translate("Delivery errors") }}</ion-label>
          </ion-list-header>
          <ion-item v-for="(error, index) in errors" :key="error.errorDate ?? index">
            <ion-icon slot="start" :icon="warningOutline" color="danger" />
            <ion-label class="ion-text-wrap">
              {{ error.errorText }}
              <p>{{ translate("Attempted {status} at {at}", { status: statusLabel(error.attemptedStatusId), at: formatDateTime(error.errorDate) }) }}</p>
            </ion-label>
          </ion-item>
        </template>
        <ion-item v-else-if="loadingErrors" lines="none">
          <ion-spinner slot="start" name="crescent" />
          <ion-label>{{ translate("Checking delivery errors") }}</ion-label>
        </ion-item>

        <ion-item>
          <ion-label class="ion-text-wrap">
            {{ translate("Resend this batch") }}
            <p>{{ translate("Re-sends the same frozen payload and idempotency key, so Shopify cannot double-apply it") }}</p>
          </ion-label>
          <!-- Once a resend is committed it is not offered again for this open, even if the refresh fails. -->
          <ion-button slot="end" fill="outline" :disabled="resending || resentId === batch.id" @click="resend()">
            <ion-spinner v-if="resending" name="crescent" />
            <template v-else>
              <ion-icon slot="start" :icon="refreshOutline" />
              {{ translate("Resend") }}
            </template>
          </ion-button>
        </ion-item>

        <ion-list-header>
          <ion-label>{{ translate("Events in this batch") }}</ion-label>
        </ion-list-header>
        <ion-item v-for="event in batch.events" :key="event.rowKey" button detail @click="emit('openEvent', event)">
          <ion-label class="ion-text-wrap">
            {{ event.eventTypeLabel }}
            <p>{{ event.sourceLabel }}</p>
            <p>{{ translate("Item {id} at {location}", { id: event.inventoryItemId, location: event.locationLabel }) }}</p>
          </ion-label>
          <ion-note slot="end">
            {{ event.change }}
          </ion-note>
        </ion-item>

        <ion-accordion-group>
          <ion-accordion value="payload">
            <ion-item slot="header">
              <ion-label>{{ translate("Message payload") }}</ion-label>
            </ion-item>
            <div slot="content" class="ion-padding">
              <ion-textarea
                :value="payload"
                :label="translate('System Message {id}', { id: batch.id })"
                label-placement="stacked"
                auto-grow
                readonly
              />
            </div>
          </ion-accordion>
        </ion-accordion-group>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import {
  IonAccordion, IonAccordionGroup, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem,
  IonLabel, IonList, IonListHeader, IonModal, IonNote, IonSpinner, IonTextarea, IonTitle, IonToolbar,
} from "@ionic/vue";
import { closeOutline, refreshOutline, warningOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import type { InventoryEventRow } from "@/composables/useInventoryEvents";
import { useStatuses } from "@/composables/useSeed";
import { useSystemMessage, useSystemMessageErrors, useSystemMessageRecord } from "@/composables/useSystemMessage";
import { useInventorySyncArea } from "@/composables/useInventorySyncArea";
import { formatDateTime } from "@/utils";
import { CacheReconciliationError } from "@/utils/db/cacheReconciliationError";
import { translateMutationError } from "@/utils/errorPresentation";
import type { InventoryEventBatch } from "@/utils/inventoryEvents";

const props = defineProps<{ batch: InventoryEventBatch<InventoryEventRow> | null }>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "openEvent", row: InventoryEventRow): void;
}>();

const { labelFor: statusLabel } = useStatuses();
const { requestSystemMessage, requestSystemMessageErrors, refreshSystemMessageErrors, resendSystemMessage } = useSystemMessage();
const { afterMutation } = useInventorySyncArea();

const batchId = computed(() => props.batch?.id ?? "");
// Errors and payload are class C: read live, and requested when a batch opens without them.
const { record: message, hydrated: messageHydrated } = useSystemMessageRecord(() => batchId.value);
const { errors, hydrated: errorsHydrated } = useSystemMessageErrors(() => batchId.value);

const content = ref();
const loadingErrors = ref(false);
const resending = ref(false);
const resentId = ref("");
const messageText = computed(() => String(message.value?.messageText ?? ""));

const targetLabel = computed(() => [...new Set(props.batch?.events.map((event) => event.locationLabel))].join(", "));

const payload = computed(() => {
  if(!messageText.value) {return translate("The message payload has not loaded.");}
  try { return JSON.stringify(JSON.parse(messageText.value), null, 2); } catch { return messageText.value; }
});

function resetScroll() {
  void content.value?.$el?.scrollToTop?.(0);
}

/** The batch whose missing message and errors were already requested, so a re-render asks nothing. */
let requestedFor = "";
// Opening a batch, even the same one again, starts over.
watch(batchId, () => {
  resentId.value = "";
  requestedFor = "";
});

// `post`: a new batch id resets the live reads in their own watchers first, so `hydrated` here is
// the new batch's and the rows are not the previous batch's.
watch([batchId, messageHydrated, errorsHydrated], async ([systemMessageId, messageReady, errorsReady]) => {
  if(!systemMessageId || !messageReady || !errorsReady || requestedFor === systemMessageId) {return;}
  requestedFor = systemMessageId;
  // A settled batch's errors are final; one that can still be retried gains a new error per attempt.
  const settled = ["sent", "cancelled"].includes(props.batch?.delivery.id ?? "");
  loadingErrors.value = true;
  try {
    await Promise.all([
      message.value ? undefined : requestSystemMessage(systemMessageId),
      settled
        ? (errors.value.length ? undefined : requestSystemMessageErrors(systemMessageId))
        : refreshSystemMessageErrors(systemMessageId),
    ]);
  } catch (error) {
    logger.error("Could not load the batch message", systemMessageId, error);
  } finally {
    if(requestedFor === systemMessageId) {loadingErrors.value = false;}
  }
}, { immediate: true, flush: "post" });

async function resend() {
  const systemMessageId = props.batch?.id;
  if(!systemMessageId) {return;}
  resending.value = true;
  try {
    await resendSystemMessage(systemMessageId);
    resentId.value = systemMessageId;
    commonUtil.showToast(translate("Batch queued for another delivery attempt."));
    try {
      await afterMutation("systemMessage", { systemMessageId });
      // Fresh, not from stored rows: a failed retry appends a new SystemMessageError.
      await refreshSystemMessageErrors(systemMessageId);
    } catch (cause) {
      throw new CacheReconciliationError("systemMessage", { systemMessageId }, cause);
    }
  } catch (error: any) {
    logger.error("Failed to resend batch", systemMessageId, error);
    commonUtil.showToast(translateMutationError(error, "Could not resend this batch."));
  } finally {
    resending.value = false;
  }
}
</script>
