<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Create shipment method") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item v-if="carriers.length > 1">
        <ion-select :label="translate('Carrier')" :placeholder="translate('Select')" v-model="carrierPartyId" interface="popover">
          <ion-select-option v-for="carrier in carriers" :key="carrier.partyId" :value="carrier.partyId">
            {{ carrier.groupName || carrier.partyId }}
          </ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-input v-model="description" :label="translate('Shipment method name')" label-placement="stacked" :placeholder="translate('e.g. Standard Shipping')" :maxlength="60" @ionInput="onDescriptionInput" />
      </ion-item>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Hotwax ID") }}: <ion-text color="primary">{{ derivedId || "—" }}</ion-text></p>
        </ion-label>
      </ion-item>

      <ion-item>
        <ion-input v-model="shopifyShippingMethod" :label="translate('Shopify name')" label-placement="stacked" :placeholder="translate('Shopify shipping method name')" />
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab slot="fixed" vertical="bottom" horizontal="end">
    <ion-fab-button :disabled="!canSave" @click="createShipmentMethod()">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { computed, PropType, ref } from "vue";
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonText, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { useUtilStore } from "@/store/util";
import { useShopifyStore } from "@/store/shopify";

const props = defineProps({
  shopId: {
    type: String,
    required: true
  },
  productStoreId: {
    type: String,
    required: true
  },
  carrierPartyId: {
    type: String,
    default: ""
  },
  carriers: {
    type: Array as PropType<any[]>,
    default: () => []
  }
});

const utilStore = useUtilStore();
const shopifyStore = useShopifyStore();

const description = ref("");
const shopifyShippingMethod = ref("");
const carrierPartyId = ref(props.carrierPartyId || (props.carriers[0]?.partyId ?? ""));

// Auto-derive the shipment method type id from the description (uppercase, non-alphanumeric -> underscore).
const derivedId = computed(() => description.value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
);

const canSave = computed(() => Boolean(derivedId.value && shopifyShippingMethod.value.trim() && carrierPartyId.value));

function onDescriptionInput() {
  // keep description as typed; derivedId recomputes reactively
}

const closeModal = () => {
  modalController.dismiss();
};

const createShipmentMethod = async () => {
  if(!canSave.value) {return;}

  const shipmentMethodTypeId = derivedId.value;
  emitter.emit("presentLoader");

  try {
    // 1. Create the shipment method type if it does not already exist.
    const typeExists = utilStore.shipmentMethodTypes.some((type: any) => type.shipmentMethodTypeId === shipmentMethodTypeId);
    if(!typeExists) {
      const typeResp = await utilStore.createShipmentMethodType({
        shipmentMethodTypeId,
        description: description.value.trim()
      });
      if(commonUtil.hasError(typeResp)) {
        throw typeResp.data;
      }
      await utilStore.fetchShipmentMethodTypes(true);
    }

    // 2. Associate the shipment method type with the product store + carrier so it appears as a row.
    const assocResp = await utilStore.createProductStoreShipmentMethod({
      productStoreId: props.productStoreId,
      shipmentMethodTypeId,
      partyId: carrierPartyId.value,
      roleTypeId: "CARRIER"
    });
    if(commonUtil.hasError(assocResp)) {
      throw assocResp.data;
    }

    // 3. Create the Shopify carrier-shipment mapping (the identification).
    const mappingResp = await shopifyStore.createShopifyShopCarrierShipment({
      shopId: props.shopId,
      shipmentMethodTypeId,
      shopifyShippingMethod: shopifyShippingMethod.value.trim(),
      carrierPartyId: carrierPartyId.value
    });
    if(commonUtil.hasError(mappingResp)) {
      throw mappingResp.data;
    }

    commonUtil.showToast(translate("Shipment method created successfully"));
    modalController.dismiss({ created: true, carrierPartyId: carrierPartyId.value });
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to create shipment method"));
    // Keep the modal open so the user can correct and retry.
  } finally {
    emitter.emit("dismissLoader");
  }
};
</script>
