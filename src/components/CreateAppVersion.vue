<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Create App Version") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item>
        <ion-select label="App" v-model="selectedApp" interface="popover">
          <ion-select-option v-for="(info, app) in appOptions" :key="app" :value="info.appId">{{ info.appName }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-select label="Environment" v-model="selectedEnv" :disabled="!selectedApp" interface="popover">
          <ion-select-option v-for="env in appOptions[selectedApp]?.envs" :key="env" :value="env.enumId">{{ env.description }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item :lines="errorMessage ? 'none' : 'inset'">
        <ion-input label="Version" placeholder="version - v1.0.0" v-model="version" type="text" :error-text="errorMessage" :class="{'ion-invalid ion-touched': errorMessage}"/>
      </ion-item>
    </ion-list>
  </ion-content>

  <ion-fab vertical="bottom" horizontal="end" slot="fixed">
    <ion-fab-button @click="saveAppVersion" :disabled="!selectedApp || !selectedEnv || !version.trim() || !!errorMessage">
      <ion-icon :icon="saveOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonList, IonSelect, IonSelectOption, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { close, saveOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { computed, defineProps, onMounted, ref, watch } from "vue";
import store from "@/store";
import logger from "@/logger";
import { showToast } from "@/utils";
import { UtilService } from "@/services/UtilService";

const appEnvs = computed(() => store.getters["util/getAppEnvs"])
const appsInfo = computed(() => store.getters["util/getAppsInfo"])

const appOptions = ref({}) as any
const selectedApp = ref("")
const selectedEnv = ref("")
const version = ref("")
const errorMessage = ref("")

const props = defineProps(["appsVersionInfo"])

watch(version, () => {
  const validVersion = version.value.trim()?.split(".").every(ver => ver)
  if(!validVersion || !version.value.startsWith("v") || version.value.split(".").length < 3) {
    errorMessage.value = "Enter a valid version number, it should be in format v1.0.0"
  } else {
    errorMessage.value = ""
  }
})

onMounted(() => {
  appOptions.value = appsInfo.value.reduce((appOptions: any, app: any) => {
    appEnvs.value.map((env: any) => {
      if(!props.appsVersionInfo[`${app.appId}_${env.enumId}`]) {
        if(appOptions[app.appId]) {
          appOptions[app.appId]["envs"].push(env)
        } else {
          appOptions[app.appId] = {
            ...app,
            envs: [env]
          }
        }
      }
    })

    return appOptions
  }, {})
})

function closeModal() {
  modalController.dismiss();
}

async function saveAppVersion() {
  try {
    await UtilService.createAppVersion({
      appId: selectedApp.value,
      environmentTypeId: selectedEnv.value,
      currentVersion: version.value
    })

    showToast(translate("version created successfully", { appName: selectedApp.value, environment: selectedEnv.value }))
    modalController.dismiss({ fetchInfo: true });
  } catch(err) {
    logger.error("Failed to register the app version", err)
    showToast(translate("Failed to register the app version"))
  }
}
</script>
