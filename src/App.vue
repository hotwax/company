<template>
  <ion-app>
    <IonSplitPane content-id="main-content" when="lg">
      <Menu />
      <ion-router-outlet id="main-content"></ion-router-outlet>
    </IonSplitPane>
  </ion-app>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { IonApp, IonRouterOutlet, IonSplitPane, loadingController } from "@ionic/vue";
import Menu from '@/components/Menu.vue';
import emitter from "@/event-bus"
import { Settings } from 'luxon'
import store from "./store";
import { translate } from "@/i18n"
import { initialise, resetConfig } from '@/adapter'

const userProfile = computed(() => store.getters["user/getUserProfile"])
const userToken = computed(() => store.getters["user/getUserToken"])
const instanceUrl = computed(() => store.getters["user/getInstanceUrl"])

const loader = ref(null) as any
const maxAge = process.env.VUE_APP_CACHE_MAX_AGE ? parseInt(process.env.VUE_APP_CACHE_MAX_AGE) : 0

initialise({
  token: userToken.value,
  instanceUrl: instanceUrl.value.replace("admin/", ""), // TODO: remove component replace logic once we start storing the oms url in state without component name
  cacheMaxAge: maxAge,
  events: {
    responseError: () => {
      setTimeout(() => dismissLoader(), 100);
    },
    queueTask: (payload: any) => {
      emitter.emit("queueTask", payload);
    }
  },
  systemType: "MOQUI"
})

async function presentLoader(options = { message: '', backdropDismiss: false }) {
  // When having a custom message remove already existing loader, if not removed it takes into account the already existing loader
  if(options.message && loader.value) dismissLoader();

  if (!loader.value) {
    loader.value = await loadingController
      .create({
        message: options.message ? translate(options.message) : (options.backdropDismiss ? translate("Click the backdrop to dismiss.") : translate("Loading...")),
        translucent: true,
        backdropDismiss: options.backdropDismiss || false
      });
  }
  loader.value.present();
}

function dismissLoader() {
  if (loader.value) {
    loader.value.dismiss();
    loader.value = null as any;
  }
}

onMounted(async () => {
  loader.value = await loadingController
    .create({
      message: translate("Loading..."),
      translucent: true,
      backdropDismiss: false
    });
  emitter.on("presentLoader", presentLoader);
  emitter.on("dismissLoader", dismissLoader);

  if (userProfile.value) {
    // Luxon timezone should be set with the user's selected timezone
    userProfile.value.timeZone && (Settings.defaultZone = userProfile.value.timeZone);
  }
})

onUnmounted(() => {
  emitter.off("presentLoader", presentLoader);
  emitter.off("dismissLoader", dismissLoader);

  resetConfig()
})
</script>

<style scoped>
ion-split-pane {
  --side-width: 304px;
}
</style>
