import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { createRequire } from 'module'
import { defineConfig } from 'vite'
import { versionInfoUtil } from '../accxui/common/utils/versionInfoUtil'
import { localApiServerDiscoveryPlugin } from '../accxui/common/vite/localApiServerDiscoveryPlugin'
import pkg from './package.json'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(new URL('.', import.meta.url).pathname)
const commonRoot = path.resolve(projectRoot, '../accxui/common')

// Custom plugin: resolve bare specifiers from @common code using the project's node_modules.
// @common lives outside this package's node_modules tree, so Rollup can't find its deps.
// Packages from @common that this app doesn't use.
// In production builds they are externalized via rollupOptions.
// In dev mode they are stubbed with an empty virtual module to prevent
// "Failed to load url" pre-transform errors from Vite's esbuild phase.
const COMMON_EXTERNALS = [
  'firebase/app', 'firebase/messaging',
  'comlink', 'encoding-japanese', 'child_process',
  '@shopify/app-bridge', '@shopify/app-bridge-utils',
  '@module-federation/runtime'
]
const STUB_FILE = path.resolve(projectRoot, 'src/stubs/external.js')

function resolveCommonDeps() {
  return {
    name: 'resolve-common-deps',
    resolveId(id, importer) {
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

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 8100
  },
  plugins: [
    resolveCommonDeps(),
    localApiServerDiscoveryPlugin(),
    vue(),
    legacy()
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION_INFO': JSON.stringify(JSON.stringify(versionInfoUtil.getVersionInfo(pkg.version)))
  },
  resolve: {
    dedupe: ['vue', 'pinia', 'luxon', 'vue-i18n', 'mitt', 'vue-logger-plugin'],
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      '@common': commonRoot
    }
  },
  optimizeDeps: {
    include: ['luxon', 'mitt', 'pinia', 'vue-i18n', 'vue-logger-plugin', 'cron-parser', 'axios', 'axios-cache-adapter'],
    // Force CommonJS → ESM interop for packages with CJS-only default exports
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    rollupOptions: {
      // resolveCommonDeps plugin handles externals for both dev + build
      external: (id) => COMMON_EXTERNALS.some(e => id === e || id.startsWith(e + '/'))
    }
  }
})
