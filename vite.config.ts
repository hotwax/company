import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { createRequire } from 'module'
import { defineConfig, loadEnv, type Rollup } from 'vite'
import { versionInfoUtil } from '../../common/utils/versionInfoUtil'
import { commonEnvPlugin } from '../../common/vite/commonEnvPlugin'
import { localApiServerDiscoveryPlugin } from '../../common/vite/localApiServerDiscoveryPlugin'
import { ideTraceVue } from 'chrome-ide-trace/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'
import manifest from './manifest.json'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(new URL('.', import.meta.url).pathname)
const commonRoot = path.resolve(projectRoot, '../../common')

// Custom plugin: resolve bare specifiers from @common code using the project's node_modules.
// @common lives outside this package's node_modules tree, so Rollup can't find its deps.
// Packages from @common that this app doesn't use.
// In production builds they are externalized via rollupOptions.
// In dev mode they are stubbed with an empty virtual module to prevent
// "Failed to load url" pre-transform errors from Vite's esbuild phase.
const COMMON_EXTERNALS = [
  'firebase/app', 'firebase/messaging',
  'encoding-japanese', 'child_process',
  '@shopify/app-bridge', '@shopify/app-bridge-utils',
  '@module-federation/runtime'
]
const STUB_FILE = path.resolve(projectRoot, 'src/stubs/external.js')

function resolveCommonDeps() {
  return {
    name: 'resolve-common-deps',
    resolveId(id: string, importer: string | undefined) {
      // Stub unused packages with a real stub file in dev; build uses rollupOptions.external
      if (COMMON_EXTERNALS.some(e => id === e || id.startsWith(e + '/'))) {
        return STUB_FILE
      }
      if (
        importer &&
        importer.startsWith(commonRoot) &&
        !id.startsWith('.') &&
        !id.startsWith('/') &&
        !id.startsWith('@/')
      ) {
        try {
          const resolved = require.resolve(id, { paths: [path.resolve(projectRoot, 'node_modules'), projectRoot] })
          return resolved
        } catch {
          return null
        }
      }
    },
  }
}

// Package name from the last node_modules segment of a module id, so a pnpm store path like
// .pnpm/@vue+devtools-kit@x/node_modules/mitt resolves to "mitt" and not to anything named "vue".
function packageName(id: string) {
  const index = id.lastIndexOf('/node_modules/')
  if (index < 0) return undefined
  const [scopeOrName, name] = id.slice(index + '/node_modules/'.length).split('/')
  return scopeOrName.startsWith('@') ? `${scopeOrName}/${name}` : scopeOrName
}

const VENDOR_IONIC = new Set(['@ionic/core', 'ionicons', '@stencil/core'])
const VENDOR_FRAMEWORK = new Set(['vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate', 'vue-i18n', '@ionic/vue', '@ionic/vue-router'])

// A module is eager when an entry reaches it through static imports alone, i.e. it loads at startup.
const eagerModules = new Map<string, boolean>()
function isEager(id: string, getModuleInfo: Rollup.GetModuleInfo): boolean {
  if (eagerModules.has(id)) return eagerModules.get(id)!
  eagerModules.set(id, false) // breaks import cycles while the answer is computed
  const info = getModuleInfo(id)
  const eager = !!info && (info.isEntry || info.importers.some(importer => isEager(importer, getModuleInfo)))
  eagerModules.set(id, eager)
  return eager
}

// Third-party code that rarely changes goes in its own chunks; app and @common code stay with Rollup's
// per-route splitting. Vite's runtime helpers get their own chunk so no vendor chunk imports back from
// app code, which would create a chunk cycle and break startup ("Cannot access X before initialization").
function manualChunks(id: string, { getModuleInfo }: { getModuleInfo: Rollup.GetModuleInfo }) {
  if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor-runtime'
  const pkg = packageName(id)
  if (!pkg) return undefined
  if (VENDOR_IONIC.has(pkg)) return 'vendor-ionic'
  if (VENDOR_FRAMEWORK.has(pkg) || pkg.startsWith('@vue/') || pkg.startsWith('@intlify/')) return 'vendor-framework'
  // Only packages needed at startup; a package used only by a lazy route stays with that route.
  if (isEager(id, getModuleInfo)) return 'vendor-libs'
  return undefined
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Guarded because this file is loaded by vitest too, where the app's .env is not always present.
  // An absent variable arrives as the string "undefined", which JSON.parse rejects, and the throw
  // happens before any test runs — that is the "Order Sync unit tests" failure on every PR.
  let appBuild = ''
  try {
    appBuild = env.VITE_APP_VERSION_CONFIG && env.VITE_APP_VERSION_CONFIG !== "undefined" ? JSON.parse(env.VITE_APP_VERSION_CONFIG).buildVersion : ''
  } catch (err) {
    console.warn("Failed to parse VITE_APP_VERSION_CONFIG:", err)
  }
  return {
  // A version build (buildVersion vX.Y.Z in VITE_APP_VERSION_CONFIG) is self-contained under /vX.Y.Z/; an empty buildVersion is the root bootstrap.
  base: appBuild ? `/${appBuild}/` : '/',
  server: {
    port: 8100
  },
  plugins: [
    commonEnvPlugin(),
    ideTraceVue(),
    resolveCommonDeps(),
    localApiServerDiscoveryPlugin(),
    vue(),
    legacy(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      selfDestroying: true,
      manifest: manifest as any,
      devOptions: {
        enabled: true
      }
    })
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION_INFO': JSON.stringify(JSON.stringify(versionInfoUtil.getVersionInfo(pkg.version)))
  },
  resolve: {
    dedupe: ['vue', 'vue-router', '@ionic/vue', '@ionic/vue-router', 'pinia', 'luxon', 'vue-i18n', 'mitt', 'vue-logger-plugin'],
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      '@common': commonRoot
    }
  },
  optimizeDeps: {
    // `vue-router` is imported directly by several lazily-loaded views (useRouter,
    // onBeforeRouteLeave) while the router module itself uses @ionic/vue-router. Because the plain
    // package was only discovered during a dynamic import, the dev server answered its dep request
    // with 504 "Outdated Optimize Dep" and those routes failed to mount. Prebundling it up front
    // removes that whole class of failure.
    include: ['luxon', 'mitt', 'pinia', 'vue-router', 'vue-i18n', 'vue-logger-plugin', 'cron-parser', 'axios', 'axios-cache-adapter'],
    // Force CommonJS → ESM interop for packages with CJS-only default exports
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    outDir: appBuild ? `dist/${appBuild}` : 'dist',
    rollupOptions: {
      output: { manualChunks }
    }
  }
  }
})
