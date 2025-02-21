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
          <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
          <!-- <ion-badge slot="end" color="dark">next sync in 15 minutes</ion-badge> -->
        </ion-item>
      </div>

      <div class="list-item ion-margin-top" v-for="variance in inventoryVariances" :key="variance.enumId">
        <ion-item lines="none">
          <ion-label>
            {{ variance.enumName ? variance.enumName : variance.enumId }}
            <p>{{ variance.enumId }}</p>
          </ion-label>
        </ion-item>
        
        <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
        <!-- <ion-label>
          200
          <p>{{ translate("variances in 7 days") }}</p>
        </ion-label> -->

        <template v-if="updatedNetSuiteIds[variance.enumId]">
          <div class="ion-text-center">
            <ion-chip outline @click="openTransferInventoryModal(variance)">
              <ion-label>{{ updatedNetSuiteIds[variance.enumId].mappingValue }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="removeNetSuiteId(updatedNetSuiteIds[variance.enumId].integrationMappingId)"/>
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

        <div class="ion-padding-end">
          <ion-checkbox :checked="enumsInEnumGroup(variance.enumId)" @click="addVarianceToGroup(variance.enumId, $event)"></ion-checkbox>
        </div>
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
const inventoryVarianceTypeId = JSON.parse(process.env.VUE_APP_NETSUITE_INTEGRATION_TYPE_MAPPING)?.INVENTORY_VARIANCE_TYPE_ID
const { removeNetSuiteId } = useNetSuiteComposables(inventoryVarianceTypeId);

const inventoryVariances = computed(() => store.getters["netSuite/getInventoryVariances"]);
const enumsInEnumGroup = computed(() => store.getters["netSuite/getEnumGroups"])
const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"](inventoryVarianceTypeId))

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
  await store.dispatch("netSuite/fetchIntegrationTypeMappings", { integrationTypeId: inventoryVarianceTypeId })
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
async function addVarianceToGroup(enumId: any, event: any) {
  const checkbox = event.target;
  emitter.emit("presentLoader");
  let resp;

  try {
    let payload: any = {
      enumerationGroupId: "NETSUITE_IIV_REASON",
      enumerationId: enumId
    }

    if(enumsInEnumGroup.value(enumId)) {
      payload = {
        ...payload,
        fromDate: enumsInEnumGroup.value(enumId)?.fromDate,
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
    checkbox.checked = !checkbox.checked;
  }
  emitter.emit('dismissLoader');
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>




