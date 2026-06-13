<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("QuickBox 3PL") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <div class="ion-margin-top">
        <h1>{{ translate("Configuration") }}</h1>
        <section>
          <ion-item detail class="item-box" lines="none" button @click="openApiCredentialsModal()">
            <ion-label class="ion-text-wrap">
              {{ apiConfig.sendUrl || translate("Not configured") }}
              <p>{{ translate("API credentials") }} · {{ authModeLabel }}</p>
            </ion-label>
          </ion-item>
          <ion-item detail class="item-box" lines="none" button @click="openWebhookModal()">
            <ion-label class="ion-text-wrap">
              {{ translate("Inbound webhooks") }}
              <p>{{ translate("Shared token and receiver URLs") }}</p>
            </ion-label>
          </ion-item>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonItem, IonLabel, IonMenuButton, IonPage, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { translate } from '@common';
import { computed } from "vue";
import { useQuickBoxStore } from '@/store/quickbox';
import EditQuickBoxApiCredentialsModal from "@/components/EditQuickBoxApiCredentialsModal.vue";
import EditQuickBoxWebhookModal from "@/components/EditQuickBoxWebhookModal.vue";

const quickBoxStore = useQuickBoxStore();
const apiConfig = computed(() => quickBoxStore.apiConfig)
const authModeLabel = computed(() =>
  quickBoxStore.getAuthMode === 'basic' ? translate("Basic auth") : translate("Bearer token")
)

onIonViewWillEnter(async () => {
  await quickBoxStore.fetchConnectionConfig()
})

async function openApiCredentialsModal() {
  const modal = await modalController.create({ component: EditQuickBoxApiCredentialsModal })
  await modal.present()
  await modal.onWillDismiss()
  await quickBoxStore.fetchConnectionConfig()
}

async function openWebhookModal() {
  const modal = await modalController.create({ component: EditQuickBoxWebhookModal })
  await modal.present()
  await modal.onWillDismiss()
}
</script>

<style scoped>
.item-box::part(native) {
  --border-radius: var(--spacer-xs);
  border: var(--border-medium);
}

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacer-sm);
}

@media screen and (min-width: 700px) {
  ion-content {
    --padding-start: var(--spacer-lg);
    --padding-end: var(--spacer-lg);
  }
}
</style>
