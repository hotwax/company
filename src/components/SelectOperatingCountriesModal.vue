<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Select operating countries") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-searchbar :placeholder="translate('Search country')"  />

    <ion-list>
      <ion-item>
        <ion-checkbox>
          <ion-label>
            <p class="overline">{{ "GEO ID" }}</p>
            {{ "<countryName>" }}
          </ion-label>
        </ion-checkbox>
      </ion-item>
      <ion-item>
        <ion-checkbox>
          <ion-label>
            <p class="overline">{{ "GEO ID" }}</p>
            {{ "<countryName>" }}
          </ion-label>
        </ion-checkbox>
      </ion-item>
      <ion-item>
        <ion-checkbox>
          <ion-label>
            <p class="overline">{{ "GEO ID" }}</p>
            {{ "<countryName>" }}
          </ion-label>
        </ion-checkbox>
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button>
        <ion-icon :icon="checkmarkOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { checkmarkOutline, closeOutline } from "ionicons/icons";
import { translate } from "@/i18n";

function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>

<style scoped>
  ion-content {
    --padding-bottom: 80px;
  }
</style>