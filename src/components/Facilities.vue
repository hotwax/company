<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
      <ion-back-button slot="start" default-href="/netsuite" />
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Facilities") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            Map facilities to NetSuite
            <p>For orders and inventory to sync with NetSuite, the facilities in NetSuite must be mapped to facilities in HotWax Commerce</p>
          </ion-label>
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
          shopify mapping
          <p>Shopify location</p>
        </ion-label>
        
        <div>
          <ion-chip :outline="true">
            <ion-label>15</ion-label>
            <ion-icon :icon="closeCircleOutline" />
          </ion-chip>
          <ion-label>
            <p>NetSuite ID</p>
          </ion-label>
        </div>
        
        <ion-button fill="clear" color="medium">
          <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
        </ion-button>
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
          shopify mapping
          <p>Shopify location</p>
        </ion-label>
        
        <div>
          <ion-chip :outline="true">
            <ion-label>15</ion-label>
            <ion-icon :icon="closeCircleOutline" />
          </ion-chip>
          <ion-label>
            <p>NetSuite ID</p>
          </ion-label>
        </div>
        
        <ion-button fill="clear" color="medium">
          <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { translate } from "@/i18n"
import { IonBackButton, IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonMenuButton, IonTitle, IonToolbar } from "@ionic/vue";
import { closeCircleOutline, ellipsisVerticalOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'

</script>
<style scoped>
.list-item {
  --columns-desktop: 4;
}
</style>