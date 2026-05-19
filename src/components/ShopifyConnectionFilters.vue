<template>
  <ion-menu type="overlay" side="end">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ translate("Filters") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-item lines="none">
          <ion-icon :icon="flashOutline" slot="start" />
          <ion-toggle>{{ translate("Show active shops") }}</ion-toggle>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-menu>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonIcon, IonItem, IonList, IonMenu, IonTitle, IonToggle, IonToolbar } from '@ionic/vue'
import { flashOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
</script>