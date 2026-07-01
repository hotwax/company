<template>
  <ion-content>
    <ion-list>
      <ion-list-header>{{ currentFacilityUser?.groupName }}</ion-list-header>
      <ion-item button @click="viewDetails()">
        {{ translate("View details") }}
        <ion-icon slot="end" :icon="keyOutline" />
      </ion-item>
      <ion-item button @click="sendResetPasswordEmail()">
        {{ translate("Reset password email") }}
        <ion-icon slot="end" :icon="mailOutline" />
      </ion-item>
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
import { removeCircleOutline, mailOutline, keyOutline } from "ionicons/icons";
import { commonUtil, cookieHelper, emitter, logger, translate } from "@common";
import { DateTime } from "luxon";
import router from "@/router";
import { useFacilityStore } from "@/store/facility";
import { useUserStore } from "@/store/user";

const props = defineProps(['currentFacility', 'currentFacilityUser', 'facilityTypeDesc']);
const facilityStore = useFacilityStore();
const userStore = useUserStore();

async function viewDetails() {
  popoverController.dismiss();
  const userDetailUrl = `${import.meta.env.VITE_FACILITIES_LOGIN_URL}?oms=${cookieHelper().get('oms')}&token=${commonUtil.getToken()}&expirationTime=${commonUtil.getTokenExpiration()}&partyId=${props.currentFacilityUser.partyId}&redirectedFrom=${router.currentRoute.value.path}`;
  window.location.href = userDetailUrl;
}

async function sendResetPasswordEmail() {
  try {
    const resp = await userStore.sendResetPasswordEmail({
      emailAddress: props.currentFacilityUser.infoString,
      userName: props.currentFacilityUser.userLoginId
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Password reset email sent successfully.'));
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate('Failed to send password reset email.'));
    logger.error('Failed to send password reset email', error);
  }
  popoverController.dismiss();
}

async function removePartyFromFacilityCompletely(payload: any) {
  try {
    const resp = await facilityStore.fetchFacilityPartyRoles({ facilityId: payload.facilityId, partyId: payload.partyId });
    if (!commonUtil.hasError(resp) && resp.data?.length > 0) {
      const responses = await Promise.all(resp.data.map((facilityParty: any) =>
        facilityStore.removePartyFromFacility({ ...facilityParty, thruDate: DateTime.now().toMillis() })
      ));
      responses.forEach(r => { if (commonUtil.hasError(r)) throw r.data; });
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to remove party from facility'));
    logger.error('Failed to remove party from facility', err);
    return;
  }
}

async function unlinkFacilityLogin(data: any) {
  emitter.emit('presentLoader');
  try {
    if (data === 'UNLINK') {
      const resp = await facilityStore.removePartyFromFacility({
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
    }

    if (data === 'BLOCK') {
      await removePartyFromFacilityCompletely({ facilityId: props.currentFacility.facilityId, partyId: props.currentFacilityUser.partyId });
      const resp = await userStore.updateUserLoginStatus({
        enabled: 'N',
        partyId: props.currentFacilityUser.partyId,
        userLoginId: props.currentFacilityUser.userLoginId
      });
      if (!commonUtil.hasError(resp)) {
        commonUtil.showToast(translate("Facility login removed."));
      } else {
        throw resp.data;
      }
    }

    await facilityStore.fetchFacilityLogins({ facilityId: props.currentFacility?.facilityId });
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
    message: translate('Unlinking this login as an official facility login will not prevent this user from being used to login at this facility. Do you also want to block this user from logging into this facility?', { space: "<br><br>" }),
    inputs: [
      { label: translate('Unlink'), type: 'radio', value: 'UNLINK', checked: true },
      { label: translate('Unlink and block'), type: 'radio', value: 'BLOCK' }
    ],
    buttons: [
      { text: translate("Cancel") },
      { text: translate("Confirm"), handler: async (data: any) => { await unlinkFacilityLogin(data); } }
    ]
  });
  return alert.present();
}
</script>
