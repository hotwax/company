<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Create payment method") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-input v-model="description" :label="translate('Payment method name')" label-placement="stacked" :placeholder="translate('e.g. Store Credit')" :maxlength="60" />
      </ion-item>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Hotwax ID") }}: <ion-text color="primary">{{ derivedId || "—" }}</ion-text></p>
        </ion-label>
      </ion-item>

      <ion-item>
        <ion-input v-model="shopifyId" :label="translate('Shopify ID')" label-placement="stacked" :placeholder="translate('Shopify payment method')" />
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab slot="fixed" vertical="bottom" horizontal="end">
    <ion-fab-button :disabled="!canSave" @click="createPaymentMethod()">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { computed, PropType, ref } from "vue";
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonText, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { useNetSuiteStore } from "@/store/netSuite";
import { useShopifyStore } from "@/store/shopify";

const props = defineProps({
  shopId: {
    type: String,
    required: true
  },
  existingTypes: {
    type: Array as PropType<any[]>,
    default: () => []
  }
});

const netSuiteStore = useNetSuiteStore();
const shopifyStore = useShopifyStore();

const description = ref("");
const shopifyId = ref("");

// Auto-derive the payment method type id from the description (uppercase, non-alphanumeric -> underscore).
const derivedId = computed(() => description.value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
);

const canSave = computed(() => Boolean(derivedId.value && shopifyId.value.trim()));

const closeModal = () => {
  modalController.dismiss();
};

const createPaymentMethod = async () => {
  if(!canSave.value) {return;}

  const paymentMethodTypeId = derivedId.value;
  emitter.emit("presentLoader");

  try {
    // 1. Create the payment method type if it does not already exist.
    const typeExists = props.existingTypes.some((type: any) => type.paymentMethodTypeId === paymentMethodTypeId);
    if(!typeExists) {
      const typeResp = await netSuiteStore.createPaymentMethodType({
        paymentMethodTypeId,
        description: description.value.trim()
      });
      if(commonUtil.hasError(typeResp)) {
        throw typeResp.data;
      }
    }

    // 2. Create the Shopify type mapping (the identification).
    const mappingResp = await shopifyStore.createShopifyShopTypeMapping({
      shopId: props.shopId,
      mappedTypeId: "SHOPIFY_PAYMENT_TYPE",
      mappedKey: shopifyId.value.trim(),
      mappedValue: paymentMethodTypeId
    });
    if(commonUtil.hasError(mappingResp)) {
      throw mappingResp.data;
    }

    commonUtil.showToast(translate("Payment method created successfully"));
    modalController.dismiss({ created: true });
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to create payment method"));
    // Keep the modal open so the user can correct and retry.
  } finally {
    emitter.emit("dismissLoader");
  }
};
</script>
