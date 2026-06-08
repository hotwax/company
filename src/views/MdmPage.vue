<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("MDM") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openUploadModal(undefined)" :aria-label="translate('Upload')">
            <ion-icon slot="icon-only" :icon="cloudUploadOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item>
        <ion-segment v-model="activeTab">
          <ion-segment-button value="imports">
            <ion-label>{{ translate("Imports") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="configs">
            <ion-label>{{ translate("Configs") }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-item>

      <MdmImportsTab v-if="activeTab === 'imports'" />
      <MdmConfigsTab v-else />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue'
import { translate } from '@common'
import { onMounted, ref } from 'vue'
import { cloudUploadOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import MdmImportsTab from '@/components/MdmImportsTab.vue'
import MdmConfigsTab from '@/components/MdmConfigsTab.vue'
import MdmUploadModal from '@/components/MdmUploadModal.vue'

const mdmStore = useMdmStore()
const activeTab = ref('imports')

async function initialFetch() {
  if (mdmStore.fetchStatus.configs === 'none') {
    await mdmStore.fetchConfigs()
  }
  if (mdmStore.fetchStatus.logs === 'none') {
    await mdmStore.fetchLogs()
  }
}

onMounted(initialFetch)
onIonViewWillEnter(initialFetch)

async function openUploadModal(configId: string | undefined) {
  const modal = await modalController.create({
    component: MdmUploadModal,
    componentProps: { configId }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.uploaded) {
    await mdmStore.fetchLogs()
    activeTab.value = 'imports'
  }
}

defineExpose({ openUploadModal })
</script>
