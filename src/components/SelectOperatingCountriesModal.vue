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
    <ion-searchbar :placeholder="translate('Search country')" v-model="queryString" @keydown.enter="updateQuery()" />

    <ion-list>
      <ion-item v-for="country in filteredCountries" :key="country.geoId" @click="toggleCountrySelection(country)">
        <ion-checkbox :checked="isAlreadySelected(country.geoId)">
          <ion-label>
            <p class="overline">{{ country.geoId }}</p>
            {{ country.geoName ? country.geoName : country.geoId }}
          </ion-label>
        </ion-checkbox>
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!areCountriesUpdated()" @click="saveCountries()">
        <ion-icon :icon="checkmarkOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { checkmarkOutline, closeOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useStore } from "vuex";
import { computed, defineProps, onMounted, ref } from "vue";

const store = useStore();

const props = defineProps(["selectedCountries"]);
const queryString = ref("");
const filteredCountries = ref([]) as any;
const selectedCountryValues = ref([]) as any;

const operatingCountries = computed(() => store.getters["util/getOperatingCountries"]);

onMounted(() => {
  selectedCountryValues.value = props.selectedCountries.length ? JSON.parse(JSON.stringify(props.selectedCountries)) : [];
  filteredCountries.value = JSON.parse(JSON.stringify(operatingCountries.value));
})

function updateQuery() {
  filteredCountries.value = operatingCountries.value.filter((country: any) => (country.geoName.toLowerCase().includes(queryString.value.toLowerCase()) || country.geoId.toLowerCase().includes(queryString.value.toLowerCase())))
}

function isAlreadySelected(geoId: any) {
  return selectedCountryValues.value.some((country: any) => country.geoId === geoId);
}

function toggleCountrySelection(selectedCountry: any) {
  if(isAlreadySelected(selectedCountry.geoId)) {
    selectedCountryValues.value = selectedCountryValues.value.filter((country: any) => country.geoId !== selectedCountry.geoId)
  } else {
    selectedCountryValues.value.push(selectedCountry);
  }
}

function areCountriesUpdated() {
  if(props.selectedCountries.length !== selectedCountryValues.value.length) return true;

  return selectedCountryValues.value.some((selectedCountry: any) => !props.selectedCountries.find((country: any) => country.geoId === selectedCountry.geoId));
}

function saveCountries() {
  modalController.dismiss({ dismissed: true, selectedCountries: selectedCountryValues.value })
}

function closeModal() {
  modalController.dismiss({ dismissed: true });
}
</script>

<style scoped>
  ion-content {
    --padding-bottom: 80px;
  }
</style>