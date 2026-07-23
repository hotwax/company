<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button default-href="/users" slot="start"></ion-back-button>
        <ion-title>{{ translate("Create user") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main>
        <ion-card>
          <ion-card-header>
            <ion-card-title v-if="selectedUser.groupName">{{ selectedUser.groupName }} </ion-card-title>
            <ion-card-title v-else>{{ selectedUser.firstName }} {{ selectedUser.lastName }}</ion-card-title>
            <ion-note>{{ selectedUser.partyId }}</ion-note>
          </ion-card-header>
          <ion-item v-if="selectedUser.emailDetails?.email">
            <ion-icon :icon="mailOutline" slot="start" />
            <ion-label>{{ selectedUser.emailDetails?.email}}</ion-label>
          </ion-item>
          <ion-item v-if="selectedUser.phoneNumberDetails?.contactNumber">
            <ion-icon :icon="callOutline" slot="start"/>
            <ion-label>{{ selectedUser.phoneNumberDetails?.contactNumber }}</ion-label>
          </ion-item>
          <ion-item v-if="selectedUser.externalId && selectedUser.partyTypeId !== 'PARTY_GROUP'">
            <ion-icon :icon="businessOutline" slot="start"/>
            <ion-label>{{ selectedUser.externalId }}</ion-label>
          </ion-item>
        </ion-card>
        <div class="actions ion-margin-top">
          <ion-button @click="quickSetup()">
            {{ translate("Quick Setup") }}
            <ion-icon slot="end" :icon="arrowForwardOutline"/>
          </ion-button>
          <ion-button color="medium" fill="outline" @click="confirmSetupManually()">
            {{ translate("Setup Manually") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonBackButton, IonButton, IonCard, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonNote, IonPage, IonTitle, IonToolbar, alertController, onIonViewWillEnter } from "@ionic/vue";
import router from "@/router";
import { useUserStore } from "@/store/user";
import { arrowForwardOutline, businessOutline, callOutline, mailOutline } from "ionicons/icons";
import { translate, emitter } from "@common";

const props = defineProps({
  partyId: {
    type: String,
    required: true
  }
});

const userStore = useUserStore();

const selectedUser = computed(() => userStore.selectedUser);

onIonViewWillEnter(async () => {
  emitter.emit("presentLoader");
  await userStore.getSelectedUserDetails({ partyId: props.partyId });
  emitter.emit("dismissLoader");
});

const quickSetup = async () => {
  await router.replace({ path: `/user-quick-setup/${props.partyId}` });
};

const setupManually = async () => {
  await router.replace({ path: `/user-details/${selectedUser.value.partyId}` });
};

const confirmSetupManually = async () => {
  const message = "Automatic user setup helps configure various settings to get them up and running with most frequently used settings. Are you sure you want to set up this user manually?";
  const alert = await alertController.create({
    header: translate("Setup manually"),
    message: translate(message),
    buttons: [
      {
        text: translate("Cancel"),
      },
      {
        text: translate("Setup manually"),
        handler: async () => {
          await setupManually();
        }
      }
    ],
  });
  return alert.present();
};
</script>

<style scoped>
  ion-card-header {
    display: flex;
    justify-content: space-between;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: start;
  }

  @media (min-width: 700px) {
    main {
      max-width: 375px;
      margin: auto;
    }
  }
</style>
