<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("NetSuite") }}</ion-title>
        <ion-button slot="end" fill="clear">
          <ion-icon slot="icon-only" :icon="search" color="medium"/>
        </ion-button>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <section class="analytics-header">
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">4</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>Orders pending sync</ion-label>
          </ion-item>
        </ion-card>
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">15</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>Customers pending sync</ion-label>
          </ion-item>
        </ion-card>
        <ion-card>
          <ion-item lines="none">
            <ion-label class="count-size">2</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>Products pending sync</ion-label>
          </ion-item>
        </ion-card>
      </section>

      <div class="ion-margin-top">
        <h1>Configuration</h1>
        <section>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openSftpModal()">
            <ion-label>SFTP</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openProductStoreModal()">
            <ion-label>Product Store</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openShipmentMethod()">
            <ion-label>Shipping methods</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openFacilities()">
            <ion-label>Facilities</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
        </section>
      </div>

      <div class="ion-margin-top">
        <h1>Products and Inventory</h1>
        <section>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openInventoryVariances()">
            <ion-label>Inventory variances</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
        </section>
      </div>

      <div class="ion-margin-top">
        <h1>Orders and fulfillment</h1>
        <section>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openPaymentMethods()">
            <ion-label>Payment method</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openPriceLevelModal()">
            <ion-label>Price level</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openDiscountsModal()">
            <ion-label>Discounts</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openDepartments()">
            <ion-label>Departments</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button @click="openSalesChannel()">
            <ion-label>Sales Channel</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
        </section>
      </div>

      <div class="ion-margin-top">
        <h1>Transfer orders</h1>
        <section>
          <ion-item fill="outline" class="item-box" lines="none" button>
            <ion-label>Transfer order fulfillment</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
          <ion-item fill="outline" class="item-box" lines="none" button>
            <ion-label>Transfer order receipt</ion-label>
            <ion-icon slot="end" :icon="chevronForwardOutline"/>
          </ion-item>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonCard, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonText, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { search, chevronForwardOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useRouter } from "vue-router";
import SftpModal from "@/components/SftpModal.vue";
import ProductStoreModal from "@/components/ProductStoreModal.vue";
import PriceLevelModal from "@/components/PriceLevelModal.vue";
import DiscountsModal from "@/components/DiscountsModal.vue";
import SalesChannel from "@/components/SalesChannel.vue";

const router = useRouter();


function openShipmentMethod() {
  router.push("/netsuite/shipment-methods")
}

function openPaymentMethods() {
  router.push("/netsuite/payment-methods")
}

function openFacilities() {
  router.push("/netsuite/facilities")
}

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
  const modal = await modalController.create({
    component: SftpModal,
  })
  modal.present()
}

async function openProductStoreModal() {
  const modal = await modalController.create({
    component: ProductStoreModal,
  })
  modal.present()
}

async function openPriceLevelModal() {
  const modal = await modalController.create({
    component: PriceLevelModal,
  })
  modal.present()
}

async function openDiscountsModal() {
  const modal = await modalController.create({
    component: DiscountsModal,
  })
  modal.present()
}
</script>

<style scoped>
ion-card {
  margin-inline: 0px;
}

.item-box::part(native) {
  border-radius: 8px;
}

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}

.analytics-header {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));  
}

.count-size {
  font-size: 128px;
}
</style>