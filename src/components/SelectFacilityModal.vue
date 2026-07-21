<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Select facilities") }}</ion-title>
    </ion-toolbar>
    <ion-toolbar>
      <ion-searchbar v-model="queryString" :placeholder="translate('Search facilities')" @keyup.enter="search()" />
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <template v-if="filteredFacilities.length">
      <ion-list v-if="!isFacilityLogin">
        <ion-item v-for="facility in filteredFacilities" :key="facility.facilityId">
          <ion-checkbox :checked="isSelected(facility.facilityId)" @ion-change="toggleFacilitySelection(facility)">
            <ion-label>
              {{ facility.facilityName || facility.facilityId }}
              <p>{{ facility.facilityId }}</p>
            </ion-label>
          </ion-checkbox>
        </ion-item>
      </ion-list>

      <ion-list v-else>
        <ion-radio-group :value="selectedFacilities[0]?.facilityId" @ion-change="updateSelectedFacility($event)">
          <ion-item v-for="facility in filteredFacilities" :key="facility.facilityId">
            <ion-radio :value="facility.facilityId">
              <ion-label>
                {{ facility.facilityName || facility.facilityId }}
                <p>{{ facility.facilityId }}</p>
              </ion-label>
            </ion-radio>
          </ion-item>
        </ion-radio-group>
      </ion-list>
    </template>
    <div v-else class="empty-state">
      <p>{{ translate("No facilities found") }}</p>
    </div>

    <ion-fab slot="fixed" vertical="bottom" horizontal="end" @click="saveFacilities()">
      <ion-fab-button>
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonRadio, IonRadioGroup, IonSearchbar, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { translate } from "@common";
import { useUtilStore } from "@/store/util";

const props = defineProps({
  selectedFacilities: {
    type: Array,
    required: true
  },
  isFacilityLogin: {
    type: Boolean,
    default: false
  }
});

const utilStore = useUtilStore();

const queryString = ref("");
const filteredFacilities = ref<any[]>([]);
const selectedFacilityValues = ref<any[]>(JSON.parse(JSON.stringify(props.selectedFacilities)));

const facilities = computed(() => utilStore.getFacilities);

onMounted(async () => {
  await utilStore.fetchFacilities();
  filteredFacilities.value = facilities.value;
});

const closeModal = () => {
  modalController.dismiss({ dismissed: true });
};

const search = () => {
  filteredFacilities.value = facilities.value.filter((facility: any) =>
    facility.facilityId.toLowerCase().includes(queryString.value.toLowerCase()) ||
    (facility.facilityName && facility.facilityName.toLowerCase().includes(queryString.value.toLowerCase())));
};

const saveFacilities = () => {
  const facilitiesToAdd = selectedFacilityValues.value.filter((selectedFacility: any) => !props.selectedFacilities.some((facility: any) => (facility as any).facilityId === selectedFacility.facilityId));
  const facilitiesToRemove = props.selectedFacilities.filter((facility: any) => !selectedFacilityValues.value.some((selectedFacility: any) => selectedFacility.facilityId === facility.facilityId));
  modalController.dismiss({
    dismissed: true,
    value: {
      selectedFacilities: selectedFacilityValues.value,
      facilitiesToAdd,
      facilitiesToRemove
    }
  });
};

const toggleFacilitySelection = (updatedFacility: any) => {
  const hasFacility = selectedFacilityValues.value.some((facility: any) => facility.facilityId === updatedFacility.facilityId);
  if(hasFacility) {
    selectedFacilityValues.value = selectedFacilityValues.value.filter((facility: any) => facility.facilityId !== updatedFacility.facilityId);
  } else {
    selectedFacilityValues.value.push(updatedFacility);
  }
};

const isSelected = (facilityId: any) => {
  return selectedFacilityValues.value.some((facility: any) => facility.facilityId === facilityId);
};

const updateSelectedFacility = (event: CustomEvent) => {
  selectedFacilityValues.value = facilities.value.filter((facility: any) => facility.facilityId === event.detail.value);
};
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
