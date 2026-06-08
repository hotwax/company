<template>
  <ion-searchbar
    :placeholder="translate('Search configs')"
    v-model="searchQuery"
    :debounce="300"
  />

  <!-- Loading -->
  <ion-card v-if="mdmStore.fetchStatus.configs === 'pending'">
    <ion-card-header>
      <ion-card-title>{{ translate("Loading configs") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-spinner name="crescent" />
    </ion-card-content>
  </ion-card>

  <!-- Error -->
  <ion-card v-else-if="mdmStore.fetchStatus.configs === 'error'">
    <ion-card-header>
      <ion-card-title>{{ translate("Could not load configs") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-button fill="outline" @click="mdmStore.fetchConfigs()">{{ translate("Retry") }}</ion-button>
    </ion-card-content>
  </ion-card>

  <!-- List -->
  <ion-list v-else>
    <ion-list-header>
      <ion-label>{{ translate("Configs") }}</ion-label>
    </ion-list-header>

    <div
      class="list-item"
      v-for="config in filteredConfigs"
      :key="config.configId"
      @click="openDetail(config.configId)"
    >
      <ion-item lines="none">
        <ion-label>
          {{ config.description || config.configId }}
          <p>{{ config.configId }}</p>
        </ion-label>
      </ion-item>
      <div>
        <ion-chip outline>
          <ion-label>{{ config.executionModeId || translate('Queue') }}</ion-label>
        </ion-chip>
      </div>
      <div>
        <ion-icon :icon="chevronForwardOutline" color="medium" />
      </div>
    </div>

    <div class="empty-state" v-if="!filteredConfigs.length && mdmStore.fetchStatus.configs === 'success'">
      <p>{{ translate("No configs found") }}</p>
    </div>
  </ion-list>

  <ion-fab slot="fixed" vertical="bottom" horizontal="end">
    <ion-fab-button @click="openAddModal()" :aria-label="translate('Add config')">
      <ion-icon :icon="addOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonFab,
  IonFabButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSearchbar,
  IonSpinner,
  modalController
} from '@ionic/vue'
import { translate } from '@common'
import { computed, ref } from 'vue'
import { addOutline, chevronForwardOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import MdmConfigModal from '@/components/MdmConfigModal.vue'
import router from '@/router'

const mdmStore = useMdmStore()
const searchQuery = ref('')

const filteredConfigs = computed(() => {
  const q = searchQuery.value.toLowerCase()
  const configs = [...mdmStore.configs].sort((a: any, b: any) =>
    (a.description || a.configId).localeCompare(b.description || b.configId)
  )
  if (!q) return configs
  return configs.filter((c: any) =>
    (c.description || '').toLowerCase().includes(q) ||
    c.configId.toLowerCase().includes(q)
  )
})

function openDetail(configId: string) {
  router.push(`/mdm/configs/${configId}`)
}

async function openAddModal() {
  const modal = await modalController.create({
    component: MdmConfigModal,
    componentProps: { config: null }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.saved) {
    await mdmStore.fetchConfigs()
  }
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 3;
  border-top: 1px solid var(--ion-color-medium);
}

@media (min-width: 991px) {
  .list-item {
    padding-block: var(--spacer-sm);
    padding-inline-end: var(--spacer-sm);
  }
}
</style>
