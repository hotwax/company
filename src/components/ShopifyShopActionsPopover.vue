<template>
  <ion-content>
    <ion-list>
      <ion-list-header>
        {{ "<shopifyShopName>" }}
      </ion-list-header>
      <ion-item button>
        <ion-label>{{ translate("Copy credentials") }}</ion-label>
        <ion-icon :icon="copyOutline" slot="end" />
      </ion-item>
      <ion-item button>
        <ion-label>{{ translate("Favorite") }}</ion-label>
        <ion-icon :icon="star" slot="end" />
      </ion-item>
      <ion-item button lines="none">
        <ion-label color="danger">{{ translate("Deactivate shop") }}</ion-label>
        <ion-icon :icon="unlinkOutline" color="danger" slot="end" />
      </ion-item>
    </ion-list>
  </ion-content>
</template>
  
<script setup lang="ts">
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader } from "@ionic/vue";
import { translate } from '@hotwax/dxp-components'
import { copyOutline, star, unlinkOutline } from 'ionicons/icons'

</script>