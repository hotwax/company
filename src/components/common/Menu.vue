<template>
  <ion-menu content-id="main-content" type="overlay" side="start" :disabled="!isAuthenticated">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ translate("Company") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list id="company-list">
        <ion-menu-toggle v-for="(p, i) in appPages" :key="i" :auto-hide="false">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ p.title }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Integrations") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle v-for="(p, i) in integrationPages" :key="'integration-' + i" :auto-hide="false">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedIntegrationIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
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
          <ion-label>{{ translate("Users") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle v-for="(p, i) in visibleUserPages" :key="'user-' + i" :auto-hide="false">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedUserIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Agents") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle v-for="(p, i) in agentPages" :key="'agent-' + i" :auto-hide="false">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedAgentIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Settings") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle v-for="(p, i) in settingsPages" :key="'settings-' + i" :auto-hide="false">
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
import { translate } from "@common";
import { useAuth } from "@common/composables/useAuth";
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { albumsOutline, briefcaseOutline, businessOutline, carOutline, cartOutline, keyOutline, mailOutline, peopleOutline, schoolOutline, settingsOutline, shieldCheckmarkOutline, storefrontOutline, walletOutline } from "ionicons/icons";
import { computed } from "vue";
import router from "@/router";
import { useAuth as useAppAuth } from "@/composables/useSecurity";

const { isAuthenticated } = useAuth();
const { hasPermission } = useAppAuth();
const appPages = [
  {
    title: "Product Store",
    url: "/product-store",
    childRoutes: ["/product-store/", "/product-store-details/"],
    iosIcon: businessOutline,
    mdIcon: businessOutline,
  },
];

const integrationPages = [
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
  },
];

const userPages = [
  {
    title: "Users",
    url: "/users",
    childRoutes: ["/user-details/", "/create-user", "/user-confirmation/", "/user-quick-setup/"],
    permission: "USERS_LIST_VIEW OR PARTYMGR_VIEW OR PARTYMGR_ADMIN",
    iosIcon: peopleOutline,
    mdIcon: peopleOutline,
  },
  {
    title: "Security Groups",
    url: "/security-groups",
    childRoutes: ["/security-group-detail/"],
    permission: "SECURITY_VIEW OR SECURITY_ADMIN",
    iosIcon: keyOutline,
    mdIcon: keyOutline,
  },
  {
    title: "App Permissions",
    url: "/app-permissions",
    permission: "APP_PERMISSION_VIEW OR APP_PERMISSION_CREATE OR APP_PERMISSION_UPDATE OR SECURITY_ADMIN",
    iosIcon: shieldCheckmarkOutline,
    mdIcon: shieldCheckmarkOutline,
  }
];

const facilitiesPages = [
  {
    title: "Find",
    url: "/facilities/find",
    iosIcon: storefrontOutline,
    mdIcon: storefrontOutline,
  },
  {
    title: "Groups",
    url: "/facilities/groups",
    iosIcon: albumsOutline,
    mdIcon: albumsOutline,
  },
  {
    title: "Parking",
    url: "/parking",
    iosIcon: carOutline,
    mdIcon: carOutline,
  }
];

const visibleUserPages = computed(() => userPages.filter((screen) => hasPermission(screen.permission)))

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

const selectedIntegrationIndex = computed(() => {
  const path = router.currentRoute.value.path

  return integrationPages.findIndex((screen) => screen.url === path || screen.childRoutes?.includes(path) || screen.childRoutes?.some((route) => path.includes(route)))
})

const selectedUserIndex = computed(() => {
  const path = router.currentRoute.value.path

  return visibleUserPages.value.findIndex((screen) => screen.url === path || screen.childRoutes?.includes(path) || screen.childRoutes?.some((route) => path.includes(route)))
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
