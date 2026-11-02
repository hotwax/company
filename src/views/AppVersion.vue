<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("App Version") }}</ion-title>
      </ion-toolbar>
      <ion-progress-bar v-if="hostedVersionsLoading" type="indeterminate" />
    </ion-header>
    <ion-content>
      <p class="ion-padding-horizontal">{{ translate("Choose a version to keep this instance on that release. Default follows the build deployed to the environment’s main URL.") }}</p>
      <ion-grid>
        <ion-row class="ion-hide-md-down">
          <ion-col size="4"><ion-item lines="none"><ion-label>{{ translate("App") }}</ion-label></ion-item></ion-col>
          <ion-col v-for="env in environments" :key="env.id" size="3"><ion-item lines="none"><ion-label><span class="environment-title"><ion-icon :icon="env.icon" aria-hidden="true" />{{ translate(env.label) }}</span></ion-label></ion-item></ion-col>
        </ion-row>
        <template v-if="!appsHydrated || !versionsHydrated">
          <ion-row v-for="n in 5" :key="n" data-testid="app-versions-loading">
            <ion-col v-for="column in 3" :key="column" size="4"><ion-item lines="none"><ion-skeleton-text animated /></ion-item></ion-col>
          </ion-row>
        </template>
        <div v-else-if="!sortedApps.length" class="empty-state" data-testid="app-versions-empty">{{ translate("No apps found") }}</div>
        <template v-else>
          <section v-for="group in appGroups" :key="group.id" :aria-label="translate(group.label)" :data-testid="`app-versions-${group.id}`">
            <ion-item-divider v-if="group.id === 'legacy'"><ion-label :id="`app-group-${group.id}`">{{ translate(group.label) }}</ion-label></ion-item-divider>
            <ion-row v-for="app in group.apps" :key="app.appId" class="app-version-row" :data-testid="`app-version-${app.appId}-row`">
              <ion-col size="12" size-md="4">
                <ion-item lines="none"><ion-label>{{ app.appName || app.appId }}</ion-label></ion-item>
              </ion-col>
              <ion-col v-for="env in environments" :key="env.id" size="5" size-md="3">
                <ion-label class="ion-hide-md-up ion-padding-start"><span class="environment-title"><ion-icon :icon="env.icon" aria-hidden="true" />{{ translate(env.label) }}</span></ion-label>
                <ion-item lines="none">
                  <ion-chip outline :disabled="saving || hostedVersionsLoading" role="button" tabindex="0"
                    :aria-label="translate('Change {app} {environment} version', { app: app.appName || app.appId, environment: env.label })"
                    :data-testid="`app-version-${app.appId}-${env.id}-chip`"
                    @click="editAppVersion(app, env)" @keydown.enter.prevent="editAppVersion(app, env)" @keydown.space.prevent="editAppVersion(app, env)">
                    <ion-label>{{ pinFor(app.appId, env.id)?.currentVersion || translate("Default") }}</ion-label>
                  </ion-chip>

                </ion-item>
              </ion-col>
              <ion-col size="2">
                <ion-item lines="none" class="history-action">
                  <ion-button slot="end" fill="clear" size="default"
                    :aria-label="translate('View {app} version history', { app: app.appName || app.appId })"
                    :data-testid="`app-version-${app.appId}-history-btn`" @click="openHistory(app)">
                    <ion-icon slot="icon-only" :icon="timeOutline" />
                  </ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
          </section>
        </template>
      </ion-grid>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, emitter, logger, translate } from "@common";
import { IonButton, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonMenuButton, IonPage, IonProgressBar, IonRow, IonSkeletonText, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { flaskOutline, rocketOutline, timeOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import SelectAppVersionModal from "@/components/app-version/SelectAppVersionModal.vue";
import AppVersionHistoryModal from "@/components/app-version/AppVersionHistoryModal.vue";
import { useApps, useAppVersionMutations, useAppVersions, useHostedAppVersions } from "@/composables/useAppVersion";

interface App { appId: string; appName: string }
interface Environment { id: string; label: string; icon: string }
const environments: Environment[] = [{ id: "AppEnvUAT", label: "UAT", icon: flaskOutline }, { id: "AppEnvProd", label: "Prod", icon: rocketOutline }];
const { apps, hydrated: appsHydrated } = useApps();
const { byAppEnv, hydrated: versionsHydrated } = useAppVersions();
const sortedApps = computed(() => [...apps.value].sort((a, b) => (a.appName || a.appId).localeCompare(b.appName || b.appId)));
const legacyAppIds = new Set(["FACILITIES", "USERS", "ATP"]);
const appGroups = computed(() => [
  { id: "current", label: "Current", apps: sortedApps.value.filter(app => !legacyAppIds.has(app.appId)) },
  { id: "legacy", label: "Legacy", apps: sortedApps.value.filter(app => legacyAppIds.has(app.appId)) }
].filter(group => group.apps.length));
const pinFor = (appId: string, envId: string) => byAppEnv.value[`${appId}_${envId}`];
const { refreshHostedVersions, readCachedHostedVersions, loading: hostedVersionsLoading } = useHostedAppVersions();
const { createAppVersion, updateAppVersion } = useAppVersionMutations();
const saving = ref(false);


async function saveVersion(app: App, env: Environment, version: string) {
  if(saving.value) {return false;}
  const existing = pinFor(app.appId, env.id);
  saving.value = true;
  emitter.emit("presentLoader");
  try {
    const live = await refreshHostedVersions(app.appId, env.id, true, version ? [version] : []);
    if(version && live.checks?.[version]?.status === "unknown") {throw new Error("Version availability could not be verified");}
    if(!live.available || (version && !live.versions.includes(version))) {
      commonUtil.showToast(translate("This version is no longer available. Refresh the version list."));

      return false;
    }
    const key = { appId: app.appId, environmentTypeId: env.id };
    if(!version) {
      // Keep the deployment row so clearing the pin is included in its field audit history.
      await updateAppVersion({ ...key, currentVersion: null });
    } else if(existing) {
      await updateAppVersion({ ...key, currentVersion: version });
    } else {
      await createAppVersion({ ...key, currentVersion: version });
    }
    commonUtil.showToast(translate("App version saved"));

    return true;
  } catch(error) {
    logger.error(error);
    commonUtil.showToast(translate("Could not confirm the version change. Refresh before trying again."));

    return false;
  } finally {
    saving.value = false;
    emitter.emit("dismissLoader");
  }
}

async function editAppVersion(app: App, env: Environment) {
  if(saving.value || hostedVersionsLoading.value) {return;}
  const current = pinFor(app.appId, env.id)?.currentVersion || "";
  let deployment;
  let discoveryError = false;
  try {
    deployment = await readCachedHostedVersions(app.appId, env.id);
  } catch {
    discoveryError = true;
  }
  const modal = await modalController.create({
    component: SelectAppVersionModal,
    canDismiss: () => !saving.value,
    componentProps: {
      appId: app.appId,
      appName: app.appName || app.appId,
      environmentLabel: env.label,
      environmentTypeId: env.id,
      deployment,
      discoveryError,
      onCheck: (versions: string[], fresh: boolean) => refreshHostedVersions(app.appId, env.id, fresh, versions),
      currentVersion: current,
      versions: deployment?.versions ?? [],
      onSave: (version: string) => saveVersion(app, env, version)
    }
  });
  await modal.present();
}

async function openHistory(app: App) {
  const modal = await modalController.create({
    component: AppVersionHistoryModal,
    componentProps: { appId: app.appId, appName: app.appName || app.appId }
  });
  await modal.present();
}
</script>

<style scoped>
.environment-title {
  display: inline-flex;
  align-items: center;
  gap: var(--spacer-xs);
}
.environment-title ion-icon { flex-shrink: 0; }
.app-version-row {
  border-bottom: 1px solid var(--ion-item-border-color, var(--ion-color-step-150, var(--ion-color-light-shade)));
}
.history-action {
  --padding-start: 0;
}
@media (max-width: 767px) {
  .history-action { margin-top: var(--spacer-base); }
}
</style>
