<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Payment methods") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Map payment methods with NetSuite") }}
            <p>{{ translate("For an order to sync with NetSuite, the payment method on that order must be mapped to a NetSuite shipment method ID.") }}</p>
          </ion-label>
          <ion-icon :icon="openOutline" slot="end" />
        </ion-item>
      </div>

      <div class="list-item ion-margin-top" v-for="paymentMethod in paymentMethods" :key="paymentMethod.paymentMethodTypeId">
        <ion-item lines="none">
          <ion-label>
            {{ paymentMethod.description }}
            <p>{{ paymentMethod.paymentMethodTypeId }}</p>
          </ion-label>
        </ion-item>

        <ion-label>
          {{ getShopifyMappingId(paymentMethod.paymentMethodTypeId) ? getShopifyMappingId(paymentMethod.paymentMethodTypeId) : '-' }}
          <p>variances in 7 days</p>
        </ion-label>

        <template v-if="updatedNetSuiteIds[paymentMethod.paymentMethodTypeId]">
          <div class="ion-text-center">
            <ion-chip :outline="true" @click="editNetSuiteId(paymentMethod.paymentMethodTypeId, updatedNetSuiteIds[paymentMethod.paymentMethodTypeId])">
              <ion-label>{{ updatedNetSuiteIds[paymentMethod.paymentMethodTypeId].mappingValue }}</ion-label>
              <ion-icon fill="" :icon="closeCircleOutline" @click.stop="removeNetSuiteId(updatedNetSuiteIds[paymentMethod.paymentMethodTypeId].integrationMappingId)" />
            </ion-chip>
            <ion-label>
              <p>{{ translate("NetSuite payment method ID") }}</p>
            </ion-label>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editNetSuiteId(paymentMethod.paymentMethodTypeId, '')">
            <ion-icon :icon="addOutline"/>
            <ion-label>{{ translate("NetSuite id") }}</ion-label>
          </ion-button>
        </template>

        <!-- TODO: need to make this order analytics dynamic -->
        <ion-label class="ion-margin">
          150
          <p>orders</p>
        </ion-label>
      </div>
    
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { IonBackButton } from '@ionic/vue'
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, onIonViewWillEnter, alertController } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
import { useStore } from "vuex";
import { computed } from "vue";
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";


const store = useStore();

const { editNetSuiteId, removeNetSuiteId } = useNetSuiteComposables("NETSUITE_PMT_MTHD");

const paymentMethods = computed(() => store.getters["netSuite/getPaymentMehtods"])
const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"]("NETSUITE_PMT_MTHD"))
const shopifyTypeMappings = computed(() => store.getters["netSuite/getShopifyTypeMappings"]("SHOPIFY_PAYMENT_TYPE"))


// The `updatedNetSuiteIds` computed property maps each `mappingKey`(enumId) from `integrationTypeMappings` 
// to an object containing `mappingValue` and `integrationMappingId`(NETSUITE_PMT_MTHD)
const updatedNetSuiteIds = computed(() => {
  return integrationTypeMappings.value.reduce((paymentMethodNetSuiteId: any, mappingItem: any) => {
    paymentMethodNetSuiteId[mappingItem.mappingKey] = {
      mappingValue: mappingItem.mappingValue,
      integrationMappingId: mappingItem.integrationMappingId
    };
    return paymentMethodNetSuiteId;
  }, {} as any);
});


onIonViewWillEnter(async () => {
  await store.dispatch("netSuite/fetchPaymentMethods")
  await store.dispatch("netSuite/fetchIntegrationTypeMappings", "NETSUITE_PMT_MTHD")
  await store.dispatch("netSuite/fetchShopifyTypeMappings", "SHOPIFY_PAYMENT_TYPE")
})

function getShopifyMappingId(paymentMethodTypeId: any) {
  const shopifyMappingId = shopifyTypeMappings.value.find((mapping: any) => mapping.mappedValue === paymentMethodTypeId);
  return shopifyMappingId ? shopifyMappingId.mappedKey : "";
}


</script>
<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>