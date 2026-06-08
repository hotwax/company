# MDM Management — Company PWA Design Spec

**Date:** 2026-06-08  
**Status:** Approved  
**Owner:** Anil Patel  

---

## Problem

HotWax OMS uses a Data Manager (MDM) system to bulk-import and export data: product
settings, inventory costs, carrier codes, facility associations, and 130+ other configs.
The current admin UI lives in Moqui — a dense table that is not usable by business
operators on mobile and requires knowing cryptic config IDs.

The Company PWA needs a clean MDM management UX that serves two personas:

- **Operations team** — run the same configs routinely; need fast status monitoring and
  quick upload.
- **Business admin** — set up or troubleshoot configs; need context about what each config
  does and full CRUD.

Primary daily job: **check status of recent imports** across all configs.

---

## Data Model (OMS side)

### `DataManagerConfig`
| Field | Type | Notes |
|-------|------|-------|
| `configId` | PK | ALLCAPS_SNAKE, e.g. `AVG_INV_COST_FEED` |
| `description` | string | Human-readable label |
| `importServiceName` | string | Moqui service to call for import |
| `exportServiceName` | string | Optional export service |
| `executionModeId` | enum `DMC_EXEC_MODE` | `Queue` (default), `Immediate` |
| `multiThreading` | Y/N | Default N |
| `priority` | int | Higher = runs first |

### `DataManagerLog`
| Field | Type | Notes |
|-------|------|-------|
| `logId` | PK | |
| `configId` | FK → DataManagerConfig | |
| `statusId` | enum | `DmlsPending`, `DmlsRunning`, `DmlsFinished`, `DmlsCancelled`, `DmlsCrashed` |
| `createdDate` | datetime | When log was created (file uploaded) |
| `startDateTime` | datetime | When processing began |
| `finishDateTime` | datetime | When processing ended |
| `totalRecordCount` | int | |
| `failedRecordCount` | int | |
| `productStoreId` | string | Which store this import was for |
| `createdByUserLogin` | string | Who uploaded the file |

### REST API (base: `/rest/s1/admin`)

All MDM endpoints are under the `/dataManager` resource.

#### Available today

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/dataManager` | All configs |
| `GET` | `/dataManager/{configId}` | Single config |
| `GET` | `/dataManager/{configId}/downloadTemplate` | CSV template (CSV only — no JSON) |
| `GET` | `/dataManager/logs` | Cross join Log + Content |
| `GET` | `/dataManager/logs/{logId}` | Single log |
| `PUT` | `/dataManager/logs/{logId}` | Update log (cancel) |
| `GET` | `/dataManager/downloadDataManagerFile` | Params: `logContentId` + `configId` |
| `GET` | `/dataManager/details` | **Primary endpoint.** `DataManagerLogDetails` view — config fields + log fields + `logContentId` + `errorLogContentId`. Filterable by `configId`, `statusId`, date range. Paginated. |
| `POST` | `/uploadDataManagerFile` | Multipart: `configId` + file. Returns `logId`. |

#### Missing — must be added to `admin.rest.xml` before implementation

| Method | Path | What to add |
|--------|------|-------------|
| `POST` | `/dataManager` | `DataManagerConfig` entity `create` |
| `PUT` | `/dataManager/{configId}` | `DataManagerConfig` entity `update` |
| `DELETE` | `/dataManager/logs/{logId}` | `remove#DataManagerLog` service |

---

## Design

### UI Patterns — existing codebase only

All markup, components, and CSS **must match patterns already used in the Company app**.
No new CSS classes, no custom markup patterns, no new component compositions.

Confirmed existing patterns to use:

| Need | Use exactly this |
|------|-----------------|
| Page shell | `ion-page` + `ion-header :translucent` + `ion-toolbar` + `ion-content` |
| Upload action in toolbar | `ion-buttons slot="end"` + `ion-button` icon-only + `ion-icon :icon="cloudUploadOutline"` |
| Two-tab layout | `ion-segment` + `ion-segment-button` inside `ion-item` at top of `ion-content` (same as ShopifyProductSync — no view uses segment in the header) |
| Status filter | `ion-select` inside `ion-item` with `interface="popover"` (same as ShopifyProductSyncHistory) |
| Config search | `ion-searchbar` (same as TimezoneModal / ShopifyConnections) |
| List rows | `div.list-item` + `ion-item lines="none"` + `ion-label` (same as ShopifyConnections) |
| Status display | `ion-chip outline :color="..."` + `ion-label` + `ion-icon` (same as ShopifyProductSyncHistoryView) |
| Download action | `ion-chip outline` with `downloadOutline` icon (same as ShopifyProductSyncHistoryView) |
| Accordion runs | `ion-accordion-group` + `ion-accordion` + `div.list-item slot="header"` + `ion-list slot="content"` (same as ShopifyProductSyncHistoryView) |
| Loading state | `ion-card` with `ion-spinner name="crescent"` (same as ShopifyProductSync) |
| Error state | `ion-card` + `ion-button fill="outline"` retry (same as ShopifyProductSync) |
| `showToast` | `import { showToast } from '@/utils'` — NOT from `@common` |
| Empty state | `div.empty-state` (class already in variables.css) |
| FAB | `ion-fab slot="fixed" vertical="bottom" horizontal="end"` + `ion-fab-button` + `ion-icon :icon="addOutline"` (same as ShopifyConnections) |
| Modals | `modalController.create({ component: XyzModal })` + `modal.present()` (same as ShopifyConnections) |
| CSS spacing | `--spacer-sm`, `--spacer-lg`, `--border-medium` (already in variables.css) |

---

### Page: MDM (`/mdm`)

```
ion-page
  ion-header :translucent
    ion-toolbar
      ion-menu-button slot="start"
      ion-title  "MDM"
      ion-buttons slot="end"
        ion-button @click="openUploadModal()" [icon-only, cloudUploadOutline]
  ion-content
    <!-- segment tab switcher -->
    ion-item
      ion-segment :value="activeTab" @ionChange="activeTab = $event.detail.value"
        ion-segment-button value="imports"  → "Imports"
        ion-segment-button value="configs"  → "Configs"
    <!-- conditional tab content -->
    <MdmImportsTab v-if="activeTab === 'imports'" />
    <MdmConfigsTab v-else />
```

---

### Tab 1: Imports

**Layout** (follows ShopifyProductSyncHistory filter + ShopifyProductSyncHistoryView accordion):

```
ion-list lines="full"
  ion-list-header
    ion-label  "Filters"
  ion-item
    ion-select label="Status" interface="popover" v-model="statusFilter"
      ion-select-option value=""    "All statuses"
      ion-select-option value="DmlsPending"   "Pending"
      ion-select-option value="DmlsRunning"   "Running"
      ion-select-option value="DmlsFinished"  "Finished"
      ion-select-option value="DmlsFailed"    "Failed"

ion-card v-if="fetchStatus.logs === 'pending'"
  ion-card-header  → ion-card-title "Loading imports"
  ion-card-content → ion-spinner name="crescent"

ion-card v-else-if="fetchStatus.logs === 'error'"
  ion-card-header  → ion-card-title "Could not load imports"
  ion-card-content → ion-button fill="outline" @click="fetchLogs()" "Retry"

ion-list  (v-else)
  ion-list-header
    ion-label  "A list of recent import runs"
  ion-accordion-group
    ion-accordion v-for="log in filteredLogs" :key="log.logId" :value="log.logId"
      div.list-item slot="header"
        ion-item lines="none"
          ion-icon slot="start" :icon="getLogIcon(log)" :color="getLogIconColor(log)"
          ion-label
            {{ log.description }}          ← from config
            p  {{ log.configId }}
            p  {{ translate("Created") }}: {{ formatDateTime(log.createdDate) }}
        ion-label.stat
          ion-chip outline :color="getMdmStatusColor(log)"
            ion-label  {{ getMdmStatusLabel(log) }}
            ion-icon   :icon="getMdmStatusIcon(log)"
          p  {{ translate("Status") }}
        ion-label.stat
          ion-chip outline :color="getCountChipColor(log)"
                   :disabled="!log.logContentId"
                   @click.stop="downloadFile(log)"
            ion-icon :icon="downloadOutline"
            ion-label  {{ log.totalRecordCount }}
          p  {{ translate("total records") }}
        ion-label.stat
          ion-chip outline :color="getErrorChipColor(log)"
                   :disabled="!log.errorLogContentId"
                   @click.stop="downloadErrorFile(log)"
            ion-icon :icon="downloadOutline"
            ion-label  {{ log.failedRecordCount || 0 }}
          p  {{ translate("failed records") }}
      ion-list slot="content" lines="full"
        ion-item
          ion-label
            {{ translate("Log ID") }}
            p  {{ log.logId }}
        ion-item
          ion-label
            {{ translate("Config") }}
            p  {{ log.configId }}
        ion-item
          ion-label
            {{ translate("Created") }}
            p  {{ formatDateTime(log.createdDate) }}
        ion-item
          ion-label
            {{ translate("Started") }}
            p  {{ formatDateTime(log.startDateTime) }}
        ion-item
          ion-label
            {{ translate("Finished") }}
            p  {{ formatDateTime(log.finishDateTime) }}

div.empty-state v-if="!filteredLogs.length && fetchStatus.logs === 'success'"
  p  {{ translate("No recent imports") }}
```

**Auto-refresh:** poll `/dataManager/details` every 30 s while any log is `DmlsPending` or `DmlsRunning`.

**Infinite scroll:** `ion-infinite-scroll` + `ion-infinite-scroll-content loading-spinner="crescent"`.

---

### Tab 2: Configs

```
ion-searchbar :placeholder="translate('Search configs…')"
              v-model="configSearch"
              debounce="300"

ion-list
  ion-list-header
    ion-label  "Configs"
  div.list-item v-for="config in filteredConfigs" @click="openConfigDetail(config.configId)"
    ion-item lines="none"
      ion-label
        {{ config.description }}
        p  {{ config.configId }}
    div  ← spacer / tablet col
    div
      ion-chip outline
        ion-label  {{ config.executionModeId }}

ion-fab slot="fixed" vertical="bottom" horizontal="end"
  ion-fab-button @click="openAddConfigModal()"
    ion-icon :icon="addOutline"
```

---

### Config Detail Page (`/mdm/configs/:configId`)

Pushed onto router stack — standard back-nav pattern.

```
ion-page
  ion-header
    ion-toolbar
      ion-back-button slot="start" default-href="/mdm"
      ion-title  {{ config.description }}
      ion-buttons slot="end"
        ion-button @click="openEditConfigModal()"  "Edit"

  ion-content
    ion-list lines="full"
      ion-list-header
        ion-label  "Config details"
      ion-item
        ion-label  Config ID        / p {{ config.configId }}
      ion-item
        ion-label  Import Service   / p {{ config.importServiceName }}
      ion-item
        ion-label  Execution Mode   / p {{ config.executionModeId }}
      ion-item
        ion-label  Multi Threading  / p {{ config.multiThreading }}
      ion-item
        ion-label  Priority         / p {{ config.priority || '—' }}

    ion-list lines="full"
      ion-list-header
        ion-label  "Recent runs"
        ion-button slot="end" @click="openUploadModal(config.configId)"
          ion-icon :icon="cloudUploadOutline"

      ion-accordion-group
        ← same accordion pattern as Imports tab, filtered to this configId

    div.empty-state v-if="!configLogs.length && ..."
      p  {{ translate("No runs yet") }}
```

---

### Upload Modal (`MdmUploadModal.vue`)

Opened via `modalController.create({ component: MdmUploadModal, componentProps: { configId } })`.

```
ion-header
  ion-toolbar
    ion-buttons slot="start"
      ion-button @click="closeModal()"
        ion-icon slot="icon-only" :icon="closeOutline"
    ion-title  "Upload File"

ion-content
  ion-list
    ion-item
      ion-select label="Config *" label-placement="stacked"
                 interface="popover"
                 v-model="selectedConfigId"
                 @ionChange="onConfigSelected"
        ion-select-option v-for="cfg in configs"  {{ cfg.description }} ({{ cfg.configId }})

    ion-item
      ion-label position="stacked"  "File *"
      input type="file" accept=".csv"

    ion-item v-if="selectedConfigId"
      ion-button fill="outline" @click="downloadTemplate(selectedConfigId)"
        ion-icon slot="start" :icon="downloadOutline"
        "Download CSV template"

  ion-button class="ion-margin" expand="block"
             :disabled="!selectedConfigId || !selectedFile"
             @click="upload()"
    "Upload"
```

On success: dismiss modal → refresh Imports tab → logs reload.

---

### Edit/Add Config Modal (`MdmConfigModal.vue`)

Opened via `modalController.create({ component: MdmConfigModal, componentProps: { config } })`.
`config` is `null` for Add, populated for Edit.

```
ion-header
  ion-toolbar
    ion-buttons slot="start"
      ion-button @click="closeModal()"
        ion-icon slot="icon-only" :icon="closeOutline"
    ion-title  "Edit Config" / "Add Config"

ion-content
  ion-list
    ion-item v-if="isAdd"
      ion-input label="Config ID *" label-placement="stacked"
                v-model="form.configId" placeholder="ALLCAPS_SNAKE"

    ion-item
      ion-input label="Description" label-placement="stacked"
                v-model="form.description"

    ion-item
      ion-input label="Import Service" label-placement="stacked"
                v-model="form.importServiceName"

    ion-item
      ion-select label="Execution Mode" interface="popover"
                 v-model="form.executionModeId"
        ion-select-option value="Queue"     "Queue"
        ion-select-option value="Immediate" "Immediate"

    ion-item
      ion-label  "Multi Threading"
      ion-toggle slot="end" v-model="multiThreadingBool"

    ion-item
      ion-input label="Priority" label-placement="stacked"
                type="number" v-model="form.priority"

ion-fab slot="fixed" vertical="bottom" horizontal="end"
  ion-fab-button @click="save()" :disabled="!isFormValid"
    ion-icon :icon="saveOutline"
```

---

## Component Map

| Component | Route / Location | Notes |
|-----------|-----------------|-------|
| `MdmPage.vue` | `/mdm` | Segment host; holds `activeTab` state |
| `MdmImportsTab.vue` | component in MdmPage | Accordion imports feed |
| `MdmConfigsTab.vue` | component in MdmPage | Searchable config list |
| `MdmConfigDetail.vue` | `/mdm/configs/:configId` | Config info + recent runs |
| `MdmUploadModal.vue` | modal | Upload bottom sheet |
| `MdmConfigModal.vue` | modal | Add/Edit config form |

---

### Store: `useMdmStore` (Pinia)

```typescript
state: () => ({
  configs: [] as any[],
  logs: [] as any[],
  fetchStatus: {
    configs: 'none',   // 'none' | 'pending' | 'success' | 'error'
    logs: 'none',
    lastFetched: 0
  }
})
```

Actions:
- `fetchConfigs()` — `GET /dataManager`
- `fetchLogs(params?)` — `GET /dataManager/details` with optional filters
- `createConfig(data)` — `POST /dataManager` *(requires new REST endpoint)*
- `updateConfig(data)` — `PUT /dataManager/{configId}` *(requires new REST endpoint)*
- `removeLog(logId)` — `DELETE /dataManager/logs/{logId}` *(requires new REST endpoint)*

File download actions delegate to the existing `useDataManagerLog` composable:
- `downloadDataManagerFile(configId, logContentId)` — already in composable
- `downloadTemplate(configId)` — call directly from component
- Upload — call `/uploadDataManagerFile` directly from `MdmUploadModal`

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Fetch configs/logs fails | `ion-card` error state with "Retry" button |
| Upload fails | `showToast` with error message; modal stays open |
| Error file not available | `ion-chip` is `:disabled="!log.errorLogContentId"` |
| Config not found | `ion-back-button` + toast |
| Running log poll | 30 s interval; stop when all logs terminal |

---

## Out of Scope

- Export flows (`exportServiceName`) — separate spec
- DataManagerMapping management — separate spec
- Re-running a failed import — future enhancement

---

## OMS Changes Required

Three REST endpoints missing from `admin.rest.xml` in `maarg-util`:

```xml
<!-- In the existing <resource name="dataManager"> block -->

<!-- 1. Create config -->
<method type="post">
    <entity name="co.hotwax.datamanager.DataManagerConfig" operation="create"/>
</method>

<!-- 2. Update config — inside <id name="configId"> -->
<method type="put">
    <entity name="co.hotwax.datamanager.DataManagerConfig" operation="update"/>
</method>

<!-- 3. Delete log — inside <id name="logId"> under <resource name="logs"> -->
<method type="delete">
    <service name="co.hotwax.util.UtilityServices.remove#DataManagerLog"/>
</method>
```
