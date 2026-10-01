<template>
  <ion-app>
    <ion-split-pane content-id="main-content" when="lg">
      <Menu v-if="router.currentRoute.value.name !== 'Login'" />
      <ion-router-outlet id="main-content"></ion-router-outlet>
    </ion-split-pane>
    <!-- Fast Travel: Cmd/Ctrl+K app switcher + deep-link router across the HotWax suite -->
    <FastTravel current-app="company" />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { IonApp, IonRouterOutlet, IonSplitPane, loadingController } from '@ionic/vue'
import Menu from '@/components/common/Menu.vue'
import { emitter, FastTravel, translate } from '@common'
import { Settings } from 'luxon'
import { useAuth } from '@common/composables/useAuth'
import { useUserStore } from '@/store/user'
import { startReferenceSync } from '@/services/appCacheBootstrap'
import router from "@/router"

const userStore = useUserStore()

// The global loader is held as the PROMISE of its overlay, not the overlay. `create()` is async, and a
// dismiss that landed while it was pending used to find nothing to dismiss: the overlay then presented
// with nothing left to close it, and its backdrop blocked every click until a reload. Fast saves hit
// that on every loader after the first. Holding the promise lets a dismiss reach an overlay that does
// not exist yet.
let loader: ReturnType<typeof loadingController.create> | null = null
// Bumped by every dismiss, so a present still waiting on `create()` knows it was cancelled.
let dismissCount = 0

// Payload arrives from the untyped event bus, so the parameter cannot be narrower than `any`.
function createLoader(options: any = { message: '', backdropDismiss: false }) {
  return loadingController.create({
    message: options.message ? translate(options.message) : (options.backdropDismiss ? translate('Click the backdrop to dismiss.') : translate('Loading...')),
    translucent: true,
    backdropDismiss: options.backdropDismiss || false
  })
}

async function presentLoader(options: any = { message: '', backdropDismiss: false }) {
  if(options.message && loader) {dismissLoader()}
  const dismissesBefore = dismissCount
  loader ??= createLoader(options)
  const overlay = await loader
  if(dismissCount === dismissesBefore) {overlay.present()}
}

function dismissLoader() {
  if(!loader) {return}
  const pending = loader
  loader = null
  dismissCount++
  // Ionic's dismiss waits for an in-flight present, but for an overlay that never presented it returns
  // false and leaves the element in the DOM, so remove that one by hand.
  void pending.then(async (overlay) => {
    if(!(await overlay.dismiss())) {overlay.remove()}
  })
}

onMounted(() => {
  loader = createLoader()
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
