<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Create App Version") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-select v-model="selectedApp" :label="translate('App')" interface="popover">
          <ion-select-option v-for="option in appOptions" :key="option.appId" :value="option.appId">
            {{ option.appName || option.appId }}
          </ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-select v-model="selectedEnv" :label="translate('Environment')" :disabled="!selectedApp" interface="popover">
          <ion-select-option v-for="env in environmentsForSelectedApp" :key="env.enumId" :value="env.enumId">
            {{ env.description || env.enumId }}
          </ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-select v-model="version" :label="translate('Version')" :disabled="!selectedEnv" interface="popover">
          <ion-select-option v-for="option in versionOptions" :key="option" :value="option">
            {{ option }}
          </ion-select-option>
        </ion-select>
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab slot="fixed" vertical="bottom" horizontal="end">
    <ion-fab-button :disabled="!selectedApp || !selectedEnv || !version" @click="saveAppVersion">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonList, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { computed, ref, watch } from "vue";
import { useAppEnvironments, useAppVersionMutations, useAppVersions, useApps } from "@/composables/useAppVersion";
import { hostedVersionsFor } from "@/utils/appVersionOptions";

const { apps } = useApps();
const { appEnvironments } = useAppEnvironments();
const { byAppEnv } = useAppVersions();
const { createAppVersion } = useAppVersionMutations();

const selectedApp = ref("");
const selectedEnv = ref("");
const version = ref("");

/**
 * App + environment combos that do NOT yet have a version pin — one entry per app, each carrying the
 * environments still available for it. Mirrors the old modal: an app disappears once every
 * environment is pinned. Cache-driven, so it stays correct as pins are added.
 */
const appOptions = computed(() => {
  const options: Record<string, { appId: string; appName: string; envs: any[] }> = {};
  apps.value.forEach((app) => {
    appEnvironments.value.forEach((env: any) => {
      if(byAppEnv.value[`${app.appId}_${env.enumId}`]) {
        return;
      }

      // Nothing hosted for this app in this environment, so there is no version to pin. An app whose
      // every environment is unhosted therefore never gets an entry, and drops out of the App list.
      if(!hostedVersionsFor(app.appId, env.enumId).length) {
        return;
      }
      if(options[app.appId]) {
        options[app.appId].envs.push(env);
      } else {
        options[app.appId] = { ...app, envs: [env] };
      }
    });
  });

  return Object.values(options);
});

const environmentsForSelectedApp = computed(() =>
  appOptions.value.find((option) => option.appId === selectedApp.value)?.envs ?? []);

const versionOptions = computed(() => hostedVersionsFor(selectedApp.value, selectedEnv.value));

const selectedAppName = computed(() =>
  appOptions.value.find((option) => option.appId === selectedApp.value)?.appName || selectedApp.value);

const selectedEnvDesc = computed(() =>
  environmentsForSelectedApp.value.find((env: any) => env.enumId === selectedEnv.value)?.description || selectedEnv.value);

// Both are scoped to the chosen app, so a leftover value from a previous choice would be invalid.
watch(selectedApp, () => {
  selectedEnv.value = "";
  version.value = "";
});

// Versions are per app + environment, so changing the environment invalidates the chosen version.
watch(selectedEnv, () => {
  version.value = "";
});

function closeModal() {
  modalController.dismiss();
}

async function saveAppVersion() {
  try {
    await createAppVersion({
      appId: selectedApp.value,
      environmentTypeId: selectedEnv.value,
      currentVersion: version.value,
    });
    commonUtil.showToast(translate("version created successfully", { appName: selectedAppName.value, environment: selectedEnvDesc.value }));
    modalController.dismiss({ fetchInfo: true });
  } catch (error) {
    logger.error("Failed to register the app version", error);
    commonUtil.showToast(translate("Failed to register the app version"));
  }
}
</script>
