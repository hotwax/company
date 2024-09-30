<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Departments") }}</ion-title>
      </ion-toolbar>
    </ion-header>

  <ion-content>
    <div class="header ion-margin-top">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
        <ion-label>
          Map departments with NetSuite
          <p>Learn more about mapping departments with NetSuite to make sure orders are attributed correctly.</p>
        </ion-label>
        <ion-icon :icon="openOutline" slot="end" />
      </ion-item>
    </div>

    <div class="list-item">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="storefrontOutline" />
        <ion-label>
          <p class="overline">Retail</p>
          Store 1 name
          <p>Facility Id</p>
        </ion-label>
      </ion-item>

      <ion-label>
        Shopify Mapping ID
        <p>Shopify</p>
      </ion-label>
      
      <div class="ion-text-center">
        <ion-chip :outline="true">
          <ion-label>2</ion-label>
          <ion-icon fill="" :icon="closeCircleOutline" />
        </ion-chip>
        <ion-label>
          <p>NetSuite department ID</p>
        </ion-label>
      </div>
        
      <ion-label class="ion-margin-end">
        150
        <p>orders</p>
      </ion-label>
    </div>

    <div class="list-item">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="storefrontOutline" />
        <ion-label>
          <p class="overline">Retail</p>
          Store 1 name
          <p>Facility Id</p>
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
        
      <ion-label class="ion-margin-end">
        150
        <p>orders</p>
      </ion-label>
    </div>
  </ion-content>
</ion-page>
</template>
<script setup lang="ts">
import { IonBackButton } from '@ionic/vue'
import { IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar } from "@ionic/vue";
import { addOutline, closeCircleOutline, openOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';

</script>
<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>