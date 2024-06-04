<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal"> 
          <ion-icon :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Ask me anything?") }}</ion-title>
    </ion-toolbar>
    <ion-toolbar>
      <ion-searchbar :placeholder="translate('Ask...')"  v-model="queryString" @keyup.enter="searchAi()" />
    </ion-toolbar>
  </ion-header>

  <ion-content v-if="answer.text">
    <div class="empty-state" v-if="isLoading">
      <ion-item lines="none">
        <ion-spinner name="crescent" slot="start" />
        {{ translate("Analyzing the question to answer your question.") }}
      </ion-item>
    </div>

    <template v-else>
      <ion-item lines="none">
        <ion-label>
          {{ queryString }}
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label><p>{{ answer.text }}</p></ion-label>
      </ion-item>

      <template v-if="answer.followupQuestions.length">
        <ion-item lines="none">
          <ion-label>
            <p>{{ translate("Related Queries") }}</p>
          </ion-label>
        </ion-item>
  
        <ion-item lines="none" v-for="(question, index) in answer.followupQuestions" :key="index"  @click="searchRelatedQuestion(question)">
          <ion-chip>
            <ion-icon :icon="searchOutline" />
            <ion-label>{{ question }}</ion-label>
          </ion-chip>
        </ion-item>
    </template>
    </template>
  </ion-content>
</template>

<script setup lang="ts">
import { 
  IonButtons,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { ref } from "vue";
import { closeOutline, searchOutline } from "ionicons/icons";
import { useStore } from "@/store";
import { translate } from "@/i18n"
import { UtilService } from "@/services/UtilService";
import { hasError } from "@/utils";

const store = useStore();
let queryString = ref("")
const answer = ref({}) as any;
const isLoading = ref(false);

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

async function searchAi() {
  isLoading.value = true;
  try {
    const resp = await UtilService.searchAi({ queryString: queryString.value });

    if(!hasError(resp)) {
      answer.value = resp.data.answer;
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    console.error(error);
  }
  isLoading.value = false;
}

function searchRelatedQuestion(question: string) {
  queryString.value = question;
  searchAi()
}

</script>
