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
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-input v-model="orderLevelDiscount" :label="translate('Order level discount')" :placeholder="translate('NetSuite discount item ID')" />
    </ion-item>

    <ion-item lines="full">
      <ion-input v-model="itemLevelDiscount" :label="translate('Item level discounts')" :placeholder="translate('NetSuite discount item ID')" />
    </ion-item>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="editNetSuiteDiscountItemIds">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed, onMounted } from "vue";
import { showToast } from '@/utils';
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";



const store = useStore();

const { addNetSuiteId, updateNetSuiteId } = useNetSuiteComposables("NETSUITE_DISC_MTHD")

const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"]("NETSUITE_DISC_MTHD"))

const orderLevelDiscount = ref("");
const itemLevelDiscount = ref("");

const mappingKeys = {
  order: "SHOPIFY_DISC",
  item: "SHOPIFY_ITEM_DISC"
};

onMounted(async () => {
  await store.dispatch("netSuite/fetchIntegrationTypeMappings", "NETSUITE_DISC_MTHD")
  
  // Set orderLevelDiscount and itemLevelDiscount based on their corresponding mapping keys in integration type mappings.
  integrationTypeMappings.value.forEach((mapping: any) => {
    if (mapping.mappingKey === mappingKeys.order) {
      orderLevelDiscount.value = mapping.mappingValue;
    } else if (mapping.mappingKey === mappingKeys.item) {
      itemLevelDiscount.value = mapping.mappingValue;
    }
  });
})

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

async function editNetSuiteDiscountItemIds() {
  if (!orderLevelDiscount.value && !itemLevelDiscount.value) {
    showToast(translate("Please enter a valid NetSuite ID"));
    return;
  }

  await updateMapping(mappingKeys.order, orderLevelDiscount.value);
  await updateMapping(mappingKeys.item, itemLevelDiscount.value);

  closeModal();
}

async function updateMapping(mappingKey: any, mappingValue: any) {
  const integrationMappings = integrationTypeMappings.value;
  const currentMapping = integrationMappings.find((mapping: any) => mapping.mappingKey === mappingKey);

  if (currentMapping?.mappingValue === mappingValue) {
    showToast(translate("Please update the NetSuite ID"));
    return;
  }

  if (mappingValue) {
    const payload = {
      integrationTypeId: "NETSUITE_DISC_MTHD",
      mappingKey,
      mappingValue,
    };

    if (currentMapping?.integrationMappingId) {
      await updateNetSuiteId(payload, currentMapping.integrationMappingId);
    } else {
      await addNetSuiteId(payload);
    }
  }
}

</script>