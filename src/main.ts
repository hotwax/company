import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createDxpI18n, initialiseConfig, logger } from '@common'

import { IonicVue } from '@ionic/vue'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'
/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
/* Optional CSS utils */
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

/* Theme */
import './theme/variables.css'
import '@common/css/settings.css'
import '@common/css/theme.css'

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { useUserStore } from './store/user'
import localeMessages from './locales'
import { DateTime } from 'luxon'

const pinia = createPinia().use(piniaPluginPersistedstate)
const i18n = createDxpI18n(localeMessages)

const app = createApp(App)
  .use(IonicVue, {
    mode: 'md',
    innerHTMLTemplatesEnabled: true
  })
  .use(logger, {
    level: import.meta.env.VITE_DEFAULT_LOG_LEVEL
  })
  .use(i18n)
  .use(pinia)
  .use(router)

initialiseConfig({
  postLogin: useUserStore().postLogin,
  postLogout: useUserStore().postLogout,
  get oms() { return useUserStore().oms },
  set oms(val: string) { useUserStore().oms = val },
  get current() { return useUserStore().current },
  set current(val: any) { useUserStore().current = val },
  router: router
})

// Legacy date filter used by views via $filters.formatDate
app.config.globalProperties.$filters = {
  formatDate(value: any, inFormat?: string, outFormat?: string) {
    if (inFormat) {
      return DateTime.fromFormat(value, inFormat).toFormat(outFormat ?? 'MM-dd-yyyy')
    }
    return DateTime.fromISO(value).toFormat(outFormat ?? 'MM-dd-yyyy')
  },
  getFeature(featureHierarchy: any, featureKey: string) {
    let featureValue = ''
    if (featureHierarchy) {
      const feature = featureHierarchy.find((item: any) => item.startsWith(featureKey))
      const parts = feature ? feature.split('/') : []
      featureValue = parts[2] ?? ''
    }
    return featureValue
  }
}

router.isReady().then(() => {
  app.mount('#app')
})