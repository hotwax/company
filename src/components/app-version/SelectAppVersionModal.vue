<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ translate("Select version") }}</ion-title>
      <ion-buttons slot="start">
        <ion-button :disabled="saving" :aria-label="translate('Close')" data-testid="version-picker-close-btn" @click="modalController.dismiss()"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button>
      </ion-buttons>
      <ion-buttons v-if="onRefresh || onCheck" slot="end"><ion-button :disabled="saving || refreshing" :aria-label="translate('Refresh')" data-testid="version-picker-refresh-btn" @click="refreshAll"><ion-icon slot="icon-only" :icon="refreshOutline" /></ion-button></ion-buttons>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <ion-item lines="full">
      <ion-label><h2>{{ appName }}</h2><p>{{ translate(environmentLabel) }}</p></ion-label>
      <ion-note v-if="deployment?.verifiedAt" slot="end" class="deployment-checked">{{ translate("Checked {date}", { date: commonUtil.formatDateTimeValue(deployment.verifiedAt) }) }}</ion-note>
    </ion-item>
    <ion-item v-if="environmentMismatch" lines="none" data-testid="deployment-environment-warning"><ion-label class="ion-text-wrap">{{ translate("The app at this {selectedEnvironment} URL is configured to use {environment} version settings. Changes to {selectedEnvironment} may not take effect when users open the main URL.", { environment: translate(environmentMismatch), selectedEnvironment: translate(environmentLabel) }) }}</ion-label></ion-item>
    <ion-item v-if="discoveryFailed" lines="none" data-testid="version-picker-discovery-error"><ion-label class="ion-text-wrap">{{ translate("Could not check available versions. Refresh to try again.") }}</ion-label></ion-item>
    <ion-item v-if="refreshing" lines="none"><ion-spinner /><ion-label>{{ translate("Checking hosted versions") }}</ion-label></ion-item>
    <ion-radio-group v-model="selected" data-testid="version-picker-options">
      <ion-item>
        <ion-radio value="" :disabled="saving || refreshing || discoveryFailed || deployment?.available === false" label-placement="end" justify="start" data-testid="version-picker-default">
          <ion-label class="ion-text-wrap">{{ translate("Default") }}
            <p v-if="deployment?.defaultBuild">{{ translate("Verified default: {build}", { build: deployment.defaultBuild }) }}</p>
            <p v-if="deployment?.available === false">{{ translate("No deployment was found for this environment") }}</p>
            <p v-else>{{ translate("Follows the build deployed to this environment’s main URL. It updates with deployments and may differ from the latest GitHub release.") }}</p>
          </ion-label>
        </ion-radio>
      </ion-item>
      <ion-accordion-group :value="expandedVersion" @ionChange.stop @click.stop>
        <ion-accordion v-for="version in displayedVersions" :key="version" :value="version">
          <div slot="header" @click.stop>
            <ion-item>
              <ion-radio :value="version" :disabled="saving || refreshing || discoveryFailed || !versions.includes(version)" label-placement="end" justify="start" :data-testid="`version-picker-${version}`" @click.stop="selectVersion(version)">
                <ion-label class="ion-text-wrap"><h2>{{ version }}</h2><p v-if="releases[version]?.publishedAt">{{ translate("Released {date}", { date: commonUtil.getDateAndTime(releases[version].publishedAt) }) }}</p><p v-else-if="!releases[version] || releases[version].status === 'loading'">{{ translate("Loading release details") }}</p><p v-else>{{ translate("Release date unavailable") }}</p><p v-if="deployment?.checks?.[version]?.status === 'unknown'">{{ translate("Could not verify availability. Refresh to try again.") }}</p><p v-else-if="!versions.includes(version)">{{ translate("Not deployed as a selectable version on {environment}", { environment: translate(environmentLabel) }) }}</p></ion-label>
              </ion-radio>
              <ion-note v-if="version === currentVersion" slot="end">{{ translate("Current") }}</ion-note>
              <ion-button slot="end" fill="clear" :aria-expanded="expandedVersion === version" :aria-controls="`release-content-${version}`" :aria-label="translate('Release notes for {version}', { version })" :data-testid="`version-notes-${version}-toggle`" @click="expandedVersion = expandedVersion === version ? undefined : version"><ion-icon slot="icon-only" :icon="expandedVersion === version ? chevronUpOutline : chevronDownOutline" /></ion-button>
            </ion-item>
          </div>
            <div slot="content" :id="`release-content-${version}`" class="ion-padding-horizontal ion-padding-bottom">
              <p v-if="!releases[version] || releases[version].status === 'loading'" data-testid="release-details-loading">{{ translate("Loading release details") }}</p>
              <template v-else-if="releases[version].status === 'error'">
                <p data-testid="release-details-error">{{ translate("Could not load release details") }}</p>
                <ion-button fill="clear" :data-testid="`release-${version}-retry-btn`" @click="loadRelease(version)">{{ translate("Retry") }}</ion-button>
              </template>
              <p v-else-if="releases[version].status === 'missing'" data-testid="release-details-missing">{{ translate("No published release details found for this version") }}</p>
              <template v-else>
                <ul v-if="releases[version].brief?.length" class="release-brief"><li v-for="(line, index) in releases[version].brief" :key="index">{{ line }}</li></ul>
                <p v-else>{{ translate("No release summary is available") }}</p>
                <ion-button fill="clear" :href="releases[version].url" target="_blank" rel="noopener noreferrer" :data-testid="`release-${version}-github-link`">{{ translate("Full release notes on GitHub") }}<ion-icon slot="end" :icon="openOutline" /></ion-button>
              </template>
            </div>
        </ion-accordion>
      </ion-accordion-group>
    </ion-radio-group>
    <p v-if="catalogLoading" class="ion-padding" data-testid="release-catalog-loading">{{ translate("Loading releases") }}</p>
    <ion-item v-else-if="catalogError" lines="none" data-testid="release-catalog-error"><ion-label class="ion-text-wrap">{{ translate("Could not load releases") }}</ion-label><ion-button slot="end" fill="clear" data-testid="release-catalog-retry-btn" @click="loadMoreAndCheck">{{ translate("Retry") }}</ion-button></ion-item>
    <ion-button v-else-if="hasMore" fill="clear" expand="block" data-testid="release-catalog-more-btn" @click="loadMoreAndCheck">{{ translate("Load more releases") }}</ion-button>
    <p v-if="!catalogError && !discoveryFailed && !refreshing && deployment?.available !== false && !versions.length" class="ion-padding" data-testid="version-picker-empty">{{ translate("No separately hosted versions are available. Use Default to follow the deployed build.") }}</p>
    <p v-if="saveFailed" class="ion-padding" role="alert" data-testid="version-picker-save-error">{{ translate("Could not confirm the version change. Refresh before trying again.") }}</p>
    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button :disabled="saving || refreshing || discoveryFailed || deployment?.available === false || selected === currentVersion || saveFailed" :aria-label="translate('Save')" data-testid="version-picker-save-btn" @click="save"><ion-spinner v-if="saving" /><ion-icon v-else :icon="saveOutline" /></ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import { IonAccordion, IonAccordionGroup, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonNote, IonRadio, IonRadioGroup, IonSpinner, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { chevronDownOutline, chevronUpOutline, closeOutline, openOutline, refreshOutline, saveOutline } from "ionicons/icons";
import { computed, onMounted, ref } from "vue";
import type { AppDeployment } from "@/utils/appVersionOptions";
import { useAppReleaseDetails } from "@/composables/useAppReleaseDetails";

const props = defineProps<{ appId: string; appName: string; environmentLabel: string; environmentTypeId: string; deployment?: AppDeployment; discoveryError?: boolean; onRefresh?: () => Promise<AppDeployment>; onCheck?: (versions: string[], fresh: boolean) => Promise<AppDeployment>; versions: string[]; currentVersion: string; onSave: (version: string) => Promise<boolean> }>();
const deployment = ref(props.deployment);
const versions = ref(props.versions);
const discoveryFailed = ref(Boolean(props.discoveryError));
const refreshing = ref(false);
const selected = ref(props.currentVersion);
const expandedVersion = ref<string>();
const saving = ref(false);
const saveFailed = ref(false);
const { releases, releaseVersions, catalogLoading, catalogError, hasMore, loadMore, loadRelease, loadReleases } = useAppReleaseDetails(props.appId, props.versions);
const displayedVersions = computed(() => [...new Set([...versions.value, ...(props.currentVersion ? [props.currentVersion] : []), ...releaseVersions.value])]);
const environmentMismatch = computed(() => {
  const actual = deployment.value?.configuredEnvironmentTypeId;
  if(!actual || actual === props.environmentTypeId) {return null;}

  return ({ AppEnvDev: "Dev", AppEnvUAT: "UAT", AppEnvProd: "Prod" } as Record<string, string>)[actual] || actual;
});
onMounted(async () => {
  if(props.onCheck) {refreshing.value = true;}
  await loadReleases();
  refreshing.value = false;
  if(props.onCheck) {await refreshDeployment(false);}
});
async function loadMoreAndCheck() {
  await loadMore();
  if(props.onCheck) {await refreshDeployment(false);}
}
async function refreshAll() {
  if(refreshing.value || saving.value) {return;}
  if(props.onCheck) {
    refreshing.value = true;
    try {await loadReleases(true);} finally {refreshing.value = false;}
  }
  await refreshDeployment(true);
}

function selectVersion(version: string) {
  if(!saving.value && !refreshing.value && !discoveryFailed.value && versions.value.includes(version)) {selected.value = version;}
}

async function refreshDeployment(fresh = true) {
  if((!props.onRefresh && !props.onCheck) || refreshing.value || saving.value) {return;}
  refreshing.value = true;
  try {
    deployment.value = props.onCheck ? await props.onCheck([...new Set([...releaseVersions.value, ...versions.value, ...(props.currentVersion ? [props.currentVersion] : [])])], fresh) : await props.onRefresh!();
    versions.value = deployment.value.versions;
    discoveryFailed.value = false;
    saveFailed.value = false;
    if(selected.value && !versions.value.includes(selected.value)) {selected.value = props.currentVersion;}
    await Promise.all(versions.value.map(loadRelease));
  } catch {
    versions.value = [];
    deployment.value = undefined;
    discoveryFailed.value = true;
  } finally {
    refreshing.value = false;
  }
}

async function save() {
  if(discoveryFailed.value || refreshing.value || deployment.value?.available === false || saving.value || saveFailed.value || selected.value === props.currentVersion || (selected.value && !versions.value.includes(selected.value))) {return;}
  saving.value = true;
  try {
    if(await props.onSave(selected.value)) {
      await modalController.dismiss({ saved: true });
    } else {
      saveFailed.value = true;
    }
  } catch {
    saveFailed.value = true;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
ion-content { --padding-bottom: calc(var(--spacer-base) * 4); }
ion-radio { width: 100%; }
.deployment-checked { max-width: 9rem; text-align: end; }
.release-brief { padding-inline-start: var(--spacer-base); }
.release-brief li + li { margin-top: var(--spacer-xs); }
</style>
