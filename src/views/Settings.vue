<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Settings") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    
    <ion-content>
      <div class="user-profile">
        <ion-card>
          <ion-item lines="full">
            <ion-avatar slot="start" v-if="userProfile?.partyImageUrl">
              <Image :src="userProfile.partyImageUrl"/>
            </ion-avatar>
            <!-- ion-no-padding to remove extra side/horizontal padding as additional padding 
            is added on sides from ion-item and ion-padding-vertical to compensate the removed
            vertical padding -->
            <ion-card-header class="ion-no-padding ion-padding-vertical">
              <ion-card-subtitle>{{ userProfile?.userId }}</ion-card-subtitle>
              <ion-card-title>{{ userProfile?.userFullName }}</ion-card-title>
            </ion-card-header>
          </ion-item>
          <ion-button color="danger" @click="logout()">{{ translate("Logout") }}</ion-button>
          <!-- Commenting this code as we currently do not have reset password functionality -->
          <!-- <ion-button fill="outline" color="medium">{{ "Reset password") }}</ion-button> -->
          <ion-button :standalone-hidden="!hasPermission(Actions.APP_PWA_STANDALONE_ACCESS)" fill="outline" @click="goToLaunchpad()">
            {{ translate("Go to Launchpad") }}
            <ion-icon slot="end" :icon="openOutline" />
          </ion-button>
        </ion-card>
      </div>
      <div class="section-header">
        <h1>{{ translate("OMS") }}</h1>
      </div>
      <section>
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>
              {{ $t('OMS instance') }}
            </ion-card-subtitle>
            <ion-card-title>
              {{ oms }}
            </ion-card-title>
            <ion-card-subtitle>
              {{ omsVersionLabel }}
            </ion-card-subtitle> 
          </ion-card-header>
          <ion-card-content>
            {{ $t('This is the name of the OMS you are connected to right now. Make sure that you are connected to the right instance before proceeding.') }}
          </ion-card-content>
          <ion-button :disabled="!omsRedirectionInfo.token || !omsRedirectionInfo.url || !hasPermission(Actions.APP_COMMERCE_VIEW)" @click="goToOms(omsRedirectionInfo.token, omsRedirectionInfo.url)" fill="clear">
            {{ $t('Go to OMS') }}
            <ion-icon slot="end" :icon="openOutline" />
          </ion-button>
        </ion-card>
      </section>
      <hr />
      <div class="section-header">
        <h1>
          {{ translate("App") }}
          <p class="overline" >{{ translate("Version:", { appVersion }) }}</p>
        </h1>
        <p class="overline">{{ translate("Built:", { builtTime:  getDateTime(appInfo.builtTime)}) }}</p>
      </div>
      <section>
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              {{ translate("Timezone") }}
            </ion-card-title>
          </ion-card-header>
          <ion-card-content>
            {{ translate("The timezone you select is used to ensure automations you schedule are always accurate to the time you select.") }}
          </ion-card-content>
          <ion-item v-if="showBrowserTimeZone">
            <ion-label>
              <p class="overline">{{ translate("Browser TimeZone") }}</p>
              {{ browserTimeZone.id }}
              <p v-if="showDateTime">{{ getCurrentTime(browserTimeZone.id, dateTimeFormat) }}</p>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p class="overline">{{ translate("Selected TimeZone") }}</p>
              {{ currentTimeZoneId }}
              <p v-if="showDateTime">{{ getCurrentTime(currentTimeZoneId, dateTimeFormat) }}</p>
            </ion-label>
            <ion-button @click="changeTimeZone()" slot="end" fill="outline" color="dark">{{ translate("Change") }}</ion-button>
          </ion-item>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <div class="card-header">
              <div>
                <ion-card-title>{{ translate('Data Fetch Status') }}</ion-card-title>
                <ion-card-subtitle v-if="oldestSyncTime">{{ translate("Oldest sync:") }} {{ oldestSyncTime }}</ion-card-subtitle>
              </div>
              <ion-button fill="clear" @click="refreshCache()" size="small">
                <ion-icon slot="icon-only" :icon="syncOutline" />
              </ion-button>
            </div>
          </ion-card-header>
          <ion-list lines="none">
            <ion-item v-for="item in harmonizedFetchStatus" :key="item.label">
              <ion-icon slot="start" :icon="getStatusIcon(item.status)" :color="getStatusColor(item.status)" />
              <ion-label>
                {{ item.label }}
                <p v-if="item.status === 'success' && item.count !== undefined">{{ translate("Fetched") }} {{ item.count }} {{ translate("records") }}</p>
                <p v-else>{{ translate(getStatusLabel(item.status)) }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" @click="item.refresh()">
                <ion-icon slot="icon-only" :icon="syncOutline" />
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-card>
      </section>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { Actions, hasPermission } from '@/authorization'
import { computed, onMounted, ref , defineProps} from "vue";
import { useStore } from "vuex";
import TimeZoneModal from "@/components/TimezoneModal.vue";
import Image from "@/components/Image.vue"
import { DateTime } from "luxon";
import { translate } from "@/i18n"
import { openOutline, syncOutline, checkmarkCircle, closeCircle } from "ionicons/icons"
import { goToOms } from "@hotwax/dxp-components";
import { getCurrentTime } from "../utils"
import useServiceJob from "@/composables/useServiceJob";
const store = useStore()
const { jobs, loading: loadingJobs, fetchJobs } = useServiceJob();
const appVersion = ref("")
const maargInfo = computed(() => store.getters["util/getMaargInfo"])
const omsVersion = computed(() => String(maargInfo.value?.instanceInfo?.componentRelease || "").trim())
const appInfo = (process.env.VUE_APP_VERSION_INFO ? JSON.parse(process.env.VUE_APP_VERSION_INFO) : {}) as any

const userProfile = computed(() => store.getters["user/getUserProfile"])
const oms = computed(() => store.getters["user/getInstanceUrl"])
const omsRedirectionInfo = computed(() => store.getters["user/getOmsRedirectionInfo"])
const omsVersionLabel = computed(() => omsVersion.value || translate("Not available"))
const currentTimeZoneId = computed(() => userProfile.value.timeZone)
const statusItems = computed(() => store.state.util.statusItems)
const facilities = computed(() => store.state.util.facilities)
const fetchStatus = computed(() => store.getters["util/getFetchStatus"])
const userFetchStatus = computed(() => store.getters["user/getFetchStatus"])
const productStoreFetchStatus = computed(() => store.getters["productStore/getFetchStatus"])
const shopifyFetchStatus = computed(() => store.getters["shopify/getFetchStatus"])

const oldestSyncTime = computed(() => {
  const timestamps = [
    userFetchStatus.value.lastFetched,
    fetchStatus.value.lastFetched,
    productStoreFetchStatus.value.lastFetched,
    shopifyFetchStatus.value.lastFetched
  ].filter(t => t > 0);
  
  if (!timestamps.length) return '';
  const oldest = Math.min(...timestamps);
  return DateTime.fromMillis(oldest).toLocaleString(DateTime.DATETIME_MED);
})

const harmonizedFetchStatus = computed(() => [
  {
    label: translate("User Profile"),
    status: userFetchStatus.value.profile,
    count: userProfile.value ? 1 : 0,
    refresh: () => store.dispatch('user/fetchUserProfile', store.state.user.token)
  },
  {
    label: translate("Permissions"),
    status: userFetchStatus.value.permissions,
    count: store.state.user.permissions.length,
    refresh: () => store.dispatch('user/fetchPermissions', { params: { permissionIds: [process.env.VUE_APP_PERMISSION_ID] }, url: omsRedirectionInfo.value.url, token: omsRedirectionInfo.value.token })
  },
  {
    label: translate("Product Stores"),
    status: productStoreFetchStatus.value.productStores,
    count: store.state.productStore.productStores.length,
    refresh: () => store.dispatch('productStore/fetchProductStores')
  },
  {
    label: translate("Shopify Shops"),
    status: shopifyFetchStatus.value.shops,
    count: store.state.shopify.shops.length,
    refresh: () => store.dispatch('shopify/fetchShopifyShops')
  },
  {
    label: translate("Statuses"),
    status: fetchStatus.value.statuses,
    count: Object.keys(statusItems.value).length,
    refresh: () => store.dispatch('util/fetchStatusItems')
  },
  {
    label: translate("Facilities"),
    status: fetchStatus.value.facilities,
    count: facilities.value.length,
    refresh: () => store.dispatch('util/fetchFacilities')
  },
  {
    label: translate("Organization"),
    status: fetchStatus.value.organizationPartyId,
    count: store.state.util.organizationPartyId ? 1 : 0,
    refresh: () => store.dispatch('util/fetchOrganizationPartyId')
  },
  {
    label: translate("Facility Groups"),
    status: fetchStatus.value.facilityGroups,
    count: store.state.util.facilityGroups.length,
    refresh: () => store.dispatch('util/fetchFacilityGroups')
  },
  {
    label: translate("DBIC Countries"),
    status: fetchStatus.value.dbicCountries,
    count: store.state.util.dbicCountries.list?.length,
    refresh: () => store.dispatch('util/fetchDBICCountries')
  },
  {
    label: translate("Operating Countries"),
    status: fetchStatus.value.operatingCountries,
    count: store.state.util.operatingCountries.length,
    refresh: () => store.dispatch('util/fetchOperatingCountries')
  },
  {
    label: translate("Product Identifiers"),
    status: fetchStatus.value.productIdentifiers,
    count: store.state.util.productIdentifiers.length,
    refresh: () => store.dispatch('util/fetchProductIdentifiers')
  },
  {
    label: translate("Shipment Method Types"),
    status: fetchStatus.value.shipmentMethodTypes,
    count: store.state.util.shipmentMethodTypes.length,
    refresh: () => store.dispatch('util/fetchShipmentMethodTypes')
  },
  {
    label: translate("Jobs"),
    status: loadingJobs.value ? 'pending' : (jobs.value.length ? 'success' : 'none'),
    count: jobs.value.length,
    refresh: () => fetchJobs()
  }
])

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success': return checkmarkCircle;
    case 'error': return closeCircle;
    case 'pending': return syncOutline;
    default: return syncOutline;
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'success': return 'success';
    case 'error': return 'danger';
    case 'pending': return 'warning';
    default: return 'medium';
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'success': return 'Fetched';
    case 'error': return 'Failed';
    case 'pending': return 'Fetching';
    default: return 'Not Fetched';
  }
}

const browserTimeZone = ref({
  label: '',
  id: Intl.DateTimeFormat().resolvedOptions().timeZone
})

function refreshCache() {
  store.dispatch('user/fetchUserProfile', store.state.user.token);
  store.dispatch("user/fetchPermissions", { url: store.getters["user/getOmsRedirectionInfo"].url, token: store.getters["user/getOmsRedirectionInfo"].token });
  store.dispatch('util/fetchStatusItems');
  store.dispatch('util/fetchFacilities');
  store.dispatch('util/fetchOrganizationPartyId');
  store.dispatch('util/fetchFacilityGroups');
  store.dispatch('util/fetchDBICCountries');
  store.dispatch('util/fetchOperatingCountries');
  store.dispatch('util/fetchProductIdentifiers');
  store.dispatch('util/fetchShipmentMethodTypes');
  store.dispatch('productStore/fetchProductStores');
  store.dispatch('shopify/fetchShopifyShops');
  fetchJobs();
}

defineProps({
  showBrowserTimeZone: {
    type: Boolean,
    default: true
  },
  showDateTime: {
    type: Boolean,
    default: true
  },
  dateTimeFormat: {
    type: String,
    default: 't ZZZZ'
  }
})
onMounted(() => {
  appVersion.value = appInfo.branch ? (appInfo.branch + "-" + appInfo.revision) : appInfo.tag;
  // maargInfo is fetched once on login via util/fetchMaargInfo. Dispatch
  // again here as a safety net for sessions that pre-date that wiring or
  // where the initial dispatch failed; the action itself is idempotent.
  // Failures are surfaced via the empty omsVersion label, so swallow the
  // rejection here to avoid an unhandled promise warning.
  store.dispatch("util/fetchMaargInfo").catch(() => { /* noop */ });
})

async function changeTimeZone() {
  const timeZoneModal = await modalController.create({
    component: TimeZoneModal,
  });
  timeZoneModal.present();

  const { data } = await timeZoneModal.onDidDismiss();
  if (data && data.timeZoneId) {
    await store.dispatch("user/setUserTimeZone", {
      "tzId": data.timeZoneId
    })
  }
}

function logout() {
  store.dispatch("user/logout").then(() => {
    const redirectUrl = window.location.origin + '/login'
    window.location.href = `${process.env.VUE_APP_LOGIN_URL}?isLoggedOut=true&redirectUrl=${redirectUrl}`
  })
}

function getDateTime(time: any) {
  return time ? DateTime.fromMillis(time).toLocaleString({ ...DateTime.DATETIME_MED, hourCycle: "h12" }) : "";
}

function goToLaunchpad() {
  window.location.href = `${process.env.VUE_APP_LOGIN_URL}`
}
</script>

<style scoped>
  ion-card > ion-button {
    margin: var(--spacer-xs);
  }
  section {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    align-items: start;
  }
  .user-profile {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  }
  hr {
    border-top: 1px solid var(--border-medium);
  }
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacer-xs) 10px 0px;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
</style>
