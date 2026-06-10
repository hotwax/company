<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Composer") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <!-- Agent Name -->
        <ion-item>
          <ion-input
            :label="translate('Give your agent a name')"
            label-placement="stacked"
            :placeholder="translate('Name')"
            :helper-text="translate('Your agent requires a name to start testing')"
          />
        </ion-item>

        <!-- Instructions -->
        <ion-item>
          <ion-textarea
            :label="translate('Instructions')"
            label-placement="stacked"
            :placeholder="translate('Input text')"
            :rows="5"
          />
        </ion-item>

        <!-- Rewrite Button -->
        <ion-item lines="none">
          <ion-button fill="outline" color="primary">
            <ion-icon slot="start" :icon="sparklesOutline" />
            {{ translate("Rewrite") }}
          </ion-button>
        </ion-item>

        <!-- Model Dropdown -->
        <ion-item>
          <ion-select
            :label="translate('Model')"
            interface="popover"
            :placeholder="translate('Select')"
            v-model="selectedModel"
          >
            <ion-select-option v-for="model in models" :key="model" :value="model">
              {{ model }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Reasoning Effort Dropdown -->
        <ion-item>
          <ion-select
            :label="translate('Reasoning effort')"
            interface="popover"
            :placeholder="translate('Select')"
            v-model="selectedReasoningEffort"
          >
            <ion-select-option v-for="effort in reasoningEfforts" :key="effort" :value="effort">
              {{ translate(effort) }}
            </ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <!-- Tools Section -->
      <ion-card>
        <ion-item-divider color="light">
          <ion-label>{{ translate("Tools") }}</ion-label>
          <ion-button slot="end" fill="clear" size="small">
            {{ translate("Add") }}
            <ion-icon slot="end" :icon="addOutline" />
          </ion-button>
        </ion-item-divider>

        <ion-list>
          <ion-item>
            <ion-label>
              <h2>{{ translate("Tool name") }}</h2>
              <p>{{ translate("Tool desc") }}</p>
            </ion-label>

            <ion-checkbox slot="end" label-placement="bottom" justify="center">
              {{ translate("Auto approve") }}
            </ion-checkbox>

            <ion-button slot="end" fill="clear" color="danger">
              <ion-icon slot="icon-only" :icon="removeCircleOutline" />
            </ion-button>
          </ion-item>
        </ion-list>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenuButton,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar
} from "@ionic/vue";
import { addOutline, removeCircleOutline, sparklesOutline } from "ionicons/icons";
import { translate } from "@common";
import { ref } from "vue";

const selectedModel = ref("5.5");
const selectedReasoningEffort = ref("High");

const models = ["5.0", "5.5", "6.0"];
const reasoningEfforts = ["Low", "Medium", "High"];
</script>

<style scoped>
</style>
