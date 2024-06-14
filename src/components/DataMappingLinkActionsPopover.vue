<template>
  <ion-content>
    <ion-list>
      <ion-list-header>
        {{ "<Payment methods>" }}
      </ion-list-header>
      
      <ion-radio-group>
        <ion-item>
          <ion-radio>{{ "<hotwaxPaymentMethod>" }}</ion-radio>
        </ion-item>

        <ion-item>
          <ion-radio>{{ "<hotwaxPaymentMethod>" }}</ion-radio>
        </ion-item>
      </ion-radio-group>

      <ion-item lines="none">
        <ion-label color="primary">{{ translate("Create new") }}</ion-label>
        <ion-icon :icon="addCircleOutline" slot="end" color="primary" />
      </ion-item>
    </ion-list>
  </ion-content>
</template>
  
<script setup lang="ts">
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonRadio, IonRadioGroup } from "@ionic/vue";
import { addCircleOutline } from "ionicons/icons";
import { translate } from "@/i18n";
</script>