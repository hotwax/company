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
import { translate } from "@common";

const props = defineProps<{ facility: any }>();

async function renameVirtualFacility() {
  const alert = await alertController.create({
    header: translate('Rename parking'),
    inputs: [{ name: "facilityName", value: props.facility.facilityName }],
    buttons: [
      { text: translate('Cancel'), role: "cancel" },
      {
        text: translate('Apply'),
        handler: (data) => { popoverController.dismiss({ action: 'rename', name: data.facilityName }); }
      }
    ]
  });
  await alert.present();
}

async function archiveVirtualFacility() {
  popoverController.dismiss({ action: 'archive' });
}
</script>
