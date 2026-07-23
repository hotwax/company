<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ translate("Operating hours") }}</ion-list-header>
      <ion-item button @click="addOperatingHours">
        <ion-label>{{ translate("View other schedules") }}</ion-label>
      </ion-item>
      <ion-item button @click="addCustomSchedule">
        <ion-label>{{ translate("Add custom schedule") }}</ion-label>
      </ion-item>
      <ion-item button lines="none" @click="removeCalendarFromFacility">
        <ion-label>{{ translate("Remove schedule") }}</ion-label>
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  modalController,
  popoverController
} from "@ionic/vue";
import { commonUtil, emitter, logger, translate } from "@common";
import AddOperatingHoursModal from "@/components/AddOperatingHoursModal.vue";
import CustomScheduleModal from "@/components/CustomScheduleModal.vue";
import { useFacilityStore } from "@/store/facility";
import { computed } from "vue";

const props = defineProps(["facilityId"]);
const facilityStore = useFacilityStore();

const facilityCalendar = computed(() => facilityStore.getFacilityCalendar);

async function addOperatingHours() {
  const modal = await modalController.create({
    component: AddOperatingHoursModal,
    componentProps: { facilityId: props.facilityId }
  });
  modal.onDidDismiss().then(() => popoverController.dismiss());
  modal.present();
}

async function addCustomSchedule() {
  const modal = await modalController.create({
    component: CustomScheduleModal,
    componentProps: { facilityId: props.facilityId }
  });
  modal.onDidDismiss().then(() => popoverController.dismiss());
  modal.present();
}

async function removeCalendarFromFacility() {
  emitter.emit('presentLoader');
  try {
    const resp = await facilityStore.removeFacilityCalendar({
      facilityId: props.facilityId,
      calendarId: facilityCalendar.value.calendarId,
      facilityCalendarTypeId: facilityCalendar.value.facilityCalendarTypeId,
      fromDate: facilityCalendar.value.fromDate
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Successfully revoked calendar associativity with the facility."));
      await facilityStore.fetchFacilityCalendar({ facilityId: props.facilityId });
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to revoke calendar associativity with the facility."));
    logger.error(err);
  }
  popoverController.dismiss();
  emitter.emit('dismissLoader');
}
</script>
