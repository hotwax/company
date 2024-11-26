<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Product Store") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top">
      <ion-icon slot="start" :icon="informationCircleOutline" />
      <ion-label>
        {{ translate("Learn more about mapping product stores to subsidiaries") }}
      </ion-label>
      <ion-icon :icon="openOutline" slot="end" />
    </ion-item>

    <ion-item lines="full" class="ion-margin-top">
      <ion-select v-model="selectedStore" interface="popover" label="Product Store" placeholder="Select">
        <ion-select-option v-for="store in productStores" :key="store" :value="store.productStoreId">
          {{ store.storeName ? store.storeName : store.productStoreId }}
        </ion-select-option>
      </ion-select>
    </ion-item>

    <ion-item lines="full">
      <ion-input  v-model="subsidiary" label="Subsidiary" placeholder="Usually 1" />
    </ion-item>
    
    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button @click="saveSubsidiaryId"> 
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>
<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar, onIonViewWillEnter, modalController } from "@ionic/vue";
import { closeOutline, informationCircleOutline, openOutline, saveOutline } from 'ionicons/icons'
import { translate } from '@hotwax/dxp-components';
import { useStore } from "vuex";
import { computed, ref } from "vue";

 
const store = useStore();

const productStores = computed(() => store.getters["productStore/getProductStores"])
const selectedStore = ref(null);
const subsidiary = ref('')

onIonViewWillEnter(async () => {
  await store.dispatch("productStore/fetchProductStores");
})

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function saveSubsidiaryId() {

  // Clear the input fields after "saving"
  selectedStore.value = null;
  subsidiary.value = "";
  closeModal();
}
</script>