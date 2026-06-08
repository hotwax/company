# MDM Management — Company PWA Design Spec

**Date:** 2026-06-08  
**Status:** Approved  
**Owner:** Anil Patel  

---

## Problem

HotWax OMS uses a Data Manager (MDM) system to bulk-import and export data: product
settings, inventory costs, carrier codes, facility associations, and 130+ other configs.
The current admin UI lives in Moqui (`/qapps/Oms/DataManager/…`) — a dense table that is
not usable by business operators on mobile and requires knowing cryptic config IDs.

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
| `fileNamePattern` | string | Filename convention |
| `delimiter` | string | CSV delimiter (default comma) |

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
| `uploadFileContentId` | FK | The uploaded file (content store) |
| `errorRecordContentId` | FK | Error CSV file (present when failedRecordCount > 0) |

### REST API (base: `/rest/s1/admin`)

All MDM endpoints are under the `/dataManager` resource. (The `/permissions` resource in
`admin.rest.xml` is `SecurityPermission` — unrelated to MDM despite the confusing Moqui
admin screen URL.)

#### Available today

| Method | Path | Backed by | Notes |
|--------|------|-----------|-------|
| `GET` | `/dataManager` | `DataManagerConfig` entity list | All fields filterable as query params |
| `GET` | `/dataManager/{configId}` | `DataManagerConfig` entity one | |
| `GET` | `/dataManager/{configId}/downloadTemplate` | `download#Template` service | Generates CSV with column headers derived from import service in-params. **CSV only — no JSON template.** |
| `GET` | `/dataManager/logs` | `DataManagerLogAndContent` view list | Cross join of Log + one Content record; use `/details` for the Imports feed |
| `GET` | `/dataManager/logs/{logId}` | `DataManagerLog` entity one | |
| `PUT` | `/dataManager/logs/{logId}` | `DataManagerLog` entity update | Used to cancel a running log |
| `GET` | `/dataManager/downloadDataManagerFile` | `download#DataManagerFile` service | Params: `logContentId` (required) + `configId` (required). Get `logContentId` from `/details` response. |
| `GET` | `/dataManager/details` | `get#DataManagerLogDetails` service | **Primary endpoint for Imports feed.** Returns `DataManagerLogDetails` view: all Config fields + all Log fields + `logContentId` (uploaded file) + `errorLogContentId` (error file) in one row. Filterable by `configId`, `statusId`, `createdDate_from/thru`. Paginated. |
| `POST` | `/uploadDataManagerFile` | `upload#DataManagerFile` service | Multipart: `configId` (required) + file. Returns `logId`. |

#### Missing — must be added to `admin.rest.xml` before implementation

| Method | Path | What to add |
|--------|------|-------------|
| `POST` | `/dataManager` | `DataManagerConfig` entity `create` |
| `PUT` | `/dataManager/{configId}` | `DataManagerConfig` entity `update` |
| `DELETE` | `/dataManager/logs/{logId}` | `remove#DataManagerLog` service (already exists, just not exposed) |

These three additions to `admin.rest.xml` are required before the Configs CRUD and log
delete features can be built. They are a one-line change each. OMS PR should go in before
the Company app implementation starts.

---

## Design

### Page: MDM (`/mdm`)

Top-level nav item in Company app alongside Facilities, Products, etc.

The page renders a two-tab layout using `ion-segment`:

| Tab | Route segment | Default |
|-----|---------------|---------|
| Imports | `imports` | ✓ yes |
| Configs | `configs` | |

---

### Tab 1: Imports

**Purpose:** Cross-config activity feed. Primary screen for the operations persona.

**Layout:**

```
Toolbar: "MDM"                            [Upload ↑]
─────────────────────────────────────────────────────
Segment: [Imports] [Configs]
─────────────────────────────────────────────────────
Filter chips:  [All] [Pending] [Running] [Failed]
─────────────────────────────────────────────────────
┌──────────────────────────────────────────────────┐
│  IMP_FACILITY_ASSOC                              │
│  Import Facility Association                     │
│  ● Finished   2026-06-08 14:22        1,240 / 0 │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│  BULK_IMP_ORDERS_MF                              │
│  Import Shopify Order Metafields                 │
│  ⚠ Failed     2026-06-08 09:11         530 / 12 │
│                               [⬇ Error file]    │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│  AVG_INV_COST_FEED                               │
│  Average Inventory Cost                          │
│  ⏳ Pending   2026-06-08 14:45               — / —│
└──────────────────────────────────────────────────┘
```

**Filter chips:** All (default) / Pending / Running / Failed. Chips filter the in-memory
list; no additional API call per filter change.

**Log card fields:**
- Config ID (small, secondary) + Description (primary, bold)
- Status chip: color-coded
  - `DmlsPending` → gray / "Pending"
  - `DmlsRunning` → blue / "Running"
  - `DmlsFinished` → green / "Finished"
  - `DmlsCancelled` → orange / "Cancelled"
  - `DmlsCrashed` / `DmlsFailed` → red / "Failed"
- Timestamp: `createdDate` formatted as "DD Mon HH:mm"
- Record counts: `totalRecordCount / failedRecordCount` — right-aligned
- **Error file button** (only when `failedRecordCount > 0`): tapping calls
  `GET /dataManager/downloadDataManagerFile?logContentId={errorLogContentId}&configId={configId}`.
  `errorLogContentId` comes from the `/dataManager/details` response.

**Tap log card** → opens `ion-modal` as a bottom sheet with full log detail:
- Config ID + description
- Status + createdDate + startDateTime + finishDateTime
- Total records / failed records
- Product store
- Uploaded by (createdByUserLogin)
- [Download uploaded file] button
- [Download error file] button (if applicable)

**Auto-refresh:** When the tab is active and any log has status `DmlsPending` or
`DmlsRunning`, poll `GET /dataManager/details` (same params as initial load) every 30
seconds. Stop polling when all visible logs are terminal (Finished / Cancelled / Crashed).

**Upload button** in toolbar → triggers upload bottom sheet (see Upload Flow section).

**Empty state:** "No recent imports. Upload a file to get started."

**Pagination:** Load 50 most recent logs on mount, sorted by `createdDate` desc. Infinite
scroll loads the next page.

---

### Tab 2: Configs

**Purpose:** Browsable, searchable config list with full CRUD. For the business admin persona.

**Layout:**

```
Segment: [Imports] [Configs]
─────────────────────────────────────────────────────
[🔍  Search configs…                               ]
─────────────────────────────────────────────────────
  AVG_INV_COST_FEED
  Average Inventory Cost                     Queue  ›
─────────────────────────────────────────────────────
  CARRIER_CODE
  Carrier Postal Code Mapping                Queue  ›
─────────────────────────────────────────────────────
  …
─────────────────────────────────────────────────────
                                         [+ Add Config]
```

- Search filters by `configId` and `description` client-side (all 137 configs load on
  mount — dataset is small).
- Sorted alphabetically by `description`.
- Each row: configId (secondary text), description (primary), executionMode chip, chevron.

**Config detail page** (pushes onto router stack):

```
← Average Inventory Cost [AVG_INV_COST_FEED]    [Edit]
──────────────────────────────────────────────────────
Config ID        AVG_INV_COST_FEED
Import Service   importAverageInventoryCost
Execution Mode   Queue
Multi Threading  N
Priority         —
Last Updated     2026-06-04 07:28
──────────────────────────────────────────────────────
Recent Runs                                  [Upload ↑]
──────────────────────────────────────────────────────
  ● Finished   2026-06-08 14:22   1,240 / 0
  ● Finished   2026-06-01 09:15     980 / 0
  ⚠ Failed     2026-05-28 11:02     412 / 7   [⬇ Error]
```

- Recent Runs shows the last 10 logs for this config (filter by `configId`).
- **Upload** button in Recent Runs header — pre-selects this config in the upload sheet.
- Tap a run row → same log detail sheet as in Imports tab.

**Edit config:** Tapping `[Edit]` opens an `ion-modal` form:
- Import Service Name (text)
- Description (text)
- Execution Mode ID (ion-select from `DMC_EXEC_MODE` enum values)
- Multi Threading (ion-toggle, Y/N)
- Priority (number input)
- [Save] → `update#DataManagerConfig`

**Add Config:** FAB (`[+ Add Config]`) at bottom of list → same form as Edit with
Config ID field (text, required, editable only on create).

---

### Upload Flow

Triggered from:
1. **Upload button** in Imports tab toolbar → config field is blank (user must select)
2. **Upload button** in Config detail → config is pre-selected

**Bottom sheet (ion-modal presentingElement):**

```
Upload File                                        [×]
──────────────────────────────────────────────────────
Config *
[ 🔍 Search or select config…                      ▾ ]

File *
[ Choose file…                                       ]
  Accepts .csv, .json, .txt

[ ⬇ Download CSV template ]

                                              [ Upload ]
```

- Config selector: searchable ion-select showing `description (configId)` — sorted by
  description. Pre-filled when coming from config detail.
- File input: accepts `.csv` and `.json` only; shows selected filename.
- Template download: `GET /dataManager/{configId}/downloadTemplate` — generates a CSV
  with the correct column headers for this config's import service. **CSV only** (the
  `download#Template` service only produces CSV). Only shown after a config is selected.
- Upload: `POST /uploadDataManagerFile` with multipart form data (`configId`, `file`).
- On success: close sheet → switch to Imports tab → new log card appears at top in
  Pending status.
- On error: show toast "Upload failed — {error message}". Keep sheet open.

---

## Component Map

| Component | Route / Location | Notes |
|-----------|-----------------|-------|
| `MdmPage.vue` | `/mdm` | Tab host, segment nav |
| `MdmImportsTab.vue` | nested in MdmPage | Imports feed |
| `MdmConfigsTab.vue` | nested in MdmPage | Config list |
| `MdmConfigDetail.vue` | `/mdm/configs/:configId` | Config detail + recent runs |
| `MdmUploadModal.vue` | modal | Upload bottom sheet |
| `MdmLogDetailModal.vue` | modal | Log detail bottom sheet |

### Store: `useMdmStore` (Pinia)

```typescript
state: () => ({
  configs: [] as DataManagerConfig[],
  logs: [] as DataManagerLog[],
  fetchStatus: {
    configs: '' as string,   // '', 'pending', 'success', 'error'
    logs: '' as string,
    lastFetched: 0 as number
  }
})
```

Actions:
- `fetchConfigs()` — `GET /dataManager`, populates `configs`
- `fetchLogs(params?)` — `GET /dataManager/details` with optional `configId` / `statusId` / date filters; populates `logs` with `DataManagerLogDetails` records (includes `logContentId` + `errorLogContentId`)
- `createConfig(data)` — `POST /dataManager` *(requires new endpoint in admin.rest.xml)*
- `updateConfig(data)` — `PUT /dataManager/{configId}` *(requires new endpoint in admin.rest.xml)*
- `uploadFile(configId, file)` — `POST /uploadDataManagerFile`, returns `logId`
- `downloadFile(logContentId, configId)` — `GET /dataManager/downloadDataManagerFile?logContentId=…&configId=…`
- `downloadTemplate(configId)` — `GET /dataManager/{configId}/downloadTemplate`
- `removeLog(logId)` — `DELETE /dataManager/logs/{logId}` *(requires new endpoint in admin.rest.xml)*

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Fetch logs fails | Show inline error banner "Could not load imports. Tap to retry." |
| Upload fails | Toast with server error message; sheet stays open |
| Error file not available | Hide [⬇ Error file] button; don't show broken link |
| Config not found (404) | Push back + toast "Config not found" |
| Running log auto-refresh | 30s poll; show last-refreshed timestamp in footer |

---

## Out of Scope (this spec)

- Export flows (`exportServiceName`, `exportFileContentId`) — separate spec after this ships
- DataManagerMapping management (`/dataManagerMapping`) — separate spec
- Re-running a failed import (resend same file) — can be added as enhancement
- Notifications / push alerts when a run fails — future enhancement

---

## OMS Changes Required Before Implementation

Three REST endpoints are missing from `admin.rest.xml` in the `maarg-util` component.
These need an OMS PR that lands before Company app implementation begins:

```xml
<!-- In the existing <resource name="dataManager"> block -->

<!-- 1. Create config -->
<method type="post">
    <entity name="co.hotwax.datamanager.DataManagerConfig" operation="create"/>
</method>

<!-- 2. Update config — inside the existing <id name="configId"> block -->
<method type="put">
    <entity name="co.hotwax.datamanager.DataManagerConfig" operation="update"/>
</method>

<!-- 3. Delete log — inside the existing <id name="logId"> block under <resource name="logs"> -->
<method type="delete">
    <service name="co.hotwax.util.UtilityServices.remove#DataManagerLog"/>
</method>
```

Everything else needed is already available:
- `GET /dataManager/details` — confirmed; supports `configId`, `statusId`, date range, pagination
- `POST /uploadDataManagerFile` — confirmed; returns `logId`
- `GET /dataManager/{configId}/downloadTemplate` — confirmed; generates CSV only (no JSON)
- `GET /dataManager/downloadDataManagerFile` — confirmed; params are `logContentId` + `configId` (get `logContentId` / `errorLogContentId` from the `/details` response)
