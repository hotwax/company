<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/document-templates" />
        <ion-title>{{ documentTemplate?.description || documentTypeId }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="loading" :aria-label="translate('Refresh')" data-testid="document-template-refresh-btn" @click="refreshPage()">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-progress-bar v-if="loading || publishing || saving || deleting || text.loading.value" type="indeterminate" />
    </ion-header>

    <ion-content>
      <div v-if="!documentTemplate && (!hydrated || loading || !loaded) && !error" class="ion-padding" data-testid="document-template-loading">
        <ion-skeleton-text animated style="width: 50%" />
        <ion-skeleton-text animated style="width: 80%" />
      </div>
      <div v-else-if="!documentTemplate" class="empty-state" data-testid="document-template-error">
        <p>{{ error ? translate("Document templates could not be loaded.") : translate("This document type was not found.") }}</p>
        <ion-button fill="outline" @click="reload()">{{ translate("Try again") }}</ion-button>
      </div>

      <div v-else class="template-workspace">
        <!-- Which template and revision is open; the editor and preview below get the full width. -->
        <div class="template-picker">
          <ion-select :key="`template-${pickerKey}`" :label="translate('Template')" label-placement="stacked" fill="outline" interface="popover"
            :value="selection.templateName || LIVE" data-testid="document-template-select" @ionChange="pickTemplate($event.detail.value)">
            <ion-select-option :value="LIVE">{{ translate("Live template · prints now") }}</ion-select-option>
            <ion-select-option v-for="library in documentTemplate.templates" :key="library.templateName" :value="library.templateName">
              {{ library.templateName }}
            </ion-select-option>
          </ion-select>
          <ion-select :key="`revision-${pickerKey}`" :label="translate('Revision')" label-placement="stacked" fill="outline" interface="popover"
            :value="selection.versionName || text.text.value?.currentVersionName" :disabled="!revisions.versions.value.length"
            :placeholder="revisions.error.value ? translate('Revisions could not be loaded.') : translate('Loading…')"
            data-testid="document-template-revision-select" @ionChange="pickRevision($event.detail.value)">
            <ion-select-option v-for="revision in revisions.versions.value" :key="revision.versionName" :value="revision.versionName">
              {{ revisionOption(revision) }}
            </ion-select-option>
          </ion-select>
          <ion-button v-if="canAdmin" fill="outline" :disabled="saving" data-testid="document-template-new-btn" @click="newTemplate()">
            <ion-icon slot="start" :icon="addOutline" />{{ translate("New template") }}
          </ion-button>
        </div>

        <section class="template-editor">
          <ion-card data-testid="document-template-editor-card">
            <div class="editor-head">
              <div class="editor-title">
                <ion-card-subtitle>{{ selection.templateName ? translate("Template") : translate("Live template") }}</ion-card-subtitle>
                <ion-card-title>{{ selection.templateName || documentTemplate.description || documentTypeId }}</ion-card-title>
                <p v-if="text.text.value" class="secondary-label" data-testid="document-template-revision-label">
                  {{ translate("Revision {revision}", { revision: text.text.value.versionName }) }} ·
                  {{ !isLatest ? translate("an earlier revision") : selection.templateName ? translate("latest") : translate("printing now") }}
                </p>
              </div>
              <div v-if="canAdmin" class="editor-actions">
                <ion-button v-if="selection.templateName" :disabled="!dirty || saving" data-testid="document-template-save-btn" @click="saveRevision()">
                  <ion-icon slot="start" :icon="saveOutline" />{{ translate("Save revision") }}
                </ion-button>
                <ion-button fill="outline" :disabled="!text.text.value || saving" data-testid="document-template-save-copy-btn" @click="saveAsNewTemplate()">
                  <ion-icon slot="start" :icon="copyOutline" />{{ translate("Save as new template") }}
                </ion-button>
                <ion-button v-if="selection.templateName" fill="clear" color="danger" :disabled="!text.text.value || deleting || saving"
                  data-testid="document-template-delete-btn" @click="confirmDelete()">
                  <ion-icon slot="start" :icon="trashOutline" />{{ translate("Delete template") }}
                </ion-button>
                <ion-button v-if="publishAction" :disabled="!canPublish" :color="publishAction === 'rollback' ? 'warning' : 'success'"
                  data-testid="document-template-publish-btn" @click="confirmPublish()">
                  <ion-icon slot="start" :icon="publishAction === 'rollback' ? arrowUndoOutline : cloudUploadOutline" />
                  {{ publishAction === "rollback" ? translate("Restore this revision") : translate("Make live") }}
                </ion-button>
              </div>
            </div>
            <ion-item v-if="canAdmin && publishAction && !canPublish" lines="none" data-testid="document-template-publish-hint">
              <ion-icon slot="start" color="medium" :icon="informationCircleOutline" />
              <ion-label class="ion-text-wrap secondary-label">
                {{ dirty ? translate("Save your changes, then preview this revision to make it live.") : translate("Preview this revision to make it live.") }}
              </ion-label>
            </ion-item>

            <ion-segment :value="tab" data-testid="document-template-tabs" @ionChange="tab = $event.detail.value as Tab">
              <ion-segment-button value="code" data-testid="document-template-code-tab"><ion-label>{{ translate("Code") }}</ion-label></ion-segment-button>
              <ion-segment-button value="preview" data-testid="document-template-preview-tab"><ion-label>{{ translate("Preview") }}</ion-label></ion-segment-button>
            </ion-segment>

            <!-- Code -->
            <div v-show="tab === 'code'" class="tab-body">
              <ion-skeleton-text v-if="text.loading.value && !text.text.value" animated style="width: 100%; height: 320px" />
              <ion-item v-else-if="text.error.value" lines="none" data-testid="document-template-code-error">
                <ion-icon slot="start" color="danger" :icon="alertCircleOutline" />
                <ion-label class="ion-text-wrap">{{ translate("The code could not be loaded.") }}</ion-label>
              </ion-item>
              <template v-else-if="text.text.value">
                <p v-if="codeNote" class="code-note secondary-label" data-testid="document-template-code-note">{{ codeNote }}</p>
                <ion-item v-for="include in includes" :key="include.location" lines="none" class="code-note" data-testid="document-template-include">
                  <ion-icon slot="start" color="medium" :icon="documentAttachOutline" />
                  <ion-label class="ion-text-wrap secondary-label">
                    {{ translate("The layout is in {file}, a file other documents share, so it cannot be changed here.", { file: locationFile(include.location) }) }}
                  </ion-label>
                  <ion-button v-if="canAdmin" slot="end" fill="clear" @click="copyIncludeIn(include)">{{ translate("Copy it in to edit") }}</ion-button>
                </ion-item>
                <ion-item v-if="saveError" lines="none" data-testid="document-template-save-error">
                  <ion-icon slot="start" color="danger" :icon="alertCircleOutline" />
                  <ion-label class="ion-text-wrap">{{ saveError }}</ion-label>
                  <ion-button v-if="saveErrorLine" slot="end" fill="clear" @click="codeEditor?.goToLine(saveErrorLine)">
                    {{ translate("Go to line {line}", { line: saveErrorLine }) }}
                  </ion-button>
                </ion-item>
                <TemplateCodeEditor ref="codeEditor" v-model="code" :doc-key="codeKey" :readonly="!canAdmin" :label="translate('Template code')" :error-line="saveErrorLine" />
              </template>
            </div>

            <!-- Preview -->
            <div v-if="tab === 'preview'" class="tab-body">
              <p v-if="!canAdmin" class="secondary-label" data-testid="document-template-view-only">
                {{ translate("Previewing runs the template, so it needs template admin access.") }}
              </p>
              <template v-else>
                <ion-item v-if="dirty" lines="none" data-testid="document-template-preview-unsaved">
                  <ion-icon slot="start" color="warning" :icon="warningOutline" />
                  <ion-label class="ion-text-wrap">{{ translate("This shows the saved revision. Save your changes to preview them.") }}</ion-label>
                </ion-item>
                <ion-item lines="full" data-testid="document-template-sample">
                  <ion-label class="ion-text-wrap">
                    {{ translate("Preview with") }}
                    <p data-testid="document-template-sample-label">
                      {{ chosenSample ? sampleLabel(chosenSample)
                        : samples.loading.value ? translate("Loading…")
                        : samples.error.value ? translate("Recent documents could not be loaded. Choose an order.")
                        : isPicklist ? translate("No recent pick lists. Choose an order.") : translate("No recent shipments. Choose an order.") }}
                    </p>
                  </ion-label>
                  <ion-button slot="end" fill="outline" data-testid="document-template-choose-order-btn" @click="orderModalOpen = true">
                    <ion-icon slot="start" :icon="searchOutline" />{{ translate("Choose order") }}
                  </ion-button>
                </ion-item>

                <ion-skeleton-text v-if="previewLoading" animated style="width: 100%; height: 320px" data-testid="document-template-preview-loading" />
                <template v-else-if="result">
                  <ion-item lines="none">
                    <ion-badge slot="start" :color="result.rendered ? 'success' : 'danger'" data-testid="document-template-preview-status">
                      <template v-if="!result.rendered">{{ translate("No PDF") }}</template>
                      <template v-else-if="result.pageCount === 1">{{ translate("1 page") }}</template>
                      <template v-else>{{ translate("{count} pages", { count: result.pageCount || 0 }) }}</template>
                    </ion-badge>
                    <ion-label class="ion-text-wrap">
                      <template v-if="!result.templateErrors.length">{{ translate("No template errors") }}</template>
                      <template v-else-if="result.templateErrors.length === 1">{{ translate("1 template error that printing skips over") }}</template>
                      <template v-else>{{ translate("{count} template errors that printing skips over", { count: result.templateErrors.length }) }}</template>
                    </ion-label>
                  </ion-item>
                  <ion-list lines="full">
                    <ion-item v-for="(problem, index) in result.errors" :key="`error-${index}`" data-testid="document-template-preview-error">
                      <ion-icon slot="start" color="danger" :icon="alertCircleOutline" />
                      <ion-label class="ion-text-wrap">{{ problem.message }}</ion-label>
                    </ion-item>
                    <ion-item v-for="(problem, index) in result.templateErrors" :key="`template-error-${index}`" data-testid="document-template-preview-template-error">
                      <ion-icon slot="start" color="warning" :icon="warningOutline" />
                      <ion-label class="ion-text-wrap">
                        {{ problem.expression || problem.message }}
                        <p>
                          {{ templateErrorFile(problem) }}
                          <template v-if="problem.line"> · {{ translate("line {line}, column {column}", { line: problem.line, column: problem.column || 0 }) }}</template>
                        </p>
                        <p v-if="problem.expression">{{ problem.message }}</p>
                      </ion-label>
                    </ion-item>
                  </ion-list>
                  <iframe v-if="pdfUrl" class="pdf-frame" :src="pdfUrl" :title="translate('Preview PDF')" data-testid="document-template-preview-pdf" />
                </template>
              </template>
            </div>

            <ion-item v-if="publishError" lines="none" data-testid="document-template-publish-error">
              <ion-icon slot="start" color="danger" :icon="alertCircleOutline" />
              <ion-label class="ion-text-wrap">{{ publishError }}</ion-label>
            </ion-item>
          </ion-card>
        </section>
      </div>
      <PreviewOrderModal :is-open="orderModalOpen" :document-type-id="documentTypeId" :selected-id="sampleId" @close="orderModalOpen = false" @select="pickSample" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import { useSeedData } from "@common/db";
import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonProgressBar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSkeletonText, IonTitle, IonToolbar, alertController, onIonViewWillEnter } from "@ionic/vue";
import { addOutline, alertCircleOutline, arrowUndoOutline, cloudUploadOutline, copyOutline, documentAttachOutline, informationCircleOutline, refreshOutline, saveOutline, searchOutline, trashOutline, warningOutline } from "ionicons/icons";
import { computed, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useAuth } from "@/composables/useSecurity";
import { committedResult, useDocumentTemplate, useDocumentTemplateDelete, useDocumentTemplatePreview, useDocumentTemplatePublish, useDocumentTemplateSave, useDocumentTemplateText, useDocumentTemplateVersions, useDocumentTemplates, useSampleDocuments } from "@/composables/useDocumentTemplates";
import PreviewOrderModal from "@/components/document-templates/PreviewOrderModal.vue";
import TemplateCodeEditor from "@/components/document-templates/TemplateCodeEditor.vue";
import { errorLine, inlineInclude, isTemplateName, locationFile, publishActionFor, sameSelection, serverErrorMessage, suggestTemplateName, templateErrorFile, type DocumentTemplateVersion, type SampleDocument } from "@/utils/documentTemplates";
import Actions from "@/authorization/actions";
import { CACHE_RECONCILIATION_ERROR_MESSAGE, isCacheReconciliationError } from "@/utils/db/cacheReconciliationError";

type Tab = "code" | "preview";

const props = defineProps<{ documentTypeId: string }>();

const { hasPermission } = useAuth();
const canAdmin = computed(() => hasPermission(Actions.APP_DOCUMENT_TEMPLATES_ADMIN));
const seed = useSeedData();

const { loading, loaded, error, refresh } = useDocumentTemplates();
const { documentTemplate, hydrated } = useDocumentTemplate(() => props.documentTypeId);
const revisions = useDocumentTemplateVersions();
const text = useDocumentTemplateText();
const samples = useSampleDocuments();
const { result, previewed, pdfUrl, loading: previewLoading, preview, clear: clearPreview } = useDocumentTemplatePreview();
const { publish, publishing } = useDocumentTemplatePublish();
const { save, saving } = useDocumentTemplateSave();
const { remove, deleting } = useDocumentTemplateDelete();

// What is open: the live template (templateName "") or a named template, at its latest revision (versionName "")
// or an earlier one.
const selection = reactive({ templateName: "", versionName: "" });
const tab = ref<Tab>("code");
const code = ref("");
// Changes whenever the editor shows another revision's saved code, so its undo history starts over.
const codeKey = ref(0);
const saveError = ref("");
const publishError = ref("");
const sampleId = ref("");
// A document chosen from the order search, kept so its label shows even when it is not a recent one.
const pickedSample = ref<SampleDocument | null>(null);
const orderModalOpen = ref(false);
const codeEditor = ref<InstanceType<typeof TemplateCodeEditor> | null>(null);

const isPicklist = computed(() => props.documentTypeId === "PICKLIST");
const dirty = computed(() => !!text.text.value && code.value !== text.text.value.templateText);
const isLatest = computed(() => !!text.text.value && text.text.value.versionName === text.text.value.currentVersionName);
const saveErrorLine = computed(() => errorLine(saveError.value));
// Shared files the code still includes; once copied in, the include line is gone.
const includes = computed(() => (text.text.value?.includes || []).filter(include => code.value.includes(`"${include.location}"`)));
const codeNote = computed(() => {
  if(!canAdmin.value) {return "";}
  if(!selection.templateName) {return translate("Printing uses this code. Your changes are saved as a new template, which you can preview and then make live.");}
  return isLatest.value ? "" : translate("This is an earlier revision. Saving your changes adds a new revision after the latest one.");
});
// Make live only what was just previewed, exactly as chosen, with no unsaved changes.
const publishAction = computed(() => publishActionFor(selection, documentTemplate.value));
const canPublish = computed(() => !!publishAction.value && !dirty.value && !publishing.value && !previewLoading.value
  && !!result.value?.rendered && !!previewed.value && sameSelection(previewed.value, selection) && previewed.value.sourceId === sampleId.value);

// ion-select needs a value for the live template; a template name never contains an underscore.
const LIVE = "_live";
// Bumped to redraw the pickers when the user keeps unsaved changes instead of switching.
const pickerKey = ref(0);

function revisionOption(revision: DocumentTemplateVersion) {
  const mark = revision.isCurrent ? (selection.templateName ? translate("latest") : translate("printing")) : "";
  return [translate("Revision {revision}", { revision: revision.versionName }),
    revision.versionDate ? commonUtil.getDateAndTime(revision.versionDate) : "",
    revision.userId ? revisions.usernameFor(revision.userId) : "", mark].filter(Boolean).join(" · ");
}

async function pickTemplate(value: string) {
  await open(value === LIVE ? "" : value, "");
  pickerKey.value++;
}

async function pickRevision(versionName: string) {
  const current = revisions.versions.value.find(revision => revision.versionName === versionName);
  await open(selection.templateName, !current || current.isCurrent ? "" : versionName);
  pickerKey.value++;
}

function sampleLabel(sample: SampleDocument) {
  const status = sample.statusId ? seed.statusDescription(sample.statusId) : "";
  if(sample.kind === "picklist") {
    return [translate("Pick list {id}", { id: sample.sourceId }), sample.date ? commonUtil.getDateAndTime(sample.date) : "", status].filter(Boolean).join(" · ");
  }
  const order = sample.orderName ? translate("Order {name}", { name: sample.orderName }) : "";

  return [order, translate("Shipment {id}", { id: sample.sourceId }), status].filter(Boolean).join(" · ");
}

const chosenSample = computed(() => pickedSample.value?.sourceId === sampleId.value ? pickedSample.value
  : samples.samples.value.find(sample => sample.sourceId === sampleId.value) || null);

function pickSample(document: SampleDocument) {
  pickedSample.value = document;
  sampleId.value = document.sourceId;
  orderModalOpen.value = false;
}

async function reload() {
  await refresh();
  void revisions.resolveUsernames([documentTemplate.value?.liveUserId, ...(documentTemplate.value?.templates || []).map(row => row.userId)]);
  void loadOpen();
  if(canAdmin.value) {
    await samples.load(props.documentTypeId);
    // Keep the document chosen before (a recent one, or one picked from an order); otherwise start on the newest.
    const kept = !!sampleId.value && (pickedSample.value?.sourceId === sampleId.value || samples.samples.value.some(sample => sample.sourceId === sampleId.value));
    if(!kept) {sampleId.value = samples.samples.value[0]?.sourceId || "";}
  }
}

onIonViewWillEnter(() => {
  void reload();
});

/** The header Refresh: reloading replaces the code with the saved revision, so it asks first about unsaved edits. */
async function refreshPage() {
  if(await discardChanges()) {await reload();}
}

/**
 * Runs a write. When it committed but the template list could not be refreshed (`CacheReconciliationError`), it
 * counts as done: the user is told the list may be stale, and the write is never repeated.
 */
async function committed<T>(write: () => Promise<T>): Promise<{ value: T; stale: boolean }> {
  try {
    return { value: await write(), stale: false };
  } catch(error) {
    if(!isCacheReconciliationError(error)) {throw error;}
    logger.warn(error);
    commonUtil.showToast(translate(CACHE_RECONCILIATION_ERROR_MESSAGE));
    return { value: committedResult<T>(error) as T, stale: true };
  }
}

/** Shows a revision's saved code in the editor as a new document, so undo cannot reach the previous one. */
function showCode(templateText: string) {
  code.value = templateText;
  codeKey.value++;
}

/** Loads the open template's revisions and the chosen revision's code. */
async function loadOpen() {
  void revisions.load(props.documentTypeId, selection.templateName);
  await text.load(props.documentTypeId, { ...selection });
  showCode(text.text.value?.templateText || "");
}

async function discardChanges(): Promise<boolean> {
  if(!dirty.value) {return true;}
  const alert = await alertController.create({
    header: translate("Discard your changes?"),
    message: translate("Your changes to the code are not saved."),
    buttons: [{ text: translate("Keep editing"), role: "cancel" }, { text: translate("Discard"), role: "destructive" }],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();

  return role === "destructive";
}

async function open(templateName: string, versionName: string) {
  if(selection.templateName === templateName && selection.versionName === versionName) {return;}
  if(!await discardChanges()) {return;}
  selection.templateName = templateName;
  selection.versionName = versionName;
}

onBeforeRouteLeave(() => discardChanges());

watch(() => [selection.templateName, selection.versionName], ([templateName], [previousTemplateName]) => {
  saveError.value = "";
  publishError.value = "";
  if(templateName !== previousTemplateName) {void revisions.load(props.documentTypeId, selection.templateName);}
  void text.load(props.documentTypeId, { ...selection }).then(() => showCode(text.text.value?.templateText || ""));
});

// A save error is about edits; once the code is back to the saved revision it no longer applies.
watch(dirty, isDirty => { if(!isDirty) {saveError.value = "";} });

// The preview follows what is open and the document chosen to preview with, while the Preview tab shows.
watch(() => [selection.templateName, selection.versionName, sampleId.value, tab.value], () => {
  if(previewed.value && !(sameSelection(previewed.value, selection) && previewed.value.sourceId === sampleId.value)) {clearPreview();}
  if(tab.value === "preview" && !previewed.value) {void runPreview();}
});

async function runPreview() {
  const id = sampleId.value;
  if(!canAdmin.value || !id) {return;}
  try {
    await preview(props.documentTypeId, { ...selection }, id);
  } catch(cause) {
    logger.error(cause);
    commonUtil.showToast(translate("Failed to preview the template."));
    publishError.value = serverErrorMessage(cause);
  }
}

/** After a save, open the template at its new revision and preview it. */
async function showSaved(templateName: string) {
  const reopen = selection.templateName === templateName && !selection.versionName;
  selection.templateName = templateName;
  selection.versionName = "";
  if(reopen) {
    // Same selection, new revision: the preview watcher would not notice, so render it here.
    clearPreview();
    await loadOpen();
    if(tab.value === "preview") {void runPreview();}
  }
  tab.value = "preview";
}

async function saveRevision() {
  const current = text.text.value;
  if(!canAdmin.value || !selection.templateName || !current || !dirty.value) {return;}
  saveError.value = "";
  try {
    const { value: saved, stale } = await committed(() => save(props.documentTypeId,
      { templateName: selection.templateName, templateText: code.value, expectedVersionName: current.currentVersionName }));
    if(!stale) {commonUtil.showToast(translate("Saved revision {revision}.", { revision: saved?.versionName || "" }));}
    await showSaved(saved?.templateName || selection.templateName);
  } catch(cause) {
    logger.error(cause);
    saveError.value = serverErrorMessage(cause) || translate("The revision was not saved.");
    tab.value = "code";
  }
}

async function askTemplateName(header: string): Promise<string> {
  const taken = (documentTemplate.value?.templates || []).map(row => row.templateName);
  const alert = await alertController.create({
    header,
    message: translate("Use lowercase letters, numbers and hyphens."),
    inputs: [{ name: "templateName", type: "text", value: suggestTemplateName(documentTemplate.value?.description || props.documentTypeId, taken) }],
    buttons: [{ text: translate("Cancel"), role: "cancel" }, { text: translate("Save"), role: "confirm" }],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss();
  if(role !== "confirm") {return "";}
  const name = String(data?.values?.templateName || "").trim();
  if(!isTemplateName(name)) {
    commonUtil.showToast(translate("Template names use lowercase letters, numbers and hyphens, up to 60 characters."));
    return "";
  }
  if(taken.includes(name)) {
    commonUtil.showToast(translate("A template named {name} already exists.", { name }));
    return "";
  }

  return name;
}

/** Saves the code on screen, edited or not, as the first revision of a new template. */
async function saveAsNewTemplate() {
  if(!canAdmin.value || !text.text.value) {return;}
  const templateName = await askTemplateName(translate("Save as a new template"));
  if(!templateName) {return;}
  saveError.value = "";
  try {
    const { stale } = await committed(() => save(props.documentTypeId, { templateName, templateText: code.value }));
    if(!stale) {commonUtil.showToast(translate("Saved {name}.", { name: templateName }));}
    // The new template has the code on screen, so nothing is left to discard.
    if(text.text.value) {code.value = text.text.value.templateText;}
    await showSaved(templateName);
  } catch(cause) {
    logger.error(cause);
    saveError.value = serverErrorMessage(cause) || translate("The template was not saved.");
    tab.value = "code";
  }
}

/** Starts a new template from the live one. */
async function newTemplate() {
  if(!canAdmin.value || !await discardChanges()) {return;}
  const templateName = await askTemplateName(translate("New template from the live one"));
  if(!templateName) {return;}
  try {
    const { stale } = await committed(() => save(props.documentTypeId, { templateName, copyFromLive: true }));
    if(!stale) {commonUtil.showToast(translate("Saved {name}.", { name: templateName }));}
    if(text.text.value) {code.value = text.text.value.templateText;}
    selection.templateName = templateName;
    selection.versionName = "";
    tab.value = "code";
  } catch(cause) {
    logger.error(cause);
    commonUtil.showToast(serverErrorMessage(cause) || translate("The template was not saved."));
  }
}

/** Deletes the open named template with all its revisions, after the user confirms. */
async function confirmDelete() {
  const templateName = selection.templateName;
  const current = text.text.value;
  if(!canAdmin.value || !templateName || !current) {return;}
  const count = revisions.versions.value.length;
  const alert = await alertController.create({
    header: translate("Delete {name}?", { name: templateName }),
    message: [
      count === 1 ? translate("Its only revision is deleted too.") : translate("All {count} of its revisions are deleted too.", { count: count || "" }),
      translate("This cannot be undone. Printing does not change."),
      dirty.value ? translate("Your unsaved changes are lost.") : "",
    ].filter(Boolean).join(" "),
    buttons: [{ text: translate("Cancel"), role: "cancel" }, { text: translate("Delete"), role: "destructive" }],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if(role !== "destructive") {return;}
  publishError.value = "";
  try {
    const { stale } = await committed(() => remove(props.documentTypeId, templateName, current.currentVersionName));
    if(!stale) {commonUtil.showToast(translate("Deleted {name}.", { name: templateName }));}
    // Nothing is left to discard; show what prints.
    code.value = current.templateText;
    selection.templateName = "";
    selection.versionName = "";
  } catch(cause) {
    logger.error(cause);
    commonUtil.showToast(translate("The template was not deleted."));
    publishError.value = serverErrorMessage(cause);
  }
}

function copyIncludeIn(include: { location: string; templateText: string }) {
  code.value = inlineInclude(code.value, include.location, include.templateText);
}

async function confirmPublish() {
  const template = documentTemplate.value;
  const action = publishAction.value;
  if(!canPublish.value || !template || !action || !result.value?.versionName) {return;}
  const documentName = template.description || props.documentTypeId;
  const alert = await alertController.create({
    header: action === "rollback" ? translate("Restore this revision?") : translate("Make this revision live?"),
    message: action === "rollback"
      ? translate("{document} will print with revision {revision} of the live template again.", { document: documentName, revision: result.value.versionName })
      : translate("{document} will print with {template}, revision {revision}.", { document: documentName, template: selection.templateName, revision: result.value.versionName }),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: action === "rollback" ? translate("Restore") : translate("Make live"), handler: () => { void runPublish(action); } },
    ],
  });
  await alert.present();
}

async function runPublish(action: "publish" | "rollback") {
  const template = documentTemplate.value;
  // Publishing does not render the template: the preview the user just reviewed is the check.
  const versionName = result.value?.versionName;
  if(!template?.liveVersionName || !canPublish.value || !versionName) {return;}
  publishError.value = "";
  try {
    const { value: published, stale } = await committed(() => publish(props.documentTypeId, {
      // The revision the preview rendered, so one saved since then is not published unseen.
      ...(action === "publish" ? { templateName: selection.templateName } : {}),
      versionName,
      expectedLiveVersionName: template.liveVersionName,
    }));
    if(!stale) {commonUtil.showToast(translate("Printing now uses revision {revision} of the live template.", { revision: published?.liveVersionName || "" }));}
    // Show what prints now.
    if(!selection.templateName && !selection.versionName) {
      await loadOpen();
    } else {
      const wasLive = !selection.templateName;
      selection.templateName = "";
      selection.versionName = "";
      // Restoring stays on the live template, so the watcher does not reload its revisions.
      if(wasLive) {void revisions.load(props.documentTypeId, "");}
    }
  } catch(cause) {
    logger.error(cause);
    commonUtil.showToast(translate("The template was not made live."));
    publishError.value = serverErrorMessage(cause);
    void revisions.load(props.documentTypeId, selection.templateName);
  }
}
</script>

<style scoped>
.template-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacer-sm, 16px);
  padding: var(--spacer-sm, 16px) var(--spacer-sm, 16px) 0;
}

.template-picker ion-select {
  flex: 1 1 260px;
  max-width: 480px;
}

.secondary-label {
  color: var(--ion-color-medium);
}

.editor-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacer-xs, 8px) var(--spacer-sm, 16px);
  padding: var(--spacer-sm, 16px);
}

.editor-title {
  min-width: 0;
}

.editor-title p {
  margin: 4px 0 0;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacer-xs, 8px);
}

ion-segment {
  margin: 0 var(--spacer-sm, 16px);
  width: auto;
}

.tab-body {
  padding: var(--spacer-sm, 16px);
}

.code-note {
  margin: 0 0 var(--spacer-xs, 8px);
}

.pdf-frame {
  display: block;
  width: 100%;
  height: 75vh;
  border: none;
}
</style>
