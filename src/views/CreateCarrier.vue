<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/carriers" slot="start" />
        <ion-title>{{ translate("Create carrier") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <ion-item>
          <ion-input
            v-model="carrier.groupName"
            label-placement="floating"
            @ion-blur="setCarrierPartyId($event)"
          >
            <div slot="label">{{ translate("Name") }} <ion-text color="danger">*</ion-text></div>
          </ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            v-model="carrier.partyId"
            label-placement="floating"
            :label="translate('ID')"
          />
        </ion-item>
        <ion-button class="ion-margin-top" :disabled="creating" @click="handleCreateCarrier()">
          {{ translate("Setup methods") }}
          <ion-icon slot="end" :icon="arrowForwardOutline" />
        </ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
} from "@ionic/vue";
import { ref } from "vue";
import { arrowForwardOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { createCarrier } from "@/composables/useCarriers";
import router from "@/router";

const carrier = ref({
  groupName: "",
  partyId: "",
});
const creating = ref(false);

const clearCarrierData = () => {
  carrier.value = {
    groupName: "",
    partyId: "",
  };
};

const setCarrierPartyId = (event: any) => {
  if (!carrier.value.partyId) {
    carrier.value.partyId = commonUtil.generateInternalId(event.target.value);
  }
};

const handleCreateCarrier = async () => {
  if (!carrier.value.groupName?.trim()) {
    commonUtil.showToast(translate("Carrier name can not be empty."));
    return;
  }
  const groupName = carrier.value.groupName.trim();
  const partyId = (carrier.value.partyId?.trim() || commonUtil.generateInternalId(groupName)).toUpperCase();

  creating.value = true;
  try {
    const createdPartyId = await createCarrier({ partyId, groupName });
    if (createdPartyId) {
      router.replace({ path: `/shipment-methods-setup/${encodeURIComponent(createdPartyId)}` });
    }
  } catch (err: any) {
    logger.error("Failed to create carrier", err);
    commonUtil.showToast(translate("Failed to create carrier."));
  } finally {
    creating.value = false;
  }
};

onIonViewWillEnter(() => {
  clearCarrierData();
});
</script>

<style scoped>
@media (min-width: 700px) {
  main {
    max-width: 375px;
    margin: var(--spacer-xl) auto;
  }
}
</style>
