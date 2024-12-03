<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Transfer Inventory") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about creating inventory transfers from inventory variances") }}
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>

    <ion-item>
      <ion-icon slot="start" :icon="businessOutline" />
      <ion-label>
        {{ translate("Facility wise inventory transfer") }}
        <p>{{ translate("If each facility has its own dedicated inventory transfer location for this variance, configure the transfer location from the facility configuration section") }}</p>
      </ion-label>
    </ion-item>

    <ion-item lines="none" class="ion-margin-top">
      <ion-input v-model="transferLocationId" :label="translate('Transfer location')" :placeholder="translate('NetSuite facility ID')" :helperText="props.varianceEnumId"/>
    </ion-item>
     
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="saveTransferInventoryNetSuiteId">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>

  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { businessOutline, closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons';
import { translate } from '@hotwax/dxp-components';
import { defineProps, onMounted, ref } from 'vue';
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";
import { showToast } from "@/utils";


const { addNetSuiteId, updateNetSuiteId } = useNetSuiteComposables("NETSUITE_VAR_TRAN");

const props = defineProps(["varianceEnumId", "integrationMapping"]);

const transferLocationId = ref("");

onMounted(async() => {
  if (props.integrationMapping?.mappingValue) {
    transferLocationId.value = props.integrationMapping?.mappingValue;
  }
})

// Validates the input data, saves or updates NetSuite facility ID for inventory transfers associated with the integration type ID: NETSUITE_VAR_TRAN.
async function saveTransferInventoryNetSuiteId() {
  if(!transferLocationId.value) {
    showToast("Please enter a valid NetSuite ID");
    return false;
  }

  if(props.integrationMapping?.mappingValue === transferLocationId.value) {
    showToast("Please update the NetSuite ID");
    return false;
  }

  const payload = {
    integrationTypeId: "NETSUITE_VAR_TRAN",
    mappingKey: props.varianceEnumId,
    mappingValue: transferLocationId.value
  };

  if(props.integrationMapping.integrationMappingId) {
    await updateNetSuiteId(payload, props.integrationMapping.integrationMappingId)
  } else {
    await addNetSuiteId(payload)
  }
  closeModal();
}

function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>