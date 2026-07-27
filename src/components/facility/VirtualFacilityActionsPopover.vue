<template>
  <ion-content>
    <ion-list>
      <ion-list-header>
        {{ facility.facilityName }}
      </ion-list-header>
      <ion-item button @click="renameVirtualFacility()">
        {{ translate("Rename") }}
      </ion-item>
      <ion-item button @click="archiveVirtualFacility()" lines="none">
        {{ translate("Archive") }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonItem,
  IonList,
  IonListHeader,
  alertController,
  popoverController
} from "@ionic/vue";
import { commonUtil, translate } from "@common";
import { useFacilityArchive } from "@/composables/useFacilities";

const props = defineProps<{ facility: any }>();

// The archive composable owns resolving (and, once, creating) the ARCHIVE group and refreshing the
// cached memberships both lists on the Parking page are derived from.
const { archive } = useFacilityArchive();

async function renameVirtualFacility() {
  const alert = await alertController.create({
    header: translate('Rename parking'),
    inputs: [{ name: "facilityName", value: props.facility.facilityName }],
    buttons: [
      { text: translate('Cancel'), role: "cancel" },
      {
        text: translate('Apply'),
        handler: (data) => { popoverController.dismiss(data.facilityName); }
      }
    ]
  });
  await alert.present();
}

async function archiveVirtualFacility() {
  const resp: any = await archive(props.facility.facilityId);
  if (commonUtil.hasError(resp)) {
    commonUtil.showToast(translate('Failed to archive parking.'));
  } else {
    // No list surgery here: the composable re-listed the ARCHIVE group, so the parking moves out of
    // the active list and into the archived modal on its own.
    commonUtil.showToast(translate("Parking archived successfully."));
  }
  popoverController.dismiss();
}
</script>
