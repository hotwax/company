<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/tabs/product-store" slot="start"></ion-back-button>
        <ion-title>{{ translate("Create product store") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <h1 class="ion-margin-start">{{ translate('Create a new product store') }}</h1>

        <ion-item lines="none">
          <ion-input label-placement="floating" :label="translate('Company name')" :helper-text="translate('The name of the parent organization that owns all brands deployed on the OMS')" />
        </ion-item>
        <ion-item lines="none">
          <ion-input label-placement="floating" :label="translate('Name')" :helper-text="translate('Product store represents a brand in OMS')" />
        </ion-item>
        <ion-item lines="none">
          <ion-input label-placement="floating" :label="translate('ID')" :helper-text="translate('Product store represents a brand in OMS')" />
        </ion-item>

        <ion-item>
          <ion-icon slot="start" :icon="mapOutline"/>
          <ion-label>{{ translate("Operating countries") }}</ion-label>
          <ion-button fill="outline" slot="end">{{ translate("Add") }}</ion-button>
        </ion-item>

        <ion-item lines="none">
          <ion-chip outline>
            {{ "<countryName>" }}
            <ion-icon :icon="closeCircleOutline" />
          </ion-chip>
          <ion-chip outline>
            {{ "<countryName>" }}
            <ion-icon :icon="closeCircleOutline" />
          </ion-chip>
        </ion-item>

        <ion-button class="ion-margin-top">
          {{ translate("Manage configurations") }}
          <ion-icon slot="end" :icon="arrowForwardOutline"/>
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonChip, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { arrowForwardOutline, closeCircleOutline, mapOutline } from "ionicons/icons";
import { translate } from "@/i18n";

</script>

<style scoped>

  @media (min-width: 700px) {
    main {
      max-width: 375px;
      margin: auto;
    }
  }

</style>