<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
        <ion-title>{{ translate("App Version") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header ion-margin-top">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
          <ion-label>
            {{ translate("Manage app versions") }}
            <p>{{ translate("Define which app version is compatible with OMS. Apps without a specific version set will default to the latest production release.") }}</p>
          </ion-label>
        </ion-item>
      </div>

      <div class="empty-state" v-if="isLoading">
        <ion-item lines="none">
          <ion-spinner name="crescent" slot="start" />
          {{ translate("Fetching app versions") }}
        </ion-item>
      </div>

      <div class="empty-state" v-else-if="!Object.keys(apps).length">
        {{ translate("Failed to load app version information") }}
      </div>

      <div class="list-item ion-padding-end" v-for="(app, id) in apps" :key="id">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="storefrontOutline" />
          <ion-label>
            {{ app.appName }}
          </ion-label>
        </ion-item>
        
        <ion-label :color="app.isSandbox === 'Y' ? 'warning' : 'danger'">
          {{ getAppEnvironment(app) }}
        </ion-label>

        <template v-if="app.version">
          <div class="ion-text-center">
            <ion-chip outline @click="editAppVersion(id, app)">
              <ion-label>{{ app.version }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="updateAppVersion(id, '', app)"/>
            </ion-chip>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editAppVersion(id, app)">
            <ion-icon slot="start" :icon="addOutline"/>
            <ion-label>{{ translate("app version") }}</ion-label>
          </ion-button>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonSpinner, IonTitle, IonToolbar, alertController, onIonViewDidEnter } from "@ionic/vue";
import { addOutline, closeCircleOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { computed, Ref, ref } from "vue";
import { showToast } from '@/utils';
import emitter from "@/event-bus";
import logger from '@/logger';
import { UtilService } from "@/services/UtilService";

interface AppInfo {
  id: string;
  appName: string;
  isSandbox: string;
  version: string;
}

interface App {
  [key: string]: AppInfo
}

const apps: Ref<App> = ref({})
let isLoading = ref(true)

const getAppEnvironment = computed(() => (app: AppInfo) => app.isSandbox === 'Y' ? "UAT" : "PROD")

onIonViewDidEnter(async () => {
  try {
    const resp = await UtilService.fetchAppVersions()
    resp.data.forEach((app: any) => {
      // if(app.version?.trim()) {
        apps.value[app.appVersionId] = {
          id: app.appVersionId,
          appName: app.appName,
          version: app.version,
          isSandbox: app.isSandbox
        }
      // }
    });
  } catch(err) {
    logger.error("Failed to fetch app versions", err)
  }
  isLoading.value = false
})

async function updateAppVersion(id: string, appVersion: string, app: AppInfo) {
  emitter.emit("presentLoader");
  try {
    await UtilService.updateAppVersion({
      appVersionId: id,
      version: appVersion
    });
    apps.value[id].version = appVersion

    if(appVersion) {
      showToast(translate("version updated successfully", { appName: app.appName, environment: getAppEnvironment.value(app) }))
    } else {
      showToast(translate("version removed, app will be served on latest production release", { appName: app.appName, environment: getAppEnvironment.value(app) }))
    }
  } catch(err) {
    logger.error(err)
  }
  emitter.emit('dismissLoader')
}

async function editAppVersion(id: string, app: AppInfo) {
  const version = app.version
  const alert = await alertController.create({
    header: translate("Add version"),
    inputs: [{
      name: "appVersion",
      placeholder: translate("app version"),
      value: version || ""
    }],
    buttons: [
      {
        text: translate("Cancel"),
        role: "cancel"
      },
      {
        text: translate("Save"),
        handler: async (data) => {
          const appVersion = data.appVersion.trim();
          
          if(appVersion && version === appVersion) {
            showToast(translate("Please update the app version"));
            return false;
          }

          updateAppVersion(id, appVersion, app)
        }
      }
    ]
  });
  await alert.present();
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
}

@media (max-width: 700px) {
  .header {
    grid-template-columns: 1fr;
  }
}
</style>