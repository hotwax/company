<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/netsuite" />
        <ion-title>{{ translate("App Version") }}</ion-title>
        <ion-buttons slot="end" v-if="Object.keys(apps).length">
          <ion-button slot="icon-only" @click="createAppVersion" color="primary">
            <ion-icon :icon="addOutline" />
          </ion-button>
        </ion-buttons>
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
        {{ translate("Failed to load app version information, please contact administrator.") }}
      </div>

      <div class="list-item ion-padding-end" v-for="(app, id) in apps" :key="id">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="storefrontOutline" />
          <ion-label>
            {{ app.appName }}
          </ion-label>
        </ion-item>
        
        <ion-label :color="envColor[app.environmentTypeId]">
          {{ app.enumDesc }}
        </ion-label>

        <template v-if="app.version">
          <div class="ion-text-center">
            <ion-chip outline :color="envColor[app.environmentTypeId]" @click="editAppVersion(app.id, app)">
              <ion-label>{{ app.version }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="removeAppVersion(app)"/>
            </ion-chip>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" @click="editAppVersion(app.id, app)">
            <ion-icon slot="start" :icon="addOutline"/>
            <ion-label>{{ translate("app version") }}</ion-label>
          </ion-button>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonBackButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonSpinner, IonTitle, IonToolbar, alertController, onIonViewDidEnter, modalController } from "@ionic/vue";
import { addOutline, closeCircleOutline, shieldCheckmarkOutline, storefrontOutline } from 'ionicons/icons'
import { translate } from "@/i18n"
import { Ref, ref } from "vue";
import { showToast } from '@/utils';
import emitter from "@/event-bus";
import logger from '@/logger';
import { UtilService } from "@/services/UtilService";
import CreateAppVersion from "@/components/CreateAppVersion.vue";

interface AppInfo {
  id: string;
  appName: string;
  version: string;
  environmentTypeId: string;
  enumDesc: string;
}

interface App {
  [key: string]: AppInfo
}

const envColor = {
  AppEnvDev: "primary",
  AppEnvUAT: "medium",
  AppEnvProd: "danger"
} as any

const apps: Ref<App> = ref({})
let isLoading = ref(true)

onIonViewDidEnter(async () => {
  await fetchAppVersions();
  isLoading.value = false
})

async function fetchAppVersions() {
  try {
    const resp = await UtilService.fetchAppVersions()
    resp.data.forEach((app: any) => {
      apps.value[`${app.appId}_${app.environmentTypeId}`] = {
        id: app.appId,
        appName: app.appName || app.appId,
        environmentTypeId: app.environmentTypeId,
        version: app.currentVersion,
        enumDesc: app.enumDesc
      }
    });
  } catch(err) {
    logger.error("Failed to fetch app versions", err)
  }
}

async function removeAppVersion(app: AppInfo) {
  emitter.emit("presentLoader");
  try {
    await UtilService.removeAppVersion({
      appId: app.id,
      environmentTypeId: app.environmentTypeId
    });

    showToast(translate("version removed, app will be served on latest production release", { appName: app.appName, environment: app.enumDesc }))
    await fetchAppVersions()
  } catch(err) {
    logger.error(err)
  }
  emitter.emit('dismissLoader')
}

async function updateAppVersion(id: string, appVersion: string, app: AppInfo) {
  emitter.emit("presentLoader");
  try {
    await UtilService.updateAppVersion({
      appId: id,
      environmentTypeId: app.environmentTypeId,
      currentVersion: appVersion
    });

    showToast(translate("version updated successfully", { appName: app.appName, environment: app.enumDesc }))
    await fetchAppVersions()
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

async function createAppVersion() {
  const appVersionModal = await modalController.create({
    component: CreateAppVersion,
    componentProps: { appsVersionInfo: apps.value }
  })

  appVersionModal.onDidDismiss().then(async (data) => {
    if(data?.data?.fetchInfo) {
      await fetchAppVersions()
    }
  })

  appVersionModal.present();
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