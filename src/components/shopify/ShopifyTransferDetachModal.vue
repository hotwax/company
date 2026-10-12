<template>
  <ion-modal :is-open="isOpen" @will-present="reset" @did-dismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button :aria-label="translate('Close')" :disabled="saving" @click="emit('close')">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ translate("Detach from native sync") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content ref="content">
      <ion-list lines="full">
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            {{ orderName || translate("Transfer {id}", { id: orderId }) }}
            <p>{{ translate("Use this only for a transfer that can never sync to Shopify as a transfer. It was never created in Shopify, so there is nothing to undo there.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-checkbox
            slot="start"
            :checked="removeOwnership"
            :disabled="saving"
            :aria-label="translate('Remove native sync ownership')"
            @ion-change="removeOwnership = $event.detail.checked"
          />
          <ion-label class="ion-text-wrap">
            {{ translate("Remove native sync ownership") }}
            <p>{{ translate("Required. The transfer stops syncing to Shopify as a transfer and stops holding back the inventory reset.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-checkbox
            slot="start"
            :checked="publishEvents"
            :disabled="saving"
            :aria-label="translate('Publish inventory movements as events')"
            @ion-change="publishEvents = $event.detail.checked"
          />
          <ion-label class="ion-text-wrap">
            {{ translate("Publish inventory movements as events") }}
            <p>{{ translate("Optional. Sends this transfer's receipts and reservations to Shopify as inventory adjustments. Only use it if Shopify has not already counted these movements, or Shopify will double-count them until the next inventory reset.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="error" lines="none" role="alert">
          <ion-icon slot="start" :icon="warningOutline" color="danger" />
          <ion-label class="ion-text-wrap">
            {{ error }}
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="solid" color="danger" :disabled="!removeOwnership || saving" @click="detach">
            <ion-spinner v-if="saving" name="crescent" />
            <template v-else>
              {{ translate("Detach") }}
            </template>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import { translate } from "@common";
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal,
  IonSpinner, IonTitle, IonToolbar,
} from "@ionic/vue";
import { closeOutline, warningOutline } from "ionicons/icons";
import { ref } from "vue";
import { type TransferDetachResult, useShopifyTransferDetach } from "@/composables/useShopifyTransferDetach";

const props = defineProps<{ isOpen: boolean; shopId: string; orderId: string; orderName?: string }>();
const emit = defineEmits<{
  (event: "close"): void;
  (event: "detached", result: TransferDetachResult & { published: boolean }): void;
}>();

const { detach: detachTransfer } = useShopifyTransferDetach();
const content = ref();
const removeOwnership = ref(false);
const publishEvents = ref(false);
const saving = ref(false);
const error = ref("");

function reset() {
  removeOwnership.value = false; publishEvents.value = false; error.value = "";
  void content.value?.$el?.scrollToTop?.(0);
}

async function detach() {
  if(!removeOwnership.value || saving.value) {return;}
  saving.value = true; error.value = "";
  try {
    const result = await detachTransfer(props.shopId, props.orderId, publishEvents.value);
    emit("detached", { ...result, published: publishEvents.value });
  } catch (err: any) {
    error.value = err?.message ? translate(err.message) : translate("The transfer could not be detached.");
  } finally {
    saving.value = false;
  }
}
</script>
