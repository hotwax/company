<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Access scopes") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top" lines="none">
      <ion-icon slot="start" :icon="storefrontOutline" />
      <ion-label>
        {{ props.shop.myshopifyDomain || props.shop.domain }}
        <p>{{ props.shop.shopId }}</p>
      </ion-label>
    </ion-item>

    <ion-item lines="none">
      <ion-label class="ion-text-wrap">
        <p>{{ translate("Shopify OAuth scopes granted to this shop's app. Order sync fails if the query asks for data outside these scopes, so refresh after changing the app's granted scopes in Shopify.") }}</p>
      </ion-label>
    </ion-item>

    <div v-if="scopes.length" class="ion-margin-horizontal">
      <ion-chip v-for="scope in scopes" :key="scope" outline>
        <ion-icon :icon="checkmarkCircleOutline" />
        <ion-label>{{ scope }}</ion-label>
      </ion-chip>
    </div>
    <ion-item v-else lines="none">
      <ion-label class="ion-text-wrap ion-text-center">
        <p>{{ translate("No scopes loaded yet. Refresh to fetch the scopes granted to this shop's Shopify app.") }}</p>
      </ion-label>
    </ion-item>

    <ion-item v-if="lastRefreshedLabel" lines="none">
      <ion-note slot="end">{{ translate("Last refreshed") }}: {{ lastRefreshedLabel }}</ion-note>
    </ion-item>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!systemMessageRemoteId"
      @click="refresh()"
    >
      <ion-icon slot="start" :icon="refreshOutline" />
      {{ translate("Refresh scopes") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem,
  IonLabel, IonNote, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { checkmarkCircleOutline, closeOutline, refreshOutline, storefrontOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { useShopifyStore } from '@/store/shopify'
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{ shop: any }>()
const shopifyStore = useShopifyStore()

const systemMessageRemoteId = ref<string>('')

const scopeInfo = computed(() =>
  systemMessageRemoteId.value ? shopifyStore.getAccessScopes(systemMessageRemoteId.value) : null
)
const scopes = computed<string[]>(() => scopeInfo.value?.scopes ?? [])
const lastRefreshedLabel = computed(() =>
  scopeInfo.value ? new Date(scopeInfo.value.lastRefreshed).toLocaleString() : ''
)

onMounted(async () => {
  // The refresh endpoint is keyed by the shop's SystemMessageRemote; resolve it once on open.
  try {
    const remote = await shopifyStore.fetchSystemMessageRemote(props.shop.shopId)
    systemMessageRemoteId.value = remote?.systemMessageRemoteId ?? ''
    if (!systemMessageRemoteId.value) {
      commonUtil.showToast(translate('No Shopify shop remote found for this connection'))
    }
  } catch (error: any) {
    logger.error('fetchSystemMessageRemote', error)
    commonUtil.showToast(translate('Failed to load the shop remote'))
  }
})

function closeModal() {
  modalController.dismiss({ dismissed: true })
}

async function refresh() {
  if (!systemMessageRemoteId.value) return

  emitter.emit('presentLoader')
  try {
    const granted = await shopifyStore.refreshAccessScopes(systemMessageRemoteId.value)
    commonUtil.showToast(translate('Fetched {count} access scope(s) from Shopify', { count: granted.length }))
  } catch (error: any) {
    logger.error('refreshAccessScopes', error)
    commonUtil.showToast(translate('Failed to refresh access scopes'))
  }
  emitter.emit('dismissLoader')
}
</script>
