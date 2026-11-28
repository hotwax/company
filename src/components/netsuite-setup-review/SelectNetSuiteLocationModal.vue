<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button data-testid="select-netsuite-location-close" @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Select NetSuite location") }}</ion-title>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <ion-item lines="none">
      <ion-label class="ion-text-wrap">
        {{ facilityName }}
        <p>{{ translate("NetSuite locations that no OMS location uses yet") }}</p>
      </ion-label>
    </ion-item>
    <ion-searchbar data-testid="select-netsuite-location-search" :placeholder="translate('Search NetSuite locations')" v-model="queryString"
      @ion-focus="selectSearchBarText($event)" @keyup.enter="queryString = $event.target.value; findLocation()" />
    <ion-radio-group v-model="selectedLocationId">
      <ion-item v-for="location in shownLocations" :key="location.netSuiteLocationId" :data-testid="`select-netsuite-location-${location.netSuiteLocationId}`">
        <ion-radio label-placement="end" justify="start" :value="location.netSuiteLocationId">
          <ion-label>
            {{ location.name }}
            <p>{{ location.netSuiteLocationId }}</p>
          </ion-label>
        </ion-radio>
      </ion-item>
    </ion-radio-group>
    <div v-if="!shownLocations.length" class="empty-state">
      <p>{{ translate("No NetSuite locations found") }}</p>
    </div>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button data-testid="select-netsuite-location-save" :disabled="!selectedLocationId" @click="closeModal({ netSuiteLocationId: selectedLocationId })">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonRadio, IonRadioGroup, IonSearchbar, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { ref } from "vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { translate } from "@common";

const props = defineProps<{ facilityName: string; locations: { netSuiteLocationId: string; name: string }[] }>();

const selectedLocationId = ref("");
const queryString = ref("");
const shownLocations = ref(props.locations);

function findLocation() {
  const searchedString = queryString.value.trim().toLowerCase();
  shownLocations.value = searchedString
    ? props.locations.filter((location) => location.name?.toLowerCase().includes(searchedString) || location.netSuiteLocationId.includes(searchedString))
    : props.locations;
}

async function selectSearchBarText(event: any) {
  const element = await event.target.getInputElement();
  element.select();
}

function closeModal(payload = {}) {
  modalController.dismiss({ ...payload });
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
