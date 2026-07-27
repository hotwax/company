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
          <ion-button :standalone-hidden="!userStore.hasPermission('COMMON_ADMIN')" fill="outline" @click="goToLaunchpad()">
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
          <ion-button v-if="!commonUtil.isMoqui()" :disabled="!userStore.hasPermission('COMMERCEUSER_VIEW')" @click="openOms" fill="clear">
            {{ $t('Go to OMS') }}
            <ion-icon slot="end" :icon="openOutline" />
          </ion-button>
        </ion-card>
      </section>
      <hr />
      <DxpAppVersionInfo />
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
                <ion-card-subtitle v-if="cacheSubtitle">{{ cacheSubtitle }}</ion-card-subtitle>
              </div>
              <ion-button fill="clear" size="small" :disabled="!!refreshing" @click="refreshAll()">
                <ion-spinner v-if="refreshing === '*'" name="dots" />
                <ion-icon v-else slot="icon-only" :icon="syncOutline" />
              </ion-button>
            </div>
          </ion-card-header>
          <ion-list lines="none">
            <!-- Session data: held in memory, not in the local cache. -->
            <ion-item v-for="item in sessionFetchStatus" :key="item.label">
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

            <!-- Local cache (IndexedDB): live row counts straight from the database. -->
            <ion-item-divider>
              <ion-label>{{ translate("Local cache") }} · {{ totalRows }} {{ translate("records") }}</ion-label>
            </ion-item-divider>
            <ion-item v-for="domain in domains" :key="domain.name">
              <ion-icon slot="start" :icon="getStatusIcon(domain.status)" :color="getStatusColor(domain.status)" />
              <ion-label>
                {{ translate(domain.label) }}
                <p>
                  {{ domain.count }} {{ translate("records") }}
                  <template v-if="domain.syncedAt"> · {{ translate("synced") }} {{ formatSyncTime(domain.syncedAt) }}</template>
                  <template v-else-if="domain.syncClass === 'A'"> · {{ translate("live while in use") }}</template>
                  <template v-else> · {{ translate("not synced yet") }}</template>
                </p>
              </ion-label>
              <ion-button slot="end" fill="clear" :disabled="!!refreshing" @click="refreshDomain(domain.name)">
                <ion-spinner v-if="refreshing === domain.name" name="dots" />
                <ion-icon v-else slot="icon-only" :icon="syncOutline" />
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-card>
      </section>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonMenuButton, IonPage, IonSpinner, IonTitle, IonToolbar, modalController } from "@ionic/vue";

import { computed, onMounted, ref , defineProps} from "vue";
import { useUserStore } from '@/store/user';
import { useUtilStore } from '@/store/util';
import { useAuth } from '@common/composables/useAuth';
import TimeZoneModal from "@/components/common/TimezoneModal.vue";
import Image from "@/components/common/Image.vue"
import DxpAppVersionInfo from "@/components/common/DxpAppVersionInfo.vue"
import { DateTime } from "luxon";
import { translate, commonUtil, cookieHelper } from '@common'
import router from '@/router'
import { openOutline, syncOutline, checkmarkCircle, closeCircle } from "ionicons/icons"

import { getCurrentTime } from "../utils"
import { useCacheStatus } from "@/composables/useCacheStatus";
import { useMaargConfig } from "@/composables/useSeed";
const userStore = useUserStore();
const utilStore = useUtilStore();
const { isAuthenticated } = useAuth();
const { config: maargConfig, load: loadMaargConfig } = useMaargConfig();
const maargInfo = computed(() => maargConfig.value)
const omsVersion = computed(() => String(maargInfo.value?.instanceInfo?.componentRelease || "").trim())

const userProfile = computed(() => userStore.getUserProfile)
const oms = computed(() => cookieHelper().get("oms") || userStore.oms || translate("Not set"))

const openOms = () => window.open(commonUtil.getMaargURL(), '_blank')

const omsVersionLabel = computed(() => omsVersion.value || translate("Not available"))
const currentTimeZoneId = computed(() => userProfile.value.timeZone)
const userFetchStatus = computed(() => userStore.fetchStatus)


// Live IndexedDB state: per-domain row counts + last sync, and the force-refresh actions.
const {
  domains, refreshing, totalRows, oldestSyncedAt, lastSyncedAt, refreshDomain, refreshAll,
} = useCacheStatus();

const formatSyncTime = (millis: number) =>
  DateTime.fromMillis(millis).toLocaleString(DateTime.DATETIME_MED);

const cacheSubtitle = computed(() => {
  if (!lastSyncedAt.value) return translate("Cache not synced yet");
  const parts = [`${translate("Last sync:")} ${formatSyncTime(lastSyncedAt.value)}`];
  // Reference data syncs once per login, so the oldest snapshot bounds how stale the cache can be.
  if (oldestSyncedAt.value && oldestSyncedAt.value !== lastSyncedAt.value) {
    parts.push(`${translate("oldest:")} ${formatSyncTime(oldestSyncedAt.value)}`);
  }
  return parts.join(" · ");
});

// Session-scoped data (auth/profile) is NOT in the local cache, so it keeps its store-based status.
const sessionFetchStatus = computed(() => [
  {
    label: translate("User Profile"),
    status: userFetchStatus.value.profile,
    count: userProfile.value ? 1 : 0,
    refresh: () => userStore.fetchUserProfile()
  },
  {
    label: translate("Permissions"),
    status: userFetchStatus.value.permissions,
    count: userStore.permissions?.length || 0,
    refresh: () => userStore.fetchPermissions()
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
  // maargInfo is fetched once on login via util/fetchMaargInfo. Dispatch
  // again here as a safety net for sessions that pre-date that wiring or
  // where the initial dispatch failed; the action itself is idempotent.
  // Failures are surfaced via the empty omsVersion label, so swallow the
  // rejection here to avoid an unhandled promise warning.
  void loadMaargConfig();
})

async function changeTimeZone() {
  const timeZoneModal = await modalController.create({
    component: TimeZoneModal,
  });
  timeZoneModal.present();

  const { data } = await timeZoneModal.onDidDismiss();
  if (data && data.timeZoneId) {
    await userStore.setUserTimeZone(data.timeZoneId)
  }
}

async function logout() {
  await userStore.postLogout();
  router.push('/login');
}

function goToLaunchpad() {
  window.location.href = import.meta.env.VITE_LOGIN_URL || '/';
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
