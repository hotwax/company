<template>
  <ion-menu content-id="main-content" type="overlay" :disabled="!isUserAuthenticated">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ translate("Company") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list id="company-list">
        <ion-menu-toggle auto-hide="false" v-for="(p, i) in appPages" :key="i">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ p.title }}</ion-label>
          </ion-item>
        </ion-menu-toggle>
      </ion-list>
    </ion-content>
  </ion-menu>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  IonMenu,
  IonMenuToggle,
} from "@ionic/vue";
import { computed } from "vue";
import { businessOutline, settingsOutline, walletOutline } from "ionicons/icons";
import { useStore } from "@/store";
import { useRouter } from "vue-router";
import { translate } from "@/i18n";

const store = useStore();
const router = useRouter();
const appPages = [
  {
    title: "Product Store",
    url: "/product-store",
    childRoutes: ["/product-store/"],
    iosIcon: businessOutline,
    mdIcon: businessOutline,
  },
  // {
  //   title: "Shopify",
  //   url: "/shopify",
  //   childRoutes: ["/shopify/"],
  //   iosIcon: cartOutline,
  //   mdIcon: cartOutline,
  // },
  {
    title: "NetSuite",
    url: "/netsuite",
    childRoutes: ["/netsuite/"],
    iosIcon: walletOutline,
    mdIcon: walletOutline
  },
  {
    title: "Settings",
    url: "/settings",
    iosIcon: settingsOutline,
    mdIcon: settingsOutline,
  }
];

const isUserAuthenticated = computed(() => store.getters["user/isUserAuthenticated"])
const selectedIndex = computed(() => {
  const path = router.currentRoute.value.path
  return appPages.findIndex((screen) => screen.url === path || screen.childRoutes?.includes(path) || screen.childRoutes?.some((route) => path.includes(route)))
})
</script>

<style scoped>
ion-item.selected ion-icon {
  color: var(--ion-color-secondary);
}
ion-item.selected {
  --color: var(--ion-color-secondary);
}
</style>