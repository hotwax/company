<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ currentFacilityUser?.groupName }}</ion-list-header>
      <ion-item button @click="viewDetails()">
        {{ translate("View details") }}
        <ion-icon slot="end" :icon="keyOutline" />
      </ion-item>
      <!-- TODO: Uncomment when OFBiz sendResetPasswordMailToParty is confirmed working; migrate to maarg admin/users/sendResetPasswordMail when backend support is available
      <ion-item button @click="sendResetPasswordEmail()">
        {{ translate("Reset password email") }}
        <ion-icon slot="end" :icon="mailOutline" />
      </ion-item>
      -->
      <ion-item button lines="none" @click="unlinkFacilityLoginAlert()">
        {{ translate("Unlink") }}
        <ion-icon slot="end" :icon="removeCircleOutline" />
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonItem,
  IonList,
  IonListHeader,
  alertController,
  popoverController
} from "@ionic/vue";
import { removeCircleOutline, keyOutline } from "ionicons/icons";
import { commonUtil, cookieHelper, emitter, logger, translate } from "@common";
import { DateTime } from "luxon";
import router from "@/router";
import { useFacilityStore } from "@/store/facility";

const props = defineProps(['currentFacility', 'currentFacilityUser', 'facilityTypeDesc']);
const facilityStore = useFacilityStore();

async function viewDetails() {
  popoverController.dismiss();
  const userDetailUrl = `${import.meta.env.VITE_FACILITIES_LOGIN_URL}?oms=${cookieHelper().get('oms')}&token=${commonUtil.getToken()}&expirationTime=${commonUtil.getTokenExpiration()}&partyId=${props.currentFacilityUser.partyId}&redirectedFrom=${router.currentRoute.value.path}`;
  window.location.href = userDetailUrl;
}

// async function sendResetPasswordEmail() {
//   try {
//     const resp = await (facilityStore as any).sendResetPasswordEmail({ userLoginId: props.currentFacilityUser.userLoginId });
//     if (!commonUtil.hasError(resp)) {
//       commonUtil.showToast(translate('Password reset email sent successfully.'));
//     } else {
//       throw resp.data;
//     }
//   } catch (error) {
//     commonUtil.showToast(translate('Failed to send password reset email.'));
//     logger.error('Failed to send password reset email', error);
//   }
//   popoverController.dismiss();
// }

// TODO: Enable when moqui UserAccount disabling is supported in the backend
// async function removePartyFromFacilityCompletely(payload: any) {
//   try {
//     const resp = await (facilityStore as any).fetchFacilityPartyRoles({ facilityId: payload.facilityId, partyId: payload.partyId });
//     if (!commonUtil.hasError(resp) && resp.data?.length > 0) {
//       const responses = await Promise.all(resp.data.map((facilityParty: any) =>
//         (facilityStore as any).removePartyFromFacility({ ...facilityParty, thruDate: DateTime.now().toMillis() })
//       ));
//       responses.forEach(r => { if (commonUtil.hasError(r)) throw r.data; });
//     } else {
//       throw resp.data;
//     }
//   } catch (err) {
//     commonUtil.showToast(translate('Failed to remove party from facility'));
//     logger.error('Failed to remove party from facility', err);
//     return;
//   }
// }

async function unlinkFacilityLogin() {
  emitter.emit('presentLoader');
  try {
    const resp = await (facilityStore as any).removePartyFromFacility({
      facilityId: props.currentFacilityUser.facilityId,
      partyId: props.currentFacilityUser.partyId,
      roleTypeId: props.currentFacilityUser.roleTypeId,
      fromDate: props.currentFacilityUser.fromDate,
      thruDate: DateTime.now().toMillis()
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Facility login removed."));
    } else {
      throw resp.data;
    }

    // TODO: Enable when moqui UserAccount disabling is supported in the backend
    // await removePartyFromFacilityCompletely({ facilityId: props.currentFacility.facilityId, partyId: props.currentFacilityUser.partyId });
    // const blockResp = await (facilityStore as any).updateUserLoginStatus({
    //   enabled: 'N',
    //   partyId: props.currentFacilityUser.partyId,
    //   userLoginId: props.currentFacilityUser.userLoginId
    // });
    // if (!commonUtil.hasError(blockResp)) {
    //   commonUtil.showToast(translate("Facility login removed."));
    // } else {
    //   throw blockResp.data;
    // }

    await facilityStore.fetchFacilityParties({ facilityId: props.currentFacility?.facilityId });
  } catch (err) {
    commonUtil.showToast(translate("Failed to remove facility login."));
    logger.error('Failed to remove facility login', err);
  }
  emitter.emit('dismissLoader');
  popoverController.dismiss();
}

async function unlinkFacilityLoginAlert() {
  const alert = await alertController.create({
    header: translate(`Unlink ${props.facilityTypeDesc} login`),
    message: translate('Are you sure you want to unlink this login from the facility?'),
    buttons: [
      { text: translate("Cancel") },
      { text: translate("Confirm"), handler: async () => { await unlinkFacilityLogin(); } }
    ]
  });
  return alert.present();
}
</script>
