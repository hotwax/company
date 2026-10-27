<template>
  <ion-page>
    <ion-header><ion-toolbar>
      <ion-menu-button slot="start" />
      <ion-title>{{ translate("Document templates") }}</ion-title>
      <ion-buttons slot="end"><ion-button :disabled="refreshing" :aria-label="translate('Refresh')" @click="refreshTemplates" data-testid="document-templates-refresh-btn"><ion-icon slot="icon-only" :icon="refreshOutline" /></ion-button></ion-buttons>
    </ion-toolbar></ion-header>
    <ion-content>
      <div class="catalog-intro"><div><h1>{{ translate("Documents your team prints") }}</h1><p>{{ translate("Review a template, preview real documents, and choose the revision used for printing.") }}</p></div><ion-note v-if="synced">{{ translate("{count} templates", { count: templates.length }) }}</ion-note></div>
      <ion-list v-if="!hydrated || (!synced && !loadError)" inset data-testid="document-templates-loading"><ion-item v-for="item in 3" :key="item"><ion-label><ion-skeleton-text animated /><p><ion-skeleton-text animated /></p></ion-label></ion-item></ion-list>
      <ion-card v-if="loadError" data-testid="document-templates-error"><ion-card-content role="alert">{{ translate("Document templates could not be loaded. Refresh to try again.") }}</ion-card-content></ion-card>
      <div v-if="hydrated && synced && !templates.length" class="empty-state" data-testid="document-templates-empty"><p>{{ translate("No document templates are available on this instance.") }}</p></div>
      <main v-if="hydrated && templates.length" class="template-catalog" data-testid="document-templates-list">
        <ion-card v-for="template in templates" :key="template.documentTemplateId" button :router-link="`/document-templates/${encodeURIComponent(template.documentTemplateId)}`" :aria-label="catalogActionLabel(template)" :data-testid="`document-template-${template.documentTemplateId}-row`">
          <ion-card-header><div class="template-heading"><ion-icon class="template-icon" :icon="typeIcons[template.documentType] || documentTextOutline" aria-hidden="true" /><ion-chip outline>{{ template.publishedVersionName ? translate("In use") : translate("Standard template") }}</ion-chip></div><ion-card-title>{{ template.displayName || template.documentType }}</ion-card-title></ion-card-header>
          <ion-card-content><p class="template-purpose">{{ templateDescription(template.documentType) }}</p><div class="template-revisions"><div><span>{{ translate("Current printing") }}</span><strong>{{ template.publishedVersionName ? translate("Revision {revision}", { revision: template.publishedVersionName }) : translate("Standard template") }}</strong></div><div><span>{{ translate("Latest saved") }}</span><strong>{{ translate("Revision {revision}", { revision: template.latestManifestVersionName }) }}</strong></div></div><p class="revision-notice" v-if="template.publishedVersionName && template.latestManifestVersionName !== template.publishedVersionName">{{ translate("A newer revision is available to review") }}</p><div class="review-link">{{ translate("Review template") }}<ion-icon :icon="arrowForwardOutline" aria-hidden="true" /></div></ion-card-content>
        </ion-card>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPage, IonSkeletonText, IonTitle, IonToolbar } from "@ionic/vue";
import { arrowForwardOutline, documentTextOutline, layersOutline, listOutline, receiptOutline, refreshOutline } from "ionicons/icons";
import { logger, serviceState, translate } from "@common";
import { useDocumentTemplates } from "@/composables/useDocumentTemplates";

const typeIcons: Record<string, string> = { PACKING_SLIP: receiptOutline, PICKLIST: listOutline, WAREHOUSE_PICKLIST: layersOutline, WAREHOUSE_ORDER: documentTextOutline };
function catalogActionLabel(template: any) {
  return translate("Review {name}. Current printing: {current}. Latest saved: {latest}.", {
    name: template.displayName || template.documentType,
    current: template.publishedVersionName ? translate("Revision {revision}", { revision: template.publishedVersionName }) : translate("Standard template"),
    latest: translate("Revision {revision}", { revision: template.latestManifestVersionName }),
  });
}
function templateDescription(type: string) {
  switch (type) {
    case "PACKING_SLIP": return translate("Packing slips for a shipment, ready for the packing station.");
    case "PICKLIST": return translate("Picking documents prepared from a picklist.");
    case "WAREHOUSE_PICKLIST": return translate("Packing slips for the orders in a warehouse picklist.");
    case "WAREHOUSE_ORDER": return translate("Warehouse packing slips prepared for selected orders.");
    default: return translate("Review saved revisions and preview real documents before printing.");
  }
}
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
<style scoped>
.catalog-intro { max-width: 75rem; margin: var(--spacer-lg) auto var(--spacer-base); padding-inline: var(--spacer-base); display: flex; align-items: end; justify-content: space-between; gap: var(--spacer-base); }
.catalog-intro h1 { font-size: 1.5rem; margin: 0 0 var(--spacer-xs); }
.catalog-intro p { margin: 0; color: var(--ion-color-medium-shade); max-width: 42rem; line-height: 1.5; }
.catalog-intro ion-note { white-space: nowrap; }
.template-catalog { max-width: 75rem; margin: 0 auto; padding: 0 var(--spacer-base) var(--spacer-lg); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--spacer-base); }
.template-catalog ion-card { margin: 0; }
.template-catalog ion-card:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
.template-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacer-sm); }
.template-icon { font-size: var(--spacer-lg); color: var(--ion-color-primary); }
.template-heading ion-chip { margin: 0; }
.template-catalog ion-card-title { font-size: 1.25rem; }
.template-purpose { min-height: 3em; line-height: 1.5; color: var(--ion-color-medium-shade); }
.template-revisions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacer-sm); padding-block: var(--spacer-sm); margin-top: var(--spacer-sm); border-top: 1px solid var(--ion-border-color, var(--ion-color-light-shade)); }
.template-revisions span { display: block; color: var(--ion-color-medium-shade); font-size: 0.8125rem; margin-bottom: var(--spacer-2xs); }
.template-revisions strong { font-weight: 500; }
.revision-notice { color: var(--ion-color-primary); font-size: 0.8125rem; }
.review-link { display: flex; align-items: center; gap: var(--spacer-xs); color: var(--ion-color-primary); margin-top: var(--spacer-sm); font-weight: 500; min-height: 2.75rem; }
@media (max-width: 767px) { .template-catalog { grid-template-columns: minmax(0, 1fr); gap: var(--spacer-sm); } .catalog-intro { align-items: start; flex-direction: column; gap: var(--spacer-xs); } }
@media (max-width: 480px) { .catalog-intro, .template-catalog { padding-inline: var(--spacer-sm); } }
</style>
