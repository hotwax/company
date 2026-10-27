<template>
  <ion-card class="preview-panel" data-testid="document-template-preview-panel">
    <ion-card-header>
      <div class="preview-heading"><ion-card-title>{{ translate("Document preview") }}</ion-card-title><ion-note role="status" aria-live="polite" data-testid="document-template-preview-status">{{ statusText }}</ion-note></div>
      <p class="preview-context">{{ translate("Revision {revision}", { revision: revision || '—' }) }}<template v-if="pageCount"> · {{ translate("Page {page} of {count}", { page: pageNumber, count: pageCount }) }}</template><template v-if="pageFormat"> · {{ pageFormat }}</template></p>
    </ion-card-header>
    <div class="preview-tools" role="group" :aria-label="translate('Preview controls')">
      <ion-button fill="clear" :disabled="!src" @click="zoom = 'fit'" data-testid="document-template-fit-btn">{{ translate("Fit page") }}</ion-button>
      <ion-button class="zoom-button" fill="clear" :disabled="!src || effectiveZoom <= 50" :aria-label="translate('Zoom out')" @click="changeZoom(-25)" data-testid="document-template-zoom-out-btn"><ion-icon slot="icon-only" :icon="removeOutline" /></ion-button>
      <span class="zoom-label" aria-live="polite">{{ src ? `${effectiveZoom}%` : '—' }}</span>
      <ion-button class="zoom-button" fill="clear" :disabled="!src || effectiveZoom >= 400" :aria-label="translate('Zoom in')" @click="changeZoom(25)" data-testid="document-template-zoom-in-btn"><ion-icon slot="icon-only" :icon="addOutline" /></ion-button>
      <ion-select v-if="pages.length > 1" :value="pageNumber" :label="translate('Page')" interface="popover" @ionChange="$emit('pageChange', Number($event.detail.value))" data-testid="document-template-page-select"><ion-select-option v-for="page in pages" :key="page.pageNumber" :value="page.pageNumber">{{ page.pageNumber }}</ion-select-option></ion-select>
      <ion-button class="pdf-action" fill="outline" :disabled="!pdfUrl" :href="pdfUrl || undefined" target="_blank" rel="noopener" :aria-label="translate('Open original PDF in a new tab')" data-testid="document-template-pdf-btn">{{ translate("Open PDF") }}<ion-icon slot="end" :icon="openOutline" /></ion-button>
    </div>
    <div ref="stage" class="document-stage" tabindex="0" role="region" :aria-label="translate('Scrollable document preview')" :aria-busy="busy" data-testid="document-template-preview-stage">
      <div v-if="busy && !src" class="stage-message" data-testid="document-template-preview-loading"><ion-spinner name="crescent" /><h3>{{ translate("Preparing your preview") }}</h3><p>{{ translate("Your selected documents are being rendered for this revision.") }}</p></div>
      <div v-else-if="error" class="stage-message" data-testid="document-template-preview-error"><ion-icon :icon="alertCircleOutline" color="danger" /><h3>{{ translate("Preview unavailable") }}</h3><p role="alert">{{ error }}</p><ion-button v-if="canCheck" fill="outline" @click="$emit('checkStatus')" data-testid="document-template-preview-status-btn">{{ translate("Check preview status") }}</ion-button></div>
      <div v-else-if="src" class="paper-scroll"><img :src="src" :style="{ width: `${displayWidth}px` }" :alt="translate('{name} preview, revision {revision}, page {page}', { name: documentName, revision, page: pageNumber })" class="document-preview" @load="imageLoaded" data-testid="document-template-preview-image" /></div>
      <div v-else class="stage-message" data-testid="document-template-preview-empty"><ion-icon :icon="documentTextOutline" /><h3>{{ translate("See the document before you use it") }}</h3><p>{{ translate("Choose real documents in Review setup, then generate a private preview.") }}</p></div>
    </div>
    <p class="preview-quality">{{ translate("Use the PDF for original print quality. Zoom controls enlarge this page image.") }}</p>
  </ion-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { IonButton, IonCard, IonCardHeader, IonCardTitle, IonIcon, IonNote, IonSelect, IonSelectOption, IonSpinner } from "@ionic/vue";
import { addOutline, alertCircleOutline, documentTextOutline, openOutline, removeOutline } from "ionicons/icons";
import { translate } from "@common";
import type { DocumentArtifact } from "@/utils/documentTemplates";

const props = withDefaults(defineProps<{ src?: string; pdfUrl?: string; revision: string; documentName: string; pageNumber: number; pageCount?: number; pages: DocumentArtifact[]; busy: boolean; error?: string; canCheck?: boolean }>(), { src: "", pdfUrl: "", error: "", pageCount: 0, canCheck: false });
defineEmits<{ pageChange: [page: number]; checkStatus: [] }>();
const stage = ref<HTMLElement>();
const stageWidth = ref(720), stageHeight = ref(680);
const naturalWidth = ref(288), naturalHeight = ref(432);
const zoom = ref<number | "fit">("fit");
let observer: ResizeObserver | undefined;
const artifact = computed(() => props.pages.find((page) => page.pageNumber === props.pageNumber));
const logicalWidth = computed(() => Number(artifact.value?.widthPoints) || naturalWidth.value);
const logicalHeight = computed(() => Number(artifact.value?.heightPoints) || naturalHeight.value);
const fittedWidth = computed(() => Math.max(1, Math.min(stageWidth.value, stageHeight.value * logicalWidth.value / logicalHeight.value)));
const displayWidth = computed(() => zoom.value === "fit" ? fittedWidth.value : logicalWidth.value * zoom.value / 100);
const effectiveZoom = computed(() => Math.round(displayWidth.value / logicalWidth.value * 100));
const statusText = computed(() => props.busy ? translate("Preparing preview…") : props.error ? translate("Needs attention") : props.src ? translate("Ready to review") : translate("No preview yet"));
const pageFormat = computed(() => artifact.value?.widthPoints && artifact.value?.heightPoints ? translate("{width} × {height} in", { width: Math.round(artifact.value.widthPoints / 72 * 100) / 100, height: Math.round(artifact.value.heightPoints / 72 * 100) / 100 }) : "");
function changeZoom(amount: number) { zoom.value = Math.min(400, Math.max(50, Math.round((effectiveZoom.value + amount) / 25) * 25)); }
function imageLoaded(event: Event) {
  const image = event.target as HTMLImageElement;
  naturalWidth.value = image.naturalWidth || 288; naturalHeight.value = image.naturalHeight || 432;
}
watch(() => props.src, () => { zoom.value = "fit"; });
onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !stage.value) return;
  observer = new ResizeObserver(([entry]) => { stageWidth.value = entry.contentRect.width; stageHeight.value = entry.contentRect.height; });
  observer.observe(stage.value);
});
onScopeDispose(() => observer?.disconnect());
</script>

<style scoped>
.preview-panel { margin: 0; overflow: hidden; }
.preview-heading { display: flex; justify-content: space-between; align-items: center; gap: var(--spacer-sm); }
.preview-heading ion-note { text-align: end; }
.preview-context { color: var(--ion-color-medium-shade); margin: var(--spacer-xs) 0 0; }
.preview-tools { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacer-2xs); padding: var(--spacer-xs) var(--spacer-sm); border-block: 1px solid var(--ion-border-color, var(--ion-color-light-shade)); }
.preview-tools ion-button { min-height: 2.75rem; margin: 0; }
.preview-tools .zoom-button { min-width: 2.75rem; }
.pdf-action { margin-left: auto !important; }
.zoom-label { min-width: 3rem; text-align: center; color: var(--ion-color-medium-shade); }
.document-stage { height: clamp(32rem, calc(100vh - 19rem), 52rem); padding: var(--spacer-base); box-sizing: border-box; overflow: auto; background: var(--ion-color-light); }
.document-stage:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: -2px; }
.paper-scroll { display: flex; justify-content: center; width: max-content; min-width: 100%; }
.document-preview { display: block; flex: none; max-width: none; height: auto; border: 1px solid var(--ion-color-light-shade); }
.stage-message { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: var(--spacer-lg); box-sizing: border-box; }
.stage-message > ion-icon { font-size: var(--spacer-2xl); color: var(--ion-color-medium); }
.stage-message h3 { margin: var(--spacer-sm) 0 var(--spacer-xs); }
.stage-message p { max-width: 25rem; color: var(--ion-color-medium-shade); margin-block: var(--spacer-xs); }
.stage-message ion-button { min-height: 2.75rem; }
.preview-quality { margin: 0; padding: var(--spacer-sm) var(--spacer-base); color: var(--ion-color-medium-shade); font-size: 0.875rem; }
@media (max-width: 991px) { .document-stage { height: 38rem; } }
@media (max-width: 480px) { .pdf-action { margin-left: 0 !important; } .preview-heading { align-items: start; } .document-stage { height: 32rem; } }
</style>
