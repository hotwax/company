const path = require('path')
const { execSync } = require("child_process")

const readGitValue = (command) => {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return ""
  }
}

process.env.VUE_APP_VERSION_INFO = JSON.stringify({
  version: require("./package.json").version,
  branch: readGitValue("git symbolic-ref --short -q HEAD"),
  tag: readGitValue("git describe --tags --exact-match"),
  revision: readGitValue("git rev-parse --short HEAD"),
  builtTime: Date.now()
})

module.exports = {
  pluginOptions: {
    i18n: {
      locale: 'en',
      fallbackLocale: 'en',
      localeDir: 'locales',
      enableLegacy: true,
      runtimeOnly: true,
      compositionOnly: false,
      fullInstall: true,
      enableInSFC: true
    }
  },
  pwa: {
    name: "Company - HotWax Commerce",
    themeColor: "#FFFFFF",
    manifestOptions: {
      short_name: "Company",
      start_url: "./"
    },
    id: "/",
    display: "standalone",
    background_color: "#000000",
    workboxOptions: {
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
    }
  },
  configureWebpack: {
    ignoreWarnings: [
      /autoprefixer: start value has mixed support/
    ],
    performance: {
      hints: false
    },
    resolve: {
      alias: {
        vue: path.resolve('./node_modules/vue')
      }
    }
  },
  runtimeCompiler: true,
  transpileDependencies: ['@hotwax/dxp-components']
}
