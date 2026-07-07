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
import { commonUtil, logger, translate } from "@common";
import { api } from "@common";
import { DateTime } from "luxon";
import { useFacilityStore } from "@/store/facility";

const props = defineProps<{ facility: any }>();

const facilityStore = useFacilityStore();

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
  let facilityGroupId = await ensureArchiveGroup();
  if (!facilityGroupId) {
    commonUtil.showToast(translate('Failed to archive parking.'));
    return;
  }
  try {
    const resp = await api({
      url: `admin/facilityGroups/${facilityGroupId}/facilities/${props.facility.facilityId}/association`,
      method: "post",
      data: { fromDate: DateTime.now().toMillis() }
    });
    if (!commonUtil.hasError(resp)) {
      (facilityStore as any).updateVirtualFacilities(
        (facilityStore as any).getVirtualFacilities.filter((f: any) => f.facilityId !== props.facility.facilityId)
      );
      await (facilityStore as any).fetchArchivedFacilities();
      commonUtil.showToast(translate("Parking archived successfully."));
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate('Failed to archive parking.'));
    logger.error('Failed to archive parking.', error);
  }
  popoverController.dismiss();
}

async function ensureArchiveGroup(): Promise<string> {
  try {
    const checkResp = await api({ url: "oms/facilityGroups/ARCHIVE", method: "get" });
    if (!commonUtil.hasError(checkResp) && checkResp.data?.facilityGroupId) {
      return checkResp.data.facilityGroupId;
    }
  } catch { /* group doesn't exist, create it */ }

  try {
    const createResp = await api({
      url: "oms/facilityGroups",
      method: "post",
      data: { facilityGroupId: 'ARCHIVE', facilityGroupName: 'Archive' }
    });
    if (!commonUtil.hasError(createResp)) {
      return 'ARCHIVE';
    }
  } catch (error) {
    logger.error('Failed to create archive group', error);
  }
  return '';
}
</script>
