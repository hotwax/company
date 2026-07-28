<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Add operating hours") }}</ion-title>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <ion-accordion-group :value="selectedCalendarId">
      <ion-radio-group v-model="selectedCalendarId">
        <ion-accordion v-for="calendar in calendars" :key="calendar.calendarId" :value="calendar.calendarId">
          <ion-item slot="header">
            <ion-radio label-placement="end" justify="start" :value="calendar.calendarId">
              <ion-label class="ion-text-wrap">
                {{ calendar.description ? calendar.description : calendar.calendarId }}
              </ion-label>
            </ion-radio>
          </ion-item>
          <div class="ion-padding" slot="content">
            <ion-list lines="none">
              <ion-item v-for="day in days" :key="day">
                <ion-label>
                  <p>{{ translate(day.charAt(0).toUpperCase() + day.slice(1)) }}</p>
                </ion-label>
                <ion-label slot="end">
                  <p>{{ calendar[day+'StartTime'] ? getStartAndEndTime(calendar[day+'StartTime'], calendar[day+'Capacity']) : translate('Closed') }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>
        </ion-accordion>
      </ion-radio-group>
    </ion-accordion-group>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button :disabled="!selectedCalendarId || facilityCalendar.calendarId === selectedCalendarId" @click="saveOperatingHours()">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
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
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { DateTime } from "luxon";
import { useFacilityCalendars, useFacilityMutations } from "@/composables/useFacilities";
import { ref, onBeforeMount } from "vue";

const props = defineProps(["facilityId"]);
const mutations = useFacilityMutations(props.facilityId);
const { calendarOptions: calendars, loadCalendarOptions, fetchFacilityCalendar } = useFacilityCalendars();

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const selectedCalendarId = ref('' as any);
const facilityCalendar = ref<Record<string, any>>({});

onBeforeMount(async () => {
  // The catalog is empty until the techData routes land — see `useFacilityCalendars`.
  const [current] = await Promise.all([fetchFacilityCalendar(props.facilityId), loadCalendarOptions()]);
  facilityCalendar.value = current;
  selectedCalendarId.value = current.calendarId;
});

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function saveOperatingHours() {
  if (facilityCalendar.value?.calendarId) {
    updateOperatingHours();
  } else {
    addOperatingHours();
  }
}

async function addOperatingHours() {
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.saveCalendar({
      calendarId: selectedCalendarId.value,
      fromDate: DateTime.now().toMillis(),
      facilityCalendarTypeId: 'OPERATING_HOURS'
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Successfully associated calendar to the facility."));
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to associate calendar to the facility."));
    logger.error(err);
  }
  modalController.dismiss();
  emitter.emit('dismissLoader');
}

async function updateOperatingHours() {
  emitter.emit('presentLoader');
  try {
    // Swap = close the effective association, then open a new one.
    let resp = await mutations.removeCalendar({
      calendarId: facilityCalendar.value.calendarId,
      fromDate: facilityCalendar.value.fromDate
    });
    if (!commonUtil.hasError(resp)) {
      resp = await mutations.saveCalendar({
        calendarId: selectedCalendarId.value,
        fromDate: DateTime.now().toMillis(),
        facilityCalendarTypeId: 'OPERATING_HOURS'
      });
      if (!commonUtil.hasError(resp)) {
        commonUtil.showToast(translate("Successfully associated calendar to the facility."));
      } else {
        throw resp.data;
      }
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to associate calendar to the facility."));
    logger.error(err);
  }
  modalController.dismiss();
  emitter.emit('dismissLoader');
}

function getStartAndEndTime(startTime: any, capacity: any) {
  const formatedStartTime = DateTime.fromFormat(startTime, 'HH:mm:ss').toFormat('hh:mm a');
  const endTime = DateTime.fromMillis(DateTime.fromFormat(startTime, 'HH:mm:ss').toMillis() + capacity).toFormat('hh:mm a');
  return `${formatedStartTime} - ${endTime}`;
}
</script>

<style scoped>
ion-content {
  --padding-bottom: 80px;
}
</style>
