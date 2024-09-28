<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Sales Channel") }}</ion-title>
      </ion-toolbar>
    </ion-header>

  <ion-content>
    <div class="header ion-margin-top">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="shieldCheckmarkOutline"></ion-icon>
        <ion-label>
          Map sales channel with NetSuite
          <p>Learn more about mapping sales channels with NetSuite to make sure orders are attributed correctly.</p>
        </ion-label>
        <ion-icon :icon="openOutline" slot="end"></ion-icon>
      </ion-item>
    </div>

    <div class="list-item ion-margin-top">
      <ion-item lines="none">
        <ion-label>
          Sales Channel Name
          <p>Sales Channel Id</p>
        </ion-label>
      </ion-item>

      <ion-label>
        Shopify Mapping ID
        <p>Shopify</p>
      </ion-label>
      
      <div class="align ion-text-center">
        <ion-chip :outline="true">
          <ion-label>2</ion-label>
          <ion-icon fill="" :icon="closeCircleOutline" />
        </ion-chip>
        <ion-label>
          <p>NetSuite sales channel</p>
        </ion-label>
      </div>
        
      <ion-label class="ion-margin">
        150
        <p>orders</p>
      </ion-label>
    </div>

    <div class="list-item ion-margin-top">
      <ion-item lines="none">
        <ion-label>
          Sales Channel Name
          <p>Sales Channel Id</p>
        </ion-label>
      </ion-item>

      <ion-label>
        Shopify Mapping ID
        <p>Shopify</p>
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
.header {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
}

.list-item {
  --columns-desktop: 5;
}

.list-item > ion-item {
  width: 100%;
}
</style>