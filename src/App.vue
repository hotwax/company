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
import { startAppDbSync } from '@/services/appDbSync'
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

/*
 * Workaround for an Ionic 8 overlay bug (@ionic/core 8.8 overlays: present/dismiss).
 *
 * A backdrop overlay sets aria-hidden="true" on ion-router-outlet when it presents, and only the
 * dismiss that sees itself as the LAST presented overlay removes it. That count includes overlays
 * that are already dismissing but still animating out (Ionic only adds `overlay-hidden` after the
 * leave animation). Two overlapping dismissals therefore each see two overlays and neither clears
 * it, leaving the main content out of the accessibility tree. This app hits that whenever a save
 * shows the global loader on top of an alert or modal and closes both together:
 *   - an alert button handler presenting/dismissing the loader (Ionic awaits the handler, then
 *     dismisses the alert while the loader is still leaving), e.g. useNetSuite.editNetSuiteId;
 *   - a modal closed inside the loader's try/finally, e.g. ShopifyShipmentMethods
 *     createShipmentMethod.
 * After every overlay dismissal, once no overlay is still presented, clear the stale attribute.
 */
const OVERLAY_SELECTOR = 'ion-alert,ion-action-sheet,ion-loading,ion-modal,ion-picker-legacy,ion-popover'
const OVERLAY_DID_DISMISS_EVENTS = [
  'ionAlertDidDismiss', 'ionActionSheetDidDismiss', 'ionLoadingDidDismiss',
  'ionModalDidDismiss', 'ionPickerDidDismiss', 'ionPopoverDidDismiss'
]

function restoreRouterOutletAria() {
  // didDismiss is emitted before Ionic marks the overlay hidden, so check once that has run.
  setTimeout(() => {
    const outlet = (document.querySelector('ion-app') || document.body).querySelector('ion-router-outlet')
    if(!outlet?.hasAttribute('aria-hidden')) {return}
    // `presented` is the overlay's own state (custom-elements build: the element is the component).
    const stillOpen = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).some((el: any) =>
      el.overlayIndex > 0 && !el.classList.contains('overlay-hidden') && el.presented !== false)
    if(!stillOpen) {outlet.removeAttribute('aria-hidden')}
  })
}

onMounted(() => {
  OVERLAY_DID_DISMISS_EVENTS.forEach((name) => document.addEventListener(name, restoreRouterOutletAria))
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
  if (authenticated) void startAppDbSync()
}, { immediate: true })

onUnmounted(() => {
  OVERLAY_DID_DISMISS_EVENTS.forEach((name) => document.removeEventListener(name, restoreRouterOutletAria))
  emitter.off('presentLoader', presentLoader)
  emitter.off('dismissLoader', dismissLoader)
})
</script>
