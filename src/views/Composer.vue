<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Composer") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Content will go here -->
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { translate } from "@common";
</script>

<style scoped>
</style>
