# QuickBox 3PL Connection Config UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins configure the QuickBox 3PL connection (outbound API endpoint + auth, inbound webhook token, receiver URLs) from the company PWA, consistent with the Shopify integration's hub-and-modal feel.

**Architecture:** One Pinia store talks to the **existing generic** `oms/systemMessageRemotes` endpoints (the same ones Klaviyo's Unigate config already uses) — **zero backend changes, one repo**. `/quickbox` is a single Shopify-style detail hub with two cards (API credentials, Inbound webhooks), each opening a credential modal. Reads never return the secret; secret fields are write-only and only written when the admin types one.

**Tech Stack:** Vue 3 + Ionic + Pinia + `@common` (accxui). No backend/Moqui changes.

**Spec:** `docs/superpowers/specs/2026-06-11-quickbox-connection-ui-design.md`

**Branch:** `feat/quickbox-config-ui` (already checked out; the spec is committed here).

**Testing note (read first):** This repo has **no unit-test harness** (Vitest was removed). So tasks use **verify-after** with exact commands — `npx vue-tsc --noEmit -p tsconfig.json` (type check) and `pnpm build`, plus a manual dogfood pass at the end — instead of test-first. The only allowed type diagnostic is the pre-existing `TS5101` baseUrl deprecation. Do not skip the verification steps.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/store/quickbox.ts` | Create | `useQuickBoxStore()` — read/write the two SystemMessageRemote records via generic OMS endpoints; expose `apiConfig`, `authMode`, `webhookUrls`, `fetchStatus`. |
| `src/store/user.ts` | Modify | Clear QuickBox store on logout. |
| `src/router/index.ts` | Modify | Register `/quickbox` route behind `authGuard`. |
| `src/components/Menu.vue` | Modify | Add the **QuickBox** side-menu entry. |
| `src/views/QuickBox.vue` | Create | The `/quickbox` hub: Configuration section with two cards opening the modals. |
| `src/components/EditQuickBoxApiCredentialsModal.vue` | Create | Edit `QuickBoxApi`: base URL + Bearer/Basic auth. |
| `src/components/EditQuickBoxWebhookModal.vue` | Create | Show the three receiver URLs (copyable) + edit `QuickBoxWebhookIn` shared token. |
| `src/views/Settings.vue` | Modify | Surface the store's `fetchStatus` in the Data Fetch Status card. |

Task order guarantees the type-check stays green at every commit (no dangling imports): store → route+menu+scaffold → modals → full hub → settings.

---

## Task 1: Pinia store + logout wiring

**Files:**
- Create: `src/store/quickbox.ts`
- Modify: `src/store/user.ts` (the `postLogout` action, lines ~166-182)

- [ ] **Step 1: Create `src/store/quickbox.ts`**

```typescript
import { defineStore } from 'pinia'
import { api, commonUtil, logger } from '@common'

// The connector ships these two fixed SystemMessageRemote ids (see
// quickbox-connector/data/QuickBoxConfigData.xml). They are the only records this UI touches.
const QUICKBOX_API_REMOTE = 'QuickBoxApi'
const QUICKBOX_WEBHOOK_REMOTE = 'QuickBoxWebhookIn'

type FetchStatus = '' | 'pending' | 'success' | 'error'

// The generic GET returns either a bare array or { systemMessageRemoteList: [...] }
// depending on the OMS build; handle both, matching src/store/klaviyo.ts.
const unwrapList = (data: any, key: string): any[] => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[key])) return data[key]
  return []
}

export const useQuickBoxStore = defineStore('quickbox', {
  state: () => ({
    // Only ever holds non-secret fields: GET omits `password` by design.
    apiConfig: { sendUrl: '', username: '' } as { sendUrl: string; username: string },
    fetchStatus: {
      connection: '' as FetchStatus,
      lastFetched: 0 as number
    }
  }),

  getters: {
    isApiConfigured: (state) => !!state.apiConfig.sendUrl,
    // username present ⇒ HTTP Basic; otherwise Bearer-token mode.
    getAuthMode: (state): 'bearer' | 'basic' => (state.apiConfig.username ? 'basic' : 'bearer'),
    getFetchStatus: (state) => state.fetchStatus,
    // The three inbound endpoints QuickBox posts to, composed from the OMS base URL.
    // getMaargURL() already includes the `/rest/s1` segment (commonUtil.ts), so we
    // normalise the trailing slash and append `quickbox/...`.
    getWebhookUrls: () => {
      const base = (commonUtil.getMaargURL() || '').replace(/\/+$/, '')
      if (!base) return { fulfillmentStatus: '', shipmentConfirm: '', inventoryAdjustment: '' }
      return {
        fulfillmentStatus: `${base}/quickbox/fulfillmentStatus`,
        shipmentConfirm: `${base}/quickbox/shipmentConfirm`,
        inventoryAdjustment: `${base}/quickbox/inventoryAdjustment`
      }
    }
  },

  actions: {
    // Fetch all remotes and pick out QuickBoxApi (matches klaviyo.ts; avoids relying on
    // list-param query serialization). Only QuickBoxApi has readable fields we use;
    // QuickBoxWebhookIn exposes nothing readable (just an omitted password).
    async fetchConnectionConfig() {
      this.fetchStatus = { ...this.fetchStatus, connection: 'pending' }
      try {
        const resp: any = await api({ url: 'oms/systemMessageRemotes', method: 'get' })
        const remotes = unwrapList(resp?.data, 'systemMessageRemoteList')
        const apiRemote = remotes.find((r: any) => r?.systemMessageRemoteId === QUICKBOX_API_REMOTE)
        this.apiConfig = {
          sendUrl: apiRemote?.sendUrl || '',
          username: apiRemote?.username || ''
        }
        this.fetchStatus = { connection: 'success', lastFetched: Date.now() }
        return this.apiConfig
      } catch (error) {
        logger.error(error)
        this.fetchStatus = { ...this.fetchStatus, connection: 'error' }
        return null
      }
    },

    async updateApiCredentials(payload: { sendUrl: string; authMode: 'bearer' | 'basic'; username?: string; password?: string }) {
      const data: Record<string, any> = {
        systemMessageRemoteId: QUICKBOX_API_REMOTE,
        sendUrl: payload.sendUrl,
        // Bearer mode clears any stale basic-auth username; Basic mode sets it.
        username: payload.authMode === 'basic' ? (payload.username || '') : ''
      }
      // Only write the secret when the admin actually typed one — blank keeps the stored value.
      if (payload.password) data.password = payload.password
      const resp: any = await api({
        url: `oms/systemMessageRemotes/${encodeURIComponent(QUICKBOX_API_REMOTE)}`,
        method: 'put',
        data
      })
      await this.fetchConnectionConfig()
      return resp.data
    },

    async updateWebhookToken(payload: { password?: string }) {
      const data: Record<string, any> = { systemMessageRemoteId: QUICKBOX_WEBHOOK_REMOTE }
      if (payload.password) data.password = payload.password
      const resp: any = await api({
        url: `oms/systemMessageRemotes/${encodeURIComponent(QUICKBOX_WEBHOOK_REMOTE)}`,
        method: 'put',
        data
      })
      return resp.data
    },

    clearQuickBoxState() {
      this.$reset()
    }
  },

  persist: true
})
```

- [ ] **Step 2: Wire `clearQuickBoxState` into logout**

In `src/store/user.ts`, the `postLogout` action currently reads:

```typescript
    async postLogout() {
      this.$reset()
      useAuth().clearAuth()

      // Reset all other persisted stores so no data leaks across sessions
      const { useProductStore } = await import('./productStore')
      const { useUtilStore } = await import('./util')
      const { useNetSuiteStore } = await import('./netSuite')
      const { useShopifyStore } = await import('./shopify')
      const { useKlaviyoStore } = await import('./klaviyo')

      useProductStore().clearProductStoreState()
      useUtilStore().clearUtilState()
      useNetSuiteStore().clearNetSuiteState()
      useShopifyStore().clearShopifyState()
      useKlaviyoStore().clear()
    }
```

Replace it with (adds the two QuickBox lines):

```typescript
    async postLogout() {
      this.$reset()
      useAuth().clearAuth()

      // Reset all other persisted stores so no data leaks across sessions
      const { useProductStore } = await import('./productStore')
      const { useUtilStore } = await import('./util')
      const { useNetSuiteStore } = await import('./netSuite')
      const { useShopifyStore } = await import('./shopify')
      const { useKlaviyoStore } = await import('./klaviyo')
      const { useQuickBoxStore } = await import('./quickbox')

      useProductStore().clearProductStoreState()
      useUtilStore().clearUtilState()
      useNetSuiteStore().clearNetSuiteState()
      useShopifyStore().clearShopifyState()
      useKlaviyoStore().clear()
      useQuickBoxStore().clearQuickBoxState()
    }
```

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no errors (only the pre-existing `TS5101` baseUrl diagnostic, if any).

- [ ] **Step 4: Commit**

```bash
git add src/store/quickbox.ts src/store/user.ts
git commit -m "feat: QuickBox Pinia store (generic systemMessageRemotes client) + logout clearing"
```

---

## Task 2: Route + menu entry + view scaffold

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/components/Menu.vue`
- Create: `src/views/QuickBox.vue` (scaffold; replaced in Task 5)

- [ ] **Step 1: Create the scaffold view so the route import resolves**

Create `src/views/QuickBox.vue`:

```vue
<template>
  <ion-page>
    <ion-content />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonPage } from "@ionic/vue";
</script>
```

- [ ] **Step 2: Register the route**

In `src/router/index.ts`, add a lazy import alongside the other `const ... = () => import(...)` declarations (after line ~20, the `CloneProductStore` line):

```typescript
const QuickBox = () => import('@/views/QuickBox.vue')
```

Then add the route to the `routes` array, immediately after the last NetSuite route (`/netsuite/departments`, line ~50):

```typescript
  { path: '/quickbox', name: 'QuickBox', component: QuickBox, beforeEnter: authGuard },
```

- [ ] **Step 3: Add the side-menu entry**

In `src/components/Menu.vue`, add `cubeOutline` to the ionicons import (line ~36):

```typescript
import { businessOutline, cartOutline, cubeOutline, mailOutline, settingsOutline, walletOutline } from "ionicons/icons";
```

Then, in the `appPages` array, insert this entry **after** the NetSuite object and **before** the Settings object (line ~70):

```typescript
  {
    title: "QuickBox",
    url: "/quickbox",
    childRoutes: ["/quickbox/"],
    iosIcon: cubeOutline,
    mdIcon: cubeOutline,
  },
```

- [ ] **Step 4: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/components/Menu.vue src/views/QuickBox.vue
git commit -m "feat: QuickBox route, side-menu entry, view scaffold"
```

---

## Task 3: API credentials modal

**Files:**
- Create: `src/components/EditQuickBoxApiCredentialsModal.vue`

- [ ] **Step 1: Create the modal**

Create `src/components/EditQuickBoxApiCredentialsModal.vue`:

```vue
<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("API credentials") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Outbound connection to the QuickBox iQ Connect API. The secret is write-only — leave it blank to keep the stored value.") }}</p>
        </ion-label>
      </ion-item>

      <ion-item>
        <ion-input
          v-model="form.sendUrl"
          :label="translate('Base URL') + ' *'"
          label-placement="stacked"
          placeholder="https://..."
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-select v-model="form.authMode" :label="translate('Authentication')" interface="popover">
          <ion-select-option value="bearer">{{ translate("Bearer token") }}</ion-select-option>
          <ion-select-option value="basic">{{ translate("Basic auth") }}</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item v-if="form.authMode === 'basic'">
        <ion-input
          v-model="form.username"
          :label="translate('Username') + ' *'"
          label-placement="stacked"
          autocomplete="off"
        />
      </ion-item>

      <ion-item>
        <ion-input
          v-model="form.password"
          :label="form.authMode === 'basic' ? translate('Password') : translate('API token')"
          label-placement="stacked"
          type="password"
          :placeholder="hasStoredSecret ? '••••••••' : ''"
          autocomplete="off"
        />
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!isFormValid || isSaving"
      @click="save()"
    >
      {{ translate("Save") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { commonUtil, logger, translate } from '@common'
import { useQuickBoxStore } from '@/store/quickbox'
import { computed, reactive, ref } from 'vue'

const quickBoxStore = useQuickBoxStore()

// The hub fetches config before opening this modal, so apiConfig is already populated.
const hasStoredSecret = computed(() => quickBoxStore.isApiConfigured)

const form = reactive({
  sendUrl: quickBoxStore.apiConfig.sendUrl || '',
  authMode: quickBoxStore.getAuthMode as 'bearer' | 'basic',
  username: quickBoxStore.apiConfig.username || '',
  password: ''
})
const isSaving = ref(false)

const isFormValid = computed(() =>
  !!form.sendUrl.trim() && (form.authMode === 'bearer' || !!form.username.trim())
)

function closeModal(saved = false) {
  modalController.dismiss({ saved })
}

async function save() {
  isSaving.value = true
  try {
    await quickBoxStore.updateApiCredentials({
      sendUrl: form.sendUrl.trim(),
      authMode: form.authMode,
      username: form.username.trim(),
      password: form.password.trim() || undefined
    })
    commonUtil.showToast(translate("QuickBox API credentials saved"))
    closeModal(true)
  } catch (error) {
    logger.error('updateQuickBoxApiCredentials', error)
    commonUtil.showToast(translate("Failed to save QuickBox API credentials"))
  } finally {
    isSaving.value = false
  }
}
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/EditQuickBoxApiCredentialsModal.vue
git commit -m "feat: QuickBox API credentials modal (base URL + Bearer/Basic auth)"
```

---

## Task 4: Inbound-webhook modal

**Files:**
- Create: `src/components/EditQuickBoxWebhookModal.vue`

- [ ] **Step 1: Create the modal**

Create `src/components/EditQuickBoxWebhookModal.vue`:

```vue
<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Inbound webhooks") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">
          <p>{{ translate("Give these URLs and the shared token to QuickBox so it can post events back to the OMS.") }}</p>
        </ion-label>
      </ion-item>

      <ion-item v-for="hook in webhookList" :key="hook.key">
        <ion-label class="ion-text-wrap">
          {{ hook.label }}
          <p>{{ hook.url || translate("OMS URL unavailable") }}</p>
        </ion-label>
        <ion-button slot="end" fill="clear" :disabled="!hook.url" @click="copyUrl(hook.url)">
          <ion-icon slot="icon-only" :icon="copyOutline" />
        </ion-button>
      </ion-item>

      <ion-item>
        <ion-input
          v-model="sharedToken"
          :label="translate('Shared webhook token')"
          label-placement="stacked"
          type="password"
          placeholder="••••••••"
          autocomplete="off"
        />
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!sharedToken.trim() || isSaving"
      @click="save()"
    >
      {{ translate("Save token") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline, copyOutline } from 'ionicons/icons'
import { commonUtil, logger, translate } from '@common'
import { useQuickBoxStore } from '@/store/quickbox'
import { computed, ref } from 'vue'

const quickBoxStore = useQuickBoxStore()
const sharedToken = ref("")
const isSaving = ref(false)

const webhookList = computed(() => {
  const urls = quickBoxStore.getWebhookUrls
  return [
    { key: 'fulfillmentStatus', label: translate("Fulfillment status"), url: urls.fulfillmentStatus },
    { key: 'shipmentConfirm', label: translate("Shipment confirmation"), url: urls.shipmentConfirm },
    { key: 'inventoryAdjustment', label: translate("Inventory adjustment"), url: urls.inventoryAdjustment }
  ]
})

function closeModal(saved = false) {
  modalController.dismiss({ saved })
}

async function copyUrl(url: string) {
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    commonUtil.showToast(translate("Copied to clipboard"))
  } catch (error) {
    logger.error('copyWebhookUrl', error)
  }
}

async function save() {
  isSaving.value = true
  try {
    await quickBoxStore.updateWebhookToken({ password: sharedToken.value.trim() })
    commonUtil.showToast(translate("QuickBox webhook token saved"))
    closeModal(true)
  } catch (error) {
    logger.error('updateQuickBoxWebhookToken', error)
    commonUtil.showToast(translate("Failed to save QuickBox webhook token"))
  } finally {
    isSaving.value = false
  }
}
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/EditQuickBoxWebhookModal.vue
git commit -m "feat: QuickBox inbound-webhook modal (receiver URLs + shared token)"
```

---

## Task 5: Hub view (replace scaffold)

**Files:**
- Modify (replace scaffold): `src/views/QuickBox.vue`

- [ ] **Step 1: Replace the scaffold with the full hub**

Replace the entire contents of `src/views/QuickBox.vue` with:

```vue
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("QuickBox 3PL") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-horizontal">
      <div class="ion-margin-top">
        <h1>{{ translate("Configuration") }}</h1>
        <section>
          <ion-item detail class="item-box" lines="none" button @click="openApiCredentialsModal()">
            <ion-label class="ion-text-wrap">
              {{ apiConfig.sendUrl || translate("Not configured") }}
              <p>{{ translate("API credentials") }} · {{ authModeLabel }}</p>
            </ion-label>
          </ion-item>
          <ion-item detail class="item-box" lines="none" button @click="openWebhookModal()">
            <ion-label class="ion-text-wrap">
              {{ translate("Inbound webhooks") }}
              <p>{{ translate("Shared token and receiver URLs") }}</p>
            </ion-label>
          </ion-item>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonItem, IonLabel, IonMenuButton, IonPage, IonTitle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
import { translate } from '@common';
import { computed } from "vue";
import { useQuickBoxStore } from '@/store/quickbox';
import EditQuickBoxApiCredentialsModal from "@/components/EditQuickBoxApiCredentialsModal.vue";
import EditQuickBoxWebhookModal from "@/components/EditQuickBoxWebhookModal.vue";

const quickBoxStore = useQuickBoxStore();
const apiConfig = computed(() => quickBoxStore.apiConfig)
const authModeLabel = computed(() =>
  quickBoxStore.getAuthMode === 'basic' ? translate("Basic auth") : translate("Bearer token")
)

onIonViewWillEnter(async () => {
  await quickBoxStore.fetchConnectionConfig()
})

async function openApiCredentialsModal() {
  const modal = await modalController.create({ component: EditQuickBoxApiCredentialsModal })
  await modal.present()
  await modal.onWillDismiss()
  await quickBoxStore.fetchConnectionConfig()
}

async function openWebhookModal() {
  const modal = await modalController.create({ component: EditQuickBoxWebhookModal })
  await modal.present()
  await modal.onWillDismiss()
}
</script>

<style scoped>
.item-box::part(native) {
  --border-radius: var(--spacer-xs);
  border: var(--border-medium);
}

section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacer-sm);
}

@media screen and (min-width: 700px) {
  ion-content {
    --padding-start: var(--spacer-lg);
    --padding-end: var(--spacer-lg);
  }
}
</style>
```

- [ ] **Step 2: Type-check + build**

Run: `npx vue-tsc --noEmit -p tsconfig.json && pnpm build`
Expected: 0 type errors (TS5101 only); build ends with `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/views/QuickBox.vue
git commit -m "feat: QuickBox connection hub with API-credentials and webhook cards"
```

---

## Task 6: Surface fetch status in Settings

**Files:**
- Modify: `src/views/Settings.vue`

- [ ] **Step 1: Import and instantiate the store**

In `src/views/Settings.vue`, after the existing util-store import line (`import { useUtilStore } from '@/store/util';`, line ~126), add:

```typescript
import { useQuickBoxStore } from '@/store/quickbox';
```

After the existing `const utilStore = useUtilStore();` line (~141), add:

```typescript
const quickBoxStore = useQuickBoxStore();
```

After the existing `const shopifyFetchStatus = computed(() => shopifyStore.fetchStatus)` line (~159), add:

```typescript
const quickBoxFetchStatus = computed(() => quickBoxStore.fetchStatus)
```

- [ ] **Step 2: Add the entry to `harmonizedFetchStatus`**

In the `harmonizedFetchStatus` computed array (starts ~line 174), add this object immediately after the Shopify shops entry (the one whose `refresh: () => shopifyStore.fetchShopifyShops()`, ~line 195-198):

```typescript
  {
    label: translate("QuickBox connection"),
    status: quickBoxFetchStatus.value.connection,
    refresh: () => quickBoxStore.fetchConnectionConfig()
  },
```

(No change to the `oldestSyncTime` aggregation — QuickBox config is fetched on its own screen, not part of the initial sync window.)

- [ ] **Step 3: Type-check + build**

Run: `npx vue-tsc --noEmit -p tsconfig.json && pnpm build`
Expected: 0 type errors (TS5101 only); build ends with `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/views/Settings.vue
git commit -m "feat: show QuickBox connection fetch status in Settings"
```

---

## Task 7: Manual dogfood verification

No code changes — verify the feature end to end against a local OMS running the asbeauty stack (`cd /Users/anilpatel/maarg-sd/asbeauty && ./gradlew run`, instance on `http://localhost:8080`; substitute your local admin credentials for `john.doe:moqui`). The company app must point at this OMS (its configured Maarg base URL).

- [ ] **Step 1: Run the app and confirm navigation**

Run: `pnpm dev` (or your usual dev command). Log in, open the side menu, click **QuickBox** → the hub loads with two cards; "API credentials" shows "Not configured" on a fresh instance.

- [ ] **Step 2: Set Bearer credentials and confirm no secret leaks**

In the app: open **API credentials**, set Base URL `https://example.test/iq`, Authentication = **Bearer token**, API token `tok_123`, Save. Then:

```bash
curl -s -u "john.doe:moqui" http://localhost:8080/rest/s1/oms/systemMessageRemotes | python3 -m json.tool | grep -A6 QuickBoxApi
```
Expected: the `QuickBoxApi` entry shows `"sendUrl": "https://example.test/iq"`, an empty/absent `username`, and **no** `password` key in the response.

- [ ] **Step 3: Switch to Basic auth and confirm username set + bearer cleared**

In the app: reopen **API credentials**, switch to **Basic auth**, Username `qbuser`, Password `qbpass`, Save. Then re-run the curl from Step 2.
Expected: `"username": "qbuser"` now present; still **no** `password` in the response.

- [ ] **Step 4: Confirm "blank secret keeps stored value"**

In the app: reopen **API credentials**, change Base URL to `https://example.test/iq2`, leave the password field blank, Save. Then re-run the curl.
Expected: `"sendUrl"` updated to `.../iq2`, `username` still `qbuser` — the stored password was not overwritten (no error; the record still authenticates on outbound send).

- [ ] **Step 5: Webhook URLs render + token saves**

In the app: open **Inbound webhooks**. Expected: three URLs render of the form `<oms-base>/rest/s1/quickbox/fulfillmentStatus`, `.../shipmentConfirm`, `.../inventoryAdjustment`, each with a working copy button. Enter a Shared webhook token `whk_123`, Save token. Then:

```bash
curl -s -u "john.doe:moqui" http://localhost:8080/rest/s1/oms/systemMessageRemotes | python3 -m json.tool | grep -A4 QuickBoxWebhookIn
```
Expected: the `QuickBoxWebhookIn` entry exists; response contains **no** `password` key (write succeeded, secret not echoed).

- [ ] **Step 6: Settings + logout**

In the app: open **Settings** → the Data Fetch Status card lists a **QuickBox connection** row with a success state and a working refresh button. Log out and back in → the QuickBox hub still reads the persisted config (no stale secret in memory; `clearQuickBoxState` ran on logout).

---

## Self-Review (completed by plan author)

**Spec coverage:** connection & auth (QuickBoxApi) → Tasks 1, 3; webhook token + receiver URLs (QuickBoxWebhookIn) → Tasks 1, 4; generic-endpoint architecture & secret redaction → Task 1 + Task 7 curls; Shopify-style hub + two modals → Tasks 3-5; store `fetchStatus` contract + logout + menu + route + Settings → Tasks 1, 2, 6; verify-after testing → every task + Task 7. Out-of-scope items (warehouse mapping, jobs, SFTP, sendPath) intentionally absent.

**Placeholder scan:** none — every step has concrete code or an exact command + expected output.

**Type consistency:** store API used identically across files — `apiConfig` ({sendUrl, username}), getters `isApiConfigured` / `getAuthMode` ('bearer'|'basic') / `getWebhookUrls` ({fulfillmentStatus, shipmentConfirm, inventoryAdjustment}), actions `fetchConnectionConfig` / `updateApiCredentials({sendUrl, authMode, username?, password?})` / `updateWebhookToken({password?})` / `clearQuickBoxState`. Modal/hub usages match these signatures exactly.
