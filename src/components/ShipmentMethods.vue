<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Shipment methods") }}</ion-title>
      </ion-toolbar>
    </ion-header>
  <ion-content>
    <div class="header ion-margin-top">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="shieldCheckmarkOutline"></ion-icon>
        <ion-label>
          Map shipment methods to NetSuite
          <p>For an order to sync with NetSuite, the shipment method on that order must be mapped to a NetSuite shipment method ID.</p>
        </ion-label>
      </ion-item>
      <ion-item lines="none">
        <ion-icon slot="start" :icon="informationCircleOutline"></ion-icon>
        <ion-label>
          Don't see a shipment method?
          <p>If you don’t see a shipment method on this page that you know you’ve setup in HotWax Commerce, it may not be linked to the Product Store your NetSuite account is linked too.</p>
        </ion-label>
      </ion-item>
    </div>
    <div class="ion-margin-top">
      <ion-text>Product store name shipment methods</ion-text>
    </div>
    <ion-button size="small" fill="clear">
      <ion-label>Add more shipment methods</ion-label>
    </ion-button>
    <div class="list-item ion-margin-top">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="airplaneOutline" />
        <ion-label>
          Method Name
          <p>Method Id</p>
        </ion-label>
      </ion-item>

      <ion-label>
        carrier party name
        <p>carrier party id</p>
      </ion-label>

      <ion-label>
        shopify mapping name
        <p>Shopify name</p>
      </ion-label>
      
      <div class="align">
        <ion-chip :outline="true">
          <ion-label>15</ion-label>
          <ion-icon fill="" :icon="closeCircleOutline" />
        </ion-chip>
        <ion-label>
          <p>NetSuite ID</p>
        </ion-label>
      </div>

      <ion-label class="ion-margin">
        150
        <p>orders</p>
      </ion-label>
    </div>
    <div class="list-item ion-margin-top">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="airplaneOutline" />
        <ion-label>
          Method Name
          <p>Method Id</p>
        </ion-label>
      </ion-item>

      <ion-label>
        carrier party name
        <p>carrier party id</p>
      </ion-label>

      <ion-label>
        shopify mapping name
        <p>Shopify name</p>
      </ion-label>
      
      <ion-button size="small" fill="outline">
        <ion-icon :icon="addOutline"/>
        <ion-label>NetSuite id</ion-label>
      </ion-button>

      <ion-label class="ion-margin">
        0
        <p>orders</p>
      </ion-label>
    </div>
  </ion-content>
</ion-page>
</template>
<script setup lang="ts">
import { IonBackButton } from '@ionic/vue'
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonText, IonTitle, IonToolbar } from "@ionic/vue";
import { addOutline, airplaneOutline, closeCircleOutline, informationCircleOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';

</script>
<style scoped>
.header {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
}

.list-item {
  --columns-desktop: 6;
  border-bottom : 1px solid var(--ion-color-medium);
}

.list-item > ion-item {
  width: 100%;
}
</style>