<template>
  <ion-menu content-id="main-content" type="overlay" side="start" :disabled="!isAuthenticated">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ translate("Company") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list id="company-list">
        <ion-menu-toggle :auto-hide="false" v-for="(p, i) in appPages" :key="i">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ p.title }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Facilities") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle :auto-hide="false" v-for="(p, i) in facilitiesPages" :key="'facilities-' + i">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedFacilitiesIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Agents") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle :auto-hide="false" v-for="(p, i) in agentPages" :key="'agent-' + i">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedAgentIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Settings") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle :auto-hide="false" v-for="(p, i) in settingsPages" :key="'settings-' + i">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedSettingsIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
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
import { briefcaseOutline, businessOutline, cartOutline, mailOutline, schoolOutline, settingsOutline, storefrontOutline, walletOutline } from "ionicons/icons";
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

const facilitiesPages = [
  {
    title: "Find Facilities",
    url: "/facilities/find",
    iosIcon: storefrontOutline,
    mdIcon: storefrontOutline,
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

const settingsPages = [
  {
    title: "Settings",
    url: "/settings",
    iosIcon: settingsOutline,
    mdIcon: settingsOutline,
  }
];

const selectedIndex = computed(() => {
  const path = router.currentRoute.value.path
  return appPages.findIndex((screen) => screen.url === path || screen.childRoutes?.includes(path) || screen.childRoutes?.some((route) => path.includes(route)))
})

const selectedFacilitiesIndex = computed(() => {
  const path = router.currentRoute.value.path
  return facilitiesPages.findIndex((screen) => screen.url === path)
})

const selectedAgentIndex = computed(() => {
  const path = router.currentRoute.value.path
  return agentPages.findIndex((screen) => screen.url === path)
})

const selectedSettingsIndex = computed(() => {
  const path = router.currentRoute.value.path
  return settingsPages.findIndex((screen) => screen.url === path)
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
