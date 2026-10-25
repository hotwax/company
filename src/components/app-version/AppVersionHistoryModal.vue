<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ translate("Version history") }}</ion-title>
      <ion-buttons slot="start">
        <ion-button :aria-label="translate('Close')" data-testid="app-version-history-close-btn" @click="modalController.dismiss()"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <ion-item lines="full" class="history-summary">
      <ion-label><h1>{{ appName }}</h1><p>{{ translate("UAT and Prod, newest first") }}</p></ion-label>
    </ion-item>
    <ion-list v-if="changes.length" class="ion-no-padding" data-testid="app-version-history-list">
      <ion-item v-for="change in changes" :key="change.auditHistorySeqId" class="version-change">
        <ion-icon slot="start" :icon="change.pkSecondaryValue === 'AppEnvProd' ? rocketOutline : flaskOutline" :color="change.pkSecondaryValue === 'AppEnvProd' ? 'primary' : 'medium'" aria-hidden="true" />
        <ion-label class="change-content">
          <h2 class="version-transition"><span>{{ change.oldValueText || translate("Default") }}</span><ion-note>{{ translate("to") }}</ion-note><span>{{ change.newValueText || translate("Default") }}</span></h2>
          <p>{{ change.pkSecondaryValue === 'AppEnvProd' ? translate("Prod") : translate("UAT") }} {{ translate("by") }} {{ usernames[change.changedByUserId || ""] || (loading ? translate("Loading username") : translate("Username unavailable")) }}</p>
        </ion-label>
        <ion-note slot="end" class="change-time">{{ commonUtil.getDateAndTime(change.changedDate) }}</ion-note>
      </ion-item>
    </ion-list>
    <div v-if="loading" class="ion-padding ion-text-center" data-testid="app-version-history-loading"><ion-spinner /><p>{{ translate("Loading version history") }}</p></div>
    <div v-else-if="error" class="ion-padding ion-text-center" data-testid="app-version-history-error">
      <p>{{ translate("Could not load version history") }}</p>
      <ion-button fill="clear" data-testid="app-version-history-retry-btn" @click="loadMore">{{ translate("Retry") }}</ion-button>
    </div>
    <div v-else-if="!changes.length && !hasMore" class="empty-state" data-testid="app-version-history-empty">
      <ion-icon :icon="timeOutline" /><p>{{ translate("No recorded version changes") }}</p><ion-note>{{ translate("UAT and Prod version changes will appear here.") }}</ion-note>
    </div>
    <div v-if="hasMore && !loading && !error" class="ion-text-center ion-padding"><ion-button fill="clear" data-testid="app-version-history-more-btn" @click="loadMore">{{ translate("Load more") }}</ion-button></div>
  </ion-content>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSpinner, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline, flaskOutline, rocketOutline, timeOutline } from "ionicons/icons";
import { onMounted } from "vue";
import { useAppVersionHistory } from "@/composables/useAppVersionHistory";

const props = defineProps<{ appId: string; appName: string }>();
const { changes, usernames, loading, error, hasMore, loadMore } = useAppVersionHistory(props.appId);
onMounted(loadMore);
</script>

<style scoped>
.history-summary { --padding-top: var(--spacer-xs); --padding-bottom: var(--spacer-xs); }
.version-change { --min-height: 80px; }
.change-content { min-width: 0; }
.change-time { max-width: 7rem; text-align: end; }
.version-transition { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacer-xs); }
.version-transition span { overflow-wrap: anywhere; }
</style>
