<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("NetSuite") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-horizontal">
      <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
      <!-- <section class="analytics-header">
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">4</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Orders pending sync") }}</ion-label>
          </ion-item>
        </ion-card>
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">15</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ translate("Customers pending sync") }}</ion-label>
          </ion-item>
        </ion-card>
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">2</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>{{ ("Products pending sync") }}</ion-label>
          </ion-item>
        </ion-card>
      </section> -->

      <div>
        <h1>{{ translate("Configuration") }}</h1>
        <section>
          <ion-item detail class="item-box" lines="none" button @click="openSftpModal()">
            <ion-label>{{ translate("SFTP") }}</ion-label>
          </ion-item>
          <ion-item detail class="item-box" lines="none" button @click="openProductStoreModal()">
            <ion-label>{{ translate("Product Store") }}</ion-label>
          </ion-item>
        </section>
      </div>
      
      <div class="ion-margin-top">
        <h1>{{ translate("Products and Inventory") }}</h1>
        <section>
          <ion-item detail :disabled="!netSuiteProductStore.productStoreId" class="item-box" lines="none" button @click="openInventoryVariances()">
            <ion-label>{{ translate("Inventory variances") }}</ion-label>
          </ion-item>
          <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
          <!-- <ion-item class="item-box" lines="none" button @click="openFacilities()">
            <ion-label>{{ translate("Facilities") }}</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item> -->
        </section>
      </div>
      
      <div class="ion-margin-top">
        <h1>{{ translate("Orders and fulfillment") }}</h1>
        <section>
          <ion-item detail :disabled="!netSuiteProductStore.productStoreId" class="item-box" lines="none" button @click="openShipmentMethod()">
            <ion-label>{{ translate("Shipping methods") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore.productStoreId" class="item-box" lines="none" button @click="openPaymentMethods()">
            <ion-label>{{ translate("Payment method") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore.productStoreId" class="item-box" lines="none" button @click="openPriceLevelModal()">
            <ion-label>{{ translate("Price level") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore.productStoreId" class="item-box" lines="none" button @click="openDiscountsModal()">
            <ion-label>{{ translate("Discounts") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore.productStoreId" class="item-box" lines="none" button @click="openDepartments()">
            <ion-label>{{ translate("Departments") }}</ion-label>
          </ion-item>
          <ion-item detail :disabled="!netSuiteProductStore.productStoreId" class="item-box" lines="none" button @click="openSalesChannel()">
            <ion-label>{{ translate("Sales Channel") }}</ion-label>
          </ion-item>
        </section>
      </div>
      
      <!-- TODO: Commenting out these hardcoded values; need to make them dynamic -->
      <!-- <div class="ion-margin-top">
        <h1>{{ translate("Transfer orders") }}</h1>
        <section>
          <ion-item detail class="item-box" lines="none" button>
            <ion-label>{{ translate("Transfer order fulfillment") }}</ion-label>
          </ion-item>
          <ion-item detail class="item-box" lines="none" button>
            <ion-label>{{ translate("Transfer order receipt") }}</ion-label>
          </ion-item>
        </section>
      </div> -->
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { translate } from "@/i18n";
import { useRouter } from "vue-router";
import { useStore } from "vuex";
import { computed } from "vue";
import SftpModal from "@/components/SftpModal.vue";
import ProductStoreModal from "@/components/ProductStoreModal.vue";
import PriceLevelModal from "@/components/PriceLevelModal.vue";
import DiscountsModal from "@/components/DiscountsModal.vue";

const store = useStore();
const router = useRouter();

const netSuiteProductStore = computed(() => store.getters["productStore/getNetSuiteProductStore"])

function openShipmentMethod() {
  router.push("/netsuite/shipment-methods")
}

function openPaymentMethods() {
  router.push("/netsuite/payment-methods")
}

// function openFacilities() {
//   router.push("/netsuite/facilities")
// }

function openInventoryVariances() {
  router.push("/netsuite/inventory-variances")
}

function openSalesChannel() {
  router.push("/netsuite/sales-channel")
}

function openDepartments() {
  router.push("/netsuite/departments")
}

async function openSftpModal() {
  const sftpModal = await modalController.create({
    component: SftpModal,
  })
  sftpModal.present()
}

async function openProductStoreModal() {
  const productStoreModal = await modalController.create({
    component: ProductStoreModal,
  })
  productStoreModal.present()
}

async function openPriceLevelModal() {
  const priceLevelModal = await modalController.create({
    component: PriceLevelModal,
  })
  priceLevelModal.present()
}

async function openDiscountsModal() {
  const discountModal = await modalController.create({
    component: DiscountsModal,
  })
  discountModal.present()
}
</script>

<style scoped>
/* ion-card {
  margin-inline: 0px;
} */

/* .analytics-header {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));  
}

.count-size {
  font-size: 128px;
} */

.item-box::part(native) {
  --border-radius: var(--spacer-xs);
  border: var(--border-medium);
}

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacer-sm);
}

</style>