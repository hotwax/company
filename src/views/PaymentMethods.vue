<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
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
          <ion-button fill="clear" size="small" color="medium" @click="openPaymentMethodDoc">
            <ion-icon :icon="openOutline" slot="icon-only" />
          </ion-button>
        </ion-item>
      </div>

      <div class="list-item ion-padding-end" v-for="paymentMethod in paymentMethods" :key="paymentMethod.paymentMethodTypeId">
        <ion-item lines="none">
          <ion-label>
            {{ paymentMethod.description }}
            <p>{{ paymentMethod.paymentMethodTypeId }}</p>
          </ion-label>
        </ion-item>

        <ion-label>
          {{ getShopifyMappingId(paymentMethod.paymentMethodTypeId) ? getShopifyMappingId(paymentMethod.paymentMethodTypeId) : '-' }}
          <p>{{ translate("Shopify") }}</p>
        </ion-label>

        <div class="netsuite-id ion-margin-end">
          <template v-if="editingNetSuiteId === paymentMethod.paymentMethodTypeId">
            <ion-input v-show="editingNetSuiteId === paymentMethod.paymentMethodTypeId" :ref="(el => setNetSuiteInputRef(el, paymentMethod.paymentMethodTypeId))" :clear-input="true" v-model="netSuiteInputValue" @keyup.enter="saveNetSuiteId(paymentMethod.paymentMethodTypeId)" @ionBlur="netSuiteInputValue ? saveNetSuiteId(paymentMethod.paymentMethodTypeId) : ''"/>
          </template>     
          <template v-else>
            <div class="ion-text-center" v-if="updatedNetSuiteIds[paymentMethod.paymentMethodTypeId]">
              <ion-chip outline @click="updateNetSuiteId(paymentMethod.paymentMethodTypeId)">
                <ion-label>{{ updatedNetSuiteIds[paymentMethod.paymentMethodTypeId].mappingValue }}</ion-label>
                <ion-icon :icon="closeCircleOutline" @click.stop="removeNetSuiteId(updatedNetSuiteIds[paymentMethod.paymentMethodTypeId].integrationMappingId)" />
              </ion-chip>
              <ion-label>
                <p>{{ translate("NetSuite payment method ID") }}</p>
              </ion-label>
            </div>
            <ion-button v-else size="small" fill="outline" @click="updateNetSuiteId(paymentMethod.paymentMethodTypeId)">
              <ion-icon :icon="addOutline"/>
              <ion-label>{{ translate("NetSuite ID") }}</ion-label>
            </ion-button>
          </template>
        </div>

        <!-- TODO: need to make this order analytics dynamic -->
        <!-- <ion-label class="ion-margin">
          150
          <p>orders</p>
        </ion-label> -->
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { useStore } from "vuex";
import { computed, nextTick, ref } from "vue";
import { useNetSuiteComposables } from "@/composables/useNetSuiteComposables";

const store = useStore();
const paymentMethodTypeId = JSON.parse(process.env.VUE_APP_NETSUITE_INTEGRATION_TYPE_MAPPING)?.PAYMENT_METHOD_TYPE_ID
const { editNetSuiteId, removeNetSuiteId } = useNetSuiteComposables(paymentMethodTypeId);

let editingNetSuiteId = ref("") as any;
let netSuiteInputValue = ref("") as any;
let netSuiteInputRefs = ref({}) as any;
let isSavingNetSuiteId = ref(false);

const paymentMethods = computed(() => store.getters["netSuite/getPaymentMehtods"])
const integrationTypeMappings = computed(() => store.getters["netSuite/getIntegrationTypeMappings"](paymentMethodTypeId))
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
  await store.dispatch("netSuite/fetchShopifyTypeMappings", "SHOPIFY_PAYMENT_TYPE")
})

function getShopifyMappingId(paymentMethodTypeId: any) {
  const shopifyMappingId = shopifyTypeMappings.value.find((mapping: any) => mapping.mappedValue === paymentMethodTypeId);
  return shopifyMappingId ? shopifyMappingId.mappedKey : "";
}

function openPaymentMethodDoc() {
  window.open('https://docs.hotwax.co/documents/v/learn-netsuite/synchronization-flows/integration-mappings/payment-methods', '_blank', 'noopener, noreferrer');
}

// Needed because we have multiple input fields in a loop, but only one is visible at a time
function setNetSuiteInputRef(el: any, id: string) {
  if(el) netSuiteInputRefs.value[id] = el;
}

async function updateNetSuiteId(mappingKey: string) {
  editingNetSuiteId.value = mappingKey;
  netSuiteInputValue.value = updatedNetSuiteIds.value[mappingKey]?.mappingValue || "";
  await nextTick()
  setTimeout(async () => {
    const inputElement = netSuiteInputRefs.value[mappingKey];
    if(inputElement && inputElement.$el) {
      await inputElement.$el.setFocus();
    }
  }, 0);
}

async function saveNetSuiteId(mappingKey: string) {
  if(isSavingNetSuiteId.value) return;
  isSavingNetSuiteId.value = true;

  const integrationMapping = updatedNetSuiteIds.value[mappingKey] || '';
  if(netSuiteInputValue.value) await editNetSuiteId(mappingKey, integrationMapping, netSuiteInputValue.value.trim());
  editingNetSuiteId.value = "";

  isSavingNetSuiteId.value = false;
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}

@media (max-width: 700px) {
  .header {
    grid-template-columns: 1fr;
  }
}
</style>