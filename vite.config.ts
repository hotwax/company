import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { defineConfig } from 'vite'
import { versionInfoUtil } from '../../common/utils/versionInfoUtil'
import { localApiServerDiscoveryPlugin } from '../../common/vite/localApiServerDiscoveryPlugin'
import pkg from './package.json'

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 10000) {
        reject(new Error('Request body is too large.'))
        req.destroy()
      }
    })
    req.on('error', reject)
    req.on('end', () => {
      if (!body) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function getHostName(hostHeader = '') {
  if (hostHeader.startsWith('[')) return hostHeader.slice(1, hostHeader.indexOf(']'))
  return hostHeader.split(':')[0]
}

function isLocalRequest(req) {
  const hostName = getHostName(String(req.headers.host || ''))
  const remoteAddress = String(req.socket.remoteAddress || '')
  return ['localhost', '127.0.0.1', '::1'].includes(hostName) &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function localMoquiResetPlugin() {
  return {
    name: 'local-moqui-reset',
    configureServer(server) {
      server.middlewares.use('/__local-dev/moqui/reset', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed.' })
          return
        }

        if (!isLocalRequest(req)) {
          sendJson(res, 403, { error: 'Local Moqui reset is only available from localhost.' })
          return
        }

        let body
        try {
          body = await readJsonBody(req)
        } catch (error) {
          sendJson(res, 400, { error: 'Invalid JSON request body.' })
          return
        }

        if (String(body.confirmation || '').trim() !== 'DROP LOCAL MOQUI DB') {
          sendJson(res, 400, { error: 'Confirmation phrase did not match.' })
          return
        }

        const moquiRoot = path.resolve(process.env.COMPANY_LOCAL_MOQUI_ROOT || path.join(process.env.HOME || '', 'Documents/GitHub/moqui-products-dev'))
        const scriptPath = path.join(moquiRoot, 'pim-dev.sh')
        if (!fs.existsSync(scriptPath)) {
          sendJson(res, 500, { error: `Local Moqui reset script was not found at ${scriptPath}.` })
          return
        }

        const logPath = path.join('/tmp', `company-local-moqui-reset-${Date.now()}.log`)
        if (body.dryRun === true) {
          sendJson(res, 200, { dryRun: true, command: `${scriptPath} reset`, logPath })
          return
        }

        const logStream = fs.createWriteStream(logPath, { flags: 'a' })
        const child = spawn('bash', [scriptPath, 'reset'], {
          cwd: moquiRoot,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        child.stdout.pipe(logStream)
        child.stderr.pipe(logStream)
        child.unref()

        sendJson(res, 202, {
          started: true,
          message: 'Local Moqui reset started.',
          logPath,
          moquiRoot
        })
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 8100
  },
  plugins: [
    resolveCommonDeps(),
    localMoquiResetPlugin(),
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
    rollupOptions: {}
  }
})
