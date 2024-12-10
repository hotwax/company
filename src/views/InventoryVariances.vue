<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Inventory variances") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Inventory variances synced to NetSuite") }}
            <p>{{ translate("Select exactly which inventory variances should be synced to NetSuite") }}</p>
          </ion-label>
          <ion-badge slot="end" color="dark">next sync in 15 minutes</ion-badge>
        </ion-item>
      </div>

      <div class="list-item ion-margin-top" v-for="variance in inventoryVariances" :key="variance.enumId">
        <ion-item lines="none">
          <ion-label>
            {{ variance.enumName ? variance.enumName : variance.enumId }}
            <p>{{ variance.enumId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- TODO: need to make this order analytics dynamic -->
        <ion-label>
          200
          <p>{{ translate("variances in 7 days") }}</p>
        </ion-label>

        <template v-if="updatedNetSuiteIds[variance.enumId]">
          <div class="ion-text-center">
            <ion-chip :outline="true" @click="openTransferInventoryModal(variance)">
              <ion-label>{{ updatedNetSuiteIds[variance.enumId].mappingValue }}</ion-label>
              <ion-icon fill="" :icon="closeCircleOutline" @click.stop="removeNetSuiteId(updatedNetSuiteIds[variance.enumId].integrationMappingId)"/>
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite transfer location") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="openTransferInventoryModal(variance)">
            <ion-label>{{ translate("Transfer inventory") }}</ion-label>
            <ion-icon :icon="swapHorizontalOutline" slot="end"/>
          </ion-button>
        </template>

        <ion-item lines="none" @click="addVarianceToGroup(variance.enumId)">
          <ion-checkbox :checked="enumsInEnumGroup(variance.enumId)"></ion-checkbox>
        </ion-item>
        
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonBadge, IonButton, IonChip, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, onIonViewWillEnter, modalController } from "@ionic/vue";
import { closeCircleOutline, shieldCheckmarkOutline, swapHorizontalOutline } from 'ionicons/icons';
import TransferInventoryModal from '@/components/TransferInventoryModal.vue';
import emitter from "@/event-bus";
import logger from '@/logger';
import { hasError } from '@/utils';
import { useStore } from "vuex";
import { computed } from 'vue';
import { translate } from "@/i18n"
import { UtilService } from '@/services/UtilService';
import { DateTime } from 'luxon';
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";

const store = useStore();

const { removeNetSuiteId } = useNetSuiteComposables("NETSUITE_VAR_TRAN");

const inventoryVariances = computed(() => store.getters["netSuite/getInventoryVariances"]);
const enumsInEnumGroup = computed(() => store.getters["netSuite/getEnumGroups"])
const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"]("NETSUITE_VAR_TRAN"))

// The `updatedNetSuiteIds` computed property maps each `mappingKey`(enumId) from `integrationTypeMappings` 
// to an object containing `mappingValue` and `integrationMappingId`(NETSUITE_VAR_TRAN)
const updatedNetSuiteIds = computed(() => {
  return integrationTypeMappings.value.reduce((inventoryVariancesEnumId: any, mappingItem: any) => {
    inventoryVariancesEnumId[mappingItem.mappingKey] = {
      mappingValue: mappingItem.mappingValue,
      integrationMappingId: mappingItem.integrationMappingId
    };
    return inventoryVariancesEnumId;
  }, {} as any);
});

onIonViewWillEnter(async () => {
  await store.dispatch("netSuite/fetchInventoryVariances");
  await store.dispatch("netSuite/fetchIntegrationTypeMappings", { integrationTypeId: "NETSUITE_VAR_TRAN" })
  await store.dispatch("netSuite/fetchEnumGroupMember")
});

async function openTransferInventoryModal(variance: any) {
  const transferInventoryModal = await modalController.create({
    component: TransferInventoryModal,
    componentProps: { 
      varianceEnumId: variance.enumId,
      integrationMapping: updatedNetSuiteIds.value[variance.enumId] ? updatedNetSuiteIds.value[variance.enumId] : ""
    }
  });

  transferInventoryModal.present();
}

// adding & updating the enum with enumGroup
async function addVarianceToGroup(enumerationId: any) { 
  emitter.emit("presentLoader");
  let resp;

  try {
    let payload: any = {
      enumerationGroupId: "NETSUITE_IIV_REASON",
      enumerationId: enumerationId
    }

    if(enumsInEnumGroup.value(enumerationId)) {
      payload = {
        ...payload,
        fromDate: enumsInEnumGroup.value(enumerationId)?.fromDate,
        thruDate: DateTime.now().toMillis()
      }
    }
    
    resp = await UtilService.addEnumToEnumGroup(payload);
    if(!hasError(resp)) {
      await store.dispatch("netSuite/fetchEnumGroupMember");
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
  }
  emitter.emit('dismissLoader');
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>




