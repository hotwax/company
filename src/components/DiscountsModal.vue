<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Discounts") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about discounts in NetSuite") }}
      </ion-label>
      <ion-button fill="clear" size="default" color="medium">
        <ion-icon :icon="openOutline" slot="icon-only" />
      </ion-button>
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input v-model="orderLevelDiscount" :label="translate('Order level discount')" :placeholder="translate('NetSuite discount item ID')" />
    </ion-item>

    <ion-item lines="full">
      <ion-input v-model="itemLevelDiscount" :label="translate('Item level discounts')" :placeholder="translate('NetSuite discount item ID')" />
    </ion-item>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="editNetSuiteDiscountItemIds" :disabled="isDiscountValueChanged()">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed, onMounted, ref } from "vue";
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";

const store = useStore();
const discountTypeId = JSON.parse(process.env.VUE_APP_NETSUITE_INTEGRATION_TYPE_MAPPING)?.DISCOUNT_TYPE_ID
const { addNetSuiteId, updateNetSuiteId } = useNetSuiteComposables(discountTypeId)

const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"](discountTypeId))

const orderLevelDiscount = ref("");
const itemLevelDiscount = ref("");
const integrationMappingByKey = ref({}) as any
const mappingKeys = {
  order: "SHOPIFY_DISC",
  item: "SHOPIFY_ITEM_DISC"
}

onMounted(async () => {
  // Set orderLevelDiscount and itemLevelDiscount based on their corresponding mapping keys in integration type mappings.
  integrationTypeMappings.value.map((mapping: any) => {
    integrationMappingByKey[mapping.mappingKey] = mapping
    if(mapping.mappingKey === mappingKeys.order) {
      orderLevelDiscount.value = mapping.mappingValue
    } else {
      itemLevelDiscount.value = mapping.mappingValue
    }
  });
})

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function isDiscountValueChanged() {
  return !(orderLevelDiscount.value?.trim() && itemLevelDiscount.value?.trim() && (orderLevelDiscount.value !== integrationMappingByKey[mappingKeys.order]?.mappingValue || itemLevelDiscount.value !== integrationMappingByKey[mappingKeys.item]?.mappingValue));
}

async function editNetSuiteDiscountItemIds() {
  if(orderLevelDiscount.value !== integrationMappingByKey[mappingKeys.order].mappingValue) {
    await updateMapping(mappingKeys.order, orderLevelDiscount.value)
  }
  if(!itemLevelDiscount.value !== integrationMappingByKey[mappingKeys.item].mappingValue) {
    await updateMapping(mappingKeys.item, itemLevelDiscount.value)
  }
  closeModal();
}

async function updateMapping(mappingKey: any, mappingValue: any) {

  const payload = {
    integrationTypeId: discountTypeId,
    mappingKey,
    mappingValue
  }

  if(integrationMappingByKey[mappingKey]?.integrationMappingId) {
    await updateNetSuiteId(payload, integrationMappingByKey[mappingKey].integrationMappingId);
  } else {
    await addNetSuiteId(payload);
  }
}
</script>