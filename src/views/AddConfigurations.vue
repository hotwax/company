<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/tabs/create-product-store" slot="start"></ion-back-button>
        <ion-title>{{ translate("Add configurations") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button slot="icon-only">
            <ion-icon :icon="informationCircleOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <h1 class="ion-margin-start">{{ translate('Configurations') }}</h1>

        <ion-list>
          <ion-list-header>
            <ion-label>{{ translate("Product") }}</ion-label>
          </ion-list-header>
          
          <ion-item>
            <ion-icon slot="start" :icon="shirtOutline"/>
            <ion-select interface="popover" :label="translate('Product Identifier')" value="sku">
              <ion-select-option value="sku">{{ "SKU" }}</ion-select-option>
            </ion-select>
          </ion-item>
          
          <ion-list-header>
            <ion-label>{{ translate("Order") }}</ion-label>
          </ion-list-header>

          <ion-item>
            <ion-toggle>{{ translate("Auto approve orders") }}</ion-toggle>
          </ion-item>
          <ion-item lines="none">
            <ion-input label-placement="floating" label="Sales order ID prefix" helper-text="Add a custom prefix to HotWax order IDs: <inputValue>10001" />
          </ion-item>
        </ion-list>

        <ion-button class="ion-margin-top" @click="setupProductStore()">
          {{ translate("Setup product store") }}
          <ion-icon slot="end" :icon="arrowForwardOutline"/>
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar } from "@ionic/vue";
import { arrowForwardOutline, informationCircleOutline, shirtOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useRouter } from "vue-router";

const router = useRouter();

function setupProductStore() {
  router.push("product-store-details")
}
</script>

<style scoped>
  @media (min-width: 700px) {
    main {
      max-width: 375px;
      margin: auto;
    }
  }
</style>