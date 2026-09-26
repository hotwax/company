<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("App Version") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button color="primary" @click="createAppVersion">
            <ion-icon slot="icon-only" :icon="addOutline" />
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

      <!-- Cold cache after login: the seed sync is still running, so show placeholders rather
           than an empty list that reads as "there is nothing here". -->
      <template v-if="!hydrated">
        <div v-for="n in 4" :key="`sk-${n}`" class="list-item ion-padding-end">
          <ion-item lines="none">
            <ion-label><ion-skeleton-text animated style="width: 45%" /></ion-label>
          </ion-item>
        </div>
      </template>

      <div v-else-if="!appVersions.length" class="empty-state">
        {{ translate("Failed to load app version information, please contact administrator.") }}
      </div>

      <div v-for="app in appVersions" :key="`${app.appId}_${app.environmentTypeId}`" class="list-item ion-padding-end">
        <ion-item lines="none">
          <ion-icon slot="start" :icon="storefrontOutline" />
          <ion-label>
            {{ app.appName || app.appId }}
          </ion-label>
        </ion-item>

        <ion-label :color="envColor[app.environmentTypeId]">
          {{ app.enumDesc }}
        </ion-label>

        <template v-if="app.currentVersion">
          <div class="ion-text-center">
            <ion-chip outline :color="envColor[app.environmentTypeId]" @click="editAppVersion(app)">
              <ion-label>{{ app.currentVersion }}</ion-label>
              <ion-icon :icon="closeCircleOutline" @click.stop="removeAppVersion(app)" />
            </ion-chip>
          </div>
        </template>
        <template v-else>
          <ion-button size="small" fill="outline" :disabled="!versionOptionsByAppEnv[`${app.appId}_${app.environmentTypeId}`]?.length" @click="editAppVersion(app)">
            <ion-icon slot="start" :icon="addOutline" />
            <ion-label>{{ translate("app version") }}</ion-label>
          </ion-button>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, emitter, logger, translate } from "@common";
import { IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPage, IonSkeletonText, IonTitle, IonToolbar, alertController, modalController } from "@ionic/vue";
import { addOutline, closeCircleOutline, shieldCheckmarkOutline, storefrontOutline } from "ionicons/icons";
import { computed } from "vue";
import CreateAppVersionModal from "@/components/app-version/CreateAppVersionModal.vue";
import type { AppVersionRecord } from "@/composables/useAppVersion";
import { useAppVersionMutations, useAppVersions } from "@/composables/useAppVersion";
import { hostedVersionsFor } from "@/utils/appVersionOptions";

const envColor: Record<string, string> = {
  AppEnvDev: "primary",
  AppEnvUAT: "medium",
  AppEnvProd: "danger",
};

const { appVersions, hydrated } = useAppVersions();
const { updateAppVersion: applyUpdate, removeAppVersion: applyRemove } = useAppVersionMutations();

/**
 * Hosted versions per row, keyed `${appId}_${environmentTypeId}` — the same composite key the list
 * and `byAppEnv` use. Computed once per list rather than called from the template so the row markup
 * does not re-derive it on every render.
 */
const versionOptionsByAppEnv = computed<Record<string, string[]>>(() =>
  appVersions.value.reduce((map: Record<string, string[]>, row) => {
    const key = `${row.appId}_${row.environmentTypeId}`;

    if(!map[key]) {
      map[key] = hostedVersionsFor(row.appId, row.environmentTypeId);
    }

    return map;
  }, {}));

async function removeAppVersion(app: AppVersionRecord) {
  emitter.emit("presentLoader");
  try {
    await applyRemove({ appId: app.appId, environmentTypeId: app.environmentTypeId });
    commonUtil.showToast(translate("version removed, app will be served on latest production release", { appName: app.appName || app.appId, environment: app.enumDesc }));
  } catch (error) {
    logger.error(error);
  }
  emitter.emit("dismissLoader");
}

async function updateAppVersion(app: AppVersionRecord, currentVersion: string) {
  emitter.emit("presentLoader");
  try {
    await applyUpdate({ appId: app.appId, environmentTypeId: app.environmentTypeId, currentVersion });
    commonUtil.showToast(translate("version updated successfully", { appName: app.appName || app.appId, environment: app.enumDesc }));
  } catch (error) {
    logger.error(error);
  }
  emitter.emit("dismissLoader");
}

async function editAppVersion(app: AppVersionRecord) {
  const version = app.currentVersion;
  const options = versionOptionsByAppEnv.value[`${app.appId}_${app.environmentTypeId}`] ??
    hostedVersionsFor(app.appId, app.environmentTypeId);

  // Nothing hosted for this app in this environment. Reachable: the chip stays enabled so its
  // close-circle can still clear the pin, so say why no picker opened rather than doing nothing.
  if(!options.length) {
    commonUtil.showToast(translate("No hosted versions for this app in this environment"));

    return;
  }

  const alert = await alertController.create({
    header: version ? translate("Update version") : translate("Add version"),
    // Radio inputs hand the SELECTED VALUE to the handler, not a `{ name: value }` object.
    inputs: options.map((option) => ({
      type: "radio" as const,
      label: option,
      value: option,
      checked: option === version,
    })),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Save"),
        handler: (appVersion: string) => {
          if(!appVersion) {
            commonUtil.showToast(translate("Please select an app version"));

            return false;
          }

          if(version === appVersion) {
            commonUtil.showToast(translate("Please update the app version"));

            return false;
          }

          updateAppVersion(app, appVersion);
        },
      },
    ],
  });
  await alert.present();
}

async function createAppVersion() {
  // A newly created pin isn't in the login-time cache yet; the modal's `createAppVersion` resyncs
  // the `appVersion` domain, so the cached list here picks it up via liveQuery without a refetch.
  const appVersionModal = await modalController.create({
    component: CreateAppVersionModal,
  });
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
