import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { createRequire } from 'module'
import { defineConfig } from 'vite'
import { versionInfoUtil } from '../accxui/common/utils/versionInfoUtil'
import pkg from './package.json'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(new URL('.', import.meta.url).pathname)
const commonRoot = path.resolve(projectRoot, '../accxui/common')

// Custom plugin: resolve bare specifiers from @common code using the project's node_modules.
// @common lives outside this package's node_modules tree, so Rollup can't find its deps.
function resolveCommonDeps() {
  return {
    name: 'resolve-common-deps',
    resolveId(id, importer) {
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
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    resolveCommonDeps(),
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
    include: ['luxon', 'mitt', 'pinia', 'vue-i18n', 'vue-logger-plugin']
  },
  build: {
    rollupOptions: {
      // These packages are imported by @common but not used by this app
      external: (id) => {
        // Packages used by @common but not needed by this app
        const externals = [
          'firebase/app', 'firebase/messaging',
          'comlink', 'encoding-japanese', 'child_process',
          '@shopify/app-bridge', '@shopify/app-bridge-utils',
          '@module-federation/runtime'
        ]
        return externals.some(e => id === e || id.startsWith(e + '/'))
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
