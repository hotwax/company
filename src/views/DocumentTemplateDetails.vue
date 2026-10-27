<template>
  <ion-page>
    <ion-header><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button default-href="/document-templates" /></ion-buttons>
      <ion-title>{{ template?.displayName || translate("Document template") }}</ion-title>
      <ion-buttons slot="end"><ion-button :disabled="loading || publishing" :aria-label="translate('Refresh')" @click="reload(true)" data-testid="document-template-refresh-btn"><ion-icon slot="icon-only" :icon="refreshOutline" /></ion-button></ion-buttons>
    </ion-toolbar></ion-header>
    <ion-content>
      <ion-list v-if="loading && !history" inset data-testid="document-template-loading"><ion-item v-for="item in 3" :key="item"><ion-label><ion-skeleton-text animated /><p><ion-skeleton-text animated /></p></ion-label></ion-item></ion-list>
      <ion-card v-if="loadError" data-testid="document-template-error"><ion-card-content>{{ translate("Document template details could not be loaded. Refresh to try again.") }}</ion-card-content></ion-card>
      <template v-if="history">
        <ion-card>
          <ion-card-header><ion-card-title>{{ translate("Current template") }}</ion-card-title></ion-card-header>
          <ion-card-content><p>{{ currentPublished ? translate("Current revision {revision}", { revision: currentPublished }) : translate("Using the standard template") }}</p><p>{{ translate("Preview a saved revision with real documents before using it for printing.") }}</p></ion-card-content>
        </ion-card>
        <ion-list inset>
          <ion-item><ion-select :value="selectedVersion" :disabled="publishing || loading" :label="translate('Revision')" interface="popover" @ionChange="selectRevision(String($event.detail.value))" data-testid="document-template-revision-select">
            <ion-select-option v-for="revision in history.revisions" :key="versionOf(revision)" :value="versionOf(revision)">{{ revisionLabel(revision) }}</ion-select-option>
          </ion-select></ion-item>
          <ion-item v-if="selectedHistory"><ion-label>{{ selectedHistory.summary || translate("Saved revision") }}<p>{{ displayDate(selectedHistory.createdAt || selectedHistory.versionDate) }}</p></ion-label></ion-item>
          <ion-item><ion-select v-model="selectedSources" multiple :disabled="publishing || loading" :label="translate('Example documents')" :placeholder="translate('Select documents to preview')" interface="alert" data-testid="document-template-examples-select">
            <ion-select-option v-for="example in examples" :key="example.sourceId" :value="example.sourceId">{{ exampleLabel(example) }}</ion-select-option>
          </ion-select></ion-item>
          <ion-item v-if="!loading && !examples.length" data-testid="document-template-examples-empty"><ion-label>{{ translate("No eligible example documents were found. Add real source documents and refresh.") }}</ion-label></ion-item>
          <ion-item lines="none"><ion-button :disabled="!revision || !selectedSources.length || generating || publishing || previewPending || loading || loadError" @click="generatePreview" data-testid="document-template-preview-btn"><ion-spinner v-if="generating" name="crescent" />{{ translate("Generate preview") }}</ion-button></ion-item>
        </ion-list>

        <ion-card v-if="preview || previewError || generating">
          <ion-card-header><ion-card-title>{{ translate("Preview") }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <p v-if="previewPending || generating" data-testid="document-template-preview-loading"><ion-spinner name="crescent" /> {{ translate("Preparing your document preview…") }}</p>
            <p v-if="previewError" data-testid="document-template-preview-error"><ion-text color="danger">{{ previewError }}</ion-text></p>
            <template v-if="preview?.status === 'ready' && !expired">
              <p>{{ translate("Review the pages and PDF before using this revision.") }}</p>
              <p v-if="artifactsLoading" data-testid="document-template-artifacts-loading"><ion-spinner name="crescent" /> {{ translate("Loading preview files…") }}</p>
              <ion-button v-if="pdfUrl" fill="outline" :href="pdfUrl" target="_blank" rel="noopener" data-testid="document-template-pdf-btn">{{ translate("Open PDF") }}<ion-icon slot="end" :icon="openOutline" /></ion-button>
              <ion-select v-if="pageArtifacts.length > 1" v-model="selectedPage" :label="translate('Preview page')" interface="popover" data-testid="document-template-page-select"><ion-select-option v-for="artifact in pageArtifacts" :key="artifact.pageNumber" :value="artifact.pageNumber">{{ translate("Page {page}", { page: artifact.pageNumber }) }}</ion-select-option></ion-select>
              <img v-if="imageUrl" :src="imageUrl" :alt="translate('Document preview, page {page}', { page: selectedPage })" class="document-preview" data-testid="document-template-preview-image" />
            </template>
            <ion-button v-if="preview && (previewError || !previewPending) && preview.status !== 'ready' && !expired" fill="clear" :disabled="generating" @click="checkPreview" data-testid="document-template-preview-status-btn">{{ translate("Check preview status") }}</ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="canPublish">
          <ion-card-header><ion-card-title>{{ rollbackPublication ? translate("Restore a previous revision") : translate("Use this revision") }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <p v-if="rollbackPublication">{{ translate("This will restore the reviewed revision for future printing.") }}</p>
            <p v-else>{{ translate("This revision will be used for future printing.") }}</p>
            <p v-if="conflict" data-testid="document-template-conflict-error"><ion-text color="danger">{{ translate("The current template changed. Refresh, review the current revision, and preview again.") }}</ion-text></p>
            <p v-if="publicationMessage" data-testid="document-template-publication-message">{{ publicationMessage }}</p>
          </ion-card-content>
          <ion-item><ion-textarea v-model="reason" :disabled="publishing" :maxlength="500" :label="translate('Reason for change')" label-placement="stacked" :auto-grow="true" data-testid="document-template-reason-input" /></ion-item>
          <ion-item lines="none"><ion-button :disabled="!canPublishSelected" @click="confirmPublication" data-testid="document-template-use-revision-btn"><ion-spinner v-if="publishing" name="crescent" />{{ rollbackPublication ? translate("Restore this revision") : translate("Use this revision") }}</ion-button></ion-item>
        </ion-card>
        <ion-card v-else><ion-card-content>{{ translate("You can review templates. Publishing requires additional permission.") }}</ion-card-content></ion-card>

        <ion-list inset data-testid="document-template-history-list">
          <ion-list-header>{{ translate("Publication history") }}</ion-list-header>
          <ion-item v-if="!history.publications?.length" data-testid="document-template-history-empty"><ion-label>{{ translate("No revisions have been published yet.") }}</ion-label></ion-item>
          <ion-item v-for="publication in history.publications" :key="publication.publicationEventId" :data-testid="`document-template-publication-${publication.publicationEventId}-row`">
            <ion-label>{{ translate("Revision {revision}", { revision: publication.manifestVersionName || translate('Unavailable') }) }}<p>{{ displayDate(publication.changedAt) }}</p><p v-if="publication.reason">{{ publication.reason }}</p></ion-label>
            <ion-button v-if="canPublish && publication.manifestVersionName" slot="end" fill="clear" :disabled="publishing || loading || publication.manifestVersionName === currentPublished" @click="reviewRollback(publication)" :data-testid="`document-template-restore-${publication.publicationEventId}-btn`">{{ translate("Review for restore") }}</ion-button>
          </ion-item>
        </ion-list>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonText, IonTextarea, IonTitle, IonToolbar, alertController, onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";
import { openOutline, refreshOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import { useDocumentTemplateActions, useDocumentTemplates } from "@/composables/useDocumentTemplates";
import { useAuth } from "@/composables/useSecurity";
import Actions from "@/authorization/actions";
import { isCacheReconciliationError } from "@/utils/db/cacheReconciliationError";
import { canUseDocumentPreview, documentErrorCode, type DocumentPreview, type DocumentRevision } from "@/utils/documentTemplates";

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
const revisionLabel = (item: any) => translate("Revision {revision}", { revision: versionOf(item) }) +
  (versionOf(item) === currentPublished.value ? ` · ${translate("Current")}` : "");
const exampleLabel = (example: any) => {
  const scenario = example.scenario;
  const traits = typeof scenario === "string" ? [scenario] : [
    scenario?.wrappedLineCount > 0 ? translate("Gift wrapped") : "",
    scenario?.componentLineCount > 0 ? translate("Contains kit components") : "",
    scenario?.hasShipment === false ? translate("Before shipment") : "",
  ];
  return [example.label, ...traits].filter(Boolean).join(" · ");
};

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
.document-preview { display: block; max-width: 100%; height: auto; margin-top: var(--spacer-base); }
</style>
