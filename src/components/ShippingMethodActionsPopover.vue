<template>
  <ion-content>
    <ion-list>
      <ion-list-header>
        {{ translate("Shipping methods") }}
      </ion-list-header>

      <ion-item button>
        <ion-label>{{ translate("Change mapping") }}</ion-label>
        <ion-icon :icon="repeatOutline" slot="end" />
      </ion-item>

      <ion-item button lines="none">
        <ion-label color="danger">{{ translate("Remove") }}</ion-label>
        <ion-icon :icon="removeCircleOutline" color="danger" slot="end" />
      </ion-item>
    </ion-list>
  </ion-content>
</template>
  
<script setup lang="ts">
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader } from "@ionic/vue";
import { translate } from '@/i18n';
import { removeCircleOutline, repeatOutline } from 'ionicons/icons';
</script>