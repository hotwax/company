# MDM Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Data Manager (MDM) bulk-import management section to the Company PWA — cross-config imports feed, upload flow, config CRUD — plus the three missing REST endpoints in the OMS backend that enable config create/update and log delete.

**Architecture:** Two repos. OMS side (`hotwax/hotwax-maarg-util`) adds three XML lines to `admin.rest.xml`. PWA side (`hotwax/company`) adds a Pinia store, two routes, a menu entry, two views, and three modals — all following patterns already established in the codebase (no new CSS, no new component patterns).

**Tech Stack:** Moqui REST XML (OMS), Vue 3 + Ionic Framework + Pinia (PWA), `@common` (`api`, `logger`, `translate`), Luxon (date formatting via existing `formatDateTime` in `@/utils`).

---

## File Map

### OMS — `hotwax/hotwax-maarg-util`
| Action | File |
|--------|------|
| Modify | `runtime/component/maarg-util/service/admin.rest.xml` lines 324, 326, 337 |

### PWA — `hotwax/company`
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/store/mdm.ts` | Pinia store — config list, log feed, write actions |
| Modify | `src/router/index.ts` | Add `/mdm` and `/mdm/configs/:configId` routes |
| Modify | `src/components/Menu.vue` | Add MDM nav entry |
| Create | `src/views/MdmPage.vue` | `ion-segment` tab host (Imports / Configs) |
| Create | `src/components/MdmImportsTab.vue` | Cross-config accordion feed + status filter |
| Create | `src/components/MdmConfigsTab.vue` | Searchable config list + FAB |
| Create | `src/views/MdmConfigDetail.vue` | Config fields + recent runs + upload entry |
| Create | `src/components/MdmUploadModal.vue` | File upload with config selector + template download |
| Create | `src/components/MdmConfigModal.vue` | Add / Edit config form |

---

## Task 1: OMS — Add 3 missing REST endpoints

**Repo:** `hotwax/hotwax-maarg-util`  
**File:** `runtime/component/maarg-util/service/admin.rest.xml`  
**GitHub issue:** hotwax/hotwax-maarg-util#115

- [ ] **Step 1: Open the file and apply the three additions**

Current block (lines 323–346):
```xml
<resource name="dataManager" description="Data Manager Management">
    <method type="get"><entity name="co.hotwax.datamanager.DataManagerConfig" operation="list"/></method>
    <id name="configId">
        <method type="get"><entity name="co.hotwax.datamanager.DataManagerConfig" operation="one"/></method>
        <resource name="downloadTemplate">
            <method type="get">
                <service name="co.hotwax.util.UtilityServices.download#Template"/>
            </method>
        </resource>
    </id>
    <resource name="logs" description="Get Data Manager Logs and content">
        <method type="get"><entity name="co.hotwax.datamanager.DataManagerLogAndContent" operation="list"/></method>
        <id name="logId">
            <method type="get"><entity name="co.hotwax.datamanager.DataManagerLog" operation="one"/></method>
            <method type="put"><entity name="co.hotwax.datamanager.DataManagerLog" operation="update"/></method>
        </id>
    </resource>
    ...
</resource>
```

Replace with:
```xml
<resource name="dataManager" description="Data Manager Management">
    <method type="get"><entity name="co.hotwax.datamanager.DataManagerConfig" operation="list"/></method>
    <method type="post"><entity name="co.hotwax.datamanager.DataManagerConfig" operation="create"/></method>
    <id name="configId">
        <method type="get"><entity name="co.hotwax.datamanager.DataManagerConfig" operation="one"/></method>
        <method type="put"><entity name="co.hotwax.datamanager.DataManagerConfig" operation="update"/></method>
        <resource name="downloadTemplate">
            <method type="get">
                <service name="co.hotwax.util.UtilityServices.download#Template"/>
            </method>
        </resource>
    </id>
    <resource name="logs" description="Get Data Manager Logs and content">
        <method type="get"><entity name="co.hotwax.datamanager.DataManagerLogAndContent" operation="list"/></method>
        <id name="logId">
            <method type="get"><entity name="co.hotwax.datamanager.DataManagerLog" operation="one"/></method>
            <method type="put"><entity name="co.hotwax.datamanager.DataManagerLog" operation="update"/></method>
            <method type="delete"><service name="co.hotwax.util.UtilityServices.remove#DataManagerLog"/></method>
        </id>
    </resource>
    ...
</resource>
```

- [ ] **Step 2: Restart Moqui and verify all three endpoints respond**

```bash
# POST — create config (expect 200 with new configId, or 401 if auth fails — not 404)
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/rest/s1/admin/dataManager" \
  -H "Content-Type: application/json" \
  -u "hotwax.user:hotwax@786" \
  -d '{"configId":"TEST_MDM_DELETE_ME","description":"test"}'

# PUT — update config (expect 200)
curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "http://localhost:8080/rest/s1/admin/dataManager/TEST_MDM_DELETE_ME" \
  -H "Content-Type: application/json" \
  -u "hotwax.user:hotwax@786" \
  -d '{"description":"test updated"}'

# DELETE — remove log (use a real logId from your instance; expect 200)
curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "http://localhost:8080/rest/s1/admin/dataManager/logs/TEST_LOG_ID" \
  -u "hotwax.user:hotwax@786"
```

Expected: All return 200 (or 401/403), never 404 or 405.

- [ ] **Step 3: Clean up test config**

```bash
curl -s -X DELETE \
  "http://localhost:8080/rest/s1/admin/dataManager/TEST_MDM_DELETE_ME" \
  -u "hotwax.user:hotwax@786"
```

- [ ] **Step 4: Commit and open PR**

```bash
git add runtime/component/maarg-util/service/admin.rest.xml
git commit -m "feat: expose DataManagerConfig create/update and DataManagerLog delete via REST

Adds three missing endpoints to the dataManager resource in admin.rest.xml:
- POST /dataManager — create DataManagerConfig
- PUT /dataManager/{configId} — update DataManagerConfig
- DELETE /dataManager/logs/{logId} — calls existing remove#DataManagerLog service

Required by Company PWA MDM management feature (hotwax/company#143)."
```

---

## Task 2: PWA — `useMdmStore`

**Branch:** `feat/mdm-management` (cut from main before starting)

```bash
cd /Users/anilpatel/pwa-sd/company
git checkout main && git pull
git checkout -b feat/mdm-management
```

**File:** `src/store/mdm.ts` (create new)

- [ ] **Step 1: Create `src/store/mdm.ts`**

```typescript
import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

export const useMdmStore = defineStore('mdm', {
  state: () => ({
    configs: [] as any[],
    logs: [] as any[],
    fetchStatus: {
      configs: 'none',   // 'none' | 'pending' | 'success' | 'error'
      logs: 'none',
      lastFetched: 0
    }
  }),

  getters: {
    getConfigs: (state) => state.configs,
    getLogs: (state) => state.logs,
    getConfigById: (state) => (configId: string) =>
      state.configs.find((c: any) => c.configId === configId),
    getFetchStatus: (state) => state.fetchStatus
  },

  actions: {
    async fetchConfigs() {
      this.fetchStatus = { ...this.fetchStatus, configs: 'pending' }
      let configs: any[] = []
      try {
        const resp = await api({
          url: 'admin/dataManager',
          method: 'get',
          params: { pageSize: 200 }
        })
        if (!commonUtil.hasError(resp) && resp.data) {
          configs = Array.isArray(resp.data) ? resp.data : (resp.data.dataManagerConfigList ?? [])
          this.fetchStatus = { ...this.fetchStatus, configs: 'success', lastFetched: Date.now() }
        } else {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, configs: 'error' }
      }
      this.configs = configs
    },

    async fetchLogs(params: Record<string, any> = {}) {
      this.fetchStatus = { ...this.fetchStatus, logs: 'pending' }
      let logs: any[] = []
      try {
        const resp = await api({
          url: 'admin/dataManager/details',
          method: 'get',
          params: { pageSize: 50, orderByField: '-createdDate', pageIndex: 0, ...params }
        }) as any
        if (resp?.data?.dataManagerLogs) {
          logs = resp.data.dataManagerLogs
          this.fetchStatus = { ...this.fetchStatus, logs: 'success', lastFetched: Date.now() }
        } else if (commonUtil.hasError(resp)) {
          throw resp.data
        }
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, logs: 'error' }
      }
      this.logs = logs
    },

    async fetchMoreLogs(params: Record<string, any> = {}) {
      // Appends next page to existing logs — called by infinite scroll
      try {
        const resp = await api({
          url: 'admin/dataManager/details',
          method: 'get',
          params: { pageSize: 50, orderByField: '-createdDate', ...params }
        }) as any
        const more = resp?.data?.dataManagerLogs ?? []
        this.logs = [...this.logs, ...more]
        return more.length
      } catch (error) {
        logger.error(error)
        return 0
      }
    },

    // Requires OMS hotwax/hotwax-maarg-util#115
    async createConfig(payload: any) {
      return api({ url: 'admin/dataManager', method: 'post', data: payload })
    },

    // Requires OMS hotwax/hotwax-maarg-util#115
    async updateConfig(payload: any) {
      return api({ url: `admin/dataManager/${payload.configId}`, method: 'put', data: payload })
    },

    // Requires OMS hotwax/hotwax-maarg-util#115
    async removeLog(logId: string) {
      return api({ url: `admin/dataManager/logs/${logId}`, method: 'delete' })
    },

    clearMdmState() {
      this.$reset()
    }
  },

  persist: true
})
```

- [ ] **Step 2: Verify the store is importable (no TypeScript errors)**

```bash
cd /Users/anilpatel/pwa-sd/company
npx tsc --noEmit 2>&1 | grep mdm
```

Expected: no output (zero errors for `mdm.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/store/mdm.ts
git commit -m "feat: add useMdmStore Pinia store for DataManager configs and logs

Closes #144"
```

---

## Task 3: Routes and menu entry

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/components/Menu.vue`

- [ ] **Step 1: Add routes to `src/router/index.ts`**

Find the block where other lazy routes are defined (e.g. after the NetSuite route). Add:

```typescript
{
  path: '/mdm',
  name: 'Mdm',
  component: () => import('@/views/MdmPage.vue'),
  beforeEnter: authGuard
},
{
  path: '/mdm/configs/:configId',
  name: 'MdmConfigDetail',
  component: () => import('@/views/MdmConfigDetail.vue'),
  props: true,
  beforeEnter: authGuard
},
```

- [ ] **Step 2: Add MDM to `src/components/Menu.vue`**

In the `appPages` array, add after the NetSuite entry:

```typescript
import { layersOutline } from 'ionicons/icons'
```

Add to the imports line that already has `businessOutline, cartOutline, ...`:
```typescript
import { businessOutline, cartOutline, layersOutline, mailOutline, settingsOutline, walletOutline } from "ionicons/icons";
```

Add to `appPages`:
```typescript
{
  title: "MDM",
  url: "/mdm",
  childRoutes: ["/mdm/"],
  iosIcon: layersOutline,
  mdIcon: layersOutline,
},
```

- [ ] **Step 3: Create placeholder `MdmPage.vue` so the route resolves**

Create `src/views/MdmPage.vue`:

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("MDM") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <p class="ion-padding">Loading…</p>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { translate } from '@common'
</script>
```

- [ ] **Step 4: Verify app builds and MDM appears in the menu**

```bash
cd /Users/anilpatel/pwa-sd/company
npm run dev 2>&1 | head -20
```

Open `http://localhost:8100`, log in, confirm "MDM" appears in the side menu and navigates to the placeholder page.

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/components/Menu.vue src/views/MdmPage.vue
git commit -m "feat: add MDM routes and menu entry

Closes #145"
```

---

## Task 4: `MdmPage.vue` — segment tab host

**File:** `src/views/MdmPage.vue` (replace placeholder from Task 3)

- [ ] **Step 1: Create placeholder child components** (so imports resolve)

Create `src/components/MdmImportsTab.vue`:
```vue
<template><div /></template>
<script setup lang="ts"></script>
```

Create `src/components/MdmConfigsTab.vue`:
```vue
<template><div /></template>
<script setup lang="ts"></script>
```

- [ ] **Step 2: Replace `src/views/MdmPage.vue`**

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("MDM") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openUploadModal(undefined)" :aria-label="translate('Upload')">
            <ion-icon slot="icon-only" :icon="cloudUploadOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item>
        <ion-segment v-model="activeTab">
          <ion-segment-button value="imports">
            <ion-label>{{ translate("Imports") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="configs">
            <ion-label>{{ translate("Configs") }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-item>

      <MdmImportsTab v-if="activeTab === 'imports'" />
      <MdmConfigsTab v-else />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue'
import { translate } from '@common'
import { ref } from 'vue'
import { cloudUploadOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import MdmImportsTab from '@/components/MdmImportsTab.vue'
import MdmConfigsTab from '@/components/MdmConfigsTab.vue'
import MdmUploadModal from '@/components/MdmUploadModal.vue'

const mdmStore = useMdmStore()
const activeTab = ref('imports')

onIonViewWillEnter(async () => {
  if (mdmStore.fetchStatus.configs === 'none') {
    await mdmStore.fetchConfigs()
  }
  if (mdmStore.fetchStatus.logs === 'none') {
    await mdmStore.fetchLogs()
  }
})

async function openUploadModal(configId: string | undefined) {
  const modal = await modalController.create({
    component: MdmUploadModal,
    componentProps: { configId }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.uploaded) {
    await mdmStore.fetchLogs()
    activeTab.value = 'imports'
  }
}

// Expose so child components can trigger upload with a pre-selected config
defineExpose({ openUploadModal })
</script>
```

- [ ] **Step 3: Verify app builds and both tabs render (empty placeholders are fine)**

```bash
npm run dev
```

Navigate to MDM. Confirm segment shows "Imports" and "Configs" tabs, switching between them works.

- [ ] **Step 4: Commit**

```bash
git add src/views/MdmPage.vue src/components/MdmImportsTab.vue src/components/MdmConfigsTab.vue
git commit -m "feat: add MdmPage.vue with ion-segment tab host

Closes #146"
```

---

## Task 5: `MdmImportsTab.vue` — cross-config accordion feed

**File:** `src/components/MdmImportsTab.vue`

**Pattern source:** `src/components/ShopifyProductSyncHistoryView.vue` (accordion + chip pattern), `src/views/ShopifyProductSyncHistory.vue` (ion-select filter pattern).

- [ ] **Step 1: Replace `src/components/MdmImportsTab.vue`**

```vue
<template>
  <!-- Status filter -->
  <ion-list lines="full">
    <ion-list-header>
      <ion-label>{{ translate("Filters") }}</ion-label>
    </ion-list-header>
    <ion-item>
      <ion-select
        :label="translate('Status')"
        :value="statusFilter"
        interface="popover"
        @ionChange="statusFilter = $event.detail.value"
      >
        <ion-select-option value="">{{ translate("All statuses") }}</ion-select-option>
        <ion-select-option value="DmlsPending">{{ translate("Pending") }}</ion-select-option>
        <ion-select-option value="DmlsRunning">{{ translate("Running") }}</ion-select-option>
        <ion-select-option value="DmlsFinished">{{ translate("Finished") }}</ion-select-option>
        <ion-select-option value="DmlsCancelled">{{ translate("Cancelled") }}</ion-select-option>
        <ion-select-option value="DmlsCrashed">{{ translate("Failed") }}</ion-select-option>
      </ion-select>
    </ion-item>
  </ion-list>

  <!-- Loading -->
  <ion-card v-if="mdmStore.fetchStatus.logs === 'pending' && !mdmStore.logs.length">
    <ion-card-header>
      <ion-card-title>{{ translate("Loading imports") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-spinner name="crescent" />
    </ion-card-content>
  </ion-card>

  <!-- Error -->
  <ion-card v-else-if="mdmStore.fetchStatus.logs === 'error'">
    <ion-card-header>
      <ion-card-title>{{ translate("Could not load imports") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-button fill="outline" @click="mdmStore.fetchLogs()">{{ translate("Retry") }}</ion-button>
    </ion-card-content>
  </ion-card>

  <!-- Feed -->
  <ion-list v-else>
    <ion-list-header>
      <ion-label>{{ translate("A list of recent import runs") }}</ion-label>
    </ion-list-header>

    <ion-accordion-group>
      <ion-accordion
        v-for="log in filteredLogs"
        :key="log.logId"
        :value="log.logId"
      >
        <div class="list-item" slot="header">
          <ion-item lines="none">
            <ion-icon
              slot="start"
              :icon="getLogIcon(log)"
              :color="getLogIconColor(log)"
            />
            <ion-label>
              {{ log.description || log.configId }}
              <p>{{ log.configId }}</p>
              <p>{{ translate("Created") }}: {{ formatDateTime(log.createdDate) }}</p>
            </ion-label>
          </ion-item>

          <ion-label class="stat">
            <ion-chip outline :color="getMdmStatusColor(log)">
              <ion-label>{{ getMdmStatusLabel(log) }}</ion-label>
              <ion-icon :icon="getMdmStatusIcon(log)" />
            </ion-chip>
            <p>{{ translate("Status") }}</p>
          </ion-label>

          <ion-label class="stat">
            <ion-chip
              outline
              :color="log.logContentId ? 'primary' : 'medium'"
              :disabled="!log.logContentId"
              @click.stop="downloadFile(log)"
            >
              <ion-icon :icon="downloadOutline" />
              <ion-label>{{ log.totalRecordCount ?? '—' }}</ion-label>
            </ion-chip>
            <p>{{ translate("total records") }}</p>
          </ion-label>

          <ion-label class="stat">
            <ion-chip
              outline
              :color="log.errorLogContentId ? 'danger' : 'medium'"
              :disabled="!log.errorLogContentId"
              @click.stop="downloadErrorFile(log)"
            >
              <ion-icon :icon="downloadOutline" />
              <ion-label>{{ log.failedRecordCount ?? '—' }}</ion-label>
            </ion-chip>
            <p>{{ translate("failed records") }}</p>
          </ion-label>
        </div>

        <ion-list slot="content" lines="full">
          <ion-item>
            <ion-label>
              {{ translate("Log ID") }}
              <p>{{ log.logId }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Config") }}
              <p>{{ log.configId }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Created") }}
              <p>{{ formatDateTime(log.createdDate) || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Started") }}
              <p>{{ formatDateTime(log.startDateTime) || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Finished") }}
              <p>{{ formatDateTime(log.finishDateTime) || translate("Unavailable") }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              {{ translate("Records") }}
              <p>{{ translate("Total") }}: {{ log.totalRecordCount ?? '—' }} / {{ translate("Failed") }}: {{ log.failedRecordCount ?? '—' }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </ion-accordion>
    </ion-accordion-group>

    <!-- Empty state -->
    <div class="empty-state" v-if="!filteredLogs.length && mdmStore.fetchStatus.logs === 'success'">
      <p>{{ translate("No recent imports found") }}</p>
    </div>
  </ion-list>

  <!-- Infinite scroll -->
  <ion-infinite-scroll
    :disabled="!hasMoreLogs"
    @ionInfinite="loadMore($event)"
  >
    <ion-infinite-scroll-content
      loading-spinner="crescent"
      :loading-text="translate('Loading more imports')"
    />
  </ion-infinite-scroll>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  onIonViewWillEnter
} from '@ionic/vue'
import { translate } from '@common'
import { computed, onUnmounted, ref } from 'vue'
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  downloadOutline,
  helpCircleOutline,
  serverOutline,
  syncCircleOutline
} from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { useDataManagerLog } from '@/composables/useDataManagerLog'
import { formatDateTime, getDownloadFileContent, downloadTextFile } from '@/utils'

const mdmStore = useMdmStore()
const { downloadDataManagerFile } = useDataManagerLog()

const statusFilter = ref('')
const hasMoreLogs = ref(true)
const pageIndex = ref(1)

let pollTimer: ReturnType<typeof setInterval> | null = null

const filteredLogs = computed(() => {
  if (!statusFilter.value) return mdmStore.logs
  return mdmStore.logs.filter((l: any) => l.statusId === statusFilter.value)
})

const hasActiveRuns = computed(() =>
  mdmStore.logs.some((l: any) => l.statusId === 'DmlsPending' || l.statusId === 'DmlsRunning')
)

onIonViewWillEnter(() => {
  startPollingIfNeeded()
})

onUnmounted(() => {
  stopPolling()
})

function startPollingIfNeeded() {
  stopPolling()
  if (hasActiveRuns.value) {
    pollTimer = setInterval(async () => {
      await mdmStore.fetchLogs()
      if (!hasActiveRuns.value) stopPolling()
    }, 30000)
  }
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function loadMore(event: any) {
  const count = await mdmStore.fetchMoreLogs({ pageIndex: pageIndex.value })
  pageIndex.value++
  if (count < 50) hasMoreLogs.value = false
  event.target.complete()
}

async function downloadFile(log: any) {
  if (!log.logContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.logContentId)
    const content = getDownloadFileContent(resp?.data)
    downloadTextFile(content, `${log.configId}-${log.logId}.csv`)
  } catch (e) {
    // silent — chip is disabled when logContentId is absent
  }
}

async function downloadErrorFile(log: any) {
  if (!log.errorLogContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.errorLogContentId)
    const content = getDownloadFileContent(resp?.data)
    downloadTextFile(content, `${log.configId}-${log.logId}-errors.csv`)
  } catch (e) {
    // silent
  }
}

// ── Status helpers (same logic as ShopifyProductSyncHistoryView) ────────────

function normalizeStatus(s: string) {
  return String(s || '').toLowerCase().replace(/[_\-\s]/g, '')
}

function getMdmStatusLabel(log: any) {
  const map: Record<string, string> = {
    DmlsPending: translate('Pending'),
    DmlsRunning: translate('Running'),
    DmlsFinished: translate('Finished'),
    DmlsCancelled: translate('Cancelled'),
    DmlsCrashed: translate('Failed')
  }
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') {
    return translate('Finished with errors')
  }
  return map[log.statusId] ?? log.statusId
}

function getMdmStatusColor(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return 'danger'
  const map: Record<string, string> = {
    DmlsPending: 'medium',
    DmlsRunning: 'primary',
    DmlsFinished: 'success',
    DmlsCancelled: 'warning',
    DmlsCrashed: 'danger'
  }
  return map[log.statusId] ?? 'medium'
}

function getMdmStatusIcon(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return alertCircleOutline
  const ns = normalizeStatus(log.statusId)
  if (['dmlsfinished'].includes(ns)) return checkmarkCircleOutline
  if (['dmlsrunning', 'dmlspending'].includes(ns)) return syncCircleOutline
  if (['dmlscancelled', 'dmlscrashed'].includes(ns)) return alertCircleOutline
  return helpCircleOutline
}

function getLogIcon(log: any) {
  if (Number(log.failedRecordCount) > 0) return alertCircleOutline
  if (log.statusId === 'DmlsFinished') return serverOutline
  return helpCircleOutline
}

function getLogIconColor(log: any) {
  if (Number(log.failedRecordCount) > 0) return 'danger'
  if (log.statusId === 'DmlsFinished') return 'success'
  if (log.statusId === 'DmlsRunning') return 'primary'
  return 'medium'
}
</script>
```

- [ ] **Step 2: Verify in browser**

Navigate to MDM → Imports tab. Confirm:
- Logs load and display with accordion rows
- Status filter changes the visible rows
- Expanding an accordion shows log detail items
- Download chip is disabled (greyed out) when `logContentId` is null

- [ ] **Step 3: Commit**

```bash
git add src/components/MdmImportsTab.vue
git commit -m "feat: add MdmImportsTab.vue with accordion feed and status filter

Closes #147"
```

---

## Task 6: `MdmConfigsTab.vue` — searchable config list

**File:** `src/components/MdmConfigsTab.vue`

**Pattern source:** `src/views/ShopifyConnections.vue` (`div.list-item` pattern), `src/components/TimezoneModal.vue` (searchbar pattern), `src/views/ShopifyConnections.vue` FAB pattern.

- [ ] **Step 1: Replace `src/components/MdmConfigsTab.vue`**

```vue
<template>
  <ion-searchbar
    :placeholder="translate('Search configs…')"
    v-model="searchQuery"
    :debounce="300"
  />

  <!-- Loading -->
  <ion-card v-if="mdmStore.fetchStatus.configs === 'pending'">
    <ion-card-header>
      <ion-card-title>{{ translate("Loading configs") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-spinner name="crescent" />
    </ion-card-content>
  </ion-card>

  <!-- Error -->
  <ion-card v-else-if="mdmStore.fetchStatus.configs === 'error'">
    <ion-card-header>
      <ion-card-title>{{ translate("Could not load configs") }}</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-button fill="outline" @click="mdmStore.fetchConfigs()">{{ translate("Retry") }}</ion-button>
    </ion-card-content>
  </ion-card>

  <!-- List -->
  <ion-list v-else>
    <ion-list-header>
      <ion-label>{{ translate("Configs") }}</ion-label>
    </ion-list-header>

    <div
      class="list-item"
      v-for="config in filteredConfigs"
      :key="config.configId"
      @click="openDetail(config.configId)"
    >
      <ion-item lines="none">
        <ion-label>
          {{ config.description || config.configId }}
          <p>{{ config.configId }}</p>
        </ion-label>
      </ion-item>
      <div>
        <ion-chip outline>
          <ion-label>{{ config.executionModeId || 'Queue' }}</ion-label>
        </ion-chip>
      </div>
      <div>
        <ion-icon :icon="chevronForwardOutline" color="medium" />
      </div>
    </div>

    <div class="empty-state" v-if="!filteredConfigs.length && mdmStore.fetchStatus.configs === 'success'">
      <p>{{ translate("No configs found") }}</p>
    </div>
  </ion-list>

  <ion-fab slot="fixed" vertical="bottom" horizontal="end">
    <ion-fab-button @click="openAddModal()" :aria-label="translate('Add config')">
      <ion-icon :icon="addOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonChip,
  IonFab,
  IonFabButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSearchbar,
  IonSpinner,
  modalController
} from '@ionic/vue'
import { translate } from '@common'
import { computed, ref } from 'vue'
import { addOutline, chevronForwardOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import MdmConfigModal from '@/components/MdmConfigModal.vue'
import router from '@/router'

const mdmStore = useMdmStore()
const searchQuery = ref('')

const filteredConfigs = computed(() => {
  const q = searchQuery.value.toLowerCase()
  const configs = [...mdmStore.configs].sort((a: any, b: any) =>
    (a.description || a.configId).localeCompare(b.description || b.configId)
  )
  if (!q) return configs
  return configs.filter((c: any) =>
    (c.description || '').toLowerCase().includes(q) ||
    c.configId.toLowerCase().includes(q)
  )
})

function openDetail(configId: string) {
  router.push(`/mdm/configs/${configId}`)
}

async function openAddModal() {
  const modal = await modalController.create({
    component: MdmConfigModal,
    componentProps: { config: null }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.saved) {
    await mdmStore.fetchConfigs()
  }
}
</script>
```

- [ ] **Step 2: Create placeholder `MdmConfigModal.vue`** (so the import resolves before Task 9)

If not already created, create `src/components/MdmConfigModal.vue`:
```vue
<template><ion-header><ion-toolbar><ion-title>Config</ion-title></ion-toolbar></ion-header></template>
<script setup lang="ts">
import { IonHeader, IonTitle, IonToolbar } from '@ionic/vue'
defineProps<{ config: any }>()
</script>
```

- [ ] **Step 3: Verify in browser**

Navigate to MDM → Configs tab. Confirm:
- All configs load and are sorted alphabetically by description
- Searching filters the list
- FAB is visible at bottom-right
- Tapping a row navigates to `/mdm/configs/:configId` (blank page is fine for now)

- [ ] **Step 4: Commit**

```bash
git add src/components/MdmConfigsTab.vue src/components/MdmConfigModal.vue
git commit -m "feat: add MdmConfigsTab.vue with searchable config list and FAB

Closes #148"
```

---

## Task 7: `MdmConfigDetail.vue` — config info and recent runs

**File:** `src/views/MdmConfigDetail.vue`

**Pattern source:** `src/views/ShopifyConnectionDetails.vue` (back-nav, ion-card sections).  
Accordion rows reuse same helper functions as `MdmImportsTab` — copy them verbatim.

- [ ] **Step 1: Create `src/views/MdmConfigDetail.vue`**

```vue
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/mdm" />
        <ion-title>{{ config?.description || configId }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openEditModal()">{{ translate("Edit") }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Config fields -->
      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Config details") }}</ion-label>
        </ion-list-header>
        <ion-item>
          <ion-label>
            {{ translate("Config ID") }}
            <p>{{ config?.configId }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Import Service") }}
            <p>{{ config?.importServiceName || '—' }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Execution Mode") }}
            <p>{{ config?.executionModeId || '—' }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Multi Threading") }}
            <p>{{ config?.multiThreading || 'N' }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            {{ translate("Priority") }}
            <p>{{ config?.priority || '—' }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- Recent runs -->
      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ translate("Recent runs") }}</ion-label>
          <ion-button slot="end" @click="openUploadModal()" :aria-label="translate('Upload')">
            <ion-icon slot="icon-only" :icon="cloudUploadOutline" />
          </ion-button>
        </ion-list-header>

        <ion-card v-if="isLoadingLogs">
          <ion-card-content><ion-spinner name="crescent" /></ion-card-content>
        </ion-card>

        <ion-accordion-group v-else>
          <ion-accordion
            v-for="log in configLogs"
            :key="log.logId"
            :value="log.logId"
          >
            <div class="list-item" slot="header">
              <ion-item lines="none">
                <ion-icon slot="start" :icon="getLogIcon(log)" :color="getLogIconColor(log)" />
                <ion-label>
                  {{ formatDateTime(log.createdDate) || translate("Unavailable") }}
                </ion-label>
              </ion-item>
              <ion-label class="stat">
                <ion-chip outline :color="getMdmStatusColor(log)">
                  <ion-label>{{ getMdmStatusLabel(log) }}</ion-label>
                  <ion-icon :icon="getMdmStatusIcon(log)" />
                </ion-chip>
              </ion-label>
              <ion-label class="stat">
                <ion-chip
                  outline
                  :color="log.logContentId ? 'primary' : 'medium'"
                  :disabled="!log.logContentId"
                  @click.stop="downloadFile(log)"
                >
                  <ion-icon :icon="downloadOutline" />
                  <ion-label>{{ log.totalRecordCount ?? '—' }}</ion-label>
                </ion-chip>
                <p>{{ translate("total") }}</p>
              </ion-label>
              <ion-label class="stat">
                <ion-chip
                  outline
                  :color="log.errorLogContentId ? 'danger' : 'medium'"
                  :disabled="!log.errorLogContentId"
                  @click.stop="downloadErrorFile(log)"
                >
                  <ion-icon :icon="downloadOutline" />
                  <ion-label>{{ log.failedRecordCount ?? '—' }}</ion-label>
                </ion-chip>
                <p>{{ translate("failed") }}</p>
              </ion-label>
            </div>

            <ion-list slot="content" lines="full">
              <ion-item>
                <ion-label>{{ translate("Log ID") }}<p>{{ log.logId }}</p></ion-label>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Started") }}<p>{{ formatDateTime(log.startDateTime) || '—' }}</p></ion-label>
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Finished") }}<p>{{ formatDateTime(log.finishDateTime) || '—' }}</p></ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>

        <div class="empty-state" v-if="!isLoadingLogs && !configLogs.length">
          <p>{{ translate("No runs yet") }}</p>
        </div>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
  onIonViewWillEnter
} from '@ionic/vue'
import { translate } from '@common'
import { computed, ref } from 'vue'
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  cloudUploadOutline,
  downloadOutline,
  helpCircleOutline,
  serverOutline,
  syncCircleOutline
} from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { useDataManagerLog } from '@/composables/useDataManagerLog'
import { formatDateTime, getDownloadFileContent, downloadTextFile } from '@/utils'
import MdmUploadModal from '@/components/MdmUploadModal.vue'
import MdmConfigModal from '@/components/MdmConfigModal.vue'

const props = defineProps<{ configId: string }>()

const mdmStore = useMdmStore()
const { downloadDataManagerFile } = useDataManagerLog()
const isLoadingLogs = ref(false)
const configLogs = ref<any[]>([])

const config = computed(() => mdmStore.getConfigById(props.configId))

onIonViewWillEnter(async () => {
  if (mdmStore.fetchStatus.configs === 'none') {
    await mdmStore.fetchConfigs()
  }
  await loadConfigLogs()
})

async function loadConfigLogs() {
  isLoadingLogs.value = true
  try {
    const resp = await (useDataManagerLog().fetchRecentLogsByConfigId(props.configId, 10))
    configLogs.value = resp ?? []
  } finally {
    isLoadingLogs.value = false
  }
}

async function openUploadModal() {
  const modal = await modalController.create({
    component: MdmUploadModal,
    componentProps: { configId: props.configId }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.uploaded) await loadConfigLogs()
}

async function openEditModal() {
  const modal = await modalController.create({
    component: MdmConfigModal,
    componentProps: { config: config.value }
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.saved) await mdmStore.fetchConfigs()
}

async function downloadFile(log: any) {
  if (!log.logContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.logContentId)
    downloadTextFile(getDownloadFileContent(resp?.data), `${log.configId}-${log.logId}.csv`)
  } catch (e) { /* silent */ }
}

async function downloadErrorFile(log: any) {
  if (!log.errorLogContentId) return
  try {
    const resp = await downloadDataManagerFile(log.configId, log.errorLogContentId)
    downloadTextFile(getDownloadFileContent(resp?.data), `${log.configId}-${log.logId}-errors.csv`)
  } catch (e) { /* silent */ }
}

// ── Status helpers (identical to MdmImportsTab) ────────────────────────────

function normalizeStatus(s: string) {
  return String(s || '').toLowerCase().replace(/[_\-\s]/g, '')
}
function getMdmStatusLabel(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return translate('Finished with errors')
  const map: Record<string, string> = { DmlsPending: translate('Pending'), DmlsRunning: translate('Running'), DmlsFinished: translate('Finished'), DmlsCancelled: translate('Cancelled'), DmlsCrashed: translate('Failed') }
  return map[log.statusId] ?? log.statusId
}
function getMdmStatusColor(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return 'danger'
  const map: Record<string, string> = { DmlsPending: 'medium', DmlsRunning: 'primary', DmlsFinished: 'success', DmlsCancelled: 'warning', DmlsCrashed: 'danger' }
  return map[log.statusId] ?? 'medium'
}
function getMdmStatusIcon(log: any) {
  if (Number(log.failedRecordCount) > 0 && log.statusId === 'DmlsFinished') return alertCircleOutline
  const ns = normalizeStatus(log.statusId)
  if (ns === 'dmlsfinished') return checkmarkCircleOutline
  if (['dmlsrunning', 'dmlspending'].includes(ns)) return syncCircleOutline
  return alertCircleOutline
}
function getLogIcon(log: any) {
  if (Number(log.failedRecordCount) > 0) return alertCircleOutline
  if (log.statusId === 'DmlsFinished') return serverOutline
  return helpCircleOutline
}
function getLogIconColor(log: any) {
  if (Number(log.failedRecordCount) > 0) return 'danger'
  if (log.statusId === 'DmlsFinished') return 'success'
  if (log.statusId === 'DmlsRunning') return 'primary'
  return 'medium'
}
</script>
```

- [ ] **Step 2: Verify in browser**

Navigate to MDM → Configs → tap a config. Confirm:
- Config fields show (from store)
- Recent runs load with accordion rows
- Back button returns to `/mdm`
- "Edit" button opens placeholder modal (OK for now)

- [ ] **Step 3: Commit**

```bash
git add src/views/MdmConfigDetail.vue
git commit -m "feat: add MdmConfigDetail.vue with config fields and recent runs

Closes #149"
```

---

## Task 8: `MdmUploadModal.vue` — file upload

**File:** `src/components/MdmUploadModal.vue`

**Pattern source:** `src/components/CreateShopifyConnectionModal.vue` (modal structure, ion-input/select, ion-button expand="block").

- [ ] **Step 1: Replace `src/components/MdmUploadModal.vue`** (overwrite placeholder)

```vue
<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Upload File") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-select
          :label="translate('Config') + ' *'"
          label-placement="stacked"
          interface="popover"
          v-model="selectedConfigId"
          @ionChange="onConfigChange"
        >
          <ion-select-option
            v-for="cfg in sortedConfigs"
            :key="cfg.configId"
            :value="cfg.configId"
          >
            {{ cfg.description || cfg.configId }} ({{ cfg.configId }})
          </ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-label position="stacked">{{ translate("File") }} *</ion-label>
        <input
          type="file"
          accept=".csv"
          ref="fileInput"
          @change="onFileChange"
          class="ion-padding-top"
        />
      </ion-item>

      <ion-item v-if="selectedConfigId">
        <ion-button
          fill="outline"
          @click="downloadTemplate()"
          :disabled="isDownloadingTemplate"
        >
          <ion-icon slot="start" :icon="downloadOutline" />
          {{ translate("Download CSV template") }}
        </ion-button>
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!selectedConfigId || !selectedFile || isUploading"
      @click="upload()"
    >
      <ion-spinner v-if="isUploading" name="crescent" />
      <span v-else>{{ translate("Upload") }}</span>
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { translate, api, logger } from '@common'
import { computed, ref } from 'vue'
import { closeOutline, downloadOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { showToast, getDownloadFileContent, downloadTextFile } from '@/utils'

const props = defineProps<{ configId?: string }>()

const mdmStore = useMdmStore()
const selectedConfigId = ref(props.configId ?? '')
const selectedFile = ref<File | null>(null)
const isUploading = ref(false)
const isDownloadingTemplate = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const sortedConfigs = computed(() =>
  [...mdmStore.configs].sort((a: any, b: any) =>
    (a.description || a.configId).localeCompare(b.description || b.configId)
  )
)

function onConfigChange() {
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
}

function closeModal(data?: any) {
  modalController.dismiss(data)
}

async function downloadTemplate() {
  if (!selectedConfigId.value) return
  isDownloadingTemplate.value = true
  try {
    const resp = await api({
      url: `admin/dataManager/${selectedConfigId.value}/downloadTemplate`,
      method: 'get'
    }) as any
    const content = getDownloadFileContent(resp?.data)
    downloadTextFile(content, `${selectedConfigId.value}-template.csv`)
  } catch (e) {
    logger.error('Failed to download template', e)
    await showToast(translate('Failed to download template'))
  } finally {
    isDownloadingTemplate.value = false
  }
}

async function upload() {
  if (!selectedConfigId.value || !selectedFile.value) return
  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('configId', selectedConfigId.value)
    formData.append('uploadedFile', selectedFile.value)

    const resp = await api({
      url: 'admin/uploadDataManagerFile',
      method: 'post',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' }
    }) as any

    if (resp?.data?.logId) {
      await showToast(translate('File uploaded successfully'))
      closeModal({ uploaded: true, logId: resp.data.logId })
    } else {
      throw resp?.data
    }
  } catch (e: any) {
    logger.error('Upload failed', e)
    const msg = e?._ERROR_MESSAGE_ || e?.message || translate('Upload failed')
    await showToast(msg)
  } finally {
    isUploading.value = false
  }
}
</script>
```

- [ ] **Step 2: Verify in browser**

Click the upload icon in the MDM toolbar. Confirm:
- Modal opens with config selector pre-selected (if triggered from detail page)
- Template download appears after selecting a config
- Upload button is disabled until both config and file are chosen
- Selecting a file enables the Upload button

- [ ] **Step 3: Commit**

```bash
git add src/components/MdmUploadModal.vue
git commit -m "feat: add MdmUploadModal.vue with config selector and file upload

Closes #150"
```

---

## Task 9: `MdmConfigModal.vue` — add and edit config

**File:** `src/components/MdmConfigModal.vue`

**Pattern source:** `src/components/CreateShopifyConnectionModal.vue` (form structure), `src/views/ShopifyProductSync.vue` FAB save button pattern.

**Note:** `createConfig` and `updateConfig` require OMS Task 1 to be merged. The form itself can be built and the button will return an error until the endpoints land.

- [ ] **Step 1: Replace `src/components/MdmConfigModal.vue`** (overwrite placeholder)

```vue
<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ isAdd ? translate("Add Config") : translate("Edit Config") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item v-if="isAdd">
        <ion-input
          :label="translate('Config ID') + ' *'"
          label-placement="stacked"
          v-model="form.configId"
          placeholder="ALLCAPS_SNAKE_ID"
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-input
          :label="translate('Description')"
          label-placement="stacked"
          v-model="form.description"
        />
      </ion-item>

      <ion-item>
        <ion-input
          :label="translate('Import Service')"
          label-placement="stacked"
          v-model="form.importServiceName"
          placeholder="co.hotwax.…"
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-select
          :label="translate('Execution Mode')"
          label-placement="stacked"
          interface="popover"
          v-model="form.executionModeId"
        >
          <ion-select-option value="Queue">{{ translate("Queue") }}</ion-select-option>
          <ion-select-option value="Immediate">{{ translate("Immediate") }}</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-label>{{ translate("Multi Threading") }}</ion-label>
        <ion-toggle slot="end" v-model="multiThreadingBool" />
      </ion-item>

      <ion-item>
        <ion-input
          :label="translate('Priority')"
          label-placement="stacked"
          type="number"
          v-model="form.priority"
          placeholder="(higher = runs first)"
        />
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button
      v-if="!isSaving"
      @click="save()"
      :disabled="!isFormValid"
      :aria-label="translate('Save')"
    >
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
    <ion-fab-button v-else disabled :aria-label="translate('Saving')">
      <ion-spinner name="crescent" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { translate, commonUtil } from '@common'
import { computed, ref } from 'vue'
import { closeOutline, saveOutline } from 'ionicons/icons'
import { useMdmStore } from '@/store/mdm'
import { showToast } from '@/utils'

const props = defineProps<{ config: any }>()

const mdmStore = useMdmStore()
const isSaving = ref(false)
const isAdd = !props.config

const form = ref({
  configId: props.config?.configId ?? '',
  description: props.config?.description ?? '',
  importServiceName: props.config?.importServiceName ?? '',
  executionModeId: props.config?.executionModeId ?? 'Queue',
  priority: props.config?.priority ?? ''
})

const multiThreadingBool = ref(props.config?.multiThreading === 'Y')

const isFormValid = computed(() =>
  (!isAdd || !!form.value.configId.trim())
)

function closeModal(data?: any) {
  modalController.dismiss(data)
}

async function save() {
  isSaving.value = true
  try {
    const payload = {
      ...form.value,
      multiThreading: multiThreadingBool.value ? 'Y' : 'N'
    }
    const resp = isAdd
      ? await mdmStore.createConfig(payload)
      : await mdmStore.updateConfig(payload)

    if (commonUtil.hasError(resp)) throw resp.data

    closeModal({ saved: true })
  } catch (e: any) {
    const msg = e?._ERROR_MESSAGE_ || e?.message || translate('Save failed')
    await showToast(msg)
  } finally {
    isSaving.value = false
  }
}
</script>
```

- [ ] **Step 2: Verify in browser**

Open MDM → Configs → FAB (+). Confirm:
- "Add Config" modal opens with all fields
- Config ID field appears only in Add mode (not when opened from Edit)
- Save FAB is disabled until configId is filled (Add mode)
- Save spins then shows error (expected — OMS endpoints not yet live)

Open a config detail → Edit. Confirm:
- "Edit Config" modal opens pre-populated with config values
- Config ID field is absent

- [ ] **Step 3: Commit**

```bash
git add src/components/MdmConfigModal.vue
git commit -m "feat: add MdmConfigModal.vue for add/edit DataManagerConfig

Save actions require OMS hotwax/hotwax-maarg-util#115 to be merged.
Closes #151"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Confirm full read path works**

1. Navigate to `/mdm` → Imports tab loads logs from `/rest/s1/admin/dataManager/details`
2. Status filter works (All / Pending / Running / Finished / Failed)
3. Accordion expands showing log detail fields
4. Navigate to Configs tab — configs load and are searchable
5. Tap a config → detail page shows config fields + last 10 runs

- [ ] **Step 2: Confirm upload flow**

1. MDM toolbar upload icon → Upload modal opens (no config pre-selected)
2. Select a config → "Download CSV template" appears
3. Click template download → CSV file downloads
4. Choose a CSV file → Upload button enables
5. Click Upload → spinner shows → on success toast + modal closes + Imports tab refreshes

- [ ] **Step 3: Once OMS Task 1 is merged — confirm write path**

```bash
# Verify new endpoints are live
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/rest/s1/admin/dataManager" \
  -H "Content-Type: application/json" \
  -u "hotwax.user:hotwax@786" \
  -d '{"configId":"MDM_TEST_VERIFY","description":"verification test"}'
# Expected: 200
```

Then in the app: MDM → Configs → FAB → fill form → Save. Confirm config appears in the list.

- [ ] **Step 4: Open PR for Company PWA**

```bash
git push -u origin feat/mdm-management
gh pr create \
  --title "feat: MDM Management — bulk import manager" \
  --body "Closes #143. Requires hotwax/hotwax-maarg-util#115 for config create/update and log delete."
```
