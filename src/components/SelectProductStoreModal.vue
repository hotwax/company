<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Select product stores") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item v-for="productStore in productStores" :key="productStore.productStoreId">
        <ion-checkbox :checked="isSelected(productStore.productStoreId)" @ion-change="toggleProductStoreSelection(productStore)">
          <ion-label>
            {{ productStore.storeName || productStore.productStoreId }}
            <p>{{ productStore.productStoreId }}</p>
          </ion-label>
        </ion-checkbox>
      </ion-item>
    </ion-list>

    <ion-fab slot="fixed" vertical="bottom" horizontal="end" @click="saveProductStores()">
      <ion-fab-button>
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { translate } from "@common";
import { useUtilStore } from "@/store/util";

const props = defineProps<{
  selectedProductStores: any[]
}>();

const utilStore = useUtilStore();

const productStores = computed(() => utilStore.getProductStores);
const selectedProductStoreValues = ref<any[]>(JSON.parse(JSON.stringify(props.selectedProductStores || [])));

const closeModal = () => {
  modalController.dismiss({ dismissed: true });
};

const saveProductStores = () => {
  const productStoresToCreate = selectedProductStoreValues.value.filter((selectedStore: any) => !props.selectedProductStores.some((store: any) => store.productStoreId === selectedStore.productStoreId))
  const productStoresToRemove = props.selectedProductStores.filter((store: any) => !selectedProductStoreValues.value.some((selectedStore: any) => store.productStoreId === selectedStore.productStoreId))

  modalController.dismiss({
    dismissed: true,
    value: {
      selectedProductStores: selectedProductStoreValues.value,
      productStoresToCreate,
      productStoresToRemove
    }
  });
};

const toggleProductStoreSelection = (updatedStore: any) => {
  const selectedStore = selectedProductStoreValues.value.some((store :any) => store.productStoreId === updatedStore.productStoreId);
  if(selectedStore) {
    selectedProductStoreValues.value = selectedProductStoreValues.value.filter((store :any) => store.productStoreId !== updatedStore.productStoreId);
  } else {
    selectedProductStoreValues.value.push(updatedStore);
  }
};

const isSelected = (productStoreId: any) => {
  return selectedProductStoreValues.value.some((productStore :any) => productStore.productStoreId === productStoreId);
};
</script>
