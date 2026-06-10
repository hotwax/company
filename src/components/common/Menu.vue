<template>
  <ion-menu content-id="main-content" type="overlay" :disabled="!isUserAuthenticated">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ translate("Company") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list id="company-list">
        <!-- Main Pages -->
        <ion-menu-toggle auto-hide="false" v-for="(p, i) in appPages" :key="i">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: isRouteSelected(p) }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <!-- Agents Divider -->
        <ion-item-divider color="light">
          <ion-label>{{ translate("Agents") }}</ion-label>
        </ion-item-divider>

        <!-- Agent Pages -->
        <ion-menu-toggle auto-hide="false" v-for="(p, i) in agentPages" :key="'agent-' + i">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: isRouteSelected(p) }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <!-- Settings Page -->
        <ion-menu-toggle auto-hide="false">
          <ion-item button router-direction="root" :router-link="settingsPage.url" class="hydrated" :class="{ selected: isRouteSelected(settingsPage) }">
            <ion-icon slot="start" :ios="settingsPage.iosIcon" :md="settingsPage.mdIcon" />
            <ion-label>{{ translate(settingsPage.title) }}</ion-label>
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
  IonItemDivider,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  IonMenu,
  IonMenuToggle,
} from "@ionic/vue";
import { computed } from "vue";
import { briefcaseOutline, businessOutline, cartOutline, mailOutline, schoolOutline, settingsOutline, walletOutline } from "ionicons/icons";
import { useAuth } from '@common/composables/useAuth';
import router from "@/router";
import { translate } from '@common';

const { isAuthenticated } = useAuth();
const appPages = [
  {
    title: "Product Store",
    url: "/product-store",
    childRoutes: ["/product-store/", "/product-store-details/"],
    iosIcon: businessOutline,
    mdIcon: businessOutline,
  },
  {
    title: "Shopify",
    url: "/shopify",
    childRoutes: ["/shopify-connection-details"],
    iosIcon: cartOutline,
    mdIcon: cartOutline,
  },
  {
    title: "Klaviyo",
    url: "/klaviyo",
    childRoutes: ["/klaviyo/"],
    iosIcon: mailOutline,
    mdIcon: mailOutline,
  },
  {
    title: "NetSuite",
    url: "/netsuite",
    childRoutes: ["/netsuite/"],
    iosIcon: walletOutline,
    mdIcon: walletOutline
  }
];

const agentPages = [
  {
    title: "Composer",
    url: "/composer",
    iosIcon: schoolOutline,
    mdIcon: schoolOutline,
  },
  {
    title: "Workforce",
    url: "/workforce",
    iosIcon: briefcaseOutline,
    mdIcon: briefcaseOutline,
  }
];

const settingsPage = {
  title: "Settings",
  url: "/settings",
  iosIcon: settingsOutline,
  mdIcon: settingsOutline,
};

const isUserAuthenticated = computed(() => isAuthenticated.value)
const isRouteSelected = (page: any) => {
  const path = router.currentRoute.value.path
  return page.url === path || page.childRoutes?.includes(path) || page.childRoutes?.some((route: string) => path.includes(route))
}
</script>

<style scoped>
ion-item.selected ion-icon {
  color: var(--ion-color-secondary);
}
ion-item.selected {
  --color: var(--ion-color-secondary);
}
</style>