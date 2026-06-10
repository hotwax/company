<template>
  <div class="section-header">
    <h1>
      {{ translate("App") }}
      <p class="overline">{{ translate("Version:", { appVersion }) }}</p>
    </h1>
    <p class="overline">{{ translate("Built:", { builtTime: getDateTime(appInfo.builtTime) }) }}</p>
  </div>
</template>

<script setup lang="ts">
import { translate } from '@common'
import { DateTime } from 'luxon'

const appInfo = (import.meta.env.VITE_APP_VERSION_INFO ? JSON.parse(import.meta.env.VITE_APP_VERSION_INFO) : {}) as any
const appVersion = appInfo.branch ? `${appInfo.branch}-${appInfo.revision}` : (appInfo.tag ?? '')

function getDateTime(time: any) {
  return time ? DateTime.fromMillis(time).toLocaleString({ ...DateTime.DATETIME_MED, hourCycle: 'h12' }) : ''
}
</script>
