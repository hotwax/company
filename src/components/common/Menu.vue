<template>
  <ion-menu content-id="main-content" type="overlay" side="start" :disabled="!isAuthenticated">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ translate("Company") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list id="company-list">
        <ion-menu-toggle v-for="(p, i) in visibleAppPages" :key="i" :auto-hide="false">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ p.title }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Integrations") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle v-for="(p, i) in visibleIntegrationPages" :key="'integration-' + i" :auto-hide="false">
          <ion-item button router-direction="root" :router-link="p.url" class="hydrated" :class="{ selected: selectedIntegrationIndex === i }">
            <ion-icon slot="start" :ios="p.iosIcon" :md="p.mdIcon" />
            <ion-label>{{ translate(p.title) }}</ion-label>
          </ion-item>
        </ion-menu-toggle>

        <ion-item-divider color="light">
          <ion-label>{{ translate("Facilities") }}</ion-label>
        </ion-item-divider>

        <ion-menu-toggle v-for="(p, i) in facilitiesPages" :key="'facilities-' + i" :auto-hide="false">
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

    <!-- Which instance this app is pointed at, and the timezone its dates are rendered in. The clock
         appears ONLY when that timezone is not the browser's: when they agree the time on screen is
         the time on the wall, and repeating it would be noise. Mirrors order-manager's footer. -->
    <ion-footer v-if="isAuthenticated">
      <ion-toolbar>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            <p class="overline">{{ omsInstanceLabel() }}</p>
          </ion-label>
          <ion-note v-if="currentTimeZone" slot="end" class="ion-text-end" :color="isTimeZoneMismatched ? 'danger' : ''">
            {{ currentTimeZone }}
            <p v-if="isTimeZoneMismatched">{{ selectedZoneTime }}</p>
          </ion-note>
        </ion-item>
      </ion-toolbar>
    </ion-footer>
  </ion-menu>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import { useAuth } from "@common/composables/useAuth";
import {
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonNote,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
<<<<<<< HEAD
import { albumsOutline, briefcaseOutline, businessOutline, carOutline, cartOutline, gitNetworkOutline, keyOutline, mailOutline, peopleOutline, schoolOutline, settingsOutline, shieldCheckmarkOutline, storefrontOutline, walletOutline } from "ionicons/icons";
import { computed } from "vue";
||||||| 544075d
import { albumsOutline, briefcaseOutline, businessOutline, carOutline, cartOutline, keyOutline, mailOutline, peopleOutline, schoolOutline, settingsOutline, shieldCheckmarkOutline, storefrontOutline, walletOutline } from "ionicons/icons";
import { computed } from "vue";
import router from "@/router";
=======
import { airplaneOutline, albumsOutline, appsOutline, briefcaseOutline, businessOutline, carOutline, cartOutline, earthOutline, keyOutline, layersOutline, mailOutline, peopleOutline, schoolOutline, settingsOutline, shieldCheckmarkOutline, storefrontOutline, walletOutline } from "ionicons/icons";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
>>>>>>> refactor/vue-views-composable-extraction-9050245222670725615
import { useAuth as useAppAuth } from "@/composables/useSecurity";
<<<<<<< HEAD
import router from "@/router";
||||||| 544075d
=======
import { useMaargConfig } from "@/composables/useSeed";
import { useUserStore } from "@/store/user";
import router from "@/router";
import Actions from "@/authorization/actions";
>>>>>>> refactor/vue-views-composable-extraction-9050245222670725615

const { isAuthenticated } = useAuth();
const userStore = useUserStore();
const { instanceInfo, load: loadMaargConfig } = useMaargConfig();

const HOTWAX_HOST_SUFFIX = ".hotwax.io";

/**
 * The instance this app is talking to. Company is Maarg-backed, so the config's own instanceName is
 * the authoritative label ("rails-uat") and beats parsing it out of a URL; the host is only a fallback
 * for a config that has not loaded yet.
 *
 * Called from the template rather than memoised, for the same reason order-manager does: getMaargURL()
 * reads a cookie, so a computed would cache the pre-login empty value for the life of the session.
 */
function omsInstanceLabel() {
  const instanceName = String(instanceInfo.value?.instanceName ?? "").trim();
  if (instanceName) return instanceName;

  const url = commonUtil.getMaargURL();
  if (!url) return "";
  const host = url.replace(/^https?:\/\//, "").split("/")[0];
  return host.endsWith(HOTWAX_HOST_SUFFIX) ? host.slice(0, -HOTWAX_HOST_SUFFIX.length) : host;
}

// Mirrors order-manager: resolve the same way the Settings page does so the two never disagree.
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const currentTimeZone = computed(() =>
  userStore.getUserTimeZone || userStore.getUserProfile?.timeZone || browserTimeZone);
const isTimeZoneMismatched = computed(() =>
  !!currentTimeZone.value && currentTimeZone.value !== browserTimeZone);

// The menu stays mounted for the whole session, so the clock is driven by a timer rather than frozen
// at whatever the last render happened to be.
const selectedZoneTime = ref("");
let clockTimer: ReturnType<typeof setInterval> | undefined;

function refreshSelectedZoneTime() {
  selectedZoneTime.value = commonUtil.getCurrentTime(currentTimeZone.value, "t");
}

watch(currentTimeZone, refreshSelectedZoneTime);

onMounted(() => {
  void loadMaargConfig();
  refreshSelectedZoneTime();
  clockTimer = setInterval(refreshSelectedZoneTime, 30000);
});

onUnmounted(() => {
  clearInterval(clockTimer);
});
const { hasPermission } = useAppAuth();
const appPages = [
  {
    title: "Organizations",
    url: "/organizations",
    childRoutes: ["/organization-details/"],
    permission: Actions.APP_ORGANIZATIONS_VIEW,
    iosIcon: earthOutline,
    mdIcon: earthOutline,
  },
  {
    title: "Product Store",
    url: "/product-store",
    childRoutes: ["/product-store/", "/product-store-details/"],
    iosIcon: businessOutline,
    mdIcon: businessOutline,
  },
  {
    title: "Organizations",
    url: "/organizations",
    childRoutes: ["/organization-details/"],
    permission: "PARTYMGR_VIEW OR PARTYMGR_ADMIN",
    iosIcon: gitNetworkOutline,
    mdIcon: gitNetworkOutline,
  },
];

const visibleAppPages = computed(() =>
  appPages.filter((screen) => !screen.permission || hasPermission(screen.permission)))

const integrationPages = [
  {
    title: "Carriers",
    url: "/carriers",
    childRoutes: ["/carriers/", "/carrier-details/"],
    permission: Actions.APP_CARRIERS_VIEW,
    iosIcon: airplaneOutline,
    mdIcon: airplaneOutline,
  },
  {
    title: "Unigate",
    url: "/unigate",
    childRoutes: ["/unigate/"],
    permission: Actions.APP_CARRIERS_VIEW,
    iosIcon: layersOutline,
    mdIcon: layersOutline,
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
  },
];

const visibleIntegrationPages = computed(() =>
  integrationPages.filter((screen) =>
    !screen.permission || hasPermission(screen.permission)))

const userPages = [
  {
    title: "Users",
    url: "/users",
    childRoutes: ["/user-details/", "/create-user", "/user-confirmation/", "/user-quick-setup/"],
    permission: Actions.APP_USERS_VIEW,
    iosIcon: peopleOutline,
    mdIcon: peopleOutline,
  },
  {
    title: "Security Groups",
    url: "/security-groups",
    childRoutes: ["/security-group-detail/"],
    permission: Actions.APP_SECURITY_GROUPS_VIEW,
    iosIcon: keyOutline,
    mdIcon: keyOutline,
  },
  {
    title: "App Permissions",
    url: "/app-permissions",
    permission: Actions.APP_APP_PERMISSIONS_VIEW,
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
    title: "App Version",
    url: "/app-version",
    iosIcon: appsOutline,
    mdIcon: appsOutline,
  },
  {
    title: "Settings",
    url: "/settings",
    iosIcon: settingsOutline,
    mdIcon: settingsOutline,
  }
];

const selectedIndex = computed(() => {
  const path = router.currentRoute.value.path

  return visibleAppPages.value.findIndex((screen) => screen.url === path || screen.childRoutes?.includes(path) || screen.childRoutes?.some((route) => path.includes(route)))
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

  return visibleIntegrationPages.value.findIndex((screen) => screen.url === path || screen.childRoutes?.includes(path) || screen.childRoutes?.some((route) => path.includes(route)))
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
