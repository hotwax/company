<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Archived parking") }}</ion-title>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <ion-list v-if="archivedFacilities.length">
      <ion-item v-for="(archivedFacility, index) in archivedFacilities" :key="index">
        <ion-label>
          {{ archivedFacility.facilityName || archivedFacility.facilityId }}
          <p>{{ archivedFacility.facilityId }}</p>
        </ion-label>
        <ion-button fill="clear" size="default" color="medium" @click="unarchiveFacility(archivedFacility)">
          <ion-icon slot="icon-only" :icon="gitPullRequestOutline" />
        </ion-button>
      </ion-item>
    </ion-list>
    <div v-else class="empty-state">
      {{ translate('No archived parkings to show.') }}
    </div>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  modalController
} from "@ionic/vue";
import { computed } from "vue";
import { closeOutline, gitPullRequestOutline } from 'ionicons/icons';
import { commonUtil, logger, translate } from "@common";
import { api } from "@common";
import { DateTime } from "luxon";
import { useFacilityStore } from "@/store/facility";

const facilityStore = useFacilityStore();
const archivedFacilities = computed(() => (facilityStore as any).getArchivedFacilities);

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

async function unarchiveFacility(archivedFacility: any) {
  try {
    const resp = await api({
      url: `admin/facilityGroups/ARCHIVE/facilities/${archivedFacility.facilityId}/association`,
      method: "post",
      data: {
        fromDate: archivedFacility.fromDate,
        thruDate: DateTime.now().toMillis()
      }
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Parking unarchived successfully."));
      (facilityStore as any).updateArchivedFacilities(
        archivedFacilities.value.filter((f: any) => f.facilityId !== archivedFacility.facilityId)
      );
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to unarchive parking."));
    logger.error(err);
  }
}
</script>
