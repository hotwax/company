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
  popoverController
} from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { addOutline, archiveOutline, closeOutline, ellipsisVerticalOutline, gitPullRequestOutline, saveOutline } from 'ionicons/icons';
import { commonUtil, logger, translate } from '@common';
import { useArchivedFacilities, useFacilityPartitions, useFacilityArchive, useFacilityCreation, useFacilityMutations, useFacilityOrderCounts } from '@/composables/useFacilities';
import { useOrganization } from '@/composables/useSeed';
import { generateInternalId } from '@/utils';
import VirtualFacilityActionsPopover from '@/components/facility/VirtualFacilityActionsPopover.vue';

// Only the VOLATILE read (order counts) still uses the store — it is deliberately never cached.
// The lists are cached and the writes go through the facility mutation composables, which own the
// cache consequence of each write.

const { virtualFacilities: cachedVirtualFacilities } = useFacilityPartitions();
const { archivedFacilities } = useArchivedFacilities();
const { createVirtualFacility: createVirtualFacilityRecord } = useFacilityCreation();
const { unarchive } = useFacilityArchive();
const { fetchOrderCounts } = useFacilityOrderCounts();
const { organizationPartyId, loadOrganizationPartyId } = useOrganization();

/** Volatile per-facility order counts — fetched when the list arrives, never cached. */
const volatileDetail = ref<Record<string, any>>({});

const virtualFacilities = computed(() => cachedVirtualFacilities.value.map((facility: any) => ({
  ...facility,
  ...(volatileDetail.value[facility.facilityId] ?? {}),
})));

// The whole set is local, so there is nothing left to page through.
const isScrollable = computed(() => false);


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

/**
 * Fetch the volatile order counts once the cached list is available.
 *
 * A `onIonViewWillEnter` hook is too early: the list arrives asynchronously from IndexedDB, so at
 * view-enter there are no ids yet and the fetch would be skipped, leaving every card without a
 * count. Watching the cached list covers both the first emit and any later cache write.
 */
watch(cachedVirtualFacilities, async (facilities: any[]) => {
  const ids = facilities.map((facility: any) => facility.facilityId);
  if (!ids.length) return;
  const counts = await fetchOrderCounts(ids);
  volatileDetail.value = Object.fromEntries(ids.map((id: string) => [id, { orderCount: counts[id] ?? 0 }]));
}, { immediate: true });

function isFacilityDescriptionAvailable(facility: any) {
  return facility.description && facility.facilityId !== '_NA_';
}

async function loadMoreFacilities(event: any) {
  // Nothing to load: the complete set is cached and rendered.
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
    // Loaded lazily: the org partyId is only needed to stamp a new facility, so a page visit that
    // creates nothing costs no request. The composable memoises it for the session.
    await loadOrganizationPartyId();
    const resp = await createVirtualFacilityRecord({
      ...formData.value,
      ownerPartyId: organizationPartyId.value
    });
    if (!commonUtil.hasError(resp)) {
      // No local list append: the composable re-read the new row into the cache, and the list is
      // rendered from that cache, so it updates on its own.
      commonUtil.showToast(translate("New parking created successfully."));
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
      const resp = await useFacilityMutations(facility.facilityId).updateFacility({ facilityName: result.data });
      if (!commonUtil.hasError(resp)) {
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
  // Pure UI. Archiving and unarchiving each refresh the membership cache themselves, so there is
  // nothing to re-snapshot on close — this used to force a full facility re-sync to paper over the
  // fact that the writes left the cache untouched.
  showArchivedFacilityModal.value = false;
}

async function unarchiveFacility(archivedFacility: any) {
  try {
    // `fromDate` comes from the cached MEMBERSHIP row (see `useArchivedFacilities`) — it identifies
    // which date-effective association to close.
    const resp = await unarchive(archivedFacility.facilityId, archivedFacility.fromDate);
    if (!commonUtil.hasError(resp)) {
      // Both lists re-derive from the refreshed membership cache: the parking leaves the archived
      // modal and reappears in the active list.
      commonUtil.showToast(translate("Parking unarchived successfully."));
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
