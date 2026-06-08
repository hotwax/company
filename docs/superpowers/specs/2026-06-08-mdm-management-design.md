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
> **Note:** Endpoints are confusingly nested under `/permissions` — this is a Moqui
> routing quirk, not a semantic one.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/permissions` | List DataManagerConfig |
| `POST` | `create#DataManagerConfig` (entity) | Create new config |
| `PUT` | `update#DataManagerConfig` (entity) | Update config |
| `GET` | `/permissions/{configId}` | Get one config |
| `GET` | `/permissions/logs` | List DataManagerLog (cross-config) |
| `GET` | `/permissions/logs/{logId}` | Get one log |
| `GET` | `/permissions/downloadDataManagerFile` | Download uploaded/error file |
| `POST` | `/uploadDataManagerFile` | Upload file → creates log entry |

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
- **Error file button** (only when `failedRecordCount > 0`): tapping downloads the error
  CSV via `GET /permissions/downloadDataManagerFile?logId={logId}&type=error`

**Tap log card** → opens `ion-modal` as a bottom sheet with full log detail:
- Config ID + description
- Status + createdDate + startDateTime + finishDateTime
- Total records / failed records
- Product store
- Uploaded by (createdByUserLogin)
- [Download uploaded file] button
- [Download error file] button (if applicable)

**Auto-refresh:** When the tab is active and any log has status `DmlsPending` or
`DmlsRunning`, poll `GET /permissions/logs` every 30 seconds. Stop polling when all
visible logs are terminal (Finished / Cancelled / Crashed).

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
  Accepts .csv, .json

[ ⬇ Download CSV template  ]  [ ⬇ Download JSON template ]

                                              [ Upload ]
```

- Config selector: searchable ion-select showing `description (configId)` — sorted by
  description. Pre-filled when coming from config detail.
- File input: accepts `.csv` and `.json` only; shows selected filename.
- Template downloads: `GET /permissions/downloadDataManagerFile?configId={id}&type=csv`
  (or `json`). Only shown after a config is selected.
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
- `fetchConfigs()` — GET /permissions, populates `configs`
- `fetchLogs(configId?: string)` — GET /permissions/logs (optionally filtered), populates `logs`
- `createConfig(data)` — POST create#DataManagerConfig
- `updateConfig(data)` — PUT update#DataManagerConfig
- `uploadFile(configId, file)` — POST /uploadDataManagerFile
- `downloadFile(logId, type)` — GET /permissions/downloadDataManagerFile, triggers browser download

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

## REST API Gaps to Confirm

Before implementation, confirm with OMS team:

1. Does `GET /permissions/logs` support `configId` filter param?
2. Does `GET /permissions/downloadDataManagerFile` accept `type=csv` / `type=json` for templates (no logId)?
3. Does `POST /uploadDataManagerFile` return the new `logId` in the response?
4. Are `create#DataManagerConfig` and `update#DataManagerConfig` exposed as REST or only as entity auto-services (may need a named REST wrapper)?
