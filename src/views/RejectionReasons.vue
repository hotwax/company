<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title slot="start">{{ translate("Rejection reasons") }}</ion-title>

        <ion-segment :value="selectedSegment" @ionChange="updateSegment($event)" slot="end">
          <ion-segment-button value="fulfillment">
            <ion-label>{{ translate("Fulfillment") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="bopis">
            <ion-label>{{ translate("BOPIS") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="order-manager">
            <ion-label>{{ translate("Order Manager") }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <div v-if="filteredReasons.length">
          <ion-reorder-group @ionItemReorder="doReorder($event)" :disabled="false">
            <div class="list-item" v-for="reason in filteredReasons" :key="reason.enumId">
              <ion-item lines="none">
                <ion-label>
                  <p class="overline">{{ reason.enumId }}</p>
                  {{ reason.enumName ? reason.enumName : reason.enumId }}
                  <p>{{ reason.description }}</p>
                </ion-label>
              </ion-item>

              <div class="tablet">
                <ion-chip outline @click="openVarianceTypeActionsPopover($event, reason)">
                  <ion-label>{{ reason.enumTypeId }}</ion-label>
                  <ion-icon :icon="caretDownOutline" />
                </ion-chip>
              </div>

              <div class="tablet">
                <ion-toggle v-if="currentGroupId" :checked="isReasonEnabledForCurrentSegment(reason)" @click.prevent="toggleReasonStatusForCurrentSegment($event, reason)" />
              </div>

              <ion-reorder />

              <ion-button fill="clear" color="medium" @click="openRejectionReasonActionsPopover($event, reason)">
                <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
              </ion-button>
            </div>
          </ion-reorder-group>
        </div>
        <div class="empty-state" v-else-if="!isFetching">
          <p>{{ translate("No rejection reasons found.") }}</p>
        </div>
      </main>

      <ion-fab @click="openCreateRejectionReasonModal()" vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button>
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonPage,
  IonReorder,
  IonReorderGroup,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToggle,
  IonToolbar,
  alertController,
  modalController,
  onIonViewWillEnter,
  popoverController
} from "@ionic/vue";
import { computed, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { addOutline, caretDownOutline, ellipsisVerticalOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import CreateRejectionReasonModal from "@/components/rejection-reasons/CreateRejectionReasonModal.vue";
import RejectReasonActionsPopover from "@/components/rejection-reasons/RejectReasonActionsPopover.vue";
import VarianceTypeActionsPopover from "@/components/rejection-reasons/VarianceTypeActionsPopover.vue";
import { useRejectionReasons } from "@/composables/useRejectionReasons";
import { DateTime } from "luxon";

const {
  rejectReasons,
  rejectReasonEnumTypes,
  groupRejectReasons,
  isFetching,
  fetchRejectReasons,
  fetchRejectReasonEnumTypes,
  fetchEnumGroupMembers,
  updateEnumeration,
  updateEnumerationGroupMember
} = useRejectionReasons();

const filteredReasons = ref<any[]>([]);
const toast = ref<any>(null);
const selectedSegment = ref("fulfillment");

const currentGroupId = computed(() => {
  if (selectedSegment.value === "fulfillment") return "FF_REJ_RSN_GRP";
  if (selectedSegment.value === "bopis") return "BOPIS_REJ_RSN_GRP";
  return "";
});

const isReasonEnabledForCurrentSegment = (reason: any) => {
  const groupId = currentGroupId.value;
  if (groupId) {
    return !!groupRejectReasons.value[groupId]?.[reason.enumId];
  }
  // For Order Manager: active if thruDate is not set
  return !reason.thruDate;
};

const updateSegment = async (event: CustomEvent) => {
  selectedSegment.value = event.detail.value;
  const groupId = currentGroupId.value;
  if (groupId) {
    await fetchEnumGroupMembers(groupId);
  } else {
    await fetchRejectReasons();
    filteredReasons.value = rejectReasons.value ? JSON.parse(JSON.stringify(rejectReasons.value)) : [];
  }
};

const loadData = async () => {
  await Promise.all([
    fetchRejectReasons(),
    fetchRejectReasonEnumTypes(),
    fetchEnumGroupMembers("FF_REJ_RSN_GRP"),
    fetchEnumGroupMembers("BOPIS_REJ_RSN_GRP")
  ]);
  filteredReasons.value = rejectReasons.value ? JSON.parse(JSON.stringify(rejectReasons.value)) : [];
};

const openCreateRejectionReasonModal = async () => {
  const modal = await modalController.create({
    component: CreateRejectionReasonModal,
    componentProps: {
      rejectReasons: filteredReasons.value,
      rejectReasonEnumTypes: rejectReasonEnumTypes.value
    }
  });

  modal.onDidDismiss().then((result) => {
    if (result.data?.isUpdated && result.data.newReason) {
      filteredReasons.value.push(result.data.newReason);
      rejectReasons.value.push(result.data.newReason);
    }
  });

  modal.present();
};

const openRejectionReasonActionsPopover = async (event: Event, reason: any) => {
  const linkedGroups: string[] = [];
  if (groupRejectReasons.value.FF_REJ_RSN_GRP?.[reason.enumId]) linkedGroups.push(translate("Fulfillment"));
  if (groupRejectReasons.value.BOPIS_REJ_RSN_GRP?.[reason.enumId]) linkedGroups.push(translate("BOPIS"));

  const popover = await popoverController.create({
    component: RejectReasonActionsPopover,
    componentProps: {
      reason,
      linkedGroups,
      groupMembers: {
        FF_REJ_RSN_GRP: groupRejectReasons.value.FF_REJ_RSN_GRP?.[reason.enumId],
        BOPIS_REJ_RSN_GRP: groupRejectReasons.value.BOPIS_REJ_RSN_GRP?.[reason.enumId]
      }
    },
    showBackdrop: false,
    event
  });

  popover.onDidDismiss().then((result) => {
    if (result.data?.isRemoved) {
      filteredReasons.value = filteredReasons.value.filter((rejectionReason: any) => rejectionReason.enumId !== result.data.removedEnumId);
      rejectReasons.value = rejectReasons.value.filter((rejectionReason: any) => rejectionReason.enumId !== result.data.removedEnumId);
      if (groupRejectReasons.value.FF_REJ_RSN_GRP?.[result.data.removedEnumId]) {
        delete groupRejectReasons.value.FF_REJ_RSN_GRP[result.data.removedEnumId];
      }
      if (groupRejectReasons.value.BOPIS_REJ_RSN_GRP?.[result.data.removedEnumId]) {
        delete groupRejectReasons.value.BOPIS_REJ_RSN_GRP[result.data.removedEnumId];
      }
    } else if (result.data?.isUpdated && result.data.updatedReason) {
      const idx = filteredReasons.value.findIndex((rejectionReason: any) => rejectionReason.enumId === result.data.updatedReason.enumId);
      if (idx !== -1) {
        filteredReasons.value[idx].enumName = result.data.updatedReason.enumName;
        filteredReasons.value[idx].description = result.data.updatedReason.description;
      }
    }
  });

  return popover.present();
};

const openVarianceTypeActionsPopover = async (event: Event, reason: any) => {
  const popover = await popoverController.create({
    component: VarianceTypeActionsPopover,
    componentProps: {
      reason,
      rejectReasonEnumTypes: rejectReasonEnumTypes.value
    },
    showBackdrop: false,
    event
  });

  popover.onDidDismiss().then((result) => {
    if (result.data?.isUpdated && result.data.newEnumTypeId) {
      const idx = filteredReasons.value.findIndex((rejectionReason: any) => rejectionReason.enumId === reason.enumId);
      if (idx !== -1) {
        filteredReasons.value[idx].enumTypeId = result.data.newEnumTypeId;
      }
    }
  });

  return popover.present();
};

const doReorder = async (event: CustomEvent) => {
  const previousSeq = JSON.parse(JSON.stringify(filteredReasons.value));
  const updatedSeq = event.detail.complete(JSON.parse(JSON.stringify(filteredReasons.value)));

  let diffSeq = findReasonsDiff(previousSeq, updatedSeq);

  const updatedSequenceNum = previousSeq.map((rejectionReason: any) => rejectionReason.sequenceNum);
  Object.keys(diffSeq).forEach((key: any) => {
    diffSeq[key].sequenceNum = updatedSequenceNum[key];
  });

  diffSeq = Object.keys(diffSeq).map((key) => diffSeq[key]);
  filteredReasons.value = updatedSeq;

  if (diffSeq.length && !toast.value) {
    toast.value = (await commonUtil.showToast(
      translate("Rejection reasons order has been changed. Click save button to update them."),
      {
        buttons: [
          {
            text: translate("Save"),
            handler: () => {
              toast.value = null;
              saveReasonsOrder();
            }
          }
        ],
        manualDismiss: true
      }
    )) as any;

    toast.value?.present?.();
  }
};

const findReasonsDiff = (previousSeq: any, updatedSeq: any) => {
  const diffSeq: any = Object.keys(previousSeq).reduce((diff, key) => {
    if (updatedSeq[key].enumId === previousSeq[key].enumId && updatedSeq[key].sequenceNum === previousSeq[key].sequenceNum) return diff;
    return {
      ...diff,
      [key]: updatedSeq[key]
    };
  }, {});
  return diffSeq;
};

const saveReasonsOrder = async () => {
  const diffReasons = filteredReasons.value.filter((reason: any) =>
    rejectReasons.value.some((rejectReason: any) => rejectReason.enumId === reason.enumId && rejectReason.sequenceNum !== reason.sequenceNum)
  );

  const responses = await Promise.allSettled(
    diffReasons.map(async (reason: any) => {
      await updateEnumeration(reason);
    })
  );

  const isFailedToUpdateSomeReason = responses.some((response) => response.status === "rejected");
  if (isFailedToUpdateSomeReason) {
    commonUtil.showToast(translate("Failed to update sequence for some rejection reasons."));
  } else {
    commonUtil.showToast(translate("Sequence for rejection reasons updated successfully."));
    rejectReasons.value = JSON.parse(JSON.stringify(filteredReasons.value));
  }
};

const toggleReasonStatusForCurrentSegment = async (event: any, reason: any) => {
  event.stopImmediatePropagation();
  const groupId = currentGroupId.value;
  if (!groupId) return;

  // Fulfillment or BOPIS group association toggle
  let resp: any;
  const currentMember = groupRejectReasons.value[groupId]?.[reason.enumId];

  const payload: any = {
    enumerationId: reason.enumId,
    enumerationGroupId: groupId,
    sequenceNum: reason.sequenceNum,
    fromDate: currentMember?.fromDate || DateTime.now().toMillis()
  };

  if (currentMember?.fromDate) {
    payload.thruDate = DateTime.now().toMillis();
  }

  try {
    resp = await updateEnumerationGroupMember(payload);

    if (!commonUtil.hasError(resp)) {
      await fetchEnumGroupMembers(groupId);
    } else {
      throw resp.data;
    }
  } catch (error: any) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to update reason association with group."));
  }
};

onIonViewWillEnter(async () => {
  await loadData();
});

onBeforeRouteLeave(async () => {
  if (!toast.value) return true;

  let canLeave = false;
  const alert = await alertController.create({
    header: translate("Leave page"),
    message: translate("Any edits made on this page will be lost."),
    buttons: [
      {
        text: translate("STAY"),
        handler: () => {
          canLeave = false;
        }
      },
      {
        text: translate("LEAVE"),
        handler: () => {
          canLeave = true;
          toast.value?.dismiss?.();
        }
      }
    ]
  });

  alert.present();
  await alert.onDidDismiss();
  return canLeave;
});
</script>

<style scoped>
.list-item {
  --columns-desktop: 5;
}

ion-content {
  --padding-bottom: 80px;
}
</style>
