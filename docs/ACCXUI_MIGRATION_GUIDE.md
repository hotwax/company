# Upgrading a Legacy HotWax PWA to AccxUI

## Why

Legacy apps were built with Vue CLI + Vuex + `@hotwax/dxp-components`. They authenticate against OFBiz and require launchpad redirect for login. AccxUI removes that dependency: apps authenticate directly against Moqui, share a common auth/HTTP layer, and build with Vite.

**What changes for the developer:**
- One less server to run (no OFBiz for auth)
- No launchpad redirect — login is inline
- Shared `api()` client handles auth headers, 401 handling, and URL routing automatically
- Pinia replaces Vuex — less boilerplate, no mutations

---

## Migration Steps

### 1. Replace the build system

Swap Vue CLI for Vite. Delete `vue.config.js` and `babel.config.js`.

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import path from 'path'

export default defineConfig({
  plugins: [vue(), legacy()],
  resolve: {
    dedupe: ['vue', 'pinia'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@common': path.resolve(__dirname, '../accxui/common')  // adjust path
    }
  }
})
```

Update `package.json` scripts: `"dev": "vite"`, `"build": "vite build"`.

Add `VITE_OMS_TYPE=moqui` to `.env` — this tells `@common`'s URL builder to construct `/rest/s1/admin/` paths instead of OFBiz `/api/` paths.

Rename all `VUE_APP_*` env vars to `VITE_*` and replace `process.env.VUE_APP_*` with `import.meta.env.VITE_*`.

---

### 2. Replace state management

Vuex → Pinia. For each Vuex module, create a `defineStore` file. The pattern is direct: mutations become state assignments inside actions, `store.dispatch()/getters[]` in views become `useXxxStore().method()`.

```ts
// src/store/user.ts
export const useUserStore = defineStore('user', {
  state: () => ({ current: {} as any, permissions: [] as string[] }),
  actions: {
    async postLogin() {
      await this.fetchUserProfile()
      await this.fetchPermissions()
    },
    async postLogout() { this.$reset() }
  },
  persist: true
})
```

Remove `@casl/ability` — replace `$can(action, resource)` checks with `userStore.hasPermission('PERMISSION_ID')`.

---

### 3. Wire up `@common`

Replace `@hotwax/dxp-components` and `@hotwax/oms-api` with `@common`.

```ts
// src/main.ts
import { createDxpI18n, initialiseConfig } from '@common'
import { useUserStore } from './store/user'

const pinia = createPinia().use(piniaPluginPersistedstate)
const i18n = createDxpI18n(localeMessages)   // locale keys must be under 'en-US'

initialiseConfig({
  postLogin: useUserStore().postLogin,
  postLogout: useUserStore().postLogout,
  get oms() { return useUserStore().oms },
  set oms(val) { useUserStore().oms = val },
  get current() { return useUserStore().current },
  set current(val) { useUserStore().current = val },
  router
})
```

---

### 4. Replace login

Remove the launchpad redirect. Add `/login` route pointing to `Login` from `@common`:

```ts
import { Login } from '@common'
{ path: '/login', component: Login }
```

Update the auth guard:
```ts
const authGuard = () => {
  if (!useAuth().isAuthenticated.value) return { path: '/login' }
}
```

---

### 5. Replace the HTTP client

Delete the custom `src/api/index.ts`. Import `{ api }` from `@common` everywhere. Remove `api_key` headers — `@common` adds `Authorization: Bearer` automatically.

For the permissions call, point to Moqui's endpoint:
```ts
// Moqui — not OFBiz-style POST /getPermissions
await api({ url: 'admin/user/permissions', method: 'get', params: { viewIndex, viewSize } })
```

---

### 6. Handle `@common` package dependencies

`@common` imports packages your app may not have (`firebase`, `@shopify/app-bridge`, `comlink`). Create a stub file that Vite resolves these to at build time:

```js
// src/stubs/external.js
const noop = () => {}
export const createApp = noop        // @shopify/app-bridge
export const getSessionToken = () => Promise.resolve("")
// add others as the build tells you
```

Configure Vite to resolve these to the stub and externalize them in the production build.

---

## What the app developer owns vs `@common`

| Concern | Where it lives |
|---------|---------------|
| Login form, OMS URL input, SAML redirect | `@common` — hands-off |
| Token storage, expiry, 401 auto-logout | `@common` — hands-off |
| Authenticated HTTP transport | `@common` — use `api()` |
| `postLogin()` — fetch profile, permissions, app data | Your app's user store |
| All business API calls | Your app's stores and services |
| Permission IDs (`COMPANY_APP_VIEW`) | Your app's `.env` + Moqui seed data |

---

## Moqui requirements

No backend changes needed for the basic flow. The following endpoints exist in `hotwax-maarg-util` already:

| Endpoint | Used for |
|----------|---------|
| `GET /rest/s1/admin/checkLoginOptions` | Auth type detection, called before form shows |
| `POST /rest/s1/admin/login` | Issues JWT token |
| `GET /rest/s1/admin/user/profile` | Called in `postLogin()` |
| `GET /rest/s1/admin/user/permissions` | Permission gate check |
| `POST /rest/s1/admin/logout` | Session teardown |
