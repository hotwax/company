<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Select time zone") }}</ion-title>
    </ion-toolbar>
    <ion-toolbar>
      <ion-searchbar @ionFocus="selectSearchBarText($event)" :placeholder="translate('Search time zones')" v-model="queryString" @keyup.enter="queryString = $event.target.value; findTimeZone()" @keydown="preventSpecialCharacters($event)" />
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <div>
      <ion-radio-group v-model="timeZoneId">
        <ion-list v-if="showBrowserTimeZone">
          <ion-list-header>{{ translate("Browser time zone") }}</ion-list-header>
          <ion-item>
            <ion-radio label-placement="end" justify="start" :value="browserTimeZone.id">
              <ion-label>
                {{ browserTimeZone.label }} ({{ browserTimeZone.id }})
                <p v-if="showDateTime">{{ getCurrentTime(browserTimeZone.id, dateTimeFormat) }}</p>
              </ion-label>
            </ion-radio>
          </ion-item>
        </ion-list>
        <ion-list>
          <ion-list-header v-if="showBrowserTimeZone">{{ translate("Select a different time zone") }}</ion-list-header>
          <div class="empty-state" v-if="isLoading">
            <ion-item lines="none">
              <ion-spinner color="secondary" name="crescent" slot="start" />
              {{ translate("Fetching time zones") }}
            </ion-item>
          </div>
          <div class="empty-state" v-else-if="filteredTimeZones.length === 0">
            <p>{{ translate("No time zone found") }}</p>
          </div>
          <div v-else>
            <ion-item :key="timeZone.id" v-for="timeZone in filteredTimeZones">
              <ion-radio label-placement="end" justify="start" :value="timeZone.id">
                <ion-label>
                  {{ timeZone.label }} ({{ timeZone.id }})
                  <p v-if="showDateTime">{{ getCurrentTime(timeZone.id, dateTimeFormat) }}</p>
                </ion-label>
              </ion-radio>
            </ion-item>
          </div>
        </ion-list>
      </ion-radio-group>
    </div>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!timeZoneId || timeZoneId === currentTimeZoneId" @click="setFacilityTimeZone">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonRadio,
  IonRadioGroup,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue';
import { closeOutline, saveOutline } from "ionicons/icons";
import { computed, onMounted, ref } from "vue";
import { commonUtil, logger, translate } from "@common";
import { DateTime } from 'luxon';
import { useFacilityMutations, useFacilityRecord } from "@/composables/useFacilities";
import { useTimeZones } from "@/composables/useSeed";

const props = defineProps({
  facilityId: { type: String, required: true },
  showBrowserTimeZone: { type: Boolean, default: true },
  showDateTime: { type: Boolean, default: true },
  dateTimeFormat: { type: String, default: 't ZZZZ' }
});

// `facilityId` is a prop; the facility itself is read from the cache. Previously both came from
// `facilityStore.current`, which the detail page no longer populates.
const mutations = useFacilityMutations(props.facilityId);
const { record } = useFacilityRecord(props.facilityId);
const currentFacility = computed<any>(() => (record.value as any)?.raw ?? record.value ?? {});
const currentTimeZoneId = computed(() => currentFacility.value?.facilityTimeZone);
const { timeZones, loadTimeZones } = useTimeZones();

const isLoading = ref(true);
const queryString = ref('');
const filteredTimeZones = ref([] as any[]);
const timeZoneId = ref(currentTimeZoneId.value);
const browserTimeZone = ref({
  label: '',
  id: Intl.DateTimeFormat().resolvedOptions().timeZone
});

const closeModal = () => {
  timeZoneId.value = currentTimeZoneId.value;
  modalController.dismiss();
};

function findTimeZone() {
  const searchedString = queryString.value.toLowerCase();
  filteredTimeZones.value = timeZones.value.filter((timeZone: any) =>
    timeZone.id.toLowerCase().includes(searchedString) || timeZone.label.toLowerCase().includes(searchedString)
  );
  if (props.showBrowserTimeZone) {
    filteredTimeZones.value = filteredTimeZones.value.filter((timeZone: any) =>
      !timeZone.id.toLowerCase().includes(browserTimeZone.value.id.toLowerCase())
    );
  }
}

onMounted(async () => {
  isLoading.value = true;
  await loadTimeZones();
  timeZoneId.value = currentFacility.value?.facilityTimeZone;

  if (props.showBrowserTimeZone) {
    browserTimeZone.value.label = timeZones.value?.find((timeZone: any) =>
      (timeZone?.id || '').toLowerCase().includes(browserTimeZone.value.id.toLowerCase())
    )?.label || '';
  }

  findTimeZone();
  isLoading.value = false;
});

async function setFacilityTimeZone() {
  try {
    // Same endpoint as any other facility field edit — the mutation re-reads the row into cache.
    const resp = await mutations.updateFacility({ facilityTimeZone: timeZoneId.value });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Facility timezone updated successfully.'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to update facility timezone.', err);
    commonUtil.showToast(translate('Failed to update facility timezone.'));
  }
  closeModal();
}

async function selectSearchBarText(event: any) {
  const element = await event.target.getInputElement();
  element.select();
}

function preventSpecialCharacters($event: any) {
  if (/[`!@#$%^&*()_+\-=\\|,.<>?~]/.test($event.key)) $event.preventDefault();
}

const getCurrentTime = (zone: string, format = 't ZZZZ') => {
  return DateTime.now().setZone(zone).toFormat(format);
};
</script>
