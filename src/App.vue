<template>
  <ion-app>
    <ion-split-pane content-id="main-content" when="lg">
      <Menu v-if="router.currentRoute.value.name !== 'Login'" />
      <ion-router-outlet id="main-content"></ion-router-outlet>
    </ion-split-pane>
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { IonApp, IonRouterOutlet, IonSplitPane, loadingController } from '@ionic/vue'
import Menu from '@/components/common/Menu.vue'
import { emitter, translate } from '@common'
import { Settings } from 'luxon'
import { useAuth } from '@common/composables/useAuth'
import { useUserStore } from '@/store/user'
import { startReferenceSync } from '@/services/appCacheBootstrap'
import router from "@/router"

const userStore = useUserStore()

const loader = ref(null) as any

// Payload arrives from the untyped event bus, so the parameter cannot be narrower than `any`.
async function presentLoader(options: any = { message: '', backdropDismiss: false }) {
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

// Class-B reference data syncs ONCE PER LOGIN, app-wide: one snapshot per domain, then only on
// mutation. Cached reference data is what lets pages render from IndexedDB instead of waiting on
// 500-row fetches.
//
// This WATCHES authentication rather than checking it once at mount. A one-time check silently
// missed the common case: the app boots at /login while the session check is still pending, so
// `isAuthenticated` is false at mount and flips true a moment later — the sync then never ran.
// Watching also makes the trigger literally "on login". Fire-and-forget: never gates app start.
watch(useAuth().isAuthenticated, (authenticated) => {
  if (authenticated) void startReferenceSync()
}, { immediate: true })

onUnmounted(() => {
  emitter.off('presentLoader', presentLoader)
  emitter.off('dismissLoader', dismissLoader)
})
</script>
