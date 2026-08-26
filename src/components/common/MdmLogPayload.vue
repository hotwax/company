<template>
  <section class="payload">
    <div class="payload-header">
      <h3>
        <ion-icon :icon="codeWorkingOutline" /> {{ translate("Payload") }}
        <ion-chip v-if="contentType && !isParametersView" class="type-chip" outline>
          {{ contentType.toUpperCase() }}
        </ion-chip>
      </h3>
      <div v-if="!isParametersView" class="payload-actions">
        <ion-button fill="clear" size="small" :disabled="!rawText" :title="translate('Copy')" @click="copyContent">
          <ion-icon slot="icon-only" :icon="copyOutline" />
        </ion-button>
        <ion-button fill="clear" size="small" :disabled="!rawText" :title="translate('Download')" @click="downloadContent">
          <ion-icon slot="icon-only" :icon="downloadOutline" />
        </ion-button>
      </div>
    </div>

    <div v-if="payloadTabs.length > 1 || contentType" class="payload-controls">
      <ion-segment v-if="payloadTabs.length > 1" v-model="selectedPayload" :scrollable="true">
        <ion-segment-button v-for="tab in payloadTabs" :key="tab.key" :value="tab.key">
          <ion-label>{{ tab.label }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      <ion-searchbar
        v-if="contentType && !isParametersView"
        class="payload-search"
        :value="payloadSearch"
        :debounce="200"
        :placeholder="contentType === 'csv' ? translate('Filter rows') : translate('Search keys and values')"
        @ion-input="payloadSearch = ($event as any).detail.value || ''"
      />
    </div>

    <!-- Parameters is a sibling view in the same segment rather than a payload: it renders the
         import settings and the values this log ran with, against the service's own contract. -->
    <div v-if="isParametersView">
      <ion-list v-if="importSettings.length" lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Import Settings") }}</ion-label>
        </ion-list-header>
        <ion-item v-for="setting in importSettings" :key="setting.label">
          <ion-label class="ion-text-wrap">
            <p>{{ setting.label }}</p>
            {{ setting.value }}
          </ion-label>
        </ion-item>
      </ion-list>

      <div v-if="parametersLoading" class="payload-loading">
        <ion-spinner name="crescent" />
      </div>
      <ion-list v-else-if="mergedParameters.length" lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Parameters") }}</ion-label>
        </ion-list-header>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            <p>{{ translate("Parameters the import service accepts, with the values this log was created with.") }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-for="parameter in mergedParameters" :key="parameter.name">
          <ion-label class="ion-text-wrap">
            {{ parameter.name }}
            <p v-if="parameter.submitted">
              {{ parameter.value }}
            </p>
            <p v-else>
              {{ translate("Not set for this log") }}
            </p>
            <p v-if="parameter.type">
              {{ parameter.type }}
            </p>
            <p v-if="parameter.default">
              {{ translate("Default:") }} {{ parameter.default }}
            </p>
            <p v-if="!parameter.inContract">
              {{ translate("Not declared by the service") }}
            </p>
          </ion-label>
          <ion-badge v-if="parameter.required" slot="end" color="medium">
            {{ translate("Required") }}
          </ion-badge>
        </ion-item>
      </ion-list>
      <p v-if="!parametersLoading && !mergedParameters.length" class="payload-empty">
        {{ translate("No parameters found for this log.") }}
      </p>
    </div>

    <div v-else-if="loading" class="payload-loading">
      <ion-spinner name="crescent" />
    </div>
    <JsonViewer v-else-if="contentType === 'json'" :data="parsedJson" :search="payloadSearch" />
    <CsvViewer v-else-if="contentType === 'csv'" :rows="csvRows" :search="payloadSearch" />
    <pre v-else-if="contentType === 'text'" class="raw-text">{{ rawText }}</pre>
    <p v-else class="payload-empty">
      {{ translate("No payload content available") }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { commonUtil, logger, translate } from "@common";
import {
  IonBadge, IonButton, IonChip, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonSearchbar,
  IonSegment, IonSegmentButton, IonSpinner,
} from "@ionic/vue";
import { saveAs } from "file-saver";
import { codeWorkingOutline, copyOutline, downloadOutline } from "ionicons/icons";
import { computed, markRaw, ref, shallowRef, watch } from "vue";
import CsvViewer from "@/components/common/CsvViewer.vue";
import JsonViewer from "@/components/common/JsonViewer.vue";
import {
  fetchDataManagerFileContent,
  fetchDataManagerLogParameters,
  fetchServiceInParameters,
} from "@/utils/dataManagerFile";

/**
 * The source and error payloads of one DataManagerLog, presented the way job-manager's file-history
 * detail presents them: Original / Errors tabs, a type chip, search, copy and download.
 *
 * `DataManagerLogDetails` carries file REFERENCES (`logContentId`, `errorLogContentId`), never the
 * content — reading `log.sourceContent`/`log.errorContent` yields undefined. The bytes come from
 * `admin/dataManager/downloadDataManagerFile`, fetched here.
 */
const props = defineProps<{ log: any }>();

type PayloadKey = "original" | "errors" | "parameters";
type FilePayloadKey = "original" | "errors";
type ContentType = "" | "json" | "csv" | "text";
interface ParsedPayload {
  contentType: ContentType;
  parsedJson: any;
  csvRows: any[];
  rawText: string;
  fileName?: string;
}

function createPayload(fileName?: string): ParsedPayload {
  return { contentType: "", parsedJson: null, csvRows: [], rawText: "", fileName };
}

const selectedPayload = ref<PayloadKey>("original");
const payloadSearch = ref("");
const loading = ref(false);
// shallowRef + markRaw: parsed payloads are read-only display data, and deep reactivity would proxy
// every node of a large file.
const payloads = shallowRef<Record<FilePayloadKey, ParsedPayload>>({
  original: createPayload(),
  errors: createPayload(),
});
const loaded = ref<Record<FilePayloadKey, boolean>>({ original: false, errors: false });
let generation = 0;

const parametersLoading = ref(false);
const parametersLoaded = ref(false);
const serviceParameters = ref<any[]>([]);
const logParameters = ref<any[]>([]);

/** A row of the Parameters tab: the service's declared contract, with this log's value overlaid. */
interface MergedParameter {
  name: string;
  type?: string;
  default?: string;
  required: boolean;
  submitted: boolean;
  value?: any;
  inContract: boolean;
}

const isParametersView = computed(() => selectedPayload.value === "parameters");

// Per-log import settings the surrounding timeline row does not already state.
const importSettings = computed(() => [
  { label: translate("Import Path"), value: props.log?.importPath },
  { label: translate("Multi Threading"), value: props.log?.multiThreading },
].filter((setting: any) => setting.value));

/**
 * One list: the service contract is the master set of rows, with the values this log was actually
 * created with overlaid onto the ones that match by name. A submitted parameter the service does
 * not declare is still listed rather than dropped, so nothing is hidden.
 */
const mergedParameters = computed<MergedParameter[]>(() => {
  const submitted = new Map(logParameters.value.map((p: any) => [p.parameterName, p.parameterValue]));
  const declaredNames = new Set(serviceParameters.value.map((p: any) => p.name));
  const declared: MergedParameter[] = serviceParameters.value.map((p: any) => ({
    name: p.name,
    type: p.type,
    default: p.default,
    required: p.required === "true" || p.required === true,
    submitted: submitted.has(p.name),
    value: submitted.get(p.name),
    inContract: true,
  }));
  const extras: MergedParameter[] = logParameters.value
    .filter((p: any) => !declaredNames.has(p.parameterName))
    .map((p: any) => ({
      name: p.parameterName,
      required: false,
      submitted: true,
      value: p.parameterValue,
      inContract: false,
    }));

  return [...declared, ...extras];
});

async function loadParameters() {
  if(parametersLoaded.value || !props.log?.logId) { return; }

  parametersLoading.value = true;
  try {
    const [submitted, declared] = await Promise.all([
      fetchDataManagerLogParameters(props.log.logId),
      props.log?.importServiceName ? fetchServiceInParameters(props.log.importServiceName) : Promise.resolve([]),
    ]);
    logParameters.value = submitted;
    serviceParameters.value = declared;
    parametersLoaded.value = true;
  } finally {
    parametersLoading.value = false;
  }
}

const failedRecordCount = computed(() => Number(props.log?.failedRecordCount) || 0);
const hasErrorPayload = computed(() => !!props.log?.errorLogContentId && failedRecordCount.value > 0);

const payloadTabs = computed(() => {
  const tabs = [{ key: "original" as PayloadKey, label: translate("Original") }];
  if(hasErrorPayload.value) {
    tabs.push({ key: "errors" as PayloadKey, label: `${translate("Errors")} (${failedRecordCount.value})` });
  }
  tabs.push({ key: "parameters" as PayloadKey, label: translate("Parameters") });

  return tabs;
});

const activePayload = computed(() => payloads.value[selectedPayload.value as FilePayloadKey] || createPayload());
const contentType = computed(() => activePayload.value.contentType);
const parsedJson = computed(() => activePayload.value.parsedJson);
const csvRows = computed(() => activePayload.value.csvRows);
const rawText = computed(() => activePayload.value.rawText);

async function detectAndParse(raw: string, fileName?: string, preParsed?: any): Promise<ParsedPayload> {
  const isCsvName = (fileName || "").toLowerCase().endsWith(".csv");
  // Only allocate a trimmed copy when there is leading whitespace to remove.
  const body = /^\s/.test(raw) ? raw.replace(/^\s+/, "") : raw;

  if(!isCsvName && preParsed !== undefined && preParsed !== null) {
    return { ...createPayload(fileName), contentType: "json", parsedJson: markRaw(preParsed), rawText: raw };
  }
  if(!isCsvName && (body.startsWith("{") || body.startsWith("["))) {
    try {
      return { ...createPayload(fileName), contentType: "json", parsedJson: markRaw(JSON.parse(body)), rawText: raw };
    } catch {
      // fall through to CSV / text
    }
  }
  try {
    const rows = (await commonUtil.parseCsv(body as any)) as any[];
    if(rows && rows.length) {
      return { ...createPayload(fileName), contentType: "csv", csvRows: markRaw(rows), rawText: raw };
    }
  } catch {
    // fall through to raw text
  }

  return { ...createPayload(fileName), contentType: "text", rawText: raw };
}

async function load(key: FilePayloadKey) {
  const log = props.log;
  const contentId = key === "errors" ? log?.errorLogContentId : log?.logContentId;
  const fileName = key === "errors" ? log?.errorFileName : log?.fileName;
  if(!log?.configId || !contentId || loaded.value[key]) { return; }

  const current = ++generation;
  loading.value = true;
  try {
    const raw = await fetchDataManagerFileContent(log.configId, contentId);
    if(current !== generation) { return; }

    payloads.value = {
      ...payloads.value,
      [key]: raw ? await detectAndParse(raw.text, fileName, raw.parsed) : createPayload(fileName),
    };
    loaded.value = { ...loaded.value, [key]: true };
  } catch (error) {
    logger.error("Failed to load Data Manager payload", log?.logId, key, error);
  } finally {
    if(current === generation) { loading.value = false; }
  }
}

const copyContent = async () => {
  try {
    await commonUtil.copyToClipboard(rawText.value, translate("Copied to clipboard"));
  } catch {
    commonUtil.showToast(translate("Failed to copy"));
  }
};

const downloadContent = () => {
  if(!rawText.value) { return; }
  const blob = new Blob([rawText.value], { type: "text/plain;charset=utf-8" });
  saveAs(blob, activePayload.value.fileName || `${props.log?.logId || "payload"}.txt`);
};

watch(selectedPayload, (key) => {
  if(key === "parameters") {
    void loadParameters();

    return;
  }
  void load(key);
});
watch(() => props.log?.logId, () => {
  generation++;
  selectedPayload.value = "original";
  payloadSearch.value = "";
  payloads.value = { original: createPayload(), errors: createPayload() };
  loaded.value = { original: false, errors: false };
  parametersLoaded.value = false;
  serviceParameters.value = [];
  logParameters.value = [];
  void load("original");
}, { immediate: true });
</script>

<style scoped>
.payload {
  margin-block-start: var(--spacer-sm);
}

.payload-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacer-sm);
}

.payload-header h3 {
  display: flex;
  align-items: center;
  gap: var(--spacer-xs);
  margin: 0;
  font-size: 1rem;
}

.payload-controls {
  display: flex;
  flex-direction: column;
  gap: var(--spacer-xs);
  margin-block-end: var(--spacer-xs);
}

.payload-loading,
.payload-empty {
  padding: var(--spacer-sm);
  color: var(--ion-color-medium);
}

.raw-text {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
