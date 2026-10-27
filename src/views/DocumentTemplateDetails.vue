<template>
  <ion-page>
    <ion-header><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button default-href="/document-templates" /></ion-buttons>
      <ion-title>{{ template?.displayName || translate("Document template") }}</ion-title>
      <ion-buttons slot="end"><ion-button :disabled="loading || publishing" :aria-label="translate('Refresh')" @click="reload(true)" data-testid="document-template-refresh-btn"><ion-icon slot="icon-only" :icon="refreshOutline" /></ion-button></ion-buttons>
    </ion-toolbar></ion-header>
    <ion-content>
      <ion-list v-if="loading && !history" inset data-testid="document-template-loading"><ion-item v-for="item in 3" :key="item"><ion-label><ion-skeleton-text animated /><p><ion-skeleton-text animated /></p></ion-label></ion-item></ion-list>
      <ion-card v-if="loadError" data-testid="document-template-error"><ion-card-content role="alert">{{ translate("Document template details could not be loaded. Refresh to try again.") }}</ion-card-content></ion-card>
      <template v-if="history">
        <div class="review-intro">
          <p>{{ translate("Review a saved revision with real documents before changing what your team prints.") }}</p>
          <ion-chip outline><ion-icon :icon="checkmarkCircleOutline" color="primary" /><ion-label>{{ currentPublished ? translate("In use: revision {revision}", { revision: currentPublished }) : translate("Using the standard template") }}</ion-label></ion-chip>
        </div>
        <main class="review-workspace">
          <ion-card class="setup-card">
            <ion-card-header><ion-card-title>{{ translate("Review setup") }}</ion-card-title></ion-card-header>
            <ion-item lines="none">
              <ion-label><p>{{ translate("Selected revision") }}</p><h2>{{ translate("Revision {revision}", { revision: selectedVersion || '—' }) }}</h2></ion-label>
              <ion-button slot="end" fill="clear" size="default" :disabled="publishing || loading" :aria-label="translate('Choose a saved revision')" @click="openRevisionPicker" data-testid="document-template-revision-select">{{ translate("Change") }}<ion-icon slot="end" :icon="chevronDownOutline" /></ion-button>
            </ion-item>
            <ion-card-content class="revision-summary">
              <p v-if="selectedHistory">{{ selectedHistory.summary || translate("Saved revision") }}</p>
              <p class="meta" v-if="selectedHistory">{{ displayDate(selectedHistory.createdAt || selectedHistory.versionDate) }}</p>
              <ion-note v-if="isCurrentSelected">{{ translate("This is the revision currently used for printing.") }}</ion-note>
            </ion-card-content>
            <ion-item lines="full"><ion-select v-model="selectedSources" multiple :disabled="publishing || loading" :label="sourceLabel" label-placement="stacked" :selected-text="selectedSources.length ? sourceSelectionText : undefined" :placeholder="translate('Choose real documents')" interface="alert" data-testid="document-template-examples-select">
              <ion-select-option v-for="example in examples" :key="example.sourceId" :value="example.sourceId">{{ exampleLabel(example) }}</ion-select-option>
            </ion-select></ion-item>
            <ion-card-content class="selected-examples" v-if="selectedExamples.length"><p v-for="example in selectedExamples" :key="example.sourceId">{{ exampleLabel(example) }}</p></ion-card-content>
            <ion-card-content v-else><p>{{ translate("Only documents you can access on this instance are available.") }}</p></ion-card-content>
            <ion-card-content v-if="!loading && !examples.length" data-testid="document-template-examples-empty"><p>{{ translate("No eligible example documents were found. Add real source documents and refresh.") }}</p></ion-card-content>
            <ion-card-content class="setup-action"><ion-button class="review-primary" expand="block" size="default" :disabled="!revision || !selectedSources.length || generating || publishing || previewPending || loading || loadError" @click="generatePreview" data-testid="document-template-preview-btn"><ion-spinner v-if="generating || previewPending" slot="start" name="crescent" />{{ generating || previewPending ? translate("Preparing preview…") : translate("Generate preview") }}</ion-button><p>{{ translate("Previewing does not change current printing.") }}</p></ion-card-content>
          </ion-card>

          <DocumentPreviewPane class="review-preview" :src="imageUrl" :pdf-url="pdfUrl" :revision="selectedVersion" :document-name="template?.displayName || translate('Document template')" :page-number="selectedPage" :page-count="preview?.pageCount || pageArtifacts.length" :pages="pageArtifacts" :busy="previewPending || generating || artifactsLoading" :error="previewError" :can-check="!!preview && (!!previewError || !previewPending) && preview.status !== 'ready' && !expired" @page-change="selectedPage = $event" @check-status="checkPreview" />

          <ion-card class="publication-card" v-if="canPublish">
            <ion-card-header><ion-card-title>{{ isCurrentSelected ? translate("Already in use") : rollbackPublication ? translate("Restore a previous revision") : translate("Use this revision") }}</ion-card-title></ion-card-header>
            <ion-card-content>
              <p v-if="isCurrentSelected" data-testid="document-template-already-current">{{ translate("Revision {revision} is already used for future printing. You can still preview it above.", { revision: selectedVersion }) }}</p>
              <p v-else :id="publicationHintId" data-testid="document-template-publication-hint">{{ publicationHint }}</p>
              <p v-if="conflict" role="alert" data-testid="document-template-conflict-error"><ion-text color="danger">{{ translate("The current template changed. Refresh, review the current revision, and preview again.") }}</ion-text></p>
              <p v-if="publicationMessage" role="status" aria-live="polite" data-testid="document-template-publication-message">{{ publicationMessage }}</p>
            </ion-card-content>
            <template v-if="!isCurrentSelected">
              <ion-item lines="none"><ion-textarea v-model="reason" :disabled="publishing" :maxlength="500" :label="translate('Reason for change')" label-placement="stacked" :auto-grow="true" data-testid="document-template-reason-input" /></ion-item>
              <ion-card-content><ion-button class="review-primary" expand="block" size="default" :disabled="!canPublishSelected" :aria-describedby="publicationHintId" @click="confirmPublication" data-testid="document-template-use-revision-btn"><ion-spinner v-if="publishing" slot="start" name="crescent" />{{ rollbackPublication ? translate("Restore this revision") : translate("Use this revision") }}</ion-button></ion-card-content>
            </template>
          </ion-card>
          <ion-card class="publication-card" v-else><ion-card-content>{{ translate("You can review templates. Publishing requires additional permission.") }}</ion-card-content></ion-card>

          <ion-card class="history-card" data-testid="document-template-history-list">
            <ion-card-header><ion-card-title>{{ translate("Publication history") }}</ion-card-title><p class="meta">{{ translate("Changes to the revision used for printing") }}</p></ion-card-header>
            <ion-card-content v-if="!publications.length" data-testid="document-template-history-empty">{{ translate("No revisions have been published yet.") }}</ion-card-content>
            <ion-accordion-group v-else>
              <ion-accordion v-for="(publication, index) in visiblePublications" :key="publication.publicationEventId" :value="String(publication.publicationEventId)" :data-testid="`document-template-publication-${publication.publicationEventId}-row`">
                <ion-item slot="header" lines="full"><ion-icon slot="start" :icon="timeOutline" /><ion-label class="ion-text-wrap"><h3>{{ translate("Revision {revision}", { revision: publication.manifestVersionName || translate('Unavailable') }) }}</h3><p>{{ displayDate(publication.changedAt) }}</p><p>{{ publicationKindLabel(index) }}</p></ion-label><ion-note v-if="isCurrentEvent(publication, index)" slot="end" class="current-event">{{ translate("Now in use") }}</ion-note></ion-item>
                <div slot="content" class="history-detail"><p v-if="publication.reason">{{ publication.reason }}</p><ion-button v-if="canPublish && publication.manifestVersionName && publication.manifestVersionName !== currentPublished" fill="outline" size="default" :disabled="publishing || loading" :aria-label="translate('Review revision {revision} from {date} for restore', { revision: publication.manifestVersionName, date: displayDate(publication.changedAt) })" @click="reviewRollback(publication)" :data-testid="`document-template-restore-${publication.publicationEventId}-btn`">{{ translate("Review for restore") }}</ion-button></div>
              </ion-accordion>
            </ion-accordion-group>
            <ion-button v-if="publications.length > 3" fill="clear" expand="block" size="default" @click="historyExpanded = !historyExpanded" data-testid="document-template-history-expand-btn">{{ historyExpanded ? translate("Show recent changes") : translate("Show all {count} changes", { count: publications.length }) }}</ion-button>
          </ion-card>
        </main>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { IonAccordion, IonAccordionGroup, IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonText, IonTextarea, IonTitle, IonToolbar, alertController, modalController, onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";
import { checkmarkCircleOutline, chevronDownOutline, refreshOutline, timeOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useDocumentTemplateActions, useDocumentTemplates } from "@/composables/useDocumentTemplates";
import { useAuth } from "@/composables/useSecurity";
import Actions from "@/authorization/actions";
import { isCacheReconciliationError } from "@/utils/db/cacheReconciliationError";
import { canUseDocumentPreview, documentErrorCode, documentPublicationKind, type DocumentPreview, type DocumentRevision } from "@/utils/documentTemplates";

import DocumentPreviewPane from "@/components/document-templates/DocumentPreviewPane.vue";
import DocumentRevisionModal from "@/components/document-templates/DocumentRevisionModal.vue";

const props = defineProps<{ documentTemplateId: string }>();
const { template, history, refresh, refreshHistory } = useDocumentTemplates(() => props.documentTemplateId);
const actions = useDocumentTemplateActions();
const { hasPermission } = useAuth();
const selectedVersion = ref("");
const revision = ref<DocumentRevision>();
const examples = ref<any[]>([]), selectedSources = ref<string[]>([]), previewSources = ref<string[]>([]);
const preview = ref<DocumentPreview>();
const loading = ref(false), loadError = ref(false), generating = ref(false), publishing = ref(false), conflict = ref(false), expired = ref(false);
const requiresRefresh = ref(false);
const previewError = ref(""), publicationMessage = ref(""), reason = ref("");
const pdfUrl = ref(""), imageUrl = ref(""), selectedPage = ref<number>(1), artifactsLoading = ref(false);
const rollbackPublication = ref<any>();
let generation = 0, pageGeneration = 0, pollCount = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined, expiryTimer: ReturnType<typeof setTimeout> | undefined;
let previewRequestKey = "", publicationRequestKey = "";
let active = false;
const currentPublished = computed(() => history.value?.publishedVersionName || template.value?.publishedVersionName);
const canPublish = computed(() => hasPermission(Actions.APP_DOCUMENT_TEMPLATE_PUBLISH) && (history.value?.canPublish ?? template.value?.canPublish) === true);
const versionOf = (item: any) => String(item?.manifestVersionName || item?.versionName || "");
const selectedHistory = computed(() => history.value?.revisions?.find((item: any) => versionOf(item) === selectedVersion.value));
const previewPending = computed(() => !!preview.value && ["queued", "running", "rendering", "dispatching"].includes(preview.value.status));
const pageArtifacts = computed(() => (preview.value?.artifacts || []).filter((item) => item.mimeType === "image/png").sort((a, b) => Number(a.pageNumber) - Number(b.pageNumber)));
const canPublishSelected = computed(() => canPublish.value && !publishing.value && !loading.value && !loadError.value && !artifactsLoading.value && !conflict.value && !requiresRefresh.value && !expired.value && !!imageUrl.value && !!pdfUrl.value && !!reason.value.trim() && selectedVersion.value !== currentPublished.value &&
  canUseDocumentPreview(revision.value, preview.value, previewSources.value, selectedSources.value, Date.now()));
const displayDate = (value: any) => commonUtil.getDateAndTime(commonUtil.parseDateTimeValue(value)?.toMillis());
const exampleLabel = (example: any) => {
  const scenario = example.scenario;
  const traits = typeof scenario === "string" ? [scenario] : [
    scenario?.wrappedLineCount > 0 ? translate("Gift wrapped") : "",
    scenario?.componentLineCount > 0 ? translate("Contains kit components") : "",
    scenario?.hasShipment === false ? translate("Before shipment") : "",
  ];
  return [example.label, ...traits].filter(Boolean).join(" · ");
};

const isCurrentSelected = computed(() => !!selectedVersion.value && selectedVersion.value === currentPublished.value);
const selectedExamples = computed(() => examples.value.filter((example) => selectedSources.value.includes(example.sourceId)));
const sourceLabel = computed(() => {
  switch (template.value?.documentType) {
    case "WAREHOUSE_PICKLIST": return translate("Warehouse picklist");
    case "WAREHOUSE_ORDER": return translate("Orders");
    case "PACKING_SLIP": return translate("Shipment");
    case "PICKLIST": return translate("Picklist");
    default: return translate("Example documents");
  }
});
const sourceSelectionText = computed(() => selectedSources.value.length === 1 ? translate("1 document selected") : translate("{count} documents selected", { count: selectedSources.value.length }));
const publicationHintId = `document-publication-hint-${props.documentTemplateId}`;
const publicationHint = computed(() => {
  if (conflict.value || requiresRefresh.value) return translate("Refresh to review the current template before continuing.");
  if (loading.value) return translate("Loading the selected revision…");
  if (!selectedSources.value.length) return translate("Select real documents to preview this revision.");
  if (generating.value || previewPending.value || artifactsLoading.value) return translate("Wait for the preview to finish, then review the document.");
  if (!preview.value || !imageUrl.value || !pdfUrl.value || expired.value || previewError.value) return translate("Generate and review a matching preview before using this revision.");
  if (!reason.value.trim()) return translate("Add a reason so this change is clear in publication history.");
  return translate("Ready to use after confirmation.");
});
const historyExpanded = ref(false);
const publications = computed<any[]>(() => history.value?.publications || []);
const visiblePublications = computed(() => historyExpanded.value ? publications.value : publications.value.slice(0, 3));
const isCurrentEvent = (publication: any, index: number) => publication.manifestVersionName === currentPublished.value &&
  (history.value?.publicationSequence == null ? index === 0 : Number(publication.publicationSequence) === Number(history.value.publicationSequence));
const publicationKindLabel = (index: number) => {
  const kind = documentPublicationKind(publications.value, index);
  return kind === "return" ? translate("Returned to this revision") : kind === "repeat" ? translate("Published again") : translate("Set for printing");
};
async function openRevisionPicker() {
  if (publishing.value || loading.value || !history.value) return;
  const modal = await modalController.create({ component: DocumentRevisionModal, componentProps: {
    revisions: history.value.revisions, selectedVersion: selectedVersion.value, publishedVersionName: currentPublished.value,
  } });
  const dismissed = modal.onDidDismiss();
  await modal.present();
  const { data } = await dismissed;
  if (data?.manifestVersionName && data.manifestVersionName !== selectedVersion.value) await selectRevision(String(data.manifestVersionName));
}

function releaseArtifacts() {
  pageGeneration++;
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  pdfUrl.value = imageUrl.value = "";
  artifactsLoading.value = false;
}
function clearPreview() {
  generation++;
  clearTimeout(pollTimer); clearTimeout(expiryTimer);
  releaseArtifacts();
  preview.value = undefined; previewSources.value = []; previewError.value = "";
  expired.value = false; generating.value = false; pollCount = 0;
  previewRequestKey = publicationRequestKey = "";
}

async function selectRevision(version: string, publication?: any) {
  if (publishing.value) return;
  clearPreview();
  const token = generation;
  selectedVersion.value = version; revision.value = undefined;
  rollbackPublication.value = publication; publicationMessage.value = ""; reason.value = "";
  if (!version) return;
  loading.value = true;
  try {
    const result = await actions.readRevision(props.documentTemplateId, version);
    if (token === generation && active) revision.value = result;
  } catch (error) {
    if (token === generation) { previewError.value = translate("The selected revision could not be loaded. Refresh to try again."); logger.error("Failed to read document revision", error); }
  } finally { if (token === generation) loading.value = false; }
}

async function reload(all = false) {
  if (publishing.value) return;
  clearPreview(); loading.value = true; loadError.value = false;
  const token = generation;
  try {
    await (all ? refresh() : refreshHistory());
    const result = await actions.examples(props.documentTemplateId);
    if (token !== generation || !active) return;
    if (!Array.isArray(result.examples)) throw new Error("Unexpected document examples");
    examples.value = result.examples;
    selectedSources.value = selectedSources.value.filter((id) => examples.value.some((item) => item.sourceId === id));
    conflict.value = false; requiresRefresh.value = false; publicationMessage.value = "";
    const first = history.value?.revisions?.[0];
    const version = history.value?.revisions?.some((item: any) => versionOf(item) === selectedVersion.value) ? selectedVersion.value :
      (history.value?.latestManifestVersionName || template.value?.latestManifestVersionName || versionOf(first));
    await selectRevision(version);
  } catch (error) { if (token === generation) { loadError.value = true; logger.error("Failed to load document template", error); } }
  finally { loading.value = false; }
}

watch(selectedSources, () => { clearPreview(); publicationMessage.value = ""; }, { deep: true, flush: "sync" });
watch(selectedPage, () => { if (preview.value?.status === "ready" && !expired.value) void loadImage(generation); });

async function loadImage(token: number) {
  const artifact = pageArtifacts.value.find((item) => item.pageNumber === selectedPage.value);
  if (!artifact) return;
  const pageToken = ++pageGeneration;
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = ""; artifactsLoading.value = true;
  try {
    const blob = await actions.artifactBlob(artifact);
    if (token === generation && pageToken === pageGeneration && active) imageUrl.value = URL.createObjectURL(blob);
  } catch (error) { if (token === generation) { previewError.value = translate("Preview files could not be loaded. Generate a new preview."); logger.error("Failed to load document image", error); } }
  finally { if (token === generation && pageToken === pageGeneration) artifactsLoading.value = false; }
}

async function acceptPreview(result: DocumentPreview, token: number) {
  if (token !== generation || !active) return;
  preview.value = result;
  if (result.status === "expired" || Number(result.expiresAt) <= Date.now()) {
    expired.value = true; releaseArtifacts(); previewError.value = translate("This preview expired. Generate a new preview before continuing."); return;
  }
  if (result.status === "failed") { previewError.value = translate("The preview could not be generated. Check the source documents and try again."); return; }
  if (result.status === "ready") {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => {
      expired.value = true; releaseArtifacts(); previewError.value = translate("This preview expired. Generate a new preview before continuing.");
    }, Math.max(0, Number(result.expiresAt) - Date.now()));
    const pdf = result.artifacts?.find((item) => item.mimeType === "application/pdf");
    if (!pdf || !pageArtifacts.value.length) { previewError.value = translate("The preview is missing its PDF or page images. Generate a new preview."); return; }
    artifactsLoading.value = true;
    try {
      const blob = await actions.artifactBlob(pdf);
      if (token !== generation || !active) return;
      if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
      pdfUrl.value = URL.createObjectURL(blob);
      selectedPage.value = pageArtifacts.value[0].pageNumber || 1;
      await loadImage(token);
    } catch (error) { if (token === generation) { previewError.value = translate("Preview files could not be loaded. Generate a new preview."); logger.error("Failed to load document PDF", error); } }
    finally { if (token === generation) artifactsLoading.value = false; }
  } else if (++pollCount <= 45) {
    pollTimer = setTimeout(() => { void checkPreview(); }, 2000);
  } else {
    previewError.value = translate("The preview is taking longer than expected. Check its status again shortly.");
  }
}

async function checkPreview() {
  if (!preview.value || generating.value) return;
  clearTimeout(pollTimer);
  previewError.value = "";
  const token = generation;
  try { await acceptPreview(await actions.readPreview(preview.value.previewId), token); }
  catch (error) { if (token === generation) { previewError.value = translate("The preview status could not be loaded. Check again or generate a new preview."); logger.error("Failed to read document preview", error); } }
}

async function generatePreview() {
  if (!revision.value || !selectedSources.value.length || generating.value || publishing.value || previewPending.value || loadError.value) return;
  clearTimeout(pollTimer); clearTimeout(expiryTimer); pollCount = 0;
  releaseArtifacts(); previewError.value = ""; preview.value = undefined; expired.value = false; generating.value = true;
  const token = ++generation;
  const sourceIds = [...selectedSources.value];
  previewRequestKey ||= crypto.randomUUID();
  try {
    const result = await actions.createPreview({ documentTemplateId: props.documentTemplateId, manifestVersionName: revision.value.manifestVersionName,
      manifestHash: revision.value.manifestHash, sourceIds, requestKey: previewRequestKey });
    if (token !== generation || !active) return;
    previewRequestKey = "";
    previewSources.value = sourceIds;
    await acceptPreview(result, token);
  } catch (error) { if (token === generation) { previewError.value = translate("The preview could not be generated. Check the source documents and try again."); logger.error("Failed to create document preview", error); } }
  finally { if (token === generation) generating.value = false; }
}

function reviewRollback(publication: any) { void selectRevision(String(publication.manifestVersionName), publication); }
async function confirmPublication() {
  if (!canPublishSelected.value) return;
  const alert = await alertController.create({
    header: rollbackPublication.value ? translate("Restore this revision") : translate("Use this revision"),
    message: translate("Future documents will use the revision you previewed."),
    buttons: [{ text: translate("Cancel"), role: "cancel" }, { text: translate("Confirm"), handler: () => { void publishRevision(); } }],
  });
  await alert.present();
}
async function publishRevision() {
  if (!canPublishSelected.value || !revision.value || !preview.value) return;
  publishing.value = true; publicationMessage.value = "";
  publicationRequestKey ||= crypto.randomUUID();
  try {
    // Recheck expiry/authority immediately before publishing; a counter conflict never becomes success.
    const freshPreview = await actions.readPreview(preview.value.previewId);
    if (!canUseDocumentPreview(revision.value, freshPreview, previewSources.value, selectedSources.value, Date.now())) {
      expired.value = true; previewError.value = translate("This preview is no longer ready. Generate a new preview before continuing."); return;
    }
    const shared = { expectedPublicationSequence: Number(revision.value.publicationSequence), reason: reason.value.trim(), requestKey: publicationRequestKey };
    await actions.publish(props.documentTemplateId, rollbackPublication.value ? {
      ...shared, publicationReceiptId: rollbackPublication.value.receiptId, publicationEventId: rollbackPublication.value.publicationEventId,
      replacementPreviewId: preview.value.previewId,
    } : { ...shared, manifestVersionName: revision.value.manifestVersionName, manifestHash: revision.value.manifestHash, previewId: preview.value.previewId }, !!rollbackPublication.value);
    clearPreview();
    publicationMessage.value = translate("The revision is now used for printing.");
    rollbackPublication.value = undefined; reason.value = "";
  } catch (error) {
    logger.error("Failed to publish document revision", error);
    if (isCacheReconciliationError(error)) {
      clearPreview(); requiresRefresh.value = true; publicationMessage.value = translate("The revision was saved, but this view could not be refreshed. Refresh before continuing.");
    } else if (["PUBLICATION_CONFLICT", "REVISION_CONFLICT"].includes(documentErrorCode(error))) { conflict.value = true; clearPreview(); }
    else { publicationMessage.value = translate("The change could not be confirmed. Refresh to check the current revision before trying again."); requiresRefresh.value = true; }
  } finally { publishing.value = false; }
}

onIonViewWillEnter(() => { active = true; void reload(); });
onIonViewDidLeave(() => { active = false; clearPreview(); });
onScopeDispose(() => { active = false; clearPreview(); });
</script>

<style scoped>
.review-intro { max-width: 90rem; margin: var(--spacer-base) auto var(--spacer-sm); padding-inline: var(--spacer-base); display: flex; align-items: center; justify-content: space-between; gap: var(--spacer-sm); }
.review-intro p { margin: 0; color: var(--ion-color-medium-shade); }
.review-intro ion-chip { flex-shrink: 0; margin: 0; }
.review-workspace { max-width: 90rem; margin: 0 auto; padding: 0 var(--spacer-base) var(--spacer-base); display: grid; grid-template-columns: minmax(20rem, 24rem) minmax(0, 1fr); grid-template-rows: min-content min-content 1fr; grid-template-areas: "setup preview" "publication preview" "history preview"; gap: var(--spacer-sm) var(--spacer-base); align-items: start; }
.review-workspace > ion-card { margin: 0; }
.setup-card { grid-area: setup; }
.review-preview { grid-area: preview; min-width: 0; position: sticky; top: var(--spacer-sm); }
.publication-card { grid-area: publication; }
.history-card { grid-area: history; min-width: 0; }
.review-workspace ion-card-title { font-size: 1.125rem; }
.revision-summary p + p { margin-top: var(--spacer-xs); }
.meta { color: var(--ion-color-medium-shade); font-size: 0.8125rem; margin-bottom: 0; }
.revision-summary ion-note { display: block; margin-top: var(--spacer-xs); }
.selected-examples { padding-bottom: 0; }
.selected-examples p { overflow-wrap: anywhere; font-size: 0.875rem; }
.setup-action p { font-size: 0.8125rem; color: var(--ion-color-medium-shade); text-align: center; margin-bottom: 0; }
.review-primary { min-height: 2.75rem; margin: 0; }
.setup-card ion-button { min-height: 2.75rem; }
.history-card ion-item { --padding-start: var(--spacer-sm); --inner-padding-end: var(--spacer-xs); }
.history-card ion-icon[slot="start"] { margin-right: var(--spacer-xs); font-size: 1.125rem; }
.history-card ion-label h3 { font-weight: 500; }
.history-card ion-label p { font-size: 0.8125rem; }
.current-event { color: var(--ion-color-primary); font-size: 0.75rem; text-align: end; max-width: 4rem; }
.history-detail { padding: var(--spacer-xs) var(--spacer-sm) var(--spacer-sm); font-size: 0.875rem; }
.history-detail ion-button, .history-card > ion-button { min-height: 2.75rem; }
@media (max-width: 991px) { .review-workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; grid-template-areas: "setup" "preview" "publication" "history"; max-width: 50rem; } .review-preview { position: static; } .review-intro { max-width: 50rem; align-items: start; flex-direction: column; } }
@media (max-width: 480px) { .review-workspace, .review-intro { padding-inline: var(--spacer-sm); } }
</style>
