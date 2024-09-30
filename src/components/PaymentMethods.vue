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
            Map payment methods with NetSuite
            <p>For an order to sync with NetSuite, the payment method on that order must be mapped to a NetSuite shipment method ID.</p>
          </ion-label>
          <ion-icon :icon="openOutline" slot="end" />
        </ion-item>
      </div>

      <div class="list-item ion-margin-top">
        <ion-item lines="none">
          <ion-label>
            Payment Method Name
            <p>Payment Method Id</p>
          </ion-label>
        </ion-item>

        <ion-label>
          Shopify Mapping ID
          <p>variances in 7 days</p>
        </ion-label>
        
        <div class="ion-text-center">
          <ion-chip :outline="true">
            <ion-label>2</ion-label>
            <ion-icon fill="" :icon="closeCircleOutline" />
          </ion-chip>
          <ion-label>
            <p>NetSuite payment method ID</p>
          </ion-label>
        </div>
          
        <ion-label class="ion-margin">
          150
          <p>orders</p>
        </ion-label>
      </div>

      <div class="list-item">
        <ion-item lines="none">
          <ion-label>
            Payment Method Name
            <p>Payment Method Id</p>
          </ion-label>
        </ion-item>

        <ion-label>
          Shopify Mapping ID
          <p>variances in 7 days</p>
        </ion-label>
        
        <ion-button size="small" fill="outline">
          <ion-icon :icon="addOutline"/>
          <ion-label>NetSuite id</ion-label>
        </ion-button>
          
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
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';

</script>
<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>