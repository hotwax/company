<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="closeModal"> 
          <ion-icon :icon="close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate("Ask me anything?") }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-segment v-model="selectedSegment" @ionChange="updateSegment()">
      <ion-segment-button value="search">
        <ion-label>{{ translate("Search") }}</ion-label>
      </ion-segment-button>
      <ion-segment-button value="ask">
        <ion-label>{{ translate("Ask") }}</ion-label>
      </ion-segment-button>
    </ion-segment>

    <div class="empty-state" v-if="isQueryFetching">
      <ion-item lines="none">
        <ion-spinner name="crescent" slot="start" />
         {{ translate(selectedSegment === 'search' ? "Searching your query." : "Analyzing the question to answer your question.") }}
      </ion-item>
    </div>

    <template v-else>
      <ion-searchbar :placeholder="translate(selectedSegment === 'search' ? 'Search...': 'Ask...')" :value="queryString" @keyup.enter="queryString = $event.target.value; selectedSegment === 'search' ? searchQuery() : askQuery()" />

      <template v-if="selectedSegment === 'search'">
        <template v-if="searchedItems.length">
          <div v-for="(item, index) in searchedItems" :key="index">
            <ion-item>
              <ion-icon :icon="documentOutline" slot="start" />
              <ion-label>{{ item.title }}</ion-label>
              <ion-button fill="clear" color="medium" slot="end" @click="redirectToDoc(item)">
                <ion-icon :icon="returnDownBackOutline" slot="start" />
                {{ translate("go to page") }}
              </ion-button>
            </ion-item>

            <template v-if="item.sections.length">
              <ion-item v-for="(section, index) in item.sections" :key="index" class="ion-padding-left">
                <ion-icon :icon="returnDownForwardOutline" slot="start" />
                <ion-label>
                  <div class="item-header">
                    <vue-markdown :source="section.title ? section.title : item.title" />
                    <ion-button fill="clear" color="medium" slot="end" @click="redirectToDoc(section)">
                      <ion-icon :icon="returnDownBackOutline" slot="start" />
                      {{ translate("go to section") }}
                    </ion-button>
                  </div>
                  <p class="truncate"><vue-markdown :source="section.body" /></p>
                </ion-label>
              </ion-item>
            </template>
          </div>
        </template>
        <div class="empty-state" v-else-if="queryString">
          <ion-item lines="none">
            {{ translate("No page found.") }}
          </ion-item>
        </div>
      </template>

      <template v-else-if="selectedSegment === 'ask'">
        <template v-if="answer && Object.keys(answer).length">
          <ion-item lines="none">
            <ion-label>{{ queryString }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p><vue-markdown :source="answer.text" /></p>
            </ion-label>
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
              <ion-button fill="clear" color="medium" slot="end" @click="redirectToDoc(source)">
                <ion-icon :icon="returnDownBackOutline" slot="start" />
                {{ translate("go to page") }}
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
        <div class="empty-state" v-else-if="queryString">
          <ion-item lines="none">
            {{ translate("No answer found.") }}
          </ion-item>
        </div>
      </template>
    </template>


  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToolbar, modalController } from "@ionic/vue";
import { ref } from "vue";
import { caretForwardOutline, caretDownOutline, close, documentOutline, returnDownBackOutline, returnDownForwardOutline, searchOutline } from "ionicons/icons";
import { translate } from "@/i18n"
import { UtilService } from "@/services/UtilService";
import { hasError } from "@/utils";
import VueMarkdown from 'vue-markdown-render'
import logger from "@/logger";

const selectedSegment = ref("search");
let queryString = ref("")
let searchedItems = ref([]) as any;
const answer = ref({}) as any;

const isQueryFetching = ref(false);

const isResourceLoading = ref(false);
const sources = ref([]) as any;
const isResourceFetched = ref(false);

function closeModal() {
  modalController.dismiss({ dismissed: true });
}

function updateSegment() {
  queryString.value = "";
  searchedItems.value = [];
  answer.value = {};
}

async function askQuery() {
  isQueryFetching.value = true;
  let response = {} as any;

  try {
    const resp = await UtilService.askQuery({ queryString: queryString.value });

    if(!hasError(resp)) {
      response = resp.data.answer;
      sources.value = []
      isResourceFetched.value = false
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
  }

  answer.value = response;
  isQueryFetching.value = false;
}

async function searchQuery() {
  isQueryFetching.value = true;
  let items = [] as any;

  try {
    const resp = await UtilService.searchQuery({ queryString: queryString.value });
    if(!hasError(resp)) {
      items = resp.data.items;
    } else {
      throw resp.data;
    }
  } catch(error: any) {
    logger.error(error);
  }

  searchedItems.value = items
  isQueryFetching.value = false;
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

function redirectToDoc(item: any) {
  window.open(`https://docs.hotwax.co/user-guides/${item.path}`, "_blank")
}

function searchRelatedQuestion(question: string) {
  queryString.value = question;
  askQuery()
}

</script>

<style scoped>
.item-header {
  display: flex;
  justify-content: space-between
}

.truncate {
   overflow: hidden;
   text-overflow: ellipsis;
   display: -webkit-box;
   -webkit-line-clamp: 2; /* number of lines to show */
           line-clamp: 2;
   -webkit-box-orient: vertical;
}
</style>