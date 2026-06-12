<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Add Shopify connection") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-input
          v-model="form.myshopifyDomain"
          :label="translate('Shopify domain') + ' *'"
          label-placement="stacked"
          placeholder="store.myshopify.com"
          autocomplete="off"
          @ion-blur="suggestShopId()"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.shopifyShopId"
          :label="translate('Shopify shop ID') + ' *'"
          label-placement="stacked"
          placeholder="72176566383"
          inputmode="numeric"
          helper-text="Numeric ID from Shopify Admin (Settings → General)"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.shopId"
          :label="translate('Internal shop ID') + ' *'"
          label-placement="stacked"
          placeholder="10000"
          helper-text="Unique ID used internally in HotWax — appears in app URLs"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.name"
          :label="translate('Shop name')"
          label-placement="stacked"
          :placeholder="form.myshopifyDomain.split('.')[0] || 'My Store'"
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
          v-model="form.clientId"
          :label="translate('Client ID') + ' *'"
          label-placement="stacked"
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
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!isFormValid"
      @click="saveConnection()"
    >
      {{ translate("Add Shopify connection") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonList, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { useShopifyStore } from '@/store/shopify'
import { computed, reactive } from 'vue'

const shopifyStore = useShopifyStore()

const form = reactive({
  myshopifyDomain: '',
  shopifyShopId: '',
  shopId: '',
  name: '',
  shopAccessToken: '',
  clientId: '',
  clientSecret: ''
})

const isFormValid = computed(() =>
  form.myshopifyDomain.trim() &&
  form.shopifyShopId.trim() &&
  form.shopId.trim() &&
  form.shopAccessToken.trim() &&
  form.clientId.trim() &&
  form.clientSecret.trim()
)

function suggestShopId() {
  if (!form.shopId && form.myshopifyDomain) {
    // Suggest the subdomain part as a starting point (user will likely change to a number)
    const subdomain = form.myshopifyDomain.split('.')[0].toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    if (subdomain) form.shopId = subdomain
  }
}

function closeModal() {
  modalController.dismiss({ dismissed: true })
}

async function saveConnection() {
  if (!isFormValid.value) {
    commonUtil.showToast(translate('Please fill in all required fields'))
    return
  }

  emitter.emit('presentLoader')
  try {
    await shopifyStore.createShopifyConnection({
      shopId: form.shopId.trim(),
      shopifyShopId: form.shopifyShopId.trim(),
      myshopifyDomain: form.myshopifyDomain.trim(),
      shopAccessToken: form.shopAccessToken.trim(),
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      name: form.name.trim() || undefined
    })

    commonUtil.showToast(translate('Shopify connection created'))
    await modalController.dismiss({ shopId: form.shopId.trim() })
  } catch (error: any) {
    logger.error('createShopifyConnection', error)
    commonUtil.showToast(translate('Failed to create Shopify connection'))
  }
  emitter.emit('dismissLoader')
}
</script>
