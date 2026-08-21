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
        <ion-select :label="translate('App')" v-model="selectedApp" interface="popover">
          <ion-select-option v-for="option in appOptions" :key="option.appId" :value="option.appId">{{ option.appName || option.appId }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-select :label="translate('Environment')" v-model="selectedEnv" :disabled="!selectedApp" interface="popover">
          <ion-select-option v-for="env in environmentsForSelectedApp" :key="env.enumId" :value="env.enumId">{{ env.description || env.enumId }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item :lines="errorMessage ? 'none' : 'inset'">
        <ion-input :label="translate('Version')" placeholder="version - v1.0.0" v-model="version" type="text" :error-text="errorMessage" :class="{ 'ion-invalid ion-touched': errorMessage }" />
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button @click="saveAppVersion" :disabled="!selectedApp || !selectedEnv || !version.trim() || !!errorMessage">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonList, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, saveOutline } from "ionicons/icons";
import { translate, commonUtil, logger } from "@common";
import { computed, ref, watch } from "vue";
import { appVersionError, useAppEnvironments, useApps, useAppVersions, useAppVersionMutations } from "@/composables/useAppVersion";

const { apps } = useApps();
const { appEnvironments } = useAppEnvironments();
const { byAppEnv } = useAppVersions();
const { createAppVersion } = useAppVersionMutations();

const selectedApp = ref("");
const selectedEnv = ref("");
const version = ref("");
const errorMessage = ref("");

/**
 * App + environment combos that do NOT yet have a version pin — one entry per app, each carrying the
 * environments still available for it. Mirrors the old modal: an app disappears once every
 * environment is pinned. Cache-driven, so it stays correct as pins are added.
 */
const appOptions = computed(() => {
  const options: Record<string, { appId: string; appName: string; envs: any[] }> = {};
  apps.value.forEach((app) => {
    appEnvironments.value.forEach((env: any) => {
      if (byAppEnv.value[`${app.appId}_${env.enumId}`]) return;
      if (options[app.appId]) {
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

watch(version, () => {
  errorMessage.value = appVersionError(version.value);
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
    commonUtil.showToast(translate("version created successfully", { appName: selectedApp.value, environment: selectedEnv.value }));
    modalController.dismiss({ fetchInfo: true });
  } catch (error) {
    logger.error("Failed to register the app version", error);
    commonUtil.showToast(translate("Failed to register the app version"));
  }
}
</script>
