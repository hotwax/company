<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ translate("Product store") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main>
        <div class="list-item">
          <ion-item lines="none">
            <ion-icon slot="start" :icon="storefrontOutline" />
            <ion-label class="ion-text-wrap">
              <p class="overline">{{ "PRODUCT STORE ID" }}</p>
              {{ "Product store name" }}
            </ion-label>
          </ion-item>

          <div class="tablet">
            <ion-chip outline>
              <ion-label>{{ "<count> facilities" }}</ion-label>
              <ion-icon :icon="openOutline" />
            </ion-chip>
          </div>

          <div class="tablet">
            <ion-chip outline>
              <ion-label>{{ "<count> shipping methods" }}</ion-label>
            </ion-chip>
          </div>
        </div>

        <div class="ion-text-center ion-margin">
          <ion-button fill="outline" @click="createStore()">
            <ion-icon slot="start" :icon="addOutline"/>
            {{ translate("Create new product store") }}
          </ion-button>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { addOutline, openOutline, storefrontOutline } from "ionicons/icons";
import { translate } from "@/i18n";
import { useRouter } from "vue-router";

const router = useRouter();

function createStore() {
  router.push("/create-product-store")
}
</script>

<style scoped>
.list-item {
  --columns-desktop: 4;
  border-bottom: var(--border-medium);
}

.list-item > ion-item {
  width: 100%
}

main {
  margin: var(--spacer-lg);
}
</style>