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

      <ion-modal :is-open="showArchivedFacilityModal" @didDismiss="closeArchivedFacilityModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="showArchivedFacilityModal = false">
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
      </ion-modal>

      <ion-modal :is-open="showCreateVirtualFacilityModal" @didDismiss="closeCreateVirtualFacilityModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeCreateVirtualFacilityModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("New parking") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <form @keyup.enter="createVirtualFacility">
            <ion-list>
              <ion-item>
                <ion-input label-placement="floating" @ionBlur="setFacilityId($event)" v-model="formData.facilityName">
                  <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
                </ion-input>
              </ion-item>
              <ion-item lines="none">
                <ion-input
                  :label="translate('Internal ID')"
                  label-placement="floating"
                  ref="facilityIdRef"
                  v-model="formData.facilityId"
                  @ionInput="validateFacilityId"
                  @ionBlur="markFacilityIdTouched"
                  :error-text="translate('Internal ID cannot be more than 20 characters.')"
                />
              </ion-item>
              <ion-item>
                <ion-input label-placement="floating" :label="translate('Description')" v-model="formData.description" />
              </ion-item>
            </ion-list>

            <ion-fab vertical="bottom" horizontal="end" slot="fixed">
              <ion-fab-button @click="createVirtualFacility" @keyup.enter.stop>
                <ion-icon :icon="saveOutline" />
              </ion-fab-button>
            </ion-fab>
          </form>
        </ion-content>
      </ion-modal>
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
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonNote,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
  popoverController
} from '@ionic/vue';
import { computed, ref } from 'vue';
import { addOutline, archiveOutline, closeOutline, ellipsisVerticalOutline, gitPullRequestOutline, saveOutline } from 'ionicons/icons';
import { api, commonUtil, logger, translate } from '@common';
import { DateTime } from 'luxon';
import { useFacilityStore } from '@/store/facility';
import { useUtilStore } from '@/store/util';
import { generateInternalId } from '@/utils';
import VirtualFacilityActionsPopover from '@/components/facility/VirtualFacilityActionsPopover.vue';

const facilityStore = useFacilityStore();
const utilStore = useUtilStore();

const virtualFacilities = computed(() => (facilityStore as any).getVirtualFacilities);
const isScrollable = computed(() => (facilityStore as any).isVirtualFacilitiesScrollable);
const archivedFacilities = computed(() => (facilityStore as any).getArchivedFacilities);

const showArchivedFacilityModal = ref(false);
const showCreateVirtualFacilityModal = ref(false);

const facilityIdRef = ref<any>(null);
const isAutoGenerateId = ref(true);
const formData = ref({ facilityName: '', facilityId: '', description: '' });

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

function openCreateVirtualFacilityModal() {
  formData.value = { facilityName: '', facilityId: '', description: '' };
  isAutoGenerateId.value = true;
  showCreateVirtualFacilityModal.value = true;
}

function closeCreateVirtualFacilityModal() {
  showCreateVirtualFacilityModal.value = false;
}

function setFacilityId(event: any) {
  if (isAutoGenerateId.value) {
    formData.value.facilityId = generateInternalId(event.target.value);
  }
}

function validateFacilityId(event: any) {
  const value = event.target.value;
  const el = facilityIdRef.value?.$el;
  if (!el) return;
  el.classList.remove('ion-valid', 'ion-invalid');
  if (value === '') return;
  formData.value.facilityId.length <= 20
    ? el.classList.add('ion-valid')
    : el.classList.add('ion-invalid');
  isAutoGenerateId.value = false;
}

function markFacilityIdTouched() {
  facilityIdRef.value?.$el.classList.add('ion-touched');
}

async function createVirtualFacility() {
  if (!formData.value.facilityName?.trim()) {
    commonUtil.showToast(translate('Please fill all the required fields'));
    return;
  }
  if (formData.value.facilityId.length > 20) {
    commonUtil.showToast(translate('Internal ID cannot be more than 20 characters.'));
    return;
  }
  if (!formData.value.facilityId) {
    formData.value.facilityId = generateInternalId(formData.value.facilityName);
  }
  try {
    const payload = {
      ...formData.value,
      facilityTypeId: 'VIRTUAL_FACILITY',
      ownerPartyId: utilStore.organizationPartyId
    };
    const resp = await (facilityStore as any).createVirtualFacility(payload);
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("New parking created successfully."));
      const created = { ...formData.value, facilityTypeId: 'VIRTUAL_FACILITY', orderCount: 0 };
      (facilityStore as any).updateVirtualFacilities([...(facilityStore as any).getVirtualFacilities, created]);
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    if (error?.response?.data?.error?.message) {
      commonUtil.showToast(error.response.data.error.message);
    } else {
      commonUtil.showToast(translate('Failed to create parking.'));
    }
  }
  showCreateVirtualFacilityModal.value = false;
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

function openArchivedFacilityModal() {
  showArchivedFacilityModal.value = true;
}

function closeArchivedFacilityModal() {
  showArchivedFacilityModal.value = false;
  (facilityStore as any).fetchVirtualFacilities({ viewSize: import.meta.env.VITE_VIEW_SIZE, viewIndex: 0 });
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
        archivedFacilities.value.filter((facility: any) => facility.facilityId !== archivedFacility.facilityId)
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
