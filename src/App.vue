<template>
  <ion-app>
    <ion-split-pane content-id="main-content" when="lg">
      <Menu />
      <ion-router-outlet id="main-content"></ion-router-outlet>
    </ion-split-pane>
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { IonApp, IonRouterOutlet, IonSplitPane, loadingController } from '@ionic/vue'
import Menu from '@/components/Menu.vue'
import { emitter } from '@common'
import { Settings } from 'luxon'
import { translate } from '@common'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()

const loader = ref(null) as any

async function presentLoader(options = { message: '', backdropDismiss: false }) {
  if (options.message && loader.value) dismissLoader()
  if (!loader.value) {
    loader.value = await loadingController.create({
      message: options.message ? translate(options.message) : (options.backdropDismiss ? translate('Click the backdrop to dismiss.') : translate('Loading...')),
      translucent: true,
      backdropDismiss: options.backdropDismiss || false
    })
  }
  loader.value.present()
}

function dismissLoader() {
  if (loader.value) {
    loader.value.dismiss()
    loader.value = null as any
  }
}

onMounted(async () => {
  loader.value = await loadingController.create({
    message: translate('Loading...'),
    translucent: true,
    backdropDismiss: false
  })
  emitter.on('presentLoader', presentLoader)
  emitter.on('dismissLoader', dismissLoader)

  if (userStore.current?.timeZone) {
    Settings.defaultZone = userStore.current.timeZone
  }
})

onUnmounted(() => {
  emitter.off('presentLoader', presentLoader)
  emitter.off('dismissLoader', dismissLoader)
})
</script>
