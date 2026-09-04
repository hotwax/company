<template>
  <ion-content>
    <ion-list>
      <ion-item button :disabled="!isRegenerationRequired" @click="regenerateLatitudeAndLongitude">
        {{ translate("Regenerate") }}
      </ion-item>
      <ion-item button lines="none" @click="removeLatitudeAndLongitude">
        {{ translate("Remove") }}
      </ion-item>
    </ion-list>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonItem,
  IonList,
  popoverController
} from "@ionic/vue";
import { commonUtil, emitter, logger, translate } from "@common";
import { useFacilityMutations } from "@/composables/useFacilities";
import { useGeocode } from "@/composables/useSeed";
import { computed } from "vue";

// The address is passed in by the opener. It used to be read from `facilityStore.current`, which
// the detail page no longer populates — so the postcode lookup had nothing to work with.
const props = defineProps(['facilityId', 'isRegenerationRequired', 'postalAddress']);
const mutations = useFacilityMutations(props.facilityId);
const { latLongForPostalCode } = useGeocode();
const postalAddress = computed<any>(() => props.postalAddress ?? {});

async function regenerateLatitudeAndLongitude() {
  let resp;
  let generatedLatLong;

  emitter.emit('presentLoader');

  try {
    generatedLatLong = await latLongForPostalCode(postalAddress.value.postalCode);

    if (generatedLatLong) {
      {
        resp = await mutations.updatePostalAddress({
          ...postalAddress.value,
          latitude: generatedLatLong.latitude,
          longitude: generatedLatLong.longitude
        });

        if (!commonUtil.hasError(resp)) {
          commonUtil.showToast(translate("Successfully regenerated latitude and longitude for the facility."));
          // Contact mechs are live per visit; the opener reloads them on dismiss.
        } else {
          throw resp.data;
        }
      }
    } else {
      throw resp;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to regenerate latitude and longitude for the facility."));
    logger.error(err);
  }

  popoverController.dismiss({ generatedLatLong });
  emitter.emit('dismissLoader');
}

async function removeLatitudeAndLongitude() {
  emitter.emit('presentLoader');

  try {
    const resp = await mutations.updatePostalAddress({
      ...postalAddress.value,
      latitude: '',
      longitude: ''
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Facility latitude and longitude removed successfully."));
      // Contact mechs are live per visit; the opener reloads them on dismiss.
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to remove facility latitude and longitude."));
    logger.error(err);
  }

  popoverController.dismiss();
  emitter.emit('dismissLoader');
}
</script>
