<template>
  <ion-accordion-group>
    <ion-accordion :value="toolName">
      <ion-item slot="header" lines="full">
        <ion-icon slot="start" :icon="hammerOutline" aria-hidden="true" />
        <ion-label>{{ toolName }}</ion-label>
      </ion-item>

      <ion-list slot="content">
        <ion-item lines="none">
          <ion-label class="ion-text-wrap chat-tool-call__args">
            <slot>{{ args }}</slot>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-accordion>
  </ion-accordion-group>
</template>

<script setup lang="ts">
import { IonAccordion, IonAccordionGroup, IonIcon, IonItem, IonLabel, IonList } from "@ionic/vue";
import { hammerOutline } from "ionicons/icons";

defineProps({
  /** Name of the tool, shown in the accordion header. */
  toolName: {
    type: String,
    default: ""
  },
  /** Argument(s) passed to the tool, shown in the accordion content. Can also be provided via the default slot. */
  args: {
    type: String,
    default: ""
  }
});
</script>

<style scoped>
/* Body 2 / Roboto Regular — preserve formatting of tool arguments */
.chat-tool-call__args {
  font-size: 14px;
  line-height: 20px;
  letter-spacing: 0.25px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
