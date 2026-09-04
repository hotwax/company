# Company App: AccxUI Migration + Moqui Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the company app from Vue CLI + Vuex + @hotwax/dxp-components to the accxui stack (Vite + Pinia + @common), then update Moqui and accxui-common so all API calls — including login — go directly to Moqui with no OFBiz dependency.

**Architecture:**
- Part 1 (Tasks 1–10): Replace build system (Vue CLI → Vite), state (Vuex → Pinia), auth (DxpLogin/launchpad → Login from @common), and HTTP client (custom axios → api() from @common). Use job-manager as the reference implementation.
- Part 2 (Task 11): Patch `getOmsURL()` in accxui-common to recognize `/rest/s1` paths so Moqui URLs are passed through without appending `/api/`.
- Part 3 (Tasks 12–15): Add missing auth endpoints to Moqui (`logout`, `getPermissions`), fix `login` parameter casing (frontend sends uppercase `USERNAME`/`PASSWORD`, Moqui expects lowercase), and fix `checkLoginOptions` to return `maargInstanceUrl`.

**Tech Stack:** Vue 3, Ionic 8, Vite 6, Pinia, pinia-plugin-persistedstate, @common (accxui), Moqui (notnaked), TypeScript

---

## File Map

### Company App (`/Users/anilpatel/pwa-sd/company/`)

| Action | Path |
|--------|------|
| **Create** | `vite.config.js` |
| **Create** | `index.html` (move from `public/` to root, update asset refs) |
| **Delete** | `vue.config.js` |
| **Delete** | `babel.config.js` |
| **Rewrite** | `package.json` |
| **Rewrite** | `src/main.ts` |
| **Rewrite** | `src/router/index.ts` |
| **Delete** | `src/api/index.ts` |
| **Rewrite** | `src/adapter/index.ts` (re-export from @common) |
| **Delete** | `src/user-utils/index.ts` |
| **Delete** | `src/authorization/` (entire dir) |
| **Create** | `src/store/user.ts` (Pinia) |
| **Create** | `src/store/productStore.ts` (Pinia) |
| **Create** | `src/store/util.ts` (Pinia) |
| **Create** | `src/store/netSuite.ts` (Pinia) |
| **Create** | `src/store/shopify.ts` (Pinia) |
| **Create** | `src/store/klaviyo.ts` (Pinia) |
| **Delete** | `src/store/modules/` (entire dir) |
| **Delete** | `src/store/index.ts` (Vuex root store) |
| **Update** | `src/services/UserService.ts` |
| **Update** | `.env.example` |
| **Update** | All `src/views/*.vue` (Vuex → Pinia, env vars) |

### AccxUI Common (`/Users/anilpatel/pwa-sd/accxui/common/`)

| Action | Path |
|--------|------|
| **Update** | `utils/commonUtil.ts` (`getOmsURL()` to support `/rest/s1` paths) |

### Moqui (`/Users/anilpatel/maarg-sd/notnaked/`)

| Action | Path |
|--------|------|
| **Update** | `runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml` |
| **Update** | `runtime/component/maarg-util/service/admin.rest.xml` |

---

## Task 1: Scaffold Vite build system

**Files:**
- Create: `vite.config.js`
- Create: `index.html` (root level)
- Modify: `package.json`
- Delete: `vue.config.js`, `babel.config.js`

- [ ] **Step 1: Create `vite.config.js`**

```js
// vite.config.js
import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'
import pkg from './package.json'

// Inline version info (replaces @hotwax/app-version-info)
function getVersionInfo() {
  const { execSync } = require('child_process')
  try {
    return JSON.stringify({
      version: pkg.version,
      branch: execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
      tag: execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""').toString().trim(),
      revision: execSync('git rev-parse --short HEAD').toString().trim(),
      builtTime: new Date().toISOString()
    })
  } catch {
    return JSON.stringify({ version: pkg.version })
  }
}

export default defineConfig({
  plugins: [
    vue(),
    legacy()
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION_INFO': JSON.stringify(getVersionInfo())
  },
  resolve: {
    dedupe: ['vue', 'pinia'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Adjust this path to point at the actual accxui/common directory
      '@common': path.resolve(__dirname, '../accxui/common')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
```

- [ ] **Step 2: Create root `index.html`**

Copy `public/index.html` to project root and replace `<%= BASE_URL %>` with `/` and add Vite module script tag:

```html
<!DOCTYPE html>
<html lang="">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="/favicon.ico">
    <title>Company</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Update `package.json` — replace scripts and deps**

Replace scripts section:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test:unit": "vitest",
  "lint": "eslint ."
},
```

In `dependencies`, **remove**:
- `@hotwax/dxp-components`
- `@hotwax/oms-api`
- `@hotwax/app-version-info`
- `vuex`
- `vuex-persistedstate`
- `axios` (now provided by @common)
- `axios-cache-adapter` (now provided by @common)
- `@casl/ability`
- `boon-js`

In `dependencies`, **add**:
```json
"pinia": "^3.0.4",
"pinia-plugin-persistedstate": "^4.7.1",
"qs": "^6.15.0"
```

In `devDependencies`, **remove** all `@vue/cli-*` packages, `@vue/cli-service`, `@vue/compiler-sfc`, `@vue/eslint-config-typescript`, `@vue/test-utils`, `@vue/vue3-jest`, `cypress`, `ts-jest`, `vue-cli-plugin-i18n`, `@intlify/vue-i18n-loader`.

In `devDependencies`, **add**:
```json
"vite": "^6.0.0",
"@vitejs/plugin-vue": "^5.0.0",
"@vitejs/plugin-legacy": "^6.0.0",
"vitest": "^3.0.0"
```

Also add `"type": "module"` at the top level of package.json.

- [ ] **Step 4: Delete `vue.config.js` and `babel.config.js`**

```bash
rm /Users/anilpatel/pwa-sd/company/vue.config.js
rm /Users/anilpatel/pwa-sd/company/babel.config.js
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/anilpatel/pwa-sd/company && npm install
```

Expected: resolves without errors. If pnpm workspace is used, run `pnpm install` instead.

- [ ] **Step 6: Verify vite starts (will fail on missing imports — that's OK for now)**

```bash
cd /Users/anilpatel/pwa-sd/company && npm run dev 2>&1 | head -30
```

Expected: Vite starts or fails with TS import errors (not "vite not found"). Import errors are fixed in later tasks.

- [ ] **Step 7: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company && git add vite.config.js index.html package.json package-lock.json
git commit -m "chore: scaffold vite build system, replace vue-cli"
```

---

## Task 2: Migrate environment variables

**Files:**
- Modify: `.env.example`
- Modify: All files containing `process.env.VUE_APP_`

- [ ] **Step 1: Update `.env.example`**

Replace the entire file content:
```env
VITE_I18N_LOCALE=en
VITE_I18N_FALLBACK_LOCALE=en
VITE_CACHE_MAX_AGE=3600
VITE_VIEW_SIZE=10
VITE_APP_PERMISSION_ID="COMPANY_APP_VIEW"
VITE_DEFAULT_LOG_LEVEL="error"
VITE_COMPANY_PARTY_ID="COMPANY"
VITE_GITBOOK_API_KEY=""
VITE_SPACE_ID=""
VITE_GITBOOK_BASE_URL=""
VITE_NETSUITE_INTEGRATION_TYPE_MAPPING={"INVENTORY_VARIANCE_TYPE_ID":"NETSUITE_VAR_TRAN","SHIPPING_METHOD_TYPE_ID":"NETSUITE_SHP_MTHD","PAYMENT_METHOD_TYPE_ID":"NETSUITE_PMT_MTHD","PRICE_LEVEL_TYPE_ID":"NETSUITE_PRICE_LEVEL","DISCOUNT_TYPE_ID":"NETSUITE_DISC_MTHD"}
```

Note: `VUE_APP_LOGIN_URL` and `VUE_APP_FACILITIES_LOGIN_URL` are removed — login is now inline.

- [ ] **Step 2: Find all `process.env.VUE_APP_` references**

```bash
grep -rn "process\.env\.VUE_APP_" /Users/anilpatel/pwa-sd/company/src/
```

Expected output: list of files with line numbers. Each one needs `process.env.VUE_APP_FOO` → `import.meta.env.VITE_FOO`.

- [ ] **Step 3: Replace in source files (sed)**

```bash
cd /Users/anilpatel/pwa-sd/company
find src -type f \( -name "*.ts" -o -name "*.vue" \) -exec sed -i '' \
  's/process\.env\.VUE_APP_I18N_LOCALE/import.meta.env.VITE_I18N_LOCALE/g;
   s/process\.env\.VUE_APP_PERMISSION_ID/import.meta.env.VITE_APP_PERMISSION_ID/g;
   s/process\.env\.VUE_APP_DEFAULT_LOG_LEVEL/import.meta.env.VITE_DEFAULT_LOG_LEVEL/g;
   s/process\.env\.VUE_APP_COMPANY_PARTY_ID/import.meta.env.VITE_COMPANY_PARTY_ID/g;
   s/process\.env\.VUE_APP_CACHE_MAX_AGE/import.meta.env.VITE_CACHE_MAX_AGE/g;
   s/process\.env\.VUE_APP_VIEW_SIZE/import.meta.env.VITE_VIEW_SIZE/g;
   s/process\.env\.VUE_APP_GITBOOK_API_KEY/import.meta.env.VITE_GITBOOK_API_KEY/g;
   s/process\.env\.VUE_APP_SPACE_ID/import.meta.env.VITE_SPACE_ID/g;
   s/process\.env\.VUE_APP_GITBOOK_BASE_URL/import.meta.env.VITE_GITBOOK_BASE_URL/g;
   s/process\.env\.VUE_APP_NETSUITE_INTEGRATION_TYPE_MAPPING/import.meta.env.VITE_NETSUITE_INTEGRATION_TYPE_MAPPING/g;
   s/process\.env\.VUE_APP_LOGIN_URL/import.meta.env.VITE_LOGIN_URL/g;
   s/process\.env\.BASE_URL/import.meta.env.BASE_URL/g' {} \;
```

- [ ] **Step 4: Verify no remaining VUE_APP references**

```bash
grep -rn "process\.env\.VUE_APP_\|VUE_APP_" /Users/anilpatel/pwa-sd/company/src/
```

Expected: zero results (or only in comments).

- [ ] **Step 5: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git add .env.example src/
git commit -m "chore: migrate VUE_APP_* env vars to VITE_*"
```

---

## Task 3: Replace HTTP client and adapter with @common

**Files:**
- Delete: `src/api/index.ts`
- Rewrite: `src/adapter/index.ts`
- Modify: `src/services/UserService.ts`

- [ ] **Step 1: Delete the custom axios setup**

```bash
rm /Users/anilpatel/pwa-sd/company/src/api/index.ts
```

- [ ] **Step 2: Rewrite `src/adapter/index.ts` to re-export from @common**

```typescript
// src/adapter/index.ts
export { api, client, axios, commonUtil, cookieHelper, translate, useAuth, emitter } from '@common'
```

- [ ] **Step 3: Update `src/services/UserService.ts`**

Replace the entire file:

```typescript
// src/services/UserService.ts
import { api } from '@common'

const getAvailableTimeZones = async (): Promise<any> => {
  return api({
    url: 'admin/user/getAvailableTimeZones',
    method: 'get',
    cache: true
  })
}

const getUserAccount = async (userId: string): Promise<any> => {
  return api({
    url: `admin/users/${encodeURIComponent(userId)}`,
    method: 'GET'
  })
}

const setUserTimeZone = async (payload: any): Promise<any> => {
  return api({
    url: 'admin/user/profile',
    method: 'post',
    data: payload
  })
}

export const UserService = {
  getAvailableTimeZones,
  getUserAccount,
  setUserTimeZone
}
```

Note: `login`, `getUserProfile`, and `getUserPermissions` are removed — those are now handled by `useAuth()` and the Pinia user store via @common.

- [ ] **Step 4: Find all imports of `@/api` and update to `@common`**

```bash
grep -rn "from '@/api'\|from \"@/api\"" /Users/anilpatel/pwa-sd/company/src/
```

Replace each with `import { api, client } from '@common'`.

- [ ] **Step 5: Verify no remaining @/api imports**

```bash
grep -rn "@/api" /Users/anilpatel/pwa-sd/company/src/
```

Expected: zero results.

- [ ] **Step 6: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git add src/adapter/index.ts src/services/UserService.ts
git rm src/api/index.ts
git commit -m "feat: replace custom axios with @common api(), remove @hotwax/oms-api adapter"
```

---

## Task 4: Create Pinia user store

**Files:**
- Create: `src/store/user.ts`

This is the most important store — it hooks into @common's auth lifecycle.

- [ ] **Step 1: Create `src/store/user.ts`**

```typescript
// src/store/user.ts
import { defineStore } from 'pinia'
import { DateTime, Settings } from 'luxon'
import { api, commonUtil, translate } from '@common'
import { useAuth } from '@common/composables/useAuth'
import logger from '@/logger'

export const useUserStore = defineStore('user', {
  state: () => ({
    current: {} as any,
    permissions: [] as string[],
    instanceUrl: '',
    oms: '',
    omsRedirectionInfo: { url: '', token: '' },
  }),

  getters: {
    isAuthenticated: (state) => useAuth().isAuthenticated.value,
    getUserProfile: (state) => state.current,
    getUserToken: () => useAuth().isAuthenticated.value ? 'authenticated' : '',
    getInstanceUrl: (state) => state.instanceUrl,
    getUserPermissions: (state) => state.permissions,
    hasPermission: (state) => (permissionId: string): boolean => {
      if (!permissionId) return true
      if (permissionId.includes(' OR ')) {
        return permissionId.split(' OR ').some(p => useUserStore().hasPermission(p.trim()))
      }
      if (permissionId.includes(' AND ')) {
        return permissionId.split(' AND ').every(p => useUserStore().hasPermission(p.trim()))
      }
      return state.permissions.includes(permissionId)
    }
  },

  actions: {
    async fetchUserProfile() {
      try {
        const resp = await api({
          url: 'admin/user/profile',
          method: 'get',
          baseURL: commonUtil.getMaargURL()
        })
        if (commonUtil.hasError(resp)) throw resp.data._ERROR_MESSAGE_
        this.current = resp.data
        useAuth().updateUserId(this.current.userId)
        if (this.current.timeZone) {
          Settings.defaultZone = this.current.timeZone
        }
      } catch (error: any) {
        commonUtil.showToast(translate('Failed to fetch user profile'))
        logger.error('fetchUserProfile error', error)
        useAuth().clearAuth()
        return Promise.reject(new Error(error))
      }
    },

    async fetchPermissions() {
      const permissionId = import.meta.env.VITE_APP_PERMISSION_ID
      const serverPermissions: string[] = []
      const viewSize = 200
      let viewIndex = 0

      try {
        let resp: any
        do {
          resp = await api({
            url: 'getPermissions',
            method: 'post',
            baseURL: commonUtil.getOmsURL(),
            data: { viewIndex, viewSize }
          })
          if (resp.status === 200 && resp.data.docs?.length && !commonUtil.hasError(resp)) {
            serverPermissions.push(...resp.data.docs.map((p: any) => p.permissionId))
            viewIndex++
          } else {
            resp = null
          }
        } while (resp)

        if (permissionId) {
          if (!serverPermissions.includes(permissionId)) {
            const msg = 'You do not have permission to access the app.'
            commonUtil.showToast(translate(msg))
            return Promise.reject(new Error(msg))
          }
        }

        this.permissions = serverPermissions
      } catch (error: any) {
        return Promise.reject(error)
      }
    },

    async setUserTimeZone(tzId: string) {
      if (this.current.timeZone === tzId) return
      try {
        const resp = await api({
          url: 'admin/user/profile',
          method: 'POST',
          data: { userId: this.current.userId, tzId }
        }) as any
        if (resp?.status === 200) {
          this.current.timeZone = tzId
          Settings.defaultZone = tzId
          commonUtil.showToast(translate('Time zone updated successfully'))
        } else {
          throw resp
        }
      } catch (err) {
        logger.error('setUserTimeZone error', err)
        commonUtil.showToast(translate('Failed to update time zone'))
        return Promise.reject('')
      }
    },

    // Called by initialiseConfig after successful login
    async postLogin() {
      try {
        await this.fetchUserProfile()
        await this.fetchPermissions()
      } catch (error: any) {
        return Promise.reject(new Error(error))
      }
    },

    // Called by initialiseConfig after logout
    async postLogout() {
      this.$reset()
    }
  },

  persist: true
})
```

- [ ] **Step 2: Verify the store typechecks**

```bash
cd /Users/anilpatel/pwa-sd/company && npx tsc --noEmit --skipLibCheck 2>&1 | grep "store/user" | head -10
```

Expected: no errors from user.ts. Other errors from unfinished migration are OK.

- [ ] **Step 3: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git add src/store/user.ts
git commit -m "feat: create Pinia user store with postLogin/postLogout hooks"
```

---

## Task 5: Create remaining Pinia stores

**Files:**
- Create: `src/store/productStore.ts`
- Create: `src/store/util.ts`
- Create: `src/store/netSuite.ts`
- Create: `src/store/shopify.ts`
- Create: `src/store/klaviyo.ts`

For each, read the corresponding Vuex module's `state`, `getters`, `actions`, and `mutations` in `src/store/modules/{name}/` and translate to Pinia's `defineStore` pattern. Mutations are folded into actions. The pattern for each:

- [ ] **Step 1: Read existing Vuex modules**

```bash
cat /Users/anilpatel/pwa-sd/company/src/store/modules/productStore/index.ts
cat /Users/anilpatel/pwa-sd/company/src/store/modules/util/index.ts
cat /Users/anilpatel/pwa-sd/company/src/store/modules/netSuite/index.ts
cat /Users/anilpatel/pwa-sd/company/src/store/modules/shopify/index.ts
cat /Users/anilpatel/pwa-sd/company/src/store/modules/klaviyo/index.ts
```

- [ ] **Step 2: Create `src/store/productStore.ts`**

Translate the productStore Vuex module. Template (fill in state/getters/actions from the Vuex source):

```typescript
// src/store/productStore.ts
import { defineStore } from 'pinia'
import { api, commonUtil, translate } from '@common'
import logger from '@/logger'

export const useProductStoreStore = defineStore('productStore', {
  state: () => ({
    // Copy state fields from src/store/modules/productStore/ProductStoreState.ts
  }),
  getters: {
    // Copy getters from src/store/modules/productStore/getters.ts
  },
  actions: {
    // Copy actions from src/store/modules/productStore/actions.ts
    // Replace: store.commit(TYPE, data) → this.field = data
    // Replace: store.dispatch('productStore/action', payload) → useProductStoreStore().action(payload)
    // Replace: this.dispatch('module/action') → useOtherStore().action()
    clearProductStoreState() {
      this.$reset()
    }
  },
  persist: true
})
```

- [ ] **Step 3: Create `src/store/util.ts`**

```typescript
// src/store/util.ts
import { defineStore } from 'pinia'
import { api, commonUtil, translate } from '@common'
import logger from '@/logger'

export const useUtilStore = defineStore('util', {
  state: () => ({
    // Copy state fields from src/store/modules/util/UtilState.ts
  }),
  getters: {
    // Copy getters from src/store/modules/util/getters.ts
  },
  actions: {
    // Copy actions from src/store/modules/util/actions.ts
    // Translate mutations inline
    clearUtilState() {
      this.$reset()
    }
  },
  persist: true
})
```

- [ ] **Step 4: Create `src/store/netSuite.ts`, `src/store/shopify.ts`, `src/store/klaviyo.ts`**

Same pattern — read Vuex module, translate to defineStore. Key translation rules:
- `state` object → `state: () => ({...})`
- Getters: same signature, remove Vuex type params
- Mutations (`commit(TYPE, payload)`): fold into actions or make direct state assignments
- Actions: keep async, replace `commit(TYPE, data)` with `this.field = data`
- Cross-store dispatch: `this.dispatch('module/action')` → `useOtherStore().action()`
- `store.getters['module/getter']` → `useOtherStore().getter`

- [ ] **Step 5: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git add src/store/productStore.ts src/store/util.ts src/store/netSuite.ts src/store/shopify.ts src/store/klaviyo.ts
git commit -m "feat: migrate all Vuex modules to Pinia stores"
```

---

## Task 6: Rewrite `src/main.ts`

**Files:**
- Rewrite: `src/main.ts`
- Delete: `src/authorization/` (CASL permission system — replaced by simple hasPermission in user store)
- Delete: `src/user-utils/index.ts`

- [ ] **Step 1: Delete authorization plugin**

```bash
rm -rf /Users/anilpatel/pwa-sd/company/src/authorization
rm /Users/anilpatel/pwa-sd/company/src/user-utils/index.ts
```

- [ ] **Step 2: Rewrite `src/main.ts`**

```typescript
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import logger from './logger'

import { IonicVue } from '@ionic/vue'

import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

import './theme/variables.css'
import '@common/css/settings.css'
import '@common/css/theme.css'

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import localeMessages from './locales'
import { createDxpI18n, initialiseConfig } from '@common'
import { useUserStore } from './store/user'
import { DateTime } from 'luxon'

const pinia = createPinia().use(piniaPluginPersistedstate)
const i18n = createDxpI18n(localeMessages)

const app = createApp(App)
  .use(IonicVue, { mode: 'md', innerHTMLTemplatesEnabled: true })
  .use(logger, { level: import.meta.env.VITE_DEFAULT_LOG_LEVEL })
  .use(i18n)
  .use(pinia)
  .use(router)

// Wire up @common's auth lifecycle to the user store
initialiseConfig({
  postLogin: useUserStore().postLogin,
  postLogout: useUserStore().postLogout,
  get oms() { return useUserStore().oms },
  set oms(val) { useUserStore().oms = val },
  get current() { return useUserStore().current },
  set current(val) { useUserStore().current = val },
  router: router
})

// Date filter (keep for views using $filters)
app.config.globalProperties.$filters = {
  formatDate(value: any, inFormat?: string, outFormat?: string) {
    if (inFormat) {
      return DateTime.fromFormat(value, inFormat).toFormat(outFormat ?? 'MM-dd-yyyy')
    }
    return DateTime.fromISO(value).toFormat(outFormat ?? 'MM-dd-yyyy')
  }
}

router.isReady().then(() => {
  app.mount('#app')
})
```

Note: `@hotwax/apps-theme` is removed — theme is now in `@common/css/`. If the company app has unique theme CSS in `node_modules/@hotwax/apps-theme`, copy it to `src/theme/variables.css`.

- [ ] **Step 3: Update `src/i18n/index.ts` to use @common's createDxpI18n**

Find the current i18n setup file:
```bash
cat /Users/anilpatel/pwa-sd/company/src/i18n/index.ts
```

Replace with:
```typescript
// src/i18n/index.ts
export { translate } from '@common'
```

And update `src/locales/index.ts` to export locale messages in the format `createDxpI18n` expects. See job-manager's `src/locales/index.ts` for the exact format.

- [ ] **Step 4: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git rm -r src/authorization
git rm src/user-utils/index.ts
git add src/main.ts src/i18n/
git commit -m "feat: rewrite main.ts with Pinia/initialiseConfig, remove CASL auth plugin"
```

---

## Task 7: Rewrite `src/router/index.ts`

**Files:**
- Rewrite: `src/router/index.ts`

The auth guard changes from "redirect to external launchpad" to "redirect to local /login route". The Login component comes from @common.

- [ ] **Step 1: Rewrite `src/router/index.ts`**

```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from '@ionic/vue-router'
import { RouteRecordRaw } from 'vue-router'
import { Login } from '@common'
import { useAuth } from '@common/composables/useAuth'
import { useUserStore } from '@/store/user'

// All route component imports (keep the same as existing)
import CreateProductStore from '@/views/CreateProductStore.vue'
import AddConfigurations from '@/views/AddConfigurations.vue'
import ProductStoreDetails from '@/views/ProductStoreDetails.vue'
import ProductStore from '@/views/ProductStore.vue'
import NetSuite from '@/views/NetSuite.vue'
import Settings from '@/views/Settings.vue'
import ShipmentMethods from '@/views/ShipmentMethods.vue'
import InventoryVariances from '@/views/InventoryVariances.vue'
import PaymentMethods from '@/views/PaymentMethods.vue'
import SalesChannel from '@/views/SalesChannel.vue'
import Departments from '@/views/Departments.vue'
import ShopifyConnectionDetails from '@/views/ShopifyConnectionDetails.vue'
import Klaviyo from '@/views/Klaviyo.vue'
import KlaviyoConnectionDetails from '@/views/KlaviyoConnectionDetails.vue'

const authGuard = async () => {
  if (!useAuth().isAuthenticated.value) {
    return { path: '/login' }
  }
}

const loginGuard = () => {
  if (useAuth().isAuthenticated.value) {
    return { path: '/' }
  }
}

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/product-store' },

  { path: '/product-store', name: 'ProductStore', component: ProductStore, beforeEnter: authGuard },
  { path: '/product-store-details/:productStoreId', name: 'ProductStoreDetails', component: ProductStoreDetails, props: true, beforeEnter: authGuard },
  { path: '/shopify', name: 'ShopifyConnections', component: () => import('@/views/ShopifyConnections.vue'), beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id', name: 'ShopifyConnectionDetails', component: ShopifyConnectionDetails, props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/locations', name: 'ShopifyLocations', component: () => import('@/views/ShopifyLocations.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/shipment-methods', name: 'ShopifyShipmentMethods', component: () => import('@/views/ShopifyShipmentMethods.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/payment-methods', name: 'ShopifyPaymentMethods', component: () => import('@/views/ShopifyPaymentMethods.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/sales-channels', name: 'ShopifySalesChannels', component: () => import('@/views/ShopifySalesChannels.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-types', name: 'ShopifyProductTypes', component: () => import('@/views/ShopifyProductTypes.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync', name: 'ShopifyProductSync', component: () => import('@/views/ShopifyProductSync.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync/history', name: 'ShopifyProductSyncHistory', component: () => import('@/views/ShopifyProductSyncHistory.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/product-sync/upgrade-assistant', name: 'ShopifyProductSyncUpgradeAssistant', component: () => import('@/views/ShopifyProductSyncUpgradeAssistant.vue'), props: true, beforeEnter: authGuard },
  { path: '/shopify-connection-details/:id/instance-details', name: 'ShopifyInstanceDetails', component: () => import('@/views/ShopifyShopDetails.vue'), props: true, beforeEnter: authGuard },
  { path: '/klaviyo', name: 'Klaviyo', component: Klaviyo, beforeEnter: authGuard },
  { path: '/klaviyo/:id', name: 'KlaviyoConnectionDetails', component: KlaviyoConnectionDetails, props: true, beforeEnter: authGuard },
  { path: '/netsuite', name: 'NetSuite', component: NetSuite, beforeEnter: authGuard },
  { path: '/netsuite/shipment-methods', name: 'ShipmentMethods', component: ShipmentMethods, beforeEnter: authGuard },
  { path: '/netsuite/inventory-variances', name: 'InventoryVariances', component: InventoryVariances, beforeEnter: authGuard },
  { path: '/netsuite/payment-methods', name: 'PaymentMethods', component: PaymentMethods, beforeEnter: authGuard },
  { path: '/netsuite/sales-channel', name: 'SalesChannel', component: SalesChannel, beforeEnter: authGuard },
  { path: '/netsuite/departments', name: 'Departments', component: Departments, beforeEnter: authGuard },
  { path: '/create-product-store', name: 'CreateProductStore', component: CreateProductStore },
  { path: '/add-configurations/:productStoreId', name: 'AddConfigurations', component: AddConfigurations, props: true,
    beforeEnter: (to, from) => {
      if (from.path !== '/create-product-store') return { path: from.path }
    }
  },
  { path: '/login', name: 'Login', component: Login, beforeEnter: loginGuard },
  { path: '/settings', name: 'Settings', component: Settings, beforeEnter: authGuard },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
```

- [ ] **Step 2: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git add src/router/index.ts
git commit -m "feat: replace DxpLogin/launchpad auth with @common Login component"
```

---

## Task 8: Update views for Pinia

**Files:**
- Modify: All `src/views/*.vue` files

The pattern is mechanical: every view that imported `store` or used `useStore()` from Vuex needs to switch to the appropriate Pinia store.

- [ ] **Step 1: Find all Vuex store usages in views**

```bash
grep -rln "useStore\|from '@/store'\|store\.getters\|store\.dispatch\|useAuthStore\|@hotwax/dxp" \
  /Users/anilpatel/pwa-sd/company/src/views/ \
  /Users/anilpatel/pwa-sd/company/src/components/
```

- [ ] **Step 2: For each view, apply these replacements**

**Import replacements:**
```typescript
// REMOVE:
import { useStore } from '@/store'
import store from '@/store'
import { useAuthStore } from '@hotwax/dxp-components'
import { translate } from '@/i18n'

// ADD:
import { useUserStore } from '@/store/user'
import { useProductStoreStore } from '@/store/productStore'
import { useUtilStore } from '@/store/util'
import { useNetSuiteStore } from '@/store/netSuite'
import { useShopifyStore } from '@/store/shopify'
import { useKlaviyoStore } from '@/store/klaviyo'
import { translate } from '@common'
```

**In setup():**
```typescript
// REMOVE:
const store = useStore()
const authStore = useAuthStore()

// ADD (only the stores the view actually uses):
const userStore = useUserStore()
const productStoreStore = useProductStoreStore()
// etc.
```

**Getter access:**
```typescript
// BEFORE:
store.getters['user/getUserProfile']
store.getters['productStore/getSomeValue']

// AFTER:
userStore.getUserProfile
productStoreStore.someValue
```

**Action dispatch:**
```typescript
// BEFORE:
store.dispatch('user/login', payload)
store.dispatch('productStore/someAction', payload)

// AFTER:
userStore.login(payload)
productStoreStore.someAction(payload)
```

**Permission checks (replace CASL $can with hasPermission):**
```typescript
// BEFORE:
import { Actions, Resources } from '@/authorization'
// In template: v-if="$can(Actions.VIEW, Resources.PRODUCT_STORE)"

// AFTER:
// In template: v-if="userStore.hasPermission('PERMISSION_ID')"
```

- [ ] **Step 3: Remove all Vuex imports from views**

```bash
grep -rln "from 'vuex'\|from '@/store'" /Users/anilpatel/pwa-sd/company/src/
```

Fix each file.

- [ ] **Step 4: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git add src/views/ src/components/
git commit -m "feat: update all views from Vuex to Pinia stores"
```

---

## Task 9: Delete Vuex module directory and store index

**Files:**
- Delete: `src/store/modules/`
- Delete: `src/store/index.ts` (Vuex root)
- Delete: `src/store/RootState.ts`
- Delete: `src/store/actions.ts`, `src/store/getters.ts`, `src/store/mutations.ts` (if they exist)

- [ ] **Step 1: Verify no remaining imports of deleted files**

```bash
grep -rn "from '@/store/modules\|from '@/store/index\|from '@/store'" /Users/anilpatel/pwa-sd/company/src/ | grep -v "from '@/store/user\|from '@/store/productStore\|from '@/store/util\|from '@/store/netSuite\|from '@/store/shopify\|from '@/store/klaviyo'"
```

Expected: zero results.

- [ ] **Step 2: Delete Vuex store files**

```bash
rm -rf /Users/anilpatel/pwa-sd/company/src/store/modules
rm -f /Users/anilpatel/pwa-sd/company/src/store/index.ts
rm -f /Users/anilpatel/pwa-sd/company/src/store/RootState.ts
rm -f /Users/anilpatel/pwa-sd/company/src/store/actions.ts
rm -f /Users/anilpatel/pwa-sd/company/src/store/getters.ts
rm -f /Users/anilpatel/pwa-sd/company/src/store/mutations.ts
```

- [ ] **Step 3: Do a full build to check for broken imports**

```bash
cd /Users/anilpatel/pwa-sd/company && npm run build 2>&1 | tail -30
```

Expected: build succeeds or fails only on known missing @common path (Task 10 fixes this). No "Cannot find module '@/store'" errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/anilpatel/pwa-sd/company
git rm -r src/store/modules src/store/index.ts src/store/RootState.ts
git commit -m "chore: remove Vuex store, all state now in Pinia"
```

---

## Task 10: Verify company app builds and runs against OFBiz

At this point the accxui migration is complete. The app should build and run against the current OFBiz backend. This validates the migration before touching Moqui.

- [ ] **Step 1: Run dev server**

```bash
cd /Users/anilpatel/pwa-sd/company && npm run dev
```

- [ ] **Step 2: Open http://localhost:5173 and verify login screen appears**

The @common Login component should show the OMS URL input screen. Enter your OFBiz instance URL and credentials. Verify the app loads after login.

- [ ] **Step 3: Test a few pages**

Navigate to /product-store, /shopify, /settings. Verify data loads correctly.

- [ ] **Step 4: Fix any remaining issues**

Common issues at this stage:
- Missing CSS: `@common/css/settings.css` or `@common/css/theme.css` path wrong → verify `@common` alias in `vite.config.js` points to the correct directory
- `translate` not working → ensure `createDxpI18n` is set up and `@common/index.ts` exports `translate`
- Pinia stores referencing deleted Vuex types → grep and fix
- `require()` calls (from old Vue CLI) → replace with `import` or `new URL(asset, import.meta.url)`

- [ ] **Step 5: Commit any fixes**

```bash
cd /Users/anilpatel/pwa-sd/company
git add -p
git commit -m "fix: resolve post-migration compatibility issues"
```

---

## Task 11: Patch accxui-common `getOmsURL()` to support Moqui REST paths

**Files:**
- Modify: `/Users/anilpatel/pwa-sd/accxui/common/utils/commonUtil.ts`

**Problem:** `getOmsURL()` appends `/api/` to any URL that doesn't already contain `/api`. Moqui's REST API is at `/rest/s1/admin/` — not `/api/`. If the user sets OMS to `https://moqui.company.io/rest/s1/admin/`, the current code appends `/api/` producing a broken URL.

**Fix:** Treat URLs already containing `/rest/s1` (or any `/rest/` path) as complete — don't append `/api/`.

- [ ] **Step 1: Read the current `getOmsURL` function**

```bash
grep -n "getOmsURL\|omsURL" /Users/anilpatel/pwa-sd/accxui/common/utils/commonUtil.ts | head -20
```

Expected: lines around 381-388 (from earlier read).

- [ ] **Step 2: Edit `commonUtil.ts` — update `getOmsURL()`**

Find this exact block (around line 381):
```typescript
const getOmsURL = () => {
  const oms = getEmbeddedAppStoreSafe().oms || cookieHelper().get("oms")
  let omsURL = ""
  if (oms) {
    omsURL = oms.startsWith('http') ? oms.includes('/api') ? oms : `${oms}/api/` : `https://${oms}.hotwax.io/api/`
  }
  return omsURL;
}
```

Replace with:
```typescript
const getOmsURL = () => {
  const oms = getEmbeddedAppStoreSafe().oms || cookieHelper().get("oms")
  let omsURL = ""
  if (oms) {
    // Treat URLs already containing /api or /rest/ as fully-qualified paths (e.g. Moqui REST URLs)
    omsURL = oms.startsWith('http')
      ? (oms.includes('/api') || oms.includes('/rest/')) ? oms : `${oms}/api/`
      : `https://${oms}.hotwax.io/api/`
  }
  // Ensure trailing slash so appended endpoint paths join correctly
  if (omsURL && !omsURL.endsWith('/')) omsURL += '/'
  return omsURL;
}
```

- [ ] **Step 3: Run the accxui-common build to verify no breakage**

```bash
cd /Users/anilpatel/pwa-sd/accxui && npm run build 2>&1 | tail -20
```

Or if no build script: `npx tsc --noEmit` in the common dir.

- [ ] **Step 4: Write a quick unit test to verify the new behavior**

Create a temp test file or run in Node:
```bash
node -e "
const getOmsURL = (oms) => {
  let omsURL = ''
  if (oms) {
    omsURL = oms.startsWith('http')
      ? (oms.includes('/api') || oms.includes('/rest/')) ? oms : \`\${oms}/api/\`
      : \`https://\${oms}.hotwax.io/api/\`
    if (!omsURL.endsWith('/')) omsURL += '/'
  }
  return omsURL
}
// OFBiz tests (must not regress)
console.assert(getOmsURL('demo') === 'https://demo.hotwax.io/api/', 'OFBiz short name')
console.assert(getOmsURL('https://demo.hotwax.io') === 'https://demo.hotwax.io/api/', 'OFBiz full URL')
console.assert(getOmsURL('https://demo.hotwax.io/api/') === 'https://demo.hotwax.io/api/', 'OFBiz with /api/')
// Moqui tests (new behavior)
console.assert(getOmsURL('https://moqui.company.io/rest/s1/admin') === 'https://moqui.company.io/rest/s1/admin/', 'Moqui REST path')
console.assert(getOmsURL('https://moqui.company.io/rest/s1/admin/') === 'https://moqui.company.io/rest/s1/admin/', 'Moqui REST with trailing slash')
console.log('All assertions passed')
"
```

Expected: `All assertions passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/anilpatel/pwa-sd/accxui
git add common/utils/commonUtil.ts
git commit -m "feat: getOmsURL() now treats /rest/ paths as fully-qualified (Moqui support)"
```

---

## Task 12: Fix Moqui `login#User` to accept uppercase USERNAME/PASSWORD

**Files:**
- Modify: `/Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml`

**Problem:** The accxui frontend sends `{ "USERNAME": "...", "PASSWORD": "..." }` (OFBiz convention — uppercase). Moqui's service defines `<parameter name="username"/>` (lowercase). Moqui is case-sensitive for service parameters, so the login call fails with a missing-credentials error.

- [ ] **Step 1: Read current `login#User` service parameters**

```bash
grep -n "parameter name" /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml | head -20
```

- [ ] **Step 2: Edit `AuthServices.xml` — add uppercase parameters to `login#User`**

Find the `login#User` in-parameters block (currently lines 24-30):
```xml
    <service verb="login" noun="User">
        <in-parameters>
            <parameter name="username"/>
            <parameter name="password"/>
            <!-- Deprecated parameter ... -->
            <parameter name="token"/>
        </in-parameters>
```

Replace with:
```xml
    <service verb="login" noun="User">
        <in-parameters>
            <parameter name="username"/>
            <parameter name="password"/>
            <!-- OFBiz/accxui convention sends uppercase; accept both -->
            <parameter name="USERNAME"/>
            <parameter name="PASSWORD"/>
            <!-- Deprecated parameter ... -->
            <parameter name="token"/>
        </in-parameters>
```

Then in the `<actions>` script block, find the line `loggedIn = ec.user.loginUser(username, password)` and replace with:

```groovy
// Accept both OFBiz-style uppercase and Moqui-style lowercase params
def actualUsername = username ?: USERNAME
def actualPassword = password ?: PASSWORD
loggedIn = ec.user.loginUser(actualUsername, actualPassword)
userLoginId = ec.user.username
```

Also update the token path — find `jwtClaims.userLoginId` section to also use `actualUsername`/`actualPassword` pattern already covers it since token path doesn't need username/password.

- [ ] **Step 3: Verify XML is valid**

```bash
xmllint --noout /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml && echo "XML valid"
```

Expected: `XML valid`

- [ ] **Step 4: Commit**

```bash
cd /Users/anilpatel/maarg-sd/notnaked
git add runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml
git commit -m "fix: login#User accepts uppercase USERNAME/PASSWORD (OFBiz/accxui compatibility)"
```

---

## Task 13: Fix `check#LoginOptions` to return `maargInstanceUrl`

**Files:**
- Modify: `/Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml`

**Problem:** The accxui frontend reads `resp.data.maargInstanceUrl` from `checkLoginOptions` and stores it in the `maarg` cookie. This cookie is what `getMaargURL()` uses for all subsequent API calls. Currently Moqui returns `omsInstanceUrl` (not `maargInstanceUrl`), so the maarg cookie is never set and all `admin/*` API calls fail.

When using Moqui as the backend, Moqui IS the maarg — `maargInstanceUrl` should point to the Moqui base URL.

- [ ] **Step 1: Edit `AuthServices.xml` — update `check#LoginOptions` to return `maargInstanceUrl`**

Find the out-parameters of `check#LoginOptions` (currently lines 4-13):
```xml
    <service verb="check" noun="LoginOptions" authenticate="anonymous-all">
        <description>Check for login options</description>
        <out-parameters>
            <parameter name="loginAuthType" required="true"/>
            <parameter name="loginAuthUrl"/>
            <parameter name="omsInstanceUrl"/>
            <parameter name="omsInstanceName"/>
        </out-parameters>
        <actions>
            <set field="loginAuthType" value="BASIC"/>
            <set field="loginAuthUrl" value="${ec.web.getWebappRootUrl(true, false)}/rest/s1/admin/login"/>
            <set field="omsInstanceUrl" from="System.getProperty('ofbiz.instance.url')"/>
            <set field="omsInstanceName" from="System.getProperty('ofbiz.instance.name')"/>
        </actions>
    </service>
```

Replace with:
```xml
    <service verb="check" noun="LoginOptions" authenticate="anonymous-all">
        <description>Check for login options</description>
        <out-parameters>
            <parameter name="loginAuthType" required="true"/>
            <parameter name="loginAuthUrl"/>
            <parameter name="maargInstanceUrl"/>
            <parameter name="omsInstanceUrl"/>
            <parameter name="omsInstanceName"/>
        </out-parameters>
        <actions>
            <set field="loginAuthType" value="BASIC"/>
            <!-- maargInstanceUrl: this Moqui instance is the maarg backend -->
            <set field="maargInstanceUrl" from="ec.web.getWebappRootUrl(true, false) + '/rest/s1/'"/>
            <set field="loginAuthUrl" from="ec.web.getWebappRootUrl(true, false) + '/rest/s1/admin/login'"/>
            <set field="omsInstanceUrl" from="System.getProperty('ofbiz.instance.url')"/>
            <set field="omsInstanceName" from="System.getProperty('ofbiz.instance.name')"/>
        </actions>
    </service>
```

- [ ] **Step 2: Verify XML is valid**

```bash
xmllint --noout /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml && echo "XML valid"
```

- [ ] **Step 3: Commit**

```bash
cd /Users/anilpatel/maarg-sd/notnaked
git add runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml
git commit -m "fix: checkLoginOptions returns maargInstanceUrl pointing to Moqui REST API"
```

---

## Task 14: Add `logout` endpoint to Moqui

**Files:**
- Modify: `/Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml`
- Modify: `/Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/admin.rest.xml`

**Problem:** The accxui frontend calls `GET ${omsURL}logout` on logout. Moqui has no such endpoint, causing a 404 that can break the logout flow.

- [ ] **Step 1: Add `logout#User` service to `AuthServices.xml`**

Append before the closing `</services>` tag:

```xml
    <service verb="logout" noun="User" authenticate="user-account">
        <description>Logout the current user, invalidate their session.</description>
        <out-parameters>
            <parameter name="logoutAuthType"/>
            <parameter name="logoutUrl"/>
        </out-parameters>
        <actions>
            <script><![CDATA[
                try {
                    ec.user.logoutUser()
                } catch (Exception e) {
                    ec.logger.warn("Logout warning: " + e.getMessage())
                }
                logoutAuthType = "BASIC"
            ]]></script>
        </actions>
    </service>
```

- [ ] **Step 2: Add `logout` resource to `admin.rest.xml`**

Find the `checkLoginOptions` resource (lines 15-17) and add the logout resource after it:

```xml
    <resource name="logout">
        <method type="get"><service name="co.hotwax.auth.AuthServices.logout#User"/></method>
    </resource>
```

The full block should look like:
```xml
    <resource name="login" require-authentication="anonymous-all">
        <method type="post"><service name="co.hotwax.auth.AuthServices.login#User"/></method>
    </resource>
    <resource name="checkLoginOptions" require-authentication="anonymous-all">
        <method type="get"><service name="co.hotwax.auth.AuthServices.check#LoginOptions"/></method>
    </resource>
    <resource name="logout">
        <method type="get"><service name="co.hotwax.auth.AuthServices.logout#User"/></method>
    </resource>
```

- [ ] **Step 3: Verify XML files are valid**

```bash
xmllint --noout /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml && echo "AuthServices.xml valid"
xmllint --noout /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/admin.rest.xml && echo "admin.rest.xml valid"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/anilpatel/maarg-sd/notnaked
git add runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml
git add runtime/component/maarg-util/service/admin.rest.xml
git commit -m "feat: add logout#User service and REST endpoint at /rest/s1/admin/logout"
```

---

## Task 15: Add `getPermissions` endpoint to Moqui

**Files:**
- Create service in: `AuthServices.xml` (or delegate to existing `UserServices.get#SecurityPermissions`)
- Modify: `admin.rest.xml`

**Problem:** The accxui user store calls `POST ${getOmsURL()}/getPermissions` with `{ viewIndex, viewSize }` and expects `{ docs: [{ permissionId: "..." }], count: N }`. Moqui has `admin/user/permissions` (GET via `get#SecurityPermissions`) but not a `getPermissions` POST endpoint.

- [ ] **Step 1: Read the existing `get#SecurityPermissions` service to understand its output format**

```bash
grep -n "getSecurityPermissions\|get#SecurityPermissions\|SecurityPermission" \
  /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/util/UserServices.xml | head -20
```

- [ ] **Step 2: Add `get#UserPermissions` service to `AuthServices.xml`**

This service wraps the current user's permissions in OFBiz-compatible format. Append before `</services>`:

```xml
    <service verb="get" noun="UserPermissions" authenticate="user-account">
        <description>
            Get permissions for the current authenticated user.
            Returns in OFBiz-compatible format: { docs: [{permissionId}], count }.
        </description>
        <in-parameters>
            <parameter name="viewIndex" type="Integer" default-value="0"/>
            <parameter name="viewSize" type="Integer" default-value="200"/>
        </in-parameters>
        <out-parameters>
            <parameter name="docs" type="List"/>
            <parameter name="count" type="Integer"/>
        </out-parameters>
        <actions>
            <script><![CDATA[
                import org.moqui.entity.EntityList
                import org.moqui.entity.EntityValue

                def userId = ec.user.userId
                def permList = []

                // Get all security groups for this user
                def userGroupMemberList = ec.entity.find("moqui.security.UserGroupMember")
                    .condition("userId", userId)
                    .list()

                def groupIds = userGroupMemberList.collect { it.userGroupId } as Set

                // For each group, get permissions
                def allPermIds = [] as Set
                for (groupId in groupIds) {
                    def groupPerms = ec.entity.find("moqui.security.UserGroupPermission")
                        .condition("userGroupId", groupId)
                        .list()
                    groupPerms.each { allPermIds.add(it.permissionId) }
                }

                // Also check direct user permissions
                def directPerms = ec.entity.find("moqui.security.UserPermissionCheck")
                    .condition("userId", userId)
                    .list()
                directPerms.each { allPermIds.add(it.permissionId) }

                // Paginate
                def allPermsList = allPermIds.toList()
                count = allPermsList.size()
                def startIdx = viewIndex * viewSize
                def endIdx = Math.min(startIdx + viewSize, count)
                def pagePerms = startIdx < count ? allPermsList[startIdx..<endIdx] : []

                docs = pagePerms.collect { permId -> [permissionId: permId] }
            ]]></script>
        </actions>
    </service>
```

- [ ] **Step 3: Add `getPermissions` resource to `admin.rest.xml`**

After the `logout` resource, add:

```xml
    <resource name="getPermissions">
        <method type="post"><service name="co.hotwax.auth.AuthServices.get#UserPermissions"/></method>
    </resource>
```

- [ ] **Step 4: Validate XML**

```bash
xmllint --noout /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml && echo "valid"
xmllint --noout /Users/anilpatel/maarg-sd/notnaked/runtime/component/maarg-util/service/admin.rest.xml && echo "valid"
```

- [ ] **Step 5: Commit**

```bash
cd /Users/anilpatel/maarg-sd/notnaked
git add runtime/component/maarg-util/service/co/hotwax/auth/AuthServices.xml
git add runtime/component/maarg-util/service/admin.rest.xml
git commit -m "feat: add getPermissions endpoint at /rest/s1/admin/getPermissions (accxui compatibility)"
```

---

## Task 16: End-to-end test — login via Moqui

This task wires everything together and verifies the full flow.

- [ ] **Step 1: Start local Moqui server**

```bash
cd /Users/anilpatel/maarg-sd/notnaked && ./gradlew run
```

Wait for `Moqui is running` in the logs. Default port is 8080.

- [ ] **Step 2: Test `checkLoginOptions` manually**

```bash
curl -s "http://localhost:8080/rest/s1/admin/checkLoginOptions" | python3 -m json.tool
```

Expected response:
```json
{
  "loginAuthType": "BASIC",
  "maargInstanceUrl": "http://localhost:8080/rest/s1/",
  "loginAuthUrl": "http://localhost:8080/rest/s1/admin/login"
}
```

- [ ] **Step 3: Test `login` manually**

```bash
curl -s -X POST "http://localhost:8080/rest/s1/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"USERNAME": "admin", "PASSWORD": "moqui"}' | python3 -m json.tool
```

Expected response:
```json
{
  "token": "eyJ...",
  "expirationTime": 1748634000000,
  "api_key": "..."
}
```

If you get `{"errorMessage": "..."}`, the `USERNAME` parameter isn't being accepted — re-check Task 12's Groovy changes to ensure `actualUsername = username ?: USERNAME`.

- [ ] **Step 4: Test `logout` manually**

```bash
# Get a token first (from Step 3), then:
TOKEN="eyJ..."
curl -s "http://localhost:8080/rest/s1/admin/logout" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: `{"logoutAuthType": "BASIC"}` or `{}`

- [ ] **Step 5: Test `getPermissions` manually**

```bash
TOKEN="eyJ..."
curl -s -X POST "http://localhost:8080/rest/s1/admin/getPermissions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"viewIndex": 0, "viewSize": 200}' | python3 -m json.tool
```

Expected: `{"docs": [{"permissionId": "..."}, ...], "count": N}`

- [ ] **Step 6: Configure the company app to use Moqui**

Create a `.env.local` file (not committed):
```env
# .env.local — DO NOT COMMIT
# OMS URL points to Moqui's REST admin path
VITE_OMS_URL=http://localhost:8080/rest/s1/admin/
```

The Login component will prompt for an OMS URL. Enter `http://localhost:8080/rest/s1/admin/` in the instance field.

Note: The Login component stores the OMS URL in the `oms` cookie. On first use, the user enters it in the UI. For dev convenience, you can pre-set the cookie in the browser or patch the login component to pre-fill from env.

- [ ] **Step 7: Start the company app**

```bash
cd /Users/anilpatel/pwa-sd/company && npm run dev
```

- [ ] **Step 8: Test full login flow in browser**

1. Open http://localhost:5173
2. App shows Login component with OMS URL input
3. Enter `http://localhost:8080/rest/s1/admin/` in the instance field and click Next
4. `checkLoginOptions` is called — Moqui returns `{loginAuthType: "BASIC", maargInstanceUrl: "http://localhost:8080/rest/s1/"}`
5. `maarg` cookie is set to `http://localhost:8080/rest/s1/`
6. Username/password form appears
7. Enter Moqui credentials, click Login
8. `POST http://localhost:8080/rest/s1/admin/login` is called with `{USERNAME, PASSWORD}`
9. Token received, stored in cookie
10. `postLogin()` fires → `fetchUserProfile()` calls `http://localhost:8080/rest/s1/admin/user/profile`
11. `fetchPermissions()` calls `http://localhost:8080/rest/s1/admin/getPermissions`
12. App navigates to /product-store
13. Verify `/product-store` data loads

- [ ] **Step 9: Test logout**

Click logout in the app. Verify `GET http://localhost:8080/rest/s1/admin/logout` is called, cookies are cleared, and the user is redirected to `/login`.

- [ ] **Step 10: Commit final state**

```bash
# Company app
cd /Users/anilpatel/pwa-sd/company
git add .
git commit -m "feat: company app now connects to Moqui for all API calls including login"

# Moqui
cd /Users/anilpatel/maarg-sd/notnaked
git add .
git commit -m "feat: add Moqui auth endpoints compatible with accxui (login, logout, checkLoginOptions, getPermissions)"

# AccxUI common
cd /Users/anilpatel/pwa-sd/accxui
git add .
git commit -m "feat: getOmsURL() supports Moqui /rest/s1 paths"
```

---

## Self-Review

**Spec coverage:**
- [x] Company app migrated to accxui patterns (Tasks 1–10)
- [x] Build system: Vue CLI → Vite (Task 1)
- [x] State: Vuex → Pinia (Tasks 4–5, 9)
- [x] Auth: launchpad redirect → @common Login inline (Tasks 6–7)
- [x] HTTP client: custom axios → @common api() (Task 3)
- [x] Env vars: VUE_APP_* → VITE_* (Task 2)
- [x] AccxUI `getOmsURL()` patched for Moqui paths (Task 11)
- [x] Moqui login accepts uppercase params (Task 12)
- [x] Moqui `checkLoginOptions` returns `maargInstanceUrl` (Task 13)
- [x] Moqui `logout` endpoint added (Task 14)
- [x] Moqui `getPermissions` endpoint added (Task 15)
- [x] End-to-end test with all Moqui endpoints (Task 16)

**Missing from spec (deferred):**
- CASL permission rules are removed; if the company app uses fine-grained CASL `$can(action, resource)` checks in templates, those need to be mapped to `hasPermission(permissionId)` calls manually — covered in Task 8 step 2 but the exact permission IDs need to be verified.
- Shopify App Bridge embedded mode: if the company app runs inside Shopify Admin (iframe), `getEmbeddedAppStoreSafe()` might return different values. Verify after login.
- The `@hotwax/apps-theme` CSS may have company-specific styling not in `@common/css/`. After migration, check the app's visual appearance and copy any missing styles to `src/theme/variables.css`.

**Placeholder scan:** No TBD, TODO, or placeholder code in core tasks. Task 5 step 1 asks the implementer to read source Vuex modules — this is intentional since there are 5 modules and each is unique to the codebase.

**Type consistency:**
- `useUserStore()` used consistently throughout
- `commonUtil.getMaargURL()` / `commonUtil.getOmsURL()` used consistently for baseURL
- `useAuth().isAuthenticated.value` used in router guards
