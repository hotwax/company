<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button default-href="/carriers" slot="start" />
        <ion-title>{{ translate("Setup methods") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <ion-list class="items-inline">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="peopleOutline" />
            <ion-label>
              <p class="overline">{{ carrier?.partyId || partyId }}</p>
              {{ carrier?.groupName || carrier?.partyId || partyId }}
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
            <ion-toggle v-model="configuredOnly">
              {{ translate("Only methods for this carrier") }}
            </ion-toggle>
          </ion-item>
        </ion-list>
        <hr />
        <ShipmentMethods
          :methods="shipmentMethods"
          :carrier-party-id="partyId"
          :configured-only="configuredOnly"
        />
      </main>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="solid" color="medium" @click="openCreateShipmentMethodModal()">
            <ion-icon :icon="addCircleOutline" />
            {{ translate("Create shipment method") }}
          </ion-button>
          <ion-button fill="solid" color="primary" @click="finishSetup()">
            <ion-icon slot="start" :icon="checkmarkDoneOutline" />
            {{ translate("Finish setup") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { ref } from "vue";
import {
  addCircleOutline,
  checkmarkDoneOutline,
  peopleOutline,
  shieldCheckmarkOutline,
} from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { useCarrier } from "@/composables/useCarriers";
import ShipmentMethods from "@/components/carrier/ShipmentMethods.vue";
import CreateShipmentMethodModal from "@/components/carrier/CreateShipmentMethodModal.vue";
import router from "@/router";

const props = defineProps<{
  partyId: string;
}>();

const { carrier, shipmentMethods } = useCarrier(props.partyId);
const configuredOnly = ref(false);

const openCreateShipmentMethodModal = async () => {
  const modal = await modalController.create({
    component: CreateShipmentMethodModal,
    componentProps: {
      carrierPartyId: props.partyId,
    },
  });
  return modal.present();
};

const finishSetup = () => {
  commonUtil.showToast(translate("Carrier and shipment methods have been set up successfully."));
  router.replace({ path: `/carrier-details/${encodeURIComponent(props.partyId)}` });
};
</script>

<style scoped>
ion-content > main {
  max-width: 1110px;
  margin-right: auto;
  margin-left: auto;
}

.items-inline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(228px, 1fr));
  gap: var(--spacer-xs);
  align-items: start;
  margin-bottom: var(--spacer-lg);
}
</style>
