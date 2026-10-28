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
        <section>
          <ion-card data-testid="document-template-live-card">
            <ion-card-header>
              <ion-card-subtitle>{{ translate("Live template") }}</ion-card-subtitle>
              <ion-card-title>{{ translate("Version {version}", { version: documentTemplate.liveVersionName || "-" }) }}</ion-card-title>
            </ion-card-header>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                {{ commonUtil.getDateAndTime(documentTemplate.liveVersionDate) }}
                <p v-if="documentTemplate.liveUserId">{{ translate("By {user}", { user: liveVersions.usernameFor(documentTemplate.liveUserId) }) }}</p>
              </ion-label>
              <ion-badge slot="end" :color="documentTemplate.liveTemplateNames?.length ? 'success' : 'medium'">
                {{ documentTemplate.liveTemplateNames?.length ? documentTemplate.liveTemplateNames.join(", ") : translate("Not from the library") }}
              </ion-badge>
            </ion-item>
            <ion-card-content>{{ translate("Printing always uses the live template. Publishing a library template copies it into the live template, and rolling back restores an earlier live version.") }}</ion-card-content>
          </ion-card>

          <ion-card data-testid="document-template-preview-form-card">
            <ion-card-header><ion-card-title>{{ translate("Preview") }}</ion-card-title></ion-card-header>
            <template v-if="canAdmin">
              <ion-item>
                <ion-select v-model="selection.templateName" :label="translate('Template')" interface="popover" data-testid="document-template-template-select">
                  <ion-select-option value="">{{ translate("Live template") }}</ion-select-option>
                  <ion-select-option v-for="library in documentTemplate.templates || []" :key="library.templateName" :value="library.templateName">{{ library.templateName }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select v-model="selection.versionName" :label="translate('Version')" interface="popover" :disabled="selectedVersions.loading.value" data-testid="document-template-version-select">
                  <ion-select-option value="">{{ translate("Current version") }}</ion-select-option>
                  <ion-select-option v-for="version in selectedVersions.versions.value" :key="version.versionName" :value="version.versionName">
                    {{ translate("Version {version}", { version: version.versionName }) }} · {{ commonUtil.getDateAndTime(version.versionDate) }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input v-model="sourceId" :label="translate(sourceIdLabel(documentTypeId))" label-placement="floating" :clear-input="true"
                  data-testid="document-template-source-input" @keyup.enter="runPreview()" />
              </ion-item>
              <ion-button class="ion-margin" :disabled="!sourceId.trim() || previewLoading" data-testid="document-template-preview-btn" @click="runPreview()">
                <ion-icon slot="start" :icon="eyeOutline" />{{ translate("Preview") }}
              </ion-button>
            </template>
            <ion-card-content v-else data-testid="document-template-view-only">{{ translate("You can view these templates. Previewing and publishing need template admin access.") }}</ion-card-content>
          </ion-card>

          <ion-card data-testid="document-template-history-card">
            <ion-card-header><ion-card-title>{{ translate("Live versions") }}</ion-card-title></ion-card-header>
            <ion-list v-if="liveVersions.loading.value && !liveVersions.versions.value.length" data-testid="document-template-history-loading">
              <ion-item v-for="n in 3" :key="n"><ion-label><ion-skeleton-text animated style="width: 60%" /></ion-label></ion-item>
            </ion-list>
            <ion-card-content v-else-if="liveVersions.error.value" data-testid="document-template-history-error">{{ translate("Version history could not be loaded.") }}</ion-card-content>
            <ion-list v-else>
              <ion-item v-for="version in visibleLiveVersions" :key="version.versionName" :data-testid="`document-template-history-${version.versionName}-row`">
                <ion-label>
                  {{ translate("Version {version}", { version: version.versionName }) }}
                  <p>{{ commonUtil.getDateAndTime(version.versionDate) }}<span v-if="version.userId"> · {{ liveVersions.usernameFor(version.userId) }}</span></p>
                </ion-label>
                <ion-badge v-if="version.isCurrent" slot="end" color="success">{{ translate("Live") }}</ion-badge>
                <ion-button v-if="canAdmin" slot="end" fill="clear" :aria-label="translate('Preview version {version}', { version: version.versionName })"
                  :data-testid="`document-template-history-${version.versionName}-preview-btn`" @click="select({ templateName: '', versionName: version.isCurrent ? '' : version.versionName })">
                  <ion-icon slot="icon-only" :icon="eyeOutline" />
                </ion-button>
              </ion-item>
              <ion-button v-if="liveVersions.versions.value.length > historyLimit" fill="clear" expand="block" data-testid="document-template-history-more-btn" @click="historyLimit += 10">
                {{ translate("Show older versions") }}
              </ion-button>
            </ion-list>
          </ion-card>

          <ion-card data-testid="document-template-library-card">
            <ion-card-header><ion-card-title>{{ translate("Library templates") }}</ion-card-title></ion-card-header>
            <ion-card-content v-if="!documentTemplate.templates?.length">{{ translate("No library templates yet. They are created from the MCP.") }}</ion-card-content>
            <ion-list v-else>
              <ion-item v-for="library in documentTemplate.templates" :key="library.templateName" :data-testid="`document-template-library-${library.templateName}-row`">
                <ion-label>
                  {{ library.templateName }}
                  <p>{{ translate("Version {version}", { version: library.versionName || "-" }) }} · {{ commonUtil.getDateAndTime(library.versionDate) }}<span v-if="library.userId"> · {{ liveVersions.usernameFor(library.userId) }}</span></p>
                </ion-label>
                <ion-badge v-if="library.isLive" slot="end" color="success">{{ translate("Live") }}</ion-badge>
                <ion-button v-if="canAdmin" slot="end" fill="clear" :aria-label="translate('Preview {template}', { template: library.templateName })"
                  :data-testid="`document-template-library-${library.templateName}-preview-btn`" @click="select({ templateName: library.templateName, versionName: '' })">
                  <ion-icon slot="icon-only" :icon="eyeOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card>
        </section>

        <section v-if="canAdmin">
          <ion-card class="preview-card" data-testid="document-template-preview-card">
            <ion-card-header>
              <ion-card-subtitle>{{ selectionLabel }}</ion-card-subtitle>
              <ion-card-title v-if="previewed">{{ translate(sourceIdLabel(documentTypeId)) }} {{ previewed.sourceId }}</ion-card-title>
              <ion-card-title v-else>{{ translate("Preview") }}</ion-card-title>
            </ion-card-header>

            <ion-card-content v-if="previewLoading" data-testid="document-template-preview-loading">
              <ion-skeleton-text animated style="width: 100%; height: 320px" />
            </ion-card-content>
            <ion-card-content v-else-if="!result" data-testid="document-template-preview-empty">
              {{ translate("Choose a template and enter a {label} to see the PDF it prints.", { label: translate(sourceIdLabel(documentTypeId)) }) }}
            </ion-card-content>
            <template v-else>
              <ion-item lines="none">
                <ion-badge slot="start" :color="result.rendered ? 'success' : 'danger'" data-testid="document-template-preview-status">
                  {{ result.rendered ? translate("{count} pages", { count: result.pageCount || 0 }) : translate("No PDF") }}
                </ion-badge>
                <ion-label class="ion-text-wrap">
                  {{ result.templateErrors.length ? translate("{count} template errors that printing skips over", { count: result.templateErrors.length }) : translate("No template errors") }}
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

            <ion-item v-if="publishError" lines="none" data-testid="document-template-publish-error">
              <ion-icon slot="start" color="danger" :icon="alertCircleOutline" />
              <ion-label class="ion-text-wrap">{{ publishError }}</ion-label>
            </ion-item>
            <ion-button v-if="publishAction && result" class="ion-margin" :disabled="!result.rendered || publishing || previewLoading"
              :color="publishAction === 'rollback' ? 'warning' : 'primary'" data-testid="document-template-publish-btn" @click="confirmPublish()">
              <ion-icon slot="start" :icon="publishAction === 'rollback' ? arrowUndoOutline : cloudUploadOutline" />
              {{ publishAction === "rollback" ? translate("Roll back to version {version}", { version: selection.versionName }) : translate("Make live") }}
            </ion-button>
          </ion-card>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import { IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonPage, IonProgressBar, IonSelect, IonSelectOption, IonSkeletonText, IonTitle, IonToolbar, alertController, onIonViewWillEnter } from "@ionic/vue";
import { alertCircleOutline, arrowUndoOutline, cloudUploadOutline, eyeOutline, refreshOutline, warningOutline } from "ionicons/icons";
import { computed, reactive, ref, watch } from "vue";
import { useAuth } from "@/composables/useSecurity";
import { useDocumentTemplate, useDocumentTemplatePreview, useDocumentTemplatePublish, useDocumentTemplateVersions, useDocumentTemplates } from "@/composables/useDocumentTemplates";
import { publishActionFor, sameSelection, serverErrorMessage, sourceIdLabel, templateErrorFile } from "@/utils/documentTemplates";
import Actions from "@/authorization/actions";

const props = defineProps<{ documentTypeId: string }>();

const { hasPermission } = useAuth();
const canAdmin = computed(() => hasPermission(Actions.APP_DOCUMENT_TEMPLATES_ADMIN));

const { loading, loaded, error, refresh } = useDocumentTemplates();
const { documentTemplate, hydrated } = useDocumentTemplate(() => props.documentTypeId);
const liveVersions = useDocumentTemplateVersions();
const selectedVersions = useDocumentTemplateVersions();
const { result, previewed, pdfUrl, loading: previewLoading, preview, clear: clearPreview } = useDocumentTemplatePreview();
const { publish, publishing } = useDocumentTemplatePublish();

const selection = reactive({ templateName: "", versionName: "" });
const sourceId = ref("");
const publishError = ref("");
const historyLimit = ref(10);
const visibleLiveVersions = computed(() => liveVersions.versions.value.slice(0, historyLimit.value));

const selectionLabel = computed(() => {
  const name = selection.templateName || translate("Live template");

  return selection.versionName ? translate("{template}, version {version}", { template: name, version: selection.versionName }) : name;
});
// Only what was previewed, exactly as selected, can be published.
const publishAction = computed(() => previewed.value && sameSelection(previewed.value, selection)
  ? publishActionFor(selection, documentTemplate.value) : "");

async function reload() {
  await refresh();
  void liveVersions.load(props.documentTypeId);
  void selectedVersions.load(props.documentTypeId, selection.templateName || undefined);
}

onIonViewWillEnter(() => {
  void reload();
});

// A new template starts at its current version, unless a history row asked for another one.
let pendingVersionName = "";
function select(next: { templateName: string; versionName: string }) {
  if(next.templateName === selection.templateName) {
    selection.versionName = next.versionName;

    return;
  }
  pendingVersionName = next.versionName;
  selection.templateName = next.templateName;
}

watch(() => selection.templateName, (templateName) => {
  selection.versionName = pendingVersionName;
  pendingVersionName = "";
  void selectedVersions.load(props.documentTypeId, templateName || undefined);
});
// A preview belongs to one selection: a different one starts over.
watch(() => [selection.templateName, selection.versionName], () => {
  if(previewed.value && !sameSelection(previewed.value, selection)) {clearPreview();}
  publishError.value = "";
});

async function runPreview() {
  const id = sourceId.value.trim();
  if(!canAdmin.value || !id || previewLoading.value) {return;}
  publishError.value = "";
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
      : translate("{document} will print with {template}.", { document: template.description || props.documentTypeId, template: selectionLabel.value }),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      { text: action === "rollback" ? translate("Roll back") : translate("Make live"), handler: () => { void runPublish(action); } },
    ],
  });
  await alert.present();
}

async function runPublish(action: "publish" | "rollback") {
  const template = documentTemplate.value;
  const sourceIdPreviewed = previewed.value?.sourceId;
  if(!template?.liveVersionName || !sourceIdPreviewed) {return;}
  publishError.value = "";
  try {
    const published = await publish(props.documentTypeId, {
      ...(action === "publish" ? { templateName: selection.templateName, versionName: selection.versionName || undefined } : { versionName: selection.versionName }),
      expectedLiveVersionName: template.liveVersionName,
      // The server renders it for the same document again and refuses new template errors.
      sourceId: sourceIdPreviewed,
    });
    commonUtil.showToast(translate("The live template is now version {version}.", { version: published.liveVersionName || "" }));
    clearPreview();
    selection.templateName = "";
    selection.versionName = "";
    void liveVersions.load(props.documentTypeId);
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

@media (min-width: 991px) {
  .template-workspace {
    grid-template-columns: minmax(320px, 2fr) minmax(0, 3fr);
  }
}

.pdf-frame {
  display: block;
  width: 100%;
  height: 70vh;
  border: none;
}
</style>
