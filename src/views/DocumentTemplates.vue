<template>
  <ion-page>
    <ion-header><ion-toolbar>
      <ion-menu-button slot="start" />
      <ion-title>{{ translate("Document templates") }}</ion-title>
      <ion-buttons slot="end"><ion-button :disabled="refreshing" :aria-label="translate('Refresh')" @click="refreshTemplates" data-testid="document-templates-refresh-btn"><ion-icon slot="icon-only" :icon="refreshOutline" /></ion-button></ion-buttons>
    </ion-toolbar></ion-header>
    <ion-content>
      <ion-list v-if="!hydrated || (!synced && !loadError)" inset data-testid="document-templates-loading">
        <ion-item v-for="item in 3" :key="item"><ion-label><ion-skeleton-text animated /><p><ion-skeleton-text animated /></p></ion-label></ion-item>
      </ion-list>
      <ion-card v-if="loadError" data-testid="document-templates-error"><ion-card-content>{{ translate("Document templates could not be loaded. Refresh to try again.") }}</ion-card-content></ion-card>
      <div v-if="hydrated && synced && !templates.length" class="empty-state" data-testid="document-templates-empty"><p>{{ translate("No document templates are available on this instance.") }}</p></div>
      <ion-list v-if="hydrated && templates.length" inset data-testid="document-templates-list">
        <ion-item v-for="template in templates" :key="template.documentTemplateId" button detail :router-link="`/document-templates/${encodeURIComponent(template.documentTemplateId)}`" :data-testid="`document-template-${template.documentTemplateId}-row`">
          <ion-icon slot="start" :icon="documentTextOutline" />
          <ion-label>{{ template.displayName || template.documentType }}<p>{{ template.publishedVersionName ? translate("Current revision {revision}", { revision: template.publishedVersionName }) : translate("Using the standard template") }}</p><p>{{ translate("Latest revision {revision}", { revision: template.latestManifestVersionName }) }}</p></ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonSkeletonText, IonTitle, IonToolbar } from "@ionic/vue";
import { documentTextOutline, refreshOutline } from "ionicons/icons";
import { logger, serviceState, translate } from "@common";
import { useDocumentTemplates } from "@/composables/useDocumentTemplates";

const { templates, hydrated, synced, refresh } = useDocumentTemplates();
const refreshing = ref(false), failed = ref(false);
const loadError = computed(() => failed.value || serviceState.errors.documentTemplate || serviceState.errors.__start);
async function refreshTemplates() {
  refreshing.value = true;
  failed.value = false;
  try { await refresh(); } catch (error) { failed.value = true; logger.error("Failed to refresh document templates", error); }
  finally { refreshing.value = false; }
}
</script>
