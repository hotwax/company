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
        <div class="cards number-card">
          <ion-card>
            <ion-item lines="none" class="count">
              4
            </ion-item>
            <ion-item class="ion-text-center">
              <ion-label>
                <p>Orders pending sync</p>
              </ion-label>
            </ion-item>
          </ion-card>
          <ion-card>
            <ion-item lines="none" class="count">
              15
            </ion-item>
            <ion-item class="ion-text-center">
              <ion-label>
                <p>Customers pending sync</p>
              </ion-label>
            </ion-item>
          </ion-card>
          <ion-card>
            <ion-item lines="none" class="count">
              2
            </ion-item>
            <ion-item class="ion-text-center">
              <ion-label>
                <p>Products pending sync</p>
              </ion-label>
            </ion-item>
          </ion-card>
        </div>
        <div class="ion-margin-top">
          <ion-text>Configuration</ion-text>
          <div class="cards config">
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
              <ion-item button>
                <ion-label>Shipping methods</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button>
                <ion-label>Facilities</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
          </div>
        </div>
        <div class="ion-margin-top">
          <ion-text>Products and Inventory</ion-text>
          <div class="cards config">
            <ion-card>
              <ion-item button>
                <ion-label>Inventory variances</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
          </div>
        </div>
        <div class="ion-margin-top">
          <ion-text>Orders and fulfillment</ion-text>
          <div class="cards config">
            <ion-card>
              <ion-item button>
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
              <ion-item button>
                <ion-label>Departments</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
            <ion-card>
              <ion-item button>
                <ion-label>Sales Channel</ion-label>
                <ion-icon slot="end" :icon="chevronForwardOutline"/>
              </ion-item>
            </ion-card>
          </div>
        </div>
        <div class="ion-margin-top">
          <ion-text>Transfer orders</ion-text>
          <div class="cards config">
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
          </div>
        </div>

      </main>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { search, chevronForwardOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import SftpModal from "@/components/SftpModal.vue";
import ProductStoreModal from "@/components/ProductStoreModal.vue";
import PriceLevelModal from "@/components/PriceLevelModal.vue";
import DiscountsModal from "@/components/DiscountsModal.vue";

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
.cards {
  display: grid;
  align-items: center; 
}

.number-card {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.config {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.count {
  height: 100%;
  font-size: 8em;
  align-self: center;
}
</style>