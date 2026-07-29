<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
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
          <ion-badge slot="end" color="dark">{{ translate("next sync in") }} {{ nextSyncTime }}</ion-badge>
        </ion-item>
      </div>

      <!-- Cold cache after login: the seed sync is still running, so show placeholders rather
           than an empty list that reads as "there is nothing here". -->
      <template v-if="!hydrated"><div class="list-item ion-padding-end" v-for="n in 4" :key="`sk-${n}`">
        <ion-item lines="none">
          <ion-label><ion-skeleton-text animated style="width: 45%" /></ion-label>
        </ion-item>
      </div></template>

      <div class="list-item ion-margin-top" v-for="variance in inventoryVariances" :key="variance.enumId">
        <ion-item lines="none">
          <ion-label>
            {{ variance.enumName ? variance.enumName : variance.enumId }}
            <p>{{ variance.enumId }}</p>
          </ion-label>
        </ion-item>
        
        <ion-label>
          {{ variance.varianceCount || 0 }}
          <p>{{ translate("variances in 7 days") }}</p>
        </ion-label>

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

      <ion-modal :is-open="showTransferInventoryModal" @didDismiss="closeTransferInventoryModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeTransferInventoryModal()">
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
            <ion-button fill="clear" size="small" color="medium">
              <ion-icon :icon="openOutline" slot="icon-only" />
            </ion-button>
          </ion-item>

          <ion-item>
            <ion-icon slot="start" :icon="businessOutline" />
            <ion-label>
              {{ translate("Facility wise inventory transfer") }}
              <p>{{ translate("If each facility has its own dedicated inventory transfer location for this variance, configure the transfer location from the facility configuration section") }}</p>
            </ion-label>
          </ion-item>

          <ion-item lines="none" class="ion-margin-top">
            <ion-input v-model="transferLocationId" :label="translate('Transfer location')" :placeholder="translate('NetSuite facility ID')" :helperText="selectedVarianceEnumId"/>
          </ion-item>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button @click="saveTransferInventoryNetSuiteId" :disabled="!transferLocationId || transferLocationId === (selectedIntegrationMapping?.mappingValue)">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonBadge, IonButton, IonButtons, IonChip, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonModal, IonPage, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { businessOutline, closeCircleOutline, closeOutline, informationCircleOutline, openOutline, saveOutline, shieldCheckmarkOutline, swapHorizontalOutline } from 'ionicons/icons';
import { commonUtil, emitter, logger, translate } from '@common'
import { computed, ref } from 'vue';
import { DateTime } from 'luxon';
import { useEnumGroupMembers, useNetSuite } from "@/composables/useNetSuite";
import { useTypedEnums } from "@/composables/useSeed";

const inventoryVarianceTypeId = JSON.parse(import.meta.env.VITE_NETSUITE_INTEGRATION_TYPE_MAPPING)?.INVENTORY_VARIANCE_TYPE_ID

// Reads all come from the cache; the CRUD helpers resync the mapping domain after each write.
const {
  mappings: integrationTypeMappings, addNetSuiteId, removeNetSuiteId, updateNetSuiteId,
  setEnumGroupMembership,
} = useNetSuite(inventoryVarianceTypeId);

// Variance reasons are IID_REASON enums; the reason group is its own cached reference set.
const { values: inventoryVariances, hydrated } = useTypedEnums("IID_REASON");
const { members: enumGroupMembers } = useEnumGroupMembers();

const nextSyncTime = ref("15 minutes");

/** enumId → whether it belongs to the NetSuite reason group (was `getEnumGroups`). */
const enumsInEnumGroup = computed(() => (enumId: any) =>
  enumGroupMembers.value.find((member: any) => member.enumId === enumId))

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


const transferLocationId = ref("");
const showTransferInventoryModal = ref(false);
const selectedVarianceEnumId = ref("");
const selectedIntegrationMapping = ref<any>("");

function openTransferInventoryModal(variance: any) {
  selectedVarianceEnumId.value = variance.enumId;
  selectedIntegrationMapping.value = updatedNetSuiteIds.value[variance.enumId] ? updatedNetSuiteIds.value[variance.enumId] : "";
  transferLocationId.value = selectedIntegrationMapping.value?.mappingValue || "";
  showTransferInventoryModal.value = true;
}

// Validates the input data, saves or updates NetSuite facility ID for inventory transfers associated with the integration type ID: NETSUITE_VAR_TRAN.
async function saveTransferInventoryNetSuiteId() {
  if(!transferLocationId.value) {
    commonUtil.showToast(translate("Please enter a valid NetSuite ID"));
    return false;
  }

  if(selectedIntegrationMapping.value?.mappingValue === transferLocationId.value) {
    commonUtil.showToast(translate("Please update the NetSuite ID"));
    return false;
  }

  const payload = {
    integrationTypeId: inventoryVarianceTypeId,
    mappingKey: selectedVarianceEnumId.value,
    mappingValue: transferLocationId.value
  };

  if(selectedIntegrationMapping.value.integrationMappingId) {
    await updateNetSuiteId(payload, selectedIntegrationMapping.value.integrationMappingId)
  } else {
    await addNetSuiteId(payload)
  }
  closeTransferInventoryModal();
}

function closeTransferInventoryModal() {
  showTransferInventoryModal.value = false;
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
    
    const wasMember = !!enumsInEnumGroup.value(enumId);

    resp = await setEnumGroupMembership(payload);
    if(commonUtil.hasError(resp)) throw resp.data;

    // `:checked` is a one-way binding, so the native click has already flipped the DOM box while
    // the cache is the real source of truth. Re-assert the box from the cache once the resync has
    // landed, otherwise a write that returns 200 without actually persisting leaves the row ticked
    // forever — the state silently reverts on the next load and the user is never told.
    const isMember = !!enumsInEnumGroup.value(enumId);
    checkbox.checked = isMember;

    if(isMember === wasMember) {
      commonUtil.showToast(translate("The server accepted the change but did not save it."));
      logger.error(`enumGroupMember for ${enumId} did not persist; NETSUITE_IIV_REASON may not exist as an EnumerationGroup`);
    }
  } catch (err) {
    // Reverting the checkbox shows *something* happened but not that it failed — a user who looks
    // away during the request sees only the original state and assumes the toggle never took.
    commonUtil.showToast(translate("Failed to update variance reason"));
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




