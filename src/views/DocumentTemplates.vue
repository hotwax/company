<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Document Templates") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="loading" :aria-label="translate('Refresh')" data-testid="document-templates-refresh-btn" @click="refresh()">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-progress-bar v-if="loading" type="indeterminate" />
    </ion-header>

    <ion-content>
      <p class="ion-padding-horizontal">{{ translate("Each document prints with its live template. Open one to read and edit its code, save revisions, preview them on a real shipment or pick list, and choose which revision prints.") }}</p>

      <template v-if="!documentTemplates.length && (!hydrated || loading || !loaded) && !error">
        <ion-card v-for="n in 3" :key="n" data-testid="document-templates-loading">
          <ion-card-header><ion-skeleton-text animated style="width: 40%" /></ion-card-header>
          <ion-card-content><ion-skeleton-text animated style="width: 70%" /></ion-card-content>
        </ion-card>
      </template>
      <div v-else-if="!documentTemplates.length && error" class="empty-state" data-testid="document-templates-error">
        <p>{{ translate("Document templates could not be loaded.") }}</p>
        <ion-button fill="outline" @click="refresh()">{{ translate("Try again") }}</ion-button>
      </div>
      <div v-else-if="!documentTemplates.length" class="empty-state" data-testid="document-templates-empty">
        <p>{{ translate("No document templates found") }}</p>
      </div>
      <ion-item v-if="documentTemplates.length && error" lines="none" data-testid="document-templates-stale-error">
        <ion-icon slot="start" color="warning" :icon="warningOutline" />
        <ion-label class="ion-text-wrap">{{ translate("Document templates could not be refreshed. Showing the last loaded versions.") }}</ion-label>
      </ion-item>
      <div v-if="documentTemplates.length" class="document-templates">
        <ion-card v-for="template in documentTemplates" :key="template.documentTypeId" button
          :router-link="`/document-templates/${template.documentTypeId}`" :data-testid="`document-templates-${template.documentTypeId}-card`">
          <ion-card-header>
            <ion-card-title>{{ template.description || template.documentTypeId }}</ion-card-title>
          </ion-card-header>
          <ion-list lines="none">
            <ion-item>
              <ion-label class="ion-text-wrap">
                {{ translate("Printing revision {revision} of the live template", { revision: template.liveVersionName || "-" }) }}
                <p v-if="template.liveVersionDate">{{ commonUtil.getDateAndTime(template.liveVersionDate) }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>{{ template.templates?.length === 1 ? translate("1 other template") : translate("{count} other templates", { count: template.templates?.length || 0 }) }}</ion-label>
            </ion-item>
          </ion-list>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, translate } from "@common";
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonProgressBar, IonSkeletonText, IonTitle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
import { refreshOutline, warningOutline } from "ionicons/icons";
import { useDocumentTemplates } from "@/composables/useDocumentTemplates";

const { documentTemplates, hydrated, loading, loaded, error, refresh } = useDocumentTemplates();

onIonViewWillEnter(() => {
  void refresh();
});
</script>

<style scoped>
.document-templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-items: start;
}
</style>
