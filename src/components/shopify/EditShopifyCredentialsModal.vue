<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("API credentials") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-item class="ion-margin-top" lines="none">
      <ion-icon slot="start" :icon="storefrontOutline" />
      <ion-label>
        <b>{{ props.shop.myshopifyDomain || props.shop.domain }}</b>
        <p>{{ props.shop.shopId }}</p>
      </ion-label>
    </ion-item>

    <ion-list>
      <ion-item>
        <ion-input
          v-model="form.shopifyShopId"
          :label="translate('Shopify shop ID') + ' *'"
          label-placement="stacked"
          inputmode="numeric"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.clientId"
          :label="translate('Client ID') + ' *'"
          label-placement="stacked"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.shopAccessToken"
          :label="translate('Access token') + ' *'"
          label-placement="stacked"
          type="password"
          placeholder="shpat_..."
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.clientSecret"
          :label="translate('Client secret') + ' *'"
          label-placement="stacked"
          type="password"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.oldClientSecret"
          :label="translate('Old client secret')"
          label-placement="stacked"
          type="password"
          helper-text="Only required when rotating the client secret"
          autocomplete="off"
        />
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!isFormValid"
      @click="updateCredentials()"
    >
      {{ translate("Rotate credentials") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline, storefrontOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { useShopifyStore } from '@/store/shopify'
import { computed, onMounted, reactive } from 'vue'

const props = defineProps<{ shop: any }>()
const shopifyStore = useShopifyStore()

const form = reactive({
  shopifyShopId: '',
  clientId: '',
  shopAccessToken: '',
  clientSecret: '',
  oldClientSecret: ''
})

const isFormValid = computed(() =>
  form.shopifyShopId.trim() &&
  form.clientId.trim() &&
  form.shopAccessToken.trim() &&
  form.clientSecret.trim()
)

onMounted(async () => {
  // Pre-fill known identifiers from the existing SystemMessageRemote
  try {
    const remote = await shopifyStore.fetchSystemMessageRemote(props.shop.shopId)
    if (remote) {
      form.shopifyShopId = remote.remoteId ?? props.shop.shopifyShopId ?? ''
    } else {
      form.shopifyShopId = props.shop.shopifyShopId ?? ''
    }
  } catch (error: any) {
    logger.error('fetchSystemMessageRemote', error)
    form.shopifyShopId = props.shop.shopifyShopId ?? ''
  }
})

function closeModal() {
  modalController.dismiss({ dismissed: true })
}

async function updateCredentials() {
  if (!isFormValid.value) {
    commonUtil.showToast(translate('Please fill in all required fields'))
    return
  }

  emitter.emit('presentLoader')
  try {
    await shopifyStore.updateShopifyRemote({
      myShopifydomain: props.shop.myshopifyDomain || props.shop.domain,
      shopifyShopId: form.shopifyShopId.trim(),
      shopAccessToken: form.shopAccessToken.trim(),
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      oldClientSecret: form.oldClientSecret.trim() || undefined,
      hotwaxShopId: props.shop.shopId
    })
    commonUtil.showToast(translate('Credentials updated successfully'))
    await modalController.dismiss({ updated: true })
  } catch (error: any) {
    logger.error('updateShopifyCredentials', error)
    commonUtil.showToast(translate('Failed to update credentials'))
  }
  emitter.emit('dismissLoader')
}
</script>
