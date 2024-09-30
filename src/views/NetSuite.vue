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
    <ion-content>
      <main>
        <section class="analytics-header">
          <ion-card>
            <ion-item lines="none">
              <ion-label class="count-size">4</ion-label>
            </ion-item>
            <ion-item>
              <ion-label>Orders pending sync</ion-label>
            </ion-item>
          </ion-card>
          <ion-card>
            <ion-item lines="none">
              <ion-label class="count-size">15</ion-label>
            </ion-item>
            <ion-item>
              <ion-label>Customers pending sync</ion-label>
            </ion-item>
          </ion-card>
          <ion-card>
            <ion-item lines="none">
              <ion-label class="count-size">2</ion-label>
            </ion-item>
            <ion-item>
              <ion-label>Products pending sync</ion-label>
            </ion-item>
          </ion-card>
        </section>

        <div class="ion-margin-top">
          <ion-text>Configuration</ion-text>
          <section>
            <ion-card>
              <ion-item button @click="openSftpModal()">
                <ion-label>SFTP</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button @click="openProductStoreModal()">
                <ion-label>Product Store</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button @click="openShipmentMethod()">
                <ion-label>Shipping methods</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button @click="openFacilities()">
                <ion-label>Facilities</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
          </section>
        </div>

        <div class="ion-margin-top">
          <ion-text>Products and Inventory</ion-text>
          <section class="netsuite-action-items">
            <ion-card>
              <ion-item button @click="openInventoryVariances()">
                <ion-label>Inventory variances</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
          </section>
        </div>

        <div class="ion-margin-top">
          <ion-text>Orders and fulfillment</ion-text>
          <section>
            <ion-card>
              <ion-item button @click="openPaymentMethods()">
                <ion-label>Payment method</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button @click="openPriceLevelModal()">
                <ion-label>Price level</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button @click="openDiscountsModal()">
                <ion-label>Discounts</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button @click="openDepartments()">
                <ion-label>Departments</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button @click="openSalesChannel()">
                <ion-label>Sales Channel</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
          </section>
        </div>

        <div class="ion-margin-top">
          <ion-text>Transfer orders</ion-text>
          <section>
            <ion-card>
              <ion-item button>
                <ion-label>Transfer order fulfillment</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button>
                <ion-label>Transfer order receipt</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
          </section>
        </div>
      </main>
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
main {
  margin: 10px 0 10px 10px;
}

section {
  display: grid;
  align-items: center; 
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.analytics-header {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.count-size {
  height: 100%;
  font-size: 128px;
}
</style>