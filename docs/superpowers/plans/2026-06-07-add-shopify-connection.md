# Add New Shopify Connection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create a new Shopify shop connection from the Company PWA's Shopify Connections list page, creating both the `ShopifyShop` record and its `SystemMessageRemote` credentials in Moqui, plus add a UI to rotate credentials on existing shops.

**Architecture:** `CreateShopifyConnectionModal.vue` collects all required fields and calls `POST /sob/shop/remote` (creates `SystemMessageRemote`) followed by `POST /oms/shopifyShops/shops` (creates `ShopifyShop`). `EditShopifyCredentialsModal.vue` calls the same `POST /sob/shop/remote` service to rotate credentials on an existing shop. Three new actions are added to the existing Pinia `shopify` store. The existing FAB-less list page (`ShopifyConnections.vue`) gains a floating action button; the existing details hub (`ShopifyConnectionDetails.vue`) gains a "API credentials" entry under Configuration.

**Tech Stack:** Ionic Vue (`@ionic/vue`), Pinia (`src/store/shopify.ts`), `@common` (`api`, `commonUtil`, `logger`, `translate`, `emitter`), Vue `ref`/`computed`/`onMounted`

> **Note on tests:** No Vitest setup exists in this app yet. Test steps are omitted — add them when a `vitest.config.ts` and `tests/` directory are bootstrapped.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `src/store/shopify.ts` |
| Create | `src/components/CreateShopifyConnectionModal.vue` |
| Modify | `src/views/ShopifyConnections.vue` |
| Create | `src/components/EditShopifyCredentialsModal.vue` |
| Modify | `src/views/ShopifyConnectionDetails.vue` |
| Modify | `src/locales/en.json` (keys spread across tasks) |

---

## Background: APIs used

All endpoints live under the same Moqui base URL. No explicit `baseURL` override is needed — `api()` from `@common` defaults to `getMaargURL()` when `VITE_OMS_TYPE=MOQUI`.

| Endpoint | Purpose |
|----------|---------|
| `POST /sob/shop/remote` | Creates (or updates) the `SystemMessageRemote` that stores Shopify credentials. Returns `{ systemMessageRemoteId }`. Required params: `myShopifydomain`, `shopifyShopId`, `shopAccessToken`, `clientId`, `clientSecret`. Optional: `sendSharedSecret`, `name`, `hotwaxShopId`, `oldClientSecret`. |
| `POST /oms/shopifyShops/shops` | Creates the `ShopifyShop` record. Required: `shopId`. Also accepts: `shopifyShopId`, `myshopifyDomain`, `name`, `productStoreId`, etc. |
| `GET /oms/systemMessageRemotes?internalId=<shopId>&internalIdType=HOTWAX_SHOP_ID` | Fetches the `SystemMessageRemote` linked to an internal `shopId` so the edit credentials modal can pre-fill the form. |

---

## Task 1: Add store actions for shop creation and credentials

**Files:**
- Modify: `src/store/shopify.ts:189` (insert before `clearShopifyState`)

- [ ] **Step 1: Insert three new actions into `shopify.ts` before `clearShopifyState`**

Open `src/store/shopify.ts`. Replace:
```typescript
    clearShopifyState() {
      this.$reset()
    }
```
with:
```typescript
    async storeShopifyRemote(payload: {
      myShopifydomain: string
      shopifyShopId: string
      shopAccessToken: string
      clientId: string
      clientSecret: string
      sendSharedSecret?: string
      name?: string
      hotwaxShopId?: string
      oldClientSecret?: string
      accessScope?: string
    }) {
      const resp = await api({ url: 'sob/shop/remote', method: 'post', data: payload })
      if (commonUtil.hasError(resp)) throw resp
      return resp.data as { systemMessageRemoteId: string }
    },

    async createShopifyShop(payload: {
      shopId: string
      shopifyShopId?: string
      myshopifyDomain?: string
      name?: string
      productStoreId?: string
      isEnabled?: string
    }) {
      const resp = await api({ url: 'oms/shopifyShops/shops', method: 'post', data: payload })
      if (commonUtil.hasError(resp)) throw resp
      this.shops.push(resp.data)
      return resp.data
    },

    async fetchSystemMessageRemote(shopId: string) {
      const resp = await api({
        url: 'oms/systemMessageRemotes',
        method: 'get',
        params: { internalId: shopId, internalIdType: 'HOTWAX_SHOP_ID', pageSize: 1 }
      })
      if (commonUtil.hasError(resp)) throw resp
      const list = Array.isArray(resp.data) ? resp.data : (resp.data?.docs ?? [])
      return list[0] ?? null
    },

    clearShopifyState() {
      this.$reset()
    }
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/anilpatel/pwa-sd/company && npx tsc --noEmit 2>&1 | grep shopify
```
Expected: no errors from `shopify.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/store/shopify.ts
git commit -m "feat: add storeShopifyRemote, createShopifyShop, fetchSystemMessageRemote store actions"
```

---

## Task 2: Build `CreateShopifyConnectionModal.vue`

**Files:**
- Create: `src/components/CreateShopifyConnectionModal.vue`
- Modify: `src/locales/en.json` (new keys for this modal)

- [ ] **Step 1: Add locale keys to `en.json`**

Open `src/locales/en.json`. Find an alphabetically appropriate place (near existing "Shopify" keys) and add:

```json
"Access token": "Access token",
"Add Shopify connection": "Add Shopify connection",
"Client ID": "Client ID",
"Client secret": "Client secret",
"Failed to create Shopify connection": "Failed to create Shopify connection",
"Internal shop ID": "Internal shop ID",
"Please fill in all required fields": "Please fill in all required fields",
"Shopify connection created": "Shopify connection created",
"Shopify shop ID": "Shopify shop ID",
"Webhook secret": "Webhook secret",
```

- [ ] **Step 2: Create `src/components/CreateShopifyConnectionModal.vue`**

```vue
<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Add Shopify connection") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-input
          v-model="form.myShopifydomain"
          :label="translate('Shopify domain') + ' *'"
          label-placement="stacked"
          placeholder="store.myshopify.com"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.shopifyShopId"
          :label="translate('Shopify shop ID') + ' *'"
          label-placement="stacked"
          placeholder="72176566383"
          inputmode="numeric"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.shopId"
          :label="translate('Internal shop ID') + ' *'"
          label-placement="stacked"
          placeholder="10000"
          helper-text="Unique ID used internally in HotWax"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.shopAccessToken"
          :label="translate('Access token') + ' *'"
          label-placement="stacked"
          type="password"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.clientId"
          :label="translate('Client ID') + ' *'"
          label-placement="stacked"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.clientSecret"
          :label="translate('Client secret') + ' *'"
          label-placement="stacked"
          type="password"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.sendSharedSecret"
          :label="translate('Webhook secret')"
          label-placement="stacked"
          type="password"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.name"
          :label="translate('Shop name')"
          label-placement="stacked"
          :placeholder="form.myShopifydomain.split('.')[0] || ''"
        />
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!isFormValid"
      @click="saveConnection()"
    >
      {{ translate("Add Shopify connection") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonList, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { useShopifyStore } from '@/store/shopify'
import { computed, reactive } from 'vue'

const shopifyStore = useShopifyStore()

const form = reactive({
  myShopifydomain: '',
  shopifyShopId: '',
  shopId: '',
  shopAccessToken: '',
  clientId: '',
  clientSecret: '',
  sendSharedSecret: '',
  name: ''
})

const isFormValid = computed(() =>
  form.myShopifydomain.trim() &&
  form.shopifyShopId.trim() &&
  form.shopId.trim() &&
  form.shopAccessToken.trim() &&
  form.clientId.trim() &&
  form.clientSecret.trim()
)

function closeModal() {
  modalController.dismiss({ dismissed: true })
}

async function saveConnection() {
  if (!isFormValid.value) {
    commonUtil.showToast(translate('Please fill in all required fields'))
    return
  }

  emitter.emit('presentLoader')
  try {
    await shopifyStore.storeShopifyRemote({
      myShopifydomain: form.myShopifydomain.trim(),
      shopifyShopId: form.shopifyShopId.trim(),
      shopAccessToken: form.shopAccessToken.trim(),
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      sendSharedSecret: form.sendSharedSecret.trim() || undefined,
      name: form.name.trim() || undefined,
      hotwaxShopId: form.shopId.trim()
    })

    await shopifyStore.createShopifyShop({
      shopId: form.shopId.trim(),
      shopifyShopId: form.shopifyShopId.trim(),
      myshopifyDomain: form.myShopifydomain.trim(),
      name: form.name.trim() || form.myShopifydomain.trim().split('.')[0],
      isEnabled: 'Y'
    })

    commonUtil.showToast(translate('Shopify connection created'))
    await modalController.dismiss({ shopId: form.shopId.trim() })
  } catch (error: any) {
    logger.error('createShopifyConnection', error)
    commonUtil.showToast(translate('Failed to create Shopify connection'))
  }
  emitter.emit('dismissLoader')
}
</script>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/anilpatel/pwa-sd/company && npx tsc --noEmit 2>&1 | grep CreateShopify
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/CreateShopifyConnectionModal.vue src/locales/en.json
git commit -m "feat: add CreateShopifyConnectionModal with two-step shop creation"
```

---

## Task 3: Wire FAB button into `ShopifyConnections.vue`

**Files:**
- Modify: `src/views/ShopifyConnections.vue`
- Modify: `src/locales/en.json` (one new key)

- [ ] **Step 1: Add `"Add connection"` locale key to `en.json`**

Add to `src/locales/en.json`:
```json
"Add connection": "Add connection",
```

- [ ] **Step 2: Add `IonFab`, `IonFabButton`, `modalController`, `addOutline` imports**

In `src/views/ShopifyConnections.vue`, change the `@ionic/vue` import from:
```typescript
import { IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonSearchbar, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter } from "@ionic/vue";
```
to:
```typescript
import { IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPage, IonSearchbar, IonTitle, IonToggle, IonToolbar, modalController, onIonViewWillEnter } from "@ionic/vue";
```

Change the `ionicons/icons` import from:
```typescript
import { filterOutline, flashOutline, informationCircleOutline, openOutline, storefrontOutline } from "ionicons/icons";
```
to:
```typescript
import { addOutline, filterOutline, flashOutline, informationCircleOutline, openOutline, storefrontOutline } from "ionicons/icons";
```

Add the `CreateShopifyConnectionModal` import after the existing component imports:
```typescript
import CreateShopifyConnectionModal from "@/components/CreateShopifyConnectionModal.vue";
```

- [ ] **Step 3: Add the FAB to the template**

In `src/views/ShopifyConnections.vue`, find the closing `</ion-content>` tag and add the FAB immediately after it (before `</ion-page>`):

Change:
```html
    </ion-content>
  </ion-page>
```
to:
```html
    </ion-content>

    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button @click="openCreateModal()">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
```

- [ ] **Step 4: Add `openCreateModal` function**

In the `<script setup>` block of `src/views/ShopifyConnections.vue`, add after the `openShopifyConnectionDetails` function:

```typescript
async function openCreateModal() {
  const modal = await modalController.create({
    component: CreateShopifyConnectionModal
  })
  await modal.present()
  const { data } = await modal.onWillDismiss()
  if (data?.shopId) {
    const newShop = shopifyStore.getShopById(data.shopId)
    if (newShop) {
      shopifyStore.updateCurrentShop(newShop)
    }
    router.push({ path: `/shopify-connection-details/${data.shopId}` })
  }
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/anilpatel/pwa-sd/company && npx tsc --noEmit 2>&1 | grep ShopifyConnections
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/ShopifyConnections.vue src/locales/en.json
git commit -m "feat: add FAB to ShopifyConnections to open CreateShopifyConnectionModal"
```

---

## Task 4: Build `EditShopifyCredentialsModal.vue`

**Files:**
- Create: `src/components/EditShopifyCredentialsModal.vue`
- Modify: `src/locales/en.json` (new keys)

- [ ] **Step 1: Add locale keys**

Add to `src/locales/en.json`:
```json
"API credentials": "API credentials",
"Credentials updated successfully": "Credentials updated successfully",
"Failed to update credentials": "Failed to update credentials",
"Old client secret": "Old client secret",
"Rotate credentials": "Rotate credentials",
"Access token and secrets": "Access token and secrets",
```

- [ ] **Step 2: Create `src/components/EditShopifyCredentialsModal.vue`**

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
    <ion-item class="ion-margin-top" lines="none">
      <ion-label>
        <b>{{ props.shop.myshopifyDomain }}</b>
        <p>{{ props.shop.shopId }}</p>
      </ion-label>
    </ion-item>

    <ion-list>
      <ion-item>
        <ion-input
          v-model="form.shopifyShopId"
          :label="translate('Shopify shop ID') + ' *'"
          label-placement="stacked"
          inputmode="numeric"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.clientId"
          :label="translate('Client ID') + ' *'"
          label-placement="stacked"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.shopAccessToken"
          :label="translate('Access token') + ' *'"
          label-placement="stacked"
          type="password"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.clientSecret"
          :label="translate('Client secret') + ' *'"
          label-placement="stacked"
          type="password"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.oldClientSecret"
          :label="translate('Old client secret')"
          label-placement="stacked"
          type="password"
          helper-text="Required when rotating a secret"
          autocomplete="off"
        />
      </ion-item>
      <ion-item>
        <ion-input
          v-model="form.sendSharedSecret"
          :label="translate('Webhook secret')"
          label-placement="stacked"
          type="password"
          autocomplete="off"
        />
      </ion-item>
    </ion-list>

    <ion-button
      class="ion-margin"
      expand="block"
      :disabled="!isFormValid || isLoading"
      @click="updateCredentials()"
    >
      {{ translate("Rotate credentials") }}
    </ion-button>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar, modalController
} from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { commonUtil, emitter, logger, translate } from '@common'
import { useShopifyStore } from '@/store/shopify'
import { computed, onMounted, reactive, ref } from 'vue'

const props = defineProps<{ shop: any }>()
const shopifyStore = useShopifyStore()
const isLoading = ref(false)

const form = reactive({
  shopifyShopId: '',
  clientId: '',
  shopAccessToken: '',
  clientSecret: '',
  oldClientSecret: '',
  sendSharedSecret: ''
})

const isFormValid = computed(() =>
  form.shopifyShopId.trim() &&
  form.clientId.trim() &&
  form.shopAccessToken.trim() &&
  form.clientSecret.trim()
)

onMounted(async () => {
  isLoading.value = true
  try {
    const remote = await shopifyStore.fetchSystemMessageRemote(props.shop.shopId)
    if (remote) {
      form.shopifyShopId = remote.remoteId ?? props.shop.shopifyShopId ?? ''
      form.clientId = remote.remoteAppCode ?? ''
    }
  } catch (error: any) {
    logger.error('fetchSystemMessageRemote', error)
  }
  isLoading.value = false
})

function closeModal() {
  modalController.dismiss({ dismissed: true })
}

async function updateCredentials() {
  if (!isFormValid.value) {
    commonUtil.showToast(translate('Please fill in all required fields'))
    return
  }

  emitter.emit('presentLoader')
  try {
    await shopifyStore.storeShopifyRemote({
      myShopifydomain: props.shop.myshopifyDomain,
      shopifyShopId: form.shopifyShopId.trim(),
      shopAccessToken: form.shopAccessToken.trim(),
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      oldClientSecret: form.oldClientSecret.trim() || undefined,
      sendSharedSecret: form.sendSharedSecret.trim() || undefined,
      hotwaxShopId: props.shop.shopId
    })
    commonUtil.showToast(translate('Credentials updated successfully'))
    await modalController.dismiss({ updated: true })
  } catch (error: any) {
    logger.error('updateShopifyCredentials', error)
    commonUtil.showToast(translate('Failed to update credentials'))
  }
  emitter.emit('dismissLoader')
}
</script>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/anilpatel/pwa-sd/company && npx tsc --noEmit 2>&1 | grep EditShopify
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/EditShopifyCredentialsModal.vue src/locales/en.json
git commit -m "feat: add EditShopifyCredentialsModal for rotating Shopify access tokens"
```

---

## Task 5: Wire credentials entry into `ShopifyConnectionDetails.vue`

**Files:**
- Modify: `src/views/ShopifyConnectionDetails.vue`

The Configuration section (lines ~29–43) currently has two `item-box` items: Instance details and Product Store. We add a third for API credentials.

- [ ] **Step 1: Add `EditShopifyCredentialsModal` import in the `<script setup>` of `ShopifyConnectionDetails.vue`**

Find where other component imports live in `ShopifyConnectionDetails.vue` (search for `import … from "@/components/`). Add:

```typescript
import EditShopifyCredentialsModal from "@/components/EditShopifyCredentialsModal.vue";
```

- [ ] **Step 2: Ensure `modalController` is imported from `@ionic/vue`**

Find the `@ionic/vue` import line in `ShopifyConnectionDetails.vue`. If `modalController` is not already there, add it. For example, if the line ends with `...IonToolbar }`, change it to `...IonToolbar, modalController }`.

- [ ] **Step 3: Add `openCredentialsModal` function**

In the `<script setup>` section of `ShopifyConnectionDetails.vue`, add after the `openProductStoreModal` function (search for `async function openProductStoreModal`):

```typescript
async function openCredentialsModal() {
  const modal = await modalController.create({
    component: EditShopifyCredentialsModal,
    componentProps: { shop: shop.value }
  })
  await modal.present()
}
```

- [ ] **Step 4: Add the item-box to the Configuration section in the template**

Find:
```html
            <ion-item detail class="item-box" lines="none" button @click="openProductStoreModal()">
              <ion-label>
                {{ shop.productStoreId || translate("Not linked") }}
                <p>{{ translate("Product Store") }}</p>
              </ion-label>
            </ion-item>
```

Add immediately after it:
```html
            <ion-item detail class="item-box" lines="none" button @click="openCredentialsModal()">
              <ion-label>
                {{ translate("API credentials") }}
                <p>{{ translate("Access token and secrets") }}</p>
              </ion-label>
            </ion-item>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/anilpatel/pwa-sd/company && npx tsc --noEmit 2>&1 | grep ShopifyConnectionDetails
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/ShopifyConnectionDetails.vue
git commit -m "feat: add API credentials entry to ShopifyConnectionDetails configuration section"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Create new ShopifyShop record | Task 1 (`createShopifyShop`) + Task 2 (modal form) + Task 3 (FAB) |
| Create SystemMessageRemote (credentials) | Task 1 (`storeShopifyRemote`) + Task 2 (called in modal) |
| POST `/sob/shop/remote` endpoint | Task 1 |
| POST `/oms/shopifyShops/shops` endpoint | Task 1 |
| Navigate to new shop after creation | Task 3 (modal dismissal handler) |
| Edit/rotate credentials on existing shop | Task 1 (`fetchSystemMessageRemote`) + Task 4 + Task 5 |
| Locale keys | Tasks 2, 3, 4 |

All requirements covered.

### Placeholder scan

No TBD / TODO / "similar to" references in any code block. All function names match across tasks (`storeShopifyRemote`, `createShopifyShop`, `fetchSystemMessageRemote`, `openCredentialsModal`).

### Type consistency

- `storeShopifyRemote` defined in Task 1, called in Tasks 2 and 4 with matching parameter names.
- `createShopifyShop` defined in Task 1, called in Task 2 with matching field names.
- `fetchSystemMessageRemote` defined in Task 1 (returns first element or null), called in Task 4 with null-check.
- `props.shop.myshopifyDomain` used in Task 4 — this field name matches the `ShopifyShop` entity field (`myshopifyDomain`, lowercase d).
