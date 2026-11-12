<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/document-templates" />
        <ion-title>{{ documentTemplate?.description || documentTypeId }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="loading" :aria-label="translate('Refresh')" data-testid="document-template-refresh-btn" @click="reload()">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-progress-bar v-if="loading || publishing" type="indeterminate" />
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
        <!-- One list: every template that could print this document. Choosing a row previews it. -->
        <section class="template-choices" :aria-label="translate('Templates')">
          <ion-list>
            <ion-list-header>{{ translate("Prints now") }}</ion-list-header>
            <ion-item button :detail="false" :class="{ chosen: isChosen('', '') }" data-testid="document-template-choice-live"
              @click="choose('', '')">
              <ion-label>
                {{ translate("Live template") }}
                <p>{{ versionLine(documentTemplate.liveVersionName, documentTemplate.liveVersionDate, documentTemplate.liveUserId) }}</p>
              </ion-label>
              <ion-badge slot="end" color="success">{{ translate("Live") }}</ion-badge>
            </ion-item>
            <ion-item v-if="earlierVersions.length" button :detail="false" lines="none" data-testid="document-template-history-toggle"
              @click="showHistory = !showHistory">
              <ion-icon slot="start" :icon="timeOutline" />
              <ion-label>{{ translate("Earlier versions ({count})", { count: earlierVersions.length }) }}</ion-label>
              <ion-icon slot="end" :icon="showHistory ? chevronUpOutline : chevronDownOutline" />
            </ion-item>
            <template v-if="showHistory">
              <ion-item v-for="version in shownEarlierVersions" :key="version.versionName" button :detail="false" class="nested"
                :class="{ chosen: isChosen('', version.versionName) }" :data-testid="`document-template-history-${version.versionName}-row`"
                @click="choose('', version.versionName)">
                <ion-label>
                  {{ translate("Version {version}", { version: version.versionName }) }}
                  <p>{{ commonUtil.getDateAndTime(version.versionDate) }}<span v-if="version.userId"> · {{ liveVersions.usernameFor(version.userId) }}</span></p>
                </ion-label>
              </ion-item>
              <ion-item v-if="earlierVersions.length > shownEarlierVersions.length" button :detail="false" lines="none" class="nested"
                data-testid="document-template-history-all-btn" @click="showAllHistory = true">
                <ion-label color="primary">{{ translate("Show all {count}", { count: earlierVersions.length }) }}</ion-label>
              </ion-item>
            </template>
            <ion-item v-if="liveVersions.error.value" lines="none" data-testid="document-template-history-error">
              <ion-label class="ion-text-wrap secondary-label">{{ translate("Version history could not be loaded.") }}</ion-label>
            </ion-item>

            <ion-list-header>{{ translate("Library") }}</ion-list-header>
            <ion-item v-if="!documentTemplate.templates?.length" lines="none">
              <ion-label class="ion-text-wrap secondary-label">{{ translate("No library templates yet. They are created from the MCP.") }}</ion-label>
            </ion-item>
            <ion-item v-for="library in documentTemplate.templates" :key="library.templateName" button :detail="false"
              :class="{ chosen: isChosen(library.templateName, '') }" :data-testid="`document-template-library-${library.templateName}-row`"
              @click="choose(library.templateName, '')">
              <ion-label>
                {{ library.templateName }}
                <p>{{ versionLine(library.versionName, library.versionDate, library.userId) }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </section>

        <section class="template-preview" ref="previewSection">
          <ion-card data-testid="document-template-preview-card">
            <div class="preview-head">
              <div class="preview-title">
                <ion-card-subtitle>{{ choiceRole }}</ion-card-subtitle>
                <ion-card-title>{{ choiceTitle }}</ion-card-title>
              </div>
              <ion-button v-if="canAdmin && publishAction" :disabled="!result?.rendered || publishing || previewLoading"
                :color="publishAction === 'rollback' ? 'warning' : 'primary'" data-testid="document-template-publish-btn" @click="confirmPublish()">
                <ion-icon slot="start" :icon="publishAction === 'rollback' ? arrowUndoOutline : cloudUploadOutline" />
                {{ publishAction === "rollback" ? translate("Roll back to this version") : translate("Make live") }}
              </ion-button>
            </div>

            <ion-card-content v-if="!canAdmin" data-testid="document-template-view-only">
              {{ translate("You can view these templates. Previewing and publishing need template admin access.") }}
            </ion-card-content>
            <template v-else>
              <ion-item lines="full">
                <ion-select :label="translate('Preview with')" interface="popover" :value="sampleId" :disabled="samples.loading.value || !samples.samples.value.length"
                  :placeholder="samples.loading.value ? translate('Loading…') : translate('None available')" data-testid="document-template-sample-select"
                  @ionChange="sampleId = $event.detail.value">
                  <ion-select-option v-for="sample in samples.samples.value" :key="sample.sourceId" :value="sample.sourceId">{{ sampleLabel(sample) }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-card-content v-if="!samples.loading.value && !samples.samples.value.length" data-testid="document-template-no-samples">
                {{ samples.error.value ? translate("Recent documents to preview with could not be loaded.")
                  : documentTypeId === "PICKLIST" ? translate("There are no recent pick lists to preview with.") : translate("There are no recent shipments to preview with.") }}
              </ion-card-content>

              <ion-card-content v-if="previewLoading" data-testid="document-template-preview-loading">
                <ion-skeleton-text animated style="width: 100%; height: 320px" />
              </ion-card-content>
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

            <ion-item v-if="publishError" lines="none" data-testid="document-template-publish-error">
              <ion-icon slot="start" color="danger" :icon="alertCircleOutline" />
              <ion-label class="ion-text-wrap">{{ publishError }}</ion-label>
            </ion-item>
          </ion-card>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import { useSeedData } from "@common/db";
import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonProgressBar, IonSelect, IonSelectOption, IonSkeletonText, IonTitle, IonToolbar, alertController, onIonViewWillEnter } from "@ionic/vue";
import { alertCircleOutline, arrowUndoOutline, chevronDownOutline, chevronUpOutline, cloudUploadOutline, refreshOutline, timeOutline, warningOutline } from "ionicons/icons";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useAuth } from "@/composables/useSecurity";
import { useDocumentTemplate, useDocumentTemplatePreview, useDocumentTemplatePublish, useDocumentTemplateVersions, useDocumentTemplates, useSampleDocuments } from "@/composables/useDocumentTemplates";
import { publishActionFor, sameSelection, serverErrorMessage, templateErrorFile, type SampleDocument } from "@/utils/documentTemplates";
import Actions from "@/authorization/actions";

const props = defineProps<{ documentTypeId: string }>();

const { hasPermission } = useAuth();
const canAdmin = computed(() => hasPermission(Actions.APP_DOCUMENT_TEMPLATES_ADMIN));
const seed = useSeedData();

const { loading, loaded, error, refresh } = useDocumentTemplates();
const { documentTemplate, hydrated } = useDocumentTemplate(() => props.documentTypeId);
const liveVersions = useDocumentTemplateVersions();
const samples = useSampleDocuments();
const { result, previewed, pdfUrl, loading: previewLoading, preview, clear: clearPreview } = useDocumentTemplatePreview();
const { publish, publishing } = useDocumentTemplatePublish();

// What is chosen: the live template (templateName ""), at its current version (versionName "") or an
// earlier one, or a library template at its current version.
const selection = reactive({ templateName: "", versionName: "" });
const sampleId = ref("");
const publishError = ref("");
const showHistory = ref(false);
const previewSection = ref<HTMLElement | null>(null);

const showAllHistory = ref(false);
const earlierVersions = computed(() => liveVersions.versions.value.filter(version => !version.isCurrent));
const shownEarlierVersions = computed(() => showAllHistory.value ? earlierVersions.value : earlierVersions.value.slice(0, 10));
const isChosen = (templateName: string, versionName: string) => selection.templateName === templateName && selection.versionName === versionName;
const choiceTitle = computed(() => selection.templateName
  || (selection.versionName ? translate("Version {version}", { version: selection.versionName }) : translate("Live template")));
const choiceRole = computed(() => selection.templateName ? translate("Library template")
  : selection.versionName ? translate("Earlier live version") : translate("Prints now"));
// Only what was previewed, exactly as chosen, can be published.
const publishAction = computed(() => previewed.value && sameSelection(previewed.value, selection)
  ? publishActionFor(selection, documentTemplate.value) : "");

function versionLine(versionName?: string, versionDate?: number, userId?: string) {
  return [translate("Version {version}", { version: versionName || "-" }),
    versionDate ? commonUtil.getDateAndTime(versionDate) : "",
    userId ? liveVersions.usernameFor(userId) : ""].filter(Boolean).join(" · ");
}

function sampleLabel(sample: SampleDocument) {
  const status = sample.statusId ? seed.statusDescription(sample.statusId) : "";
  if(sample.kind === "picklist") {
    return [translate("Pick list {id}", { id: sample.sourceId }), sample.date ? commonUtil.getDateAndTime(sample.date) : "", status].filter(Boolean).join(" · ");
  }
  const order = sample.orderName ? translate("Order {name}", { name: sample.orderName }) : "";

  return [order, translate("Shipment {id}", { id: sample.sourceId }), status].filter(Boolean).join(" · ");
}

async function reload() {
  await refresh();
  void liveVersions.load(props.documentTypeId).then(() => {
    void liveVersions.resolveUsernames([documentTemplate.value?.liveUserId, ...(documentTemplate.value?.templates || []).map(row => row.userId)]);
  });
  if(canAdmin.value) {
    await samples.load(props.documentTypeId);
    if(!samples.samples.value.some(sample => sample.sourceId === sampleId.value)) {sampleId.value = samples.samples.value[0]?.sourceId || "";}
  }
}

onIonViewWillEnter(() => {
  void reload();
});

async function choose(templateName: string, versionName: string) {
  selection.templateName = templateName;
  selection.versionName = versionName;
  await nextTick();
  // Stacked on narrow screens, the preview is below the list.
  previewSection.value?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// The preview follows the choice and the sample document: no separate Preview step.
watch(() => [selection.templateName, selection.versionName, sampleId.value], () => {
  publishError.value = "";
  if(previewed.value && !(sameSelection(previewed.value, selection) && previewed.value.sourceId === sampleId.value)) {clearPreview();}
  void runPreview();
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

async function confirmPublish() {
  const template = documentTemplate.value;
  const action = publishAction.value;
  if(!canAdmin.value || !template || !action || !previewed.value) {return;}
  const alert = await alertController.create({
    header: action === "rollback" ? translate("Roll back the live template?") : translate("Make this template live?"),
    message: action === "rollback"
      ? translate("{document} will print with version {version} again.", { document: template.description || props.documentTypeId, version: selection.versionName })
      : translate("{document} will print with {template}.", { document: template.description || props.documentTypeId, template: selection.templateName }),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: action === "rollback" ? translate("Roll back") : translate("Make live"), handler: () => { void runPublish(action); } },
    ],
  });
  await alert.present();
}

async function runPublish(action: "publish" | "rollback") {
  const template = documentTemplate.value;
  // Publishing does not render the template: the preview the user just reviewed is the check.
  if(!template?.liveVersionName || !previewed.value || !result.value?.rendered) {return;}
  publishError.value = "";
  try {
    const published = await publish(props.documentTypeId, {
      ...(action === "publish" ? { templateName: selection.templateName } : { versionName: selection.versionName }),
      expectedLiveVersionName: template.liveVersionName,
    });
    commonUtil.showToast(translate("The live template is now version {version}.", { version: published.liveVersionName || "" }));
    await liveVersions.load(props.documentTypeId);
    // Show what prints now.
    selection.templateName = "";
    selection.versionName = "";
  } catch(cause) {
    logger.error(cause);
    commonUtil.showToast(translate("The template was not published."));
    publishError.value = serverErrorMessage(cause);
    void liveVersions.load(props.documentTypeId);
  }
}
</script>

<style scoped>
.template-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

/* The list of templates beside the preview once there is room for a readable PDF (the menu takes ~270px). */
@media (min-width: 1200px) {
  .template-workspace {
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  }
}

ion-item.chosen {
  --background: var(--ion-color-light);
  --border-color: var(--ion-color-primary);
}

ion-item.chosen ion-label {
  font-weight: 500;
}

ion-item.nested {
  --padding-start: var(--spacer-lg, 32px);
}

.secondary-label {
  color: var(--ion-color-medium);
}

.preview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacer-xs, 8px) var(--spacer-sm, 16px);
  padding: var(--spacer-sm, 16px);
}

.preview-title {
  min-width: 0;
}

.pdf-frame {
  display: block;
  width: 100%;
  height: 70vh;
  border: none;
}
</style>
