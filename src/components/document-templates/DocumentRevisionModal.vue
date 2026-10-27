<template>
  <ion-header><ion-toolbar>
    <ion-buttons slot="start"><ion-button :aria-label="translate('Close')" @click="modalController.dismiss()" data-testid="document-revisions-close-btn"><ion-icon slot="icon-only" :icon="closeOutline" /></ion-button></ion-buttons>
    <ion-title>{{ translate("Choose a revision") }}</ion-title>
  </ion-toolbar></ion-header>
  <ion-content>
    <p class="ion-padding-horizontal">{{ translate("Choose a saved revision to review. Printing changes only after a preview and confirmation.") }}</p>
    <ion-radio-group v-model="selected" data-testid="document-revisions-options">
      <ion-item v-for="revision in revisions" :key="versionOf(revision)">
        <ion-radio :value="versionOf(revision)" label-placement="end" justify="start" :data-testid="`document-revision-${versionOf(revision)}-radio`">
          <ion-label class="ion-text-wrap">
            <h2>{{ translate("Revision {revision}", { revision: versionOf(revision) }) }}</h2>
            <p>{{ revision.summary || translate("Saved revision") }}</p>
            <p>{{ displayDate(revision.createdAt || revision.versionDate) }}</p>
          </ion-label>
        </ion-radio>
        <ion-note v-if="versionOf(revision) === publishedVersionName" slot="end">{{ translate("In use") }}</ion-note>
      </ion-item>
    </ion-radio-group>
  </ion-content>
  <ion-footer><ion-toolbar><ion-button expand="block" :disabled="!selected" @click="modalController.dismiss({ manifestVersionName: selected })" data-testid="document-revisions-review-btn">{{ translate("Review this revision") }}</ion-button></ion-toolbar></ion-footer>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { commonUtil, translate } from "@common";
import { IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonNote, IonRadio, IonRadioGroup, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { closeOutline } from "ionicons/icons";

const props = defineProps<{ revisions: any[]; selectedVersion: string; publishedVersionName?: string }>();
const selected = ref(props.selectedVersion);
const versionOf = (revision: any) => String(revision.manifestVersionName || revision.versionName || "");
const displayDate = (value: any) => commonUtil.getDateAndTime(commonUtil.parseDateTimeValue(value)?.toMillis());
</script>

<style scoped>
ion-radio { width: 100%; padding-block: var(--spacer-xs); }
ion-note { align-self: flex-start; padding-top: var(--spacer-base); margin-left: var(--spacer-sm); }
ion-footer ion-button { min-height: 2.75rem; margin-inline: var(--spacer-sm); }
</style>
