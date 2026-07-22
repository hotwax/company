<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Parking") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openArchivedFacilityModal()">
            <ion-icon slot="icon-only" :icon="archiveOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <ion-card v-for="(facility, index) in sortedFacilities" :key="index">
          <ion-item lines="full">
            <ion-label>
              <h1>{{ facility.facilityName }}</h1>
              <p>{{ facility.facilityId }}</p>
            </ion-label>
            <ion-button fill="clear" size="default" color="medium" @click="openVirtualFacilityActionsPopover($event, facility)">
              <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
            </ion-button>
          </ion-item>
          <template v-if="facility.facilityId === '_NA_'">
            <ion-item>
              <ion-label>{{ translate('Pending allocation') }}</ion-label>
              <ion-note slot="end">{{ facility.orderCount }}</ion-note>
            </ion-item>
            <ion-item lines="none">
              <ion-label>{{ translate('Next brokering') }}</ion-label>
              <ion-note slot="end">{{ facility?.brokeringJob?.runTime ? commonUtil.getDateAndTime(facility?.brokeringJob?.runTime) : translate("Not scheduled") }}</ion-note>
            </ion-item>
          </template>
          <ion-item v-else :lines="isFacilityDescriptionAvailable(facility) ? 'inset' : 'none'">
            <ion-label>{{ translate('Orders') }}</ion-label>
            <ion-note slot="end">{{ facility.orderCount }}</ion-note>
          </ion-item>
          <ion-item lines="none" v-if="isFacilityDescriptionAvailable(facility)">
            <ion-label>{{ facility.description }}</ion-label>
          </ion-item>
        </ion-card>
      </main>
      <ion-infinite-scroll
        @ionInfinite="loadMoreFacilities($event)"
        threshold="100px"
        :disabled="!isScrollable"
      >
        <ion-infinite-scroll-content
          loading-spinner="crescent"
          :loading-text="translate('Loading')"
        />
      </ion-infinite-scroll>
      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="openCreateVirtualFacilityModal()">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonNote,
  IonPage,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
  popoverController
} from '@ionic/vue';
import { computed } from 'vue';
import { addOutline, archiveOutline, ellipsisVerticalOutline } from 'ionicons/icons';
import { api, commonUtil, logger, translate } from '@common';
import { useFacilityStore } from '@/store/facility';
import CreateVirtualFacilityModal from '@/components/CreateVirtualFacilityModal.vue';
import VirtualFacilityActionsPopover from '@/components/VirtualFacilityActionsPopover.vue';
import ArchivedFacilityModal from '@/components/ArchivedFacilityModal.vue';

const facilityStore = useFacilityStore();

const virtualFacilities = computed(() => (facilityStore as any).getVirtualFacilities);
const isScrollable = computed(() => (facilityStore as any).isVirtualFacilitiesScrollable);

// keep _NA_ (pending allocation) pinned first; all other parkings flow in fetch order
const sortedFacilities = computed(() => {
  return [...virtualFacilities.value].sort((a: any, b: any) => {
    if (a.facilityId === '_NA_') return -1;
    if (b.facilityId === '_NA_') return 1;
    return 0;
  });
});

onIonViewWillEnter(async () => {
  await (facilityStore as any).fetchArchivedFacilities();
  await (facilityStore as any).fetchVirtualFacilities({ viewSize: import.meta.env.VITE_VIEW_SIZE, viewIndex: 0 });
});

function isFacilityDescriptionAvailable(facility: any) {
  return facility.description && facility.facilityId !== '_NA_';
}

async function loadMoreFacilities(event: any) {
  const nextIndex = Math.ceil(virtualFacilities.value.length / import.meta.env.VITE_VIEW_SIZE);
  await (facilityStore as any).fetchVirtualFacilities({ viewSize: import.meta.env.VITE_VIEW_SIZE, viewIndex: nextIndex });
  event.target.complete();
}

async function openCreateVirtualFacilityModal() {
  const modal = await modalController.create({ component: CreateVirtualFacilityModal });
  modal.present();
}

async function openVirtualFacilityActionsPopover(event: Event, facility: any) {
  const popover = await popoverController.create({
    component: VirtualFacilityActionsPopover,
    event,
    showBackdrop: false,
    componentProps: { facility }
  });

  popover.present();

  const result = await popover.onDidDismiss();
  if (result.data && result.data !== facility.facilityName) {
    try {
      const resp = await api({
        url: `oms/facilities/${facility.facilityId}`,
        method: "put",
        data: { facilityName: result.data }
      });
      if (!commonUtil.hasError(resp)) {
        (facilityStore as any).updateVirtualFacilities(
          virtualFacilities.value.map((f: any) =>
            f.facilityId === facility.facilityId ? { ...f, facilityName: result.data } : f
          )
        );
        commonUtil.showToast(translate('Parking renamed successfully.'));
      } else {
        throw resp.data;
      }
    } catch (error) {
      commonUtil.showToast(translate('Failed to rename parking.'));
      logger.error('Failed to rename parking.', error);
    }
  }
}

async function openArchivedFacilityModal() {
  const modal = await modalController.create({ component: ArchivedFacilityModal });
  modal.onDidDismiss().then(() => (facilityStore as any).fetchVirtualFacilities({ viewSize: import.meta.env.VITE_VIEW_SIZE, viewIndex: 0 }));
  modal.present();
}
</script>

<style scoped>
main {
  display: grid;
  place-content: center;
  grid-template-columns: repeat(auto-fill, minmax(300px, 343px));
  max-width: 1000px;
  margin: auto;
  align-items: start;
}

@media screen and (min-width: 991px) {
  ion-content {
    --padding-bottom: 80px;
  }
}
</style>
