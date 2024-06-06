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

  <ion-content>
    <div class="empty-state" v-if="isLoading">
      <ion-item lines="none">
        <ion-spinner name="crescent" slot="start" />
        {{ translate("Analyzing the question to answer your question.") }}
      </ion-item>
    </div>

    <template v-else-if="answer && Object.keys(answer).length">
      <ion-item lines="none">
        <ion-label>{{ queryString }}</ion-label>
      </ion-item>
      <ion-item>
        <ion-label><p>{{ answer.text }}</p></ion-label>
      </ion-item>

      <ion-item v-if="answer.sources.length" button @click="!isResourceFetched ? fetchSources() : ''">
        <ion-label>
          <p>{{ translate("Answer based on resources", { count: answer.sources.length }) }}</p>
        </ion-label>
        <ion-icon :icon="sources.length ? caretDownOutline : caretForwardOutline" />
      </ion-item>

      <div class="empty-state" v-if="isResourceLoading">
        <ion-item lines="none">
          <ion-spinner name="crescent" slot="start" />
          {{ translate("Fetching resources...") }}
        </ion-item>
      </div>

      <ion-list v-else-if="sources.length">
        <ion-item v-for="source in sources" :key="source.title">
          <ion-label>{{ source.title }}</ion-label>
          <ion-button fill="clear" color="medium" slot="end" @click="redirectToGitbook(source)">
            <ion-icon :icon="returnDownForwardOutline" slot="start" />
            {{ "Go to page" }}
          </ion-button>
        </ion-item>
      </ion-list>

      <ion-item v-else-if="isResourceFetched">
        <ion-label>
          <p>{{ translate("No resource found.") }}</p>
        </ion-label>
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
    <div class="empty-state" v-else>
      <ion-item lines="none">
        {{ translate("No answer found.") }}
      </ion-item>
    </div>
  </ion-content>
</template>

<script setup lang="ts">
import { 
  IonButtons,
  IonButton,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController,
} from "@ionic/vue";
import { ref } from "vue";
import { caretForwardOutline, caretDownOutline, closeOutline, returnDownForwardOutline, searchOutline } from "ionicons/icons";
import { useStore } from "@/store";
import { translate } from "@/i18n"
import { UtilService } from "@/services/UtilService";
import { hasError } from "@/utils";

const store = useStore();
let queryString = ref("")
const answer = ref({}) as any;
const isLoading = ref(false);
const isResourceLoading = ref(false);
const sources = ref([]) as any;
const isResourceFetched = ref(false);

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

async function fetchSources() {
  isResourceLoading.value = true;
  const list = [] as any;

  const responses = await Promise.allSettled(answer.value.sources.map((source: any) => {
    if(source.type === "page") {
      return UtilService.getGitboookPage(source.page);
    }
  }))

  responses.map((response: any) => {
    if(response.status === "fulfilled") {
      list.push(response.value.data)
    }
  })
  sources.value = list
  isResourceLoading.value = false
  isResourceFetched.value = true
}

function redirectToGitbook(source: any) {
  window.open(source.urls.app, "_blank")
}

function searchRelatedQuestion(question: string) {
  queryString.value = question;
  searchAi()
}

</script>
